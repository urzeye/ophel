import type { PlatformCapability } from "../types"

// Plasmo 在所有扩展入口（包括 MAIN world）中注入，不依赖页面 UA 或后台 API。
export const isSafariBuild = process.env.PLASMO_BROWSER === "safari"

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
