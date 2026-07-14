import React from "react"
import ReactDOM from "react-dom/client"

import { USERSCRIPT_RESOURCE_DEFINITIONS } from "./resource-manifest"
import { injectGeminiCanvasCodeBridge } from "./gemini-canvas-inject"
import { getInitialUserscriptLanguage, primeUserscriptLocales, subscribeI18nChanges } from "./i18n"
import { injectScrollLock } from "./scroll-lock-inject"
import { injectYuanbaoMonacoWrap } from "./yuanbao-monaco-wrap-inject"
import { applyOphelPlatformFontClass } from "~utils/font"
import { dispatchClearAllDataEvent } from "~utils/clear-all-event"
import { drainCleanupStack } from "~utils/cleanup-stack"
import { suspendPersistenceWrites } from "~stores/chrome-adapter"
import { EVENT_CLEAR_ALL_DATA } from "~utils/messaging"

import {
  initUserscriptClearAllCoordinator,
  isUserscriptClearRuntimeKey,
} from "./clear-all-coordinator"

const USERSCRIPT_OBJECT_URLS = new Set<string>()
let activeUserscriptRuntimeCleanup: (() => void) | null = null

type ChromeStorageAreaPolyfill = {
  get: (keys: string | string[] | null, callback: (items: Record<string, unknown>) => void) => void
  set: (items: Record<string, unknown>, callback?: () => void) => void
  remove: (keys: string | string[], callback?: () => void) => void
  clear: (callback?: () => void) => void
}

type ChromeEventPolyfill = {
  addListener: () => void
  removeListener: () => void
}

type ChromePolyfill = {
  storage?: {
    local: ChromeStorageAreaPolyfill
    sync: ChromeStorageAreaPolyfill
    onChanged?: ChromeEventPolyfill
  }
  runtime?: {
    getManifest: () => { version: string }
    getURL: (path: string) => string
    sendMessage: () => Promise<Record<string, unknown>>
    onMessage?: ChromeEventPolyfill
  }
}

const userscriptWindow = window as unknown as { chrome?: ChromePolyfill }

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

window.__OPHEL_MARKDOWN_PREVIEW_STYLES__ = getUserscriptResourceText(
  USERSCRIPT_RESOURCE_DEFINITIONS.markdownPreviewStyles.metaName,
)
window.__OPHEL_USER_QUERY_MARKDOWN_STYLES__ = getUserscriptResourceText(
  USERSCRIPT_RESOURCE_DEFINITIONS.userQueryMarkdownStyles.metaName,
)
try {
  const siteIconsText = getUserscriptResourceText(
    USERSCRIPT_RESOURCE_DEFINITIONS.siteIcons.metaName,
  )
  window.__OPHEL_SITE_ICONS__ = siteIconsText ? JSON.parse(siteIconsText) : {}
} catch (error) {
  console.warn("[Ophel] Failed to load userscript site icons", error)
  window.__OPHEL_SITE_ICONS__ = {}
}

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
  assistantMermaidRunner:
    getUserscriptResourceUrl(USERSCRIPT_RESOURCE_DEFINITIONS.assistantMermaidRunner.metaName) || "",
  assistantMermaidVendor:
    getUserscriptResourceUrl(USERSCRIPT_RESOURCE_DEFINITIONS.assistantMermaidVendor.metaName) || "",
}

primeUserscriptLocales(getInitialUserscriptLanguage())

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
declare function GM_listValues(): string[]

