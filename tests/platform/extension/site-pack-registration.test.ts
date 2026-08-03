import { describe, expect, it } from "vitest"

import type { SitePackManifest } from "~adapters/declarative/types"
import type { InstalledSitePack, PackManagerSnapshot } from "~core/pack-manager"
import {
  createEmptySitePackOriginBindingsState,
  type SitePackOriginBindingsState,
} from "~core/site-pack-origin-bindings"
import { SITE_PACK_REGISTRATION_STATE_STORAGE_KEY } from "~core/site-pack-storage-constants"
import type { PlatformStorage } from "~platform/types"

import {
  buildSitePackRegistrations,
  createSitePackRegistrationManager,
  discoverSitePackScriptTemplates,
  SITE_PACK_DYNAMIC_SCRIPT_ID_PREFIX,
  SITE_PACK_REGISTRATION_STATE_SCHEMA_VERSION,
  type ManifestContentScriptDescriptor,
} from "~platform/extension/site-pack-registration"

const NOW = 1_800_000_000_000
const SHARED_ORIGIN = "https://shared.example.com/*"

const clone = <T>(value: T): T => structuredClone(value)

class MemoryPlatformStorage implements PlatformStorage {
  private readonly values = new Map<string, unknown>()

  constructor(initialValues: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(initialValues)) {
      this.values.set(key, clone(value))
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const value = this.values.get(key)
    return value === undefined ? undefined : clone(value as T)
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, clone(value))
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key)
  }

  watch<T>(
    _key: string,
    _callback: (newValue: T | undefined, oldValue: T | undefined) => void,
  ): () => void {
    return () => {}
  }

  read<T>(key: string): T | undefined {
    const value = this.values.get(key)
    return value === undefined ? undefined : clone(value as T)
  }
}

const MANIFEST_CONTENT_SCRIPTS: ManifestContentScriptDescriptor[] = [
  {
    js: ["main.11111111.js"],
    matches: ["https://chatgpt.com/*"],
    run_at: "document_idle",
  },
  {
    js: ["ui-entry.22222222.js"],
    css: ["ui-entry.22222222.css"],
    matches: ["https://chatgpt.com/*"],
    run_at: "document_idle",
  },
]

const MAIN_WORLD_TEMPLATE: chrome.scripting.RegisteredContentScript = {
  id: "plasmo-main-world-templates",
  js: ["monitor-entry.33333333.js", "scroll-lock-main.44444444.js"],
  matches: ["https://chatgpt.com/*"],
  persistAcrossSessions: true,
  runAt: "document_start",
  world: "MAIN",
}

const createPack = (id: string, enabled = true): InstalledSitePack => {
  const manifest: SitePackManifest = {
    schemaVersion: 1,
    id,
    version: 1,
    minAppVersion: "1.1.8",
    name: id,
    matches: [SHARED_ORIGIN],
    capabilities: ["outline"],
    selectors: { responseContainer: "main" },
  }

  return {
    manifest,
    source: "local",
    installedAt: NOW,
    updatedAt: NOW,
    enabled,
  }
}

interface RegistrationHarnessOptions {
  packs: InstalledSitePack[]
  bindings?: SitePackOriginBindingsState
  grantedOrigins?: string[]
  managedOrigins?: string[]
  dynamicScripts?: chrome.scripting.RegisteredContentScript[]
}

