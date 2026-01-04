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
if (!window.chatHelperInitialized) {
  window.chatHelperInitialized = true

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
      // ⭐ 创建全局唯一的 ThemeManager 实例，挂载到 window 供 App.tsx 使用
      themeManager = new ThemeManager(
        settings.themeMode,
        undefined, // onModeChange callback - 由 App.tsx 动态注册
        adapter, // adapter 引用
        settings.themePresets?.lightPresetId || "google-gradient",
        settings.themePresets?.darkPresetId || "classic-dark",
      )
      themeManager.apply()
      // 挂载到 window 对象，供 App.tsx 获取
      window.__ghThemeManager = themeManager

      // ⭐ 同步页面原生主题与settings
      // 恢复备份后,面板主题会正确应用,但Gemini页面本身的主题可能不一致
      // 需要检测当前页面主题,如果与settings不一致则同步
      const syncPageTheme = async () => {
        const targetTheme = settings.themeMode === "dark" ? "dark" : "light"

        // 检测页面实际的主题状态
        const bodyClass = document.body.className
        const hasDarkClass = /\bdark-theme\b/i.test(bodyClass)
        const pageColorScheme = document.body.style.colorScheme

        // 判断页面实际主题
        let actualPageTheme: "light" | "dark" = "light"
        if (hasDarkClass || pageColorScheme === "dark") {
          actualPageTheme = "dark"
        }

        // 如果不一致，需要同步主题
        if (actualPageTheme !== targetTheme) {
          // 1. 先用 themeManager.apply() 快速应用主题（Gemini 标准版生效）
          if (themeManager) {
            themeManager.apply(targetTheme)
          }

          // 2. 再调用 adapter.toggleTheme()（Gemini Enterprise 需要模拟点击）
          // adapter.toggleTheme 对标准版返回 false 不会有副作用
          if (adapter && typeof adapter.toggleTheme === "function") {
            await adapter.toggleTheme(targetTheme)
          }
        }
      }

      // 延迟执行同步,等待页面UI就绪
      setTimeout(syncPageTheme, 1000)

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
      if (adapter.getSiteId() === "gemini" || adapter.getSiteId() === "gemini-enterprise") {
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

      // 9. 滚动锁定（始终创建以支持动态开关）
      scrollLockManager = new ScrollLockManager(adapter, settings)

      // 监听设置变化以支持动态开关 (合并所有模块的监听)
      const { localStorage } = await import("~utils/storage")
      localStorage.watch({
        [STORAGE_KEYS.SETTINGS]: (change) => {
          const newSettings = change.newValue

          // 1. Theme Manager - 只更新主题预置，不处理 themeMode 变化
          // ⭐ 不再调用 updateMode()，因为主题切换由 App.tsx 的 toggle() 统一处理
          // 这样可以避免绕过 View Transition 动画直接应用主题
          if (newSettings?.themePresets && themeManager) {
            themeManager.setPresets(
              newSettings.themePresets.lightPresetId || "google-gradient",
              newSettings.themePresets.darkPresetId || "classic-dark",
            )
          }

          // 2. Model Locker update
          const newSiteConfig = newSettings?.modelLockConfig?.[siteId]
          if (newSiteConfig && modelLocker) {
            modelLocker.updateConfig(newSiteConfig)
          }

          // 3. Scroll Lock update
          if (newSettings && scrollLockManager) {
            scrollLockManager.updateSettings(newSettings)
          }

          // 4. Markdown Fix update
          if (newSettings && adapter.getSiteId() === "gemini") {
            if (newSettings.markdownFix) {
              if (!markdownFixer) {
                markdownFixer = new MarkdownFixer()
              }
              markdownFixer.start()
            } else {
              markdownFixer?.stop()
            }
          }

          // 5. Layout Manager update
          const newPageWidth = newSettings?.pageWidth
          if (newPageWidth) {
            if (layoutManager) {
              layoutManager.updateConfig(newPageWidth)
            } else if (newPageWidth.enabled) {
              layoutManager = new LayoutManager(adapter, newPageWidth)
              layoutManager.apply()
            }
          }

          // 6. Watermark Remover update
          if (
            newSettings &&
            (adapter.getSiteId() === "gemini" || adapter.getSiteId() === "gemini-enterprise")
          ) {
            if (newSettings.watermarkRemoval) {
              if (!watermarkRemover) {
                watermarkRemover = new WatermarkRemover()
              }
              watermarkRemover.start()
            } else {
              watermarkRemover?.stop()
            }
          }

          // 7. Tab Manager update
          if (newSettings?.tabSettings) {
            if (tabManager) {
              tabManager.updateSettings(newSettings.tabSettings)
            } else if (
              newSettings.tabSettings.autoRenameTab ||
              newSettings.tabSettings.showNotification
            ) {
              tabManager = new TabManager(adapter, newSettings.tabSettings)
              tabManager.start()
            }
          }

          // 8. Reading History update
          if (newSettings?.readingHistory) {
            if (readingHistoryManager) {
              readingHistoryManager.updateSettings(newSettings.readingHistory)
            } else if (newSettings.readingHistory.persistence) {
              readingHistoryManager = new ReadingHistoryManager(adapter, newSettings.readingHistory)
              readingHistoryManager.startRecording()
            }
          }

          // 9. Copy Manager update
          if (newSettings?.copy) {
            if (copyManager) {
              copyManager.updateSettings(newSettings.copy)
            } else {
              copyManager = new CopyManager(newSettings.copy)
              // 首次创建需收到初始化 (因为 Constructor 不会自动 Init)
              if (newSettings.copy.formulaCopyEnabled) copyManager.initFormulaCopy()
              if (newSettings.copy.tableCopyEnabled) copyManager.initTableCopy()
            }
          }
        },
      })
    })()
  } else {
    console.log("[Chat Helper] No adapter found for:", window.location.hostname)
  }
}
