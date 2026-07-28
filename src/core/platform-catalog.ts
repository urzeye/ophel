import type { SupportedAiPlatform } from "~constants/defaults"
import { SUPPORTED_AI_PLATFORMS } from "~constants/defaults"
import type { PlatformStorage } from "~platform"
import { getCurrentLang } from "~utils/i18n"

import { getDynamicPlatforms, type InstalledSitePack } from "./pack-manager"
import { createRuntimePackManager } from "./pack-manager-runtime"

let isCatalogPrimed = false
let dynamicPacks: readonly InstalledSitePack[] = []
let supportedPlatforms: readonly SupportedAiPlatform[] = [...SUPPORTED_AI_PLATFORMS]
let supportedLanguage = getCurrentLang()
let loadPromise: Promise<readonly SupportedAiPlatform[]> | null = null

const rebuildSupportedPlatforms = (): readonly SupportedAiPlatform[] => {
  supportedLanguage = getCurrentLang()
  supportedPlatforms = [
    ...SUPPORTED_AI_PLATFORMS,
    ...getDynamicPlatforms(dynamicPacks, supportedLanguage),
  ]
  return supportedPlatforms
}

export const getSupportedAiPlatforms = (): readonly SupportedAiPlatform[] => {
  if (supportedLanguage !== getCurrentLang()) return rebuildSupportedPlatforms()
  return supportedPlatforms
}

export const primeDynamicPlatforms = (
  packs: readonly InstalledSitePack[],
): readonly SupportedAiPlatform[] => {
  dynamicPacks = [...packs]
  isCatalogPrimed = true
  return rebuildSupportedPlatforms()
}

export function loadSupportedAiPlatforms(
  storage: PlatformStorage,
): Promise<readonly SupportedAiPlatform[]> {
  if (isCatalogPrimed) return Promise.resolve(getSupportedAiPlatforms())

  return (loadPromise ??= createRuntimePackManager(storage)
    .getEnabledPacks()
    .then((snapshot) => {
      for (const issue of snapshot.issues) {
        console.warn("[Ophel] SitePack platform catalog issue:", issue)
      }
      return primeDynamicPlatforms(snapshot.packs)
    })
    .catch((error) => {
      console.error(
        "[Ophel] Failed to load SitePack platform catalog; using built-in platforms:",
        error,
      )
      return primeDynamicPlatforms([])
    }))
}
