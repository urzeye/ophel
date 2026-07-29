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
  if (!isSitePackSiteId(siteId)) return siteId
  if (!origin) {
    throw new TypeError(`SitePack instance ${siteId} requires a runtime origin`)
  }

  return `${siteId}${SITE_INSTANCE_ORIGIN_SEPARATOR}${normalizeSiteOrigin(origin)}`
}

export const createSiteScopedStorageKey = (siteInstanceKey: string, resourceId: string): string =>
  `${SCOPED_STORAGE_KEY_VERSION}:${encodeURIComponent(siteInstanceKey)}:${encodeURIComponent(resourceId)}`

export const resolvePersistedSiteInstanceKey = (identity: PersistedSiteIdentity): string | null => {
  const storedInstanceKey = identity.siteInstanceKey?.trim()
  if (storedInstanceKey) return storedInstanceKey

  const siteId = identity.siteId?.trim()
  if (!siteId) return null
  if (!isSitePackSiteId(siteId)) return siteId

  const origin = tryNormalizeSiteOrigin(identity.url)
  return origin ? createSiteInstanceKey(siteId, origin) : null
}
