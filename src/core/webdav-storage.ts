import { WEBDAV_BACKUP_STATUS_STORAGE_KEY } from "~constants/storage-keys"
import type { PlatformStorage } from "~platform/types"
import type { WebDAVConfig, WebDAVStatus } from "~types/webdav"
import { parsePersistedSettings } from "~utils/persisted-settings"

type LegacyWebDAVConfig = WebDAVConfig & WebDAVStatus

export async function readSavedWebDAVConfig(
  storage: PlatformStorage,
): Promise<Partial<WebDAVConfig> | undefined> {
  const settings = parsePersistedSettings(await storage.get("settings"))
  if (!settings?.webdav) return undefined
  const {
    lastSyncTime: _legacyTime,
    lastSyncStatus: _legacyStatus,
    ...config
  } = settings.webdav as LegacyWebDAVConfig
  return config
}

export async function readWebDAVStatus(storage: PlatformStorage): Promise<WebDAVStatus> {
  const status = await storage.get<WebDAVStatus>(WEBDAV_BACKUP_STATUS_STORAGE_KEY)
  if (status !== undefined && status !== null) return status

  // Old backups stored metadata inside settings; only read it until local status is first written.
  const settings = parsePersistedSettings(await storage.get("settings"))
  const legacy = settings?.webdav as LegacyWebDAVConfig | undefined
  return {
    lastSyncTime: legacy?.lastSyncTime,
    lastSyncStatus: legacy?.lastSyncStatus,
  }
}

export function subscribeWebDAVStatus(
  storage: PlatformStorage,
  onChange: (status: WebDAVStatus) => void,
  onError: (error: unknown) => void,
): () => void {
  let active = true
  let revision = 0
  const refresh = () => {
    const current = ++revision
    void readWebDAVStatus(storage)
      .then((status) => {
        if (active && current === revision) onChange(status)
      })
      .catch((error) => {
        if (active && current === revision) onError(error)
      })
  }
  const unsubscribe = storage.watch(WEBDAV_BACKUP_STATUS_STORAGE_KEY, refresh)
  refresh()
  return () => {
    active = false
    unsubscribe()
  }
}
