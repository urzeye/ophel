/**
 * 共享模块初始化逻辑
 *
 * 抽取自 contents/main.ts, 供浏览器扩展和油猴脚本复用
 * 避免代码重复维护
 */

import type { SiteAdapter } from "~adapters/base"
import { SITE_IDS } from "~constants"
import { CopyManager } from "~core/copy-manager"
import { LayoutManager } from "~core/layout-manager"
import {
  AISTUDIO_MARKDOWN_FIXER_CONFIG,
  GEMINI_MARKDOWN_FIXER_CONFIG,
  MarkdownFixer,
} from "~core/markdown-fixer"
import { ModelLocker } from "~core/model-locker"
import { PolicyRetryManager } from "~core/policy-retry-manager"
import { ReadingHistoryManager } from "~core/reading-history"
import { ScrollLockManager } from "~core/scroll-lock-manager"
import { TabManager } from "~core/tab-manager"
import { ThemeManager } from "~core/theme-manager"
import { UserQueryMarkdownRenderer } from "~core/user-query-markdown"
import { WatermarkRemover } from "~core/watermark-remover"
import { subscribeSettings } from "~stores/settings-store"
import {
  getSiteModelLock,
  getSitePageWidth,
  getSiteTheme,
  getSiteUserQueryWidth,
  type Settings,
} from "~utils/storage"

/**
 * 模块初始化上下文
 */
export interface ModulesContext {
  adapter: SiteAdapter
  settings: Settings
  siteId: string
}

/**
 * 模块管理器实例集合
 */
export interface ModuleInstances {
  themeManager: ThemeManager | null
  copyManager: CopyManager | null
  layoutManager: LayoutManager | null
  markdownFixer: MarkdownFixer | null
  tabManager: TabManager | null
  watermarkRemover: WatermarkRemover | null
  readingHistoryManager: ReadingHistoryManager | null
  modelLocker: ModelLocker | null
  scrollLockManager: ScrollLockManager | null
  userQueryMarkdownRenderer: UserQueryMarkdownRenderer | null
  policyRetryManager: PolicyRetryManager | null
}

// 全局模块实例（用于设置变更时的热更新）
let modules: ModuleInstances = {
  themeManager: null,
  copyManager: null,
  layoutManager: null,
  markdownFixer: null,
  tabManager: null,
  watermarkRemover: null,
  readingHistoryManager: null,
  modelLocker: null,
  scrollLockManager: null,
  userQueryMarkdownRenderer: null,
  policyRetryManager: null,
}

/**
 * 初始化主题管理器
 */
export function initThemeManager(ctx: ModulesContext): ThemeManager {
  const { adapter, settings, siteId } = ctx
  const siteTheme = getSiteTheme(settings, siteId)

  const themeManager = new ThemeManager(
    siteTheme.mode,
    undefined, // onModeChange callback - 由 App.tsx 动态注册
    adapter,
    siteTheme.lightStyleId || "google-gradient",
    siteTheme.darkStyleId || "classic-dark",
  )
  themeManager.apply()

  // 挂载到 window 对象，供 App.tsx 获取
  window.__ophelThemeManager = themeManager
  modules.themeManager = themeManager

  return themeManager
}

/**
 * 同步页面原生主题与 settings
 * (恢复备份后，面板主题会正确应用，但页面本身的主题可能不一致)
 */
export async function syncPageTheme(ctx: ModulesContext): Promise<void> {
  const { adapter, settings, siteId } = ctx
  const siteTheme = getSiteTheme(settings, siteId)
  const targetTheme = siteTheme.mode === "dark" ? "dark" : "light"

  // 检测页面实际的主题状态
  const htmlClass = document.documentElement.className
  const htmlHasDark = /\bdark\b/i.test(htmlClass)
  const htmlHasLight = /\blight\b/i.test(htmlClass)
  const bodyClass = document.body.className
  const bodyHasDarkTheme = /\bdark-theme\b/i.test(bodyClass)
  const pageColorScheme = document.body.style.colorScheme

  // 判断页面实际主题
  let actualPageTheme: "light" | "dark" = "light"
  if (htmlHasDark || bodyHasDarkTheme || pageColorScheme === "dark") {
    actualPageTheme = "dark"
  } else if (htmlHasLight) {
    actualPageTheme = "light"
  }

  // 如果不一致，需要同步主题
  if (actualPageTheme !== targetTheme) {
    if (modules.themeManager) {
      modules.themeManager.apply(targetTheme)
    }
    if (adapter && typeof adapter.toggleTheme === "function") {
      await adapter.toggleTheme(targetTheme)
    }
  }
}

