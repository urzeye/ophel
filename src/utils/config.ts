/**
 * 应用全局配置
 * 在此处定义应用名称、版本等全局常量
 */

// 应用名称（用于备份文件名等）
export const APP_NAME = "ophel"

// 应用显示名称
export const APP_DISPLAY_NAME = "Ophel Atlas"

const isUserscript = typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"

// 应用版本 - 根据平台获取
export const APP_VERSION = isUserscript
  ? GM_info?.script?.version ?? "1.0.0"
  : chrome.runtime.getManifest().version

// 应用图标 URL
// 油猴脚本由入口阶段通过 @resource 预载入，浏览器扩展继续使用本地资源
export const APP_ICON_URL = isUserscript
  ? typeof window !== "undefined"
    ? window.__OPHEL_USERSCRIPT_ASSET_URLS__?.icon || ""
    : ""
  : chrome.runtime.getURL("assets/icon.png")
