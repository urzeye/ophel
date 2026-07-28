import { useEffect, useState } from "react"

import type { SupportedAiPlatform } from "~constants/defaults"
import { getSupportedAiPlatforms, loadSupportedAiPlatforms } from "~core/platform-catalog"
import { platform } from "~platform"
import { subscribeI18nChanges } from "~utils/i18n"

export function useSupportedAiPlatforms(): readonly SupportedAiPlatform[] {
  const [platforms, setPlatforms] =
    useState<readonly SupportedAiPlatform[]>(getSupportedAiPlatforms)

  useEffect(() => {
    let active = true
    const stopI18nWatch = subscribeI18nChanges(() => {
      if (active) setPlatforms(getSupportedAiPlatforms())
    })
    void loadSupportedAiPlatforms(platform.storage).then(() => {
      if (active) setPlatforms(getSupportedAiPlatforms())
    })
    return () => {
      active = false
      stopI18nWatch()
    }
  }, [])

  return platforms
}
