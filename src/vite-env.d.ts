/// <reference types="vite/client" />

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
  script: {
    version: string
  }
}
