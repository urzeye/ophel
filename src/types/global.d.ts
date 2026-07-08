/**
 * 全局类型声明
 * 为 window 对象上的自定义属性提供类型支持
 */

import type { ThemeManager } from "~core/theme-manager"

declare global {
  interface OphelPendingPromptVariableDialogDetail {
    promptId?: string
    submitAfterInsert?: boolean
  }

  interface OphelPendingLocatePromptDetail {
    promptId?: string
  }

  interface Window {
    /** Ophel 初始化标记 */
    ophelInitialized?: boolean
    /** userscript 初始化标记 */
    ophelUserscriptInitialized?: boolean
    /** 全局 ThemeManager 实例 */
    __ophelThemeManager?: ThemeManager
    /** 滚动锁定初始化标记 */
    __ophelScrollLockInitialized?: boolean
    /** 滚动锁定是否启用 */
    __ophelScrollLockEnabled?: boolean
    /** Mermaid 页面内 runner 初始化标记 */
    __ophelAssistantMermaidRunnerReady?: boolean
    /** 原始滚动 API 备份 */
    __ophelOriginalApis?: {
      scrollIntoView: typeof Element.prototype.scrollIntoView
      scrollTo: typeof window.scrollTo
    }
    /** Gemini 水印主世界 fetch 劫持初始化标记 */
    __ophelGeminiWatermarkMainInitialized?: boolean
    /** iframe 滚动初始化标记 */
    __ophelIframeScrollInitialized?: boolean
    /** 油猴脚本主世界 window 代理（仅 userscript 环境存在） */
    unsafeWindow?: Window & typeof globalThis
    /** Gemini Canvas 主世界桥接初始化标记 */
    __ophelGeminiCanvasMainInitialized?: boolean
    /** Yuanbao Monaco 自动换行初始化标记 */
    __ophelYuanbaoMonacoWrapInitialized?: boolean
    /** userscript 注入的 Markdown 预览样式资源 */
    __OPHEL_MARKDOWN_PREVIEW_STYLES__?: string
    /** userscript 注入的通知音效资源 */
    __OPHEL_NOTIFICATION_SOUND_URLS__?: Record<string, string>
    /** userscript 注入的站点图标资源 */
    __OPHEL_SITE_ICONS__?: Record<string, string>
    /** userscript 注入的用户提问 Markdown 样式资源 */
    __OPHEL_USER_QUERY_MARKDOWN_STYLES__?: string
    /** userscript 注入的通用资源 URL */
    __OPHEL_USERSCRIPT_ASSET_URLS__?: Record<string, string>
    /** 待提示的扩展更新版本 */
    __OPHEL_PENDING_UPDATE_VERSION__?: string
    /** 页面内是否存在待处理的扩展更新 */
    __OPHEL_EXTENSION_UPDATE_AVAILABLE__?: boolean
    /** React / fallback 更新提示是否已显示 */
    __OPHEL_EXTENSION_UPDATE_NOTICE_ACTIVE__?: boolean
    /** 扩展更新失效兜底是否已安装 */
    __ophelExtensionUpdateGuardsInstalled?: boolean
    /** 扩展更新消息监听器是否已注册 */
    __ophelExtensionUpdateMessageListenerInstalled?: boolean
    /** 默认 reload 提示抑制观察器 */
    __ophelExtensionUpdatePromptObserver?: MutationObserver | null
    /** 用户是否已主动关闭过更新提示（关闭后不再重复弹出） */
    __OPHEL_EXTENSION_UPDATE_DISMISSED__?: boolean
    /** 待处理的 Prompt 变量对话框打开请求 */
    __ophelPendingPromptVariableDialog?: OphelPendingPromptVariableDialogDetail | null
    /** 待处理的 Prompt 定位请求 */
    __ophelPendingLocatePrompt?: OphelPendingLocatePromptDetail | null
    /** 待处理的大纲当前定位请求 */
    __ophelPendingLocateOutline?: boolean
    /** 待处理的大纲搜索聚焦请求 */
    __ophelPendingSearchOutline?: boolean
    /** 待处理的会话定位请求 */
    __ophelPendingLocateConversation?: boolean
    /** Tooltip：window.focus 监听器是否已注册（防 HMR 重复注册） */
    __ophelTooltipWindowFocusListenerRegistered__?: boolean
    /** Tooltip：当前是否处于"标签/窗口切回焦点恢复"抑制期 */
    __ophelTooltipSuppressFocusFromWindowRestoration__?: boolean
  }
}

export {}
