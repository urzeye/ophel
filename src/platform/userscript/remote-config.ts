import { createRuntimePackManager } from "~core/pack-manager-runtime"
import { createRuntimeRemoteConfigManager } from "~core/remote-config-runtime"
import type { RemoteConfigCheckResult } from "~core/remote-config-types"
import { readRemoteConfigAutoUpdate } from "~utils/persisted-settings"

import { userscriptRegistryTransport } from "./registry-transport"
import { userscriptStorage } from "./storage"

const remoteConfigManager = createRuntimeRemoteConfigManager(
  userscriptStorage,
  userscriptRegistryTransport,
)
const packManager = createRuntimePackManager(userscriptStorage)

const syncInstalledRegistryPacks = async (result: RemoteConfigCheckResult) => {
  if (result.status === "failed") return result

  try {
    const sync = await packManager.syncRegistryPacks()
    if (sync.issues.length > 0) {
      console.warn("[Ophel] Installed SitePack sync issues:", sync.issues)
    }
  } catch (error) {
    console.error("[Ophel] Failed to sync installed SitePacks:", error)
  }
  return result
}

export const checkUserscriptRemoteConfigOnStartup = async () => {
  if (!(await readRemoteConfigAutoUpdate(userscriptStorage))) return null
  return syncInstalledRegistryPacks(await remoteConfigManager.checkForUpdates({ force: false }))
}

export const checkUserscriptRemoteConfigNow = async () =>
  syncInstalledRegistryPacks(await remoteConfigManager.checkForUpdates({ force: true }))

export const getUserscriptRemoteConfigState = () => remoteConfigManager.getState()

export const resetUserscriptRemotePatch = async (siteId: string, patchVersion?: number) => {
  const ignored = await remoteConfigManager.ignorePatch(siteId, { patchVersion })
  if (!ignored) return false

  const { resetBuiltinSiteConfig } = await import("~adapters")
  return resetBuiltinSiteConfig(siteId)
}
