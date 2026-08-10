import { describe, expect, it } from "vitest"

import type { SitePackManifest } from "~adapters/declarative/types"

import {
  INSTALLED_SITE_PACKS_STORAGE_KEY,
  INSTALLED_SITE_PACKS_STORAGE_SCHEMA_VERSION,
  PackManager,
  type InstalledSitePack,
  type PackManagerErrorCode,
} from "~core/pack-manager"
import {
  REMOTE_CONFIG_STORAGE_KEY,
  REMOTE_CONFIG_STORAGE_SCHEMA_VERSION,
} from "~core/remote-config-storage-constants"
import type {
  CachedSitePack,
  RegistryPackIndexEntry,
  RemoteConfigState,
  RemoteConfigStorage,
} from "~core/remote-config-types"

const APP_VERSION = "1.1.8"
const NOW = 1_800_000_000_000
const REGISTRY_SOURCE = "https://registry.example/index.json"

interface RawInstalledState {
  storageSchemaVersion: number
  packs: Record<string, unknown>
}

class MemoryPackStorage implements RemoteConfigStorage {
  private readonly values = new Map<string, unknown>()
  readonly writes: Array<{ key: string; value: unknown }> = []

  async get<T>(key: string): Promise<T | undefined> {
    const value = this.values.get(key)
    return value === undefined ? undefined : structuredClone(value as T)
  }

  async set<T>(key: string, value: T): Promise<void> {
    const stored = structuredClone(value)
    this.values.set(key, stored)
    this.writes.push({ key, value: structuredClone(stored) })
  }

  seed(key: string, value: unknown): void {
    this.values.set(key, structuredClone(value))
  }

  read<T>(key: string): T | undefined {
    const value = this.values.get(key)
    return value === undefined ? undefined : structuredClone(value as T)
  }

  clearWrites(): void {
    this.writes.length = 0
  }
}

const createHarness = () => {
  const storage = new MemoryPackStorage()
  let currentTime = NOW
  const manager = new PackManager({
    storage,
    appVersion: APP_VERSION,
    now: () => currentTime,
  })
  return {
    manager,
    storage,
    advanceTime(milliseconds = 1_000) {
      currentTime += milliseconds
    },
  }
}

const createManifest = (
  id = "alpha-pack",
  version = 1,
  overrides: Partial<SitePackManifest> = {},
): SitePackManifest => ({
  schemaVersion: 1,
  id,
  version,
  minAppVersion: APP_VERSION,
  name: `${id} v${version}`,
  matches: [`https://${id}.example.test/*`],
  capabilities: ["outline"],
  selectors: {
    responseContainer: `main[data-pack="${id}"]`,
  },
  ...overrides,
})

const createRegistryEntry = (
  manifest: SitePackManifest,
  overrides: Partial<RegistryPackIndexEntry> = {},
): RegistryPackIndexEntry => ({
  id: manifest.id,
  version: manifest.version,
  minAppVersion: manifest.minAppVersion,
  matches: [...manifest.matches],
  file: `packs/${manifest.id}/${manifest.version}.json`,
  sha256: "a".repeat(64),
  disabled: false,
  ...overrides,
})

const createCachedPack = (
  manifest: SitePackManifest,
  index = createRegistryEntry(manifest),
): CachedSitePack => ({
  index,
  manifest: structuredClone(manifest),
})

const createRemoteState = (
  registryRevision: number,
  entries: RegistryPackIndexEntry[],
  cachedPacks: Record<string, unknown>,
  sourceUrl: string = REGISTRY_SOURCE,
): RemoteConfigState => ({
  storageSchemaVersion: REMOTE_CONFIG_STORAGE_SCHEMA_VERSION,
  localPatches: {},
  ignoredPatches: {},
  active: {
    sourceUrl,
    index: {
      generatedAt: NOW + registryRevision,
      schemaVersion: 1,
      registryRevision,
      packs: entries,
      patches: [],
    },
    packs: cachedPacks as Record<string, CachedSitePack>,
    patches: {},
  },
})

