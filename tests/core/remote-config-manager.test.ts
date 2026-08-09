import { createHash, generateKeyPairSync, sign } from "node:crypto"

import { describe, expect, it, vi } from "vitest"

import type {
  BuiltinSiteConfig,
  SiteConfigPatch,
  SitePackManifest,
} from "~adapters/declarative/types"

import { RemoteConfigManager, type ResolveRemoteConfigSources } from "~core/remote-config-manager"
import type { TrustedRegistrySigningKey } from "~core/remote-config-signature"
import {
  REMOTE_CONFIG_STORAGE_KEY,
  REMOTE_CONFIG_STORAGE_SCHEMA_VERSION,
  type BuiltinConfigDescriptor,
  type CachedSiteConfigPatch,
  type CachedSitePack,
  type RegistryPackIndexEntry,
  type RegistryPatchIndexEntry,
  type RegistryTransport,
  type RemoteConfigRegistryIndex,
  type RemoteConfigSnapshot,
  type RemoteConfigState,
  type RemoteConfigStorage,
} from "~core/remote-config-types"

const APP_VERSION = "1.1.8"
const NOW = 1_800_000_000_000
const PRIMARY_SOURCE = "https://primary.example/registry/index.json"
const FALLBACK_SOURCE = "https://fallback.example/registry/index.json"
const SITE_ID = "test-site"
const PACK_ID = "test-pack"
const SIGNING_KEY_ID = "ophel-registry-test"
const { privateKey: SIGNING_PRIVATE_KEY, publicKey: SIGNING_PUBLIC_KEY } =
  generateKeyPairSync("ed25519")
const SIGNING_PUBLIC_KEY_HEX = SIGNING_PUBLIC_KEY.export({ format: "der", type: "spki" })
  .subarray(-32)
  .toString("hex")
const TRUSTED_SIGNING_KEYS: readonly TrustedRegistrySigningKey[] = [
  {
    keyId: SIGNING_KEY_ID,
    publicKeyHex: SIGNING_PUBLIC_KEY_HEX,
    minRegistryRevision: 1,
  },
]

const clone = <T>(value: T): T => structuredClone(value)

class MemoryRemoteConfigStorage implements RemoteConfigStorage {
  private readonly values = new Map<string, unknown>()
  readonly writes: Array<{ key: string; value: unknown }> = []

  constructor(initialState?: RemoteConfigState) {
    if (initialState) {
      this.values.set(REMOTE_CONFIG_STORAGE_KEY, clone(initialState))
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const value = this.values.get(key)
    return value === undefined ? undefined : clone(value as T)
  }

  async set<T>(key: string, value: T): Promise<void> {
    const stored = clone(value)
    this.values.set(key, stored)
    this.writes.push({ key, value: clone(stored) })
  }

  readState(): RemoteConfigState | undefined {
    const value = this.values.get(REMOTE_CONFIG_STORAGE_KEY)
    return value === undefined ? undefined : clone(value as RemoteConfigState)
  }

  clearWrites(): void {
    this.writes.length = 0
  }
}

type TransportRoute = Uint8Array | Error

const createTransport = (routes: Map<string, TransportRoute>) =>
  vi.fn(async (url: string, _maxBytes: number): Promise<Uint8Array> => {
    const route = routes.get(url)
    if (!route) throw new Error(`Unexpected registry request: ${url}`)
    if (route instanceof Error) throw route
    return route.slice()
  })

const encodeJson = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value))

const signatureUrl = (source: string): string => new URL("./index.sig.json", source).href

const createSignatureBytes = (
  indexBytes: Uint8Array,
  overrides: Partial<{
    schemaVersion: number
    algorithm: string
    keyId: string
    signature: string
  }> = {},
): Uint8Array =>
  encodeJson({
    schemaVersion: 1,
    algorithm: "Ed25519",
    keyId: SIGNING_KEY_ID,
    signature: sign(null, indexBytes, SIGNING_PRIVATE_KEY).toString("hex"),
    ...overrides,
  })

const createSignedIndexRoutes = (
  source: string,
  index: RemoteConfigRegistryIndex,
  signatureOverrides: Parameters<typeof createSignatureBytes>[1] = {},
): Array<[string, TransportRoute]> => {
  const indexBytes = encodeJson(index)
  return [
    [source, indexBytes],
    [signatureUrl(source), createSignatureBytes(indexBytes, signatureOverrides)],
  ]
}

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex")

