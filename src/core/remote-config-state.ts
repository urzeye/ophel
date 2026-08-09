import {
  REMOTE_CONFIG_STORAGE_KEY,
  REMOTE_CONFIG_STORAGE_SCHEMA_VERSION,
} from "./remote-config-storage-constants"
import {
  createEmptyRemoteConfigState,
  validateRemoteConfigRegistryIndex,
  type CachedSiteConfigPatch,
  type CachedSitePack,
  type LocalSiteConfigPatchRecord,
  type RemoteConfigSnapshot,
  type RemoteConfigSourceFailure,
  type RemoteConfigState,
  type RemoteConfigStorage,
} from "./remote-config-types"

class RemoteConfigStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RemoteConfigStateError"
  }
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const SITE_ID_PATTERN = /^[a-z0-9-]{2,40}$/
const MIN_UNIX_MILLISECONDS = 1_000_000_000_000

const validateStoredTimestamp = (value: unknown, path: string): number | undefined => {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value) || (value as number) < MIN_UNIX_MILLISECONDS) {
    throw new RemoteConfigStateError(`${path} must be a Unix millisecond timestamp`)
  }
  return value as number
}

const parseIgnoredPatches = (value: unknown): Record<string, number> => {
  if (!isPlainRecord(value)) {
    throw new RemoteConfigStateError("ignoredPatches must be an object")
  }
  const ignored: Record<string, number> = {}
  for (const [siteId, patchVersion] of Object.entries(value)) {
    if (!SITE_ID_PATTERN.test(siteId)) {
      throw new RemoteConfigStateError(`ignoredPatches contains an invalid site id: ${siteId}`)
    }
    if (!Number.isSafeInteger(patchVersion) || (patchVersion as number) < 1) {
      throw new RemoteConfigStateError(`ignoredPatches.${siteId} must be a positive integer`)
    }
    ignored[siteId] = patchVersion as number
  }
  return ignored
}

const parseLocalPatches = (value: unknown): Record<string, LocalSiteConfigPatchRecord> => {
  if (value === undefined) return {}
  if (!isPlainRecord(value)) {
    throw new RemoteConfigStateError("localPatches must be an object")
  }
  const localPatches: Record<string, LocalSiteConfigPatchRecord> = {}
  for (const [siteId, record] of Object.entries(value)) {
    if (!SITE_ID_PATTERN.test(siteId)) {
      throw new RemoteConfigStateError(`localPatches contains an invalid site id: ${siteId}`)
    }
    if (!isPlainRecord(record)) {
      throw new RemoteConfigStateError(`localPatches.${siteId} must be an object`)
    }
    if (
      !Number.isSafeInteger(record.installedAt) ||
      (record.installedAt as number) < MIN_UNIX_MILLISECONDS
    ) {
      throw new RemoteConfigStateError(
        `localPatches.${siteId}.installedAt must be a Unix millisecond timestamp`,
      )
    }
    if (!isPlainRecord(record.patch)) {
      throw new RemoteConfigStateError(`localPatches.${siteId}.patch must be an object`)
    }
    if (record.fileName !== undefined && typeof record.fileName !== "string") {
      throw new RemoteConfigStateError(`localPatches.${siteId}.fileName must be a string`)
    }
    const entry: LocalSiteConfigPatchRecord = {
      installedAt: record.installedAt as number,
      patch: record.patch as unknown as LocalSiteConfigPatchRecord["patch"],
    }
    if (typeof record.fileName === "string" && record.fileName.length > 0) {
      entry.fileName = record.fileName
    }
    localPatches[siteId] = entry
  }
  return localPatches
}

const parseStoredSnapshot = (value: unknown): RemoteConfigSnapshot | undefined => {
  if (value === undefined) return undefined
  if (!isPlainRecord(value)) {
    throw new RemoteConfigStateError("active snapshot must be an object")
  }
  if (typeof value.sourceUrl !== "string") {
    throw new RemoteConfigStateError("active.sourceUrl must be a string")
  }
  const index = validateRemoteConfigRegistryIndex(value.index)
  if (!isPlainRecord(value.packs) || !isPlainRecord(value.patches)) {
    throw new RemoteConfigStateError("active artifact maps must be objects")
  }
  return {
    sourceUrl: value.sourceUrl,
    index,
    packs: value.packs as Record<string, CachedSitePack>,
    patches: value.patches as Record<string, CachedSiteConfigPatch>,
  }
}

const parseStoredState = (value: unknown): RemoteConfigState => {
  if (value === undefined) return createEmptyRemoteConfigState()
  if (!isPlainRecord(value)) {
    throw new RemoteConfigStateError("Remote config state must be an object")
  }
  if (value.storageSchemaVersion !== REMOTE_CONFIG_STORAGE_SCHEMA_VERSION) {
    throw new RemoteConfigStateError(
      `Unsupported remote config storage schema: ${String(value.storageSchemaVersion)}`,
    )
  }

  const state: RemoteConfigState = {
    storageSchemaVersion: REMOTE_CONFIG_STORAGE_SCHEMA_VERSION,
    localPatches: parseLocalPatches(value.localPatches),
    ignoredPatches: parseIgnoredPatches(value.ignoredPatches),
  }
  const active = parseStoredSnapshot(value.active)
  const lastCheckAt = validateStoredTimestamp(value.lastCheckAt, "lastCheckAt")
  const lastSuccessAt = validateStoredTimestamp(value.lastSuccessAt, "lastSuccessAt")
  if (active) state.active = active
  if (lastCheckAt !== undefined) state.lastCheckAt = lastCheckAt
  if (lastSuccessAt !== undefined) state.lastSuccessAt = lastSuccessAt
  if (value.lastError !== undefined && !isPlainRecord(value.lastError)) {
    throw new RemoteConfigStateError("lastError must be an object")
  }
  if (isPlainRecord(value.lastError)) {
    const at = validateStoredTimestamp(value.lastError.at, "lastError.at")
    const message = value.lastError.message
    const sources = value.lastError.sources
    if (
      at !== undefined &&
      typeof message === "string" &&
      Array.isArray(sources) &&
      sources.every(
        (source) =>
          isPlainRecord(source) &&
          typeof source.sourceUrl === "string" &&
          typeof source.message === "string",
      )
    ) {
      state.lastError = {
        at,
        message,
        sources: sources as RemoteConfigSourceFailure[],
      }
    } else {
      throw new RemoteConfigStateError("lastError is malformed")
    }
  }
  return state
}

export async function loadRemoteConfigState(
  storage: RemoteConfigStorage,
): Promise<RemoteConfigState> {
  return parseStoredState(await storage.get<unknown>(REMOTE_CONFIG_STORAGE_KEY))
}
