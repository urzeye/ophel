/**
 * 滚动辅助工具
 *
 * 封装与 Main World 脚本的通信，处理 iframe 内 Flutter 滚动容器（图文并茂模式）
 * Content Script (Isolated World) 无法直接访问 iframe 的 contentDocument，
 * 需要通过 postMessage 与 Main World 脚本通信。
 *
 * 油猴脚本环境：通过 unsafeWindow 直接访问主世界 DOM
 */

import type { SiteAdapter } from "~adapters/base"

// 平台检测
declare const __PLATFORM__: "extension" | "userscript" | undefined
const isUserscript = typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"

interface ScrollResponse {
  success: boolean
  scrollTop?: number
  scrollHeight?: number
  reason?: string
}

/**
 * 获取主世界的 window 对象
 * 油猴脚本：使用 unsafeWindow
 * 浏览器插件：使用普通 window
 */
function getMainWindow(): Window {
  if (isUserscript && (window as any).unsafeWindow) {
    return (window as any).unsafeWindow
  }
  return window
}

/**
 * 直接在油猴脚本环境中查找 Flutter 滚动容器
 * 通过 unsafeWindow.document 访问主世界的 DOM
 */
function getFlutterScrollContainerDirect(): HTMLElement | null {
  const mainWindow = getMainWindow()
  const iframes = mainWindow.document.querySelectorAll("iframe")

  for (const iframe of iframes) {
    try {
      const iframeDoc =
        (iframe as HTMLIFrameElement).contentDocument ||
        (iframe as HTMLIFrameElement).contentWindow?.document
      if (iframeDoc) {
        const scrollContainer = iframeDoc.querySelector(
          'flt-semantics[style*="overflow-y: scroll"]',
        ) as HTMLElement
        if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
          return scrollContainer
        }
      }
    } catch {
      // 跨域 iframe 会抛出错误，忽略
    }
  }
  return null
}

/**
 * 通过 Main World 脚本执行 iframe 内滚动操作（浏览器插件使用）
 * 油猴脚本则直接操作 Flutter 容器
 * @param action 滚动动作
 * @param position 目标位置（仅 scrollTo 需要）
 * @returns Promise 返回滚动结果
 */
function sendScrollRequest(
  action: "scrollToTop" | "scrollToBottom" | "scrollTo" | "getScrollInfo",
  position?: number,
): Promise<ScrollResponse> {
  // 油猴脚本：直接访问 Flutter 容器
  if (isUserscript) {
    const container = getFlutterScrollContainerDirect()
    if (!container) {
      return Promise.resolve({ success: false, reason: "no_flutter_container" })
    }

    let result: ScrollResponse
    switch (action) {
      case "scrollToTop":
        container.scrollTop = 0
        result = { success: true, scrollTop: container.scrollTop }
        break
      case "scrollToBottom":
        container.scrollTop = container.scrollHeight
        result = { success: true, scrollTop: container.scrollTop }
        break
      case "scrollTo":
        if (typeof position === "number") {
          container.scrollTop = position
        }
        result = { success: true, scrollTop: container.scrollTop }
        break
      case "getScrollInfo":
        result = {
          success: true,
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
        }
        break
      default:
        result = { success: false }
    }
    return Promise.resolve(result)
  }

  // 浏览器插件：通过 postMessage 与 Main World 脚本通信
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      if (event.source !== window) return
      if (event.data?.type === "OPHEL_SCROLL_RESPONSE") {
        window.removeEventListener("message", handler)
        resolve(event.data as ScrollResponse)
      }
    }

    window.addEventListener("message", handler)

    // 发送请求到 Main World
    window.postMessage({ type: "OPHEL_SCROLL_REQUEST", action, position }, "*")

    // 超时处理（100ms 后如果没有响应，认为 Main World 脚本未加载或无 Flutter 容器）
    setTimeout(() => {
      window.removeEventListener("message", handler)
      resolve({ success: false, reason: "timeout" })
    }, 100)
  })
}

/**
 * 智能获取滚动容器
 * 优先尝试 adapter 的实现，如果失败则回退到 Main World 查询
 */
export function getScrollContainer(adapter: SiteAdapter | null): HTMLElement | null {
  if (!adapter) return document.documentElement

  // 尝试 adapter 的实现（普通页面模式）
  const container = adapter.getScrollContainer()
  if (container) {
    return container
  }

  // 如果 adapter 找不到，返回 document.documentElement 作为 fallback
  // 实际的 iframe 滚动将通过 Main World 脚本处理
  return document.documentElement
}

/**
 * 智能滚动到顶部
 * 策略：先尝试 Main World 通信（处理 iframe 内滚动），失败后回退到本地适配器容器
 */
