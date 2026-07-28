import {
  resolveSiteConfig,
  SITE_PACK_MAX_BYTES,
  isValidSemanticVersion,
  validateSiteConfigPatch,
  validateSitePackManifest,
  type SiteConfigPatch,
  type SitePackManifest,
} from "~adapters/declarative"

import {
  createEmptyRemoteConfigChangeSummary,
  createEmptyRemoteConfigState,
  DEFAULT_REMOTE_CONFIG_SOURCES,
  isAppVersionCompatible,
  REMOTE_CONFIG_CHECK_INTERVAL_MS,
  REMOTE_CONFIG_MAX_INDEX_BYTES,
  REMOTE_CONFIG_STORAGE_KEY,
  REMOTE_CONFIG_STORAGE_SCHEMA_VERSION,
  validateRemoteConfigRegistryIndex,
  type BuiltinConfigDescriptor,
  type CachedSiteConfigPatch,
  type CachedSitePack,
  type RegistryPackIndexEntry,
  type RegistryPatchIndexEntry,
  type RegistryTransport,
  type RemoteConfigChangeSummary,
  type RemoteConfigCheckResult,
  type RemoteConfigSnapshot,
  type RemoteConfigSourceFailure,
  type RemoteConfigState,
  type RemoteConfigStorage,
  type ResolveBuiltinConfig,
} from "./remote-config-types"

export * from "./remote-config-types"

export interface RemoteConfigManagerOptions {
  storage: RemoteConfigStorage
  transport: RegistryTransport
  appVersion: string
  resolveBuiltinConfig: ResolveBuiltinConfig
  sources?: readonly string[]
  checkIntervalMs?: number
  now?: () => number
}

export interface CheckRemoteConfigOptions {
  force?: boolean
}

export interface IgnoreRemotePatchOptions {
  patchVersion?: number
}

interface CandidateBuildResult {
  snapshot: RemoteConfigSnapshot
  ignoredPatches: Record<string, number>
  changes: RemoteConfigChangeSummary
}

interface SourceCheckResult extends CandidateBuildResult {
  sourceUrl: string
}

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

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const normalizeSourceUrl = (source: string): string => {
  const url = new URL(source)
  const isLocalDevSource =
    url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
  if (url.protocol !== "https:" && !isLocalDevSource) {
    throw new TypeError(`Registry source must use HTTPS: ${source}`)
  }
  return url.href
}

const decodeJson = (bytes: Uint8Array, url: string): unknown => {
  let text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new SyntaxError(`Invalid JSON from ${url}: ${toErrorMessage(error)}`)
  }
}

const digestSha256 = async (bytes: Uint8Array): Promise<string> => {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto SHA-256 is unavailable")
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

const fetchBytes = async (
  transport: RegistryTransport,
  url: string,
  maxBytes: number,
): Promise<Uint8Array> => {
  const bytes = await transport(url, maxBytes)
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError(`Registry transport returned an invalid payload for ${url}`)
  }
  if (bytes.byteLength === 0) {
    throw new Error(`Registry response is empty: ${url}`)
  }
  if (bytes.byteLength > maxBytes) {
    throw new Error(`Registry response exceeds ${maxBytes} bytes: ${url}`)
  }
  return bytes
}

const fetchJson = async (
  transport: RegistryTransport,
  url: string,
  maxBytes: number,
): Promise<unknown> => decodeJson(await fetchBytes(transport, url, maxBytes), url)

const sameStringArray = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const samePackIndexEntry = (left: RegistryPackIndexEntry, right: RegistryPackIndexEntry): boolean =>
  left.id === right.id &&
  left.version === right.version &&
  left.minAppVersion === right.minAppVersion &&
  sameStringArray(left.matches, right.matches) &&
  left.file === right.file &&
  left.sha256 === right.sha256 &&
  left.disabled === right.disabled

const samePatchIndexEntry = (
  left: RegistryPatchIndexEntry,
  right: RegistryPatchIndexEntry,
): boolean =>
  left.targetSiteId === right.targetSiteId &&
  left.patchVersion === right.patchVersion &&
  left.baseConfigVersion === right.baseConfigVersion &&
  left.minAppVersion === right.minAppVersion &&
  left.maxAppVersion === right.maxAppVersion &&
  left.file === right.file &&
  left.sha256 === right.sha256 &&
  left.disabled === right.disabled

