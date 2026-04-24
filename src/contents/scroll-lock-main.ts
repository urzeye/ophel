/**
 * 滚动锁定 - 主世界脚本
 *
 * 这个脚本运行在主世界（Main World），可以直接劫持页面的 API
 * 通过 Plasmo 的 world: "MAIN" 配置绕过 CSP 限制
 */

import type { PlasmoCSConfig } from "plasmo"

// 配置为主世界运行
export const config: PlasmoCSConfig = {
  matches: [
    "https://gemini.google.com/*",
    "https://business.gemini.google/*",
    "https://aistudio.google.com/*",
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://grok.com/*",
    "https://claude.ai/*",
    "https://www.doubao.com/*",
    "https://ima.qq.com/*",
    "https://chat.deepseek.com/*",
    "https://www.kimi.com/*",
    "https://chatglm.cn/*",
    "https://chat.qwen.ai/*",
    "https://yuanbao.tencent.com/*",
    "https://chat.z.ai/*",
  ],
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

  // 精确位置锁：通过 DOM 属性实现同步跨世界通信（postMessage 是异步的，存在竞态）
  // Content Script 设置 document.documentElement.dataset.ophelPositionLock = "scrollTop值"
  // 主世界每次 API 拦截时同步读取该属性，立即生效，无需等待消息传递
  function getPositionLockTarget(): number | null {
    const attr = document.documentElement.dataset.ophelPositionLock
    if (attr !== undefined) {
      const val = Number(attr)
      if (!isNaN(val)) return val
    }
    return null
  }

  // 记录位置锁拦截时间戳，供 Position Keeper 自适应判断何时释放
  function recordPositionLockBlock() {
    document.documentElement.dataset.ophelPositionLockLastBlock = String(Date.now())
  }

  // 1. 劫持 Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = function (options?: boolean | ScrollIntoViewOptions) {
    // 精确位置锁激活时，仅允许带 __bypassLock 的调用（或处于水平容器内的元素）
    const shouldBypass = options && typeof options === "object" && (options as any).__bypassLock
    const posLock = getPositionLockTarget()
    if (posLock !== null) {
      if (shouldBypass) {
        return originalApis.scrollIntoView.call(this, options as any)
      }
      // 水平容器内的元素不影响主页垂直滤动，逆辑放行
      let el: Element | null = this.parentElement
      while (el) {
        if (el.scrollWidth > el.clientWidth && el.scrollHeight <= el.clientHeight + 10) {
          return originalApis.scrollIntoView.call(this, options as any)
        }
        el = el.parentElement
      }
      recordPositionLockBlock()
      return
    }

    // 快速路径：锁未激活则直接调用原始 API
    if (!(window as any).__ophelScrollLockEnabled) {
      return originalApis.scrollIntoView.call(this, options as any)
    }

    // scrollLock 已启用：水平容器内的元素直接放行
    let el: Element | null = this.parentElement
    while (el) {
      if (el.scrollWidth > el.clientWidth && el.scrollHeight <= el.clientHeight + 10) {
        return originalApis.scrollIntoView.call(this, options as any)
      }
      el = el.parentElement
    }

    if (!shouldBypass) {
      return
    }

    return originalApis.scrollIntoView.call(this, options as any)
  }

  // 2. 劫持 window.scrollTo
  ;(window as any).scrollTo = function (x?: ScrollToOptions | number, y?: number) {
    if (getPositionLockTarget() !== null) {
      recordPositionLockBlock()
      return
    }
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
        // 水平滚动容器（如图片轮播）：直接放行，不干扰水平滚动组件
        if (this.scrollWidth > this.clientWidth && this.scrollHeight <= this.clientHeight + 10) {
          if (descriptor.set) descriptor.set.call(this, value)
          return
        }
        // 精确位置锁：强制回到目标位置
        const lockTarget = getPositionLockTarget()
        if (lockTarget !== null) {
          if (Math.abs(value - lockTarget) > 10) {
            // 记录拦截时间戳，供 Position Keeper 自适应判断何时释放
            recordPositionLockBlock()
            if (descriptor.set) descriptor.set.call(this, lockTarget)
            return
          }
          if (descriptor.set) descriptor.set.call(this, value)
          return
        }
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
    // 如果是纯水平滚动（仅设置 left，无 top），直接放行
    if (typeof optionsOrX === "object" && optionsOrX !== null) {
      if (optionsOrX.left !== undefined && optionsOrX.top === undefined) {
        return originalElementScrollTo.apply(this, arguments as any)
      }
    }
    // 水平滚动容器直接放行
    if (this.scrollWidth > this.clientWidth && this.scrollHeight <= this.clientHeight + 10) {
      return originalElementScrollTo.apply(this, arguments as any)
    }
    // 如果劫持未启用，直接调用原始 API
    if (getPositionLockTarget() !== null) {
      recordPositionLockBlock()
      return
    }
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
    // 如果是纯水平滚动（仅设置 left，无 top），直接放行
    if (typeof optionsOrX === "object" && optionsOrX !== null) {
      if (optionsOrX.left !== undefined && optionsOrX.top === undefined) {
        return originalElementScroll.apply(this, arguments as any)
      }
    }
    // 水平滚动容器直接放行
    if (this.scrollWidth > this.clientWidth && this.scrollHeight <= this.clientHeight + 10) {
      return originalElementScroll.apply(this, arguments as any)
    }
    // 如果劫持未启用，直接调用原始 API
    if (getPositionLockTarget() !== null) {
      recordPositionLockBlock()
      return
    }
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
    // 如果是纯水平滚动（仅设置 left，无 top），直接放行
    if (typeof optionsOrX === "object" && optionsOrX !== null) {
      if (optionsOrX.left !== undefined && optionsOrX.top === undefined) {
        return originalElementScrollBy.apply(this, arguments as any)
      }
    }
    // 水平滚动容器直接放行
    if (this.scrollWidth > this.clientWidth && this.scrollHeight <= this.clientHeight + 10) {
      return originalElementScrollBy.apply(this, arguments as any)
    }
    // 如果劫持未启用，直接调用原始 API
    if (getPositionLockTarget() !== null) {
      recordPositionLockBlock()
      return
    }
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
    if (event.data?.type === "OPHEL_SCROLL_LOCK_TOGGLE") {
      ;(window as any).__ophelScrollLockEnabled = event.data.enabled
    }
  })

  // 7. 劫持 scrollIntoViewIfNeeded（Chrome 专有 API）
  // 仅在精确位置锁期间拦截，不影响常规 Scroll Lock 功能
  if (typeof (Element.prototype as any).scrollIntoViewIfNeeded === "function") {
    const originalScrollIntoViewIfNeeded = (Element.prototype as any).scrollIntoViewIfNeeded
    ;(Element.prototype as any).scrollIntoViewIfNeeded = function (centerIfNeeded?: boolean) {
      if (getPositionLockTarget() !== null) {
        recordPositionLockBlock()
        return
      }
      return originalScrollIntoViewIfNeeded.call(this, centerIfNeeded)
    }
  }
}
