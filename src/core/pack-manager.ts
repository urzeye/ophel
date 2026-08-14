import { siteMatchPatternsOverlap } from "~adapters/declarative/match-pattern"
import { isValidSitePackId, type SitePackManifest } from "~adapters/declarative/types"
import {
  isValidSemanticVersion,
  validateSitePackManifest,
  type SitePackValidationError,
} from "~adapters/declarative/validate"
import { isBuiltinSiteId, SUPPORTED_AI_PLATFORMS } from "~constants/defaults"

import { isCachedSitePackShape } from "./remote-config-cache"
import { isLoopbackRegistrySourceUrl } from "./remote-config-local-dev"
import { loadRemoteConfigState } from "./remote-config-state"
import {
  isAppVersionCompatible,
  type CachedSitePack,
  type RegistryPackIndexEntry,
  type RemoteConfigState,
  type RemoteConfigStorage,
} from "./remote-config-types"
import {
  canonicalizeSitePackBindingOrigin,
  cloneSitePackOriginBinding,
  createSitePackOriginBindingsState,
  parseSitePackOriginBinding,
  parseSitePackOriginBindingsState,
  sameSitePackOriginBinding,
  type SitePackOriginBinding,
  type SitePackOriginBindingsState,
} from "./site-pack-origin-bindings"
import {
  INSTALLED_SITE_PACKS_STORAGE_KEY,
  SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY,
} from "./site-pack-storage-constants"

export { INSTALLED_SITE_PACKS_STORAGE_KEY } from "./site-pack-storage-constants"
export const INSTALLED_SITE_PACKS_STORAGE_SCHEMA_VERSION = 1 as const

const MIN_UNIX_MILLISECONDS = 1_000_000_000_000
const BUILTIN_MATCHES = SUPPORTED_AI_PLATFORMS.flatMap(({ id, matchPatterns }) =>
  matchPatterns.map((pattern) => ({ siteId: id, pattern })),
)

export type SitePackInstallSource = "registry" | "local"
export type RegistryPackStatus = "available" | "disabled" | "unavailable"

export interface InstalledSitePack {
  manifest: SitePackManifest
  source: SitePackInstallSource
  installedAt: number
  updatedAt: number
  enabled: boolean
  registryStatus?: RegistryPackStatus
}

interface StoredInstalledSitePacksState {
  storageSchemaVersion: typeof INSTALLED_SITE_PACKS_STORAGE_SCHEMA_VERSION
  packs: Record<string, unknown>
}

export type PackManagerErrorCode =
  | "invalid-pack"
  | "invalid-record"
  | "incompatible-app-version"
  | "storage-invalid"
  | "storage-schema-unsupported"
  | "source-conflict"
  | "version-rollback"
  | "version-reuse"
  | "builtin-id-conflict"
  | "builtin-match-conflict"
  | "installed-match-conflict"
  | "origin-binding-pack-missing"
  | "registry-pack-unavailable"
  | "registry-pack-disabled"
  | "registry-cache-invalid"

interface PackManagerErrorOptions {
  packId?: string
  validationErrors?: SitePackValidationError[]
}

export class PackManagerError extends Error {
  readonly code: PackManagerErrorCode
  readonly packId?: string
  readonly validationErrors?: SitePackValidationError[]

  constructor(code: PackManagerErrorCode, message: string, options: PackManagerErrorOptions = {}) {
    super(message)
    this.name = "PackManagerError"
    this.code = code
    this.packId = options.packId
    this.validationErrors = options.validationErrors
  }
}

export interface PackManagerIssue {
  code: PackManagerErrorCode
  message: string
  packId?: string
  validationErrors?: SitePackValidationError[]
}

export interface PackManagerSnapshot {
  storageSchemaVersion: typeof INSTALLED_SITE_PACKS_STORAGE_SCHEMA_VERSION
  packs: InstalledSitePack[]
  issues: PackManagerIssue[]
}

export interface PackManagerMutationResult {
  changed: boolean
  pack?: InstalledSitePack
  removedOriginBindings?: string[]
}

