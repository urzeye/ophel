/// <reference types="vite/client" />
/// <reference types="chrome" />

/**
 * Vite 类型声明
 *
 * 用于油猴脚本构建，声明 ?inline 后缀导入的类型
 */

declare module "*?inline" {
  const content: string
  export default content
}

declare module "*.css?inline" {
  const content: string
  export default content
}

declare const __PLATFORM__: "extension" | "userscript"

declare const GM_info: {
  scriptHandler?: string
  script: {
    version: string
  }
}

declare function GM_getResourceText(name: string): string
declare function GM_getResourceURL(name: string): string

interface Window {
  __OPHEL_MARKDOWN_PREVIEW_STYLES__?: string
  __OPHEL_NOTIFICATION_SOUND_URLS__?: Record<string, string>
  __OPHEL_SITE_ICONS__?: Record<string, string>
  __OPHEL_USER_QUERY_MARKDOWN_STYLES__?: string
  __OPHEL_USERSCRIPT_ASSET_URLS__?: Record<string, string>
}
