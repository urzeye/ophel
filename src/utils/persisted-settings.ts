import { DEFAULT_SETTINGS } from "~constants/default-settings"
import { normalizeRemoteConfigSourceUrl } from "~core/remote-config-source"
import type { PlatformStorage } from "~platform/types"
import type { SettingsInput } from "~utils/settings-normalize"

export const PERSISTED_SETTINGS_STORAGE_KEY = "settings"

export class PersistedSettingsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PersistedSettingsError"
  }
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const SETTINGS_MARKER_KEYS = [
  "language",
  "hasAgreedToTerms",
  "panel",
  "content",
  "theme",
  "layout",
  "features",
  "tab",
  "quickButtons",
  "remoteConfig",
] as const

const isLegacyBareSettings = (value: Record<string, unknown>): boolean =>
  SETTINGS_MARKER_KEYS.some((key) => key in value)

const parseStoredValue = (rawValue: unknown): unknown => {
  if (typeof rawValue !== "string") return rawValue

  try {
    return JSON.parse(rawValue)
  } catch (error) {
    throw new PersistedSettingsError(
      `Persisted settings are not valid JSON: ${(error as Error).message}`,
    )
  }
}

export const parsePersistedSettings = (rawValue: unknown): SettingsInput | undefined => {
  if (rawValue === undefined || rawValue === null) return undefined

  const parsed = parseStoredValue(rawValue)
  if (!isPlainRecord(parsed)) {
    throw new PersistedSettingsError("Persisted settings must be an object")
  }

  if ("state" in parsed) {
    if (!isPlainRecord(parsed.state)) {
      throw new PersistedSettingsError("Persisted settings state must be an object")
    }
    if (!("settings" in parsed.state) || !isPlainRecord(parsed.state.settings)) {
      throw new PersistedSettingsError(
        "Persisted settings envelope must contain an object at state.settings",
      )
    }
    return parsed.state.settings as SettingsInput
  }

  if (!isLegacyBareSettings(parsed)) {
    throw new PersistedSettingsError("Persisted settings object has no recognized settings fields")
  }

  return parsed as SettingsInput
}

const getRemoteConfigSettings = (rawValue: unknown): Record<string, unknown> | undefined => {
  const settings = parsePersistedSettings(rawValue)
  if (!settings) return undefined

  const remoteConfig = (settings as Record<string, unknown>).remoteConfig
  if (remoteConfig === undefined) return undefined
  if (!isPlainRecord(remoteConfig)) {
    throw new PersistedSettingsError("remoteConfig must be an object")
  }
  return remoteConfig
}

export const getRemoteConfigAutoUpdate = (rawValue: unknown): boolean => {
  const remoteConfig = getRemoteConfigSettings(rawValue)
  if (!remoteConfig) return DEFAULT_SETTINGS.remoteConfig.autoUpdate

  const { autoUpdate } = remoteConfig
  if (autoUpdate === undefined) return DEFAULT_SETTINGS.remoteConfig.autoUpdate
  if (typeof autoUpdate !== "boolean") {
    throw new PersistedSettingsError("remoteConfig.autoUpdate must be a boolean")
  }
  return autoUpdate
}

export const getRemoteConfigRegistrySourceUrl = (rawValue: unknown): string | undefined => {
  const remoteConfig = getRemoteConfigSettings(rawValue)
  if (!remoteConfig) return undefined

  const { registrySourceUrl } = remoteConfig
  if (registrySourceUrl === undefined || registrySourceUrl === "") return undefined
  if (typeof registrySourceUrl !== "string") {
    throw new PersistedSettingsError("remoteConfig.registrySourceUrl must be a string")
  }

  try {
    return normalizeRemoteConfigSourceUrl(registrySourceUrl)
  } catch (error) {
    throw new PersistedSettingsError(
      `remoteConfig.registrySourceUrl is invalid: ${(error as Error).message}`,
    )
  }
}

export const readRemoteConfigAutoUpdate = async (storage: PlatformStorage): Promise<boolean> =>
  getRemoteConfigAutoUpdate(await storage.get<unknown>(PERSISTED_SETTINGS_STORAGE_KEY))

export const readRemoteConfigRegistrySourceUrl = async (
  storage: PlatformStorage,
): Promise<string | undefined> =>
  getRemoteConfigRegistrySourceUrl(await storage.get<unknown>(PERSISTED_SETTINGS_STORAGE_KEY))
