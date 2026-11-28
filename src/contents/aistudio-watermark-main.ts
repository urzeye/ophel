/**
 * AI Studio 水印拦截 - 主世界脚本
 *
 * 通过 Plasmo `world: "MAIN"` 直接运行在页面主世界，避免从隔离世界插入内联
 * `<script>` 触发站点严格 CSP 拦截报错（与 scroll-lock-main.ts /
 * gemini-watermark-main.ts 同一模式）。
 *
 * 开关来源：
 * - 默认关闭（与 gemini-watermark-main.ts 一致），不使用跨会话 localStorage 缓存，
 *   避免用户在未打开 AI Studio 标签页时于扩展设置页修改开关导致读取过期值；
 * - document_start 阶段读取当前文档瞬态 dataset.ophelAistudioWatermarkBlock，
 *   并在运行期间通过 OPHEL_AISTUDIO_WATERMARK_TOGGLE 消息与隔离世界保持实时同步。
 */

import type { PlasmoCSConfig } from "plasmo"

const OPHEL_AISTUDIO_WATERMARK_TOGGLE = "OPHEL_AISTUDIO_WATERMARK_TOGGLE"

export const config: PlasmoCSConfig = {
  matches: ["https://aistudio.google.com/*"],
  world: "MAIN",
  run_at: "document_start",
}

interface MonitoredWatermarkXhr extends XMLHttpRequest {
  __ophelWatermarkBlocked?: boolean
}