/**
 * 初始化 Markdown 修复器
 */
export function initMarkdownFixer(ctx: ModulesContext): void {
  const { settings, siteId } = ctx

  if (siteId === SITE_IDS.GEMINI && settings.content?.markdownFix) {
    modules.markdownFixer = new MarkdownFixer(GEMINI_MARKDOWN_FIXER_CONFIG)
    modules.markdownFixer.start()
    console.log("[Ophel] MarkdownFixer started for Gemini")
  } else if (siteId === SITE_IDS.AISTUDIO && settings.aistudio?.markdownFix) {
    modules.markdownFixer = new MarkdownFixer(AISTUDIO_MARKDOWN_FIXER_CONFIG)
    modules.markdownFixer.start()
    console.log("[Ophel] MarkdownFixer started for AI Studio")
  }
}

/**
 * 初始化布局管理器
 */
export function initLayoutManager(ctx: ModulesContext): void {
  const { adapter, settings, siteId } = ctx
  const sitePageWidth = getSitePageWidth(settings, siteId)
  const siteUserQueryWidth = getSiteUserQueryWidth(settings, siteId)

  if (sitePageWidth?.enabled || siteUserQueryWidth?.enabled) {
    modules.layoutManager = new LayoutManager(adapter, sitePageWidth)
    if (sitePageWidth?.enabled) modules.layoutManager.apply()
    if (siteUserQueryWidth?.enabled) modules.layoutManager.updateUserQueryConfig(siteUserQueryWidth)
  }
}

/**
 * 初始化复制管理器
 */
export function initCopyManager(ctx: ModulesContext): void {
  const { adapter, settings } = ctx

  if (settings.content) {
    modules.copyManager = new CopyManager(settings.content, adapter)
    if (settings.content.formulaCopy) {
      modules.copyManager.initFormulaCopy()
    }
    if (settings.content.tableCopy) {
      modules.copyManager.initTableCopy()
    }
  }
}

/**
 * 初始化标签页管理器
 */
export function initTabManager(ctx: ModulesContext): void {
  const { adapter, settings } = ctx

  // 始终初始化 TabManager，以便支持隐私模式切换和其他不需要 autoRename 的功能
  if (settings.tab) {
    modules.tabManager = new TabManager(adapter, settings.tab)
    modules.tabManager.start()
  }
}

/**
 * 初始化水印移除器 (仅 Gemini)
 */
export function initWatermarkRemover(ctx: ModulesContext): void {
  const { settings, siteId } = ctx

  if (
    (siteId === SITE_IDS.GEMINI || siteId === SITE_IDS.GEMINI_ENTERPRISE) &&
    settings.content?.watermarkRemoval
  ) {
    modules.watermarkRemover = new WatermarkRemover()
    modules.watermarkRemover.start()
  }
}

/**
 * 初始化阅读历史管理器
 */
export async function initReadingHistoryManager(ctx: ModulesContext): Promise<void> {
  const { adapter, settings } = ctx

  if (settings.readingHistory?.persistence) {
    modules.readingHistoryManager = new ReadingHistoryManager(adapter, settings.readingHistory)
    modules.readingHistoryManager.startRecording()

    if (settings.readingHistory.autoRestore) {
      const { showToast } = await import("~utils/toast")
      modules.readingHistoryManager
        .restoreProgress((msg) => showToast(msg, 3000))
        .then((restored) => {
          if (restored) {
            showToast("阅读进度已恢复", 2000)
          }
        })
    }

    modules.readingHistoryManager.cleanup()
  }
}

/**
 * 初始化模型锁定器
 */
export function initModelLocker(ctx: ModulesContext): void {
  const { adapter, settings, siteId } = ctx
  const siteModelConfig = getSiteModelLock(settings, siteId)

  modules.modelLocker = new ModelLocker(adapter, siteModelConfig)
  if (siteModelConfig.enabled && siteModelConfig.keyword) {
    modules.modelLocker.start()
  }
}

/**
 * 初始化滚动锁定管理器
 */
export function initScrollLockManager(ctx: ModulesContext): void {
  const { adapter, settings } = ctx
  modules.scrollLockManager = new ScrollLockManager(adapter, settings)
}

/**
 * 初始化用户提问 Markdown 渲染器
 */