const createBuiltinConfig = (): BuiltinSiteConfig => ({
  capabilities: ["outline"],
  selectors: {
    responseContainer: "main[data-base]",
  },
})

const BUILTIN_DESCRIPTOR: BuiltinConfigDescriptor = {
  siteId: SITE_ID,
  configVersion: 3,
  baseConfig: createBuiltinConfig(),
}

const resolveBuiltinConfig = (siteId: string): BuiltinConfigDescriptor | null =>
  siteId === SITE_ID ? clone(BUILTIN_DESCRIPTOR) : null

const createPack = (version = 1): SitePackManifest => ({
  schemaVersion: 1,
  id: PACK_ID,
  version,
  minAppVersion: APP_VERSION,
  name: "Test Pack",
  matches: ["https://chat.example.com/*"],
  capabilities: ["outline"],
  selectors: {
    responseContainer: `main[data-pack-version="${version}"]`,
  },
})

const createPatch = (patchVersion = 1): SiteConfigPatch => ({
  targetSiteId: SITE_ID,
  patchSchemaVersion: 1,
  patchVersion,
  baseConfigVersion: BUILTIN_DESCRIPTOR.configVersion,
  minAppVersion: APP_VERSION,
  config: {
    selectors: {
      responseContainer: `main[data-patch-version="${patchVersion}"]`,
    },
  },
})

const createPackEntry = (
  manifest: SitePackManifest,
  bytes: Uint8Array,
  overrides: Partial<RegistryPackIndexEntry> = {},
): RegistryPackIndexEntry => ({
  id: manifest.id,
  version: manifest.version,
  minAppVersion: manifest.minAppVersion,
  matches: [...manifest.matches],
  file: `packs/${manifest.id}/${manifest.version}.json`,
  sha256: sha256(bytes),
  disabled: false,
  ...overrides,
})

const createPatchEntry = (
  patch: SiteConfigPatch,
  bytes: Uint8Array,
  overrides: Partial<RegistryPatchIndexEntry> = {},
): RegistryPatchIndexEntry => ({
  targetSiteId: patch.targetSiteId,
  patchVersion: patch.patchVersion,
  baseConfigVersion: patch.baseConfigVersion,
  minAppVersion: patch.minAppVersion,
  ...(patch.maxAppVersion ? { maxAppVersion: patch.maxAppVersion } : {}),
  file: `patches/${patch.targetSiteId}/${patch.patchVersion}.json`,
  sha256: sha256(bytes),
  disabled: false,
  ...overrides,
})

const createIndex = (
  registryRevision: number,
  entries: {
    packs?: RegistryPackIndexEntry[]
    patches?: RegistryPatchIndexEntry[]
    generatedAt?: number
  } = {},
): RemoteConfigRegistryIndex => ({
  generatedAt: entries.generatedAt ?? NOW,
  schemaVersion: 1,
  registryRevision,
  packs: entries.packs ?? [],
  patches: entries.patches ?? [],
})

const createSnapshot = (
  index: RemoteConfigRegistryIndex,
  artifacts: {
    packs?: Record<string, CachedSitePack>
    patches?: Record<string, CachedSiteConfigPatch>
    sourceUrl?: string
  } = {},
): RemoteConfigSnapshot => ({
  sourceUrl: artifacts.sourceUrl ?? PRIMARY_SOURCE,
  index,
  packs: artifacts.packs ?? {},
  patches: artifacts.patches ?? {},
})

const createState = (
  overrides: Partial<Omit<RemoteConfigState, "storageSchemaVersion">> = {},
): RemoteConfigState => ({
  storageSchemaVersion: REMOTE_CONFIG_STORAGE_SCHEMA_VERSION,
  localPatches: {},
  ignoredPatches: {},
  ...overrides,
})

