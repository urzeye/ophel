import {
  MSG_FOCUS_TAB,
  MSG_PROXY_FETCH,
  MSG_SHOW_NOTIFICATION,
  type ExtensionMessage,
} from "~utils/messaging"

/**
 * Chat Helper - Background Service Worker
 *
 * 后台服务，处理：
 * - 桌面通知
 * - 标签页管理
 * - 跨标签页消息
 * - 代理请求（图片 Base64 转换等）
 */

console.log("[Chat Helper] Background service worker started")

// 监听扩展安装/更新
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("[Chat Helper] Extension installed")
  } else if (details.reason === "update") {
    console.log("[Chat Helper] Extension updated to version:", chrome.runtime.getManifest().version)
  }
})

// 消息监听 - 与 Content Script 通信
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  console.log("[Chat Helper] Message received:", message.type)

  switch (message.type) {
    case MSG_SHOW_NOTIFICATION:
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("assets/icon.png"),
        title: message.title || "Chat Helper",
        message: message.body || "",
      })
      sendResponse({ success: true })
      break

    case MSG_FOCUS_TAB:
      if (sender.tab?.id) {
        chrome.tabs.update(sender.tab.id, { active: true })
        if (sender.tab.windowId) {
          chrome.windows.update(sender.tab.windowId, { focused: true })
        }
      }
      sendResponse({ success: true })
      break

    case MSG_PROXY_FETCH:
      ;(async () => {
        try {
          const response = await fetch(message.url)
          const blob = await response.blob()
          const reader = new FileReader()
          reader.onloadend = () => {
            sendResponse({ success: true, data: reader.result })
          }
          reader.onerror = () => {
            sendResponse({ success: false, error: "Failed to read blob" })
          }
          reader.readAsDataURL(blob)
        } catch (err) {
          console.error("Proxy fetch failed:", err)
          sendResponse({ success: false, error: (err as Error).message })
        }
      })()
      break

    default:
      sendResponse({ success: false, error: "Unknown message type" })
  }

  return true // 保持消息通道打开
})

export {}
