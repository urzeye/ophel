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
import { useConversationsStore } from "~stores/conversations-store"
import { useFoldersStore } from "~stores/folders-store"
import { usePromptsStore } from "~stores/prompts-store"
import { useReadingHistoryStore } from "~stores/reading-history-store"
import { getSettingsState, useSettingsStore } from "~stores/settings-store"
import { useTagsStore } from "~stores/tags-store"
import { MSG_CLEAR_ALL_DATA } from "~utils/messaging"

const resetAllStores = () => {
  useSettingsStore.getState().resetSettings()
  usePromptsStore.getState().setPrompts(getDefaultPrompts())
  useFoldersStore.setState({ folders: DEFAULT_FOLDERS })
  useTagsStore.setState({ tags: [] })
  useConversationsStore.setState({ conversations: {}, lastUsedFolderId: "inbox" })
  useReadingHistoryStore.setState({ history: {}, lastCleanupRun: 0 })
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

        if (message.type === "CHECK_IS_GENERATING") {
          // 使用 adapter 的 isGenerating 方法检测当前页面是否正在生成
          const isGenerating = adapter.isGenerating?.() ?? false
          sendResponse({ isGenerating })
          return true // 保持消息通道打开
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