const createManager = (
  storage: RemoteConfigStorage,
  transport: RegistryTransport,
  options: {
    sources?: readonly string[]
    resolveSources?: ResolveRemoteConfigSources
    checkIntervalMs?: number
  } = {},
): RemoteConfigManager => {
  const sourceOptions = options.resolveSources
    ? { resolveSources: options.resolveSources }
    : { sources: options.sources ?? [PRIMARY_SOURCE] }

  return new RemoteConfigManager({
    storage,
    transport,
    appVersion: APP_VERSION,
    resolveBuiltinConfig,
    ...sourceOptions,
    checkIntervalMs: options.checkIntervalMs,
    now: () => NOW,
    trustedSigningKeys: TRUSTED_SIGNING_KEYS,
  })
}

const artifactUrl = (entry: { file: string }, source = PRIMARY_SOURCE): string =>
  new URL(entry.file, source).href

describe("RemoteConfigManager source handling", () => {
  it("falls back to the secondary source when the primary source is unavailable", async () => {
    const pack = createPack()
    const packBytes = encodeJson(pack)
    const packEntry = createPackEntry(pack, packBytes)
    const index = createIndex(1, { packs: [packEntry] })
    const routes = new Map<string, TransportRoute>([
      [PRIMARY_SOURCE, new Error("primary unavailable")],
      ...createSignedIndexRoutes(FALLBACK_SOURCE, index),
      [artifactUrl(packEntry, FALLBACK_SOURCE), packBytes],
    ])
    const transport = createTransport(routes)
    const storage = new MemoryRemoteConfigStorage()
    const manager = createManager(storage, transport, {
      sources: [PRIMARY_SOURCE, FALLBACK_SOURCE],
    })

    const result = await manager.checkForUpdates({ force: true })

    expect(result).toMatchObject({
      status: "updated",
      checkedAt: NOW,
      registryRevision: 1,
      sourceUrl: FALLBACK_SOURCE,
      changes: {
        downloadedPacks: 1,
      },
    })
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      PRIMARY_SOURCE,
      FALLBACK_SOURCE,
      signatureUrl(FALLBACK_SOURCE),
      artifactUrl(packEntry, FALLBACK_SOURCE),
    ])
    expect(storage.readState()).toMatchObject({
      active: {
        sourceUrl: FALLBACK_SOURCE,
        packs: {
          [PACK_ID]: {
            manifest: pack,
          },
        },
      },
      ignoredPatches: {},
      lastCheckAt: NOW,
      lastSuccessAt: NOW,
    })
    expect(storage.readState()?.lastError).toBeUndefined()
  })

  it("records both source failures and preserves the active snapshot", async () => {
    const active = createSnapshot(createIndex(3))
    const initialState = createState({
      active,
      lastCheckAt: NOW - 20_000,
      lastSuccessAt: NOW - 20_000,
    })
    const routes = new Map<string, TransportRoute>([
      [PRIMARY_SOURCE, new Error("primary unavailable")],
      [FALLBACK_SOURCE, new Error("fallback unavailable")],
    ])
    const transport = createTransport(routes)
    const storage = new MemoryRemoteConfigStorage(initialState)
    const manager = createManager(storage, transport, {
      sources: [PRIMARY_SOURCE, FALLBACK_SOURCE],
    })

    const result = await manager.checkForUpdates({ force: true })

    expect(result).toMatchObject({
      status: "failed",
      registryRevision: 3,
      sourceUrl: PRIMARY_SOURCE,
      error: "primary unavailable | fallback unavailable",
    })
    expect(storage.readState()).toEqual({
      ...initialState,
      lastCheckAt: NOW,
      lastError: {
        at: NOW,
        message: "primary unavailable | fallback unavailable",
        sources: [
          { sourceUrl: PRIMARY_SOURCE, message: "primary unavailable" },
          { sourceUrl: FALLBACK_SOURCE, message: "fallback unavailable" },
        ],
      },
    })
  })

  it("falls back when the primary index signature is invalid", async () => {
    const index = createIndex(1)
    const routes = new Map<string, TransportRoute>([
      ...createSignedIndexRoutes(PRIMARY_SOURCE, index, { signature: "00".repeat(64) }),
      ...createSignedIndexRoutes(FALLBACK_SOURCE, index),
    ])
    const transport = createTransport(routes)
    const storage = new MemoryRemoteConfigStorage()
    const manager = createManager(storage, transport, {
      sources: [PRIMARY_SOURCE, FALLBACK_SOURCE],
    })

    const result = await manager.checkForUpdates({ force: true })

    expect(result).toMatchObject({
      status: "updated",
      registryRevision: 1,
      sourceUrl: FALLBACK_SOURCE,
    })
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      PRIMARY_SOURCE,
      signatureUrl(PRIMARY_SOURCE),
      FALLBACK_SOURCE,
      signatureUrl(FALLBACK_SOURCE),
    ])
  })

  it("preserves the active snapshot when every source signature is invalid", async () => {
    const active = createSnapshot(createIndex(3))
    const initialState = createState({ active, lastSuccessAt: NOW - 20_000 })
    const nextIndex = createIndex(4)
    const routes = new Map<string, TransportRoute>([
      ...createSignedIndexRoutes(PRIMARY_SOURCE, nextIndex, { signature: "00".repeat(64) }),
      ...createSignedIndexRoutes(FALLBACK_SOURCE, nextIndex, { keyId: "unknown-key" }),
    ])
    const transport = createTransport(routes)
    const storage = new MemoryRemoteConfigStorage(initialState)
    const manager = createManager(storage, transport, {
      sources: [PRIMARY_SOURCE, FALLBACK_SOURCE],
    })

    const result = await manager.checkForUpdates({ force: true })

    expect(result).toMatchObject({
      status: "failed",
      registryRevision: 3,
    })
    expect(result.error).toContain("Invalid Ed25519 signature")
    expect(result.error).toContain("Unknown registry signing key: unknown-key")
    expect(storage.readState()?.active).toEqual(active)
  })

  it("throttles a recent automatic check without transport or storage writes", async () => {
    const checkIntervalMs = 10_000
    const lastCheckAt = NOW - 1_000
    const storage = new MemoryRemoteConfigStorage(createState({ lastCheckAt }))
    const transport = createTransport(new Map())
    const manager = createManager(storage, transport, { checkIntervalMs })

    const result = await manager.checkForUpdates({ force: false })

    expect(result).toMatchObject({
      status: "throttled",
      checkedAt: NOW,
      registryRevision: 0,
      nextCheckAt: lastCheckAt + checkIntervalMs,
    })
    expect(transport).not.toHaveBeenCalled()
    expect(storage.writes).toHaveLength(0)
  })

  it("resolves the current source for each check", async () => {
    let selectedSource = PRIMARY_SOURCE
    const firstIndex = createIndex(1)
    const secondIndex = createIndex(2)
    const routes = new Map<string, TransportRoute>([
      ...createSignedIndexRoutes(PRIMARY_SOURCE, firstIndex),
      ...createSignedIndexRoutes(FALLBACK_SOURCE, secondIndex),
    ])
    const transport = createTransport(routes)
    const storage = new MemoryRemoteConfigStorage()
    const manager = createManager(storage, transport, {
      resolveSources: () => [selectedSource],
    })

    await expect(manager.checkForUpdates({ force: true })).resolves.toMatchObject({
      status: "updated",
      sourceUrl: PRIMARY_SOURCE,
      registryRevision: 1,
    })

    selectedSource = FALLBACK_SOURCE
    await expect(manager.checkForUpdates({ force: true })).resolves.toMatchObject({
      status: "updated",
      sourceUrl: FALLBACK_SOURCE,
      registryRevision: 2,
    })

    expect(storage.readState()?.active?.sourceUrl).toBe(FALLBACK_SOURCE)
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      PRIMARY_SOURCE,
      signatureUrl(PRIMARY_SOURCE),
      FALLBACK_SOURCE,
      signatureUrl(FALLBACK_SOURCE),
    ])
  })
})

