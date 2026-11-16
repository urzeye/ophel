import { SITE_IDS } from "~constants/defaults"

const SITE_PACK_SITE_ID_PREFIX = "pack:"
const SITE_INSTANCE_ORIGIN_SEPARATOR = "@"
const SCOPED_STORAGE_KEY_VERSION = "v1"

export interface PersistedSiteIdentity {
  siteId?: string | null
  siteInstanceKey?: string | null
  url?: string | null
}

export const isSitePackSiteId = (siteId: string): boolean =>
  siteId.startsWith(SITE_PACK_SITE_ID_PREFIX)

/**
 * 内置多 host 站点：同一适配器服务多个域名与账号体系独立的站点（如
 * kimi.com / kimi.ai、doubao.com / dola.com），本地数据必须按 origin 分区，
 * 否则两站同 ID 的对话会共用同一份本地记录互相覆盖。
 * host 归一化去掉 www 前缀（www.zchat.z.ai 与 zchat.z.ai 视为同一分区）。
 */
const MULTI_HOST_BUILTIN_SITES: ReadonlySet<string> = new Set([
  SITE_IDS.KIMI,
  SITE_IDS.DOUBAO,
  SITE_IDS.ZAI,
])

/** 是否为内置多 host 站点（同一适配器服务多个独立域名）。 */
export const isMultiHostBuiltinSite = (siteId: string): boolean =>
  MULTI_HOST_BUILTIN_SITES.has(siteId)

export const normalizeSiteOrigin = (origin: string): string => {
  let url: URL

  try {
    url = new URL(origin)
  } catch {
    throw new TypeError(`Invalid site origin: ${origin}`)
  }

  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.origin === "null") {
    throw new TypeError(`Unsupported site origin: ${origin}`)
  }

  return url.origin
}

export const tryNormalizeSiteOrigin = (origin: string | null | undefined): string | null => {
  if (!origin) return null

  try {
    return normalizeSiteOrigin(origin)
  } catch {
    return null
  }
}

export const createSiteInstanceKey = (siteId: string, origin?: string): string => {
  const multiHost = isMultiHostBuiltinSite(siteId)
  if (!multiHost && !isSitePackSiteId(siteId)) return siteId
  if (!origin) {
    throw new TypeError(`Site instance ${siteId} requires a runtime origin`)
  }

  const url = new URL(normalizeSiteOrigin(origin))
  if (multiHost) url.hostname = url.hostname.replace(/^www\./, "")
  return `${siteId}${SITE_INSTANCE_ORIGIN_SEPARATOR}${url.origin}`
}

export const createSiteScopedStorageKey = (siteInstanceKey: string, resourceId: string): string =>
  `${SCOPED_STORAGE_KEY_VERSION}:${encodeURIComponent(siteInstanceKey)}:${encodeURIComponent(resourceId)}`

export const resolvePersistedSiteInstanceKey = (identity: PersistedSiteIdentity): string | null => {
  const storedInstanceKey = identity.siteInstanceKey?.trim()
  if (storedInstanceKey) {
    // 多 host 站点的未分区旧数据只保留，不按 URL 推断归属。
    return isMultiHostBuiltinSite(storedInstanceKey) ? null : storedInstanceKey
  }

  const siteId = identity.siteId?.trim()
  if (!siteId || isMultiHostBuiltinSite(siteId)) return null
  if (!isSitePackSiteId(siteId)) return siteId

  const origin = tryNormalizeSiteOrigin(identity.url)
  return origin ? createSiteInstanceKey(siteId, origin) : null
}
