import { resolveSitePackName } from "~adapters/declarative/localization"
import { siteMatchPatternOrigin } from "~adapters/declarative/match-pattern"
import { createSupportedAiPlatform, type SupportedAiPlatform } from "~constants/defaults"

import type { InstalledSitePack } from "./pack-manager"
import type { SitePackOriginBindingsState } from "./site-pack-origin-bindings"
import { getSitePackBoundOriginPatterns } from "./site-pack-origin-references"

const getPlatformInitial = (name: string): string =>
  Array.from(name.trim())[0]?.toUpperCase() ?? "?"

const uniqueOrigins = (patterns: readonly string[]): string[] =>
  Array.from(new Set(patterns.map(siteMatchPatternOrigin)))

/**
 * 适配包站点 favicon 规则：取匹配合集（静态 matches + 用户绑定域名）首个来源的
 * /favicon.ico。平台目录与适配中心列表共用这一条规则，避免两处各自推导分叉。
 */
export const getSitePackFaviconUrl = (matchPatterns: readonly string[]): string | undefined => {
  const [faviconOrigin] = uniqueOrigins(matchPatterns)
  return faviconOrigin ? new URL("/favicon.ico", faviconOrigin).href : undefined
}

/**
 * 适配包在平台目录中的条目。识别范围与可打开入口都来自「静态 matches + 用户绑定域名」
 * 这一份声明：通用包在用户绑定域名前既不会识别任何站点，也不会给出入口地址。
 */
export const getDynamicPlatforms = (
  packs: readonly InstalledSitePack[],
  bindings: SitePackOriginBindingsState,
  language: string,
): SupportedAiPlatform[] =>
  packs.map((pack) => {
    const matchPatterns = Array.from(
      new Set([...pack.manifest.matches, ...getSitePackBoundOriginPatterns(pack, bindings)]),
    )
    const entryUrls = uniqueOrigins(matchPatterns)
    const name = resolveSitePackName(pack.manifest, language)
    const faviconUrl = getSitePackFaviconUrl(matchPatterns)
    return createSupportedAiPlatform(
      {
        id: `pack:${pack.manifest.id}`,
        name,
        matchPatterns,
        entryUrls,
        icon: getPlatformInitial(name),
        ...(faviconUrl ? { faviconUrl } : {}),
      },
      {
        allowEmptyMatchPatterns: true,
      },
    )
  })