const createRemoteCatalog = (
  registryRevision: number,
  manifests: SitePackManifest[],
  sourceUrl: string = REGISTRY_SOURCE,
): RemoteConfigState => {
  const entries = manifests.map((manifest) => createRegistryEntry(manifest))
  return createRemoteState(
    registryRevision,
    entries,
    Object.fromEntries(
      manifests.map((manifest, index) => [manifest.id, createCachedPack(manifest, entries[index])]),
    ),
    sourceUrl,
  )
}

const expectManagerError = async (
  operation: Promise<unknown>,
  code: PackManagerErrorCode,
): Promise<void> => {
  await expect(operation).rejects.toMatchObject({
    name: "PackManagerError",
    code,
  })
}

const readInstalledState = (storage: MemoryPackStorage): RawInstalledState | undefined =>
  storage.read<RawInstalledState>(INSTALLED_SITE_PACKS_STORAGE_KEY)

const packById = (packs: InstalledSitePack[], packId: string): InstalledSitePack => {
  const pack = packs.find((candidate) => candidate.manifest.id === packId)
  if (!pack) throw new Error(`Expected installed pack ${packId}`)
  return pack
}

describe("PackManager local lifecycle", () => {
  it("keeps install, update, enable, and uninstall operations monotonic and idempotent", async () => {
    const { manager, storage, advanceTime } = createHarness()
    const manifestV1 = createManifest()

    const installed = await manager.installLocal(manifestV1)
    expect(installed).toMatchObject({
      changed: true,
      pack: {
        source: "local",
        installedAt: NOW,
        updatedAt: NOW,
        enabled: true,
        manifest: { id: "alpha-pack", version: 1 },
      },
    })

    installed.pack!.manifest.name = "mutated result"
    manifestV1.name = "mutated input"
    expect(packById((await manager.getSnapshot()).packs, "alpha-pack").manifest.name).toBe(
      "alpha-pack v1",
    )

    storage.clearWrites()
    const identical = await manager.installLocal(createManifest())
    expect(identical.changed).toBe(false)
    expect(storage.writes).toHaveLength(0)

    const disabled = await manager.setEnabled("alpha-pack", false)
    expect(disabled).toMatchObject({ changed: true, pack: { enabled: false } })
    storage.clearWrites()
    const disabledAgain = await manager.setEnabled("alpha-pack", false)
    expect(disabledAgain).toMatchObject({ changed: false, pack: { enabled: false } })
    expect(storage.writes).toHaveLength(0)

    advanceTime()
    const updated = await manager.installLocal(createManifest("alpha-pack", 2))
    expect(updated).toMatchObject({
      changed: true,
      pack: {
        installedAt: NOW,
        updatedAt: NOW + 1_000,
        enabled: false,
        manifest: { version: 2 },
      },
    })

    await expectManagerError(
      manager.installLocal(createManifest("alpha-pack", 1)),
      "version-rollback",
    )
    await expectManagerError(
      manager.installLocal(
        createManifest("alpha-pack", 2, {
          name: "same version with changed content",
        }),
      ),
      "version-reuse",
    )

    const enabled = await manager.setEnabled("alpha-pack", true)
    expect(enabled).toMatchObject({ changed: true, pack: { enabled: true } })
    storage.clearWrites()
    const enabledAgain = await manager.setEnabled("alpha-pack", true)
    expect(enabledAgain).toMatchObject({ changed: false, pack: { enabled: true } })
    expect(storage.writes).toHaveLength(0)
    expect((await manager.getEnabledPacks()).packs.map((pack) => pack.manifest.id)).toEqual([
      "alpha-pack",
    ])

    const remoteState = createRemoteCatalog(1, [createManifest("remote-only")])
    storage.seed(REMOTE_CONFIG_STORAGE_KEY, remoteState)
    const removed = await manager.uninstall("alpha-pack")
    expect(removed).toEqual({ changed: true, removedOriginBindings: [] })
    storage.clearWrites()
    await expect(manager.uninstall("alpha-pack")).resolves.toEqual({ changed: false })
    expect(storage.writes).toHaveLength(0)
    expect(await manager.getSnapshot()).toMatchObject({ packs: [], issues: [] })
    expect(storage.read(REMOTE_CONFIG_STORAGE_KEY)).toEqual(remoteState)
  })

  it("serializes concurrent identical installs into one write and one no-op", async () => {
    const { manager, storage } = createHarness()

    const results = await Promise.all([
      manager.installLocal(createManifest()),
      manager.installLocal(createManifest()),
    ])

    expect(results.map((result) => result.changed).sort()).toEqual([false, true])
    expect(
      storage.writes.filter((write) => write.key === INSTALLED_SITE_PACKS_STORAGE_KEY),
    ).toHaveLength(1)
    expect((await manager.getSnapshot()).packs).toHaveLength(1)
  })
})

