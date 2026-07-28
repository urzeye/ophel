import type { PlatformStorage } from "~platform"
import { APP_VERSION } from "~utils/config"

import { PackManager } from "./pack-manager"

export const createRuntimePackManager = (storage: PlatformStorage): PackManager =>
  new PackManager({ storage, appVersion: APP_VERSION })