export async function smartScrollToTop(adapter: SiteAdapter | null): Promise<{
  container: HTMLElement
  previousScrollTop: number
  scrollHeight: number
}> {
  // 首先尝试通过 Main World 处理 iframe 内滚动（图文并茂模式）
  const infoResult = await sendScrollRequest("getScrollInfo")
  if (infoResult.success) {
    const previousScrollTop = infoResult.scrollTop || 0
    const scrollHeight = infoResult.scrollHeight || 0
    await sendScrollRequest("scrollToTop")
    return { container: createFlutterScrollProxy(), previousScrollTop, scrollHeight }
  }

  // Main World 没有找到 Flutter 容器，尝试本地适配器
  const container = adapter?.getScrollContainer()

  if (container && container.scrollHeight > container.clientHeight) {
    const previousScrollTop = container.scrollTop
    const scrollHeight = container.scrollHeight
    container.scrollTo({ top: 0, behavior: "instant" })
    return { container, previousScrollTop, scrollHeight }
  }

  // 最终回退到 document.documentElement
  const fallback = document.documentElement
  return {
    container: fallback,
    previousScrollTop: fallback.scrollTop,
    scrollHeight: fallback.scrollHeight,
  }
}

/**
 * 智能滚动到底部
 * 策略：先尝试 Main World 通信（处理 iframe 内滚动），失败后回退到本地适配器容器
 */
export async function smartScrollToBottom(adapter: SiteAdapter | null): Promise<{
  container: HTMLElement
  previousScrollTop: number
}> {
  // 首先尝试通过 Main World 处理 iframe 内滚动（图文并茂模式）
  const infoResult = await sendScrollRequest("getScrollInfo")
  if (infoResult.success) {
    const previousScrollTop = infoResult.scrollTop || 0
    await sendScrollRequest("scrollToBottom")
    return { container: createFlutterScrollProxy(), previousScrollTop }
  }

  // Main World 没有找到 Flutter 容器，尝试本地适配器
  const container = adapter?.getScrollContainer()

  if (container && container.scrollHeight > container.clientHeight) {
    const previousScrollTop = container.scrollTop
    container.scrollTo({ top: container.scrollHeight, behavior: "instant" })
    return { container, previousScrollTop }
  }

  // 最终回退到 document.documentElement
  const fallback = document.documentElement
  return { container: fallback, previousScrollTop: fallback.scrollTop }
}

/**
 * 智能滚动到指定位置
 * 策略：先尝试 Main World 通信，失败后回退到本地容器
 */
export async function smartScrollTo(
  adapter: SiteAdapter | null,
  position: number,
): Promise<{ success: boolean; currentScrollTop: number }> {
  // 首先尝试通过 Main World 处理
  const result = await sendScrollRequest("scrollTo", position)
  if (result.success) {
    return { success: true, currentScrollTop: result.scrollTop || 0 }
  }

  // Main World 失败，尝试本地适配器
  const container = adapter?.getScrollContainer()

  if (container && container.scrollHeight > container.clientHeight) {
    container.scrollTo({ top: position, behavior: "instant" })
    return { success: true, currentScrollTop: container.scrollTop }
  }

  // 最终回退
  document.documentElement.scrollTo({ top: position, behavior: "instant" })
  return { success: true, currentScrollTop: document.documentElement.scrollTop }
}

/**
 * 获取当前滚动信息
 * 策略：先尝试 Main World 通信，失败后回退到本地容器
 */
export async function getScrollInfo(adapter: SiteAdapter | null): Promise<{
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  isFlutterMode: boolean
}> {
  // 首先尝试通过 Main World 获取 Flutter 容器信息
  const result = await sendScrollRequest("getScrollInfo")
  if (result.success) {
    return {
      scrollTop: result.scrollTop || 0,
      scrollHeight: result.scrollHeight || 0,
      clientHeight: 0, // Flutter 模式暂不提供
      isFlutterMode: true,
    }
  }

  // Main World 失败，尝试本地适配器
  const container = adapter?.getScrollContainer()

  if (container && container.scrollHeight > container.clientHeight) {
    return {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      isFlutterMode: false,
    }
  }

  // 最终回退
  return {
    scrollTop: document.documentElement.scrollTop,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    isFlutterMode: false,
  }
}

/**
 * 创建一个代理对象，用于 Flutter 模式下的滚动操作
 * 这个对象模拟 HTMLElement 接口，但实际通过 Main World 执行滚动
 */
function createFlutterScrollProxy(): HTMLElement {
  // 返回一个最小的代理对象，仅用于类型兼容
  // 实际滚动操作应该通过 smartScrollTo 等函数执行
  const proxy = document.createElement("div")
  Object.defineProperty(proxy, "__isFlutterProxy", { value: true })
  return proxy
}

/**
 * 检查容器是否是 Flutter 代理
 */
export function isFlutterProxy(container: HTMLElement): boolean {
  return (container as any).__isFlutterProxy === true
}
