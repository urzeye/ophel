/**
 * Ophel - Content Script 入口
 *
 * 多站点 AI 对话增强工具
 * 核心模块初始化入口
 */

import type { PlasmoCSConfig } from "plasmo"

import { getAdapter } from "~adapters"
import { DEFAULT_FOLDERS, SITE_IDS, getDefaultPrompts } from "~constants"
import {
  initCoreModules,
  initUrlChangeObserver,
  handleClearAllData,
  subscribeModuleUpdates,
  type ModulesContext,
} from "~core/modules-init"
import { APP_DISPLAY_NAME } from "~utils/config"
import { useConversationsStore } from "~stores/conversations-store"
import { useFoldersStore } from "~stores/folders-store"
import { usePromptsStore } from "~stores/prompts-store"
import { useReadingHistoryStore } from "~stores/reading-history-store"
import { getSettingsState, useSettingsStore } from "~stores/settings-store"
import { useTagsStore } from "~stores/tags-store"
import {
  EVENT_EXTENSION_UPDATE_AVAILABLE,
  MSG_CLEAR_ALL_DATA,
  MSG_EXTENSION_UPDATE_AVAILABLE,
  MSG_RESTORE_DATA,
  MSG_START_NEW_CONVERSATION,
} from "~utils/messaging"

const resetAllStores = () => {
  useSettingsStore.getState().resetSettings()
  usePromptsStore.getState().setPrompts(getDefaultPrompts())
  useFoldersStore.setState({ folders: DEFAULT_FOLDERS })
  useTagsStore.setState({ tags: [] })
  useConversationsStore.setState({ conversations: {}, lastUsedFolderId: "inbox" })
  useReadingHistoryStore.setState({ history: {}, lastCleanupRun: 0 })
}

const OPHEL_EXTENSION_UPDATE_FALLBACK_ID = "ophel-extension-update-fallback"
const PLASMO_RUNTIME_RELOAD_PROMPT_ID = "__plasmo-loading__"
let extensionUpdateFallbackTimer: number | null = null

function getExtensionUpdateCopy(version?: string) {
  const isZh = navigator.language.toLowerCase().startsWith("zh")

  return {
    kicker: isZh ? "插件已更新" : "Extension updated",
    description: version
      ? isZh
        ? `${APP_DISPLAY_NAME} 已更新至 v${version}。刷新当前页面后即可继续使用最新版本。`
        : `${APP_DISPLAY_NAME} has been updated to v${version}. Reload this page to keep using the latest version.`
      : isZh
        ? `${APP_DISPLAY_NAME} 已更新。刷新当前页面后即可继续使用最新版本。`
        : `${APP_DISPLAY_NAME} has been updated. Reload this page to keep using the latest version.`,
    reloadLabel: isZh ? "刷新页面" : "Reload page",
    closeLabel: isZh ? "关闭" : "Close",
  }
}

function suppressPlasmoReloadPrompt(): void {
  const prompt = document.getElementById(PLASMO_RUNTIME_RELOAD_PROMPT_ID) as HTMLElement | null
  if (!prompt) return

  prompt.style.setProperty("display", "none", "important")
  prompt.style.setProperty("visibility", "hidden", "important")
  prompt.setAttribute("aria-hidden", "true")
}

function removeFallbackExtensionUpdateNotice(): void {
  if (extensionUpdateFallbackTimer !== null) {
    window.clearTimeout(extensionUpdateFallbackTimer)
    extensionUpdateFallbackTimer = null
  }

  const existingHost = document.getElementById(OPHEL_EXTENSION_UPDATE_FALLBACK_ID)
  existingHost?.remove()
}

function dispatchExtensionUpdateNotice(version?: string): void {
  window.__OPHEL_PENDING_UPDATE_VERSION__ = version || window.__OPHEL_PENDING_UPDATE_VERSION__
  window.__OPHEL_EXTENSION_UPDATE_AVAILABLE__ = true
  window.dispatchEvent(
    new CustomEvent(EVENT_EXTENSION_UPDATE_AVAILABLE, {
      detail: { version: version || window.__OPHEL_PENDING_UPDATE_VERSION__ },
    }),
  )
}

