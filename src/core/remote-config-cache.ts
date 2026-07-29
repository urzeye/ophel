import type { SiteConfigPatch } from "~adapters/declarative/types"

import {
  REMOTE_CONFIG_STORAGE_KEY,
  REMOTE_CONFIG_STORAGE_SCHEMA_VERSION,
} from "./remote-config-storage-constants"
import type {
  CachedSiteConfigPatch,
  CachedSitePack,
  RemoteConfigStorage,
} from "./remote-config-types"

class RemoteConfigCacheError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RemoteConfigCacheError"
  }
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const SITE_ID_PATTERN = /^[a-z0-9-]{2,40}$/

export const isCachedSitePackShape = (value: unknown): value is CachedSitePack => {
  if (!isPlainRecord(value) || !isPlainRecord(value.index) || !isPlainRecord(value.manifest)) {
    return false
  }
  const index = value.index
  return (
    typeof index.id === "string" &&
    Number.isSafeInteger(index.version) &&
    typeof index.minAppVersion === "string" &&
    Array.isArray(index.matches) &&
    typeof index.file === "string" &&
    typeof index.sha256 === "string" &&
    typeof index.disabled === "boolean"
  )
}

export const isCachedSiteConfigPatchShape = (value: unknown): value is CachedSiteConfigPatch => {
  if (!isPlainRecord(value) || !isPlainRecord(value.index) || !isPlainRecord(value.patch)) {
    return false
  }
  const index = value.index
  return (
    typeof index.targetSiteId === "string" &&
    Number.isSafeInteger(index.patchVersion) &&
    Number.isSafeInteger(index.baseConfigVersion) &&
    typeof index.minAppVersion === "string" &&
    (index.maxAppVersion === undefined || typeof index.maxAppVersion === "string") &&
    typeof index.file === "string" &&
    typeof index.sha256 === "string" &&
    typeof index.disabled === "boolean"
  )
}

export async function loadActiveSiteConfigPatch(
  storage: RemoteConfigStorage,
  siteId: string,
): Promise<SiteConfigPatch | undefined> {
  if (!SITE_ID_PATTERN.test(siteId)) {
    throw new TypeError(`Invalid site id: ${siteId}`)
  }

  const stored = await storage.get<unknown>(REMOTE_CONFIG_STORAGE_KEY)
  if (stored === undefined) return undefined
  if (!isPlainRecord(stored)) {
    throw new RemoteConfigCacheError("Remote config state must be an object")
  }
  if (stored.storageSchemaVersion !== REMOTE_CONFIG_STORAGE_SCHEMA_VERSION) {
    throw new RemoteConfigCacheError(
      `Unsupported remote config storage schema: ${String(stored.storageSchemaVersion)}`,
    )
  }
  if (stored.active === undefined) return undefined
  if (!isPlainRecord(stored.active) || !isPlainRecord(stored.active.patches)) {
    throw new RemoteConfigCacheError("Remote config active patch map is malformed")
  }

  const cached = stored.active.patches[siteId]
  if (cached === undefined) return undefined
  if (!isCachedSiteConfigPatchShape(cached)) {
    throw new RemoteConfigCacheError(`Cached patch is malformed: ${siteId}`)
  }
  return cached.patch
}
