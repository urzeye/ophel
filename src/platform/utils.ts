/**
 * Platform Utilities
 *
 * 平台判断和工具函数
 */

// 构建时注入的平台标识
declare const __PLATFORM__: "extension" | "userscript"

/**
 * 获取当前平台类型
 *
 * @throws {Error} 如果 __PLATFORM__ 未定义或值无效
 * @returns 平台类型 "extension" 或 "userscript"
 */
export function getPlatformType(): "extension" | "userscript" {
  if (typeof __PLATFORM__ === "undefined") {
    throw new Error("[Ophel] __PLATFORM__ is not defined. Build configuration error.")
  }

  if (__PLATFORM__ !== "extension" && __PLATFORM__ !== "userscript") {
    throw new Error(`[Ophel] Invalid __PLATFORM__ value: ${__PLATFORM__}`)
  }

  return __PLATFORM__
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
 * 检查当前是否为浏览器扩展环境
 *
 * @returns true 表示浏览器扩展环境，false 表示油猴脚本环境
 */
export function isExtensionPlatform(): boolean {
  return !isUserscriptPlatform()
}
