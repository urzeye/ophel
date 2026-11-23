import { WEBDAV_BACKUP_STATE_KEY, WEBDAV_BACKUP_STATUS_STORAGE_KEY } from "~constants/storage-keys"
import type { PlatformStorage } from "~platform/types"
import {
  normalizeWebDAVInterval,
  createWebDAVInstanceId,
  type SyncResult,
  type WebDAVAction,
  type WebDAVConfig,
  type WebDAVTransport,
  type WebDAVStatus,
} from "~types/webdav"
import { readSavedWebDAVConfig, readWebDAVStatus } from "./webdav-storage"

import { DEFAULT_WEBDAV_CONFIG, WebDAVSyncManager } from "./webdav-sync"

interface BackupSchedule {
  deviceId: string
  scheduleKey: string
  nextBackupAt: number
}

interface BackupServiceOptions {
  storage: PlatformStorage
  request: WebDAVTransport
  now?: () => number
  createDeviceId?: () => string
  canRequest?: (url: string) => Promise<boolean>
}

export class WebDAVBackupService {
  private running = false
  private readonly now: () => number
  private readonly createDeviceId: () => string

  constructor(private readonly options: BackupServiceOptions) {
    this.now = options.now ?? Date.now
    this.createDeviceId = options.createDeviceId ?? createWebDAVInstanceId
  }

  private async readConfig(): Promise<WebDAVConfig> {
    return { ...DEFAULT_WEBDAV_CONFIG, ...(await readSavedWebDAVConfig(this.options.storage)) }
  }

  private async saveStatus(patch: WebDAVStatus): Promise<void> {
    const current = await readWebDAVStatus(this.options.storage)
    await this.options.storage.set(WEBDAV_BACKUP_STATUS_STORAGE_KEY, { ...current, ...patch })
  }

  async getNextBackupAt(): Promise<number | null> {
    const config = await this.readConfig()
    const state = await this.options.storage.get<BackupSchedule>(WEBDAV_BACKUP_STATE_KEY)
    const status = await readWebDAVStatus(this.options.storage)
    if (!this.running && status.lastSyncStatus === "syncing") {
      await this.saveStatus({ lastSyncStatus: "failed" })
    }
    if (
      !config.enabled ||
      config.syncMode !== "auto" ||
      !config.url ||
      !config.username ||
      !config.password
    ) {
      if (state?.scheduleKey) {
        await this.options.storage.set(WEBDAV_BACKUP_STATE_KEY, {
          ...state,
          scheduleKey: "",
          nextBackupAt: 0,
        })
      }
      return null
    }
    const interval = normalizeWebDAVInterval(config.syncInterval)
    const scheduleKey = JSON.stringify([config.url, config.username, config.remoteDir, interval])
    if (
      state?.scheduleKey === scheduleKey &&
      Number.isFinite(state.nextBackupAt) &&
      state.nextBackupAt > 0
    ) {
      return state.nextBackupAt
    }
    const next: BackupSchedule = {
      deviceId: state?.deviceId ?? this.createDeviceId(),
      scheduleKey,
      nextBackupAt: this.now() + interval * 60_000,
    }
    await this.options.storage.set(WEBDAV_BACKUP_STATE_KEY, next)
    return next.nextBackupAt
  }

  async runScheduled(): Promise<SyncResult | null> {
    if (this.running) return null
    this.running = true
    try {
      const deadline = await this.getNextBackupAt()
      if (deadline === null || this.now() < deadline) return null
      const config = await this.readConfig()
      if (!config.enabled || config.syncMode !== "auto") return null
      const state = await this.options.storage.get<BackupSchedule>(WEBDAV_BACKUP_STATE_KEY)
      if (!state) throw new Error("WebDAV schedule disappeared before backup")
      if (
        state.nextBackupAt !== deadline ||
        state.scheduleKey !==
          JSON.stringify([
            config.url,
            config.username,
            config.remoteDir,
            normalizeWebDAVInterval(config.syncInterval),
          ])
      )
        return null
      // Reserve the next attempt before networking, including failures and worker shutdowns.
      await this.options.storage.set(WEBDAV_BACKUP_STATE_KEY, {
        ...state,
        nextBackupAt: this.now() + normalizeWebDAVInterval(config.syncInterval) * 60_000,
      })
      return await this.execute("upload", config, undefined, state.deviceId)
    } finally {
      this.running = false
    }
  }

  async runManual(
    action: WebDAVAction,
    config: WebDAVConfig,
    fileName?: string,
  ): Promise<SyncResult> {
    if (this.running) return { success: false, messageKey: "webdavBusy" }
    this.running = true
    try {
      return await this.execute(action, config, fileName)
    } finally {
      this.running = false
    }
  }

  private async execute(
    action: WebDAVAction,
    config: WebDAVConfig,
    fileName?: string,
    automaticDeviceId?: string,
  ): Promise<SyncResult> {
    if (this.options.canRequest && !(await this.options.canRequest(config.url))) {
      await this.saveStatus({ lastSyncStatus: "failed" })
      return { success: false, messageKey: "webdavPermissionDenied" }
    }
    const manager = new WebDAVSyncManager({
      config,
      storage: this.options.storage,
      request: this.options.request,
      saveStatus: (patch) => this.saveStatus(patch),
    })
    return action === "upload" ? manager.upload({ automaticDeviceId }) : manager.download(fileName)
  }
}
