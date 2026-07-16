import { afterEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"
import type { Settings } from "~utils/storage"

const { consumeClearAllFlagMock } = vi.hoisted(() => ({
  consumeClearAllFlagMock: vi.fn(),
}))

vi.mock("~utils/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~utils/storage")>()),
  consumeClearAllFlag: consumeClearAllFlagMock,
}))

vi.mock("~platform/katex", () => ({
  getKatexStylesText: () => "",
  renderKatexToString: () => "",
}))

vi.mock("~core/reading-history", () => ({
  ReadingHistoryManager: class {
    startRecording() {}
    cleanup() {}
    destroy() {}
  },
}))

import {
  destroyCoreModules,
  getModuleInstances,
  initReadingHistoryManager,
} from "~core/modules-init"

describe("core module generations", () => {
  afterEach(() => {
    destroyCoreModules()
    consumeClearAllFlagMock.mockReset()
  })

  it("does not create a reading-history manager after its generation is destroyed", async () => {
    let resolveClearAllFlag!: (value: boolean) => void
    consumeClearAllFlagMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveClearAllFlag = resolve
      }),
    )

    const initialization = initReadingHistoryManager({
      adapter: {} as SiteAdapter,
      settings: {
        readingHistory: {
          persistence: true,
          autoRestore: false,
        },
      } as Settings,
      siteId: "test",
    })

    destroyCoreModules()
    resolveClearAllFlag(false)
    await initialization

    expect(getModuleInstances().readingHistoryManager).toBeNull()
  })
})
