import { describe, expect, it, vi } from "vitest"

import type { PlatformStorage } from "~platform/types"
import type { WebDAVConfig } from "~types/webdav"
import { createWebDAVInstanceId } from "~types/webdav"

vi.mock("~utils/config", () => ({
  APP_NAME: "ophel",
  APP_VERSION: "test",
  APP_DISPLAY_NAME: "Ophel",
}))

vi.mock("~platform", () => ({ platform: { type: "extension", storage: {} } }))

import { createBackupDocument, restoreBackupDocument } from "~core/backup-codec"
import { WebDAVBackupService, WEBDAV_BACKUP_STATE_KEY } from "~core/webdav-backup"
import { DEFAULT_WEBDAV_CONFIG, WebDAVSyncManager } from "~core/webdav-sync"

function memoryStorage(seed: Record<string, unknown> = {}) {
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
  return { storage, values }
}

const config: WebDAVConfig = {
  ...DEFAULT_WEBDAV_CONFIG,
  enabled: true,
  syncMode: "auto",
  syncInterval: 60,
  url: "https://dav.example.com/",
  username: "user",
  password: "password",
}
const persisted = (webdav = config) =>
  JSON.stringify({ state: { settings: { language: "en", webdav } }, version: 0 })

function fixture(webdav = config) {
  const { storage, values } = memoryStorage({
    settings: persisted(webdav),
    readingHistory: JSON.stringify({
      state: { history: { chat: { top: 200, ts: 1 } } },
      version: 1,
    }),
    prompts: JSON.stringify({ state: { prompts: [] }, version: 0 }),
  })
  let now = 1_000_000
  const request = vi.fn(
    async (method: string) =>
      new Response(null, { status: method === "MKCOL" ? 201 : method === "PUT" ? 201 : 207 }),
  )
  const service = new WebDAVBackupService({
    storage,
    request,
    now: () => now,
    createDeviceId: () => "device-a",
  })
  return {
    storage,
    values,
    request,
    service,
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe("WebDAV snapshots", () => {
  it("excludes history only when explicitly requested and preserves it on restore", async () => {
    const f = fixture()
    const auto = await createBackupDocument(f.storage, "full", undefined, {
      excludeKeys: ["readingHistory"],
    })
    expect(auto.data).not.toHaveProperty("readingHistory")
    const manual = await createBackupDocument(f.storage, "full")
    expect(manual.data).toHaveProperty("readingHistory")
    const original = f.values.get("readingHistory")
    await restoreBackupDocument(f.storage, auto)
    expect(f.values.get("readingHistory")).toBe(original)
  })

  it("uploads compact automatic snapshots without reading history", async () => {
    const f = fixture()
    const manager = new WebDAVSyncManager({
      config,
      storage: f.storage,
      request: f.request,
      saveConfig: async () => {},
    })
    await manager.upload({ automaticDeviceId: "device-a" })
    const put = f.request.mock.calls.find(([method]) => method === "PUT") as unknown as [
      string,
      string,
      string,
    ]
    expect(put[1]).toContain("ophel_backup_auto_device-a_")
    expect(JSON.parse(put[2]).data).not.toHaveProperty("readingHistory")
    expect(put[2]).not.toContain("\n  ")
  })
})

describe("WebDAV automatic scheduling", () => {
  it("defaults to off without making network requests", async () => {
    const f = fixture({ ...config, enabled: false })
    expect(await f.service.getNextBackupAt()).toBeNull()
    expect(await f.service.runScheduled()).toBeNull()
    expect(f.request).not.toHaveBeenCalled()
  })

  it("persists the deadline across service restarts and ignores reading updates", async () => {
    const f = fixture()
    const deadline = await f.service.getNextBackupAt()
    const restarted = new WebDAVBackupService({ storage: f.storage, request: f.request })
    expect(await restarted.getNextBackupAt()).toBe(deadline)
    await f.storage.set("readingHistory", "changed")
    expect(await f.service.getNextBackupAt()).toBe(deadline)
    expect(f.request).not.toHaveBeenCalled()
  })

  it("reserves the next attempt before a failed upload, preventing startup retries", async () => {
    const f = fixture()
    await f.service.getNextBackupAt()
    f.advance(60 * 60 * 1000)
    f.request.mockRejectedValue(new Error("offline"))
    expect((await f.service.runScheduled())?.success).toBe(false)
    const requests = f.request.mock.calls.length
    expect(await f.service.runScheduled()).toBeNull()
    expect(f.request).toHaveBeenCalledTimes(requests)
    const restarted = new WebDAVBackupService({
      storage: f.storage,
      request: f.request,
      now: () => 4_600_000,
    })
    expect(await restarted.runScheduled()).toBeNull()
    expect(f.request).toHaveBeenCalledTimes(requests)
    expect(f.values.get(WEBDAV_BACKUP_STATE_KEY)).toMatchObject({ deviceId: "device-a" })
  })

  it("normalizes unsupported legacy intervals to one day", async () => {
    const f = fixture({ ...config, syncInterval: 30 })
    expect(await f.service.getNextBackupAt()).toBe(1_000_000 + 24 * 60 * 60 * 1000)
  })
})

function listing(names: string[]) {
  return `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${names.map((name, index) => `<d:response><d:href>/ophel/${name}</d:href><d:propstat><d:prop><d:getcontentlength>10</d:getcontentlength><d:getlastmodified>${new Date(100_000 - index * 1000).toUTCString()}</d:getlastmodified></d:prop></d:propstat></d:response>`).join("")}</d:multistatus>`
}

describe("WebDAV retention and operation safety", () => {
  it("retains seven own automatic files, without deleting manual or other devices' backups", async () => {
    const f = fixture()
    const names = Array.from({ length: 10 }, (_, i) => `ophel_backup_auto_device-a_${10 - i}.json`)
    names.splice(1, 0, "ophel_backup_manual.json", "ophel_backup_auto_device-b_1.json")
    const request = vi.fn(
      async (method: string) =>
        new Response(method === "PROPFIND" ? listing(names) : null, {
          status: method === "PROPFIND" ? 207 : 201,
        }),
    )
    const manager = new WebDAVSyncManager({
      config,
      storage: f.storage,
      request,
      saveConfig: async () => {},
    })
    expect((await manager.upload({ automaticDeviceId: "device-a" })).success).toBe(true)
    const deleted = request.mock.calls.filter(([method]) => method === "DELETE") as unknown as [
      string,
      string,
    ][]
    expect(deleted.map(([, url]) => url.split("/").pop())).toEqual(
      names.filter((name) => name.startsWith("ophel_backup_auto_device-a_")).slice(6),
    )
    expect(deleted).toHaveLength(4)
  })

  it("does not list or delete old backups if the upload fails", async () => {
    const f = fixture()
    const request = vi.fn(
      async (method: string) => new Response(null, { status: method === "PUT" ? 507 : 201 }),
    )
    const manager = new WebDAVSyncManager({
      config,
      storage: f.storage,
      request,
      saveConfig: async () => {},
    })
    expect((await manager.upload({ automaticDeviceId: "device-a" })).success).toBe(false)
    expect(request.mock.calls.map(([method]) => method)).toEqual(["MKCOL", "PUT"])
  })

  it("reports a cleanup failure instead of hiding it after a successful upload", async () => {
    const f = fixture()
    const request = vi.fn(
      async (method: string) => new Response(null, { status: method === "PROPFIND" ? 503 : 201 }),
    )
    const manager = new WebDAVSyncManager({
      config,
      storage: f.storage,
      request,
      saveConfig: async () => {},
    })
    const result = await manager.upload({ automaticDeviceId: "device-a" })
    expect(result).toMatchObject({ success: false, messageKey: "webdavCleanupFailed" })
    expect(request.mock.calls.some(([method]) => method === "DELETE")).toBe(false)
  })

  it("uploads manual full backups without retention cleanup or persisting unsaved credentials", async () => {
    const f = fixture()
    const request = vi.fn(
      async (_method: string, _url: string, _body?: string | null) =>
        new Response(null, { status: 201 }),
    )
    const service = new WebDAVBackupService({ storage: f.storage, request })
    expect(
      (await service.runManual("upload", { ...config, password: "unsaved-password" })).success,
    ).toBe(true)
    const put = request.mock.calls.find(([method]) => method === "PUT")!
    expect(JSON.parse(put[2]!).data.readingHistory.history.chat.top).toBe(200)
    expect(request.mock.calls.some(([method]) => method === "PROPFIND")).toBe(false)
    const saved = JSON.parse(f.values.get("settings") as string).state.settings
    expect(saved.webdav.password).toBe(config.password)
    expect(saved.webdav.lastSyncStatus).toBe("success")
  })

  it("rejects a second operation while an upload is pending and preserves unrelated settings edits", async () => {
    const f = fixture()
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const request = vi.fn(async (method: string) => {
      if (method === "PUT") await pending
      return new Response(null, { status: 201 })
    })
    const service = new WebDAVBackupService({ storage: f.storage, request })
    const first = service.runManual("upload", config)
    await vi.waitFor(() =>
      expect(request.mock.calls.some(([method]) => method === "PUT")).toBe(true),
    )
    expect(await service.runManual("download", config)).toMatchObject({
      success: false,
      messageKey: "webdavBusy",
    })
    const settings = JSON.parse(f.values.get("settings") as string)
    settings.state.settings.language = "ja"
    f.values.set("settings", JSON.stringify(settings))
    finish()
    expect((await first).success).toBe(true)
    expect(JSON.parse(f.values.get("settings") as string).state.settings.language).toBe("ja")
  })

  it("does not send requests without optional server permission", async () => {
    const f = fixture()
    const service = new WebDAVBackupService({
      storage: f.storage,
      request: f.request,
      canRequest: async () => false,
    })
    expect(await service.runManual("upload", config)).toMatchObject({
      success: false,
      messageKey: "webdavPermissionDenied",
    })
    expect(f.request).not.toHaveBeenCalled()
  })

  it("starts a fresh period after disabling, re-enabling or changing the target", async () => {
    const f = fixture()
    await f.service.getNextBackupAt()
    f.advance(300_000)
    f.values.set("settings", persisted({ ...config, enabled: false }))
    expect(await f.service.getNextBackupAt()).toBeNull()
    f.values.set("settings", persisted(config))
    expect(await f.service.getNextBackupAt()).toBe(1_300_000 + 60 * 60_000)
    f.advance(300_000)
    f.values.set("settings", persisted({ ...config, remoteDir: "other" }))
    expect(await f.service.getNextBackupAt()).toBe(1_600_000 + 60 * 60_000)
  })
})

it("creates device identities without secure-context-only randomUUID", () => {
  const cryptoStub = { getRandomValues: (array: Uint8Array) => array.fill(42) }
  vi.stubGlobal("crypto", cryptoStub)
  try {
    expect(createWebDAVInstanceId()).toBe("2a".repeat(16))
  } finally {
    vi.unstubAllGlobals()
  }
})

it("always retains the just-uploaded file when the server timestamps tie", async () => {
  const f = fixture()
  let currentName = ""
  const old = Array.from(
    { length: 7 },
    (_, index) => `ophel_backup_auto_device-a_${100 - index}.json`,
  )
  const request = vi.fn(async (method: string, url: string) => {
    if (method === "PUT") currentName = url.split("/").pop()!
    const xml = listing([...old, currentName]).replace(
      /<d:getlastmodified>[^<]+/g,
      "<d:getlastmodified>Sun, 22 Nov 2026 00:00:00 GMT",
    )
    return new Response(method === "PROPFIND" ? xml : null, {
      status: method === "PROPFIND" ? 207 : 201,
    })
  })
  const manager = new WebDAVSyncManager({
    config,
    storage: f.storage,
    request,
    saveConfig: async () => {},
  })
  expect((await manager.upload({ automaticDeviceId: "device-a" })).success).toBe(true)
  const deleted = request.mock.calls.filter(([method]) => method === "DELETE")
  expect(deleted).toHaveLength(1)
  expect(deleted[0][1]).not.toContain(currentName)
})