describe("RemoteConfigManager integrity and last-known-good state", () => {
  it("rejects an artifact whose SHA-256 does not match the registry", async () => {
    const currentPack = createPack(1)
    const currentBytes = encodeJson(currentPack)
    const currentEntry = createPackEntry(currentPack, currentBytes)
    const active = createSnapshot(createIndex(1, { packs: [currentEntry] }), {
      packs: {
        [PACK_ID]: { index: currentEntry, manifest: currentPack },
      },
    })
    const nextPack = createPack(2)
    const nextBytes = encodeJson(nextPack)
    const nextEntry = createPackEntry(nextPack, nextBytes, {
      sha256: "0".repeat(64),
    })
    const routes = new Map<string, TransportRoute>([
      ...createSignedIndexRoutes(PRIMARY_SOURCE, createIndex(2, { packs: [nextEntry] })),
      [artifactUrl(nextEntry), nextBytes],
    ])
    const transport = createTransport(routes)
    const storage = new MemoryRemoteConfigStorage(createState({ active }))
    const manager = createManager(storage, transport)

    const result = await manager.checkForUpdates({ force: true })

    expect(result).toMatchObject({
      status: "failed",
      registryRevision: 1,
      error: `SHA-256 mismatch for ${nextEntry.file}`,
    })
    expect(storage.readState()?.active).toEqual(active)
  })

  it("rejects a registry revision rollback and preserves the active snapshot", async () => {
    const active = createSnapshot(createIndex(2))
    const transport = createTransport(
      new Map(createSignedIndexRoutes(PRIMARY_SOURCE, createIndex(1))),
    )
    const storage = new MemoryRemoteConfigStorage(createState({ active }))
    const manager = createManager(storage, transport)

    const result = await manager.checkForUpdates({ force: true })

    expect(result).toMatchObject({
      status: "failed",
      registryRevision: 2,
      error: "Stale registry revision 1; local revision is 2",
    })
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      PRIMARY_SOURCE,
      signatureUrl(PRIMARY_SOURCE),
    ])
    expect(storage.readState()?.active).toEqual(active)
  })

  it("keeps the complete last-known-good snapshot when a validly hashed pack is invalid", async () => {
    const currentPack = createPack(1)
    const currentBytes = encodeJson(currentPack)
    const currentEntry = createPackEntry(currentPack, currentBytes)
    const active = createSnapshot(createIndex(1, { packs: [currentEntry] }), {
      packs: {
        [PACK_ID]: { index: currentEntry, manifest: currentPack },
      },
    })
    const invalidPack = {
      schemaVersion: 1,
      id: PACK_ID,
      version: 2,
    }
    const invalidBytes = encodeJson(invalidPack)
    const nextEntry = createPackEntry(createPack(2), invalidBytes)
    const transport = createTransport(
      new Map([
        ...createSignedIndexRoutes(PRIMARY_SOURCE, createIndex(2, { packs: [nextEntry] })),
        [artifactUrl(nextEntry), invalidBytes],
      ]),
    )
    const storage = new MemoryRemoteConfigStorage(createState({ active }))
    const manager = createManager(storage, transport)

    const result = await manager.checkForUpdates({ force: true })

    expect(result.status).toBe("failed")
    expect(result.error).toContain("Pack validation failed")
    expect(storage.readState()?.active).toEqual(active)
    expect(storage.writes).toHaveLength(1)
  })
})

