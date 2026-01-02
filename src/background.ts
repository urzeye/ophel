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

// 监听扩展安装/更新
chrome.runtime.onInstalled.addListener(() => {
  setupDynamicRules()
})

// 设置动态规则以支持CORS + Credentials
async function setupDynamicRules() {
  const extensionOrigin = chrome.runtime.getURL("").slice(0, -1) // 移除末尾的 /

  // 移除旧规则
  const oldRules = await chrome.declarativeNetRequest.getDynamicRules()
  const oldRuleIds = oldRules.map((rule) => rule.id)
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldRuleIds,
  })

  // 定义Header修改动作
  const headerActionHeaders = {
    requestHeaders: [
      {
        header: "Referer",
        operation: chrome.declarativeNetRequest.HeaderOperation.SET,
        value: "https://gemini.google.com/",
      },
      {
        header: "Origin",
        operation: chrome.declarativeNetRequest.HeaderOperation.SET,
        value: "https://gemini.google.com",
      },
    ],
    responseHeaders: [
      {
        header: "Access-Control-Allow-Origin",
        operation: chrome.declarativeNetRequest.HeaderOperation.SET,
        value: extensionOrigin,
      },
      {
        header: "Access-Control-Allow-Credentials",
        operation: chrome.declarativeNetRequest.HeaderOperation.SET,
        value: "true",
      },
    ],
  }

  // 添加新规则
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [
      {
        id: 1001,
        priority: 2, // 高优先级
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: headerActionHeaders.requestHeaders,
          responseHeaders: headerActionHeaders.responseHeaders,
        },
        condition: {
          // 排除页面本身发起的请求，主要针对扩展的后台请求
          excludedInitiatorDomains: ["google.com", "gemini.google.com"],
          urlFilter: "*://*.googleusercontent.com/*",
          resourceTypes: [
            chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
            chrome.declarativeNetRequest.ResourceType.IMAGE,
            chrome.declarativeNetRequest.ResourceType.OTHER,
          ],
        },
      },
      {
        id: 1002,
        priority: 2,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: headerActionHeaders.requestHeaders,
          responseHeaders: headerActionHeaders.responseHeaders,
        },
        condition: {
          // 排除页面本身发起的请求
          excludedInitiatorDomains: ["google.com", "gemini.google.com"],
          urlFilter: "*://*.google.com/*",
          resourceTypes: [
            chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
            chrome.declarativeNetRequest.ResourceType.IMAGE,
            chrome.declarativeNetRequest.ResourceType.OTHER,
          ],
        },
      },
    ],
  })
  console.log("Dynamic CORS rules set up specifically for extension origin:", extensionOrigin)
}

// 消息监听 - 与 Content Script 通信
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  switch (message.type) {
    case MSG_SHOW_NOTIFICATION:
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("assets/icon.png"),
        title: message.title || "Chat Helper",
        message: message.body || "",
        silent: true, // 禁用系统默认通知声音，由扩展自行播放自定义声音
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
          // 确保规则已设置
          const rules = await chrome.declarativeNetRequest.getDynamicRules()
          if (!rules || rules.length === 0 || !rules.find((r) => r.id === 1001)) {
            await setupDynamicRules()
          }

          // 携带credentials以便访问需要认证的图片资源
          // Dynamic Rules会自动处理 Referer/Origin 和 Access-Control-Allow-Origin
          const response = await fetch(message.url, {
            credentials: "include",
          })

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }

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
