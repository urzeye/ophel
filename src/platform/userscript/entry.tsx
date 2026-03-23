import React from "react"
import ReactDOM from "react-dom/client"

import { USERSCRIPT_RESOURCE_DEFINITIONS } from "./resource-manifest"

const USERSCRIPT_OBJECT_URLS = new Set<string>()

const USERSCRIPT_AUDIO_RESOURCE_NAMES = new Set<string>(
  Object.values(USERSCRIPT_RESOURCE_DEFINITIONS)
    .filter(({ fileName }) => /\.(mp3|ogg)$/i.test(fileName))
    .map(({ metaName }) => metaName),
)

const USERSCRIPT_RESOURCE_MIME_TYPES = Object.fromEntries(
  Object.values(USERSCRIPT_RESOURCE_DEFINITIONS).map(({ metaName, fileName }) => {
    const extension = fileName.split(".").pop()?.toLowerCase()
    const mimeType =
      extension === "css"
        ? "text/css"
        : extension === "png"
          ? "image/png"
          : extension === "mp3"
            ? "audio/mpeg"
            : extension === "ogg"
              ? "audio/ogg"
              : "application/octet-stream"

    return [metaName, mimeType]
  }),
)

function decodeBase64ToBytes(base64Data: string): Uint8Array {
  const binary = atob(base64Data)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function normalizeUserscriptResourceUrl(resourceName: string, resourceUrl: string): string {
  if (!resourceUrl.startsWith("data:") || !USERSCRIPT_AUDIO_RESOURCE_NAMES.has(resourceName)) {
    return resourceUrl
  }

  try {
    const separatorIndex = resourceUrl.indexOf(",")
    if (separatorIndex === -1) {
      return resourceUrl
    }

    const metadata = resourceUrl.slice(5, separatorIndex)
    const payload = resourceUrl.slice(separatorIndex + 1)
    const metadataSegments = metadata.split(";").filter(Boolean)
    const rawMimeType = metadataSegments[0] || ""
    const mimeType =
      USERSCRIPT_RESOURCE_MIME_TYPES[resourceName as keyof typeof USERSCRIPT_RESOURCE_MIME_TYPES] ||
      rawMimeType ||
      "application/octet-stream"
    const bytes = metadataSegments.includes("base64")
      ? decodeBase64ToBytes(payload)
      : new TextEncoder().encode(decodeURIComponent(payload))
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }))

    USERSCRIPT_OBJECT_URLS.add(blobUrl)
    return blobUrl
  } catch (error) {
    console.warn(`[Ophel] Failed to normalize userscript resource URL: ${resourceName}`, error)
    return resourceUrl
  }
}

function cleanupUserscriptObjectUrls(): void {
  for (const objectUrl of USERSCRIPT_OBJECT_URLS) {
    URL.revokeObjectURL(objectUrl)
  }

  USERSCRIPT_OBJECT_URLS.clear()
}

function getUserscriptResourceText(resourceName: string): string {
  try {
    return GM_getResourceText(resourceName)
  } catch (error) {
    console.warn(`[Ophel] Failed to load userscript text resource: ${resourceName}`, error)
    return ""
  }
}

function getUserscriptResourceUrl(resourceName: string): string | undefined {
  try {
    const resourceUrl = GM_getResourceURL(resourceName)
    return resourceUrl ? normalizeUserscriptResourceUrl(resourceName, resourceUrl) : undefined
  } catch (error) {
    console.warn(`[Ophel] Failed to load userscript URL resource: ${resourceName}`, error)
    return undefined
  }
}

const userscriptStyleText = getUserscriptResourceText(
  USERSCRIPT_RESOURCE_DEFINITIONS.styles.metaName,
)

const notificationSoundUrls = {
  default: getUserscriptResourceUrl(USERSCRIPT_RESOURCE_DEFINITIONS.notificationDefault.metaName),
  softChime: getUserscriptResourceUrl(
    USERSCRIPT_RESOURCE_DEFINITIONS.notificationSoftChime.metaName,
  ),
  glassPing: getUserscriptResourceUrl(
    USERSCRIPT_RESOURCE_DEFINITIONS.notificationGlassPing.metaName,
  ),
  brightAlert: getUserscriptResourceUrl(
    USERSCRIPT_RESOURCE_DEFINITIONS.notificationBrightAlert.metaName,
  ),
}

window.__OPHEL_NOTIFICATION_SOUND_URLS__ = Object.fromEntries(
  Object.entries(notificationSoundUrls).filter(
    ([, url]) => typeof url === "string" && url.length > 0,
  ),
)

window.__OPHEL_USERSCRIPT_ASSET_URLS__ = {
  icon: getUserscriptResourceUrl(USERSCRIPT_RESOURCE_DEFINITIONS.icon.metaName) || "",
  watermarkBg48:
    getUserscriptResourceUrl(USERSCRIPT_RESOURCE_DEFINITIONS.watermarkBg48.metaName) || "",
  watermarkBg96:
    getUserscriptResourceUrl(USERSCRIPT_RESOURCE_DEFINITIONS.watermarkBg96.metaName) || "",
}

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