describe("RemoteConfigManager stop and recovery paths", () => {
  it("removes disabled packs and patches without downloading artifacts", async () => {
    const pack = createPack()
    const packBytes = encodeJson(pack)
    const packEntry = createPackEntry(pack, packBytes)
    const patch = createPatch()
    const patchBytes = encodeJson(patch)
    const patchEntry = createPatchEntry(patch, patchBytes)
    const active = createSnapshot(createIndex(1, { packs: [packEntry], patches: [patchEntry] }), {
      packs: {
        [PACK_ID]: { index: packEntry, manifest: pack },
      },
      patches: {
        [SITE_ID]: { index: patchEntry, patch },
      },
    })
    const disabledPackEntry = { ...packEntry, disabled: true }
    const disabledPatchEntry = { ...patchEntry, disabled: true }
    const nextIndex = createIndex(2, {
      packs: [disabledPackEntry],
      patches: [disabledPatchEntry],
    })
    const transport = createTransport(new Map(createSignedIndexRoutes(PRIMARY_SOURCE, nextIndex)))
    const storage = new MemoryRemoteConfigStorage(createState({ active }))
    const manager = createManager(storage, transport)

    const result = await manager.checkForUpdates({ force: true })

    expect(result).toMatchObject({
      status: "updated",
      registryRevision: 2,
      changes: {
        downloadedPacks: 0,
        downloadedPatches: 0,
        disabledPacks: 1,
        disabledPatches: 1,
        removedPacks: 1,
        removedPatches: 1,
      },
    })
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      PRIMARY_SOURCE,
      signatureUrl(PRIMARY_SOURCE),
    ])
    expect(storage.readState()?.active).toEqual({
      sourceUrl: PRIMARY_SOURCE,
      index: nextIndex,
      packs: {},
      patches: {},
    })
  })

  it("does not redownload an ignored patch and accepts a newer version", async () => {
    const patchV1 = createPatch(1)
    const patchV1Bytes = encodeJson(patchV1)
    const patchV1Entry = createPatchEntry(patchV1, patchV1Bytes)
    const indexV1 = createIndex(1, { patches: [patchV1Entry] })
    const active = createSnapshot(indexV1, {
      patches: {
        [SITE_ID]: { index: patchV1Entry, patch: patchV1 },
      },
    })
    const routes = new Map<string, TransportRoute>(createSignedIndexRoutes(PRIMARY_SOURCE, indexV1))
    const transport = createTransport(routes)
    const storage = new MemoryRemoteConfigStorage(createState({ active }))
    const manager = createManager(storage, transport)

    await expect(manager.ignorePatch(SITE_ID)).resolves.toBe(true)
    expect(storage.readState()).toMatchObject({
      ignoredPatches: { [SITE_ID]: 1 },
      active: { patches: {} },
    })

    storage.clearWrites()
    transport.mockClear()
    const ignoredResult = await manager.checkForUpdates({ force: true })

    expect(ignoredResult).toMatchObject({
      status: "up-to-date",
      changes: { ignoredPatches: 1, downloadedPatches: 0 },
    })
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      PRIMARY_SOURCE,
      signatureUrl(PRIMARY_SOURCE),
    ])
    expect(storage.readState()?.ignoredPatches).toEqual({ [SITE_ID]: 1 })

    const patchV2 = createPatch(2)
    const patchV2Bytes = encodeJson(patchV2)
    const patchV2Entry = createPatchEntry(patchV2, patchV2Bytes)
    const indexV2 = createIndex(2, { patches: [patchV2Entry] })
    for (const [url, route] of createSignedIndexRoutes(PRIMARY_SOURCE, indexV2)) {
      routes.set(url, route)
    }
    routes.set(artifactUrl(patchV2Entry), patchV2Bytes)
    storage.clearWrites()
    transport.mockClear()

    const updatedResult = await manager.checkForUpdates({ force: true })

    expect(updatedResult).toMatchObject({
      status: "updated",
      registryRevision: 2,
      changes: { downloadedPatches: 1, ignoredPatches: 0 },
    })
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      PRIMARY_SOURCE,
      signatureUrl(PRIMARY_SOURCE),
      artifactUrl(patchV2Entry),
    ])
    expect(storage.readState()).toMatchObject({
      ignoredPatches: {},
      active: {
        patches: {
          [SITE_ID]: {
            patch: patchV2,
          },
        },
      },
    })
  })
})

