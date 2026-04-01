/**
 * 全局类型声明
 * 为 window 对象上的自定义属性提供类型支持
 */

import type { ThemeManager } from "~core/theme-manager"

declare global {
  interface Window {
    /** Ophel 初始化标记 */
    ophelInitialized?: boolean
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
    /** iframe 滚动初始化标记 */
    __ophelIframeScrollInitialized?: boolean
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
  }
}

export {}
