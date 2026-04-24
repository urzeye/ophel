/**
 * 油猴脚本版滚动锁定注入
 *
 * 等效于 src/contents/scroll-lock-main.ts 的功能
 * 通过 unsafeWindow 直接劫持页面的滚动 API
 *
 * 在浏览器扩展中，scroll-lock-main.ts 作为独立的 MAIN World content script
 * 在 document_start 时注入，劫持 scrollIntoView、scrollTo 等 API
 *
 * 油猴脚本没有 Plasmo 的 world: "MAIN" 机制，因此通过 unsafeWindow 实现等效功能
 * 注意：油猴脚本 run-at 为 document-idle（较晚），但主要用例（AI 流式输出时的滚动拦截）
 * 发生在页面加载后，因此时机上仍然有效
 */

declare const unsafeWindow: Window & typeof globalThis

/**
 * 获取页面的真实 window 对象
 * 油猴脚本环境使用 unsafeWindow 访问页面主世界
 */
function getPageWindow(): any {
  if (typeof unsafeWindow !== "undefined" && unsafeWindow !== window) {
    return unsafeWindow
  }
  return window
}

/**
 * 注入滚动锁定 API 劫持到页面主世界
 * 逻辑与 src/contents/scroll-lock-main.ts 保持一致
 */
export function injectScrollLock(): void {
  const pageWin = getPageWindow()

  // 防止重复初始化（与扩展版共享同一标志）
  if (pageWin.__ophelScrollLockInitialized) return
  pageWin.__ophelScrollLockInitialized = true

  const PageElement = pageWin.Element
  const PageHTMLElement = pageWin.HTMLElement

  // 保存原始 API
  const originalApis = {
    scrollIntoView: PageElement.prototype.scrollIntoView,
    scrollTo: pageWin.scrollTo.bind(pageWin),
    scrollTopDescriptor:
      Object.getOwnPropertyDescriptor(PageElement.prototype, "scrollTop") ||
      Object.getOwnPropertyDescriptor(PageHTMLElement.prototype, "scrollTop"),
  }

  pageWin.__ophelOriginalApis = originalApis
  pageWin.__ophelScrollLockEnabled = false

  // 精确位置锁：通过 DOM 属性实现同步通信
  // 与扩展版一致，读取 document.documentElement.dataset.ophelPositionLock
  function getPositionLockTarget(): number | null {
    const attr = document.documentElement.dataset.ophelPositionLock
    if (attr !== undefined) {
      const val = Number(attr)
      if (!isNaN(val)) return val
    }
    return null
  }

  function recordPositionLockBlock() {
    document.documentElement.dataset.ophelPositionLockLastBlock = String(Date.now())
  }

  // 1. 劫持 Element.prototype.scrollIntoView
  PageElement.prototype.scrollIntoView = function (options?: boolean | ScrollIntoViewOptions) {
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
    if (!pageWin.__ophelScrollLockEnabled) {
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
  pageWin.scrollTo = function (x?: ScrollToOptions | number, y?: number) {
    if (getPositionLockTarget() !== null) {
      recordPositionLockBlock()
      return
    }
    if (!pageWin.__ophelScrollLockEnabled) {
      return originalApis.scrollTo.apply(pageWin, arguments as any)
    }

    let targetY: number | undefined
    if (typeof x === "object" && x !== null) {
      targetY = x.top
    } else {
      targetY = y
    }

    if (typeof targetY === "number" && targetY > pageWin.scrollY + 50) {
      return
    }

    return originalApis.scrollTo.apply(pageWin, arguments as any)
  }

  // 3. 劫持 scrollTop setter
  if (originalApis.scrollTopDescriptor) {
    const descriptor = originalApis.scrollTopDescriptor
    Object.defineProperty(PageElement.prototype, "scrollTop", {
      get: function () {
        return descriptor.get ? descriptor.get.call(this) : 0
      },
      set: function (value: number) {
        // 水平滚动容器（如图片轮播）：直接放行
        if (this.scrollWidth > this.clientWidth && this.scrollHeight <= this.clientHeight + 10) {
          if (descriptor.set) descriptor.set.call(this, value)
          return
        }
        const lockTarget = getPositionLockTarget()
        if (lockTarget !== null) {
          if (Math.abs(value - lockTarget) > 10) {
            recordPositionLockBlock()
            if (descriptor.set) descriptor.set.call(this, lockTarget)
            return
          }
          if (descriptor.set) descriptor.set.call(this, value)
          return
        }
        if (!pageWin.__ophelScrollLockEnabled) {
          if (descriptor.set) {
            descriptor.set.call(this, value)
          }
          return
        }

        const currentScrollTop = descriptor.get ? descriptor.get.call(this) : 0

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
  const originalElementScrollTo = PageElement.prototype.scrollTo
  PageElement.prototype.scrollTo = function (
    this: Element,
    optionsOrX?: ScrollToOptions | number,
    y?: number,
  ) {
    // 纯水平滚动（仅设置 left，无 top），直接放行
    if (typeof optionsOrX === "object" && optionsOrX !== null) {
      if (optionsOrX.left !== undefined && optionsOrX.top === undefined) {
        return originalElementScrollTo.apply(this, arguments as any)
      }
    }
    // 水平滚动容器直接放行
    if (this.scrollWidth > this.clientWidth && this.scrollHeight <= this.clientHeight + 10) {
      return originalElementScrollTo.apply(this, arguments as any)
    }
    if (getPositionLockTarget() !== null) {
      recordPositionLockBlock()
      return
    }
    if (!pageWin.__ophelScrollLockEnabled) {
      return originalElementScrollTo.apply(this, arguments as any)
    }

    let targetY: number | undefined
    if (typeof optionsOrX === "object" && optionsOrX !== null) {
      targetY = optionsOrX.top
    } else if (typeof y === "number") {
      targetY = y
    }

    const currentScrollTop = this.scrollTop || 0

    if (typeof targetY === "number" && targetY > currentScrollTop + 50) {
      return
    }

    return originalElementScrollTo.apply(this, arguments as any)
  }

  // 5. 劫持 Element.prototype.scroll（scrollTo 的别名）
  const originalElementScroll = PageElement.prototype.scroll
  PageElement.prototype.scroll = function (
    this: Element,
    optionsOrX?: ScrollToOptions | number,
    y?: number,
  ) {
    // 纯水平滚动（仅设置 left，无 top），直接放行
    if (typeof optionsOrX === "object" && optionsOrX !== null) {
      if (optionsOrX.left !== undefined && optionsOrX.top === undefined) {
        return originalElementScroll.apply(this, arguments as any)
      }
    }
    // 水平滚动容器直接放行
    if (this.scrollWidth > this.clientWidth && this.scrollHeight <= this.clientHeight + 10) {
      return originalElementScroll.apply(this, arguments as any)
    }
    if (getPositionLockTarget() !== null) {
      recordPositionLockBlock()
      return
    }
    if (!pageWin.__ophelScrollLockEnabled) {
      return originalElementScroll.apply(this, arguments as any)
    }

    let targetY: number | undefined
    if (typeof optionsOrX === "object" && optionsOrX !== null) {
      targetY = optionsOrX.top
    } else if (typeof y === "number") {
      targetY = y
    }

    const currentScrollTop = this.scrollTop || 0

    if (typeof targetY === "number" && targetY > currentScrollTop + 50) {
      return
    }

    return originalElementScroll.apply(this, arguments as any)
  }

  // 6. 劫持 Element.prototype.scrollBy（相对滚动方法）
  const originalElementScrollBy = PageElement.prototype.scrollBy
  PageElement.prototype.scrollBy = function (
    this: Element,
    optionsOrX?: ScrollToOptions | number,
    y?: number,
  ) {
    // 纯水平滚动（仅设置 left，无 top），直接放行
    if (typeof optionsOrX === "object" && optionsOrX !== null) {
      if (optionsOrX.left !== undefined && optionsOrX.top === undefined) {
        return originalElementScrollBy.apply(this, arguments as any)
      }
    }
    // 水平滚动容器直接放行
    if (this.scrollWidth > this.clientWidth && this.scrollHeight <= this.clientHeight + 10) {
      return originalElementScrollBy.apply(this, arguments as any)
    }
    if (getPositionLockTarget() !== null) {
      recordPositionLockBlock()
      return
    }
    if (!pageWin.__ophelScrollLockEnabled) {
      return originalElementScrollBy.apply(this, arguments as any)
    }

    let deltaY: number | undefined
    if (typeof optionsOrX === "object" && optionsOrX !== null) {
      deltaY = optionsOrX.top
    } else if (typeof y === "number") {
      deltaY = y
    }

    if (typeof deltaY === "number" && deltaY > 50) {
      return
    }

    return originalElementScrollBy.apply(this, arguments as any)
  }

  // 监听来自 ScrollLockManager 的 postMessage 消息（启用/禁用劫持）
  // 油猴脚本中 ScrollLockManager 通过 sandbox 的 window.postMessage 发送，
  // pageWin 上的 listener 能接收到（共享同一消息通道）
  pageWin.addEventListener("message", (event: MessageEvent) => {
    if (event.data?.type === "OPHEL_SCROLL_LOCK_TOGGLE") {
      pageWin.__ophelScrollLockEnabled = event.data.enabled
    }
  })

  // 7. 劫持 scrollIntoViewIfNeeded（Chrome 专有 API）
  // 仅在精确位置锁期间拦截，不影响常规 Scroll Lock 功能
  if (typeof PageElement.prototype.scrollIntoViewIfNeeded === "function") {
    const originalScrollIntoViewIfNeeded = PageElement.prototype.scrollIntoViewIfNeeded
    PageElement.prototype.scrollIntoViewIfNeeded = function (centerIfNeeded?: boolean) {
      if (getPositionLockTarget() !== null) {
        recordPositionLockBlock()
        return
      }
      return originalScrollIntoViewIfNeeded.call(this, centerIfNeeded)
    }
  }
}
