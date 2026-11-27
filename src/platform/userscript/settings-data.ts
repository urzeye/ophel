import type {
  SETTING_ID_ALIASES,
  SETTING_ID_ROUTE_MAP,
  SettingsSearchItem,
} from "../../constants/ui"

import { USERSCRIPT_RESOURCE_DEFINITIONS } from "./resource-manifest"
import { readUserscriptJsonResource } from "./text-resources"

type SettingRoute = (typeof SETTING_ID_ROUTE_MAP)[string]

export interface UserscriptSettingsData {
  routes: typeof SETTING_ID_ROUTE_MAP
  prefixRoutes: { prefix: string; route: SettingRoute }[]
  aliases: typeof SETTING_ID_ALIASES
  legacyRoutes: Record<string, SettingRoute>
  items: SettingsSearchItem[]
  cardIds: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isRoute(value: unknown): value is SettingRoute {
  return (
    isRecord(value) &&
    typeof value.page === "string" &&
    (value.subTab === undefined || typeof value.subTab === "string")
  )
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function isSettingsData(value: unknown): value is UserscriptSettingsData {
  return (
    isRecord(value) &&
    isRecord(value.routes) &&
    Object.keys(value.routes).length > 0 &&
    Object.values(value.routes).every(isRoute) &&
    isRecord(value.aliases) &&
    Object.values(value.aliases).every((item) => typeof item === "string") &&
    isRecord(value.legacyRoutes) &&
    Object.values(value.legacyRoutes).every(isRoute) &&
    Array.isArray(value.prefixRoutes) &&
    value.prefixRoutes.every(
      (item) => isRecord(item) && typeof item.prefix === "string" && isRoute(item.route),
    ) &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.every(
      (item) =>
        isRecord(item) &&
        typeof item.settingId === "string" &&
        typeof item.title === "string" &&
        (item.keywords === undefined || isStringArray(item.keywords)),
    ) &&
    isStringArray(value.cardIds)
  )
}

let settingsData: UserscriptSettingsData | undefined

export function readUserscriptSettingsData<K extends keyof UserscriptSettingsData>(
  key: K,
): UserscriptSettingsData[K] {
  if (!settingsData) {
    const name = USERSCRIPT_RESOURCE_DEFINITIONS.settingsData.metaName
    const data = readUserscriptJsonResource(name)
    if (!isSettingsData(data)) throw new Error(`[Ophel] Invalid settings data resource: ${name}`)
    settingsData = data
  }
  return settingsData[key]
}

export function createLazyUserscriptSettingsRecord<K extends "routes" | "aliases" | "legacyRoutes">(
  key: K,
): UserscriptSettingsData[K] {
  const target = {} as UserscriptSettingsData[K]
  let populated = false
  const ensurePopulated = () => {
    if (!populated) {
      Object.assign(target, readUserscriptSettingsData(key))
      populated = true
    }
    return target
  }
  return new Proxy(target, {
    get(_target, prop, receiver) {
      return Reflect.get(ensurePopulated(), prop, receiver)
    },
    has(_target, prop) {
      return Reflect.has(ensurePopulated(), prop)
    },
    ownKeys() {
      return Reflect.ownKeys(ensurePopulated())
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Reflect.getOwnPropertyDescriptor(ensurePopulated(), prop)
    },
  })
}

export function createLazyUserscriptSettingsArray<K extends "prefixRoutes" | "items">(
  key: K,
): UserscriptSettingsData[K] {
  const target = [] as unknown as UserscriptSettingsData[K]
  let populated = false
  const ensurePopulated = () => {
    if (!populated) {
      ;(target as unknown[]).push(...readUserscriptSettingsData(key))
      populated = true
    }
    return target
  }
  return new Proxy(target, {
    get(_target, prop, receiver) {
      return Reflect.get(ensurePopulated(), prop, receiver)
    },
    has(_target, prop) {
      return Reflect.has(ensurePopulated(), prop)
    },
    ownKeys() {
      return Reflect.ownKeys(ensurePopulated())
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Reflect.getOwnPropertyDescriptor(ensurePopulated(), prop)
    },
  })
}

export function createLazyUserscriptSettingsSet(key: "cardIds"): Set<string> {
  const target = new Set<string>()
  let populated = false
  const ensurePopulated = () => {
    if (!populated) {
      for (const id of readUserscriptSettingsData(key)) {
        target.add(id)
      }
      populated = true
    }
    return target
  }
  return new Proxy(target, {
    get(_target, prop) {
      const populatedTarget = ensurePopulated()
      const value = Reflect.get(populatedTarget, prop, populatedTarget)
      return typeof value === "function" ? value.bind(populatedTarget) : value
    },
    has(_target, prop) {
      return Reflect.has(ensurePopulated(), prop)
    },
    ownKeys() {
      return Reflect.ownKeys(ensurePopulated())
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Reflect.getOwnPropertyDescriptor(ensurePopulated(), prop)
    },
  })
}
