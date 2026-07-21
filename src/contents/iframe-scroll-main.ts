/**
 * iframe 滚动操作 - 主世界脚本
 *
 * 这个脚本运行在主世界（Main World），用于访问 iframe 内的 Flutter 滚动容器
 * Content Script (Isolated World) 无法直接访问 iframe 的 contentDocument，
 * 需要通过 postMessage 与 Main World 脚本通信。
 *
 * 主要用途：图文并茂（Canvas）模式下的滚动控制
 */

import type { PlasmoCSConfig } from "plasmo"

import { READING_HISTORY_RESTORE_TOKEN_ATTRIBUTE } from "~utils/reading-history-navigation"

// 配置为主世界运行
export const config: PlasmoCSConfig = {
  matches: ["https://gemini.google.com/*", "https://business.gemini.google/*"],
  world: "MAIN",
  run_at: "document_start",
}

// 防止重复初始化
if (!window.__ophelIframeScrollInitialized) {
  window.__ophelIframeScrollInitialized = true

  /**
   * 查找 iframe 内的 Flutter 滚动容器（图文并茂模式）
   * 只有 Main World 才能访问 iframe 的 contentDocument
   */
  function getFlutterScrollContainer(): HTMLElement | null {
    const iframes = document.querySelectorAll("iframe")
    for (const iframe of iframes) {
      try {
        const iframeDoc =
          (iframe as HTMLIFrameElement).contentDocument ||
          (iframe as HTMLIFrameElement).contentWindow?.document
        if (iframeDoc) {
          // 查找 Flutter 滚动容器
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

  // 监听来自 Content Script 的滚动请求消息
  window.addEventListener("message", (event) => {
    if (event.source !== window) return
    if (event.data?.type !== "OPHEL_SCROLL_REQUEST") return

    const { action, position, requestId, restoreToken } = event.data
    const respond = (result: {
      success: boolean
      scrollTop?: number
      scrollHeight?: number
      reason?: string
    }) => {
      window.postMessage({ type: "OPHEL_SCROLL_RESPONSE", requestId, ...result }, "*")
    }

    if (
      typeof restoreToken === "string" &&
      document.documentElement.getAttribute(READING_HISTORY_RESTORE_TOKEN_ATTRIBUTE) !==
        restoreToken
    ) {
      respond({ success: false, reason: "canceled" })
      return
    }

    const container = getFlutterScrollContainer()

    if (!container) {
      respond({ success: false, reason: "no_flutter_container" })
      return
    }

    let result: { success: boolean; scrollTop?: number; scrollHeight?: number }
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

    respond(result)
  })
}
