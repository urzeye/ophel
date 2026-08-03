import type { SupportedAiPlatform } from "~constants/defaults"
import { SUPPORTED_AI_PLATFORMS } from "~constants/defaults"
import type { PlatformStorage } from "~platform"
import { getCurrentLang } from "~utils/i18n"

import type { InstalledSitePack } from "./pack-manager"
import { createRuntimePackManager } from "./pack-manager-runtime"
import {
  createEmptySitePackOriginBindingsState,
  type SitePackOriginBindingsState,
} from "./site-pack-origin-bindings"
import { getDynamicPlatforms } from "./site-pack-platforms"

let isCatalogPrimed = false
let dynamicPacks: readonly InstalledSitePack[] = []
let dynamicBindings: SitePackOriginBindingsState = createEmptySitePackOriginBindingsState()
let supportedPlatforms: readonly SupportedAiPlatform[] = [...SUPPORTED_AI_PLATFORMS]
let supportedLanguage = getCurrentLang()
let loadPromise: Promise<readonly SupportedAiPlatform[]> | null = null

const rebuildSupportedPlatforms = (): readonly SupportedAiPlatform[] => {
  supportedLanguage = getCurrentLang()
  supportedPlatforms = [
    ...SUPPORTED_AI_PLATFORMS,
    ...getDynamicPlatforms(dynamicPacks, dynamicBindings, supportedLanguage),
  ]
  return supportedPlatforms
}

export const getSupportedAiPlatforms = (): readonly SupportedAiPlatform[] => {
  if (supportedLanguage !== getCurrentLang()) return rebuildSupportedPlatforms()
  return supportedPlatforms
}

export const primeDynamicPlatforms = (
  packs: readonly InstalledSitePack[],
  bindings: SitePackOriginBindingsState,
): readonly SupportedAiPlatform[] => {
  dynamicPacks = [...packs]
  dynamicBindings = bindings
  isCatalogPrimed = true
  return rebuildSupportedPlatforms()
}

export function loadSupportedAiPlatforms(
  storage: PlatformStorage,
  options?: { force?: boolean },
): Promise<readonly SupportedAiPlatform[]> {
  // 默认保持 prime-once；适配包状态变化后由调用方传 force 主动重建目录。
  if (!options?.force && isCatalogPrimed) return Promise.resolve(getSupportedAiPlatforms())
  if (loadPromise) return loadPromise

  const packManager = createRuntimePackManager(storage)
  loadPromise = Promise.all([packManager.getEnabledPacks(), packManager.getOriginBindings()])
    .then(([snapshot, bindings]) => {
      for (const issue of snapshot.issues) {
        console.warn("[Ophel] SitePack platform catalog issue:", issue)
      }
      return primeDynamicPlatforms(snapshot.packs, bindings)
    })
    .catch((error) => {
      console.error(
        "[Ophel] Failed to load SitePack platform catalog; using built-in platforms:",
        error,
      )
      return primeDynamicPlatforms([], createEmptySitePackOriginBindingsState())
    })
    .finally(() => {
      loadPromise = null
    })
  return loadPromise
}
