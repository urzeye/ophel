import { createRuntimeRemoteConfigManager } from "~core/remote-config-runtime"

import { userscriptRegistryTransport } from "./registry-transport"
import { userscriptStorage } from "./storage"

const remoteConfigManager = createRuntimeRemoteConfigManager(
  userscriptStorage,
  userscriptRegistryTransport,
)

export const checkUserscriptRemoteConfigOnStartup = () =>
  remoteConfigManager.checkForUpdates({ force: false })

export const checkUserscriptRemoteConfigNow = () =>
  remoteConfigManager.checkForUpdates({ force: true })

export const ignoreUserscriptRemotePatch = (siteId: string, patchVersion?: number) =>
  remoteConfigManager.ignorePatch(siteId, { patchVersion })