const sameRegistryIndex = (
  left: RemoteConfigSnapshot["index"],
  right: RemoteConfigSnapshot["index"],
): boolean =>
  left.generatedAt === right.generatedAt &&
  left.schemaVersion === right.schemaVersion &&
  left.registryRevision === right.registryRevision &&
  left.packs.length === right.packs.length &&
  left.patches.length === right.patches.length &&
  left.packs.every((entry, index) => samePackIndexEntry(entry, right.packs[index])) &&
  left.patches.every((entry, index) => samePatchIndexEntry(entry, right.patches[index]))

const sameArtifactRecord = <T extends { index: { sha256: string; file: string } }>(
  left: Record<string, T>,
  right: Record<string, T>,
): boolean => {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        right[key]?.index.sha256 === left[key].index.sha256 &&
        right[key]?.index.file === left[key].index.file,
    )
  )
}

const sameSnapshotContent = (
  left: RemoteConfigSnapshot | undefined,
  right: RemoteConfigSnapshot,
): boolean =>
  Boolean(
    left &&
      sameRegistryIndex(left.index, right.index) &&
      sameArtifactRecord(left.packs, right.packs) &&
      sameArtifactRecord(left.patches, right.patches),
  )

const sameIgnoredPatches = (
  left: Record<string, number>,
  right: Record<string, number>,
): boolean => {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => right[key] === left[key])
}

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

export async function loadActiveSiteConfigPatch(
  storage: RemoteConfigStorage,
  siteId: string,
): Promise<SiteConfigPatch | undefined> {
  const state = await loadRemoteConfigState(storage)
  const cached = state.active?.patches[siteId]
  return isCachedSiteConfigPatchShape(cached) ? cached.patch : undefined
}

