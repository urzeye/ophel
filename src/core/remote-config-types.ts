import type {
  BuiltinSiteConfig,
  SiteConfigPatch,
  SitePackManifest,
} from "~adapters/declarative/types"
import { compareSemanticVersions, isValidSemanticVersion } from "~adapters/declarative/validate"

import { REMOTE_CONFIG_INDEX_SCHEMA_VERSION } from "./remote-config-constants"
import { REMOTE_CONFIG_STORAGE_SCHEMA_VERSION } from "./remote-config-storage-constants"

export * from "./remote-config-constants"
export * from "./remote-config-storage-constants"

export interface RegistryPackIndexEntry {
  id: string
  version: number
  minAppVersion: string
  matches: string[]
  file: string
  sha256: string
  disabled: boolean
}

export interface RegistryPatchIndexEntry {
  targetSiteId: string
  patchVersion: number
  baseConfigVersion: number
  minAppVersion: string
  maxAppVersion?: string
  file: string
  sha256: string
  disabled: boolean
}

export interface RemoteConfigRegistryIndex {
  generatedAt: number
  schemaVersion: typeof REMOTE_CONFIG_INDEX_SCHEMA_VERSION
  registryRevision: number
  packs: RegistryPackIndexEntry[]
  patches: RegistryPatchIndexEntry[]
}

export interface CachedSitePack {
  index: RegistryPackIndexEntry
  manifest: SitePackManifest
}

export interface CachedSiteConfigPatch {
  index: RegistryPatchIndexEntry
  patch: SiteConfigPatch
}

/** Developer/contributor override installed from a local JSON file. */
export interface LocalSiteConfigPatchRecord {
  installedAt: number
  patch: SiteConfigPatch
  fileName?: string
}

export type ActiveSiteConfigPatchSource = "registry" | "local"

export interface RemoteConfigSnapshot {
  sourceUrl: string
  index: RemoteConfigRegistryIndex
  packs: Record<string, CachedSitePack>
  patches: Record<string, CachedSiteConfigPatch>
}

export interface RemoteConfigSourceFailure {
  sourceUrl: string
  message: string
}

export interface RemoteConfigFailureRecord {
  at: number
  message: string
  sources: RemoteConfigSourceFailure[]
}

export interface RemoteConfigState {
  storageSchemaVersion: typeof REMOTE_CONFIG_STORAGE_SCHEMA_VERSION
  active?: RemoteConfigSnapshot
  /** Local patch overrides; win over active.patches and survive remote checks. */
  localPatches: Record<string, LocalSiteConfigPatchRecord>
  ignoredPatches: Record<string, number>
  lastCheckAt?: number
  lastSuccessAt?: number
  lastError?: RemoteConfigFailureRecord
}

export interface RemoteConfigChangeSummary {
  downloadedPacks: number
  downloadedPatches: number
  removedPacks: number
  removedPatches: number
  disabledPacks: number
  disabledPatches: number
  ignoredPatches: number
  incompatiblePacks: number
  incompatiblePatches: number
}

export type RemoteConfigCheckStatus = "updated" | "up-to-date" | "throttled" | "failed"

export interface RemoteConfigCheckResult {
  status: RemoteConfigCheckStatus
  checkedAt: number
  registryRevision: number
  sourceUrl?: string
  error?: string
  nextCheckAt?: number
  changes: RemoteConfigChangeSummary
}

export interface RemoteConfigStorage {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
}

export type RegistryTransport = (url: string, maxBytes: number) => Promise<Uint8Array>

export interface BuiltinConfigDescriptor {
  siteId: string
  configVersion: number
  baseConfig: BuiltinSiteConfig
}

export type ResolveBuiltinConfig = (
  siteId: string,
) => BuiltinConfigDescriptor | null | Promise<BuiltinConfigDescriptor | null>

export interface RegistryIndexValidationIssue {
  path: string
  message: string
}

