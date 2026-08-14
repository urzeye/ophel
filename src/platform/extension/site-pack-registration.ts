import { isSiteMatchPatternOriginPattern } from "~adapters/declarative/match-pattern"
import type { PackManager, PackManagerIssue } from "~core/pack-manager"
import {
  collapseCoveredSitePackOriginPatterns,
  deriveSitePackOriginReferences,
  getSitePackReferencedOriginPatterns,
  sitePackBindingOriginPattern,
  type SitePackOriginBindingIssue,
  type SitePackOriginReferenceEntry,
} from "~core/site-pack-origin-references"
import {
  canonicalizeSitePackBindingOrigin,
  parseSitePackOriginBinding,
  type SitePackOriginBinding,
} from "~core/site-pack-origin-bindings"
import { SITE_PACK_REGISTRATION_STATE_STORAGE_KEY } from "~core/site-pack-storage-constants"
import type { PlatformStorage } from "~platform/types"

export { SITE_PACK_REGISTRATION_STATE_STORAGE_KEY } from "~core/site-pack-storage-constants"
export const SITE_PACK_REGISTRATION_STATE_SCHEMA_VERSION = 1 as const
export const SITE_PACK_DYNAMIC_SCRIPT_ID_PREFIX = "ophel-sitepack-"

const GENERIC_ISOLATED_ENTRY_NAMES = ["main", "ui-entry"] as const
const GENERIC_MAIN_ENTRY_NAMES = ["monitor-entry", "scroll-lock-main"] as const

type ScriptRunAt = NonNullable<chrome.scripting.RegisteredContentScript["runAt"]>
type ScriptWorld = NonNullable<chrome.scripting.RegisteredContentScript["world"]>

export interface ManifestContentScriptDescriptor {
  js?: string[]
  css?: string[]
  matches?: string[]
  run_at?: ScriptRunAt
  world?: ScriptWorld
  all_frames?: boolean
  match_origin_as_fallback?: boolean
}

export interface SitePackScriptTemplate {
  world: ScriptWorld
  runAt: ScriptRunAt
  js: string[]
  css: string[]
  allFrames: boolean
  matchOriginAsFallback: boolean
}

interface StoredSitePackRegistrationState {
  storageSchemaVersion: typeof SITE_PACK_REGISTRATION_STATE_SCHEMA_VERSION
  managedOrigins: string[]
}

export interface SitePackScriptingApi {
  getRegisteredContentScripts(): Promise<chrome.scripting.RegisteredContentScript[]>
  registerContentScripts(scripts: chrome.scripting.RegisteredContentScript[]): Promise<void>
  unregisterContentScripts(filter: { ids: string[] }): Promise<void>
}

export interface SitePackPermissionsApi {
  contains(origins: string[]): Promise<boolean>
  remove(origins: string[]): Promise<boolean>
}

export interface SitePackOriginPermissionRequestContext {
  name: string
}

export interface SitePackRegistrationManagerOptions {
  packManager: Pick<PackManager, "getOriginBindings" | "getSnapshot">
  storage: PlatformStorage
  scripting: SitePackScriptingApi
  permissions: SitePackPermissionsApi
  getManifestContentScripts(): readonly ManifestContentScriptDescriptor[]
  requestOrigins(
    context: SitePackOriginPermissionRequestContext,
    origins: readonly string[],
  ): Promise<boolean>
}

export interface EnsureSitePackOriginsResult {
  granted: boolean
  origins: string[]
  missingOrigins: string[]
}

export interface ReconcileSitePackRegistrationsResult {
  activeOrigins: string[]
  missingPermissionOrigins: string[]
  registrations: chrome.scripting.RegisteredContentScript[]
  originReferences: SitePackOriginReferenceEntry[]
  bindingIssues: SitePackOriginBindingIssue[]
  packIssues: PackManagerIssue[]
}

