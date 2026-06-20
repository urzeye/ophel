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
import { getPlatformType } from "./utils"

// 根据构建时注入的平台标识选择对应实现
let platform: Platform

const platformType = getPlatformType()
if (platformType === "userscript") {
  // 油猴脚本构建
  platform = userscriptPlatform
} else {
  // 浏览器扩展构建
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
export { getPlatformType, isUserscriptPlatform, isExtensionPlatform } from "./utils"
