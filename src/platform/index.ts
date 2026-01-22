/**
 * Platform Abstraction Layer - Entry Point
 *
 * 根据构建目标自动选择平台实现
 *
 * 构建时通过 DefinePlugin 注入 __PLATFORM__ 变量：
 * - 浏览器扩展：__PLATFORM__ = "extension"
 * - 油猴脚本：__PLATFORM__ = "userscript"
 */

// 静态导入两个平台的实现 (依靠 tree-shaking 移除未使用的代码)
import { platform as extensionPlatform } from "./extension"
import type { Platform } from "./types"
import { platform as userscriptPlatform } from "./userscript"

// 构建时注入的平台标识
declare const __PLATFORM__: "extension" | "userscript"

// 动态导入对应平台实现
let platform: Platform

// 默认使用扩展版（Plasmo 构建时不会定义 __PLATFORM__）
if (typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript") {
  // 油猴脚本构建
  platform = userscriptPlatform
} else {
  // 浏览器扩展构建（默认）
  platform = extensionPlatform
}

export { platform }
export type {
  Platform,
  PlatformStorage,
  PlatformCapability,
  FetchOptions,
  FetchResponse,
  NotifyOptions,
} from "./types"
