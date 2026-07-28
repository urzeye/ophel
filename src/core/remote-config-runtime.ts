import type { PlatformStorage } from "~platform"
import { APP_VERSION } from "~utils/config"

import { resolveBuiltinConfig } from "./builtin-config-registry"
import { RemoteConfigManager } from "./remote-config-manager"
import type { RegistryTransport } from "./remote-config-types"

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
