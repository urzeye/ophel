import { initGeminiMyStuffBridge } from "~core/gemini-mystuff-bridge"
import type { NetworkMonitorRequestBodyRule } from "~adapters/base"
import {
  EVENT_MONITOR_CAPTURE_REGISTER,
  EVENT_MONITOR_CAPTURE_UNREGISTER,
  EVENT_MONITOR_COMPLETE,
  EVENT_MONITOR_INIT,
  EVENT_MONITOR_READY,
  EVENT_MONITOR_RESPONSE,
  EVENT_MONITOR_START,
  type MonitorCaptureUnregisterPayload,
  type MonitorConfigPayload,
  type MonitorEventPayload,
  type MonitorResponseCaptureRule,
  type MonitorResponsePayload,
} from "~utils/messaging"

// 油猴脚本环境需要使用 unsafeWindow 才能访问页面的原生 fetch/XMLHttpRequest
declare const unsafeWindow: Window | undefined

const LOG_PREFIX = "[NetworkMonitor]"
const DEFAULT_SILENCE_THRESHOLD_MS = 3000
// 转发经 postMessage 结构化克隆，超大响应跳过并告警
const MAX_CAPTURED_BODY_LENGTH = 4 * 1024 * 1024

/**
 * 获取页面 window 对象
 * - 油猴脚本环境：使用 unsafeWindow 访问页面上下文
 * - 扩展环境 (MAIN world)：直接使用 window
 */
function getPageWindow(): typeof globalThis {
  // 检测是否在油猴脚本环境中（有 unsafeWindow 且与 window 不同）
  if (typeof unsafeWindow !== "undefined" && unsafeWindow !== window) {
    return unsafeWindow as unknown as typeof globalThis
  }
  return window
}

interface NetworkMonitorCallbacks {
  onStart: (ctx: MonitorEventPayload) => void
  onComplete: (ctx: MonitorEventPayload) => void
  onResponse: (payload: MonitorResponsePayload) => void
}

interface ResponseCaptureRule {
  id: string
  method: string
  pathPattern: RegExp
}

interface ResponseCaptureMatch {
  rule: ResponseCaptureRule
  /** 请求的绝对 URL（含 query） */
  url: string
}

interface MonitoredXhr extends XMLHttpRequest {
  _networkMonitorUrl?: string
  _networkMonitorMethod?: string
}

/**
 * 页面网络监控（main world 单例），统一持有 fetch / XHR hook，服务两类互不影响的消费方：
 * - 生成检测：EVENT_MONITOR_INIT 配置目标 URL，命中请求全部结束并静默一段时间后判定生成完成；
 * - 响应转发：EVENT_MONITOR_CAPTURE_REGISTER 注册规则，把命中请求的 2xx 响应体转发回 isolated world。
 * hook 在首个消费方出现时安装、之后不再卸载：重新 INIT 只替换生成检测配置，已注册的转发规则不受影响；
 * 若另起一套 hook，卸载时写回的「原始 fetch」会冲掉后装的那套。
 */
class NetworkMonitor {
  // 生成检测配置；未收到 EVENT_MONITOR_INIT 前不追踪任何请求
  private generationConfigured = false
  private urlPatterns: string[] = []
  private urlPathEndsWith: string[] = []
  private silenceThreshold = DEFAULT_SILENCE_THRESHOLD_MS
  private requestBodyRules: NetworkMonitorRequestBodyRule[] = []
  private readonly captureRules = new Map<string, ResponseCaptureRule>()
  private readonly callbacks: NetworkMonitorCallbacks

  private _activeCount = 0
  private _silenceTimer: ReturnType<typeof setTimeout> | null = null
  private _isHooked = false
  private _originalFetch: any = null
  private _originalXhrOpen: any = null
  private _originalXhrSend: any = null
  private _lastUrl = ""
  private _hasTriggeredStart = false

  constructor(callbacks: NetworkMonitorCallbacks) {
    this.callbacks = callbacks
  }