if (!window.__ophelAistudioWatermarkMainInitialized) {
  window.__ophelAistudioWatermarkMainInitialized = true

  const pattern = /watermark_v4\.png/i
  const styleUrlPattern = /url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)/gi

  const readInitialEnabled = (): boolean =>
    document.documentElement?.dataset?.ophelAistudioWatermarkBlock === "1"

  let watermarkBlockEnabled = readInitialEnabled()

  const isEnabled = (): boolean => {
    const attr = document.documentElement?.dataset?.ophelAistudioWatermarkBlock
    if (attr === "1") return true
    if (attr === "0") return false
    return watermarkBlockEnabled
  }

  const shouldBlock = (candidate: unknown): boolean => {
    if (!isEnabled() || !candidate) return false
    return pattern.test(String(candidate))
  }

  // 1. fetch()
  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch.bind(window)
    window.fetch = function (...args: Parameters<typeof fetch>) {
      if (!isEnabled()) {
        return originalFetch(...args)
      }
      const input = args[0]
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input instanceof Request
              ? input.url
              : undefined
      if (shouldBlock(url)) {
        console.debug("[Ophel Watermark Blocker] Blocked fetch:", url)
        return Promise.reject(new DOMException("Blocked watermark request", "AbortError"))
      }
      return originalFetch(...args)
    }
  }

  // 2. XMLHttpRequest
  const xhrProto = XMLHttpRequest.prototype
  const originalOpen = xhrProto.open
  const originalSend = xhrProto.send

  xhrProto.open = function (
    this: MonitoredWatermarkXhr,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    this.__ophelWatermarkBlocked = shouldBlock(url)
    if (this.__ophelWatermarkBlocked) {
      console.debug("[Ophel Watermark Blocker] Blocked XHR:", url)
    }
    return (originalOpen as (this: XMLHttpRequest, ...args: unknown[]) => void).call(
      this,
      method,
      url,
      ...rest,
    )
  }

  xhrProto.send = function (
    this: MonitoredWatermarkXhr,
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    if (this.__ophelWatermarkBlocked) {
      this.abort()
      return
    }
    return originalSend.call(this, body)
  }

  // 3. <img src="...">
  const imageProto = HTMLImageElement.prototype
  const srcDescriptor = Object.getOwnPropertyDescriptor(imageProto, "src")
  if (srcDescriptor?.set && srcDescriptor?.get) {
    Object.defineProperty(imageProto, "src", {
      configurable: true,
      enumerable: srcDescriptor.enumerable,
      get() {
        return srcDescriptor.get!.call(this)
      },
      set(value: string) {
        if (shouldBlock(value)) {
          console.debug("[Ophel Watermark Blocker] Blocked <img> src:", value)
          return
        }
        srcDescriptor.set!.call(this, value)
      },
    })
  }

  // 4. Element.prototype.setAttribute
  const originalSetAttribute = Element.prototype.setAttribute
  Element.prototype.setAttribute = function (name: string, value: string) {
    if (!isEnabled()) {
      return Reflect.apply(originalSetAttribute, this, arguments)
    }

    const lower = String(name).toLowerCase()
    if (lower === "src") {
      const strValue = String(value)
      if (shouldBlock(strValue)) {
        console.debug("[Ophel Watermark Blocker] Blocked setAttribute src:", strValue)
        return
      }
    } else if (lower === "style") {
      const strValue = String(value)
      if (shouldBlock(strValue)) {
        console.debug("[Ophel Watermark Blocker] Sanitized inline style:", strValue)
        const sanitized = strValue.replace(styleUrlPattern, (match) =>
          pattern.test(match) ? "none" : match,
        )
        return originalSetAttribute.call(this, name, sanitized)
      }
    }

    return Reflect.apply(originalSetAttribute, this, arguments)
  }

  // 5. CSSStyleDeclaration / CSSStyleProperties background-image
  // 现代 Chromium/Firefox 将 backgroundImage 定义在 CSSStyleProperties.prototype
  // 而非 CSSStyleDeclaration.prototype 上，因此沿实际 style 原型链定位真实宿主原型。
  const findPropertyOwner = (
    startProto: object | null,
    prop: string,
  ): { owner: object; descriptor: PropertyDescriptor } | null => {
    let current: object | null = startProto
    while (current) {
      const descriptor = Object.getOwnPropertyDescriptor(current, prop)
      if (descriptor) return { owner: current, descriptor }
      current = Object.getPrototypeOf(current)
    }
    return null
  }

  const stylePrototype =
    typeof document !== "undefined" && typeof document.createElement === "function"
      ? Object.getPrototypeOf(document.createElement("div").style)
      : CSSStyleDeclaration.prototype

  const setPropertyOwner = findPropertyOwner(stylePrototype, "setProperty")
  if (setPropertyOwner && typeof setPropertyOwner.descriptor.value === "function") {
    const originalSetProperty = setPropertyOwner.descriptor
      .value as CSSStyleDeclaration["setProperty"]
    ;(setPropertyOwner.owner as CSSStyleDeclaration).setProperty = function (
      property: string,
      value: string | null,
      priority?: string,
    ) {
      if (/background-image/i.test(property) && shouldBlock(value)) {
        console.debug("[Ophel Watermark Blocker] Blocked background-image via setProperty:", value)
        return
      }
      return originalSetProperty.call(this, property, value, priority)
    }
  }

  const bgOwner = findPropertyOwner(stylePrototype, "backgroundImage")
  if (bgOwner?.descriptor.set && bgOwner.descriptor.get) {
    const bgDescriptor = bgOwner.descriptor
    Object.defineProperty(bgOwner.owner, "backgroundImage", {
      configurable: true,
      enumerable: bgDescriptor.enumerable,
      get() {
        return bgDescriptor.get!.call(this)
      },
      set(value: string) {
        if (shouldBlock(value)) {
          console.debug("[Ophel Watermark Blocker] Blocked backgroundImage setter:", value)
          return
        }
        bgDescriptor.set!.call(this, value)
      },
    })
  }

  // 监听来自隔离世界的开关更新，并同步 dataset 避免状态源分叉
  window.addEventListener("message", (event) => {
    if (event.source !== window) return
    if (event.data?.type === OPHEL_AISTUDIO_WATERMARK_TOGGLE) {
      watermarkBlockEnabled = Boolean(event.data.enabled)
      if (document.documentElement) {
        document.documentElement.dataset.ophelAistudioWatermarkBlock = watermarkBlockEnabled
          ? "1"
          : "0"
      }
    }
  })
}
