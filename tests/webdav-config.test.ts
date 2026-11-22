import { expect, it, vi } from "vitest"

vi.mock("~utils/config", () => ({ APP_NAME: "ophel" }))
vi.mock("~platform", () => ({ platform: { storage: {}, webdav: { runAction: vi.fn() } } }))
vi.mock("~stores/settings-store", () => ({ getSettingsState: () => ({}) }))

import { platform } from "~platform"
import { WebDAVSyncManager } from "~core/webdav-sync"

it.each(["upload", "download"] as const)(
  "keeps the existing incomplete-config result for %s",
  async (action) => {
    const manager = new WebDAVSyncManager()
    expect(await manager[action]()).toEqual({
      success: false,
      messageKey: "webdavConfigIncomplete",
    })
    expect(platform.webdav.runAction).not.toHaveBeenCalled()
  },
)