export function initUserQueryMarkdownRenderer(ctx: ModulesContext): void {
  const { adapter, settings } = ctx
  modules.userQueryMarkdownRenderer = new UserQueryMarkdownRenderer(
    adapter,
    settings.content?.userQueryMarkdown ?? false,
  )
}

/**
 * 初始化所有核心模块
 */
export async function initCoreModules(ctx: ModulesContext): Promise<ModuleInstances> {
  // 1. 主题管理 (优先应用)
  initThemeManager(ctx)

  // 延迟同步页面主题
  setTimeout(() => syncPageTheme(ctx), 1000)

  // 2. Markdown 修复
  initMarkdownFixer(ctx)

  // 3. 页面宽度管理
  initLayoutManager(ctx)

  // 4. 复制功能
  initCopyManager(ctx)

  // 5. 标签页管理
  initTabManager(ctx)

  // 6. 水印移除
  initWatermarkRemover(ctx)

  // 7. 阅读历史
  await initReadingHistoryManager(ctx)

  // 8. 模型锁定
  initModelLocker(ctx)

  // 9. 滚动锁定
  initScrollLockManager(ctx)

  // 10. 用户提问 Markdown 渲染
  initUserQueryMarkdownRenderer(ctx)

  // 11. Policy Retry Manager
  initPolicyRetryManager(ctx)

  return modules
}

/**
 * 初始化 Policy Retry Manager
 */
export function initPolicyRetryManager(ctx: ModulesContext): void {
  const { adapter, settings, siteId } = ctx
  if (siteId === SITE_IDS.GEMINI_ENTERPRISE) {
    modules.policyRetryManager = new PolicyRetryManager(
      adapter,
      settings.geminiEnterprise?.policyRetry || { enabled: false, maxRetries: 3 },
    )
  }
}

/**
 * 订阅设置变化，动态更新模块
 */
export function subscribeModuleUpdates(ctx: ModulesContext): void {
  const { adapter, siteId } = ctx

  subscribeSettings((newSettings: Settings) => {
    // 1. Theme Manager - 只更新主题预置
    const newSiteTheme = getSiteTheme(newSettings, siteId)
    if (newSiteTheme && modules.themeManager) {
      modules.themeManager.setPresets(
        newSiteTheme.lightStyleId || "google-gradient",
        newSiteTheme.darkStyleId || "classic-dark",
      )
    }

    // 2. Model Locker update
    const newModelConfig = getSiteModelLock(newSettings, siteId)
    if (newModelConfig && modules.modelLocker) {
      modules.modelLocker.updateConfig(newModelConfig)
    }

    // 3. Scroll Lock update
    if (newSettings && modules.scrollLockManager) {
      modules.scrollLockManager.updateSettings(newSettings)
    }

    // 4. Markdown Fix update
    if (newSettings && siteId === SITE_IDS.GEMINI) {
      if (newSettings.content?.markdownFix) {
        if (!modules.markdownFixer) {
          modules.markdownFixer = new MarkdownFixer(GEMINI_MARKDOWN_FIXER_CONFIG)
        }
        modules.markdownFixer.start()
      } else {
        modules.markdownFixer?.stop()
      }
    } else if (newSettings && siteId === SITE_IDS.AISTUDIO) {
      if (newSettings.aistudio?.markdownFix) {
        if (!modules.markdownFixer) {
          modules.markdownFixer = new MarkdownFixer(AISTUDIO_MARKDOWN_FIXER_CONFIG)
        }
        modules.markdownFixer.start()
      } else {
        modules.markdownFixer?.stop()
      }
    }

    // 5. Layout Manager update
    const newSitePageWidth = getSitePageWidth(newSettings, siteId)
    const newUserQueryWidth = getSiteUserQueryWidth(newSettings, siteId)

    if (modules.layoutManager) {
      modules.layoutManager.updateConfig(newSitePageWidth)
      modules.layoutManager.updateUserQueryConfig(newUserQueryWidth)
    } else if (newSitePageWidth?.enabled || newUserQueryWidth?.enabled) {
      modules.layoutManager = new LayoutManager(adapter, newSitePageWidth)
      if (newSitePageWidth?.enabled) modules.layoutManager.apply()
      if (newUserQueryWidth?.enabled) modules.layoutManager.updateUserQueryConfig(newUserQueryWidth)
    }

    // 6. Watermark Remover update
    if (newSettings && (siteId === SITE_IDS.GEMINI || siteId === SITE_IDS.GEMINI_ENTERPRISE)) {
      if (newSettings.content?.watermarkRemoval) {
        if (!modules.watermarkRemover) {
          modules.watermarkRemover = new WatermarkRemover()
        }
        modules.watermarkRemover.start()
      } else {
        modules.watermarkRemover?.stop()
      }
    }

    // 7. Tab Manager update
    if (newSettings?.tab) {
      if (modules.tabManager) {
        modules.tabManager.updateSettings(newSettings.tab)
      } else {
        modules.tabManager = new TabManager(adapter, newSettings.tab)
        modules.tabManager.start()
      }
    }

    // 8. Reading History update
    if (newSettings?.readingHistory) {
      if (modules.readingHistoryManager) {
        modules.readingHistoryManager.updateSettings(newSettings.readingHistory)
      } else if (newSettings.readingHistory.persistence) {
        modules.readingHistoryManager = new ReadingHistoryManager(
          adapter,
          newSettings.readingHistory,
        )
        modules.readingHistoryManager.startRecording()
      }
    }

    // 9. Copy Manager update
    if (newSettings?.content) {
      if (modules.copyManager) {
        modules.copyManager.updateSettings(newSettings.content)
      } else {
        modules.copyManager = new CopyManager(newSettings.content)
        if (newSettings.content.formulaCopy) modules.copyManager.initFormulaCopy()
        if (newSettings.content.tableCopy) modules.copyManager.initTableCopy()
      }

      // 10. User Query Markdown Renderer update
      if (newSettings.content.userQueryMarkdown) {
        if (modules.userQueryMarkdownRenderer) {
          modules.userQueryMarkdownRenderer.updateSettings(true)
        } else {
          modules.userQueryMarkdownRenderer = new UserQueryMarkdownRenderer(adapter, true)
        }
      } else {
        modules.userQueryMarkdownRenderer?.updateSettings(false)
      }
    }

    // 11. Policy Retry Manager update
    if (
      newSettings?.geminiEnterprise &&
      siteId === SITE_IDS.GEMINI_ENTERPRISE &&
      modules.policyRetryManager
    ) {
      modules.policyRetryManager.updateSettings(
        newSettings.geminiEnterprise?.policyRetry || { enabled: false, maxRetries: 3 },
      )
    }
  })
}