export class RegistryIndexValidationError extends Error {
  readonly issues: RegistryIndexValidationIssue[]

  constructor(issues: RegistryIndexValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "))
    this.name = "RegistryIndexValidationError"
    this.issues = issues
  }
}

const SITE_ID_PATTERN = /^[a-z0-9-]{2,40}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/i
const HTTPS_MATCH_PATTERN = /^https:\/\/[^\s/]+\/.*$/
const MIN_UNIX_MILLISECONDS = 1_000_000_000_000
const MAX_INDEX_ENTRIES = 100

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const addUnknownKeyIssues = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  issues: RegistryIndexValidationIssue[],
): void => {
  const allowed = new Set(allowedKeys)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push({ path: `${path}.${key}`, message: "Unknown key" })
    }
  }
}

const requirePositiveInteger = (
  value: unknown,
  path: string,
  issues: RegistryIndexValidationIssue[],
): value is number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    issues.push({ path, message: "Expected a positive safe integer" })
    return false
  }
  return true
}

const requireSemanticVersion = (
  value: unknown,
  path: string,
  issues: RegistryIndexValidationIssue[],
): value is string => {
  if (typeof value !== "string" || !isValidSemanticVersion(value)) {
    issues.push({ path, message: "Expected a valid semantic version" })
    return false
  }
  return true
}

const requireSha256 = (
  value: unknown,
  path: string,
  issues: RegistryIndexValidationIssue[],
): value is string => {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    issues.push({ path, message: "Expected a 64-character SHA-256 hex digest" })
    return false
  }
  return true
}

const validateMatches = (
  value: unknown,
  path: string,
  issues: RegistryIndexValidationIssue[],
): string[] => {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "Expected an array" })
    return []
  }
  if (value.length > 10) {
    issues.push({ path, message: "Must not contain more than 10 match patterns" })
  }

  const matches: string[] = []
  value.forEach((match, index) => {
    const matchPath = `${path}[${index}]`
    if (typeof match !== "string" || !HTTPS_MATCH_PATTERN.test(match)) {
      issues.push({ path: matchPath, message: "Expected an HTTPS match pattern" })
      return
    }
    if (match === "https://*/*") {
      issues.push({ path: matchPath, message: "Top-level wildcard matches are forbidden" })
      return
    }
    matches.push(match)
  })
  return matches
}

const validatePackEntry = (
  input: unknown,
  index: number,
  issues: RegistryIndexValidationIssue[],
): RegistryPackIndexEntry | null => {
  const path = `$.packs[${index}]`
  if (!isPlainRecord(input)) {
    issues.push({ path, message: "Expected an object" })
    return null
  }
  addUnknownKeyIssues(
    input,
    ["id", "version", "minAppVersion", "matches", "file", "sha256", "disabled"],
    path,
    issues,
  )

  const id = input.id
  if (typeof id !== "string" || !SITE_ID_PATTERN.test(id)) {
    issues.push({ path: `${path}.id`, message: "Invalid pack id" })
  }
  const versionValid = requirePositiveInteger(input.version, `${path}.version`, issues)
  const minVersionValid = requireSemanticVersion(
    input.minAppVersion,
    `${path}.minAppVersion`,
    issues,
  )
  const matches = validateMatches(input.matches, `${path}.matches`, issues)
  const expectedFile =
    typeof id === "string" && versionValid ? `packs/${id}/${input.version}.json` : null
  if (typeof input.file !== "string" || input.file !== expectedFile) {
    issues.push({ path: `${path}.file`, message: `Expected immutable path: ${expectedFile}` })
  }
  const shaValid = requireSha256(input.sha256, `${path}.sha256`, issues)
  if (input.disabled !== undefined && typeof input.disabled !== "boolean") {
    issues.push({ path: `${path}.disabled`, message: "Expected a boolean" })
  }

  if (
    typeof id !== "string" ||
    !SITE_ID_PATTERN.test(id) ||
    !versionValid ||
    !minVersionValid ||
    typeof input.file !== "string" ||
    input.file !== expectedFile ||
    !shaValid ||
    (input.disabled !== undefined && typeof input.disabled !== "boolean")
  ) {
    return null
  }

  return {
    id,
    version: input.version as number,
    minAppVersion: input.minAppVersion as string,
    matches,
    file: input.file,
    sha256: (input.sha256 as string).toLowerCase(),
    disabled: input.disabled === true,
  }
}

