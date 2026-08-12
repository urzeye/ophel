import { ZUSTAND_KEYS } from "~constants/defaults"
import { BOOKMARKS_STORAGE_KEY, USAGE_MONITOR_STORAGE_KEY } from "~constants/storage-keys"
import type { PlatformStorage } from "~platform/types"

import {
  INSTALLED_SITE_PACKS_STORAGE_KEY,
  REMOTE_CONFIG_STORAGE_KEY,
  SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY,
  SITE_PACK_REGISTRATION_STATE_STORAGE_KEY,
} from "./site-pack-storage-constants"

export const BACKUP_SCHEMA_VERSION = 4 as const
export { BOOKMARKS_STORAGE_KEY, USAGE_MONITOR_STORAGE_KEY } from "~constants/storage-keys"

export type BackupType = "full" | "prompts" | "settings"

export interface BackupDocument {
  version: number
  timestamp: string
  type: BackupType
  data: Record<string, unknown>
}

export interface BackupValidationResult {
  valid: boolean
  errorKeys: string[]
}

export interface BackupRestoreResult {
  document: BackupDocument
  restoredKeys: string[]
  ignoredKeys: string[]
}

export const BACKUP_USER_DATA_STORAGE_KEYS: readonly string[] = Array.from(
  new Set([
    ...ZUSTAND_KEYS,
    BOOKMARKS_STORAGE_KEY,
    USAGE_MONITOR_STORAGE_KEY,
    INSTALLED_SITE_PACKS_STORAGE_KEY,
    SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY,
  ]),
)

export const BACKUP_EXCLUDED_STORAGE_KEYS: readonly string[] = [
  REMOTE_CONFIG_STORAGE_KEY,
  SITE_PACK_REGISTRATION_STATE_STORAGE_KEY,
]

const BACKUP_TYPE_KEYS: Record<BackupType, readonly string[]> = {
  full: BACKUP_USER_DATA_STORAGE_KEYS,
  prompts: ["prompts", "promptChains"],
  settings: ["settings"],
}

const SINGLE_PROP_ZUSTAND_KEYS: Readonly<Record<string, string>> = {
  settings: "settings",
  prompts: "prompts",
  folders: "folders",
  tags: "tags",
}

const STATE_ZUSTAND_KEYS = new Set([
  "promptChains",
  "conversations",
  "readingHistory",
  "claudeSessionKeys",
])

const NATIVE_OBJECT_KEYS = new Set([
  USAGE_MONITOR_STORAGE_KEY,
  INSTALLED_SITE_PACKS_STORAGE_KEY,
  SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY,
])

const KNOWN_BACKUP_KEYS = new Set(BACKUP_USER_DATA_STORAGE_KEYS)

const ERROR_KEY_BY_STORAGE_KEY: Readonly<Record<string, string>> = {
  settings: "backupValidationSettingsType",
  prompts: "backupValidationPromptsType",
  promptChains: "backupValidationPromptChainsType",
  folders: "backupValidationFoldersType",
  conversations: "backupValidationConversationsType",
  readingHistory: "backupValidationHistoryType",
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const unique = (values: readonly string[]): string[] => Array.from(new Set(values))

const parseJsonValue = (key: string, value: unknown): unknown => {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new BackupCodecError(
      [ERROR_KEY_BY_STORAGE_KEY[key] ?? "backupValidationInvalidFormat"],
      `Stored backup value ${key} is not valid JSON: ${String(error)}`,
    )
  }
}

const getPersistedState = (value: unknown): unknown =>
  isObjectRecord(value) && Object.prototype.hasOwnProperty.call(value, "state")
    ? value.state
    : undefined

