import React from "react"
import ReactDOM from "react-dom/client"

import { getAdapter } from "~adapters"
import { App } from "~components/App"
import { platform } from "~platform"

// 导入样式为内联字符串（用于注入到 Shadow DOM）
// 使用相对路径避免别名解析问题
import mainStyle from "../../style.css?inline"
import conversationsStyle from "../../styles/conversations.css?inline"
import settingsStyle from "../../styles/settings.css?inline"

/**
 * Ophel - Userscript Entry Point
 *
 * 油猴脚本入口文件
 * 浏览器扩展的核心组件，使用油猴 API 替代 chrome.* API
 */

// ========== 全局 Chrome API Polyfill ==========
// 必须在其他模块导入之前执行，为使用 chrome.storage.local 的代码提供兼容层
declare function GM_getValue<T>(key: string, defaultValue?: T): T
declare function GM_setValue(key: string, value: unknown): void
declare function GM_deleteValue(key: string): void

if (typeof chrome === "undefined" || !chrome.storage) {
  const storageData: Record<string, unknown> = {}

  // 创建 chrome.storage.local polyfill
  // 定义所有已知的 storage keys（用于 get(null) 时获取全部数据）
  const KNOWN_STORAGE_KEYS = [
    "settings",
    "prompts",
    "folders",
    "tags",
    "readingHistory",
    "claudeSessionKeys",
    "conversations",
  ]

  ;(window as any).chrome = {
    storage: {
      local: {
        get: (
          keys: string | string[] | null,
          callback: (items: Record<string, unknown>) => void,
        ) => {
          if (keys === null) {
            // 获取所有数据 - 遍历已知的 keys
            const result: Record<string, unknown> = {}
            for (const key of KNOWN_STORAGE_KEYS) {
              const value = GM_getValue(key)
              if (value !== undefined && value !== null) {
                result[key] = value
              }
            }
            callback(result)
          } else if (typeof keys === "string") {
            const value = GM_getValue(keys)
            callback({ [keys]: value })
          } else {
            const result: Record<string, unknown> = {}
            for (const key of keys) {
              result[key] = GM_getValue(key)
            }
            callback(result)
          }
        },
        set: (items: Record<string, unknown>, callback?: () => void) => {
          for (const [key, value] of Object.entries(items)) {
            GM_setValue(key, value)
          }
          callback?.()
        },
        remove: (keys: string | string[], callback?: () => void) => {
          const keyArray = typeof keys === "string" ? [keys] : keys
          for (const key of keyArray) {
            GM_deleteValue(key)
          }
          callback?.()
        },
        clear: (callback?: () => void) => {
          console.warn("[Chrome Polyfill] clear() is not supported in userscript")
          callback?.()
        },
      },
      onChanged: {
        addListener: () => {
          // 不支持 onChanged，但不能报错，静默忽略
        },
        removeListener: () => {},
      },
    },
    runtime: {
      getManifest: () => ({ version: "1.0.0" }),
      getURL: (path: string) => path,
      sendMessage: () => Promise.resolve({}),
    },
  }
}

// 防止在 iframe 中执行
if (window.top !== window.self) {
  throw new Error("Ophel: Running in iframe, skipping initialization")
}

// 防止重复初始化
if ((window as any).ophelUserscriptInitialized) {
  throw new Error("Ophel: Already initialized")
}
;(window as any).ophelUserscriptInitialized = true

/**
 * 初始化油猴脚本
 */
async function init() {
  const adapter = getAdapter()

  if (!adapter) {
    console.warn("[Ophel Userscript] No adapter found for:", window.location.hostname)
    return
  }

  // 初始化适配器
  adapter.afterPropertiesSet({})

  // 等待 Zustand hydration 完成后初始化 ThemeManager
  const { useSettingsStore, getSettingsState } = await import("~stores/settings-store")
  const { ThemeManager } = await import("~core/theme-manager")
  const { DEFAULT_SETTINGS } = await import("~utils/storage")

  // 等待 hydration
  await new Promise<void>((resolve) => {
    if (useSettingsStore.getState()._hasHydrated) {
      resolve()
      return
    }
    const unsub = useSettingsStore.subscribe((state) => {
      if (state._hasHydrated) {
        unsub()
        resolve()
      }
    })
  })

  // 获取用户设置
  const settings = getSettingsState()
  const siteId = adapter.getSiteId()

  // 获取站点主题配置
  const siteTheme =
    settings?.theme?.sites?.[siteId as keyof typeof settings.theme.sites] ||
    settings?.theme?.sites?._default ||
    DEFAULT_SETTINGS.theme.sites._default

  // 创建 ThemeManager 并挂载到全局
  const themeManager = new ThemeManager(
    siteTheme.mode || "light",
    undefined,
    adapter,
    siteTheme.lightStyleId || "google-gradient",
    siteTheme.darkStyleId || "classic-dark",
  )
  themeManager.apply()
  ;(window as any).__ophelThemeManager = themeManager

  // 创建 Shadow DOM 容器
  const shadowHost = document.createElement("div")
  shadowHost.id = "ophel-userscript-root"
  shadowHost.style.cssText = "all: initial; position: fixed; z-index: 2147483647;"

  // 延迟挂载（等待页面稳定）
  const doMount = () => {
    if (!shadowHost.parentElement) {
      document.body.appendChild(shadowHost)
    }
  }

  // Next.js 站点需要延迟挂载
  const hostname = window.location.hostname
  const needsDelayedMount =
    hostname.includes("chatgpt.com") ||
    hostname.includes("chat.openai.com") ||
    hostname.includes("grok.com") ||
    hostname.includes("claude.ai")

  if (needsDelayedMount) {
    const delays = [500, 1000, 2000, 3000]
    delays.forEach((delay) => setTimeout(doMount, delay))

    // MutationObserver 持续监控
    const observer = new MutationObserver(() => {
      if (!shadowHost.parentElement) {
        doMount()
      }
    })
    observer.observe(document.body, { childList: true, subtree: false })
  } else {
    doMount()
  }

  // 创建 Shadow Root
  const shadowRoot = shadowHost.attachShadow({ mode: "open" })

  // 将 CSS 注入到 Shadow DOM 内部
  const styleEl = document.createElement("style")
  styleEl.textContent = [mainStyle, conversationsStyle, settingsStyle].join("\n")
  shadowRoot.appendChild(styleEl)

  // 创建 React 容器
  const container = document.createElement("div")
  container.id = "ophel-app-container"
  shadowRoot.appendChild(container)

  // 挂载 React 应用
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(App))
}

// 启动
init().catch((error) => {
  console.error("[Ophel Userscript] Initialization failed:", error)
})