const validatePatchEntry = (
  input: unknown,
  index: number,
  issues: RegistryIndexValidationIssue[],
): RegistryPatchIndexEntry | null => {
  const path = `$.patches[${index}]`
  if (!isPlainRecord(input)) {
    issues.push({ path, message: "Expected an object" })
    return null
  }
  addUnknownKeyIssues(
    input,
    [
      "targetSiteId",
      "patchVersion",
      "baseConfigVersion",
      "minAppVersion",
      "maxAppVersion",
      "file",
      "sha256",
      "disabled",
    ],
    path,
    issues,
  )

  const targetSiteId = input.targetSiteId
  if (typeof targetSiteId !== "string" || !SITE_ID_PATTERN.test(targetSiteId)) {
    issues.push({ path: `${path}.targetSiteId`, message: "Invalid target site id" })
  }
  const patchVersionValid = requirePositiveInteger(
    input.patchVersion,
    `${path}.patchVersion`,
    issues,
  )
  const baseVersionValid = requirePositiveInteger(
    input.baseConfigVersion,
    `${path}.baseConfigVersion`,
    issues,
  )
  const minVersionValid = requireSemanticVersion(
    input.minAppVersion,
    `${path}.minAppVersion`,
    issues,
  )
  let maxVersionValid = true
  if (input.maxAppVersion !== undefined) {
    maxVersionValid = requireSemanticVersion(input.maxAppVersion, `${path}.maxAppVersion`, issues)
    if (
      maxVersionValid &&
      minVersionValid &&
      compareSemanticVersions(input.maxAppVersion as string, input.minAppVersion as string) === -1
    ) {
      issues.push({
        path: `${path}.maxAppVersion`,
        message: "Must be greater than or equal to minAppVersion",
      })
      maxVersionValid = false
    }
  }
  const expectedFile =
    typeof targetSiteId === "string" && patchVersionValid
      ? `patches/${targetSiteId}/${input.patchVersion}.json`
      : null
  if (typeof input.file !== "string" || input.file !== expectedFile) {
    issues.push({ path: `${path}.file`, message: `Expected immutable path: ${expectedFile}` })
  }
  const shaValid = requireSha256(input.sha256, `${path}.sha256`, issues)
  if (input.disabled !== undefined && typeof input.disabled !== "boolean") {
    issues.push({ path: `${path}.disabled`, message: "Expected a boolean" })
  }

  if (
    typeof targetSiteId !== "string" ||
    !SITE_ID_PATTERN.test(targetSiteId) ||
    !patchVersionValid ||
    !baseVersionValid ||
    !minVersionValid ||
    !maxVersionValid ||
    typeof input.file !== "string" ||
    input.file !== expectedFile ||
    !shaValid ||
    (input.disabled !== undefined && typeof input.disabled !== "boolean")
  ) {
    return null
  }

  return {
    targetSiteId,
    patchVersion: input.patchVersion as number,
    baseConfigVersion: input.baseConfigVersion as number,
    minAppVersion: input.minAppVersion as string,
    ...(typeof input.maxAppVersion === "string" ? { maxAppVersion: input.maxAppVersion } : {}),
    file: input.file,
    sha256: (input.sha256 as string).toLowerCase(),
    disabled: input.disabled === true,
  }
}