const normalizeStateStore = (key: string, value: unknown): Record<string, unknown> => {
  const parsed = parseJsonValue(key, value)
  const persistedState = getPersistedState(parsed)
  const payload = persistedState === undefined ? parsed : persistedState

  if (key === "promptChains") {
    if (Array.isArray(payload)) return { chains: payload }
    if (isObjectRecord(payload) && Array.isArray(payload.chains)) return payload
  }

  if (key === "conversations" && isObjectRecord(payload)) {
    return Object.prototype.hasOwnProperty.call(payload, "conversations")
      ? payload
      : { conversations: payload }
  }

  if (key === "readingHistory" && isObjectRecord(payload)) {
    return Object.prototype.hasOwnProperty.call(payload, "history") ||
      Object.prototype.hasOwnProperty.call(payload, "lastCleanupRun")
      ? payload
      : { history: payload }
  }

  if (key === "claudeSessionKeys") {
    if (Array.isArray(payload)) return { keys: payload, currentKeyId: "" }
    if (isObjectRecord(payload)) return payload
  }

  throw new BackupCodecError(
    [ERROR_KEY_BY_STORAGE_KEY[key] ?? "backupValidationInvalidFormat"],
    `Backup value ${key} has an invalid state shape`,
  )
}

const normalizeKnownValue = (key: string, value: unknown): unknown => {
  const stateKey = SINGLE_PROP_ZUSTAND_KEYS[key]
  if (stateKey) {
    const parsed = parseJsonValue(key, value)
    const persistedState = getPersistedState(parsed)
    if (persistedState === undefined) return parsed
    if (isObjectRecord(persistedState) && persistedState[stateKey] !== undefined) {
      return persistedState[stateKey]
    }
    return persistedState
  }

  if (STATE_ZUSTAND_KEYS.has(key)) return normalizeStateStore(key, value)

  if (key === BOOKMARKS_STORAGE_KEY) return parseJsonValue(key, value)

  if (NATIVE_OBJECT_KEYS.has(key)) return parseJsonValue(key, value)

  throw new BackupCodecError(
    ["backupValidationInvalidFormat"],
    `Unknown backup storage key: ${key}`,
  )
}

const getValueValidationError = (key: string, value: unknown): string | null => {
  if (["prompts", "folders", "tags", BOOKMARKS_STORAGE_KEY].includes(key)) {
    return Array.isArray(value)
      ? null
      : ERROR_KEY_BY_STORAGE_KEY[key] ?? "backupValidationInvalidFormat"
  }

  if (key === "promptChains") {
    return isObjectRecord(value) && Array.isArray(value.chains)
      ? null
      : "backupValidationPromptChainsType"
  }

  if (
    key === "settings" ||
    key === "conversations" ||
    key === "readingHistory" ||
    key === "claudeSessionKeys" ||
    NATIVE_OBJECT_KEYS.has(key)
  ) {
    return isObjectRecord(value)
      ? null
      : ERROR_KEY_BY_STORAGE_KEY[key] ?? "backupValidationInvalidFormat"
  }

  return null
}

const dehydrateKnownValue = (key: string, value: unknown): unknown => {
  const stateKey = SINGLE_PROP_ZUSTAND_KEYS[key]
  if (stateKey) {
    return JSON.stringify({ state: { [stateKey]: value }, version: 0 })
  }

  if (STATE_ZUSTAND_KEYS.has(key)) {
    return JSON.stringify({ state: value, version: 0 })
  }

  if (key === BOOKMARKS_STORAGE_KEY) return JSON.stringify(value)
  if (NATIVE_OBJECT_KEYS.has(key)) return value

  throw new BackupCodecError(
    ["backupValidationInvalidFormat"],
    `Cannot restore unknown backup storage key: ${key}`,
  )
}

const normalizeBackupType = (value: unknown, version: number): BackupType | null => {
  if (value === "full" || value === "prompts" || value === "settings") return value
  if ((value === undefined || value === null) && version < BACKUP_SCHEMA_VERSION) return "full"
  return null
}

export class BackupCodecError extends Error {
  readonly errorKeys: string[]

  constructor(errorKeys: readonly string[], message: string) {
    super(message)
    this.name = "BackupCodecError"
    this.errorKeys = unique(errorKeys)
  }
}

