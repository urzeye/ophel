import { expect, it, vi } from "vitest"
import type { PlatformStorage } from "~platform/types"

vi.mock("~utils/config", () => ({
  APP_NAME: "ophel",
  APP_VERSION: "test",
  APP_DISPLAY_NAME: "Ophel",
}))
vi.mock("~platform", () => ({ platform: { type: "extension", storage: {} } }))

import { WEBDAV_BACKUP_STATE_KEY, WEBDAV_BACKUP_STATUS_STORAGE_KEY } from "~constants/storage-keys"
import {
  createBackupDocument,
  createBackupRestorePlan,
  BACKUP_EXCLUDED_STORAGE_KEYS,
} from "~core/backup-codec"
import {
  readWebDAVStatus,
  readSavedWebDAVConfig,
  subscribeWebDAVStatus,
} from "~core/webdav-storage"
import type { WebDAVStatus } from "~types/webdav"

import { WebDAVBackupService } from "~core/webdav-backup"
import { DEFAULT_WEBDAV_CONFIG } from "~core/webdav-sync"

const config = {
  ...DEFAULT_WEBDAV_CONFIG,
  url: "https://dav.example.com/",
  username: "user",
  password: "pass",
}
const stored = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ state: { settings: { language: "en", webdav: config, ...extra } }, version: 1 })
function memory(seed: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(seed))
  const storage: PlatformStorage = {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    set: async (key, value) => {
      values.set(key, value)
    },
    remove: async (key) => {
      values.delete(key)
    },
    watch: () => () => {},
  }
  return { values, storage }
}

it("backs up manually before settings have ever been persisted", async () => {
  const { storage, values } = memory()
  const request = vi.fn(async () => new Response(null, { status: 201 }))
  const service = new WebDAVBackupService({ storage, request })
  await expect(service.runManual("upload", config)).resolves.toMatchObject({ success: true })
  expect(request).toHaveBeenCalled()
  expect(values.has("settings")).toBe(false)
})

it("does not overwrite a settings edit committed after a status read", async () => {
  const { storage, values } = memory({ settings: stored() })
  let interleave = true
  storage.get = async <T>(key: string) => {
    const snapshot = values.get(key)
    if (key === "settings" && interleave) {
      interleave = false
      values.set("settings", stored({ language: "ja" }))
    }
    return snapshot as T | undefined
  }
  const service = new WebDAVBackupService({
    storage,
    request: async () => new Response(null, { status: 201 }),
  })
  await service.runManual("upload", config)
  expect(JSON.parse(values.get("settings") as string).state.settings.language).toBe("ja")
})

it("restores without persisting temporary connection or scheduling fields", async () => {
  const { storage, values } = memory({ settings: stored() })
  const remote = {
    version: 4,
    timestamp: new Date().toISOString(),
    type: "full",
    data: { settings: { language: "ja" }, prompts: [] },
  }
  const service = new WebDAVBackupService({
    storage,
    request: async () => new Response(JSON.stringify(remote), { status: 200 }),
  })
  const result = await service.runManual(
    "download",
    { ...config, password: "unsaved-password", enabled: true, syncMode: "auto", syncInterval: 60 },
    "snapshot.json",
  )
  expect(result.success).toBe(true)
  const saved = JSON.parse(values.get("settings") as string).state.settings
  expect(saved.webdav).toEqual(config)
  expect(saved.language).toBe("ja")
})

it("restores first-time settings without importing remote or temporary WebDAV configuration", async () => {
  const { storage, values } = memory()
  const remote = {
    version: 4,
    timestamp: new Date().toISOString(),
    type: "full",
    data: { settings: { language: "ja", webdav: { ...config, enabled: true, syncMode: "auto" } } },
  }
  const service = new WebDAVBackupService({
    storage,
    request: async () => new Response(JSON.stringify(remote), { status: 200 }),
  })
  expect(
    (
      await service.runManual(
        "download",
        { ...config, enabled: true, syncMode: "auto" },
        "snapshot.json",
      )
    ).success,
  ).toBe(true)
  expect(JSON.parse(values.get("settings") as string).state.settings.webdav).toEqual(
    DEFAULT_WEBDAV_CONFIG,
  )
})

