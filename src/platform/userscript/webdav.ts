import { WebDAVBackupService } from "~core/webdav-backup"
import { createWebDAVInstanceId } from "~types/webdav"
import type { SyncResult, WebDAVAction, WebDAVConfig, WebDAVTransport } from "~types/webdav"

import { userscriptStorage } from "./storage"

declare function GM_xmlhttpRequest(details: {
  method: string
  url: string
  data?: string
  headers?: Record<string, string>
  timeout: number
  onload: (response: {
    status: number
    statusText: string
    responseText: string
    responseHeaders: string
  }) => void
  onerror: () => void
  ontimeout: () => void
  onabort: () => void
}): void
interface BackupTab {
  ophelBackup?: { token: string; heartbeat: number; choosing: boolean; ticket: number }
  [key: string]: unknown
}
declare function GM_getTab(callback: (tab: BackupTab) => void): void
declare function GM_saveTab(tab: BackupTab): void
declare function GM_getTabs(callback: (tabs: Record<string, BackupTab>) => void): void

export const userscriptWebDAVRequest: WebDAVTransport = (method, url, body, headers) =>
  new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method,
      url,
      data: body || undefined,
      headers,
      timeout: 25_000,
      onload: (response) => {
        try {
          const responseHeaders = new Headers()
          for (const line of response.responseHeaders.split(/\r?\n/)) {
            const colon = line.indexOf(":")
            if (colon > 0)
              responseHeaders.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim())
          }
          resolve(
            new Response(response.responseText || null, {
              status: response.status,
              statusText: response.statusText,
              headers: responseHeaders,
            }),
          )
        } catch (error) {
          reject(error)
        }
      },
      onerror: () => reject(new Error("WebDAV network request failed")),
      ontimeout: () => reject(new Error("WebDAV request timed out")),
      onabort: () => reject(new Error("WebDAV request aborted")),
    })
  })

const service = new WebDAVBackupService({
  storage: userscriptStorage,
  request: userscriptWebDAVRequest,
})
const token = createWebDAVInstanceId()
let busy = false
let started = false
const getTabs = () => new Promise<Record<string, BackupTab>>((resolve) => GM_getTabs(resolve))
const getTab = () => new Promise<BackupTab>((resolve) => GM_getTab(resolve))
async function saveTab(tab: BackupTab): Promise<void> {
  // Violentmonkey does not expose GM_saveTab's optional Tampermonkey callback.
  GM_saveTab(tab)
  const saved = await getTab()
  if (JSON.stringify(saved.ophelBackup) !== JSON.stringify(tab.ophelBackup)) {
    throw new Error("GM_saveTab did not persist the backup lock")
  }
}
const isLive = (tab: BackupTab) =>
  tab.ophelBackup && Date.now() - tab.ophelBackup.heartbeat < 180_000

async function withBackupLock<T>(task: () => Promise<T>): Promise<T | null> {
  if (busy) return null
  busy = true
  let tab: BackupTab | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  try {
    tab = await getTab()
    tab.ophelBackup = { token, heartbeat: Date.now(), choosing: true, ticket: 0 }
    // Per-tab tickets avoid a non-atomic get/set lock in shared GM storage, across all origins.
    await saveTab(tab)
    const tabs = await getTabs()
    tab.ophelBackup.ticket =
      Math.max(
        0,
        ...Object.values(tabs)
          .filter(isLive)
          .map((other) => other.ophelBackup!.ticket),
      ) + 1
    tab.ophelBackup.choosing = false
    await saveTab(tab)
    const contenders = await getTabs()
    const blocked = Object.values(contenders).some((other) => {
      const candidate = other.ophelBackup
      if (!isLive(other) || !candidate || candidate.token === token) return false
      return (
        candidate.choosing ||
        (candidate.ticket > 0 &&
          (candidate.ticket < tab!.ophelBackup!.ticket ||
            (candidate.ticket === tab!.ophelBackup!.ticket && candidate.token < token)))
      )
    })
    if (blocked) return null
    heartbeat = setInterval(() => {
      if (tab?.ophelBackup) {
        tab.ophelBackup.heartbeat = Date.now()
        GM_saveTab(tab)
      }
    }, 30_000)
    return await task()
  } finally {
    clearInterval(heartbeat)
    try {
      if (tab && (await getTab()).ophelBackup?.token === token) {
        tab.ophelBackup = { token, heartbeat: Date.now(), choosing: false, ticket: 0 }
        await saveTab(tab)
      }
    } finally {
      busy = false
    }
  }
}

export const userscriptWebDAV = {
  request: userscriptWebDAVRequest,
  async runAction(
    action: WebDAVAction,
    config: WebDAVConfig,
    fileName?: string,
  ): Promise<SyncResult> {
    return (
      (await withBackupLock(() => service.runManual(action, config, fileName))) ?? {
        success: false,
        messageKey: "webdavBusy",
      }
    )
  },
}

let lifecycleBound = false
let timer: number | undefined

export function startUserscriptWebDAVBackup(): void {
  if (started) return
  started = true
  const tick = () => {
    void withBackupLock(async () => {
      await service.getNextBackupAt()
      return service.runScheduled()
    })
      .then((result) => {
        if (result && !result.success)
          console.warn("[WebDAV] Automatic backup failed:", result.messageKey, result.messageArgs)
      })
      .catch((error) => console.error("[WebDAV] Automatic backup crashed:", error))
  }
  tick()
  timer = window.setInterval(tick, 60_000)
  if (lifecycleBound) return
  lifecycleBound = true
  window.addEventListener("pagehide", () => {
    started = false
    window.clearInterval(timer)
    void getTab()
      .then((tab) => {
        if (tab.ophelBackup?.token === token) {
          delete tab.ophelBackup
          return saveTab(tab)
        }
      })
      .catch((error) => console.warn("[WebDAV] Failed to release backup tab:", error))
  })
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) startUserscriptWebDAVBackup()
  })
}
