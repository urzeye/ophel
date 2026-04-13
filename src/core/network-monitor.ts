import { initGeminiMyStuffBridge } from "~core/gemini-mystuff-bridge"
import type { NetworkMonitorRequestBodyRule } from "~adapters/base"
import {
  EVENT_MONITOR_COMPLETE,
  EVENT_MONITOR_INIT,
  EVENT_MONITOR_START,
  type MonitorEventPayload,
} from "~utils/messaging"

// 油猴脚本环境需要使用 unsafeWindow 才能访问页面的原生 fetch/XMLHttpRequest
declare const unsafeWindow: Window | undefined

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

interface NetworkMonitorOptions {
  urlPatterns?: string[]
  urlPathEndsWith?: string[]
  silenceThreshold?: number
  requestBodyRules?: NetworkMonitorRequestBodyRule[]
  onComplete?: (ctx: any) => void
  onStart?: (ctx: any) => void
  domValidation?: (ctx: any) => boolean
}

class NetworkMonitor {
  private urlPatterns: string[]
  private urlPathEndsWith: string[]
  private silenceThreshold: number
  private requestBodyRules: NetworkMonitorRequestBodyRule[]
  private onComplete: (ctx: any) => void
  private onStart: ((ctx: any) => void) | null
  private domValidation: ((ctx: any) => boolean) | null

  private _activeCount = 0
  private _silenceTimer: any = null
  private _isMonitoring = false
  private _originalFetch: any = null
  private _originalXhrOpen: any = null
  private _originalXhrSend: any = null
  private _lastUrl = ""
  private _hasTriggeredStart = false
  private _boundHookedFetch: any

  constructor(options: NetworkMonitorOptions = {}) {
    this.urlPatterns = options.urlPatterns || []
    this.urlPathEndsWith = options.urlPathEndsWith || []
    this.silenceThreshold = options.silenceThreshold || 3000
    this.requestBodyRules = options.requestBodyRules || []
    this.onComplete = options.onComplete || (() => {})
    this.onStart = options.onStart || null
    this.domValidation = options.domValidation || null
    this._boundHookedFetch = this._hookedFetch.bind(this)
  }

  start() {
    if (this._isMonitoring) return

    const pageWindow = getPageWindow()
    this._originalFetch = pageWindow.fetch
    pageWindow.fetch = this._boundHookedFetch as typeof fetch

    this._hookXHR()
    this._isMonitoring = true
  }

  stop() {
    if (!this._isMonitoring) return

    const pageWindow = getPageWindow()
    if (this._originalFetch) {
      pageWindow.fetch = this._originalFetch
      this._originalFetch = null
    }

    this._unhookXHR()

    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer)
      this._silenceTimer = null
    }

    this._isMonitoring = false
    this._activeCount = 0
    this._hasTriggeredStart = false
  }

  private _isTargetUrl(url: string | null): boolean {
    if (!url) return false

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

  private _tryTriggerComplete() {
    if (this._activeCount > 0) return

    const ctx = {
      activeCount: this._activeCount,
      lastUrl: this._lastUrl,
      timestamp: Date.now(),
    }

    if (this.domValidation) {
      try {
        if (!this.domValidation(ctx)) {
          this._silenceTimer = setTimeout(() => this._tryTriggerComplete(), 1000)
          return
        }
      } catch (e) {
        console.error(e)
      }
    }

    this._hasTriggeredStart = false
    try {
      this.onComplete(ctx)
    } catch (e) {
      console.error(e)
    }
  }

  private async _hookedFetch(...args: any[]) {
    // 获取正确的页面上下文（油猴脚本环境使用 unsafeWindow）
    const pageWindow = getPageWindow()
    const url = this._extractFetchUrl(args)
    const isTarget = this._isTargetUrl(url)

    if (!isTarget) {
      return this._originalFetch.call(pageWindow, ...args)
    }

    this._activeCount++
    this._lastUrl = url

    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer)
      this._silenceTimer = null
    }

    if (!this._hasTriggeredStart && this.onStart) {
      this._hasTriggeredStart = true
      try {
        const requestMetadata = await this._extractFetchRequestMetadata(args)
        this.onStart({ url, timestamp: Date.now(), type: "fetch", ...requestMetadata })
      } catch {}
    }

    try {
      const response = await this._originalFetch.call(pageWindow, ...args)
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

    // @ts-ignore
    PageXHR.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
      // @ts-ignore
      this._networkMonitorUrl = url ? url.toString() : ""
      // @ts-ignore
      return self._originalXhrOpen.call(this, method, url, ...rest)
    }

    PageXHR.prototype.send = function (body: any) {
      // @ts-ignore
      const url = this._networkMonitorUrl || ""

      if (!self._isTargetUrl(url)) {
        return self._originalXhrSend.call(this, body)
      }

      self._activeCount++
      self._lastUrl = url

      if (self._silenceTimer) {
        clearTimeout(self._silenceTimer)
        self._silenceTimer = null
      }

      if (!self._hasTriggeredStart && self.onStart) {
        self._hasTriggeredStart = true
        try {
          const requestMetadata = self._extractRequestMetadata(body)
          self.onStart({ url, timestamp: Date.now(), type: "xhr", ...requestMetadata })
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

  private _unhookXHR() {
    const pageWindow = getPageWindow()
    const PageXHR = pageWindow.XMLHttpRequest

    if (this._originalXhrOpen) {
      PageXHR.prototype.open = this._originalXhrOpen
      this._originalXhrOpen = null
    }
    if (this._originalXhrSend) {
      PageXHR.prototype.send = this._originalXhrSend
      this._originalXhrSend = null
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

let monitor: NetworkMonitor | null = null
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

  window.addEventListener("message", (event) => {
    const { type, payload } = event.data || {}

    // 在油猴脚本中，event.source 可能与 window 或 unsafeWindow 不完全相等
    // 或者由于沙箱机制，window.postMessage 发送的消息 source 可能是 proxy
    // 主要依赖消息类型进行验证
    if (event.source !== window) {
      // 放宽检查：如果是我们关心的消息类型，则允许通过
      if (
        type !== EVENT_MONITOR_INIT &&
        type !== EVENT_MONITOR_COMPLETE &&
        type !== EVENT_MONITOR_START
      ) {
        return
      }
    }

    if (type === EVENT_MONITOR_INIT) {
      if (monitor) monitor.stop()
      monitor = new NetworkMonitor({
        urlPatterns: payload?.urlPatterns,
        urlPathEndsWith: payload?.urlPathEndsWith,
        silenceThreshold: payload?.silenceThreshold,
        requestBodyRules: payload?.requestBodyRules,
        onStart: (info) => window.postMessage({ type: EVENT_MONITOR_START, payload: info }, "*"),
        onComplete: (info) =>
          window.postMessage({ type: EVENT_MONITOR_COMPLETE, payload: info }, "*"),
      })
      monitor.start()
    }
  })
}
