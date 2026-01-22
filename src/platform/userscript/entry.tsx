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
          // 遍历所有已知的 storage keys 并删除
          for (const key of KNOWN_STORAGE_KEYS) {
            GM_deleteValue(key)
          }
          callback?.()
        },
      },
      // sync 在油猴脚本中与 local 共用相同实现
      sync: {
        get: (
          keys: string | string[] | null,
          callback: (items: Record<string, unknown>) => void,
        ) => {
          if (keys === null) {
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
          for (const key of KNOWN_STORAGE_KEYS) {
            GM_deleteValue(key)
          }
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

  // 等待 Zustand hydration 完成后初始化核心模块
  const { useSettingsStore, getSettingsState } = await import("~stores/settings-store")
  const { useConversationsStore } = await import("~stores/conversations-store")
  const { useFoldersStore } = await import("~stores/folders-store")
  const { useTagsStore } = await import("~stores/tags-store")
  const { usePromptsStore } = await import("~stores/prompts-store")
  const { useClaudeSessionKeysStore } = await import("~stores/claude-sessionkeys-store")

  // 等待所有 store hydration 完成
  const waitForHydration = (store: {
    getState: () => { _hasHydrated: boolean }
    subscribe: (fn: (state: { _hasHydrated: boolean }) => void) => () => void
  }) => {
    return new Promise<void>((resolve) => {
      if (store.getState()._hasHydrated) {
        resolve()
        return
      }
      const unsub = store.subscribe((state) => {
        if (state._hasHydrated) {
          unsub()
          resolve()
        }
      })
    })
  }

  await Promise.all([
    waitForHydration(useSettingsStore),
    waitForHydration(useConversationsStore),
    waitForHydration(useFoldersStore),
    waitForHydration(useTagsStore),
    waitForHydration(usePromptsStore),
    waitForHydration(useClaudeSessionKeysStore),
  ])

  // 获取用户设置
  const settings = getSettingsState()
  const siteId = adapter.getSiteId()

  // ========== 初始化所有核心模块（使用共享模块） ==========
  const { initCoreModules, subscribeModuleUpdates, initUrlChangeObserver } = await import(
    "~core/modules-init"
  )

  const ctx = { adapter, settings, siteId }

  // 初始化所有模块
  await initCoreModules(ctx)
  console.log("[Ophel Userscript] Core modules initialized")

  // 订阅设置变化
  subscribeModuleUpdates(ctx)

  // 初始化 URL 变化监听 (SPA 导航)
  initUrlChangeObserver(ctx)

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
