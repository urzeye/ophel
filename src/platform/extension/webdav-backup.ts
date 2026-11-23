import { WebDAVBackupService } from "~core/webdav-backup"

import { extensionStorage } from "./storage"
import { fetchWebDAV } from "./webdav"

export const WEBDAV_BACKUP_ALARM = "ophel-webdav-backup"
export const webdavBackupService = new WebDAVBackupService({
  storage: extensionStorage,
  request: fetchWebDAV,
  canRequest: async (url) => {
    try {
      const target = new URL(url)
      if (target.protocol !== "http:" && target.protocol !== "https:") return false
      return await chrome.permissions.contains({ origins: [`${target.origin}/*`] })
    } catch {
      // 无法解析的 URL 视为不可请求，让服务层记录失败状态而不是静默抛错
      return false
    }
  },
})

let scheduling = Promise.resolve()

export function scheduleWebDAVBackup(): void {
  scheduling = scheduling
    .then(async () => {
      const nextBackupAt = await webdavBackupService.getNextBackupAt()
      if (nextBackupAt === null) {
        await chrome.alarms.clear(WEBDAV_BACKUP_ALARM)
        return
      }
      const alarm = await chrome.alarms.get(WEBDAV_BACKUP_ALARM)
      const now = Date.now()
      if (
        alarm &&
        (alarm.scheduledTime === nextBackupAt ||
          (nextBackupAt <= now && alarm.scheduledTime > now && alarm.scheduledTime <= now + 60_000))
      )
        return
      await chrome.alarms.create(WEBDAV_BACKUP_ALARM, {
        when: Math.max(now + 60_000, nextBackupAt),
      })
    })
    .catch((error) => console.error("[WebDAV] Failed to schedule backup:", error))
}

export function runScheduledWebDAVBackup(): void {
  void webdavBackupService
    .runScheduled()
    .then((result) => {
      if (result && !result.success)
        console.warn("[WebDAV] Automatic backup failed:", result.messageKey, result.messageArgs)
    })
    .catch((error) => console.error("[WebDAV] Automatic backup crashed:", error))
    .finally(scheduleWebDAVBackup)
}