describe("PackManager validation and stored-state isolation", () => {
  it("rejects invalid, incompatible, conflicting, and cross-source packages without mutation", async () => {
    const { manager, storage } = createHarness()
    await manager.installLocal(createManifest())
    const baseline = readInstalledState(storage)
    storage.clearWrites()

    const invalidManifest = createManifest() as unknown as Record<string, unknown>
    delete invalidManifest.name
    await expectManagerError(manager.installLocal(invalidManifest), "invalid-pack")
    await expectManagerError(
      manager.installLocal(createManifest("future-pack", 1, { minAppVersion: "9.0.0" })),
      "incompatible-app-version",
    )
    await expectManagerError(manager.installLocal(createManifest("chatgpt")), "builtin-id-conflict")
    await expectManagerError(
      manager.installLocal(
        createManifest("builtin-domain", 1, {
          matches: ["https://chatgpt.com/*"],
        }),
      ),
      "builtin-match-conflict",
    )
    await expectManagerError(
      manager.installLocal(
        createManifest("overlap-pack", 1, {
          matches: ["https://alpha-pack.example.test/different-path/*"],
        }),
      ),
      "installed-match-conflict",
    )

    storage.seed(REMOTE_CONFIG_STORAGE_KEY, createRemoteCatalog(1, [createManifest()]))
    await expectManagerError(manager.installFromRegistry("alpha-pack"), "source-conflict")

    expect(readInstalledState(storage)).toEqual(baseline)
    expect(storage.writes).toHaveLength(0)
  })

  it("reports malformed records while preserving valid records during unrelated mutations", async () => {
    const { manager, storage } = createHarness()
    await manager.installLocal(createManifest())
    const rawState = readInstalledState(storage)!
    rawState.packs["broken-pack"] = "not-an-installed-pack"
    storage.seed(INSTALLED_SITE_PACKS_STORAGE_KEY, rawState)

    const snapshot = await manager.getSnapshot()
    expect(snapshot.packs.map((pack) => pack.manifest.id)).toEqual(["alpha-pack"])
    expect(snapshot.issues).toContainEqual(
      expect.objectContaining({
        code: "invalid-record",
        packId: "broken-pack",
      }),
    )

    await expect(manager.installLocal(createManifest("beta-pack"))).resolves.toMatchObject({
      changed: true,
    })
    expect(readInstalledState(storage)?.packs["broken-pack"]).toBe("not-an-installed-pack")
    expect((await manager.getSnapshot()).packs.map((pack) => pack.manifest.id)).toEqual([
      "alpha-pack",
      "beta-pack",
    ])
  })

  it("rejects unsupported installed storage schemas explicitly", async () => {
    const { manager, storage } = createHarness()
    storage.seed(INSTALLED_SITE_PACKS_STORAGE_KEY, {
      storageSchemaVersion: INSTALLED_SITE_PACKS_STORAGE_SCHEMA_VERSION + 1,
      packs: {},
    })

    await expectManagerError(manager.getSnapshot(), "storage-schema-unsupported")
  })
})

