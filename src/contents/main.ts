/**
 * Chat Helper - Content Script 入口
 *
 * 多站点 AI 对话增强工具
 * 核心模块初始化入口
 */

import type { PlasmoCSConfig } from "plasmo"

import { getAdapter } from "~adapters"
import { CopyManager } from "~core/copy-manager"
import { LayoutManager } from "~core/layout-manager"
import { MarkdownFixer } from "~core/markdown-fixer"
import { ModelLocker } from "~core/model-locker"
import { ReadingHistoryManager } from "~core/reading-history"
import { ScrollLockManager } from "~core/scroll-lock-manager"
import { TabManager } from "~core/tab-manager"
import { ThemeManager } from "~core/theme-manager"
import { WatermarkRemover } from "~core/watermark-remover"
import { DEFAULT_SETTINGS, getSetting, STORAGE_KEYS } from "~utils/storage"

// Content Script 配置 - 匹配所有支持的站点
export const config: PlasmoCSConfig = {
  matches: [
    "https://gemini.google.com/*",
    "https://business.gemini.google/*",
    "https://aistudio.google.com/*",
    "https://grok.com/*",
    "https://x.com/i/grok/*",
    "https://chat.openai.com/*",
    "https://chatgpt.com/*",
    "https://claude.ai/*",
  ],
  run_at: "document_idle",
}

// 全局管理器引用 (用于热更新设置)
let copyManager: CopyManager | null = null
let layoutManager: LayoutManager | null = null
let markdownFixer: MarkdownFixer | null = null
let tabManager: TabManager | null = null
let watermarkRemover: WatermarkRemover | null = null
let readingHistoryManager: ReadingHistoryManager | null = null
let modelLocker: ModelLocker | null = null
let themeManager: ThemeManager | null = null
let scrollLockManager: ScrollLockManager | null = null

// 防止重复初始化
if (!(window as any).chatHelperInitialized) {
  ;(window as any).chatHelperInitialized = true

  const adapter = getAdapter()

  if (adapter) {
    console.log(`[Chat Helper] Loaded ${adapter.getName()} adapter on:`, window.location.hostname)

    // 初始化适配器
    adapter.afterPropertiesSet({})

    // 异步初始化所有功能模块
    ;(async () => {
      // 获取用户设置
      const settings = await getSetting(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS)

      // 1. 主题管理 (优先应用)
      themeManager = new ThemeManager(settings.themeMode)
      themeManager.apply()

      // 2. Markdown 修复 (仅 Gemini 标准版)
      if (settings.markdownFix && adapter.getSiteId() === "gemini") {
        markdownFixer = new MarkdownFixer()
        markdownFixer.start()
      }

      // 3. 页面宽度管理
      if (settings.pageWidth?.enabled) {
        layoutManager = new LayoutManager(adapter, settings.pageWidth)
        layoutManager.apply()
      }

      // 4. 复制功能 (公式/表格)
      if (settings.copy) {
        copyManager = new CopyManager(settings.copy)
        if (settings.copy.formulaCopyEnabled) {
          copyManager.initFormulaCopy()
        }
        if (settings.copy.tableCopyEnabled) {
          copyManager.initTableCopy()
        }
      }

      // 5. 标签页管理
      if (settings.tabSettings?.autoRenameTab || settings.tabSettings?.showNotification) {
        tabManager = new TabManager(adapter, settings.tabSettings)
        tabManager.start()
      }

      // 6. 水印移除 (仅 Gemini)
      if (adapter.getSiteId() === "gemini" || adapter.getSiteId() === "gemini-business") {
        watermarkRemover = new WatermarkRemover()
        watermarkRemover.start()
      }

      // 7. 阅读历史
      if (settings.readingHistory?.persistence) {
        readingHistoryManager = new ReadingHistoryManager(adapter, settings.readingHistory)
        readingHistoryManager.startRecording()

        if (settings.readingHistory.autoRestore) {
          // 使用 showToast 显示加载进度
          const { showToast } = await import("~utils/toast")
          readingHistoryManager
            .restoreProgress((msg) => showToast(msg, 3000))
            .then((restored) => {
              if (restored) {
                showToast("阅读进度已恢复", 2000)
              }
            })
        }

        readingHistoryManager.cleanup()
      }

      // 8. 模型锁定（按站点单独配置）
      const siteId = adapter.getSiteId()
      const siteModelConfig = settings.modelLockConfig?.[siteId] || { enabled: false, keyword: "" }
      modelLocker = new ModelLocker(adapter, siteModelConfig)
      if (siteModelConfig.enabled && siteModelConfig.keyword) {
        modelLocker.start()
      }

      // 监听设置变化以支持动态开关
      const { syncStorage } = await import("~utils/storage")
      syncStorage.watch({
        [STORAGE_KEYS.SETTINGS]: (change) => {
          const newSiteConfig = change.newValue?.modelLockConfig?.[siteId]
          if (newSiteConfig && modelLocker) {
            modelLocker.updateConfig(newSiteConfig)
          }
        },
      })

      // 9. 滚动锁定（始终创建以支持动态开关）
      scrollLockManager = new ScrollLockManager(adapter, settings)

      // 将 ScrollLockManager 也加入监听（复用已有的 watch）
      syncStorage.watch({
        [STORAGE_KEYS.SETTINGS]: (change) => {
          if (change.newValue && scrollLockManager) {
            scrollLockManager.updateSettings(change.newValue)
          }
        },
      })
    })()
  } else {
    console.log("[Chat Helper] No adapter found for:", window.location.hostname)
  }
}
