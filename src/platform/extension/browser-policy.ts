import type { PlatformCapability } from "../types"

// Plasmo 在所有扩展入口（包括 MAIN world）中注入，不依赖页面 UA 或后台 API。
// typeof 保护：共享代码 import 本模块时会进入油猴 Vite 构建，那里没有注入该变量
export const isSafariBuild =
  typeof process !== "undefined" && process.env.PLASMO_BROWSER === "safari"

export const extensionCapabilities: Readonly<Record<PlatformCapability, boolean>> = {
  cookies: true,
  permissions: true,
  browserManagedHostPermissions: isSafariBuild,
  tabs: true,
  commands: true,
  declarativeNetRequest: !isSafariBuild,
  watermarkRemoval: !isSafariBuild,
  notifications: !isSafariBuild,
  windowFocus: !isSafariBuild,
}