  /** 替换生成检测配置，并像重建实例一样清空进行中的计数 */
  configureGeneration(config: Partial<MonitorConfigPayload> | undefined) {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer)
      this._silenceTimer = null
    }
    this._activeCount = 0
    this._hasTriggeredStart = false

    this.urlPatterns = config?.urlPatterns || []
    this.urlPathEndsWith = config?.urlPathEndsWith || []
    this.silenceThreshold = config?.silenceThreshold || DEFAULT_SILENCE_THRESHOLD_MS
    this.requestBodyRules = config?.requestBodyRules || []
    this.generationConfigured = true
    this._ensureHooked()
  }

  /** 注册（或按 id 覆盖）响应转发规则 */
  registerCapture(payload: unknown) {
    const rule = this._compileCaptureRule(payload)
    if (!rule) return

    this.captureRules.set(rule.id, rule)
    this._ensureHooked()
  }

  unregisterCapture(payload: unknown) {
    const id = (payload as Partial<MonitorCaptureUnregisterPayload> | undefined)?.id
    if (typeof id === "string") {
      this.captureRules.delete(id)
    }
  }

  private _ensureHooked() {
    if (this._isHooked) return
    this._isHooked = true

    const pageWindow = getPageWindow()
    this._originalFetch = pageWindow.fetch
    pageWindow.fetch = this._hookedFetch.bind(this) as typeof fetch

    this._hookXHR()
  }

  private _compileCaptureRule(payload: unknown): ResponseCaptureRule | null {
    const { id, method, pathPattern } = (payload || {}) as Partial<MonitorResponseCaptureRule>
    if (
      typeof id !== "string" ||
      !id ||
      typeof method !== "string" ||
      !method ||
      typeof pathPattern !== "string" ||
      !pathPattern
    ) {
      console.warn(`${LOG_PREFIX} ignored invalid capture rule`, payload)
      return null
    }

    try {
      return { id, method: method.toUpperCase(), pathPattern: new RegExp(pathPattern) }
    } catch (error) {
      console.warn(`${LOG_PREFIX} ignored capture rule with invalid pathPattern`, {
        id,
        pathPattern,
        error,
      })
      return null
    }
  }

  private _isGenerationTarget(url: string | null): boolean {
    if (!this.generationConfigured || !url) return false

    const matchesPattern =
      this.urlPatterns.length === 0 || this.urlPatterns.some((pattern) => url.includes(pattern))

    if (!matchesPattern) return false

    if (this.urlPathEndsWith.length === 0) return true

    try {
      const pathname = new URL(url, window.location.origin).pathname
      return this.urlPathEndsWith.some((suffix) => pathname.endsWith(suffix))
    } catch {
      return this.urlPathEndsWith.some((suffix) => url.endsWith(suffix))
    }
  }

  /** 只转发与页面同源、method 与 pathname 都命中的请求 */
  private _matchCapture(method: string, url: string): ResponseCaptureMatch | null {
    if (this.captureRules.size === 0 || !url) return null

    let target: URL
    try {
      target = new URL(url, window.location.href)
    } catch {
      return null
    }
    if (target.origin !== window.location.origin) return null

    const normalizedMethod = method.toUpperCase()
    for (const rule of this.captureRules.values()) {
      if (rule.method === normalizedMethod && rule.pathPattern.test(target.pathname)) {
        return { rule, url: target.href }
      }
    }
    return null
  }

  private _emitCapturedResponse(match: ResponseCaptureMatch, status: number, body: string) {
    if (body.length > MAX_CAPTURED_BODY_LENGTH) {
      console.warn(`${LOG_PREFIX} skipped oversized captured response`, {
        captureId: match.rule.id,
        length: body.length,
      })
      return
    }

    this.callbacks.onResponse({
      captureId: match.rule.id,
      url: match.url,
      status,
      body,
      timestamp: Date.now(),
    })
  }

  /** 读克隆体转发，不消费页面拿到的原始响应；转发失败不能影响页面请求 */
  private _captureFetchResponse(match: ResponseCaptureMatch, response: Response) {
    if (!response.ok) return

    let clone: Response
    try {
      clone = response.clone()
    } catch (error) {
      console.warn(`${LOG_PREFIX} failed to clone captured response`, {
        captureId: match.rule.id,
        error,
      })
      return
    }

    clone.text().then(
      (body) => this._emitCapturedResponse(match, response.status, body),
      (error) =>
        console.warn(`${LOG_PREFIX} failed to read captured response`, {
          captureId: match.rule.id,
          error,
        }),
    )
  }

  private _captureXhrResponse(match: ResponseCaptureMatch, xhr: XMLHttpRequest) {
    if (xhr.status < 200 || xhr.status >= 300) return

    let body: string
    if (xhr.responseType === "" || xhr.responseType === "text") {
      body = xhr.responseText
    } else if (xhr.responseType === "json") {
      body = JSON.stringify(xhr.response)
    } else {
      console.warn(`${LOG_PREFIX} skipped captured response with unsupported responseType`, {
        captureId: match.rule.id,
        responseType: xhr.responseType,
      })
      return
    }

    this._emitCapturedResponse(match, xhr.status, body)
  }

  private _tryTriggerComplete() {
    if (this._activeCount > 0) return

    this._hasTriggeredStart = false
    try {
      this.callbacks.onComplete({
        activeCount: this._activeCount,
        lastUrl: this._lastUrl,
        timestamp: Date.now(),
      })
    } catch (e) {
      console.error(e)
    }
  }

  private async _hookedFetch(...args: any[]) {
    // 获取正确的页面上下文（油猴脚本环境使用 unsafeWindow）
    const pageWindow = getPageWindow()
    const url = this._extractFetchUrl(args)
    const isTarget = this._isGenerationTarget(url)
    const capture =
      this.captureRules.size > 0 ? this._matchCapture(this._extractFetchMethod(args), url) : null

    if (!isTarget) {
      if (!capture) {
        return this._originalFetch.call(pageWindow, ...args)
      }

      const response = await this._originalFetch.call(pageWindow, ...args)
      this._captureFetchResponse(capture, response)
      return response
    }

    this._activeCount++
    this._lastUrl = url

    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer)
      this._silenceTimer = null
    }

    if (!this._hasTriggeredStart) {
      this._hasTriggeredStart = true
      try {
        const requestMetadata = await this._extractFetchRequestMetadata(args)
        this.callbacks.onStart({ url, timestamp: Date.now(), type: "fetch", ...requestMetadata })
      } catch {}
    }

    try {
      const response = await this._originalFetch.call(pageWindow, ...args)
      if (capture) {
        this._captureFetchResponse(capture, response)
      }
      const clone = response.clone()
      this._readStream(clone).catch(() => {})
      return response
    } catch (error) {
      this._decrementAndSchedule()
      throw error
    }
  }

  private async _readStream(response: Response) {
    try {
      if (!response.body) return
      const reader = response.body.getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }
    } catch {
    } finally {
      this._decrementAndSchedule()
    }
  }

  private _decrementAndSchedule() {
    this._activeCount = Math.max(0, this._activeCount - 1)
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer)
    }
    this._silenceTimer = setTimeout(() => this._tryTriggerComplete(), this.silenceThreshold)
  }

  private _hookXHR() {
    const self = this
    const pageWindow = getPageWindow()
    const PageXHR = pageWindow.XMLHttpRequest

    this._originalXhrOpen = PageXHR.prototype.open
    this._originalXhrSend = PageXHR.prototype.send

    PageXHR.prototype.open = function (
      this: MonitoredXhr,
      method: string,
      url: string | URL,
      ...rest: any[]
    ) {
      this._networkMonitorMethod = typeof method === "string" ? method : ""
      this._networkMonitorUrl = url ? url.toString() : ""
      return self._originalXhrOpen.call(this, method, url, ...rest)
    }

    PageXHR.prototype.send = function (this: MonitoredXhr, body: any) {
      const url = this._networkMonitorUrl || ""
      const capture =
        self.captureRules.size > 0
          ? self._matchCapture(this._networkMonitorMethod || "GET", url)
          : null

      if (capture) {
        // loadend 每次 send 恰好触发一次（含失败/中止），复用同一 XHR 对象时不会串到下一次请求
        this.addEventListener("loadend", () => self._captureXhrResponse(capture, this), {
          once: true,
        })
      }

      if (!self._isGenerationTarget(url)) {
        return self._originalXhrSend.call(this, body)
      }

      self._activeCount++
      self._lastUrl = url

      if (self._silenceTimer) {
        clearTimeout(self._silenceTimer)
        self._silenceTimer = null
      }

      if (!self._hasTriggeredStart) {
        self._hasTriggeredStart = true
        try {
          const requestMetadata = self._extractRequestMetadata(body)
          self.callbacks.onStart({ url, timestamp: Date.now(), type: "xhr", ...requestMetadata })
        } catch {}
      }

      const onComplete = () => {
        self._decrementAndSchedule()
      }

      this.addEventListener("load", onComplete)
      this.addEventListener("error", onComplete)
      this.addEventListener("abort", onComplete)
      this.addEventListener("timeout", onComplete)

      return self._originalXhrSend.call(this, body)
    }
  }

  private _extractFetchUrl(args: any[]): string {
    const input = args[0]
    if (!input) return ""

    if (typeof input === "string") {
      return input
    }

    if (input instanceof URL) {
      return input.toString()
    }

    if (typeof input === "object" && typeof input.url === "string") {
      return input.url
    }

    return typeof input.toString === "function" ? input.toString() : ""
  }

  /** init.method 优先于 Request.method，与 fetch 自身的取值规则一致 */
  private _extractFetchMethod(args: any[]): string {
    const initMethod = args[1]?.method
    if (typeof initMethod === "string" && initMethod) return initMethod

    const input = args[0]
    if (input && typeof input === "object" && typeof input.method === "string") {
      return input.method
    }

    return "GET"
  }

  private async _extractFetchRequestMetadata(args: any[]): Promise<Partial<MonitorEventPayload>> {
    if (this.requestBodyRules.length === 0) {
      return {}
    }

    const initBodyText = await this._bodyToText(args[1]?.body)
    if (initBodyText !== null) {
      return this._extractRequestMetadata(initBodyText)
    }

    const input = args[0]
    if (
      input &&
      typeof input === "object" &&
      typeof input.clone === "function" &&
      typeof input.text === "function"
    ) {
      try {
        const clone = input.clone()
        if (clone && typeof clone.text === "function") {
          const bodyText = await clone.text()
          return this._extractRequestMetadata(bodyText)
        }
      } catch {}
    }

    return {}
  }

  private async _bodyToText(body: unknown): Promise<string | null> {
    if (typeof body === "string") {
      return body
    }

    if (!body || typeof body !== "object") {
      return null
    }

    const tag = Object.prototype.toString.call(body)
    if (tag === "[object URLSearchParams]") {
      return typeof (body as URLSearchParams).toString === "function" ? body.toString() : null
    }

    if (tag === "[object Blob]" && typeof (body as Blob).text === "function") {
      try {
        return await (body as Blob).text()
      } catch {
        return null
      }
    }

    if (ArrayBuffer.isView(body)) {
      try {
        return new TextDecoder().decode(body)
      } catch {
        return null
      }
    }

    if (body instanceof ArrayBuffer) {
      try {
        return new TextDecoder().decode(body)
      } catch {
        return null
      }
    }

    return null
  }

  private _extractRequestMetadata(body: unknown): Partial<MonitorEventPayload> {
    if (
      typeof body !== "string" ||
      body.trim().length === 0 ||
      this.requestBodyRules.length === 0
    ) {
      return {}
    }

    try {
      const parsed = JSON.parse(body) as Record<string, unknown>
      const metadata: Record<string, string | number | boolean | null> = {}

      for (const rule of this.requestBodyRules) {
        if (rule.type === "json-field-exists" && parsed[rule.field] !== undefined) {
          Object.assign(metadata, rule.metadata)
        }
      }

      return {
        ...metadata,
      }
    } catch {
      return {}
    }
  }
}