export interface PackManagerOriginBindingMutationResult {
  changed: boolean
  origin: string
  binding?: SitePackOriginBinding
}

export interface PackManagerSyncResult {
  changed: boolean
  updatedPackIds: string[]
  statusChangedPackIds: string[]
  issues: PackManagerIssue[]
}

export interface PackManagerOptions {
  storage: RemoteConfigStorage
  appVersion: string
  now?: () => number
}

interface ParsedInstalledState {
  packs: InstalledSitePack[]
  issues: PackManagerIssue[]
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const cloneManifest = (manifest: SitePackManifest): SitePackManifest => structuredClone(manifest)

const cloneInstalledPack = (pack: InstalledSitePack): InstalledSitePack => ({
  ...pack,
  manifest: cloneManifest(pack.manifest),
})

const isUnixMillisecondTimestamp = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= MIN_UNIX_MILLISECONDS

const isRegistryPackStatus = (value: unknown): value is RegistryPackStatus =>
  value === "available" || value === "disabled" || value === "unavailable"

const sameStringArray = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const sameJsonValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameJsonValue(value, right[index]))
    )
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false

  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return (
    sameStringArray(leftKeys, rightKeys) &&
    leftKeys.every((key) => sameJsonValue(left[key], right[key]))
  )
}

const sameManifest = (left: SitePackManifest, right: SitePackManifest): boolean =>
  sameJsonValue(left, right)

const sameRegistryPackIndexEntry = (
  left: RegistryPackIndexEntry,
  right: RegistryPackIndexEntry,
): boolean =>
  left.id === right.id &&
  left.version === right.version &&
  left.minAppVersion === right.minAppVersion &&
  sameStringArray(left.matches, right.matches) &&
  left.file === right.file &&
  left.sha256 === right.sha256 &&
  left.disabled === right.disabled

/** Production is version-monotonic; loopback dev sources replace by content. */
const resolveRegistryManifestReplacement = (
  installed: SitePackManifest,
  candidate: SitePackManifest,
  allowContentReplace: boolean,
): "identical" | "replace" | "version-rollback" | "version-reuse" => {
  if (sameManifest(installed, candidate)) return "identical"
  if (allowContentReplace) return "replace"
  if (candidate.version < installed.version) return "version-rollback"
  if (candidate.version === installed.version) return "version-reuse"
  return "replace"
}

const createEmptyStoredState = (): StoredInstalledSitePacksState => ({
  storageSchemaVersion: INSTALLED_SITE_PACKS_STORAGE_SCHEMA_VERSION,
  packs: {},
})

const issueFromError = (error: PackManagerError, packId?: string): PackManagerIssue => {
  const resolvedPackId = error.packId ?? packId
  return {
    code: error.code,
    message: error.message,
    ...(resolvedPackId ? { packId: resolvedPackId } : {}),
    ...(error.validationErrors ? { validationErrors: error.validationErrors } : {}),
  }
}

const mergeIssues = (...groups: PackManagerIssue[][]): PackManagerIssue[] => {
  const merged = new Map<string, PackManagerIssue>()
  for (const issue of groups.flat()) {
    const key = `${issue.packId ?? ""}\u0000${issue.code}\u0000${issue.message}`
    if (!merged.has(key)) merged.set(key, issue)
  }
  return Array.from(merged.values())
}

export const isInstalledSitePackEffectivelyEnabled = (pack: InstalledSitePack): boolean =>
  pack.enabled && (pack.source === "local" || pack.registryStatus === "available")

export class PackManager {
  private readonly storage: RemoteConfigStorage
  private readonly appVersion: string
  private readonly now: () => number
  private mutationQueue: Promise<void> = Promise.resolve()

  constructor(options: PackManagerOptions) {
    if (!isValidSemanticVersion(options.appVersion)) {
      throw new TypeError(`Invalid appVersion: ${options.appVersion}`)
    }
    this.storage = options.storage
    this.appVersion = options.appVersion
    this.now = options.now ?? Date.now
  }