const createRegistrationHarness = (options: RegistrationHarnessOptions) => {
  let packs = clone(options.packs)
  const bindings = clone(options.bindings ?? createEmptySitePackOriginBindingsState())
  let registeredScripts = [clone(MAIN_WORLD_TEMPLATE), ...clone(options.dynamicScripts ?? [])]
  const grantedOrigins = new Set(options.grantedOrigins ?? [])
  const storage = new MemoryPlatformStorage(
    options.managedOrigins
      ? {
          [SITE_PACK_REGISTRATION_STATE_STORAGE_KEY]: {
            storageSchemaVersion: SITE_PACK_REGISTRATION_STATE_SCHEMA_VERSION,
            managedOrigins: options.managedOrigins,
          },
        }
      : {},
  )
  const registerCalls: chrome.scripting.RegisteredContentScript[][] = []
  const unregisterCalls: string[][] = []
  const permissionRemovalCalls: string[][] = []

  const manager = createSitePackRegistrationManager({
    packManager: {
      async getSnapshot(): Promise<PackManagerSnapshot> {
        return {
          storageSchemaVersion: 1,
          packs: clone(packs),
          issues: [],
        }
      },
      async getOriginBindings(): Promise<SitePackOriginBindingsState> {
        return clone(bindings)
      },
    },
    storage,
    scripting: {
      async getRegisteredContentScripts() {
        return clone(registeredScripts)
      },
      async registerContentScripts(scripts) {
        const nextScripts = clone(scripts)
        const registeredIds = new Set(registeredScripts.map(({ id }) => id))
        const duplicate = nextScripts.find(({ id }) => registeredIds.has(id))
        if (duplicate) throw new Error(`Duplicate dynamic content script id: ${duplicate.id}`)
        registerCalls.push(nextScripts)
        registeredScripts.push(...nextScripts)
      },
      async unregisterContentScripts({ ids }) {
        unregisterCalls.push([...ids])
        const removedIds = new Set(ids)
        registeredScripts = registeredScripts.filter(({ id }) => !removedIds.has(id))
      },
    },
    permissions: {
      async contains(origins) {
        return origins.every((origin) => grantedOrigins.has(origin))
      },
      async remove(origins) {
        permissionRemovalCalls.push([...origins])
        origins.forEach((origin) => grantedOrigins.delete(origin))
        return true
      },
    },
    getManifestContentScripts: () => clone(MANIFEST_CONTENT_SCRIPTS),
    async requestOrigins() {
      throw new Error("Unexpected permission request")
    },
  })

  return {
    manager,
    storage,
    registerCalls,
    unregisterCalls,
    permissionRemovalCalls,
    setPacks(nextPacks: InstalledSitePack[]) {
      packs = clone(nextPacks)
    },
    getDynamicScripts(): chrome.scripting.RegisteredContentScript[] {
      return clone(
        registeredScripts
          .filter(({ id }) => id.startsWith(SITE_PACK_DYNAMIC_SCRIPT_ID_PREFIX))
          .sort((left, right) => left.id.localeCompare(right.id)),
      )
    },
  }
}

const createExpectedRegistrations = async (
  origin = SHARED_ORIGIN,
): Promise<chrome.scripting.RegisteredContentScript[]> => {
  const templates = discoverSitePackScriptTemplates(MANIFEST_CONTENT_SCRIPTS, [MAIN_WORLD_TEMPLATE])
  return buildSitePackRegistrations([origin], templates)
}

