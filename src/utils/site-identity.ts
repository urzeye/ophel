import { SITE_IDS } from "~constants"

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
const MULTI_HOST_BUILTIN_SITES: Readonly<
  Record<string, { hosts: readonly string[]; primaryHost: string }>
> = {
  [SITE_IDS.KIMI]: { hosts: ["kimi.com", "kimi.ai"], primaryHost: "kimi.com" },
  [SITE_IDS.DOUBAO]: { hosts: ["doubao.com", "dola.com"], primaryHost: "doubao.com" },
  [SITE_IDS.ZAI]: { hosts: ["chat.z.ai", "zchat.z.ai"], primaryHost: "chat.z.ai" },
}

/** 是否为内置多 host 站点（同一适配器服务多个独立域名）。 */
export const isMultiHostBuiltinSite = (siteId: string): boolean =>
  Object.prototype.hasOwnProperty.call(MULTI_HOST_BUILTIN_SITES, siteId)

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

const normalizeInstanceHost = (origin: string): string | null => {
  const normalized = tryNormalizeSiteOrigin(origin)
  if (!normalized) return null

  try {
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return null
  }
}

/** 已知多 host 按 origin 分区；host 缺失或未知时归主分区，避免数据散落。 */
const resolveMultiHostPartition = (
  config: { hosts: readonly string[]; primaryHost: string },
  origin?: string | null,
): string => {
  const host = origin ? normalizeInstanceHost(origin) : null
  return host && config.hosts.includes(host) ? host : config.primaryHost
}

export const createSiteInstanceKey = (siteId: string, origin?: string): string => {
  const multiHost = MULTI_HOST_BUILTIN_SITES[siteId]
  if (multiHost) {
    const host = resolveMultiHostPartition(multiHost, origin)
    return `${siteId}${SITE_INSTANCE_ORIGIN_SEPARATOR}https://${host}`
  }

  if (!isSitePackSiteId(siteId)) return siteId
  if (!origin) {
    throw new TypeError(`SitePack instance ${siteId} requires a runtime origin`)
  }

  return `${siteId}${SITE_INSTANCE_ORIGIN_SEPARATOR}${normalizeSiteOrigin(origin)}`
}

/**
 * 内置站点能否认领仅按 siteId 保存的旧数据。
 * 多 host 站点只有主 host 认领（旧数据无法区分归属，归主站损失最小）。
 */
export const canBuiltinSiteClaimLegacyData = (siteId: string, origin?: string): boolean => {
  const multiHost = MULTI_HOST_BUILTIN_SITES[siteId]
  // SitePack 的裸 id 旧数据无法归属到具体 origin，保持不认领（与原行为一致）
  if (!multiHost) return !isSitePackSiteId(siteId)
  return resolveMultiHostPartition(multiHost, origin) === multiHost.primaryHost
}

export const createSiteScopedStorageKey = (siteInstanceKey: string, resourceId: string): string =>
  `${SCOPED_STORAGE_KEY_VERSION}:${encodeURIComponent(siteInstanceKey)}:${encodeURIComponent(resourceId)}`

export const resolvePersistedSiteInstanceKey = (identity: PersistedSiteIdentity): string | null => {
  const storedInstanceKey = identity.siteInstanceKey?.trim()
  if (storedInstanceKey) {
    // 旧版为多 host 站点写入的裸 siteId 实例键不含分区信息，按 URL 重新归属
    if (MULTI_HOST_BUILTIN_SITES[storedInstanceKey]) {
      return createSiteInstanceKey(storedInstanceKey, identity.url ?? undefined)
    }
    return storedInstanceKey
  }

  const siteId = identity.siteId?.trim()
  if (!siteId) return null
  if (MULTI_HOST_BUILTIN_SITES[siteId]) {
    return createSiteInstanceKey(siteId, identity.url ?? undefined)
  }
  if (!isSitePackSiteId(siteId)) return siteId

  const origin = tryNormalizeSiteOrigin(identity.url)
  return origin ? createSiteInstanceKey(siteId, origin) : null
}