const isCachedSitePackShape = (value: unknown): value is CachedSitePack => {
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

const isCachedSiteConfigPatchShape = (value: unknown): value is CachedSiteConfigPatch => {
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

const validatePackMetadata = (manifest: SitePackManifest, entry: RegistryPackIndexEntry): void => {
  if (
    manifest.id !== entry.id ||
    manifest.version !== entry.version ||
    manifest.minAppVersion !== entry.minAppVersion ||
    !sameStringArray(manifest.matches, entry.matches)
  ) {
    throw new Error(`Pack metadata does not match registry index: ${entry.id}`)
  }
}

const validatePatchMetadata = (patch: SiteConfigPatch, entry: RegistryPatchIndexEntry): void => {
  if (
    patch.targetSiteId !== entry.targetSiteId ||
    patch.patchVersion !== entry.patchVersion ||
    patch.baseConfigVersion !== entry.baseConfigVersion ||
    patch.minAppVersion !== entry.minAppVersion ||
    patch.maxAppVersion !== entry.maxAppVersion
  ) {
    throw new Error(`Patch metadata does not match registry index: ${entry.targetSiteId}`)
  }
}

const validatePatchAgainstBuiltin = (
  patch: unknown,
  descriptor: BuiltinConfigDescriptor,
  appVersion: string,
): SiteConfigPatch => {
  const allowedPrivateSelectorKeys = Object.keys(descriptor.baseConfig.sitePrivateSelectors ?? {})
  const validation = validateSiteConfigPatch(patch, { allowedPrivateSelectorKeys })
  if (!validation.valid) {
    throw new Error(
      `Patch validation failed: ${validation.errors
        .map((error) => `${error.path} ${error.message}`)
        .join("; ")}`,
    )
  }
  const resolved = resolveSiteConfig({
    siteId: descriptor.siteId,
    appVersion,
    configVersion: descriptor.configVersion,
    baseConfig: descriptor.baseConfig,
    remotePatch: validation.value,
  })
  if (resolved.remotePatch.status !== "applied") {
    throw new Error(
      `Patch could not be merged for ${descriptor.siteId}: ${resolved.remotePatch.reason ?? resolved.remotePatch.stage ?? resolved.remotePatch.status}`,
    )
  }
  return validation.value
}

const isPatchCompatibleWithBuiltin = (
  entry: RegistryPatchIndexEntry,
  descriptor: BuiltinConfigDescriptor | null,
  appVersion: string,
): descriptor is BuiltinConfigDescriptor =>
  Boolean(
    descriptor &&
      descriptor.siteId === entry.targetSiteId &&
      descriptor.configVersion === entry.baseConfigVersion &&
      isAppVersionCompatible(appVersion, entry.minAppVersion, entry.maxAppVersion),
  )

const isCachedPackReusable = (
  cached: CachedSitePack | undefined,
  entry: RegistryPackIndexEntry,
): cached is CachedSitePack => {
  if (!isCachedSitePackShape(cached) || !samePackIndexEntry(cached.index, entry)) return false
  const validation = validateSitePackManifest(cached.manifest)
  if (!validation.valid) return false
  try {
    validatePackMetadata(validation.value, entry)
    return true
  } catch {
    return false
  }
}

const isCachedPatchReusable = (
  cached: CachedSiteConfigPatch | undefined,
  entry: RegistryPatchIndexEntry,
  descriptor: BuiltinConfigDescriptor,
  appVersion: string,
): cached is CachedSiteConfigPatch => {
  if (!isCachedSiteConfigPatchShape(cached) || !samePatchIndexEntry(cached.index, entry)) {
    return false
  }
  try {
    validatePatchMetadata(cached.patch, entry)
    validatePatchAgainstBuiltin(cached.patch, descriptor, appVersion)
    return true
  } catch {
    return false
  }
}

const isCachedPackCurrentlyCompatible = (
  cached: CachedSitePack | undefined,
  appVersion: string,
): cached is CachedSitePack => {
  if (
    !isCachedSitePackShape(cached) ||
    !isAppVersionCompatible(appVersion, cached.manifest.minAppVersion)
  ) {
    return false
  }
  const validation = validateSitePackManifest(cached.manifest)
  if (!validation.valid) return false
  try {
    validatePackMetadata(validation.value, cached.index)
    return true
  } catch {
    return false
  }
}

const isCachedPatchCurrentlyCompatible = (
  cached: CachedSiteConfigPatch | undefined,
  descriptor: BuiltinConfigDescriptor | null,
  appVersion: string,
): cached is CachedSiteConfigPatch => {
  if (
    !isCachedSiteConfigPatchShape(cached) ||
    !isPatchCompatibleWithBuiltin(cached.index, descriptor, appVersion)
  ) {
    return false
  }
  try {
    validatePatchMetadata(cached.patch, cached.index)
    validatePatchAgainstBuiltin(cached.patch, descriptor, appVersion)
    return true
  } catch {
    return false
  }
}

export class RemoteConfigManager {
  private readonly storage: RemoteConfigStorage
  private readonly transport: RegistryTransport
  private readonly appVersion: string
  private readonly resolveBuiltinConfig: ResolveBuiltinConfig
  private readonly sources: readonly string[]
  private readonly checkIntervalMs: number
  private readonly now: () => number
  private mutationQueue: Promise<void> = Promise.resolve()

  constructor(options: RemoteConfigManagerOptions) {
    if (options.sources?.length === 0) {
      throw new TypeError("At least one registry source is required")
    }
    if (
      !Number.isFinite(options.checkIntervalMs ?? REMOTE_CONFIG_CHECK_INTERVAL_MS) ||
      (options.checkIntervalMs ?? REMOTE_CONFIG_CHECK_INTERVAL_MS) <= 0
    ) {
      throw new TypeError("checkIntervalMs must be a positive finite number")
    }
    if (!isValidSemanticVersion(options.appVersion)) {
      throw new TypeError(`Invalid appVersion: ${options.appVersion}`)
    }
    this.storage = options.storage
    this.transport = options.transport
    this.appVersion = options.appVersion
    this.resolveBuiltinConfig = options.resolveBuiltinConfig
    this.sources = (options.sources ?? DEFAULT_REMOTE_CONFIG_SOURCES).map(normalizeSourceUrl)
    this.checkIntervalMs = options.checkIntervalMs ?? REMOTE_CONFIG_CHECK_INTERVAL_MS
    this.now = options.now ?? Date.now
  }

  getState(): Promise<RemoteConfigState> {
    return this.enqueue(() => loadRemoteConfigState(this.storage))
  }

  checkForUpdates(options: CheckRemoteConfigOptions = {}): Promise<RemoteConfigCheckResult> {
    return this.enqueue(() => this.performCheck(options.force === true))
  }

  ignorePatch(siteId: string, options: IgnoreRemotePatchOptions = {}): Promise<boolean> {
    return this.enqueue(async () => {
      if (!SITE_ID_PATTERN.test(siteId)) return false
      const state = await loadRemoteConfigState(this.storage)
      const activePatch = state.active?.patches[siteId]
      const patchVersion = options.patchVersion ?? activePatch?.patch.patchVersion
      if (!Number.isSafeInteger(patchVersion) || (patchVersion as number) < 1) {
        return false
      }

      const nextIgnored = {
        ...state.ignoredPatches,
        [siteId]: Math.max(state.ignoredPatches[siteId] ?? 0, patchVersion as number),
      }
      let nextActive = state.active
      if (activePatch && state.active) {
        const patches = { ...state.active.patches }
        delete patches[siteId]
        nextActive = { ...state.active, patches }
      }
      const nextState: RemoteConfigState = {
        ...state,
        ignoredPatches: nextIgnored,
      }
      if (nextActive) nextState.active = nextActive
      await this.storage.set<RemoteConfigState>(REMOTE_CONFIG_STORAGE_KEY, nextState)
      return true
    })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation)
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async performCheck(force: boolean): Promise<RemoteConfigCheckResult> {
    const checkedAt = this.now()
    const state = await loadRemoteConfigState(this.storage)
    const emptyChanges = createEmptyRemoteConfigChangeSummary()
    if (
      !force &&
      state.lastCheckAt !== undefined &&
      checkedAt - state.lastCheckAt < this.checkIntervalMs
    ) {
      return {
        status: "throttled",
        checkedAt,
        registryRevision: state.active?.index.registryRevision ?? 0,
        sourceUrl: state.active?.sourceUrl,
        nextCheckAt: state.lastCheckAt + this.checkIntervalMs,
        changes: emptyChanges,
      }
    }

    const sourceFailures: RemoteConfigSourceFailure[] = []
    for (const sourceUrl of this.sources) {
      try {
        const sourceResult = await this.checkSource(sourceUrl, state)
        const contentChanged =
          !sameSnapshotContent(state.active, sourceResult.snapshot) ||
          !sameIgnoredPatches(state.ignoredPatches, sourceResult.ignoredPatches)
        const { lastError: _lastError, ...stateWithoutError } = state
        const nextState: RemoteConfigState = {
          ...stateWithoutError,
          active: sourceResult.snapshot,
          ignoredPatches: sourceResult.ignoredPatches,
          lastCheckAt: checkedAt,
          lastSuccessAt: checkedAt,
        }
        await this.storage.set(REMOTE_CONFIG_STORAGE_KEY, nextState)
        return {
          status: contentChanged ? "updated" : "up-to-date",
          checkedAt,
          registryRevision: sourceResult.snapshot.index.registryRevision,
          sourceUrl: sourceResult.sourceUrl,
          changes: sourceResult.changes,
        }
      } catch (error) {
        sourceFailures.push({ sourceUrl, message: toErrorMessage(error) })
      }
    }

    const message = sourceFailures.map((failure) => failure.message).join(" | ")
    await this.storage.set<RemoteConfigState>(REMOTE_CONFIG_STORAGE_KEY, {
      ...state,
      lastCheckAt: checkedAt,
      lastError: {
        at: checkedAt,
        message,
        sources: sourceFailures,
      },
    })
    return {
      status: "failed",
      checkedAt,
      registryRevision: state.active?.index.registryRevision ?? 0,
      sourceUrl: state.active?.sourceUrl,
      error: message,
      changes: emptyChanges,
    }
  }

  private async checkSource(
    sourceUrl: string,
    state: RemoteConfigState,
  ): Promise<SourceCheckResult> {
    const value = await fetchJson(this.transport, sourceUrl, REMOTE_CONFIG_MAX_INDEX_BYTES)
    const index = validateRemoteConfigRegistryIndex(value)
    const currentRevision = state.active?.index.registryRevision ?? 0
    if (index.registryRevision < currentRevision) {
      throw new Error(
        `Stale registry revision ${index.registryRevision}; local revision is ${currentRevision}`,
      )
    }
    if (
      state.active &&
      index.registryRevision === currentRevision &&
      !sameRegistryIndex(state.active.index, index)
    ) {
      throw new Error(`Registry revision ${index.registryRevision} was reused with different data`)
    }

    const candidate = await this.buildCandidateSnapshot(sourceUrl, index, state)
    return { ...candidate, sourceUrl }
  }

  private async buildCandidateSnapshot(
    sourceUrl: string,
    index: RemoteConfigSnapshot["index"],
    state: RemoteConfigState,
  ): Promise<CandidateBuildResult> {
    const changes = createEmptyRemoteConfigChangeSummary()
    const currentPacks = state.active?.packs ?? {}
    const currentPatches = state.active?.patches ?? {}
    const ignoredPatches = { ...state.ignoredPatches }

    const packResults = await Promise.all(
      index.packs.map(async (entry): Promise<[string, CachedSitePack] | null> => {
        const storedCurrent = currentPacks[entry.id]
        const current = isCachedSitePackShape(storedCurrent) ? storedCurrent : undefined
        if (entry.disabled) {
          changes.disabledPacks += 1
          return null
        }
        if (!isAppVersionCompatible(this.appVersion, entry.minAppVersion)) {
          changes.incompatiblePacks += 1
          return isCachedPackCurrentlyCompatible(current, this.appVersion)
            ? [entry.id, current]
            : null
        }
        if (current && entry.version < current.index.version) {
          throw new Error(
            `Pack version rollback for ${entry.id}: ${entry.version} < ${current.index.version}`,
          )
        }
        if (
          current &&
          entry.version === current.index.version &&
          !samePackIndexEntry(current.index, entry)
        ) {
          throw new Error(`Pack version ${entry.version} was reused for ${entry.id}`)
        }
        if (isCachedPackReusable(current, entry)) return [entry.id, current]

        const artifactUrl = new URL(entry.file, sourceUrl).href
        const bytes = await fetchBytes(this.transport, artifactUrl, SITE_PACK_MAX_BYTES)
        const digest = await digestSha256(bytes)
        if (digest !== entry.sha256) {
          throw new Error(`SHA-256 mismatch for ${entry.file}`)
        }
        const value = decodeJson(bytes, artifactUrl)
        const validation = validateSitePackManifest(value)
        if (!validation.valid) {
          throw new Error(
            `Pack validation failed: ${validation.errors
              .map((error) => `${error.path} ${error.message}`)
              .join("; ")}`,
          )
        }
        validatePackMetadata(validation.value, entry)
        changes.downloadedPacks += 1
        return [entry.id, { index: entry, manifest: validation.value }]
      }),
    )

    const patchResults = await Promise.all(
      index.patches.map(async (entry): Promise<[string, CachedSiteConfigPatch] | null> => {
        const storedCurrent = currentPatches[entry.targetSiteId]
        const current = isCachedSiteConfigPatchShape(storedCurrent) ? storedCurrent : undefined
        if (entry.disabled) {
          changes.disabledPatches += 1
          return null
        }

        const ignoredVersion = ignoredPatches[entry.targetSiteId]
        if (ignoredVersion !== undefined && entry.patchVersion <= ignoredVersion) {
          changes.ignoredPatches += 1
          return null
        }

        const descriptor = await this.resolveBuiltinConfig(entry.targetSiteId)
        if (!isPatchCompatibleWithBuiltin(entry, descriptor, this.appVersion)) {
          changes.incompatiblePatches += 1
          return isCachedPatchCurrentlyCompatible(current, descriptor, this.appVersion)
            ? [entry.targetSiteId, current]
            : null
        }
        if (current && entry.patchVersion < current.index.patchVersion) {
          throw new Error(
            `Patch version rollback for ${entry.targetSiteId}: ${entry.patchVersion} < ${current.index.patchVersion}`,
          )
        }
        if (
          current &&
          entry.patchVersion === current.index.patchVersion &&
          !samePatchIndexEntry(current.index, entry)
        ) {
          throw new Error(
            `Patch version ${entry.patchVersion} was reused for ${entry.targetSiteId}`,
          )
        }
        if (isCachedPatchReusable(current, entry, descriptor, this.appVersion)) {
          if (ignoredVersion !== undefined && entry.patchVersion > ignoredVersion) {
            delete ignoredPatches[entry.targetSiteId]
          }
          return [entry.targetSiteId, current]
        }

        const artifactUrl = new URL(entry.file, sourceUrl).href
        const bytes = await fetchBytes(this.transport, artifactUrl, SITE_PACK_MAX_BYTES)
        const digest = await digestSha256(bytes)
        if (digest !== entry.sha256) {
          throw new Error(`SHA-256 mismatch for ${entry.file}`)
        }
        const value = decodeJson(bytes, artifactUrl)
        const patch = validatePatchAgainstBuiltin(value, descriptor, this.appVersion)
        validatePatchMetadata(patch, entry)
        if (ignoredVersion !== undefined && entry.patchVersion > ignoredVersion) {
          delete ignoredPatches[entry.targetSiteId]
        }
        changes.downloadedPatches += 1
        return [entry.targetSiteId, { index: entry, patch }]
      }),
    )

    const packs = Object.fromEntries(
      packResults.filter((entry): entry is [string, CachedSitePack] => entry !== null),
    )
    const patches = Object.fromEntries(
      patchResults.filter((entry): entry is [string, CachedSiteConfigPatch] => entry !== null),
    )
    changes.removedPacks = Object.keys(currentPacks).filter((id) => !(id in packs)).length
    changes.removedPatches = Object.keys(currentPatches).filter(
      (siteId) => !(siteId in patches),
    ).length

    return {
      snapshot: { sourceUrl, index, packs, patches },
      ignoredPatches,
      changes,
    }
  }
}