describe("SitePack extension registration reconciliation", () => {
  it("registers one shared script set for multiple packs referencing the same origin", async () => {
    const harness = createRegistrationHarness({
      packs: [createPack("alpha-pack"), createPack("beta-pack")],
      grantedOrigins: [SHARED_ORIGIN],
      managedOrigins: [SHARED_ORIGIN],
    })

    const firstResult = await harness.manager.reconcile()

    expect(firstResult.activeOrigins).toEqual([SHARED_ORIGIN])
    expect(firstResult.originReferences).toEqual([
      {
        originPattern: SHARED_ORIGIN,
        referenceCount: 2,
        references: [
          { packId: "alpha-pack", source: "static" },
          { packId: "beta-pack", source: "static" },
        ],
      },
    ])
    expect(firstResult.registrations).toHaveLength(2)
    expect(harness.registerCalls).toHaveLength(1)
    expect(harness.registerCalls[0]).toEqual(firstResult.registrations)
    expect(harness.getDynamicScripts()).toEqual(firstResult.registrations)

    const secondResult = await harness.manager.reconcile()

    expect(secondResult.registrations).toEqual(firstResult.registrations)
    expect(harness.registerCalls).toHaveLength(1)
    expect(harness.unregisterCalls).toEqual([])
  })

  it("keeps a shared origin until its final pack reference is disabled", async () => {
    const alphaPack = createPack("alpha-pack")
    const betaPack = createPack("beta-pack")
    const harness = createRegistrationHarness({
      packs: [alphaPack, betaPack],
      grantedOrigins: [SHARED_ORIGIN],
      managedOrigins: [SHARED_ORIGIN],
    })
    const initialResult = await harness.manager.reconcile()
    const registeredIds = initialResult.registrations.map(({ id }) => id)

    harness.setPacks([{ ...alphaPack, enabled: false }, betaPack])
    const retainedResult = await harness.manager.reconcile()

    expect(retainedResult.originReferences).toMatchObject([
      {
        originPattern: SHARED_ORIGIN,
        referenceCount: 1,
        references: [{ packId: "beta-pack", source: "static" }],
      },
    ])
    expect(harness.unregisterCalls).toEqual([])
    expect(harness.permissionRemovalCalls).toEqual([])
    expect(harness.getDynamicScripts()).toEqual(initialResult.registrations)

    harness.setPacks([
      { ...alphaPack, enabled: false },
      { ...betaPack, enabled: false },
    ])
    const removedResult = await harness.manager.reconcile()

    expect(removedResult.activeOrigins).toEqual([])
    expect(removedResult.originReferences).toEqual([])
    expect(harness.unregisterCalls).toEqual([registeredIds])
    expect(harness.permissionRemovalCalls).toEqual([[SHARED_ORIGIN]])
    expect(harness.getDynamicScripts()).toEqual([])
    expect(harness.storage.read(SITE_PACK_REGISTRATION_STATE_STORAGE_KEY)).toEqual({
      storageSchemaVersion: SITE_PACK_REGISTRATION_STATE_SCHEMA_VERSION,
      managedOrigins: [],
    })
  })

  it("replaces restricted registrations and removes orphaned scripts during startup reconcile", async () => {
    const expectedRegistrations = await createExpectedRegistrations()
    const restrictedRegistration = {
      ...clone(expectedRegistrations[0]),
      excludeMatches: ["https://shared.example.com/private/*"],
    }
    const orphanedRegistration: chrome.scripting.RegisteredContentScript = {
      ...clone(expectedRegistrations[0]),
      id: `${SITE_PACK_DYNAMIC_SCRIPT_ID_PREFIX}orphaned`,
      matches: ["https://orphaned.example.com/*"],
    }
    const harness = createRegistrationHarness({
      packs: [createPack("alpha-pack")],
      grantedOrigins: [SHARED_ORIGIN],
      managedOrigins: [SHARED_ORIGIN],
      dynamicScripts: [restrictedRegistration, orphanedRegistration],
    })

    const result = await harness.manager.reconcile()

    expect(result.registrations).toEqual(expectedRegistrations)
    expect(harness.unregisterCalls).toEqual([
      expect.arrayContaining([restrictedRegistration.id, orphanedRegistration.id]),
    ])
    expect(harness.registerCalls).toEqual([expectedRegistrations])
    expect(harness.getDynamicScripts()).toEqual(expectedRegistrations)
  })

  it("removes dynamic scripts after a managed origin permission is revoked", async () => {
    const expectedRegistrations = await createExpectedRegistrations()
    const harness = createRegistrationHarness({
      packs: [createPack("alpha-pack")],
      managedOrigins: [SHARED_ORIGIN],
      dynamicScripts: expectedRegistrations,
    })

    const result = await harness.manager.reconcile()

    expect(result.activeOrigins).toEqual([])
    expect(result.missingPermissionOrigins).toEqual([SHARED_ORIGIN])
    expect(harness.unregisterCalls).toEqual([expectedRegistrations.map(({ id }) => id)])
    expect(harness.permissionRemovalCalls).toEqual([])
    expect(harness.getDynamicScripts()).toEqual([])
    expect(harness.storage.read(SITE_PACK_REGISTRATION_STATE_STORAGE_KEY)).toEqual({
      storageSchemaVersion: SITE_PACK_REGISTRATION_STATE_SCHEMA_VERSION,
      managedOrigins: [],
    })
  })
})