export const normalizeBackupDocument = (input: unknown): BackupDocument => {
  if (!isObjectRecord(input)) {
    throw new BackupCodecError(
      ["backupValidationInvalidFormat"],
      "Backup document must be an object",
    )
  }

  const errorKeys: string[] = []
  const version = input.version
  if (version === undefined || version === null) {
    errorKeys.push("backupValidationMissingVersion")
  } else if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1 ||
    version > BACKUP_SCHEMA_VERSION
  ) {
    errorKeys.push("backupValidationInvalidFormat")
  }

  if (!isObjectRecord(input.data)) {
    errorKeys.push("backupValidationMissingData")
    throw new BackupCodecError(errorKeys, "Backup document data must be an object")
  }

  const normalizedVersion = typeof version === "number" ? version : 0
  const type = normalizeBackupType(input.type, normalizedVersion)
  if (!type) errorKeys.push("backupValidationInvalidFormat")

  const normalizedData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input.data)) {
    if (!KNOWN_BACKUP_KEYS.has(key)) {
      normalizedData[key] = value
      continue
    }

    try {
      const normalizedValue = normalizeKnownValue(key, value)
      const validationError = getValueValidationError(key, normalizedValue)
      if (validationError) errorKeys.push(validationError)
      else normalizedData[key] = normalizedValue
    } catch (error) {
      if (error instanceof BackupCodecError) errorKeys.push(...error.errorKeys)
      else errorKeys.push(ERROR_KEY_BY_STORAGE_KEY[key] ?? "backupValidationInvalidFormat")
    }
  }

  if (errorKeys.length > 0 || !type) {
    throw new BackupCodecError(errorKeys, "Backup document validation failed")
  }

  return {
    version: normalizedVersion,
    timestamp: typeof input.timestamp === "string" ? input.timestamp : "",
    type,
    data: normalizedData,
  }
}

export const validateBackupData = (input: unknown): BackupValidationResult => {
  try {
    normalizeBackupDocument(input)
    return { valid: true, errorKeys: [] }
  } catch (error) {
    return {
      valid: false,
      errorKeys:
        error instanceof BackupCodecError ? error.errorKeys : ["backupValidationInvalidFormat"],
    }
  }
}

export const createBackupDocument = async (
  storage: PlatformStorage,
  type: BackupType,
  timestamp = new Date().toISOString(),
): Promise<BackupDocument> => {
  const data: Record<string, unknown> = {}

  for (const key of BACKUP_TYPE_KEYS[type]) {
    const storedValue = await storage.get<unknown>(key)
    if (storedValue === undefined || storedValue === null) continue
    const normalizedValue = normalizeKnownValue(key, storedValue)
    const validationError = getValueValidationError(key, normalizedValue)
    if (validationError) {
      throw new BackupCodecError([validationError], `Stored backup value ${key} is malformed`)
    }
    data[key] = normalizedValue
  }

  return {
    version: BACKUP_SCHEMA_VERSION,
    timestamp,
    type,
    data,
  }
}

export const createBackupRestorePlan = (
  input: unknown,
): BackupRestoreResult & { updates: Record<string, unknown> } => {
  const document = normalizeBackupDocument(input)
  const allowedKeys = new Set(BACKUP_TYPE_KEYS[document.type])
  const updates: Record<string, unknown> = {}
  const restoredKeys: string[] = []
  const ignoredKeys: string[] = []

  for (const [key, value] of Object.entries(document.data)) {
    if (!KNOWN_BACKUP_KEYS.has(key) || !allowedKeys.has(key)) {
      ignoredKeys.push(key)
      continue
    }
    updates[key] = dehydrateKnownValue(key, value)
    restoredKeys.push(key)
  }

  return {
    document,
    updates,
    restoredKeys,
    ignoredKeys,
  }
}

export const restoreBackupDocument = async (
  storage: PlatformStorage,
  input: unknown,
): Promise<BackupRestoreResult> => {
  const { updates, ...result } = createBackupRestorePlan(input)
  await Promise.all(Object.entries(updates).map(([key, value]) => storage.set(key, value)))
  if (result.ignoredKeys.length > 0) {
    console.warn("[Ophel] Ignored non-user backup keys:", result.ignoredKeys)
  }
  return result
}
