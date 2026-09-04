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

import {
  siteMatchPatternMatchesUrl,
  siteMatchPatternOriginPattern,
} from "~adapters/declarative/match-pattern"
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

// Zustand persist 存储信封的键名（与 STORAGE_KEYS.SETTINGS / settings-store 的 name 一致）
const SETTINGS_STORAGE_KEY = "settings"

interface SettingsStorageEnvelope {
  state?: {
    settings?: {
      disabledSites?: unknown
    }
  }
}

/**
 * 读取用户已停用的内置站点 ID 列表（settings 为 Zustand persist 信封结构）
 */
function readDisabledBuiltinSites(): string[] {
  try {
    const envelope = GM_getValue<SettingsStorageEnvelope | null>(SETTINGS_STORAGE_KEY, null)
    const list = envelope?.state?.settings?.disabledSites
    if (!Array.isArray(list)) return []
    return list.filter((id): id is string => typeof id === "string")
  } catch (error) {
    console.debug("[Ophel] Failed to read disabled sites during whitelist check:", error)
    return []
  }
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
  const disabledSites = readDisabledBuiltinSites()
  for (const builtinPlatform of SUPPORTED_AI_PLATFORMS) {
    const matched = builtinPlatform.matchPatterns.some((pattern) =>
      siteMatchPatternMatchesUrl(parsedUrl, pattern),
    )
    if (!matched) continue
    if (!disabledSites.includes(builtinPlatform.id)) {
      return true
    }
    // 内置适配器已停用：不再因内置匹配初始化，
    // 但继续检查 SitePack matches 与显式绑定，允许社区适配包接管该站点
    break
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
          if (
            siteMatchPatternMatchesUrl(parsedUrl, pattern) ||
            siteMatchPatternMatchesUrl(parsedUrl, siteMatchPatternOriginPattern(pattern))
          ) {
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
