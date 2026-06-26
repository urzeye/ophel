/**
 * Platform Utilities
 *
 * 平台判断和工具函数
 */

// 构建时注入的平台标识
// 注意：Plasmo 构建不会定义此变量，默认为 undefined (表示 extension)
declare const __PLATFORM__: "extension" | "userscript" | undefined

/**
 * 获取当前平台类型
 *
 * @returns 平台类型 "extension" 或 "userscript"
 * - Vite userscript 构建: __PLATFORM__ = "userscript"
 * - Plasmo extension 构建: __PLATFORM__ = undefined (默认为 "extension")
 */
export function getPlatformType(): "extension" | "userscript" {
  // Plasmo 构建时不定义 __PLATFORM__，默认为 extension
  if (typeof __PLATFORM__ === "undefined") {
    return "extension"
  }

  // Vite userscript 构建时显式定义为 "userscript"
  if (__PLATFORM__ === "userscript") {
    return "userscript"
  }

  // 如果未来 Plasmo 也开始注入 "extension"，则返回它
  if (__PLATFORM__ === "extension") {
    return "extension"
  }

  // 不应该到达这里，但为了类型安全，添加断言
  console.error(`[Ophel] Unexpected __PLATFORM__ value: ${__PLATFORM__}`)
  return "extension" // 默认降级到 extension
}

/**
 * 检查当前是否为油猴脚本环境
 *
 * @returns true 表示油猴脚本环境，false 表示浏览器扩展环境
 */
export function isUserscriptPlatform(): boolean {
  try {
    return getPlatformType() === "userscript"
  } catch {
    // 如果获取失败，降级到运行时检测（不应该发生）
    console.warn("[Ophel] Failed to get platform type, falling back to runtime detection")
    return typeof GM_info !== "undefined"
  }
}

/**
 * 获取当前用户脚本管理器名称。
 *
 * 常见返回值包括 "ScriptCat"、"Tampermonkey"、"Violentmonkey"、"Greasemonkey"。
 */
export function getUserscriptManagerName(): string | null {
  if (!isUserscriptPlatform()) return null

  try {
    if (typeof GM_info === "undefined") return null
    return typeof GM_info.scriptHandler === "string" ? GM_info.scriptHandler : null
  } catch {
    return null
  }
}

export function isScriptCatUserscriptManager(): boolean {
  return (
    getUserscriptManagerName()?.toLowerCase().replace(/\s+/g, "").includes("scriptcat") ?? false
  )
}

/**
 * 检查当前是否为浏览器扩展环境
 *
 * @returns true 表示浏览器扩展环境，false 表示油猴脚本环境
 */
export function isExtensionPlatform(): boolean {
  return !isUserscriptPlatform()
}
