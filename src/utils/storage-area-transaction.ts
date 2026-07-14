export interface StorageAreaSnapshots {
  local: Record<string, unknown>
  sync: Record<string, unknown>
}

type LastErrorProvider = () => { message?: string } | undefined

const getChromeLastError: LastErrorProvider = () => chrome.runtime.lastError

const toStorageError = (error: { message?: string } | undefined): Error | null =>
  error ? new Error(error.message || "Unknown storage error") : null

function readStorageArea(
  area: chrome.storage.StorageArea,
  getLastError: LastErrorProvider,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    area.get(null, (items) => {
      const error = toStorageError(getLastError())
      if (error) {
        reject(error)
        return
      }
      resolve(items)
    })
  })
}

function clearStorageArea(
  area: chrome.storage.StorageArea,
  getLastError: LastErrorProvider,
): Promise<void> {
  return new Promise((resolve, reject) => {
    area.clear(() => {
      const error = toStorageError(getLastError())
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

function writeStorageArea(
  area: chrome.storage.StorageArea,
  values: Record<string, unknown>,
  getLastError: LastErrorProvider,
): Promise<void> {
  return new Promise((resolve, reject) => {
    area.set(values, () => {
      const error = toStorageError(getLastError())
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

function throwStorageFailures(operation: string, results: PromiseSettledResult<unknown>[]): void {
  const failures = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [`${index === 0 ? "local" : "sync"}: ${String(result.reason)}`]
      : [],
  )
  if (failures.length > 0) {
    throw new Error(`${operation} failed (${failures.join("; ")})`)
  }
}

export async function snapshotStorageAreas(
  local: chrome.storage.StorageArea,
  sync: chrome.storage.StorageArea,
  getLastError: LastErrorProvider = getChromeLastError,
): Promise<StorageAreaSnapshots> {
  const results = await Promise.allSettled([
    readStorageArea(local, getLastError),
    readStorageArea(sync, getLastError),
  ])
  throwStorageFailures("Storage snapshot", results)

  return {
    local: results[0].status === "fulfilled" ? results[0].value : {},
    sync: results[1].status === "fulfilled" ? results[1].value : {},
  }
}

export async function clearStorageAreas(
  local: chrome.storage.StorageArea,
  sync: chrome.storage.StorageArea,
  getLastError: LastErrorProvider = getChromeLastError,
): Promise<void> {
  const results = await Promise.allSettled([
    clearStorageArea(local, getLastError),
    clearStorageArea(sync, getLastError),
  ])
  throwStorageFailures("Storage clear", results)
}

export async function restoreStorageAreas(
  local: chrome.storage.StorageArea,
  sync: chrome.storage.StorageArea,
  snapshots: StorageAreaSnapshots,
  getLastError: LastErrorProvider = getChromeLastError,
): Promise<void> {
  const restore = async (area: chrome.storage.StorageArea, values: Record<string, unknown>) => {
    await clearStorageArea(area, getLastError)
    await writeStorageArea(area, values, getLastError)
  }
  const results = await Promise.allSettled([
    restore(local, snapshots.local),
    restore(sync, snapshots.sync),
  ])
  throwStorageFailures("Storage rollback", results)
}