it("preserves the latest saved WebDAV settings if they change while downloading", async () => {
  const { storage, values } = memory({ settings: stored() })
  let finish!: () => void
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  const remote = {
    version: 4,
    timestamp: new Date().toISOString(),
    type: "full",
    data: { settings: { language: "ja" } },
  }
  const request = vi.fn(async () => {
    await pending
    return new Response(JSON.stringify(remote), { status: 200 })
  })
  const service = new WebDAVBackupService({ storage, request })
  const restore = service.runManual("download", config, "snapshot.json")
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  const latest = {
    ...config,
    url: "https://new.example.com/",
    password: "new-saved-password",
    enabled: true,
    syncMode: "auto" as const,
    syncInterval: 360,
  }
  values.set("settings", stored({ webdav: latest }))
  finish()
  expect((await restore).success).toBe(true)
  expect(JSON.parse(values.get("settings") as string).state.settings.webdav).toEqual(latest)
})

it("records partial restore failure without leaving status stuck at syncing", async () => {
  const { storage, values } = memory({ settings: stored() })
  const set = storage.set.bind(storage)
  storage.set = async (key, value) => {
    if (key === "prompts") throw new Error("write denied")
    return set(key, value)
  }
  const remote = {
    version: 4,
    timestamp: new Date().toISOString(),
    type: "full",
    data: { settings: { language: "ja" }, prompts: [] },
  }
  const service = new WebDAVBackupService({
    storage,
    request: async () => new Response(JSON.stringify(remote), { status: 200 }),
  })
  const error = vi.spyOn(console, "error").mockImplementation(() => {})
  try {
    expect(await service.runManual("download", config, "snapshot.json")).toMatchObject({
      success: false,
      messageKey: "webdavDownloadFailed",
    })
    expect(await readWebDAVStatus(storage)).toMatchObject({ lastSyncStatus: "failed" })
    expect(JSON.parse(values.get("settings") as string).state.settings.webdav).toEqual(config)
  } finally {
    error.mockRestore()
  }
})

it("reads legacy status without rewriting settings, then prefers independent local status", async () => {
  const legacy = stored({ webdav: { ...config, lastSyncTime: 123, lastSyncStatus: "failed" } })
  const { storage, values } = memory({ settings: legacy })
  expect(await readWebDAVStatus(storage)).toEqual({ lastSyncTime: 123, lastSyncStatus: "failed" })
  expect(await readSavedWebDAVConfig(storage)).toEqual(config)
  const service = new WebDAVBackupService({
    storage,
    request: async () => new Response(null, { status: 201 }),
  })
  expect((await service.runManual("upload", config)).success).toBe(true)
  expect(values.get("settings")).toBe(legacy)
  expect(await readWebDAVStatus(storage)).toMatchObject({ lastSyncStatus: "success" })
  expect((await readWebDAVStatus(storage)).lastSyncTime).toBeGreaterThan(123)
})

it("keeps runtime status out of backups and ignores attempts to restore that key", async () => {
  const status = { lastSyncTime: 123, lastSyncStatus: "success" as const }
  const { storage, values } = memory({
    settings: stored(),
    [WEBDAV_BACKUP_STATUS_STORAGE_KEY]: status,
  })
  const backup = await createBackupDocument(storage, "full")
  expect(backup.data).not.toHaveProperty(WEBDAV_BACKUP_STATUS_STORAGE_KEY)
  const plan = createBackupRestorePlan({
    ...backup,
    data: { ...backup.data, [WEBDAV_BACKUP_STATUS_STORAGE_KEY]: { lastSyncStatus: "failed" } },
  })
  expect(plan.ignoredKeys).toContain(WEBDAV_BACKUP_STATUS_STORAGE_KEY)
  expect(plan.updates).not.toHaveProperty(WEBDAV_BACKUP_STATUS_STORAGE_KEY)
  expect(values.get(WEBDAV_BACKUP_STATUS_STORAGE_KEY)).toBe(status)
  expect(BACKUP_EXCLUDED_STORAGE_KEYS).toContain(WEBDAV_BACKUP_STATUS_STORAGE_KEY)
})