describe("RemoteConfigManager local patches", () => {
  it("installs, prioritizes, and preserves local patches across remote checks", async () => {
    const registryPatch = createPatch(1)
    const registryBytes = encodeJson(registryPatch)
    const registryEntry = createPatchEntry(registryPatch, registryBytes)
    const index = createIndex(1, { patches: [registryEntry] })
    const routes = new Map<string, TransportRoute>([
      ...createSignedIndexRoutes(PRIMARY_SOURCE, index),
      [artifactUrl(registryEntry), registryBytes],
    ])
    const transport = createTransport(routes)
    const storage = new MemoryRemoteConfigStorage()
    const manager = createManager(storage, transport)

    const localPatch = createPatch(9)
    localPatch.config = {
      selectors: {
        responseContainer: "main[data-local]",
      },
    }

    const installed = await manager.installLocalPatch(localPatch, { fileName: "ima-local.json" })
    expect(installed).toMatchObject({
      changed: true,
      siteId: SITE_ID,
      record: {
        fileName: "ima-local.json",
        patch: {
          patchVersion: 9,
          config: {
            selectors: {
              responseContainer: "main[data-local]",
            },
          },
        },
      },
    })

    const remoteResult = await manager.checkForUpdates({ force: true })
    expect(remoteResult.status).toBe("updated")
    expect(storage.readState()).toMatchObject({
      localPatches: {
        [SITE_ID]: {
          fileName: "ima-local.json",
          patch: {
            patchVersion: 9,
          },
        },
      },
      active: {
        patches: {
          [SITE_ID]: {
            patch: {
              patchVersion: 1,
            },
          },
        },
      },
    })

    const { loadActiveSiteConfigPatchDetails } = await import("~core/remote-config-cache")
    const loaded = await loadActiveSiteConfigPatchDetails(storage, SITE_ID)
    expect(loaded).toMatchObject({
      source: "local",
      fileName: "ima-local.json",
      patch: {
        patchVersion: 9,
        config: {
          selectors: {
            responseContainer: "main[data-local]",
          },
        },
      },
    })
  })

  it("resets both local and remote patches when ignorePatch is called", async () => {
    const registryPatch = createPatch(1)
    const registryBytes = encodeJson(registryPatch)
    const registryEntry = createPatchEntry(registryPatch, registryBytes)
    const active = createSnapshot(createIndex(1, { patches: [registryEntry] }), {
      patches: {
        [SITE_ID]: { index: registryEntry, patch: registryPatch },
      },
    })
    const storage = new MemoryRemoteConfigStorage(
      createState({
        active,
        localPatches: {
          [SITE_ID]: {
            installedAt: NOW,
            fileName: "local.json",
            patch: createPatch(3),
          },
        },
      }),
    )
    const manager = createManager(storage, createTransport(new Map()))

    await expect(manager.ignorePatch(SITE_ID)).resolves.toBe(true)
    expect(storage.readState()).toMatchObject({
      localPatches: {},
      ignoredPatches: { [SITE_ID]: 3 },
      active: { patches: {} },
    })
  })

  it("removes only the local override via removeLocalPatch", async () => {
    const registryPatch = createPatch(1)
    const registryBytes = encodeJson(registryPatch)
    const registryEntry = createPatchEntry(registryPatch, registryBytes)
    const active = createSnapshot(createIndex(1, { patches: [registryEntry] }), {
      patches: {
        [SITE_ID]: { index: registryEntry, patch: registryPatch },
      },
    })
    const storage = new MemoryRemoteConfigStorage(
      createState({
        active,
        localPatches: {
          [SITE_ID]: {
            installedAt: NOW,
            patch: createPatch(4),
          },
        },
      }),
    )
    const manager = createManager(storage, createTransport(new Map()))

    await expect(manager.removeLocalPatch(SITE_ID)).resolves.toEqual({
      changed: true,
      siteId: SITE_ID,
    })
    expect(storage.readState()?.localPatches).toEqual({})
    expect(storage.readState()?.active?.patches[SITE_ID]?.patch.patchVersion).toBe(1)

    const { loadActiveSiteConfigPatchDetails } = await import("~core/remote-config-cache")
    const loaded = await loadActiveSiteConfigPatchDetails(storage, SITE_ID)
    expect(loaded).toMatchObject({
      source: "registry",
      patch: { patchVersion: 1 },
    })
  })

  it("rejects local patches for unknown built-in sites", async () => {
    const storage = new MemoryRemoteConfigStorage()
    const manager = createManager(storage, createTransport(new Map()))
    await expect(
      manager.installLocalPatch({
        ...createPatch(1),
        targetSiteId: "missing-site",
      }),
    ).rejects.toThrow(/No configurable built-in adapter/)
  })
})

