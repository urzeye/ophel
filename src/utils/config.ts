/**
 * 应用全局配置
 * 在此处定义应用名称、版本等全局常量
 */

// 应用名称（用于备份文件名等）
export const APP_NAME = "ophel"

// 应用显示名称
export const APP_DISPLAY_NAME = "Ophel"

// 应用版本 - 从 manifest 自动获取，与 package.json 保持同步
// 应用版本 - 根据平台获取
export const APP_VERSION =
  typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"
    ? GM_info?.script?.version ?? "1.0.0"
    : chrome.runtime.getManifest().version

// 应用图标 URL
export const APP_ICON_URL =
  typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"
    ? "https://raw.githubusercontent.com/urzeye/ophel/main/assets/icon.png"
    : chrome.runtime.getURL("assets/icon.png")