it("keeps the automatic backup schedule clearable on the userscript clear-all path", async () => {
  // 油猴端 clear() 只删除 BACKUP_EXCLUDED_STORAGE_KEYS 里的运行时键；调度键必须注册在内。
  expect(BACKUP_EXCLUDED_STORAGE_KEYS).toContain(WEBDAV_BACKUP_STATE_KEY)
})

it("recovers interrupted local status without modifying saved configuration", async () => {
  const raw = stored()
  const { storage, values } = memory({
    settings: raw,
    [WEBDAV_BACKUP_STATUS_STORAGE_KEY]: { lastSyncStatus: "syncing", lastSyncTime: 123 },
  })
  const service = new WebDAVBackupService({ storage, request: vi.fn() })
  expect(await service.getNextBackupAt()).toBeNull()
  expect(await readWebDAVStatus(storage)).toEqual({ lastSyncStatus: "failed", lastSyncTime: 123 })
  expect(values.get("settings")).toBe(raw)
})

it("does not let a stale initial status read overwrite a newer storage event", async () => {
  const { storage, values } = memory()
  let finish!: (status: WebDAVStatus) => void
  const initial = new Promise<WebDAVStatus>((resolve) => {
    finish = resolve
  })
  const get = storage.get.bind(storage)
  let firstRead = true
  storage.get = async <T>(key: string) => {
    if (key === WEBDAV_BACKUP_STATUS_STORAGE_KEY && firstRead) {
      firstRead = false
      return (await initial) as T
    }
    return get<T>(key)
  }
  let notify!: () => void
  const unsubscribe = vi.fn()
  storage.watch = (_key, callback) => {
    notify = () => callback(undefined, undefined)
    return unsubscribe
  }
  const changed = vi.fn()
  const failed = vi.fn()
  const stop = subscribeWebDAVStatus(storage, changed, failed)
  const latest = { lastSyncTime: 200, lastSyncStatus: "success" }
  values.set(WEBDAV_BACKUP_STATUS_STORAGE_KEY, latest)
  notify()
  await vi.waitFor(() => expect(changed).toHaveBeenCalledWith(latest))
  finish({ lastSyncTime: 1, lastSyncStatus: "failed" })
  await new Promise((resolve) => setImmediate(resolve))
  expect(changed).toHaveBeenCalledTimes(1)
  stop()
  expect(unsubscribe).toHaveBeenCalledTimes(1)
  expect(failed).not.toHaveBeenCalled()
})

it("does not publish a pending status read after unsubscribing", async () => {
  const { storage } = memory()
  let finish!: (status: WebDAVStatus) => void
  storage.get = () =>
    new Promise((resolve) => {
      finish = resolve
    }) as ReturnType<PlatformStorage["get"]>
  const changed = vi.fn()
  const failed = vi.fn()
  const stop = subscribeWebDAVStatus(storage, changed, failed)
  stop()
  finish({ lastSyncTime: 1, lastSyncStatus: "success" })
  await new Promise((resolve) => setImmediate(resolve))
  expect(changed).not.toHaveBeenCalled()
  expect(failed).not.toHaveBeenCalled()
})

it("exposes status read failures to the UI instead of reporting an empty success", async () => {
  const { storage } = memory()
  const error = new Error("storage unavailable")
  storage.get = async () => {
    throw error
  }
  const changed = vi.fn()
  const failed = vi.fn()
  const stop = subscribeWebDAVStatus(storage, changed, failed)
  await vi.waitFor(() => expect(failed).toHaveBeenCalledWith(error))
  expect(changed).not.toHaveBeenCalled()
  stop()
})
