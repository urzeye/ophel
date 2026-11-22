import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ next: vi.fn(), run: vi.fn() }))
vi.mock("~core/webdav-backup", () => ({
  WebDAVBackupService: class {
    getNextBackupAt = mocks.next
    runScheduled = mocks.run
  },
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  mocks.next.mockReset()
  mocks.run.mockReset()
})

async function setup() {
  const alarms = new Map<string, { scheduledTime: number }>()
  const create = vi.fn(async (name: string, alarm: { when: number }) => {
    alarms.set(name, { scheduledTime: alarm.when })
  })
  const clear = vi.fn(async (name: string) => alarms.delete(name))
  vi.stubGlobal("chrome", {
    alarms: { create, clear, get: async (name: string) => alarms.get(name) },
    permissions: { contains: async () => true },
  })
  vi.resetModules()
  const runtime = await import("~platform/extension/webdav-backup")
  return { ...runtime, alarms, create, clear }
}

describe("extension backup alarms", () => {
  it("keeps an existing deadline instead of restarting the period on settings/status changes", async () => {
    const f = await setup()
    const deadline = Date.now() + 3_600_000
    mocks.next.mockResolvedValue(deadline)
    f.scheduleWebDAVBackup()
    await vi.waitFor(() => expect(f.create).toHaveBeenCalledTimes(1))
    f.scheduleWebDAVBackup()
    f.scheduleWebDAVBackup()
    await vi.waitFor(() => expect(mocks.next).toHaveBeenCalledTimes(3))
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.alarms.get(f.WEBDAV_BACKUP_ALARM)?.scheduledTime).toBe(deadline)
  })

  it("clears the alarm when automatic backup is disabled", async () => {
    const f = await setup()
    mocks.next.mockResolvedValue(null)
    f.scheduleWebDAVBackup()
    await vi.waitFor(() => expect(f.clear).toHaveBeenCalledWith(f.WEBDAV_BACKUP_ALARM))
    expect(f.create).not.toHaveBeenCalled()
  })

  it("does not keep postponing an overdue alarm on every settings update", async () => {
    const f = await setup()
    const now = Date.now()
    mocks.next.mockResolvedValue(now - 3_600_000)
    f.scheduleWebDAVBackup()
    await vi.waitFor(() => expect(f.create).toHaveBeenCalledTimes(1))
    f.scheduleWebDAVBackup()
    await vi.waitFor(() => expect(mocks.next).toHaveBeenCalledTimes(2))
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.alarms.get(f.WEBDAV_BACKUP_ALARM)!.scheduledTime).toBeGreaterThanOrEqual(now + 60_000)
  })

  it("reconciles the next alarm after a failed attempt without immediate network retries", async () => {
    const f = await setup()
    mocks.run.mockResolvedValue({ success: false, messageKey: "webdavUploadFailed" })
    mocks.next.mockResolvedValue(Date.now() + 3_600_000)
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
    f.runScheduledWebDAVBackup()
    await vi.waitFor(() => expect(f.create).toHaveBeenCalledTimes(1))
    expect(mocks.run).toHaveBeenCalledTimes(1)
    expect(warning).toHaveBeenCalled()
  })
})