  getSnapshot(): Promise<PackManagerSnapshot> {
    return this.enqueue(() => this.loadSnapshot(false))
  }

  getEnabledPacks(): Promise<PackManagerSnapshot> {
    return this.enqueue(async () => {
      const sync = await this.syncRegistryPacksInternal()
      const snapshot = await this.loadSnapshot(true)
      return { ...snapshot, issues: mergeIssues(sync.issues, snapshot.issues) }
    })
  }

  getOriginBindings(): Promise<SitePackOriginBindingsState> {
    return this.enqueue(() => this.loadOriginBindingsState())
  }

  setOriginBinding(
    origin: string,
    binding: SitePackOriginBinding,
  ): Promise<PackManagerOriginBindingMutationResult> {
    return this.enqueue(async () => {
      const canonicalOrigin = canonicalizeSitePackBindingOrigin(origin)
      const parsedBinding = parseSitePackOriginBinding(binding)
      const installedState = await this.loadStoredState()
      const installed = this.parseInstalledState(installedState).packs.some(
        (pack) => pack.manifest.id === parsedBinding.packId,
      )
      if (!installed) {
        throw new PackManagerError(
          "origin-binding-pack-missing",
          `Cannot bind ${canonicalOrigin} to missing SitePack ${parsedBinding.packId}`,
          { packId: parsedBinding.packId },
        )
      }

      const state = await this.loadOriginBindingsState()
      const current = state.bindings[canonicalOrigin]
      if (current && sameSitePackOriginBinding(current, parsedBinding)) {
        return {
          changed: false,
          origin: canonicalOrigin,
          binding: cloneSitePackOriginBinding(current),
        }
      }

      const next = createSitePackOriginBindingsState({
        ...state.bindings,
        [canonicalOrigin]: parsedBinding,
      })
      await this.writeOriginBindingsState(next)
      return {
        changed: true,
        origin: canonicalOrigin,
        binding: cloneSitePackOriginBinding(parsedBinding),
      }
    })
  }

  removeOriginBinding(origin: string): Promise<PackManagerOriginBindingMutationResult> {
    return this.enqueue(async () => {
      const canonicalOrigin = canonicalizeSitePackBindingOrigin(origin)
      const state = await this.loadOriginBindingsState()
      if (!Object.prototype.hasOwnProperty.call(state.bindings, canonicalOrigin)) {
        return { changed: false, origin: canonicalOrigin }
      }

      const bindings = { ...state.bindings }
      delete bindings[canonicalOrigin]
      await this.writeOriginBindingsState(createSitePackOriginBindingsState(bindings))
      return { changed: true, origin: canonicalOrigin }
    })
  }

  installLocal(manifest: unknown): Promise<PackManagerMutationResult> {
    return this.enqueue(() => this.upsertPack(manifest, "local"))
  }

  installFromRegistry(packId: string): Promise<PackManagerMutationResult> {
    return this.enqueue(async () => {
      this.assertPackId(packId)
      const manifest = await this.loadRegistryManifest(packId)
      return this.upsertPack(manifest, "registry", "available")
    })
  }

  setEnabled(packId: string, enabled: boolean): Promise<PackManagerMutationResult> {
    return this.enqueue(async () => {
      this.assertPackId(packId)
      const state = await this.loadStoredState()
      const stored = state.packs[packId]
      if (stored === undefined) return { changed: false }

      const current = this.parseStoredPack(packId, stored)
      if (enabled && current.source === "registry" && current.registryStatus !== "available") {
        throw new PackManagerError(
          "registry-pack-unavailable",
          `Registry pack ${packId} is ${current.registryStatus ?? "unavailable"}`,
          { packId },
        )
      }
      if (current.enabled === enabled) {
        return { changed: false, pack: cloneInstalledPack(current) }
      }

      const parsed = this.parseInstalledState(state)
      this.assertNoInstalledConflict(current.manifest, parsed.packs, packId)
      const next = { ...current, enabled }
      await this.writePack(state, packId, next)
      return { changed: true, pack: cloneInstalledPack(next) }
    })
  }