function isExtensionContextInvalidatedMessage(message: string): boolean {
  return /Extension context invalidated/i.test(message)
}

function suppressDefaultReloadPrompt(): void {
  suppressPlasmoReloadPrompt()

  const root = document.body || document.documentElement
  if (!root) return

  const candidates = Array.from(root.querySelectorAll<HTMLElement>("*")).filter((element) => {
    const text = element.textContent?.replace(/\s+/g, " ").trim()
    return Boolean(text) && /Context Invalidated/i.test(text)
  })

  candidates.forEach((candidate) => {
    let current: HTMLElement | null = candidate

    for (let depth = 0; current && depth < 6; depth += 1) {
      const style = window.getComputedStyle(current)
      const rect = current.getBoundingClientRect()
      const isLikelyPrompt =
        (style.position === "fixed" || style.position === "sticky") &&
        rect.width <= 480 &&
        rect.height <= 220 &&
        rect.bottom >= window.innerHeight - 240

      if (isLikelyPrompt) {
        current.style.setProperty("display", "none", "important")
        break
      }

      current = current.parentElement
    }
  })
}

function startSuppressingDefaultReloadPrompt(): void {
  suppressDefaultReloadPrompt()

  window.__ophelExtensionUpdatePromptObserver?.disconnect()

  const observer = new MutationObserver(() => {
    suppressDefaultReloadPrompt()
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })

  window.__ophelExtensionUpdatePromptObserver = observer

  window.setTimeout(() => {
    if (window.__ophelExtensionUpdatePromptObserver === observer) {
      observer.disconnect()
      window.__ophelExtensionUpdatePromptObserver = null
    }
  }, 12000)
}

