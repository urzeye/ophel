import { createRuntimeRemoteConfigManager } from "~core/remote-config-runtime"
import { readRemoteConfigAutoUpdate } from "~utils/persisted-settings"

import { userscriptRegistryTransport } from "./registry-transport"
import { userscriptStorage } from "./storage"

const remoteConfigManager = createRuntimeRemoteConfigManager(
  userscriptStorage,
  userscriptRegistryTransport,
)

export const checkUserscriptRemoteConfigOnStartup = async () => {
  if (!(await readRemoteConfigAutoUpdate(userscriptStorage))) return null
  return remoteConfigManager.checkForUpdates({ force: false })
}

export const checkUserscriptRemoteConfigNow = () =>
  remoteConfigManager.checkForUpdates({ force: true })

export const getUserscriptRemoteConfigState = () => remoteConfigManager.getState()

export const resetUserscriptRemotePatch = async (siteId: string, patchVersion?: number) => {
  const ignored = await remoteConfigManager.ignorePatch(siteId, { patchVersion })
  if (!ignored) return false

  const { resetBuiltinSiteConfig } = await import("~adapters")
  return resetBuiltinSiteConfig(siteId)
}