describe("RemoteConfigManager development source switching", () => {
  it("allows moving from a high local revision back to a lower production revision", async () => {
    const localSource = "http://127.0.0.1:8787/index.json"
    const localPatch = createPatch(1)
    const localBytes = encodeJson(localPatch)
    const localEntry = createPatchEntry(localPatch, localBytes)
    const localIndex = createIndex(1_700_000_000, { patches: [localEntry] })
    const localActive = createSnapshot(localIndex, {
      sourceUrl: localSource,
      patches: {
        [SITE_ID]: { index: localEntry, patch: localPatch },
      },
    })

    const productionPatch = createPatch(2)
    const productionBytes = encodeJson(productionPatch)
    const productionEntry = createPatchEntry(productionPatch, productionBytes)
    const productionIndex = createIndex(12, { patches: [productionEntry] })
    const routes = new Map<string, TransportRoute>([
      ...createSignedIndexRoutes(PRIMARY_SOURCE, productionIndex),
      [artifactUrl(productionEntry), productionBytes],
    ])
    const transport = createTransport(routes)
    const storage = new MemoryRemoteConfigStorage(createState({ active: localActive }))
    const manager = createManager(storage, transport)

    const result = await manager.checkForUpdates({ force: true, sources: [PRIMARY_SOURCE] })
    expect(result.status).toBe("updated")
    expect(result.registryRevision).toBe(12)
    expect(storage.readState()?.active?.sourceUrl).toBe(PRIMARY_SOURCE)
    expect(storage.readState()?.active?.patches[SITE_ID]?.patch.patchVersion).toBe(2)
  })

  it("still rejects stale revisions on the same non-local source", async () => {
    const newer = createSnapshot(createIndex(5))
    const olderIndex = createIndex(4)
    const transport = createTransport(new Map(createSignedIndexRoutes(PRIMARY_SOURCE, olderIndex)))
    const storage = new MemoryRemoteConfigStorage(createState({ active: newer }))
    const manager = createManager(storage, transport)

    const result = await manager.checkForUpdates({ force: true, sources: [PRIMARY_SOURCE] })
    expect(result.status).toBe("failed")
    expect(result.error).toContain("Stale registry revision")
    expect(storage.readState()?.active?.index.registryRevision).toBe(5)
  })

  it("allows same loopback revision with different content after local rebuild", async () => {
    const localSource = "http://127.0.0.1:8787/index.json"
    const oldPatch = createPatch(1)
    const oldBytes = encodeJson(oldPatch)
    const oldEntry = createPatchEntry(oldPatch, oldBytes)
    const oldIndex = createIndex(42, { patches: [oldEntry] })
    const oldActive = createSnapshot(oldIndex, {
      sourceUrl: localSource,
      patches: {
        [SITE_ID]: { index: oldEntry, patch: oldPatch },
      },
    })

    const newPatch = createPatch(2)
    const newBytes = encodeJson(newPatch)
    const newEntry = createPatchEntry(newPatch, newBytes)
    const newIndex = createIndex(42, { patches: [newEntry] })
    const routes = new Map<string, TransportRoute>([
      ...createSignedIndexRoutes(localSource, newIndex),
      [artifactUrl(newEntry, localSource), newBytes],
    ])
    const transport = createTransport(routes)
    const storage = new MemoryRemoteConfigStorage(createState({ active: oldActive }))
    const manager = createManager(storage, transport)

    const result = await manager.checkForUpdates({ force: true, sources: [localSource] })
    expect(result.status).toBe("updated")
    expect(result.registryRevision).toBe(42)
    expect(storage.readState()?.active?.sourceUrl).toBe(localSource)
    expect(storage.readState()?.active?.patches[SITE_ID]?.patch.patchVersion).toBe(2)
  })

  it("clears cached registry snapshot while preserving local patches", async () => {
    const patch = createPatch(1)
    const patchBytes = encodeJson(patch)
    const patchEntry = createPatchEntry(patch, patchBytes)
    const active = createSnapshot(createIndex(3, { patches: [patchEntry] }), {
      patches: {
        [SITE_ID]: { index: patchEntry, patch },
      },
    })
    const storage = new MemoryRemoteConfigStorage(
      createState({
        active,
        localPatches: {
          [SITE_ID]: {
            installedAt: NOW,
            fileName: "local.json",
            patch: createPatch(9),
          },
        },
        lastError: {
          at: NOW,
          message: "boom",
          sources: [{ sourceUrl: PRIMARY_SOURCE, message: "boom" }],
        },
      }),
    )
    const manager = createManager(storage, createTransport(new Map()))

    await expect(manager.clearCachedRegistrySnapshot()).resolves.toBe(true)
    const state = storage.readState()
    expect(state?.active).toBeUndefined()
    expect(state?.lastError).toBeUndefined()
    expect(state?.localPatches[SITE_ID]?.patch.patchVersion).toBe(9)
  })
})