  uninstall(packId: string): Promise<PackManagerMutationResult> {
    return this.enqueue(async () => {
      this.assertPackId(packId)
      const state = await this.loadStoredState()
      if (!Object.prototype.hasOwnProperty.call(state.packs, packId)) {
        return { changed: false }
      }

      const bindingState = await this.loadOriginBindingsState()
      const removedOriginBindings = Object.entries(bindingState.bindings)
        .filter(([, binding]) => binding.mode === "explicit" && binding.packId === packId)
        .map(([origin]) => origin)
        .sort((left, right) => left.localeCompare(right))

      const packs = { ...state.packs }
      delete packs[packId]
      await this.storage.set<StoredInstalledSitePacksState>(INSTALLED_SITE_PACKS_STORAGE_KEY, {
        ...state,
        packs,
      })
      if (removedOriginBindings.length > 0) {
        const bindings = { ...bindingState.bindings }
        for (const origin of removedOriginBindings) delete bindings[origin]
        await this.writeOriginBindingsState(createSitePackOriginBindingsState(bindings))
      }
      return { changed: true, removedOriginBindings }
    })
  }

  syncRegistryPacks(): Promise<PackManagerSyncResult> {
    return this.enqueue(() => this.syncRegistryPacksInternal())
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation)
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private getTimestamp(): number {
    const timestamp = this.now()
    if (!isUnixMillisecondTimestamp(timestamp)) {
      throw new TypeError(
        `PackManager now() must return a Unix millisecond timestamp: ${timestamp}`,
      )
    }
    return timestamp
  }

  private assertPackId(packId: string): void {
    if (!isValidSitePackId(packId)) {
      throw new PackManagerError("invalid-pack", `Invalid SitePack id: ${packId}`, { packId })
    }
  }

  private async loadStoredState(): Promise<StoredInstalledSitePacksState> {
    const value = await this.storage.get<unknown>(INSTALLED_SITE_PACKS_STORAGE_KEY)
    if (value === undefined) return createEmptyStoredState()
    if (!isPlainRecord(value)) {
      throw new PackManagerError("storage-invalid", "Installed SitePack state must be an object")
    }

    const unknownKeys = Object.keys(value).filter(
      (key) => key !== "storageSchemaVersion" && key !== "packs",
    )
    if (unknownKeys.length > 0) {
      throw new PackManagerError(
        "storage-invalid",
        `Installed SitePack state has unknown keys: ${unknownKeys.join(", ")}`,
      )
    }
    if (value.storageSchemaVersion !== INSTALLED_SITE_PACKS_STORAGE_SCHEMA_VERSION) {
      throw new PackManagerError(
        "storage-schema-unsupported",
        `Unsupported installed SitePack storage schema: ${String(value.storageSchemaVersion)}`,
      )
    }
    if (!isPlainRecord(value.packs)) {
      throw new PackManagerError("storage-invalid", "Installed SitePack pack map must be an object")
    }

    return {
      storageSchemaVersion: INSTALLED_SITE_PACKS_STORAGE_SCHEMA_VERSION,
      packs: { ...value.packs },
    }
  }

  private async loadOriginBindingsState(): Promise<SitePackOriginBindingsState> {
    return parseSitePackOriginBindingsState(
      await this.storage.get<unknown>(SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY),
    )
  }

  private async writeOriginBindingsState(state: SitePackOriginBindingsState): Promise<void> {
    await this.storage.set<SitePackOriginBindingsState>(
      SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY,
      createSitePackOriginBindingsState(state.bindings),
    )
  }

