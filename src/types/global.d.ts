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
  }
}

export {}
