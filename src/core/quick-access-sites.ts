import type { SupportedAiPlatform } from "~constants/defaults"

export interface QuickAccessSite {
  key: string
  platform: SupportedAiPlatform
  /** 可打开的入口地址；未绑定任何域名的适配包为空数组。 */
  urls: string[]
}

const originOf = (url: string): string => {
  try {
    return new URL(url).origin
  } catch {
    return ""
  }
}

export const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * 快捷入口按平台聚合：一个平台只占一个格子，多入口平台的候选地址收进 urls，
 * 由 popup 提供入口切换菜单；一个域名都没绑定时保留一个无地址条目用于引导绑定。
 * 同一地址只保留给最先注册的平台，避免共享 detect 池的多个包给出指向同一站点的重复入口。
 */
export const buildQuickAccessSites = (
  platforms: readonly SupportedAiPlatform[],
): QuickAccessSite[] => {
  const seenUrls = new Set<string>()
  const sites: QuickAccessSite[] = []

  for (const platform of platforms) {
    if (platform.entryUrls.length === 0) {
      sites.push({ key: platform.id, platform, urls: [] })
      continue
    }

    const urls = platform.entryUrls.filter((url) => !seenUrls.has(url))
    if (urls.length === 0) continue
    for (const url of urls) {
      seenUrls.add(url)
    }
    sites.push({ key: platform.id, platform, urls })
  }

  return sites
}

/** 多入口平台的打开目标：记住的选择仍有效时优先，否则退回首个入口。 */
export const resolveQuickAccessUrl = (
  site: QuickAccessSite,
  lastUrls: Record<string, string>,
): string | undefined => {
  const remembered = lastUrls[site.platform.id]
  if (remembered && site.urls.includes(remembered)) return remembered
  return site.urls[0]
}

/** 当前标签页所在的入口地址优先，其次是平台首个入口，最后退回当前 origin。 */
export const resolveSiteEntryUrl = (platform: SupportedAiPlatform, currentUrl: string): string => {
  const currentOrigin = originOf(currentUrl)
  const matchingEntry = platform.entryUrls.find((entry) => originOf(entry) === currentOrigin)
  return matchingEntry ?? platform.entryUrls[0] ?? currentOrigin
}