export interface ClearSitePackRegistrationsResult {
  unregisteredScriptIds: string[]
  revokedOrigins: string[]
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const uniqueSorted = (values: readonly string[]): string[] =>
  Array.from(new Set(values)).sort((left, right) => left.localeCompare(right))

const getAssetBaseName = (assetPath: string): string =>
  assetPath.replaceAll("\\", "/").split("/").at(-1)?.split("?")[0] ?? ""

const normalizeExtensionAssetPath = (assetPath: string): string => {
  const normalized = assetPath.replaceAll("\\", "/")
  try {
    const url = new URL(normalized)
    if (url.protocol === "chrome-extension:" || url.protocol === "moz-extension:") {
      return url.pathname.replace(/^\/+/, "")
    }
  } catch {
    // Relative extension asset paths are expected on Chromium.
  }
  return normalized.replace(/^\/+/, "")
}

const assetMatchesEntry = (assetPath: string, entryName: string): boolean => {
  const baseName = getAssetBaseName(assetPath)
  return (
    baseName === `${entryName}.ts` ||
    baseName === `${entryName}.tsx` ||
    baseName === `${entryName}.js` ||
    baseName.startsWith(`${entryName}.`)
  )
}

const containsEntryAsset = (assets: readonly string[], entryNames: readonly string[]): boolean =>
  entryNames.some((entryName) => assets.some((asset) => assetMatchesEntry(asset, entryName)))

const assertEntryAssetsPresent = (
  assets: readonly string[],
  entryNames: readonly string[],
  source: string,
): void => {
  const missing = entryNames.filter(
    (entryName) => !assets.some((asset) => assetMatchesEntry(asset, entryName)),
  )
  if (missing.length > 0) {
    throw new Error(`Missing ${source} SitePack script assets: ${missing.join(", ")}`)
  }
}

const appendUnique = (target: string[], values: readonly string[]): void => {
  for (const value of values) {
    if (!target.includes(value)) target.push(value)
  }
}

const groupTemplates = (templates: readonly SitePackScriptTemplate[]): SitePackScriptTemplate[] => {
  const groups = new Map<string, SitePackScriptTemplate>()

  for (const template of templates) {
    const key = `${template.world}\u0000${template.runAt}`
    const current = groups.get(key)
    if (!current) {
      groups.set(key, {
        ...template,
        js: [...template.js],
        css: [...template.css],
      })
      continue
    }
    if (
      current.allFrames !== template.allFrames ||
      current.matchOriginAsFallback !== template.matchOriginAsFallback
    ) {
      throw new Error(
        `SitePack script templates with ${template.world}/${template.runAt} disagree on frame behavior`,
      )
    }
    appendUnique(current.js, template.js)
    appendUnique(current.css, template.css)
  }

  return Array.from(groups.values()).sort(
    (left, right) => left.world.localeCompare(right.world) || left.runAt.localeCompare(right.runAt),
  )
}

export const discoverSitePackScriptTemplates = (
  manifestScripts: readonly ManifestContentScriptDescriptor[],
  registeredScripts: readonly chrome.scripting.RegisteredContentScript[],
): SitePackScriptTemplate[] => {
  const isolatedDescriptors = manifestScripts.filter((script) =>
    containsEntryAsset(script.js ?? [], GENERIC_ISOLATED_ENTRY_NAMES),
  )
  const isolatedAssets = isolatedDescriptors.flatMap((script) => script.js ?? [])
  assertEntryAssetsPresent(isolatedAssets, GENERIC_ISOLATED_ENTRY_NAMES, "ISOLATED world")

  const mainDescriptors = registeredScripts.filter(
    (script) =>
      !script.id.startsWith(SITE_PACK_DYNAMIC_SCRIPT_ID_PREFIX) &&
      containsEntryAsset(script.js ?? [], GENERIC_MAIN_ENTRY_NAMES),
  )
  const mainAssets = mainDescriptors.flatMap((script) => script.js ?? [])
  assertEntryAssetsPresent(mainAssets, GENERIC_MAIN_ENTRY_NAMES, "MAIN world")

  const isolatedTemplates = isolatedDescriptors.map(
    (script): SitePackScriptTemplate => ({
      world: script.world ?? "ISOLATED",
      runAt: script.run_at ?? "document_idle",
      js: (script.js ?? []).map(normalizeExtensionAssetPath),
      css: (script.css ?? []).map(normalizeExtensionAssetPath),
      allFrames: script.all_frames ?? false,
      matchOriginAsFallback: script.match_origin_as_fallback ?? false,
    }),
  )
  const mainTemplates = mainDescriptors.map((script): SitePackScriptTemplate => {
    const world = script.world ?? "ISOLATED"
    if (world !== "MAIN") {
      throw new Error(`Expected MAIN world SitePack template: ${script.id}`)
    }
    return {
      world,
      runAt: script.runAt ?? "document_idle",
      js: (script.js ?? []).map(normalizeExtensionAssetPath),
      css: (script.css ?? []).map(normalizeExtensionAssetPath),
      allFrames: script.allFrames ?? false,
      matchOriginAsFallback: script.matchOriginAsFallback ?? false,
    }
  })

  return groupTemplates([...isolatedTemplates, ...mainTemplates])
}

const hashOrigin = async (originPattern: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(originPattern))
  return Array.from(new Uint8Array(digest).slice(0, 8), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

const getRegistrationId = async (
  originPattern: string,
  template: SitePackScriptTemplate,
): Promise<string> => {
  const originHash = await hashOrigin(originPattern)
  return `${SITE_PACK_DYNAMIC_SCRIPT_ID_PREFIX}${originHash}-${template.world.toLowerCase()}-${template.runAt.replace("document_", "")}`
}

export const buildSitePackRegistrations = async (
  originPatterns: readonly string[],
  templates: readonly SitePackScriptTemplate[],
): Promise<chrome.scripting.RegisteredContentScript[]> => {
  const registrations = await Promise.all(
    uniqueSorted(originPatterns).flatMap((originPattern) =>
      templates.map(
        async (template): Promise<chrome.scripting.RegisteredContentScript> => ({
          id: await getRegistrationId(originPattern, template),
          matches: [originPattern],
          persistAcrossSessions: true,
          world: template.world,
          runAt: template.runAt,
          ...(template.js.length > 0 ? { js: [...template.js] } : {}),
          ...(template.css.length > 0 ? { css: [...template.css] } : {}),
          ...(template.allFrames ? { allFrames: true } : {}),
          ...(template.matchOriginAsFallback ? { matchOriginAsFallback: true } : {}),
        }),
      ),
    ),
  )
  return registrations.sort((left, right) => left.id.localeCompare(right.id))
}

const canonicalRegistration = (script: chrome.scripting.RegisteredContentScript): string =>
  JSON.stringify({
    id: script.id,
    matches: uniqueSorted(script.matches ?? []),
    excludeMatches: uniqueSorted(script.excludeMatches ?? []),
    js: script.js ?? [],
    css: script.css ?? [],
    world: script.world ?? "ISOLATED",
    runAt: script.runAt ?? "document_idle",
    allFrames: script.allFrames ?? false,
    matchOriginAsFallback: script.matchOriginAsFallback ?? false,
    persistAcrossSessions: script.persistAcrossSessions ?? false,
  })

const sameRegistration = (
  left: chrome.scripting.RegisteredContentScript,
  right: chrome.scripting.RegisteredContentScript,
): boolean => canonicalRegistration(left) === canonicalRegistration(right)

const parseStoredState = (value: unknown): StoredSitePackRegistrationState => {
  if (value === undefined) {
    return {
      storageSchemaVersion: SITE_PACK_REGISTRATION_STATE_SCHEMA_VERSION,
      managedOrigins: [],
    }
  }
  if (!isPlainRecord(value)) {
    throw new Error("SitePack extension runtime state must be an object")
  }
  if (value.storageSchemaVersion !== SITE_PACK_REGISTRATION_STATE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported SitePack extension runtime state schema: ${String(value.storageSchemaVersion)}`,
    )
  }
  if (
    !Array.isArray(value.managedOrigins) ||
    !value.managedOrigins.every(
      (origin): origin is string =>
        typeof origin === "string" && isSiteMatchPatternOriginPattern(origin),
    )
  ) {
    throw new Error(
      "SitePack extension runtime managedOrigins must contain HTTP(S) origin patterns",
    )
  }
  return {
    storageSchemaVersion: SITE_PACK_REGISTRATION_STATE_SCHEMA_VERSION,
    managedOrigins: uniqueSorted(value.managedOrigins),
  }
}

export const createSitePackRegistrationManager = (options: SitePackRegistrationManagerOptions) => {
  let mutationQueue: Promise<void> = Promise.resolve()

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = mutationQueue.then(operation, operation)
    mutationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  const loadState = async (): Promise<StoredSitePackRegistrationState> =>
    parseStoredState(await options.storage.get<unknown>(SITE_PACK_REGISTRATION_STATE_STORAGE_KEY))

  const saveState = async (managedOrigins: readonly string[]): Promise<void> => {
    await options.storage.set<StoredSitePackRegistrationState>(
      SITE_PACK_REGISTRATION_STATE_STORAGE_KEY,
      {
        storageSchemaVersion: SITE_PACK_REGISTRATION_STATE_SCHEMA_VERSION,
        managedOrigins: uniqueSorted(managedOrigins),
      },
    )
  }

  const hasOriginPermission = (origin: string): Promise<boolean> =>
    options.permissions.contains([origin])

  const ensureOriginPatternsInternal = async (
    context: SitePackOriginPermissionRequestContext,
    requestedOrigins: readonly string[],
  ): Promise<EnsureSitePackOriginsResult> => {
    const origins = uniqueSorted(requestedOrigins)
    const missingOrigins: string[] = []
    for (const origin of origins) {
      if (!(await hasOriginPermission(origin))) missingOrigins.push(origin)
    }
    if (missingOrigins.length === 0) {
      return { granted: true, origins, missingOrigins: [] }
    }

    const state = await loadState()
    const granted = await options.requestOrigins(context, missingOrigins)
    if (!granted) return { granted: false, origins, missingOrigins }

    for (const origin of missingOrigins) {
      if (!(await hasOriginPermission(origin))) {
        throw new Error(`SitePack permission request did not grant ${origin}`)
      }
    }

    const nextManagedOrigins = uniqueSorted([...state.managedOrigins, ...missingOrigins])
    try {
      await saveState(nextManagedOrigins)
    } catch (error) {
      try {
        const removed = await options.permissions.remove(missingOrigins)
        if (!removed) {
          const retainedOrigins: string[] = []
          for (const origin of missingOrigins) {
            if (await hasOriginPermission(origin)) retainedOrigins.push(origin)
          }
          if (retainedOrigins.length > 0) {
            throw new Error(
              `Failed to roll back SitePack origin permissions: ${retainedOrigins.join(", ")}`,
            )
          }
        }
      } catch (rollbackError) {
        throw new Error(
          `Failed to persist SitePack permission ownership: ${String(error)}; permission rollback failed: ${String(rollbackError)}`,
        )
      }
      throw error
    }

    return { granted: true, origins, missingOrigins: [] }
  }

  const ensurePackOriginsInternal = async (
    packId: string,
  ): Promise<EnsureSitePackOriginsResult> => {
    const snapshot = await options.packManager.getSnapshot()
    const pack = snapshot.packs.find((candidate) => candidate.manifest.id === packId)
    if (!pack) throw new Error(`Installed SitePack not found: ${packId}`)

    const bindingState = await options.packManager.getOriginBindings()
    const origins = getSitePackReferencedOriginPatterns(pack, bindingState)
    return ensureOriginPatternsInternal({ name: pack.manifest.name }, origins)
  }

  const ensureBindingOriginInternal = async (
    origin: string,
    binding: SitePackOriginBinding,
    requestName: string,
  ): Promise<EnsureSitePackOriginsResult> => {
    const canonicalOrigin = canonicalizeSitePackBindingOrigin(origin)
    const parsedBinding = parseSitePackOriginBinding(binding)
    const normalizedName = requestName.trim()
    if (!normalizedName || normalizedName.length > 120) {
      throw new Error("SitePack binding permission request name must contain 1-120 characters")
    }

    const snapshot = await options.packManager.getSnapshot()
    const pack = snapshot.packs.find((candidate) => candidate.manifest.id === parsedBinding.packId)
    if (!pack) throw new Error(`Installed SitePack not found: ${parsedBinding.packId}`)

    return ensureOriginPatternsInternal({ name: normalizedName }, [
      sitePackBindingOriginPattern(canonicalOrigin),
    ])
  }

  const reconcileInternal = async (): Promise<ReconcileSitePackRegistrationsResult> => {
    const snapshot = await options.packManager.getSnapshot()
    const bindingState = await options.packManager.getOriginBindings()
    const state = await loadState()
    const referenceGraph = deriveSitePackOriginReferences(snapshot.packs, bindingState)
    const desiredOrigins = referenceGraph.originReferences.map(({ originPattern }) => originPattern)
    const permittedOrigins: string[] = []
    const missingPermissionOrigins: string[] = []
    for (const origin of desiredOrigins) {
      if (await hasOriginPermission(origin)) permittedOrigins.push(origin)
      else missingPermissionOrigins.push(origin)
    }
    const activeOrigins = collapseCoveredSitePackOriginPatterns(permittedOrigins)

    const registeredScripts = await options.scripting.getRegisteredContentScripts()
    const currentDynamic = registeredScripts.filter((script) =>
      script.id.startsWith(SITE_PACK_DYNAMIC_SCRIPT_ID_PREFIX),
    )
    const templates =
      activeOrigins.length > 0
        ? discoverSitePackScriptTemplates(options.getManifestContentScripts(), registeredScripts)
        : []
    const desiredRegistrations = await buildSitePackRegistrations(activeOrigins, templates)
    const desiredById = new Map(desiredRegistrations.map((script) => [script.id, script] as const))
    const currentById = new Map(currentDynamic.map((script) => [script.id, script] as const))

    const removeIds = currentDynamic
      .filter((current) => {
        const desired = desiredById.get(current.id)
        return !desired || !sameRegistration(current, desired)
      })
      .map((script) => script.id)
    const addScripts = desiredRegistrations.filter((desired) => {
      const current = currentById.get(desired.id)
      return !current || !sameRegistration(current, desired)
    })

    if (removeIds.length > 0) {
      await options.scripting.unregisterContentScripts({ ids: removeIds })
    }
    if (addScripts.length > 0) {
      await options.scripting.registerContentScripts(addScripts)
    }

    const retainedManagedOrigins: string[] = []
    for (const origin of state.managedOrigins) {
      const stillGranted = await hasOriginPermission(origin)
      if (desiredOrigins.includes(origin) && stillGranted) {
        retainedManagedOrigins.push(origin)
        continue
      }
      if (stillGranted) {
        const removed = await options.permissions.remove([origin])
        if (!removed && (await hasOriginPermission(origin))) {
          throw new Error(`Failed to revoke SitePack-managed origin permission: ${origin}`)
        }
      }
    }
    if (
      retainedManagedOrigins.length !== state.managedOrigins.length ||
      retainedManagedOrigins.some((origin, index) => origin !== state.managedOrigins[index])
    ) {
      await saveState(retainedManagedOrigins)
    }

    return {
      activeOrigins,
      missingPermissionOrigins,
      registrations: desiredRegistrations,
      originReferences: referenceGraph.originReferences,
      bindingIssues: referenceGraph.bindingIssues,
      packIssues: snapshot.issues,
    }
  }

  const clearAllInternal = async (): Promise<ClearSitePackRegistrationsResult> => {
    const registeredScripts = await options.scripting.getRegisteredContentScripts()
    const unregisteredScriptIds = registeredScripts
      .filter((script) => script.id.startsWith(SITE_PACK_DYNAMIC_SCRIPT_ID_PREFIX))
      .map((script) => script.id)
      .sort((left, right) => left.localeCompare(right))

    if (unregisteredScriptIds.length > 0) {
      await options.scripting.unregisterContentScripts({ ids: unregisteredScriptIds })
    }

    const state = await loadState()
    const revokedOrigins: string[] = []
    for (const origin of state.managedOrigins) {
      if (!(await hasOriginPermission(origin))) continue
      const removed = await options.permissions.remove([origin])
      if (!removed && (await hasOriginPermission(origin))) {
        throw new Error(`Failed to revoke SitePack-managed origin permission: ${origin}`)
      }
      revokedOrigins.push(origin)
    }

    await options.storage.remove(SITE_PACK_REGISTRATION_STATE_STORAGE_KEY)
    return { unregisteredScriptIds, revokedOrigins }
  }

  return {
    ensurePackOrigins(packId: string): Promise<EnsureSitePackOriginsResult> {
      return enqueue(() => ensurePackOriginsInternal(packId))
    },

    ensureBindingOrigin(
      origin: string,
      binding: SitePackOriginBinding,
      requestName: string,
    ): Promise<EnsureSitePackOriginsResult> {
      return enqueue(() => ensureBindingOriginInternal(origin, binding, requestName))
    },

    reconcile(): Promise<ReconcileSitePackRegistrationsResult> {
      return enqueue(reconcileInternal)
    },

    clearAll(): Promise<ClearSitePackRegistrationsResult> {
      return enqueue(clearAllInternal)
    },

    async getRegisteredMatchPatterns(): Promise<string[]> {
      const scripts = await options.scripting.getRegisteredContentScripts()
      return uniqueSorted(
        scripts
          .filter((script) => script.id.startsWith(SITE_PACK_DYNAMIC_SCRIPT_ID_PREFIX))
          .flatMap((script) => script.matches ?? []),
      )
    },
  }
}

export type SitePackRegistrationManager = ReturnType<typeof createSitePackRegistrationManager>
