import type { SupportedAiPlatform } from "~constants/defaults"
import { SUPPORTED_AI_PLATFORMS } from "~constants/defaults"
import type { PlatformStorage } from "~platform"

import { getDynamicPlatforms, type InstalledSitePack } from "./pack-manager"
import { createRuntimePackManager } from "./pack-manager-runtime"

let isCatalogPrimed = false
let supportedPlatforms: readonly SupportedAiPlatform[] = [...SUPPORTED_AI_PLATFORMS]
let loadPromise: Promise<readonly SupportedAiPlatform[]> | null = null

export const getSupportedAiPlatforms = (): readonly SupportedAiPlatform[] => supportedPlatforms

export const primeDynamicPlatforms = (
  packs: readonly InstalledSitePack[],
): readonly SupportedAiPlatform[] => {
  supportedPlatforms = [...SUPPORTED_AI_PLATFORMS, ...getDynamicPlatforms(packs)]
  isCatalogPrimed = true
  return supportedPlatforms
}

export function loadSupportedAiPlatforms(
  storage: PlatformStorage,
): Promise<readonly SupportedAiPlatform[]> {
  if (isCatalogPrimed) return Promise.resolve(supportedPlatforms)

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