if (typeof chrome === "undefined" || !chrome.storage) {
  const listDataStorageKeys = () =>
    GM_listValues().filter((key) => !isUserscriptClearRuntimeKey(key))

  userscriptWindow.chrome = {
    storage: {
      local: {
        get: (
          keys: string | string[] | null,
          callback: (items: Record<string, unknown>) => void,
        ) => {
          if (keys === null) {
            const result: Record<string, unknown> = {}
            for (const key of listDataStorageKeys()) {
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
          for (const key of listDataStorageKeys()) {
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
            for (const key of listDataStorageKeys()) {
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
          for (const key of listDataStorageKeys()) {
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

const chromeStorage = userscriptWindow.chrome?.storage
if (chromeStorage && !chromeStorage.onChanged) {
  chromeStorage.onChanged = {
    addListener: () => {},
    removeListener: () => {},
  }
}

const chromeRuntime = userscriptWindow.chrome?.runtime
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
if (window.ophelUserscriptInitialized) {
  throw new Error("Ophel: Already initialized")
}
window.ophelUserscriptInitialized = true

const clearUserscriptRuntimeCaches = () => {
  suspendPersistenceWrites()
  try {
    localStorage.removeItem("ophel_us_theme_cache")
    localStorage.removeItem("ophel:global-search-shortcut-nudge:v1")
  } catch (error) {
    console.warn("[Ophel] Failed to clear userscript runtime caches:", error)
  }
}
window.addEventListener(EVENT_CLEAR_ALL_DATA, clearUserscriptRuntimeCaches)

const userscriptClearCoordinator = initUserscriptClearAllCoordinator({
  prepareCurrentRuntime: async () => {
    suspendPersistenceWrites()
    await dispatchClearAllDataEvent()
  },
  reloadCurrentRuntime: () => window.location.reload(),
})
window.addEventListener(
  "unload",
  () => {
    userscriptClearCoordinator.cleanup()
    window.removeEventListener(EVENT_CLEAR_ALL_DATA, clearUserscriptRuntimeCaches)
  },
  { once: true },
)

// 注入滚动锁定 API 劫持到页面主世界
// 等效于浏览器扩展中的 scroll-lock-main.ts (MAIN World content script)
// 必须在 document-start 时同步执行，在页面代码加载前劫持滚动 API
// 否则 ChatGPT 等平台可能缓存原始 API 引用，导致位置锁被绕过
injectScrollLock()
injectGeminiCanvasCodeBridge()
injectYuanbaoMonacoWrap()

// 注意：Flutter 滚动容器现在在 scroll-helper.ts 中直接通过 unsafeWindow 访问
// 不再需要在这里注入 Main World 监听器

/**
 * 初始化油猴脚本
 * document-start 时 DOM 尚未就绪，需等待 document.readyState 变化
 */
async function init() {
  const cleanupTasks: Array<() => void> = []
  let cleanedUp = false
  const cleanupRuntime = () => {
    if (cleanedUp) return
    cleanedUp = true
    drainCleanupStack(cleanupTasks, "userscript runtime")
    if (activeUserscriptRuntimeCleanup === cleanupRuntime) {
      activeUserscriptRuntimeCleanup = null
    }
    window.ophelUserscriptInitialized = false
  }
  activeUserscriptRuntimeCleanup = cleanupRuntime
  cleanupTasks.push(cleanupUserscriptObjectUrls)
  window.addEventListener("unload", cleanupRuntime, { once: true })
  cleanupTasks.push(() => window.removeEventListener("unload", cleanupRuntime))
  window.addEventListener(EVENT_CLEAR_ALL_DATA, cleanupRuntime, { once: true })
  cleanupTasks.push(() => window.removeEventListener(EVENT_CLEAR_ALL_DATA, cleanupRuntime))

  const [
    { loadAdapter },
    { App },
    { OverlayPortalProvider },
    { clearAdapterRuntime, setAdapterRuntime },
    { destroyNetworkMonitor, initNetworkMonitor },
    { destroyGeminiTitleGuard, initGeminiTitleGuard },
  ] = await Promise.all([
    import("~adapters"),
    import("~components/App"),
    import("~components/ui/OverlayPortal"),
    import("~core/adapter-runtime"),
    import("~core/network-monitor"),
    import("~core/gemini-title-guard"),
  ])
  if (cleanedUp) return

  cleanupTasks.push(destroyNetworkMonitor)
  cleanupTasks.push(destroyGeminiTitleGuard)
  initGeminiTitleGuard()

  const adapter = await loadAdapter()
  if (cleanedUp) return

  if (!adapter) {
    throw new Error(`No supported adapter for ${window.location.hostname}`)
  }

  setAdapterRuntime(adapter)
  cleanupTasks.push(() => clearAdapterRuntime(adapter))

  // 初始化适配器
  cleanupTasks.push(() => adapter.dispose())
  adapter.afterPropertiesSet({})

  let mountParentObserver: MutationObserver | null = null
  let documentRootObserver: MutationObserver | null = null
  let mountParentWaitObserver: MutationObserver | null = null
  let mountParentWaitResolve: (() => void) | null = null
  let userscriptRoot: ReturnType<typeof ReactDOM.createRoot> | null = null
  let shadowHost: HTMLElement | null = null
  const mountRetryTimers: number[] = []

  const cleanupMountWatchers = () => {
    mountParentObserver?.disconnect()
    mountParentObserver = null
    documentRootObserver?.disconnect()
    documentRootObserver = null
    mountParentWaitObserver?.disconnect()
    mountParentWaitObserver = null
    const resolveMountParentWait = mountParentWaitResolve
    mountParentWaitResolve = null
    resolveMountParentWait?.()
    mountRetryTimers.forEach((timer) => window.clearTimeout(timer))
    mountRetryTimers.length = 0
    userscriptRoot?.unmount()
    userscriptRoot = null
    shadowHost?.remove()
    shadowHost = null
  }
  cleanupTasks.push(cleanupMountWatchers)

  const mountUserscriptApp = async () => {
    try {
      shadowHost = document.createElement("div")
      shadowHost.id = "ophel-userscript-root"
      applyOphelPlatformFontClass(shadowHost)
      shadowHost.style.cssText =
        "all: initial; display: block; position: fixed; inset: 0; width: 0; height: 0; overflow: visible; pointer-events: none; z-index: 2147483647;"

      const getMountParent = () => document.body || document.documentElement

      const waitForMountParent = async () => {
        if (getMountParent()) return
        await new Promise<void>((resolve) => {
          mountParentWaitResolve = resolve
          mountParentWaitObserver = new MutationObserver(() => {
            if (getMountParent()) {
              mountParentWaitObserver?.disconnect()
              mountParentWaitObserver = null
              mountParentWaitResolve = null
              resolve()
            }
          })
          mountParentWaitObserver.observe(document.documentElement, {
            childList: true,
            subtree: false,
          })
        })
      }

      const observeMountParent = (parent: HTMLElement) => {
        mountParentObserver?.disconnect()
        mountParentObserver = new MutationObserver(() => {
          if (!shadowHost.isConnected) {
            doMount()
          }
        })
        mountParentObserver.observe(parent, { childList: true, subtree: false })
      }

      const doMount = () => {
        const parent = getMountParent()
        if (!parent) return
        if (shadowHost.parentElement !== parent) {
          parent.appendChild(shadowHost)
        }
        observeMountParent(parent)
      }

      await waitForMountParent()
      if (cleanedUp) return
      doMount()
      ;[250, 600, 1200, 2000, 3500, 5000].forEach((delay) => {
        mountRetryTimers.push(window.setTimeout(doMount, delay))
      })

      documentRootObserver = new MutationObserver(() => {
        if (shadowHost.parentElement !== getMountParent()) {
          doMount()
        }
      })
      documentRootObserver.observe(document.documentElement, { childList: true, subtree: false })

      if (window.location.hostname.includes("chatglm.cn")) {
        shadowHost.classList.add("gh-site-chatglm")
      }

      const shadowRoot = shadowHost.attachShadow({ mode: "open" })

      const styleEl = document.createElement("style")
      // 读取缓存的主题 CSS，预注入以避免主题闪烁（FOUC）
      let earlyThemeCSS = ""
      try {
        earlyThemeCSS = localStorage.getItem("ophel_us_theme_cache") || ""
      } catch {}
      styleEl.textContent =
        (userscriptStyleText || "") + (earlyThemeCSS ? "\n" + earlyThemeCSS : "")
      shadowRoot.appendChild(styleEl)

      const container = document.createElement("div")
      container.id = "ophel-app-container"
      shadowRoot.appendChild(container)

      const UserscriptAppRoot = () => {
        const [, forceUpdate] = React.useState(0)

        React.useEffect(
          () =>
            subscribeI18nChanges(() => {
              forceUpdate((version) => version + 1)
            }),
          [],
        )

        return React.createElement(
          OverlayPortalProvider,
          null,
          React.createElement(App, { adapter }),
        )
      }

      userscriptRoot = ReactDOM.createRoot(container)
      userscriptRoot.render(React.createElement(UserscriptAppRoot))
    } catch (error) {
      cleanupMountWatchers()
      throw error
    }
  }

  await mountUserscriptApp()
  if (cleanedUp) return

  // 等待 Zustand hydration 完成后初始化核心模块
  const { useSettingsStore, getSettingsState } = await import("~stores/settings-store")
  const { useConversationsStore } = await import("~stores/conversations-store")
  const { useFoldersStore } = await import("~stores/folders-store")
  const { useTagsStore } = await import("~stores/tags-store")
  const { usePromptsStore } = await import("~stores/prompts-store")
  const { useClaudeSessionKeysStore } = await import("~stores/claude-sessionkeys-store")
  const { useReadingHistoryStore } = await import("~stores/reading-history-store")

  // 等待所有 store hydration 完成
  const waitForHydration = (store: {
    getState: () => { _hasHydrated: boolean }
    subscribe: (fn: (state: { _hasHydrated: boolean }) => void) => () => void
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
        finish(false)
      }, 5000)
    })

    return hydrationPromise
  }

  const hydrationStores = [
    ["settings", useSettingsStore],
    ["conversations", useConversationsStore],
    ["folders", useFoldersStore],
    ["tags", useTagsStore],
    ["prompts", usePromptsStore],
    ["claudeSessionKeys", useClaudeSessionKeysStore],
    ["readingHistory", useReadingHistoryStore],
  ] as const
  const hydrationResults = await Promise.all(
    hydrationStores.map(([, store]) => waitForHydration(store)),
  )
  if (cleanedUp) return
  const timedOutStores = hydrationStores
    .filter((_, index) => !hydrationResults[index])
    .map(([name]) => name)
  if (timedOutStores.length > 0) {
    throw new Error(`Store hydration timed out: ${timedOutStores.join(", ")}`)
  }

  // 获取用户设置
  const settings = getSettingsState()
  const siteId = adapter.getSiteId()

  // ========== 初始化所有核心模块（使用共享模块） ==========
  const { destroyCoreModules, initCoreModules, subscribeModuleUpdates, initUrlChangeObserver } =
    await import("~core/modules-init")
  cleanupTasks.push(destroyCoreModules)

  const ctx = { adapter, settings, siteId }

  await initCoreModules(ctx)
  if (cleanedUp) return

  // 初始化 NetworkMonitor 消息监听器（必须显式调用以避免 tree-shaking）
  initNetworkMonitor()

  // 订阅设置变化
  const unsubscribeModuleUpdates = subscribeModuleUpdates(ctx)
  cleanupTasks.push(unsubscribeModuleUpdates)

  // 初始化 URL 变化监听 (SPA 导航)
  const cleanupUrlChangeObserver = initUrlChangeObserver(ctx)
  cleanupTasks.push(cleanupUrlChangeObserver)
}

function runInit() {
  void init().catch(async (error) => {
    activeUserscriptRuntimeCleanup?.()
    const { destroyCoreModules } = await import("~core/modules-init")
    destroyCoreModules()
    window.ophelUserscriptInitialized = false
    console.error("[Ophel] Userscript initialization failed:", error)
  })
}

// 启动：document-start 时 DOM 未就绪，需等待
// injectScrollLock() 已在上方同步执行，后续初始化延迟到 DOM 就绪
function startWhenReady() {
  if (userscriptClearCoordinator.clearPending) return
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runInit, { once: true })
  } else {
    runInit()
  }
}
startWhenReady()