function renderFallbackExtensionUpdateNotice(version?: string): void {
  const copy = getExtensionUpdateCopy(version || window.__OPHEL_PENDING_UPDATE_VERSION__)
  removeFallbackExtensionUpdateNotice()

  const host = document.createElement("div")
  host.id = OPHEL_EXTENSION_UPDATE_FALLBACK_ID
  host.style.cssText = [
    "position: fixed",
    "right: 24px",
    "bottom: 24px",
    "z-index: 2147483647",
    "pointer-events: auto",
  ].join(";")

  const shadowRoot = host.attachShadow({ mode: "open" })
  shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
      }
      .ophel-update-card {
        width: min(380px, calc(100vw - 32px));
        border-radius: 20px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.15), 0 0 0 1.5px inset rgba(255, 255, 255, 0.5);
        color: #111827;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        padding: 20px 24px;
        position: relative;
        overflow: hidden;
        animation: ophel-update-notice-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .ophel-update-card::before {
        content: "";
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        background: radial-gradient(circle at top right, rgba(37, 99, 235, 0.15), transparent 50%),
                    radial-gradient(circle at bottom left, rgba(168, 85, 247, 0.08), transparent 40%);
        pointer-events: none;
        z-index: -1;
      }
      .ophel-update-kicker {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #2563eb;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.02em;
        margin-bottom: 8px;
      }
      .ophel-update-icon {
        width: 16px;
        height: 16px;
        color: #2563eb;
        animation: ophel-update-icon-pulse 2s infinite ease-in-out;
      }
      @keyframes ophel-update-icon-pulse {
        0%, 100% { transform: scale(1) rotate(0deg); opacity: 1; }
        50% { transform: scale(1.1) rotate(5deg); opacity: 0.8; }
      }
      .ophel-update-message {
        color: #374151;
        font-size: 14px;
        line-height: 1.6;
        margin: 0 0 18px;
        padding-right: 28px;
      }
      .ophel-update-actions {
        display: flex;
        justify-content: flex-end;
      }
      .ophel-update-button {
        appearance: none;
        border: none;
        border-radius: 12px;
        background: #2563eb;
        box-shadow: 0 8px 20px -6px rgba(37, 99, 235, 0.6);
        color: #ffffff;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        padding: 10px 18px;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        position: relative;
        overflow: hidden;
      }
      .ophel-update-button::after {
        content: '';
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        background: linear-gradient(rgba(255,255,255,0.1), transparent);
        opacity: 0;
        transition: opacity 0.2s;
      }
      .ophel-update-button:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 12px 28px -6px rgba(37, 99, 235, 0.8);
      }
      .ophel-update-button:hover::after {
        opacity: 1;
      }
      .ophel-update-close {
        position: absolute;
        top: 16px;
        right: 16px;
        appearance: none;
        border: none;
        outline: none;
        background: rgba(107, 114, 128, 0.1);
        color: #6b7280;
        cursor: pointer;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        line-height: 1;
        padding: 0;
        transition: all 0.2s;
      }
      .ophel-update-close:hover {
        background: rgba(107, 114, 128, 0.2);
        color: #111827;
        transform: rotate(90deg);
      }
      @keyframes ophel-update-notice-enter {
        0% { opacity: 0; transform: translateY(20px) scale(0.95); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
    </style>
    <section class="ophel-update-card" role="status" aria-live="polite">
      <button class="ophel-update-close" type="button" aria-label="${copy.closeLabel}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
        </svg>
      </button>
      <div class="ophel-update-kicker">
        <svg class="ophel-update-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
        </svg>
        ${copy.kicker}
      </div>
      <p class="ophel-update-message">${copy.description.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
      <div class="ophel-update-actions">
        <button class="ophel-update-button" type="button">${copy.reloadLabel}</button>
      </div>
    </section>
  `

  shadowRoot
    .querySelector<HTMLButtonElement>(".ophel-update-button")
    ?.addEventListener("click", () => {
      window.location.reload()
    })

  shadowRoot
    .querySelector<HTMLButtonElement>(".ophel-update-close")
    ?.addEventListener("click", () => {
      removeFallbackExtensionUpdateNotice()
    })
  ;(document.body || document.documentElement).appendChild(host)
}

function scheduleFallbackExtensionUpdateNotice(version?: string): void {
  removeFallbackExtensionUpdateNotice()

  extensionUpdateFallbackTimer = window.setTimeout(() => {
    extensionUpdateFallbackTimer = null

    const hasPrimaryNotice =
      window.__OPHEL_EXTENSION_UPDATE_NOTICE_ACTIVE__ ||
      Boolean(document.querySelector(".gh-update-notice"))

    if (hasPrimaryNotice || document.getElementById(OPHEL_EXTENSION_UPDATE_FALLBACK_ID)) {
      return
    }

    renderFallbackExtensionUpdateNotice(version)
  }, 600)
}

function handleExtensionContextInvalidated(message: string): void {
  if (!isExtensionContextInvalidatedMessage(message)) return

  dispatchExtensionUpdateNotice()
  startSuppressingDefaultReloadPrompt()
  scheduleFallbackExtensionUpdateNotice()
}

if (!window.__ophelExtensionUpdateGuardsInstalled) {
  window.__ophelExtensionUpdateGuardsInstalled = true

  suppressPlasmoReloadPrompt()

  const promptObserver = new MutationObserver(() => {
    suppressPlasmoReloadPrompt()
  })
  promptObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })

  window.addEventListener(
    "error",
    (event) => {
      const message =
        event.error instanceof Error
          ? event.error.message
          : typeof event.message === "string"
            ? event.message
            : ""

      if (!isExtensionContextInvalidatedMessage(message)) return

      handleExtensionContextInvalidated(message)
      event.preventDefault()
      event.stopImmediatePropagation()
    },
    true,
  )

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      const reason = event.reason
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : String(reason ?? "")

      if (!isExtensionContextInvalidatedMessage(message)) return

      handleExtensionContextInvalidated(message)
      event.preventDefault()
      event.stopImmediatePropagation()
    },
    true,
  )
}

if (!window.__ophelExtensionUpdateMessageListenerInstalled && typeof chrome !== "undefined") {
  window.__ophelExtensionUpdateMessageListenerInstalled = true

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MSG_EXTENSION_UPDATE_AVAILABLE) {
      return false
    }

    dispatchExtensionUpdateNotice(message.version)
    startSuppressingDefaultReloadPrompt()
    sendResponse({ success: true })
    return true
  })
}

// Content Script 配置 - 匹配所有支持的站点
export const config: PlasmoCSConfig = {
  matches: [
    "https://gemini.google.com/*",
    "https://business.gemini.google/*",
    "https://aistudio.google.com/*",
    "https://grok.com/*",
    "https://chat.openai.com/*",
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://www.doubao.com/*",
    "https://ima.qq.com/*",
    "https://chat.deepseek.com/*",
    "https://www.kimi.com/*",
    "https://chatglm.cn/*",
    "https://chat.qwen.ai/*",
    "https://www.qianwen.com/*",
    "https://qianwen.com/*",
    "https://yuanbao.tencent.com/*",
    "https://chat.z.ai/*",
  ],
  run_at: "document_idle",
}

// 防止重复初始化
if (!window.ophelInitialized) {
  window.ophelInitialized = true

  const adapter = getAdapter()

  if (adapter) {
    console.warn(`[Ophel] Loaded ${adapter.getName()} adapter on:`, window.location.hostname)

    // 初始化适配器
    adapter.afterPropertiesSet({})

    // 异步初始化所有功能模块
    ;(async () => {
      // 等待 Zustand hydration 完成
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

      // 创建模块上下文
      const ctx: ModulesContext = { adapter, settings, siteId }

      // 初始化所有核心模块
      await initCoreModules(ctx)

      // 订阅设置变化
      subscribeModuleUpdates(ctx)

      // 初始化 URL 变化监听
      initUrlChangeObserver(ctx)

      // 监听来自 background 的消息（用于跨页面检测生成状态）
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.type === MSG_CLEAR_ALL_DATA) {
          handleClearAllData()
          resetAllStores()
          sendResponse({ success: true })
          return true
        }

        if (message.type === MSG_RESTORE_DATA) {
          // 收到恢复数据的广播时，刷新页面使得数据从 Storage 重新读取并保证 Zustand hydration 最新的内容
          window.location.reload()
          sendResponse({ success: true })
          return true
        }

        if (message.type === "CHECK_IS_GENERATING") {
          // 使用 adapter 的 isGenerating 方法检测当前页面是否正在生成
          const isGenerating = adapter.isGenerating?.() ?? false
          sendResponse({ isGenerating })
          return true // 保持消息通道打开
        }

        if (message.type === MSG_START_NEW_CONVERSATION) {
          try {
            const success = adapter.startNewConversation()
            sendResponse({ success })
          } catch (err) {
            console.error("[Ophel] startNewConversation failed:", err)
            sendResponse({ success: false, error: (err as Error).message })
          }
          return true
        }

        // AI Studio 获取模型列表
        if (message.type === "GET_MODEL_LIST") {
          // 检查是否是 AI Studio 适配器且有 getModelList 方法
          if (siteId === SITE_IDS.AISTUDIO && typeof (adapter as any).getModelList === "function") {
            ;(async () => {
              try {
                const models = await (adapter as any).getModelList()
                sendResponse({ success: true, models })
              } catch (err) {
                console.error("[Ophel] getModelList failed:", err)
                sendResponse({ success: false, error: (err as Error).message })
              }
            })()
            return true // 保持消息通道打开
          } else {
            sendResponse({ success: false, error: "NOT_AISTUDIO" })
            return true
          }
        }

        return false
      })
    })()
  } else {
    console.warn("[Ophel] No adapter found for:", window.location.hostname)
  }
}
