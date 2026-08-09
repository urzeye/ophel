import type { SiteConfigPatch } from "~adapters/declarative/types"

import { loadRemoteConfigState } from "./remote-config-state"
import type {
  ActiveSiteConfigPatchSource,
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

export interface LoadedSiteConfigPatch {
  patch: SiteConfigPatch
  source: ActiveSiteConfigPatchSource
  fileName?: string
  installedAt?: number
}

export async function loadActiveSiteConfigPatch(
  storage: RemoteConfigStorage,
  siteId: string,
): Promise<SiteConfigPatch | undefined> {
  const loaded = await loadActiveSiteConfigPatchDetails(storage, siteId)
  return loaded?.patch
}

export async function loadActiveSiteConfigPatchDetails(
  storage: RemoteConfigStorage,
  siteId: string,
): Promise<LoadedSiteConfigPatch | undefined> {
  if (!SITE_ID_PATTERN.test(siteId)) {
    throw new TypeError(`Invalid site id: ${siteId}`)
  }

  const state = await loadRemoteConfigState(storage)
  const local = state.localPatches[siteId]
  if (local) {
    return {
      patch: local.patch,
      source: "local",
      installedAt: local.installedAt,
      ...(local.fileName ? { fileName: local.fileName } : {}),
    }
  }

  const cached = state.active?.patches[siteId]
  if (cached === undefined) return undefined
  if (!isCachedSiteConfigPatchShape(cached)) {
    throw new RemoteConfigCacheError(`Cached patch is malformed: ${siteId}`)
  }
  return {
    patch: cached.patch,
    source: "registry",
  }
}