/**
 * 初始化 URL 变化监听 (SPA 导航)
 */
export function initUrlChangeObserver(ctx: ModulesContext): void {
  const { adapter } = ctx

  let lastPathname = window.location.pathname
  let readingHistoryRestoreTimeoutId: ReturnType<typeof setTimeout> | null = null

  const handleUrlChange = async () => {
    const currentPathname = window.location.pathname
    if (currentPathname !== lastPathname) {
      lastPathname = currentPathname
      console.log("[Ophel] URL changed, reinitializing modules...")

      // 1. 阅读历史：停止录制 → 延迟恢复并重启
      if (readingHistoryRestoreTimeoutId) {
        clearTimeout(readingHistoryRestoreTimeoutId)
        readingHistoryRestoreTimeoutId = null
      }

      if (modules.readingHistoryManager) {
        modules.readingHistoryManager.stopRecording()
        readingHistoryRestoreTimeoutId = setTimeout(async () => {
          readingHistoryRestoreTimeoutId = null
          const { showToast } = await import("~utils/toast")
          const restored = await modules.readingHistoryManager?.restoreProgress((msg) =>
            showToast(msg, 3000),
          )
          if (restored) {
            showToast("阅读进度已恢复", 2000)
          }
          modules.readingHistoryManager?.startRecording()
        }, 1500)
      }

      // 2. 大纲刷新 - 通过全局事件通知 App.tsx
      window.dispatchEvent(new Event("gh-url-change"))

      // 3. 标签页标题更新
      if (modules.tabManager) {
        modules.tabManager.resetSessionCache()
        ;[300, 800, 1500].forEach((delay) =>
          setTimeout(() => modules.tabManager?.updateTabName(true), delay),
        )
      }

      // 4. Textarea 重新查找
      adapter.findTextarea()
    }
  }

  // 监听 popstate (后退/前进)
  window.addEventListener("popstate", handleUrlChange)

  // Monkey-patch pushState / replaceState
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState
  history.pushState = function (...args) {
    originalPushState.apply(this, args as any)
    handleUrlChange()
  }
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args as any)
    handleUrlChange()
  }

  // 兜底定时器
  setInterval(handleUrlChange, 1000)
}

/**
 * 获取当前模块实例
 */
export function getModuleInstances(): ModuleInstances {
  return modules
}