let isInitialized = false

/**
 * 初始化 NetworkMonitor 消息监听器
 * 需要显式调用此函数以避免被 tree-shaking 移除
 */
export function initNetworkMonitor(): void {
  if (isInitialized) {
    return
  }
  isInitialized = true

  initGeminiMyStuffBridge()

  const monitor = new NetworkMonitor({
    onStart: (info) => window.postMessage({ type: EVENT_MONITOR_START, payload: info }, "*"),
    onComplete: (info) => window.postMessage({ type: EVENT_MONITOR_COMPLETE, payload: info }, "*"),
    onResponse: (payload) => window.postMessage({ type: EVENT_MONITOR_RESPONSE, payload }, "*"),
  })

  window.addEventListener("message", (event) => {
    // 油猴沙箱中 event.source 可能是代理对象而非 window 本身，只按消息类型分发
    const { type, payload } = event.data || {}

    if (type === EVENT_MONITOR_INIT) {
      monitor.configureGeneration(payload)
    } else if (type === EVENT_MONITOR_CAPTURE_REGISTER) {
      monitor.registerCapture(payload)
    } else if (type === EVENT_MONITOR_CAPTURE_UNREGISTER) {
      monitor.unregisterCapture(payload)
    }
  })

  // 监听在此之前不存在，早于此刻发出的转发注册已丢失：通知 isolated world 重发
  window.postMessage({ type: EVENT_MONITOR_READY }, "*")
}
