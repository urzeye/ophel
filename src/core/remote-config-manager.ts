import { resolveSiteConfig } from "~adapters/declarative/merge"
import type { SiteConfigPatch, SitePackManifest } from "~adapters/declarative/types"
import {
  SITE_PACK_MAX_BYTES,
  isValidSemanticVersion,
  validateSiteConfigPatch,
  validateSitePackManifest,
} from "~adapters/declarative/validate"

import {
  createEmptyRemoteConfigChangeSummary,
  DEFAULT_REMOTE_CONFIG_SOURCES,
  isAppVersionCompatible,
  REMOTE_CONFIG_CHECK_INTERVAL_MS,
  REMOTE_CONFIG_MAX_INDEX_BYTES,
  REMOTE_CONFIG_MAX_SIGNATURE_BYTES,
  REMOTE_CONFIG_STORAGE_KEY,
  validateRemoteConfigRegistryIndex,
  type BuiltinConfigDescriptor,
  type CachedSiteConfigPatch,
  type CachedSitePack,
  type LocalSiteConfigPatchRecord,
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
import { isCachedSiteConfigPatchShape, isCachedSitePackShape } from "./remote-config-cache"
import {
  assertRegistrySigningKeyAllowsRevision,
  REGISTRY_INDEX_SIGNATURE_FILE_NAME,
  TRUSTED_REGISTRY_SIGNING_KEYS,
  verifyRegistryIndexSignature,
  type TrustedRegistrySigningKey,
} from "./remote-config-signature"
import { shouldRelaxRegistryRevisionGuards } from "./remote-config-local-dev"
import { normalizeRemoteConfigSourceUrl } from "./remote-config-source"
import { loadRemoteConfigState } from "./remote-config-state"

export * from "./remote-config-cache"
export * from "./remote-config-state"
export * from "./remote-config-types"

export interface RemoteConfigManagerOptions {
  storage: RemoteConfigStorage
  transport: RegistryTransport
  appVersion: string
  resolveBuiltinConfig: ResolveBuiltinConfig
  sources?: readonly string[]
  resolveSources?: ResolveRemoteConfigSources
  checkIntervalMs?: number
  now?: () => number
  trustedSigningKeys?: readonly TrustedRegistrySigningKey[]
}

export type ResolveRemoteConfigSources = () => readonly string[] | Promise<readonly string[]>

export interface CheckRemoteConfigOptions {
  force?: boolean
  /** One-shot source override; bypasses resolveSources/settings for this check only. */
  sources?: readonly string[]
}

export interface IgnoreRemotePatchOptions {
  patchVersion?: number
}

export interface InstallLocalPatchOptions {
  fileName?: string
}

export interface LocalPatchMutationResult {
  changed: boolean
  siteId: string
  record?: LocalSiteConfigPatchRecord
}

interface CandidateBuildResult {
  snapshot: RemoteConfigSnapshot
  ignoredPatches: Record<string, number>
  changes: RemoteConfigChangeSummary
}

interface SourceCheckResult extends CandidateBuildResult {
  sourceUrl: string
}

const SITE_ID_PATTERN = /^[a-z0-9-]{2,40}$/

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

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
  private readonly resolveSources?: ResolveRemoteConfigSources
  private readonly checkIntervalMs: number
  private readonly now: () => number
  private readonly trustedSigningKeys: readonly TrustedRegistrySigningKey[]
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
    this.sources = (options.sources ?? DEFAULT_REMOTE_CONFIG_SOURCES).map(
      normalizeRemoteConfigSourceUrl,
    )
    this.resolveSources = options.resolveSources
    this.checkIntervalMs = options.checkIntervalMs ?? REMOTE_CONFIG_CHECK_INTERVAL_MS
    this.now = options.now ?? Date.now
    this.trustedSigningKeys = options.trustedSigningKeys ?? TRUSTED_REGISTRY_SIGNING_KEYS
  }

  getState(): Promise<RemoteConfigState> {
    return this.enqueue(() => loadRemoteConfigState(this.storage))
  }

  checkForUpdates(options: CheckRemoteConfigOptions = {}): Promise<RemoteConfigCheckResult> {
    return this.enqueue(() => this.performCheck(options.force === true, options.sources))
  }

  ignorePatch(siteId: string, options: IgnoreRemotePatchOptions = {}): Promise<boolean> {
    return this.enqueue(async () => {
      if (!SITE_ID_PATTERN.test(siteId)) return false
      const state = await loadRemoteConfigState(this.storage)
      const activePatch = state.active?.patches[siteId]
      const localPatch = state.localPatches[siteId]
      const hasLocal = localPatch !== undefined
      const hasRemote = activePatch !== undefined
      if (!hasLocal && !hasRemote) return false
      if (
        options.patchVersion !== undefined &&
        (!Number.isSafeInteger(options.patchVersion) || options.patchVersion < 1)
      ) {
        return false
      }

      const candidateVersions = [
        options.patchVersion,
        activePatch?.patch.patchVersion,
        localPatch?.patch.patchVersion,
      ].filter((value): value is number => Number.isSafeInteger(value) && (value as number) >= 1)
      const patchVersion = candidateVersions.length > 0 ? Math.max(...candidateVersions) : undefined

      const nextIgnored = { ...state.ignoredPatches }
      if (patchVersion !== undefined) {
        nextIgnored[siteId] = Math.max(state.ignoredPatches[siteId] ?? 0, patchVersion)
      }

      let nextActive = state.active
      if (activePatch && state.active) {
        const patches = { ...state.active.patches }
        delete patches[siteId]
        nextActive = { ...state.active, patches }
      }

      const localPatches = { ...state.localPatches }
      delete localPatches[siteId]

      const nextState: RemoteConfigState = {
        ...state,
        localPatches,
        ignoredPatches: nextIgnored,
      }
      if (nextActive) nextState.active = nextActive
      else delete nextState.active
      await this.storage.set<RemoteConfigState>(REMOTE_CONFIG_STORAGE_KEY, nextState)
      return true
    })
  }

  installLocalPatch(
    patchInput: unknown,
    options: InstallLocalPatchOptions = {},
  ): Promise<LocalPatchMutationResult> {
    return this.enqueue(async () => {
      if (!isPlainRecord(patchInput)) {
        throw new TypeError("Local patch must be an object")
      }
      const targetSiteId = patchInput.targetSiteId
      if (typeof targetSiteId !== "string" || !SITE_ID_PATTERN.test(targetSiteId)) {
        throw new TypeError(`Invalid local patch targetSiteId: ${String(targetSiteId)}`)
      }

      const descriptor = await this.resolveBuiltinConfig(targetSiteId)
      if (!descriptor) {
        throw new Error(`No configurable built-in adapter for site: ${targetSiteId}`)
      }

      const patch = validatePatchAgainstBuiltin(patchInput, descriptor, this.appVersion)
      const state = await loadRemoteConfigState(this.storage)
      const installedAt = this.getTimestamp()
      const record: LocalSiteConfigPatchRecord = {
        installedAt,
        patch,
      }
      const fileName = options.fileName?.trim()
      if (fileName) record.fileName = fileName

      const previous = state.localPatches[targetSiteId]
      const unchanged =
        previous !== undefined &&
        previous.patch.patchVersion === patch.patchVersion &&
        previous.patch.baseConfigVersion === patch.baseConfigVersion &&
        previous.fileName === record.fileName &&
        JSON.stringify(previous.patch) === JSON.stringify(patch)
      if (unchanged) {
        return { changed: false, siteId: targetSiteId, record: previous }
      }

      const nextState: RemoteConfigState = {
        ...state,
        localPatches: {
          ...state.localPatches,
          [targetSiteId]: record,
        },
      }
      await this.storage.set<RemoteConfigState>(REMOTE_CONFIG_STORAGE_KEY, nextState)
      return { changed: true, siteId: targetSiteId, record }
    })
  }

  removeLocalPatch(siteId: string): Promise<LocalPatchMutationResult> {
    return this.enqueue(async () => {
      if (!SITE_ID_PATTERN.test(siteId)) {
        return { changed: false, siteId }
      }
      const state = await loadRemoteConfigState(this.storage)
      if (state.localPatches[siteId] === undefined) {
        return { changed: false, siteId }
      }
      const localPatches = { ...state.localPatches }
      delete localPatches[siteId]
      const nextState: RemoteConfigState = {
        ...state,
        localPatches,
      }
      await this.storage.set<RemoteConfigState>(REMOTE_CONFIG_STORAGE_KEY, nextState)
      return { changed: true, siteId }
    })
  }

  /**
   * Drop the cached registry snapshot without touching localPatches.
   * Used by development source switching and recovery from poisoned revisions.
   */
  clearCachedRegistrySnapshot(): Promise<boolean> {
    return this.enqueue(async () => {
      const state = await loadRemoteConfigState(this.storage)
      const hasActive = state.active !== undefined
      const hasError = state.lastError !== undefined
      if (!hasActive && !hasError) return false

      const nextState: RemoteConfigState = {
        storageSchemaVersion: state.storageSchemaVersion,
        localPatches: state.localPatches,
        ignoredPatches: state.ignoredPatches,
      }
      if (state.lastCheckAt !== undefined) nextState.lastCheckAt = state.lastCheckAt
      // Keep lastSuccessAt only as historical signal when no active snapshot remains.
      if (state.lastSuccessAt !== undefined) nextState.lastSuccessAt = state.lastSuccessAt
      await this.storage.set<RemoteConfigState>(REMOTE_CONFIG_STORAGE_KEY, nextState)
      return true
    })
  }

  private getTimestamp(): number {
    const timestamp = this.now()
    if (!Number.isSafeInteger(timestamp) || timestamp < 1_000_000_000_000) {
      throw new TypeError(
        `RemoteConfigManager now() must return a Unix millisecond timestamp: ${timestamp}`,
      )
    }
    return timestamp
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation)
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async performCheck(
    force: boolean,
    sourceOverride?: readonly string[],
  ): Promise<RemoteConfigCheckResult> {
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

    const sourceUrls = await this.getSourceUrls(sourceOverride)
    const sourceFailures: RemoteConfigSourceFailure[] = []
    for (const sourceUrl of sourceUrls) {
      try {
        const sourceResult = await this.checkSource(sourceUrl, state)
        const contentChanged =
          !sameSnapshotContent(state.active, sourceResult.snapshot) ||
          !sameIgnoredPatches(state.ignoredPatches, sourceResult.ignoredPatches)
        const { lastError: _lastError, ...stateWithoutError } = state
        const nextState: RemoteConfigState = {
          ...stateWithoutError,
          active: sourceResult.snapshot,
          localPatches: state.localPatches,
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

  private async getSourceUrls(sourceOverride?: readonly string[]): Promise<readonly string[]> {
    const sources =
      sourceOverride && sourceOverride.length > 0
        ? sourceOverride
        : this.resolveSources
          ? await this.resolveSources()
          : this.sources
    if (sources.length === 0) {
      throw new TypeError("At least one registry source is required")
    }
    return sources.map(normalizeRemoteConfigSourceUrl)
  }

  private async checkSource(
    sourceUrl: string,
    state: RemoteConfigState,
  ): Promise<SourceCheckResult> {
    const indexBytes = await fetchBytes(this.transport, sourceUrl, REMOTE_CONFIG_MAX_INDEX_BYTES)
    const signatureUrl = new URL(`./${REGISTRY_INDEX_SIGNATURE_FILE_NAME}`, sourceUrl).href
    const signatureBytes = await fetchBytes(
      this.transport,
      signatureUrl,
      REMOTE_CONFIG_MAX_SIGNATURE_BYTES,
    )
    const signingKey = await verifyRegistryIndexSignature(
      indexBytes,
      signatureBytes,
      this.trustedSigningKeys,
    )
    const index = validateRemoteConfigRegistryIndex(decodeJson(indexBytes, sourceUrl))
    assertRegistrySigningKeyAllowsRevision(signingKey, index.registryRevision)
    const relaxRevisionGuards = shouldRelaxRegistryRevisionGuards(
      state.active?.sourceUrl,
      sourceUrl,
    )
    // Local serve rebuilds and local ↔ production switches ignore the previous snapshot for
    // monotonic checks and artifact rollback rules so developers can iterate freely.
    const comparisonState: RemoteConfigState = relaxRevisionGuards
      ? {
          ...state,
          active: undefined,
        }
      : state
    const currentRevision = comparisonState.active?.index.registryRevision ?? 0
    if (index.registryRevision < currentRevision) {
      throw new Error(
        `Stale registry revision ${index.registryRevision}; local revision is ${currentRevision}`,
      )
    }
    if (
      comparisonState.active &&
      index.registryRevision === currentRevision &&
      !sameRegistryIndex(comparisonState.active.index, index)
    ) {
      throw new Error(`Registry revision ${index.registryRevision} was reused with different data`)
    }

    const candidate = await this.buildCandidateSnapshot(sourceUrl, index, comparisonState)
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
        // registry 分发的适配包始终要求 https match，与 registry CI 校验保持一致
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
