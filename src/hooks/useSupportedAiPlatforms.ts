import { useEffect, useState } from "react"

import type { SupportedAiPlatform } from "~constants/defaults"
import { getSupportedAiPlatforms, loadSupportedAiPlatforms } from "~core/platform-catalog"
import {
  INSTALLED_SITE_PACKS_STORAGE_KEY,
  SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY,
} from "~core/site-pack-storage-constants"
import { platform } from "~platform"
import { subscribeI18nChanges } from "~utils/i18n"

export function useSupportedAiPlatforms(): readonly SupportedAiPlatform[] {
  const [platforms, setPlatforms] =
    useState<readonly SupportedAiPlatform[]>(getSupportedAiPlatforms)

  useEffect(() => {
    let active = true
    const refresh = (force: boolean) => {
      void loadSupportedAiPlatforms(platform.storage, { force }).then(() => {
        if (active) setPlatforms(getSupportedAiPlatforms())
      })
    }
    const stopI18nWatch = subscribeI18nChanges(() => {
      if (active) setPlatforms(getSupportedAiPlatforms())
    })
    // 适配包安装/卸载/启停与域名绑定变化都会改写这两个 key。
    // 目录是模块级 prime-once 缓存，挂载时强制刷新一次并持续监听，
    // 避免其它页面或后台改动后这里继续展示过期平台列表。
    const stopInstalledWatch = platform.storage.watch(INSTALLED_SITE_PACKS_STORAGE_KEY, () =>
      refresh(true),
    )
    const stopBindingsWatch = platform.storage.watch(SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY, () =>
      refresh(true),
    )
    refresh(true)
    return () => {
      active = false
      stopI18nWatch()
      stopInstalledWatch()
      stopBindingsWatch()
    }
  }, [])

  return platforms
}
