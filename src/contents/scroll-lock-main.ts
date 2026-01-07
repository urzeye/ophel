/**
 * 滚动锁定 - 主世界脚本
 *
 * 这个脚本运行在主世界（Main World），可以直接劫持页面的 API
 * 通过 Plasmo 的 world: "MAIN" 配置绕过 CSP 限制
 */

import type { PlasmoCSConfig } from "plasmo"

// 配置为主世界运行
export const config: PlasmoCSConfig = {
  matches: ["https://gemini.google.com/*", "https://business.gemini.google/*"],
  world: "MAIN",
  run_at: "document_start", // 尽早运行以劫持 API
}

// 防止重复初始化
if (!(window as any).__ophelScrollLockInitialized) {
  ;(window as any).__ophelScrollLockInitialized = true

  // 保存原始 API
  const originalApis = {
    scrollIntoView: Element.prototype.scrollIntoView,
    scrollTo: window.scrollTo.bind(window),
    scrollTopDescriptor:
      Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop") ||
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTop"),
  }

  // 保存原始 API 供恢复使用
  ;(window as any).__ophelOriginalApis = originalApis

  // 默认禁用，等待 Content Script 通过消息启用
  ;(window as any).__ophelScrollLockEnabled = false

  // 1. 劫持 Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = function (options?: boolean | ScrollIntoViewOptions) {
    // 检查是否包含绕过锁定的标志
    const shouldBypass = options && typeof options === "object" && (options as any).__bypassLock

    // 如果劫持未启用，直接调用原始 API
    if (!(window as any).__ophelScrollLockEnabled) {
      return originalApis.scrollIntoView.call(this, options as any)
    }

    if (!shouldBypass) {
      return
    }

    return originalApis.scrollIntoView.call(this, options as any)
  }

  // 2. 劫持 window.scrollTo
  ;(window as any).scrollTo = function (x?: ScrollToOptions | number, y?: number) {
    // 如果劫持未启用，直接调用原始 API
    if (!(window as any).__ophelScrollLockEnabled) {
      return originalApis.scrollTo.apply(window, arguments as any)
    }

    // 解析目标 Y 位置
    let targetY: number | undefined
    if (typeof x === "object" && x !== null) {
      targetY = x.top
    } else {
      targetY = y
    }

    // 只有当向下大幅滚动时才拦截（防止系统自动拉到底）
    if (typeof targetY === "number" && targetY > window.scrollY + 50) {
      return
    }

    return originalApis.scrollTo.apply(window, arguments as any)
  }

  // 3. 劫持 scrollTop setter
  if (originalApis.scrollTopDescriptor) {
    const descriptor = originalApis.scrollTopDescriptor
    Object.defineProperty(Element.prototype, "scrollTop", {
      get: function () {
        return descriptor.get ? descriptor.get.call(this) : 0
      },
      set: function (value: number) {
        // 如果劫持未启用，直接设置
        if (!(window as any).__ophelScrollLockEnabled) {
          if (descriptor.set) {
            descriptor.set.call(this, value)
          }
          return
        }

        const currentScrollTop = descriptor.get ? descriptor.get.call(this) : 0

        // 如果启用且是向下滚动超过 50px，阻止
        if (value > currentScrollTop + 50) {
          return
        }

        if (descriptor.set) {
          descriptor.set.call(this, value)
        }
      },
      configurable: true,
    })
  }

  // 4. 劫持 Element.prototype.scrollTo（元素级滚动方法）
  const originalElementScrollTo = Element.prototype.scrollTo
  Element.prototype.scrollTo = function (
    this: Element,
    optionsOrX?: ScrollToOptions | number,
    y?: number,
  ) {
    // 如果劫持未启用，直接调用原始 API
    if (!(window as any).__ophelScrollLockEnabled) {
      return originalElementScrollTo.apply(this, arguments as any)
    }

    // 解析目标 Y 位置
    let targetY: number | undefined
    if (typeof optionsOrX === "object" && optionsOrX !== null) {
      targetY = optionsOrX.top
    } else if (typeof y === "number") {
      targetY = y
    }

    // 获取当前滚动位置
    const currentScrollTop = this.scrollTop || 0

    // 只有当向下大幅滚动时才拦截
    if (typeof targetY === "number" && targetY > currentScrollTop + 50) {
      return
    }

    return originalElementScrollTo.apply(this, arguments as any)
  }

  // 5. 劫持 Element.prototype.scroll（scrollTo 的别名）
  const originalElementScroll = Element.prototype.scroll
  Element.prototype.scroll = function (
    this: Element,
    optionsOrX?: ScrollToOptions | number,
    y?: number,
  ) {
    // 如果劫持未启用，直接调用原始 API
    if (!(window as any).__ophelScrollLockEnabled) {
      return originalElementScroll.apply(this, arguments as any)
    }

    // 解析目标 Y 位置
    let targetY: number | undefined
    if (typeof optionsOrX === "object" && optionsOrX !== null) {
      targetY = optionsOrX.top
    } else if (typeof y === "number") {
      targetY = y
    }

    // 获取当前滚动位置
    const currentScrollTop = this.scrollTop || 0

    // 只有当向下大幅滚动时才拦截
    if (typeof targetY === "number" && targetY > currentScrollTop + 50) {
      return
    }

    return originalElementScroll.apply(this, arguments as any)
  }

  // 6. 劫持 Element.prototype.scrollBy（相对滚动方法）
  const originalElementScrollBy = Element.prototype.scrollBy
  Element.prototype.scrollBy = function (
    this: Element,
    optionsOrX?: ScrollToOptions | number,
    y?: number,
  ) {
    // 如果劫持未启用，直接调用原始 API
    if (!(window as any).__ophelScrollLockEnabled) {
      return originalElementScrollBy.apply(this, arguments as any)
    }

    // 解析 Y 偏移量
    let deltaY: number | undefined
    if (typeof optionsOrX === "object" && optionsOrX !== null) {
      deltaY = optionsOrX.top
    } else if (typeof y === "number") {
      deltaY = y
    }

    // 只有当向下大幅滚动时才拦截（scrollBy 是相对偏移）
    if (typeof deltaY === "number" && deltaY > 50) {
      return
    }

    return originalElementScrollBy.apply(this, arguments as any)
  }

  // 监听来自 Content Script 的消息（启用/禁用劫持）
  window.addEventListener("message", (event) => {
    if (event.source !== window) return
    if (event.data?.type === "CHAT_HELPER_SCROLL_LOCK_TOGGLE") {
      ;(window as any).__ophelScrollLockEnabled = event.data.enabled
    }
  })
}