  private parseStoredPack(packId: string, value: unknown): InstalledSitePack {
    if (!isPlainRecord(value)) {
      throw new PackManagerError("invalid-record", `Installed pack ${packId} must be an object`, {
        packId,
      })
    }
    const allowedKeys = new Set([
      "manifest",
      "source",
      "installedAt",
      "updatedAt",
      "enabled",
      "registryStatus",
    ])
    const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key))
    if (unknownKeys.length > 0) {
      throw new PackManagerError(
        "invalid-record",
        `Installed pack ${packId} has unknown keys: ${unknownKeys.join(", ")}`,
        { packId },
      )
    }

    const manifest = this.validateManifest(value.manifest, packId)
    if (manifest.id !== packId) {
      throw new PackManagerError(
        "invalid-record",
        `Installed pack key ${packId} does not match manifest id ${manifest.id}`,
        { packId },
      )
    }
    if (value.source !== "registry" && value.source !== "local") {
      throw new PackManagerError("invalid-record", `Installed pack ${packId} has invalid source`, {
        packId,
      })
    }
    if (!isUnixMillisecondTimestamp(value.installedAt)) {
      throw new PackManagerError(
        "invalid-record",
        `Installed pack ${packId} has invalid installedAt`,
        { packId },
      )
    }
    if (
      !isUnixMillisecondTimestamp(value.updatedAt) ||
      (value.updatedAt as number) < value.installedAt
    ) {
      throw new PackManagerError(
        "invalid-record",
        `Installed pack ${packId} has invalid updatedAt`,
        { packId },
      )
    }
    if (typeof value.enabled !== "boolean") {
      throw new PackManagerError("invalid-record", `Installed pack ${packId} has invalid enabled`, {
        packId,
      })
    }
    let registryStatus: RegistryPackStatus | undefined
    if (value.source === "registry") {
      if (!isRegistryPackStatus(value.registryStatus)) {
        throw new PackManagerError(
          "invalid-record",
          `Installed registry pack ${packId} has invalid registryStatus`,
          { packId },
        )
      }
      registryStatus = value.registryStatus
    }
    if (value.source === "local" && value.registryStatus !== undefined) {
      throw new PackManagerError(
        "invalid-record",
        `Installed local pack ${packId} must not define registryStatus`,
        { packId },
      )
    }

    return {
      manifest,
      source: value.source,
      installedAt: value.installedAt,
      updatedAt: value.updatedAt,
      enabled: value.enabled,
      ...(registryStatus ? { registryStatus } : {}),
    }
  }

  private parseInstalledState(state: StoredInstalledSitePacksState): ParsedInstalledState {
    const parsed: InstalledSitePack[] = []
    const issues: PackManagerIssue[] = []

    for (const [packId, stored] of Object.entries(state.packs)) {
      try {
        parsed.push(this.parseStoredPack(packId, stored))
      } catch (error) {
        if (error instanceof PackManagerError) {
          issues.push(issueFromError(error, packId))
          continue
        }
        throw error
      }
    }

    parsed.sort(
      (left, right) =>
        left.installedAt - right.installedAt || left.manifest.id.localeCompare(right.manifest.id),
    )
    const accepted: InstalledSitePack[] = []
    for (const pack of parsed) {
      try {
        this.assertNoInstalledConflict(pack.manifest, accepted)
        accepted.push(pack)
      } catch (error) {
        if (error instanceof PackManagerError) {
          issues.push(issueFromError(error, pack.manifest.id))
          continue
        }
        throw error
      }
    }

    return { packs: accepted, issues }
  }

  /**
   * 已安装记录同时来自 registry 和本地导入，允许 http match，
   * 否则本地安装的明文 HTTP 适配包会在重新读取时被判为无效。
   * registry 侧的 https 约束由下载校验和 registry CI 负责。
   */
  private validateManifest(input: unknown, expectedId?: string): SitePackManifest {
    const validation = validateSitePackManifest(input, { allowHttpMatches: true })
    if (!validation.valid) {
      throw new PackManagerError(
        "invalid-pack",
        `SitePack validation failed${expectedId ? ` for ${expectedId}` : ""}: ${validation.errors
          .map((error) => `${error.path} ${error.message}`)
          .join("; ")}`,
        { packId: expectedId, validationErrors: validation.errors },
      )
    }

    const manifest = validation.value
    if (!isAppVersionCompatible(this.appVersion, manifest.minAppVersion)) {
      throw new PackManagerError(
        "incompatible-app-version",
        `SitePack ${manifest.id} requires Ophel ${manifest.minAppVersion} or newer`,
        { packId: manifest.id },
      )
    }
    this.assertNoBuiltinConflict(manifest)
    return cloneManifest(manifest)
  }

  private assertNoBuiltinConflict(manifest: SitePackManifest): void {
    if (isBuiltinSiteId(manifest.id)) {
      throw new PackManagerError(
        "builtin-id-conflict",
        `SitePack id ${manifest.id} conflicts with a built-in site id`,
        { packId: manifest.id },
      )
    }

    for (const match of manifest.matches) {
      const builtin = BUILTIN_MATCHES.find((candidate) =>
        siteMatchPatternsOverlap(match, candidate.pattern),
      )
      if (!builtin) continue
      throw new PackManagerError(
        "builtin-match-conflict",
        `SitePack ${manifest.id} match ${match} overlaps built-in site ${builtin.siteId} (${builtin.pattern})`,
        { packId: manifest.id },
      )
    }
  }

  private assertNoInstalledConflict(
    manifest: SitePackManifest,
    installed: readonly InstalledSitePack[],
    excludeId?: string,
  ): void {
    for (const existing of installed) {
      if (existing.manifest.id === excludeId) continue
      for (const match of manifest.matches) {
        const existingMatch = existing.manifest.matches.find((pattern) =>
          siteMatchPatternsOverlap(match, pattern),
        )
        if (!existingMatch) continue
        throw new PackManagerError(
          "installed-match-conflict",
          `SitePack ${manifest.id} match ${match} overlaps installed pack ${existing.manifest.id} (${existingMatch})`,
          { packId: manifest.id },
        )
      }
    }
  }

  private async loadSnapshot(enabledOnly: boolean): Promise<PackManagerSnapshot> {
    const state = await this.loadStoredState()
    const parsed = this.parseInstalledState(state)
    return {
      storageSchemaVersion: INSTALLED_SITE_PACKS_STORAGE_SCHEMA_VERSION,
      packs: parsed.packs
        .filter((pack) => !enabledOnly || isInstalledSitePackEffectivelyEnabled(pack))
        .map(cloneInstalledPack),
      issues: parsed.issues,
    }
  }

  private async isActiveRegistryLoopback(): Promise<boolean> {
    try {
      const state = await this.loadRemoteState()
      return Boolean(state.active && isLoopbackRegistrySourceUrl(state.active.sourceUrl))
    } catch {
      return false
    }
  }

  private async upsertPack(
    input: unknown,
    source: SitePackInstallSource,
    registryStatus?: RegistryPackStatus,
  ): Promise<PackManagerMutationResult> {
    const manifest = this.validateManifest(input)
    const state = await this.loadStoredState()
    const parsed = this.parseInstalledState(state)
    this.assertNoInstalledConflict(manifest, parsed.packs, manifest.id)

    const storedCurrent = state.packs[manifest.id]
    let current: InstalledSitePack | undefined
    if (storedCurrent !== undefined) {
      try {
        current = this.parseStoredPack(manifest.id, storedCurrent)
      } catch (error) {
        if (!(error instanceof PackManagerError)) throw error
      }
    }

    if (current && current.source !== source) {
      throw new PackManagerError(
        "source-conflict",
        `SitePack ${manifest.id} is already installed from ${current.source}`,
        { packId: manifest.id },
      )
    }

    if (current) {
      const allowContentReplace = source === "registry" && (await this.isActiveRegistryLoopback())
      const replacement = resolveRegistryManifestReplacement(
        current.manifest,
        manifest,
        allowContentReplace,
      )
      if (replacement === "version-rollback") {
        throw new PackManagerError(
          "version-rollback",
          `SitePack ${manifest.id} version rollback: ${manifest.version} < ${current.manifest.version}`,
          { packId: manifest.id },
        )
      }
      if (replacement === "version-reuse") {
        throw new PackManagerError(
          "version-reuse",
          `SitePack ${manifest.id} version ${manifest.version} was reused with different content`,
          { packId: manifest.id },
        )
      }
      if (replacement === "identical") {
        const nextRegistryStatus = source === "registry" ? registryStatus : undefined
        if (current.registryStatus === nextRegistryStatus) {
          return { changed: false, pack: cloneInstalledPack(current) }
        }
        const next = {
          ...current,
          ...(source === "registry" ? { registryStatus: nextRegistryStatus } : {}),
        }
        await this.writePack(state, manifest.id, next)
        return { changed: true, pack: cloneInstalledPack(next) }
      }
    }

    const timestamp = this.getTimestamp()
    const next: InstalledSitePack = current
      ? {
          ...current,
          manifest,
          updatedAt: Math.max(timestamp, current.updatedAt),
          ...(source === "registry" ? { registryStatus } : {}),
        }
      : {
          manifest,
          source,
          installedAt: timestamp,
          updatedAt: timestamp,
          enabled: true,
          ...(source === "registry" ? { registryStatus } : {}),
        }
    await this.writePack(state, manifest.id, next)
    return { changed: true, pack: cloneInstalledPack(next) }
  }

  private async writePack(
    state: StoredInstalledSitePacksState,
    packId: string,
    pack: InstalledSitePack,
  ): Promise<void> {
    await this.storage.set<StoredInstalledSitePacksState>(INSTALLED_SITE_PACKS_STORAGE_KEY, {
      ...state,
      packs: {
        ...state.packs,
        [packId]: cloneInstalledPack(pack),
      },
    })
  }

  private async loadRemoteState(): Promise<RemoteConfigState> {
    try {
      return await loadRemoteConfigState(this.storage)
    } catch (error) {
      throw new PackManagerError(
        "registry-cache-invalid",
        `Remote SitePack cache is invalid: ${toErrorMessage(error)}`,
      )
    }
  }

  private async loadRegistryManifest(packId: string): Promise<SitePackManifest> {
    const state = await this.loadRemoteState()
    const active = state.active
    const indexEntry = active?.index.packs.find((entry) => entry.id === packId)
    if (indexEntry?.disabled) {
      throw new PackManagerError("registry-pack-disabled", `Registry pack ${packId} is disabled`, {
        packId,
      })
    }
    const cached = active?.packs[packId]
    if (!active || !indexEntry || !cached) {
      throw new PackManagerError(
        "registry-pack-unavailable",
        `Registry pack ${packId} is not available in the active cache`,
        { packId },
      )
    }
    return this.validateCachedRegistryPack(packId, cached, indexEntry)
  }

  private validateCachedRegistryPack(
    packId: string,
    cached: CachedSitePack,
    indexEntry: RegistryPackIndexEntry,
  ): SitePackManifest {
    if (!isCachedSitePackShape(cached) || cached.index.disabled) {
      throw new PackManagerError(
        "registry-cache-invalid",
        `Registry cache metadata is invalid for ${packId}`,
        { packId },
      )
    }
    if (indexEntry.disabled) {
      throw new PackManagerError("registry-pack-disabled", `Registry pack ${packId} is disabled`, {
        packId,
      })
    }

    const usesCompatibleFallback =
      cached.index.id === indexEntry.id &&
      cached.index.version < indexEntry.version &&
      !isAppVersionCompatible(this.appVersion, indexEntry.minAppVersion) &&
      isAppVersionCompatible(this.appVersion, cached.index.minAppVersion)
    if (!sameRegistryPackIndexEntry(cached.index, indexEntry) && !usesCompatibleFallback) {
      throw new PackManagerError(
        "registry-cache-invalid",
        `Registry cache metadata is invalid for ${packId}`,
        { packId },
      )
    }

    const manifest = this.validateManifest(cached.manifest, packId)
    if (
      manifest.id !== cached.index.id ||
      manifest.version !== cached.index.version ||
      manifest.minAppVersion !== cached.index.minAppVersion ||
      !sameStringArray(manifest.matches, cached.index.matches)
    ) {
      throw new PackManagerError(
        "registry-cache-invalid",
        `Registry pack metadata does not match its cached index: ${packId}`,
        { packId },
      )
    }
    return manifest
  }

  private async syncRegistryPacksInternal(): Promise<PackManagerSyncResult> {
    const state = await this.loadStoredState()
    const parsed = this.parseInstalledState(state)
    const updatedPackIds: string[] = []
    const statusChangedPackIds: string[] = []
    const issues = [...parsed.issues]

    let remoteState: RemoteConfigState
    try {
      remoteState = await this.loadRemoteState()
    } catch (error) {
      if (!(error instanceof PackManagerError)) throw error
      return {
        changed: false,
        updatedPackIds,
        statusChangedPackIds,
        issues: mergeIssues(issues, [issueFromError(error)]),
      }
    }
    if (!remoteState.active) {
      return { changed: false, updatedPackIds, statusChangedPackIds, issues }
    }

    const allowContentReplace = isLoopbackRegistrySourceUrl(remoteState.active.sourceUrl)
    const packsById = new Map(parsed.packs.map((pack) => [pack.manifest.id, pack]))
    const nextRawPacks = { ...state.packs }
    let changed = false

    for (const installed of parsed.packs) {
      if (installed.source !== "registry") continue

      const packId = installed.manifest.id
      const indexEntry = remoteState.active.index.packs.find((entry) => entry.id === packId)
      let next = installed

      if (!indexEntry) {
        next = this.withRegistryStatus(installed, "unavailable")
      } else if (indexEntry.disabled) {
        next = this.withRegistryStatus(installed, "disabled")
      } else {
        const cached = remoteState.active.packs[packId]
        if (!cached) {
          next = this.withRegistryStatus(installed, "unavailable")
        } else {
          try {
            const manifest = this.validateCachedRegistryPack(packId, cached, indexEntry)
            this.assertNoInstalledConflict(manifest, Array.from(packsById.values()), packId)
            const replacement = resolveRegistryManifestReplacement(
              installed.manifest,
              manifest,
              allowContentReplace,
            )
            if (replacement === "version-rollback") {
              throw new PackManagerError(
                "version-rollback",
                `Registry pack ${packId} version rollback: ${manifest.version} < ${installed.manifest.version}`,
                { packId },
              )
            }
            if (replacement === "version-reuse") {
              throw new PackManagerError(
                "version-reuse",
                `Registry pack ${packId} version ${manifest.version} was reused with different content`,
                { packId },
              )
            }

            if (replacement === "replace") {
              next = {
                ...installed,
                manifest,
                updatedAt: Math.max(this.getTimestamp(), installed.updatedAt),
                registryStatus: "available",
              }
              updatedPackIds.push(packId)
            } else {
              next = this.withRegistryStatus(installed, "available")
            }
          } catch (error) {
            if (!(error instanceof PackManagerError)) throw error
            issues.push(issueFromError(error, packId))
            continue
          }
        }
      }

      if (next.registryStatus !== installed.registryStatus) {
        statusChangedPackIds.push(packId)
      }
      if (!sameJsonValue(next, installed)) {
        changed = true
        nextRawPacks[packId] = cloneInstalledPack(next)
        packsById.set(packId, next)
      }
    }

    if (changed) {
      await this.storage.set<StoredInstalledSitePacksState>(INSTALLED_SITE_PACKS_STORAGE_KEY, {
        ...state,
        packs: nextRawPacks,
      })
    }

    return {
      changed,
      updatedPackIds,
      statusChangedPackIds,
      issues: mergeIssues(issues),
    }
  }

  private withRegistryStatus(
    pack: InstalledSitePack,
    registryStatus: RegistryPackStatus,
  ): InstalledSitePack {
    return pack.registryStatus === registryStatus ? pack : { ...pack, registryStatus }
  }
}
