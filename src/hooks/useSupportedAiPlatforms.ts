import { useEffect, useState } from "react"

import type { SupportedAiPlatform } from "~constants/defaults"
import { getSupportedAiPlatforms, loadSupportedAiPlatforms } from "~core/platform-catalog"
import { platform } from "~platform"

export function useSupportedAiPlatforms(): readonly SupportedAiPlatform[] {
  const [platforms, setPlatforms] =
    useState<readonly SupportedAiPlatform[]>(getSupportedAiPlatforms)

  useEffect(() => {
    let active = true
    void loadSupportedAiPlatforms(platform.storage).then((nextPlatforms) => {
      if (active) setPlatforms(nextPlatforms)
    })
    return () => {
      active = false
    }
  }, [])

  return platforms
}
