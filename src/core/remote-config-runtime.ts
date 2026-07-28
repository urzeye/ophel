import { ZAI_CONFIG, ZAI_CONFIG_VERSION } from "~adapters/zai-config"
import { SITE_IDS } from "~constants"
import type { PlatformStorage } from "~platform"
import { APP_VERSION } from "~utils/config"

import { RemoteConfigManager } from "./remote-config-manager"
import type {
  BuiltinConfigDescriptor,
  RegistryTransport,
  ResolveBuiltinConfig,
} from "./remote-config-types"

const zaiDescriptor: BuiltinConfigDescriptor = {
  siteId: SITE_IDS.ZAI,
  configVersion: ZAI_CONFIG_VERSION,
  baseConfig: ZAI_CONFIG,
}

const resolveBuiltinConfig: ResolveBuiltinConfig = (siteId) => {
  if (siteId !== SITE_IDS.ZAI) return null
  return zaiDescriptor
}

export const createRuntimeRemoteConfigManager = (
  storage: PlatformStorage,
  transport: RegistryTransport,
): RemoteConfigManager =>
  new RemoteConfigManager({
    storage,
    transport,
    appVersion: APP_VERSION,
    resolveBuiltinConfig,
  })
