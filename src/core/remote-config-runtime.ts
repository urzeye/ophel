import type { PlatformStorage } from "~platform"
import { APP_VERSION, IS_DEVELOPMENT_BUILD } from "~utils/config"
import { readRemoteConfigRegistrySourceUrl } from "~utils/persisted-settings"

import { resolveBuiltinConfig } from "./builtin-config-registry"
import { RemoteConfigManager } from "./remote-config-manager"
import { DEFAULT_REMOTE_CONFIG_SOURCES, type RegistryTransport } from "./remote-config-types"

export interface RuntimeRemoteConfigManagerOptions {
  allowRegistrySourceOverride?: boolean
}

export const resolveRuntimeRemoteConfigSources = async (
  storage: PlatformStorage,
  allowRegistrySourceOverride: boolean,
): Promise<readonly string[]> => {
  if (!allowRegistrySourceOverride) return DEFAULT_REMOTE_CONFIG_SOURCES

  const sourceUrl = await readRemoteConfigRegistrySourceUrl(storage)
  return sourceUrl ? [sourceUrl] : DEFAULT_REMOTE_CONFIG_SOURCES
}

export const createRuntimeRemoteConfigManager = (
  storage: PlatformStorage,
  transport: RegistryTransport,
  options: RuntimeRemoteConfigManagerOptions = {},
): RemoteConfigManager => {
  const allowRegistrySourceOverride = options.allowRegistrySourceOverride ?? IS_DEVELOPMENT_BUILD

  return new RemoteConfigManager({
    storage,
    transport,
    appVersion: APP_VERSION,
    resolveBuiltinConfig,
    resolveSources: () => resolveRuntimeRemoteConfigSources(storage, allowRegistrySourceOverride),
  })
}
