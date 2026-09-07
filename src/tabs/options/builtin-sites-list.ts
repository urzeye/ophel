import type { SupportedAiPlatform } from "~constants/defaults"

/**
 * 按当前页面 URL 把匹配到的内置站点提到列表第一项，其余保持目录相对顺序。
 * 无匹配（独立选项页、未适配站点）时原样返回目录顺序。
 */
export const orderBuiltinSitesByCurrentUrl = (
  platforms: readonly SupportedAiPlatform[],
  pageUrl: string,
): SupportedAiPlatform[] => {
  const currentIndex = platforms.findIndex((platform) => platform.pattern.test(pageUrl))
  if (currentIndex <= 0) {
    return [...platforms]
  }

  const current = platforms[currentIndex]
  return [current, ...platforms.filter((_, index) => index !== currentIndex)]
}

/** 内置站点行上可打开的入口地址，完整使用目录 entryUrls，不只取第一条。 */
export const getBuiltinSiteEntryUrls = (platform: SupportedAiPlatform): readonly string[] =>
  platform.entryUrls