export function validateRemoteConfigRegistryIndex(input: unknown): RemoteConfigRegistryIndex {
  const issues: RegistryIndexValidationIssue[] = []
  if (!isPlainRecord(input)) {
    throw new RegistryIndexValidationError([{ path: "$", message: "Expected an object" }])
  }
  addUnknownKeyIssues(
    input,
    ["generatedAt", "schemaVersion", "registryRevision", "packs", "patches"],
    "$",
    issues,
  )

  if (input.schemaVersion !== REMOTE_CONFIG_INDEX_SCHEMA_VERSION) {
    issues.push({ path: "$.schemaVersion", message: "Unsupported registry schema version" })
  }
  if (
    !Number.isSafeInteger(input.generatedAt) ||
    (input.generatedAt as number) < MIN_UNIX_MILLISECONDS
  ) {
    issues.push({ path: "$.generatedAt", message: "Expected a Unix millisecond timestamp" })
  }
  const revisionValid = requirePositiveInteger(input.registryRevision, "$.registryRevision", issues)

  const rawPacks = Array.isArray(input.packs) ? input.packs : []
  if (!Array.isArray(input.packs)) {
    issues.push({ path: "$.packs", message: "Expected an array" })
  } else if (input.packs.length > MAX_INDEX_ENTRIES) {
    issues.push({ path: "$.packs", message: `Must not exceed ${MAX_INDEX_ENTRIES} entries` })
  }
  const packs = rawPacks
    .map((entry, index) => validatePackEntry(entry, index, issues))
    .filter((entry): entry is RegistryPackIndexEntry => entry !== null)

  const rawPatches = Array.isArray(input.patches) ? input.patches : []
  if (!Array.isArray(input.patches)) {
    issues.push({ path: "$.patches", message: "Expected an array" })
  } else if (input.patches.length > MAX_INDEX_ENTRIES) {
    issues.push({ path: "$.patches", message: `Must not exceed ${MAX_INDEX_ENTRIES} entries` })
  }
  const patches = rawPatches
    .map((entry, index) => validatePatchEntry(entry, index, issues))
    .filter((entry): entry is RegistryPatchIndexEntry => entry !== null)

  const packIds = new Set<string>()
  packs.forEach((entry, index) => {
    if (packIds.has(entry.id)) {
      issues.push({ path: `$.packs[${index}].id`, message: `Duplicate pack id: ${entry.id}` })
    }
    packIds.add(entry.id)
  })
  const patchTargets = new Set<string>()
  patches.forEach((entry, index) => {
    if (patchTargets.has(entry.targetSiteId)) {
      issues.push({
        path: `$.patches[${index}].targetSiteId`,
        message: `Duplicate patch target: ${entry.targetSiteId}`,
      })
    }
    patchTargets.add(entry.targetSiteId)
  })

  if (issues.length > 0 || !revisionValid) {
    throw new RegistryIndexValidationError(issues)
  }

  return {
    generatedAt: input.generatedAt as number,
    schemaVersion: REMOTE_CONFIG_INDEX_SCHEMA_VERSION,
    registryRevision: input.registryRevision as number,
    packs,
    patches,
  }
}

export const isAppVersionCompatible = (
  appVersion: string,
  minAppVersion: string,
  maxAppVersion?: string,
): boolean => {
  if (compareSemanticVersions(appVersion, minAppVersion) === -1) return false
  if (maxAppVersion && compareSemanticVersions(appVersion, maxAppVersion) === 1) return false
  return true
}

export const createEmptyRemoteConfigState = (): RemoteConfigState => ({
  storageSchemaVersion: REMOTE_CONFIG_STORAGE_SCHEMA_VERSION,
  localPatches: {},
  ignoredPatches: {},
})

export const createEmptyRemoteConfigChangeSummary = (): RemoteConfigChangeSummary => ({
  downloadedPacks: 0,
  downloadedPatches: 0,
  removedPacks: 0,
  removedPatches: 0,
  disabledPacks: 0,
  disabledPatches: 0,
  ignoredPatches: 0,
  incompatiblePacks: 0,
  incompatiblePatches: 0,
})