describe("PackManager registry lifecycle", () => {
  it("installs only valid active registry artifacts and keeps failures isolated", async () => {
    const { manager, storage } = createHarness()
    const registryPack = createManifest("registry-pack")
    storage.seed(REMOTE_CONFIG_STORAGE_KEY, createRemoteCatalog(1, [registryPack]))

    const installed = await manager.installFromRegistry("registry-pack")
    expect(installed).toMatchObject({
      changed: true,
      pack: {
        source: "registry",
        registryStatus: "available",
        enabled: true,
      },
    })
    storage.clearWrites()
    await expect(manager.installFromRegistry("registry-pack")).resolves.toMatchObject({
      changed: false,
    })
    expect(storage.writes).toHaveLength(0)
    const baseline = readInstalledState(storage)

    const disabledPack = createManifest("disabled-pack")
    const disabledEntry = createRegistryEntry(disabledPack, { disabled: true })
    storage.seed(REMOTE_CONFIG_STORAGE_KEY, createRemoteState(2, [disabledEntry], {}))
    await expectManagerError(manager.installFromRegistry("disabled-pack"), "registry-pack-disabled")

    storage.seed(REMOTE_CONFIG_STORAGE_KEY, createRemoteState(3, [], {}))
    await expectManagerError(
      manager.installFromRegistry("missing-pack"),
      "registry-pack-unavailable",
    )

    const malformedPack = createManifest("malformed-cache")
    const malformedEntry = createRegistryEntry(malformedPack)
    storage.seed(
      REMOTE_CONFIG_STORAGE_KEY,
      createRemoteState(4, [malformedEntry], {
        [malformedPack.id]: { index: malformedEntry, manifest: null },
      }),
    )
    await expectManagerError(
      manager.installFromRegistry(malformedPack.id),
      "registry-cache-invalid",
    )

    const incompatiblePack = createManifest("incompatible-cache", 1, {
      minAppVersion: "9.0.0",
    })
    storage.seed(REMOTE_CONFIG_STORAGE_KEY, createRemoteCatalog(5, [incompatiblePack]))
    await expectManagerError(
      manager.installFromRegistry(incompatiblePack.id),
      "incompatible-app-version",
    )

    expect(readInstalledState(storage)).toEqual(baseline)
  })

  it("reconciles updates, kill switches, removal, and recovery without changing local packs", async () => {
    const { manager, storage, advanceTime } = createHarness()
    const registryV1 = createManifest("registry-pack", 1)
    const localV1 = createManifest("local-pack", 1)
    storage.seed(REMOTE_CONFIG_STORAGE_KEY, createRemoteCatalog(1, [registryV1]))
    await manager.installFromRegistry(registryV1.id)
    await manager.installLocal(localV1)
    const initialSnapshot = await manager.getSnapshot()
    const initialRegistry = packById(initialSnapshot.packs, registryV1.id)
    const initialLocal = packById(initialSnapshot.packs, localV1.id)

    advanceTime()
    const registryV2 = createManifest(registryV1.id, 2)
    const remoteLocalV2 = createManifest(localV1.id, 2)
    storage.seed(REMOTE_CONFIG_STORAGE_KEY, createRemoteCatalog(2, [registryV2, remoteLocalV2]))
    const updated = await manager.syncRegistryPacks()
    expect(updated).toMatchObject({
      changed: true,
      updatedPackIds: [registryV1.id],
      statusChangedPackIds: [],
      issues: [],
    })
    let snapshot = await manager.getSnapshot()
    expect(packById(snapshot.packs, registryV1.id)).toMatchObject({
      installedAt: initialRegistry.installedAt,
      updatedAt: NOW + 1_000,
      enabled: true,
      registryStatus: "available",
      manifest: { version: 2 },
    })
    expect(packById(snapshot.packs, localV1.id)).toEqual(initialLocal)

    const disabledEntry = createRegistryEntry(registryV2, { disabled: true })
    storage.seed(REMOTE_CONFIG_STORAGE_KEY, createRemoteState(3, [disabledEntry], {}))
    const disabled = await manager.syncRegistryPacks()
    expect(disabled).toMatchObject({
      changed: true,
      updatedPackIds: [],
      statusChangedPackIds: [registryV1.id],
      issues: [],
    })
    snapshot = await manager.getSnapshot()
    expect(packById(snapshot.packs, registryV1.id)).toMatchObject({
      enabled: true,
      registryStatus: "disabled",
      manifest: { version: 2 },
    })
    expect((await manager.getEnabledPacks()).packs.map((pack) => pack.manifest.id)).toEqual([
      localV1.id,
    ])

    storage.seed(REMOTE_CONFIG_STORAGE_KEY, createRemoteState(4, [], {}))
    const unavailable = await manager.syncRegistryPacks()
    expect(unavailable).toMatchObject({
      changed: true,
      statusChangedPackIds: [registryV1.id],
    })
    expect(packById((await manager.getSnapshot()).packs, registryV1.id)).toMatchObject({
      enabled: true,
      registryStatus: "unavailable",
      manifest: { version: 2 },
    })

    advanceTime()
    const registryV3 = createManifest(registryV1.id, 3)
    storage.seed(REMOTE_CONFIG_STORAGE_KEY, createRemoteCatalog(5, [registryV3, remoteLocalV2]))
    const recovered = await manager.syncRegistryPacks()
    expect(recovered).toMatchObject({
      changed: true,
      updatedPackIds: [registryV1.id],
      statusChangedPackIds: [registryV1.id],
      issues: [],
    })
    snapshot = await manager.getSnapshot()
    expect(packById(snapshot.packs, registryV1.id)).toMatchObject({
      installedAt: initialRegistry.installedAt,
      updatedAt: NOW + 2_000,
      enabled: true,
      registryStatus: "available",
      manifest: { version: 3 },
    })
    expect(packById(snapshot.packs, localV1.id)).toEqual(initialLocal)
    expect(
      new Set((await manager.getEnabledPacks()).packs.map((pack) => pack.manifest.id)),
    ).toEqual(new Set([registryV1.id, localV1.id]))
  })

  it("updates healthy registry packs while preserving a bad pack's last-known-good record", async () => {
    const { manager, storage, advanceTime } = createHarness()
    const goodV1 = createManifest("good-pack", 1)
    const badV2 = createManifest("bad-pack", 2)
    const localV1 = createManifest("local-pack", 1)
    storage.seed(REMOTE_CONFIG_STORAGE_KEY, createRemoteCatalog(1, [goodV1, badV2]))
    await manager.installFromRegistry(goodV1.id)
    await manager.installFromRegistry(badV2.id)
    await manager.installLocal(localV1)
    const initialSnapshot = await manager.getSnapshot()
    const initialBad = packById(initialSnapshot.packs, badV2.id)
    const initialLocal = packById(initialSnapshot.packs, localV1.id)

    advanceTime()
    const goodV2 = createManifest(goodV1.id, 2)
    const badV3 = createManifest(badV2.id, 3)
    const goodV2Entry = createRegistryEntry(goodV2)
    const badV3Entry = createRegistryEntry(badV3)
    storage.seed(
      REMOTE_CONFIG_STORAGE_KEY,
      createRemoteState(2, [goodV2Entry, badV3Entry], {
        [goodV2.id]: createCachedPack(goodV2, goodV2Entry),
        [badV3.id]: {
          index: badV3Entry,
          manifest: { schemaVersion: 1, id: badV3.id, version: 3 },
        },
      }),
    )

    const partialUpdate = await manager.syncRegistryPacks()
    expect(partialUpdate).toMatchObject({
      changed: true,
      updatedPackIds: [goodV1.id],
      statusChangedPackIds: [],
    })
    expect(partialUpdate.issues).toContainEqual(
      expect.objectContaining({ code: "invalid-pack", packId: badV2.id }),
    )
    let snapshot = await manager.getSnapshot()
    expect(packById(snapshot.packs, goodV1.id).manifest.version).toBe(2)
    expect(packById(snapshot.packs, badV2.id)).toEqual(initialBad)
    expect(packById(snapshot.packs, localV1.id)).toEqual(initialLocal)

    const badV1 = createManifest(badV2.id, 1)
    storage.seed(REMOTE_CONFIG_STORAGE_KEY, createRemoteCatalog(3, [goodV2, badV1]))
    const rollback = await manager.syncRegistryPacks()
    expect(rollback.changed).toBe(false)
    expect(rollback.issues).toContainEqual(
      expect.objectContaining({ code: "version-rollback", packId: badV2.id }),
    )
    expect(packById((await manager.getSnapshot()).packs, badV2.id)).toEqual(initialBad)

    const reusedBadV2 = createManifest(badV2.id, 2, {
      name: "reused version content",
    })
    storage.seed(REMOTE_CONFIG_STORAGE_KEY, createRemoteCatalog(4, [goodV2, reusedBadV2]))
    const reuse = await manager.syncRegistryPacks()
    expect(reuse.changed).toBe(false)
    expect(reuse.issues).toContainEqual(
      expect.objectContaining({ code: "version-reuse", packId: badV2.id }),
    )
    snapshot = await manager.getSnapshot()
    expect(packById(snapshot.packs, goodV1.id).manifest.version).toBe(2)
    expect(packById(snapshot.packs, badV2.id)).toEqual(initialBad)
    expect(packById(snapshot.packs, localV1.id)).toEqual(initialLocal)
  })
})

