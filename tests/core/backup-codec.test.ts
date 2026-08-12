import { describe, expect, it } from "vitest"

import type { PlatformStorage } from "~platform/types"

import {
  BACKUP_SCHEMA_VERSION,
  createBackupDocument,
  createBackupRestorePlan,
  restoreBackupDocument,
} from "~core/backup-codec"
import {
  INSTALLED_SITE_PACKS_STORAGE_KEY,
  REMOTE_CONFIG_STORAGE_KEY,
  SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY,
  SITE_PACK_REGISTRATION_STATE_STORAGE_KEY,
} from "~core/site-pack-storage-constants"

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

describe("backup codec SitePack lifecycle", () => {
  it("round-trips local packs, origin bindings, and overrides without remote runtime state", async () => {
    const installedPacks = {
      storageSchemaVersion: 1,
      packs: {
        "example-chat": {
          manifest: {
            schemaVersion: 1,
            id: "example-chat",
            version: 1,
            minAppVersion: "1.1.8",
            name: "Example Chat",
            matches: ["https://chat.example.com/*"],
            capabilities: ["outline"],
            selectors: { responseContainer: "main" },
          },
          source: "local",
          installedAt: 1_800_000_000_000,
          updatedAt: 1_800_000_000_000,
          enabled: true,
        },
      },
    }
    const originBindings = {
      storageSchemaVersion: 1,
      bindings: {
        "https://selfhost.example.com": {
          mode: "explicit",
          packId: "example-chat",
        },
      },
    }
    const settings = { language: "en", theme: "dark" }
    const source = new MemoryPlatformStorage({
      settings: JSON.stringify({ state: { settings }, version: 0 }),
      [INSTALLED_SITE_PACKS_STORAGE_KEY]: installedPacks,
      [SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY]: originBindings,
      [REMOTE_CONFIG_STORAGE_KEY]: { registryRevision: 9 },
      [SITE_PACK_REGISTRATION_STATE_STORAGE_KEY]: {
        storageSchemaVersion: 1,
        managedOrigins: ["https://selfhost.example.com/*"],
      },
    })

    const document = await createBackupDocument(source, "full", "2026-07-30T12:00:00.000Z")

    expect(document).toMatchObject({
      version: BACKUP_SCHEMA_VERSION,
      timestamp: "2026-07-30T12:00:00.000Z",
      type: "full",
      data: {
        settings,
        [INSTALLED_SITE_PACKS_STORAGE_KEY]: installedPacks,
        [SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY]: originBindings,
      },
    })
    expect(document.data).not.toHaveProperty(REMOTE_CONFIG_STORAGE_KEY)
    expect(document.data).not.toHaveProperty(SITE_PACK_REGISTRATION_STATE_STORAGE_KEY)

    const target = new MemoryPlatformStorage()
    const result = await restoreBackupDocument(target, document)

    expect(result.ignoredKeys).toEqual([])
    expect(result.restoredKeys).toEqual(
      expect.arrayContaining([
        "settings",
        INSTALLED_SITE_PACKS_STORAGE_KEY,
        SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY,
      ]),
    )
    expect(target.read("settings")).toBe(JSON.stringify({ state: { settings }, version: 0 }))
    expect(target.read(INSTALLED_SITE_PACKS_STORAGE_KEY)).toEqual(installedPacks)
    expect(target.read(SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY)).toEqual(originBindings)
  })

  it("normalizes legacy full backups and ignores cache or future keys", async () => {
    const legacyDocument = {
      version: 3,
      timestamp: "2025-01-01T00:00:00.000Z",
      data: {
        prompts: JSON.stringify({
          state: { prompts: [{ id: "legacy", title: "Legacy", content: "Prompt" }] },
          version: 0,
        }),
        conversations: {
          legacy: { id: "legacy", title: "Legacy conversation" },
        },
        readingHistory: {
          legacy: { conversationId: "legacy", lastReadAt: 1_700_000_000_000 },
        },
        [REMOTE_CONFIG_STORAGE_KEY]: { registryRevision: 7 },
        "future/user-data": { value: true },
      },
    }

    const plan = createBackupRestorePlan(legacyDocument)

    expect(plan.document.type).toBe("full")
    expect(plan.ignoredKeys).toEqual([REMOTE_CONFIG_STORAGE_KEY, "future/user-data"])
    expect(plan.restoredKeys).toEqual(["prompts", "conversations", "readingHistory"])

    const target = new MemoryPlatformStorage()
    await restoreBackupDocument(target, legacyDocument)

    expect(JSON.parse(target.read<string>("prompts")!)).toEqual({
      state: { prompts: [{ id: "legacy", title: "Legacy", content: "Prompt" }] },
      version: 0,
    })
    expect(JSON.parse(target.read<string>("conversations")!)).toEqual({
      state: {
        conversations: {
          legacy: { id: "legacy", title: "Legacy conversation" },
        },
      },
      version: 0,
    })
    expect(JSON.parse(target.read<string>("readingHistory")!)).toEqual({
      state: {
        history: {
          legacy: { conversationId: "legacy", lastReadAt: 1_700_000_000_000 },
        },
      },
      version: 0,
    })
    expect(target.read(REMOTE_CONFIG_STORAGE_KEY)).toBeUndefined()
    expect(target.read("future/user-data")).toBeUndefined()
  })

  it("does not restore SitePack data from a settings-only backup", () => {
    const plan = createBackupRestorePlan({
      version: BACKUP_SCHEMA_VERSION,
      timestamp: "2026-07-30T12:00:00.000Z",
      type: "settings",
      data: {
        settings: { language: "zh-CN" },
        [INSTALLED_SITE_PACKS_STORAGE_KEY]: {
          storageSchemaVersion: 1,
          packs: { injected: {} },
        },
      },
    })

    expect(plan.restoredKeys).toEqual(["settings"])
    expect(plan.ignoredKeys).toEqual([INSTALLED_SITE_PACKS_STORAGE_KEY])
    expect(plan.updates).not.toHaveProperty(INSTALLED_SITE_PACKS_STORAGE_KEY)
  })
})
