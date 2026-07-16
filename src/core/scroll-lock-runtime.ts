/**
 * 跨平台滚动锁运行时。
 *
 * 扩展 MAIN world 与 userscript unsafeWindow 共用这一份业务逻辑；平台入口只负责
 * 提供真实页面 window，避免两端手工维护两套滚动 API 劫持实现。
 */

type ScrollIntoViewOptionsWithBypass = ScrollIntoViewOptions & { __bypassLock?: boolean }
type ElementWithScrollIntoViewIfNeeded = Element & {
  scrollIntoViewIfNeeded?: (centerIfNeeded?: boolean) => void
}

export function installScrollLockRuntime(pageWin: Window & typeof globalThis): void {
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
    const attr = pageWin.document.documentElement.dataset.ophelPositionLock
    if (attr !== undefined) {
      const val = Number(attr)
      if (!isNaN(val)) return val
    }
    return null
  }

  function recordPositionLockBlock() {
    pageWin.document.documentElement.dataset.ophelPositionLockLastBlock = String(Date.now())
  }

  // 1. 劫持 Element.prototype.scrollIntoView
  PageElement.prototype.scrollIntoView = function (options?: boolean | ScrollIntoViewOptions) {
    const shouldBypass =
      options &&
      typeof options === "object" &&
      (options as ScrollIntoViewOptionsWithBypass).__bypassLock
    const posLock = getPositionLockTarget()
    if (posLock !== null) {
      if (shouldBypass) {
        return Reflect.apply(originalApis.scrollIntoView, this, [options])
      }
      // 水平容器内的元素不影响主页垂直滤动，逆辑放行
      let el: Element | null = this.parentElement
      while (el) {
        if (el.scrollWidth > el.clientWidth && el.scrollHeight <= el.clientHeight + 10) {
          return Reflect.apply(originalApis.scrollIntoView, this, [options])
        }
        el = el.parentElement
      }
      recordPositionLockBlock()
      return
    }

    // 快速路径：锁未激活则直接调用原始 API
    if (!pageWin.__ophelScrollLockEnabled) {
      return Reflect.apply(originalApis.scrollIntoView, this, [options])
    }

    // scrollLock 已启用：水平容器内的元素直接放行
    let el: Element | null = this.parentElement
    while (el) {
      if (el.scrollWidth > el.clientWidth && el.scrollHeight <= el.clientHeight + 10) {
        return Reflect.apply(originalApis.scrollIntoView, this, [options])
      }
      el = el.parentElement
    }

    if (!shouldBypass) {
      return
    }

    return Reflect.apply(originalApis.scrollIntoView, this, [options])
  }

  // 2. 劫持 window.scrollTo
  pageWin.scrollTo = function (x?: ScrollToOptions | number, y?: number) {
    if (getPositionLockTarget() !== null) {
      recordPositionLockBlock()
      return
    }
    if (!pageWin.__ophelScrollLockEnabled) {
      return Reflect.apply(originalApis.scrollTo, pageWin, arguments)
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

    return Reflect.apply(originalApis.scrollTo, pageWin, arguments)
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
        return Reflect.apply(originalElementScrollTo, this, arguments)
      }
    }
    // 水平滚动容器直接放行
    if (this.scrollWidth > this.clientWidth && this.scrollHeight <= this.clientHeight + 10) {
      return Reflect.apply(originalElementScrollTo, this, arguments)
    }
    if (getPositionLockTarget() !== null) {
      recordPositionLockBlock()
      return
    }
    if (!pageWin.__ophelScrollLockEnabled) {
      return Reflect.apply(originalElementScrollTo, this, arguments)
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

    return Reflect.apply(originalElementScrollTo, this, arguments)
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
        return Reflect.apply(originalElementScroll, this, arguments)
      }
    }
    // 水平滚动容器直接放行
    if (this.scrollWidth > this.clientWidth && this.scrollHeight <= this.clientHeight + 10) {
      return Reflect.apply(originalElementScroll, this, arguments)
    }
    if (getPositionLockTarget() !== null) {
      recordPositionLockBlock()
      return
    }
    if (!pageWin.__ophelScrollLockEnabled) {
      return Reflect.apply(originalElementScroll, this, arguments)
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

    return Reflect.apply(originalElementScroll, this, arguments)
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
        return Reflect.apply(originalElementScrollBy, this, arguments)
      }
    }
    // 水平滚动容器直接放行
    if (this.scrollWidth > this.clientWidth && this.scrollHeight <= this.clientHeight + 10) {
      return Reflect.apply(originalElementScrollBy, this, arguments)
    }
    if (getPositionLockTarget() !== null) {
      recordPositionLockBlock()
      return
    }
    if (!pageWin.__ophelScrollLockEnabled) {
      return Reflect.apply(originalElementScrollBy, this, arguments)
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

    return Reflect.apply(originalElementScrollBy, this, arguments)
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
  const pageElementPrototype = PageElement.prototype as ElementWithScrollIntoViewIfNeeded
  if (typeof pageElementPrototype.scrollIntoViewIfNeeded === "function") {
    const originalScrollIntoViewIfNeeded = pageElementPrototype.scrollIntoViewIfNeeded
    pageElementPrototype.scrollIntoViewIfNeeded = function (centerIfNeeded?: boolean) {
      if (getPositionLockTarget() !== null) {
        recordPositionLockBlock()
        return
      }
      return originalScrollIntoViewIfNeeded.call(this, centerIfNeeded)
    }
  }
}
