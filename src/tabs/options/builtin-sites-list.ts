import type { SupportedAiPlatform } from "~constants/defaults"

/** 内置站点行上可打开的入口地址，完整使用目录 entryUrls，不只取第一条。 */
export const getBuiltinSiteEntryUrls = (platform: SupportedAiPlatform): readonly string[] =>
  platform.entryUrls
