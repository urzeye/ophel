/**
 * 油猴脚本白名单检查（仅用于 userscript 构建）
 *
 * 虽然 @match 设为通配符，但在初始化前会检查当前站点是否在白名单内：
 * 1. 内置 15 个站点的 matchPatterns
 * 2. 已安装 SitePack 的 matches
 * 3. 用户显式绑定的 customOriginBindings
 *
 * 非白名单站点会在早期退出，性能影响极小（小于1ms）。
 */

import { siteMatchPatternMatchesUrl } from "~adapters/declarative/match-pattern"
import { SUPPORTED_AI_PLATFORMS } from "~constants/defaults"

import { INSTALLED_SITE_PACKS_STORAGE_KEY } from "../../core/pack-manager"
import { SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY } from "../../core/site-pack-origin-bindings"

declare function GM_getValue<T>(key: string, defaultValue?: T): T

interface InstalledSitePacksStorage {
  storageSchemaVersion: number
  packs: Record<
    string,
    {
      manifest: {
        id: string
        matches?: string[]
      }
      enabled: boolean
    }
  >
}

interface OriginBindingsStorage {
  storageSchemaVersion: number
  bindings: Record<string, { mode: string; packId: string }>
}

/**
 * 检查当前站点是否应该初始化 Ophel
 */
export async function shouldInitializeOnCurrentSite(): Promise<boolean> {
  const currentUrl = window.location.href
  let parsedUrl: URL
  try {
    parsedUrl = new URL(currentUrl)
  } catch {
    return false
  }

  // 1. 检查内置站点（15 个内置适配器）
  const builtinMatches = SUPPORTED_AI_PLATFORMS.flatMap((platform) => platform.matchPatterns)
  for (const pattern of builtinMatches) {
    if (siteMatchPatternMatchesUrl(parsedUrl, pattern)) {
      return true
    }
  }

  // 2. 检查已安装的 SitePack matches
  try {
    const installedPacks: InstalledSitePacksStorage | null = GM_getValue(
      INSTALLED_SITE_PACKS_STORAGE_KEY,
      null,
    )
    if (installedPacks?.packs) {
      for (const pack of Object.values(installedPacks.packs)) {
        if (!pack.enabled || !pack.manifest?.matches) continue
        for (const pattern of pack.manifest.matches) {
          if (siteMatchPatternMatchesUrl(parsedUrl, pattern)) {
            return true
          }
        }
      }
    }
  } catch (error) {
    console.debug("[Ophel] Failed to check installed SitePacks during whitelist check:", error)
  }

  // 3. 检查用户显式绑定的自定义 origin
  try {
    const originBindings: OriginBindingsStorage | null = GM_getValue(
      SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY,
      null,
    )
    if (originBindings?.bindings && originBindings.bindings[parsedUrl.origin]) {
      return true
    }
  } catch (error) {
    console.debug("[Ophel] Failed to check origin bindings during whitelist check:", error)
  }

  return false
}
