import type { SupportedAiPlatform } from "~constants/defaults"

export interface QuickAccessSite {
  key: string
  platform: SupportedAiPlatform
  /** 同一平台有多个入口时用于区分的 host；单入口平台为 undefined。 */
  hostLabel?: string
  /** 未绑定任何域名的适配包没有可打开地址。 */
  url?: string
}

const originOf = (url: string): string => {
  try {
    return new URL(url).origin
  } catch {
    return ""
  }
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * 快捷入口按「可打开的地址」展开而不是按平台展开：适配包绑定几个域名就出几个入口，
 * 一个域名都没绑定时保留一个无地址条目用于引导绑定。同一地址只保留最先注册的平台，
 * 避免共享 detect 池的多个包给出指向同一站点的重复入口。
 */
export const buildQuickAccessSites = (
  platforms: readonly SupportedAiPlatform[],
): QuickAccessSite[] => {
  const seenUrls = new Set<string>()
  const sites: QuickAccessSite[] = []

  for (const platform of platforms) {
    if (platform.entryUrls.length === 0) {
      sites.push({ key: platform.id, platform })
      continue
    }

    const distinguishByHost = platform.entryUrls.length > 1
    for (const url of platform.entryUrls) {
      if (seenUrls.has(url)) continue
      seenUrls.add(url)
      sites.push({
        key: `${platform.id}@${url}`,
        platform,
        url,
        ...(distinguishByHost ? { hostLabel: hostOf(url) } : {}),
      })
    }
  }

  return sites
}

/** 当前标签页所在的入口地址优先，其次是平台首个入口，最后退回当前 origin。 */
export const resolveSiteEntryUrl = (platform: SupportedAiPlatform, currentUrl: string): string => {
  const currentOrigin = originOf(currentUrl)
  const matchingEntry = platform.entryUrls.find((entry) => originOf(entry) === currentOrigin)
  return matchingEntry ?? platform.entryUrls[0] ?? currentOrigin
}
