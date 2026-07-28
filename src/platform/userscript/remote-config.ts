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

export const ignoreUserscriptRemotePatch = (siteId: string, patchVersion?: number) =>
  remoteConfigManager.ignorePatch(siteId, { patchVersion })