const chromeStorage = (window as any).chrome?.storage
if (chromeStorage && !chromeStorage.onChanged) {
  chromeStorage.onChanged = {
    addListener: () => {},
    removeListener: () => {},
  }
}

const chromeRuntime = (window as any).chrome?.runtime
if (chromeRuntime && !chromeRuntime.onMessage) {
  chromeRuntime.onMessage = {
    addListener: () => {},
    removeListener: () => {},
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

// 注意：Flutter 滚动容器现在在 scroll-helper.ts 中直接通过 unsafeWindow 访问
// 不再需要在这里注入 Main World 监听器

/**
 * 初始化油猴脚本
 */
async function init() {
  const [{ getAdapter }, { App }, { initNetworkMonitor }] = await Promise.all([
    import("~adapters"),
    import("~components/App"),
    import("~core/network-monitor"),
  ])

  const adapter = getAdapter()

  if (!adapter) {
    return
  }

  // 初始化适配器
  adapter.afterPropertiesSet({})

  let mountObserver: MutationObserver | null = null
  let mountInterval: number | null = null

  const cleanupMountWatchers = () => {
    mountObserver?.disconnect()
    mountObserver = null
    if (mountInterval !== null) {
      window.clearInterval(mountInterval)
      mountInterval = null
    }
  }

  const mountUserscriptApp = async () => {
    try {
      const shadowHost = document.createElement("div")
      shadowHost.id = "ophel-userscript-root"
      shadowHost.style.cssText =
        "all: initial; display: block; position: fixed; inset: 0; width: 0; height: 0; overflow: visible; pointer-events: none; z-index: 2147483647;"

      const getMountParent = () => document.body || document.documentElement

      const waitForMountParent = async () => {
        if (getMountParent()) return
        await new Promise<void>((resolve) => {
          const observer = new MutationObserver(() => {
            if (getMountParent()) {
              observer.disconnect()
              resolve()
            }
          })
          observer.observe(document.documentElement, { childList: true, subtree: true })
        })
      }

      const doMount = () => {
        const parent = getMountParent()
        if (!parent) return
        if (shadowHost.parentElement !== parent) {
          parent.appendChild(shadowHost)
        }
      }

      await waitForMountParent()
      doMount()
      ;[250, 600, 1200, 2000, 3500, 5000].forEach((delay) => setTimeout(doMount, delay))

      mountObserver = new MutationObserver(() => {
        if (!shadowHost.isConnected) {
          doMount()
        }
      })
      mountObserver.observe(document.documentElement, { childList: true, subtree: true })

      mountInterval = window.setInterval(() => {
        if (!shadowHost.isConnected) {
          doMount()
        }
      }, 2000)

      if (window.location.hostname.includes("chatglm.cn")) {
        shadowHost.classList.add("gh-site-chatglm")
      }

      const shadowRoot = shadowHost.attachShadow({ mode: "open" })

      const styleEl = document.createElement("style")
      styleEl.textContent = userscriptStyleText
      shadowRoot.appendChild(styleEl)

      const container = document.createElement("div")
      container.id = "ophel-app-container"
      shadowRoot.appendChild(container)

      const root = ReactDOM.createRoot(container)
      root.render(React.createElement(App))
    } catch (error) {
      cleanupMountWatchers()
      throw error
    }
  }

  await mountUserscriptApp()

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
    setState: (partial: Partial<{ _hasHydrated: boolean }>) => void
  }) => {
    if (store.getState()._hasHydrated) {
      return Promise.resolve(true)
    }

    const hydrationPromise = new Promise<boolean>((resolve) => {
      let timeoutId: number
      let resolved = false
      const finish = (value: boolean) => {
        if (resolved) return
        resolved = true
        window.clearTimeout(timeoutId)
        resolve(value)
      }

      const unsub = store.subscribe((state) => {
        if (state._hasHydrated) {
          unsub()
          finish(true)
        }
      })

      timeoutId = window.setTimeout(() => {
        unsub()
        // 首次空存储时，persist 可能不会自然结束 hydration。
        // userscript 环境下这里直接兜底结束 loading，允许默认配置先渲染出来。
        store.setState({ _hasHydrated: true })
        finish(false)
      }, 5000)
    })

    return hydrationPromise
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

  await initCoreModules(ctx)

  // 初始化 NetworkMonitor 消息监听器（必须显式调用以避免 tree-shaking）
  initNetworkMonitor()

  // 订阅设置变化
  subscribeModuleUpdates(ctx)

  // 初始化 URL 变化监听 (SPA 导航)
  initUrlChangeObserver(ctx)

  window.addEventListener("unload", cleanupMountWatchers)
  window.addEventListener("unload", cleanupUserscriptObjectUrls)
}

// 启动
void init()
