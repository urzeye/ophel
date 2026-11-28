/**
 * AI Studio 水印拦截 - 主世界脚本
 *
 * 通过 Plasmo `world: "MAIN"` 直接运行在页面主世界，避免从隔离世界插入内联
 * `<script>` 触发站点严格 CSP 拦截报错（与 scroll-lock-main.ts /
 * gemini-watermark-main.ts 同一模式）。
 *
 * 开关来源：
 * 1. document_start 阶段先同步读取 localStorage 缓存（由 aistudio-preload.ts 与
 *    modules-init.ts 维护），保证首屏最早的 watermark_v4.png 请求也能被拦截；
 * 2. 运行期间通过 documentElement.dataset.ophelAistudioWatermarkBlock 与
 *    OPHEL_AISTUDIO_WATERMARK_TOGGLE 消息与隔离世界保持实时同步。
 */

import type { PlasmoCSConfig } from "plasmo"

const OPHEL_AISTUDIO_WATERMARK_TOGGLE = "OPHEL_AISTUDIO_WATERMARK_TOGGLE"
const OPHEL_AISTUDIO_WATERMARK_CACHE_KEY = "ophel:aistudio:removeWatermark"

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

  const readInitialEnabled = (): boolean => {
    const attr = document.documentElement?.dataset?.ophelAistudioWatermarkBlock
    if (attr === "1") return true
    if (attr === "0") return false
    try {
      return window.localStorage.getItem(OPHEL_AISTUDIO_WATERMARK_CACHE_KEY) === "1"
    } catch {
      return false
    }
  }

  let watermarkBlockEnabled = readInitialEnabled()

  const isEnabled = (): boolean => {
    const attr = document.documentElement?.dataset?.ophelAistudioWatermarkBlock
    if (attr === "1") return true
    if (attr === "0") return false
    return watermarkBlockEnabled
  }

  const shouldBlock = (candidate: unknown): boolean => {
    if (!isEnabled() || !candidate) return false
    const value = String(candidate)
    if (pattern.test(value)) return true
    try {
      const absolute = new URL(value, location.href).href
      return pattern.test(absolute)
    } catch {
      return false
    }
  }

  // 1. fetch()
  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch.bind(window)
    window.fetch = function (...args: Parameters<typeof fetch>) {
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
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    this.__ophelWatermarkBlocked = shouldBlock(url)
    if (this.__ophelWatermarkBlocked) {
      console.debug("[Ophel Watermark Blocker] Blocked XHR:", url)
    }
    return originalOpen.call(this, method, url, async ?? true, username ?? null, password ?? null)
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
    const lower = String(name).toLowerCase()
    const strValue = String(value)

    if (lower === "src" && shouldBlock(strValue)) {
      console.debug("[Ophel Watermark Blocker] Blocked setAttribute src:", strValue)
      return
    }

    if (lower === "style" && shouldBlock(strValue)) {
      console.debug("[Ophel Watermark Blocker] Sanitized inline style:", strValue)
      const sanitized = strValue.replace(pattern, "none")
      return originalSetAttribute.call(this, name, sanitized)
    }

    return originalSetAttribute.call(this, name, value)
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

  // 监听来自隔离世界的开关更新
  window.addEventListener("message", (event) => {
    if (event.source !== window) return
    if (event.data?.type === OPHEL_AISTUDIO_WATERMARK_TOGGLE) {
      watermarkBlockEnabled = Boolean(event.data.enabled)
    }
  })
}
