import { describe, expect, it } from "vitest"

import {
  clearStorageAreas,
  restoreStorageAreas,
  snapshotStorageAreas,
} from "~utils/storage-area-transaction"

interface FakeStorageArea {
  area: chrome.storage.StorageArea
  values: Record<string, unknown>
  failClear: boolean
}

const createStorageArea = (initialValues: Record<string, unknown>): FakeStorageArea => {
  const state: FakeStorageArea = {
    area: null as unknown as chrome.storage.StorageArea,
    values: { ...initialValues },
    failClear: false,
  }
  state.area = {
    get: (_keys: unknown, callback: (items: Record<string, unknown>) => void) =>
      callback({ ...state.values }),
    set: (items: Record<string, unknown>, callback?: () => void) => {
      Object.assign(state.values, items)
      callback?.()
    },
    clear: (callback?: () => void) => {
      if (!state.failClear) state.values = {}
      callback?.()
    },
  } as unknown as chrome.storage.StorageArea
  return state
}

describe("storage area transaction helpers", () => {
  it("snapshots, clears, and restores local and sync storage", async () => {
    const local = createStorageArea({ settings: { language: "en" } })
    const sync = createStorageArea({ legacy: true })
    const getLastError = () => undefined

    const snapshots = await snapshotStorageAreas(local.area, sync.area, getLastError)
    await clearStorageAreas(local.area, sync.area, getLastError)
    expect(local.values).toEqual({})
    expect(sync.values).toEqual({})

    await restoreStorageAreas(local.area, sync.area, snapshots, getLastError)
    expect(local.values).toEqual({ settings: { language: "en" } })
    expect(sync.values).toEqual({ legacy: true })
  })

  it("waits for both areas and reports a partial clear failure", async () => {
    const local = createStorageArea({ settings: true })
    const sync = createStorageArea({ legacy: true })
    let lastError: { message: string } | undefined
    local.failClear = true
    local.area.clear = ((callback?: () => void) => {
      lastError = { message: "local clear failed" }
      callback?.()
      lastError = undefined
    }) as chrome.storage.StorageArea["clear"]

    await expect(clearStorageAreas(local.area, sync.area, () => lastError)).rejects.toThrow(
      "local clear failed",
    )
    expect(local.values).toEqual({ settings: true })
    expect(sync.values).toEqual({})
  })
})
