import { APP_DISPLAY_NAME } from "~utils/config"
import {
  MSG_CHECK_PERMISSION,
  MSG_CHECK_PERMISSIONS,
  MSG_FOCUS_TAB,
  MSG_OPEN_OPTIONS_PAGE,
  MSG_PROXY_FETCH,
  MSG_REQUEST_PERMISSIONS,
  MSG_REVOKE_PERMISSIONS,
  MSG_SHOW_NOTIFICATION,
  MSG_WEBDAV_REQUEST,
  type ExtensionMessage,
} from "~utils/messaging"
import { localStorage, type Settings } from "~utils/storage"

/**
 * Ophel - Background Service Worker
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

// 监听权限移除
chrome.permissions.onRemoved.addListener(async (removed) => {
  if (removed.origins && removed.origins.includes("<all_urls>")) {
    // 获取当前设置
    const settings = await localStorage.get<Settings>("settings")
    if (settings && settings.content?.watermarkRemoval) {
      // 关闭去水印
      settings.content.watermarkRemoval = false
      await localStorage.set("settings", settings)
    }
  }
})

// 设置动态规则以支持CORS + Credentials（去水印功能）
// 使用 declarativeNetRequestWithHostAccess 权限 + 必需 host_permissions (*.googleusercontent.com)
async function setupDynamicRules() {
  // *.googleusercontent.com 已在 manifest host_permissions 中声明，无需额外权限检查

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
}

// 消息监听 - 与 Content Script 通信
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  switch (message.type) {
    case MSG_SHOW_NOTIFICATION:
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("assets/icon.png"),
        title: message.title || APP_DISPLAY_NAME,
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

    case MSG_WEBDAV_REQUEST:
      ;(async () => {
        try {
          const { method, url, body, headers, auth } = message as any
          const fetchHeaders: Record<string, string> = { ...headers }

          // 添加 Basic Auth
          if (auth?.username && auth?.password) {
            const credentials = btoa(`${auth.username}:${auth.password}`)
            fetchHeaders["Authorization"] = `Basic ${credentials}`
          }

          const response = await fetch(url, {
            method,
            headers: fetchHeaders,
            body: body || undefined,
          })

          // 获取响应文本
          const responseText = await response.text()

          sendResponse({
            success: true,
            status: response.status,
            statusText: response.statusText,
            body: responseText,
            headers: Object.fromEntries(response.headers.entries()),
          })
        } catch (err) {
          console.error("WebDAV request failed:", err)
          sendResponse({ success: false, error: (err as Error).message })
        }
      })()
      break

    case MSG_CHECK_PERMISSION:
      ;(async () => {
        try {
          const { origin } = message as any
          const hasPermission = await chrome.permissions.contains({
            origins: [origin],
          })
          sendResponse({ success: true, hasPermission })
        } catch (err) {
          console.error("Permission check failed:", err)
          sendResponse({ success: false, error: (err as Error).message })
        }
      })()
      break

    // 检查多个权限
    case MSG_CHECK_PERMISSIONS:
      ;(async () => {
        try {
          const { origins, permissions } = message as any
          const hasPermission = await chrome.permissions.contains({
            origins,
            permissions,
          })
          sendResponse({ success: true, hasPermission })
        } catch (err) {
          console.error("Permissions check failed:", err)
          sendResponse({ success: false, error: (err as Error).message })
        }
      })()
      break

    // 撤销权限
    case MSG_REVOKE_PERMISSIONS:
      ;(async () => {
        try {
          const { origins, permissions } = message as any
          const removed = await chrome.permissions.remove({
            origins,
            permissions,
          })
          sendResponse({ success: true, removed })
        } catch (err) {
          console.error("Permissions revoke failed:", err)
          sendResponse({ success: false, error: (err as Error).message })
        }
      })()
      break

    // 请求权限：打开最小化权限请求页面
    case MSG_REQUEST_PERMISSIONS:
      ;(async () => {
        try {
          // 从消息中获取权限类型，默认为 allUrls
          const permType = (message as any).permType || "allUrls"
          const url = chrome.runtime.getURL(`tabs/perm-request.html?type=${permType}`)

          // 获取当前窗口信息以计算居中位置
          const currentWindow = await chrome.windows.getCurrent()
          const width = 450
          const height = 380
          const left = currentWindow.left! + Math.round((currentWindow.width! - width) / 2)
          const top = currentWindow.top! + Math.round((currentWindow.height! - height) / 2)

          // 最小化弹窗，居中显示
          await chrome.windows.create({
            url,
            type: "popup",
            width,
            height,
            left,
            top,
            focused: true,
          })

          sendResponse({ success: true })
        } catch (err) {
          console.error("Request permissions flow failed:", err)
          sendResponse({ success: false, error: (err as Error).message })
        }
      })()
      break

    case MSG_OPEN_OPTIONS_PAGE:
      ;(async () => {
        try {
          const optionsUrl = chrome.runtime.getURL("tabs/options.html")
          // 直接创建新标签页（不需要 tabs 权限）
          await chrome.tabs.create({
            url: optionsUrl,
            active: true,
          })
          sendResponse({ success: true })
        } catch (err) {
          console.error("Open options page failed:", err)
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
