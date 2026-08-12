/**
 * Platform Abstraction Layer - Entry Point
 *
 * 平台实现由 `~platform/impl` 在编译期解析：
 * - 浏览器扩展（Plasmo）：src/platform/impl.ts -> ./extension
 * - 油猴脚本（Vite）：alias 到 src/platform/userscript/impl.ts -> ./userscript
 *
 * 不要在同一模块里同时静态导入两端实现再做运行时选择：
 * Plasmo 无法静态求值 __PLATFORM__，tree-shaking 会失效，
 * 导致对端平台代码与其动态 import 的异步 chunk 全部进入产物。
 */
import { platform } from "~platform/impl"

export { platform }
export type {
  Platform,
  PlatformStorage,
  PlatformRemoteConfig,
  PlatformSitePacks,
  SitePackRuntimeStatus,
  SitePackOriginPermissionResult,
  PlatformCapability,
  FetchOptions,
  FetchResponse,
  NotifyOptions,
} from "./types"
export { getPlatformType, isUserscriptPlatform, isExtensionPlatform } from "./utils"
