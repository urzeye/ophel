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

export const checkUserscriptRemoteConfigNow = async (sources?: readonly string[]) =>
  syncInstalledRegistryPacks(
    await remoteConfigManager.checkForUpdates({
      force: true,
      ...(sources && sources.length > 0 ? { sources } : {}),
    }),
  )

export const getUserscriptRemoteConfigState = () => remoteConfigManager.getState()

export const resetUserscriptRemotePatch = async (siteId: string, patchVersion?: number) => {
  const ignored = await remoteConfigManager.ignorePatch(siteId, { patchVersion })
  if (!ignored) return false

  const { resetBuiltinSiteConfig } = await import("~adapters")
  return resetBuiltinSiteConfig(siteId)
}

export const installUserscriptLocalRemotePatch = async (patch: unknown, fileName?: string) => {
  const result = await remoteConfigManager.installLocalPatch(patch, fileName ? { fileName } : {})
  if (!result.changed && !result.record) return false
  const { reapplyBuiltinSiteConfig } = await import("~adapters")
  return reapplyBuiltinSiteConfig(result.siteId)
}

export const removeUserscriptLocalRemotePatch = async (siteId: string) => {
  const result = await remoteConfigManager.removeLocalPatch(siteId)
  if (!result.changed) return false
  const { reapplyBuiltinSiteConfig } = await import("~adapters")
  return reapplyBuiltinSiteConfig(siteId)
}

export const clearUserscriptRemoteConfigCache = async () =>
  remoteConfigManager.clearCachedRegistrySnapshot()