describe("PackManager loopback content replace", () => {
  it("replaces same-version and lower-version content from loopback registries", async () => {
    const { manager, storage, advanceTime } = createHarness()
    const packV1 = createManifest("dev-pack", 1, { name: "Dev pack original" })
    storage.seed(
      REMOTE_CONFIG_STORAGE_KEY,
      createRemoteCatalog(1, [packV1], "http://127.0.0.1:8787/index.json"),
    )
    await manager.installFromRegistry(packV1.id)

    advanceTime()
    const sameVersionChanged = createManifest("dev-pack", 1, { name: "Dev pack revised" })
    storage.seed(
      REMOTE_CONFIG_STORAGE_KEY,
      createRemoteCatalog(1, [sameVersionChanged], "http://127.0.0.1:8787/index.json"),
    )
    const sameVersionSync = await manager.syncRegistryPacks()
    expect(sameVersionSync).toMatchObject({
      changed: true,
      updatedPackIds: [packV1.id],
      issues: [],
    })
    expect(packById((await manager.getSnapshot()).packs, packV1.id).manifest.name).toBe(
      "Dev pack revised",
    )

    advanceTime()
    const lowerVersionChanged = createManifest("dev-pack", 1, { name: "Dev pack again" })
    // Simulate a rebuild that keeps declared version while content changes again.
    storage.seed(
      REMOTE_CONFIG_STORAGE_KEY,
      createRemoteCatalog(2, [lowerVersionChanged], "http://localhost:8787/index.json"),
    )
    const repeatSync = await manager.syncRegistryPacks()
    expect(repeatSync.updatedPackIds).toEqual([packV1.id])
    expect(packById((await manager.getSnapshot()).packs, packV1.id).manifest.name).toBe(
      "Dev pack again",
    )

    // Production sources remain strict.
    const productionChanged = createManifest("dev-pack", 1, { name: "Production blocked" })
    storage.seed(REMOTE_CONFIG_STORAGE_KEY, createRemoteCatalog(3, [productionChanged]))
    const productionSync = await manager.syncRegistryPacks()
    expect(productionSync.changed).toBe(false)
    expect(productionSync.issues).toContainEqual(
      expect.objectContaining({ code: "version-reuse", packId: packV1.id }),
    )
    expect(packById((await manager.getSnapshot()).packs, packV1.id).manifest.name).toBe(
      "Dev pack again",
    )
  })

  it("allows installFromRegistry content replace on loopback without version bumps", async () => {
    const { manager, storage, advanceTime } = createHarness()
    const packV1 = createManifest("dev-install", 2, { name: "Installed" })
    storage.seed(
      REMOTE_CONFIG_STORAGE_KEY,
      createRemoteCatalog(1, [packV1], "http://127.0.0.1:8787/index.json"),
    )
    await manager.installFromRegistry(packV1.id)

    advanceTime()
    const revised = createManifest("dev-install", 2, { name: "Reinstalled content" })
    storage.seed(
      REMOTE_CONFIG_STORAGE_KEY,
      createRemoteCatalog(1, [revised], "http://127.0.0.1:8787/index.json"),
    )
    const result = await manager.installFromRegistry(revised.id)
    expect(result.changed).toBe(true)
    expect(result.pack?.manifest.name).toBe("Reinstalled content")
  })
})
