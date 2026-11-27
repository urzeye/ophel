/**
 * WebDAV 同步管理器
 * 支持将本地数据同步到 WebDAV 服务器（如坚果云、Nextcloud 等）
 */

import {
  createBackupDocument,
  normalizeBackupDocument,
  restoreBackupDocument,
  type BackupDocument,
} from "~core/backup-codec"
import { platform } from "~platform"
import type {
  WebDAVConfig,
  WebDAVProvider,
  WebDAVTransport,
  WebDAVStatus,
  SyncResult,
} from "~types/webdav"
import type { PlatformStorage } from "~platform/types"
import { APP_NAME } from "~utils/config"
import { btoaUtf8 } from "~utils/encoding"

import { readSavedWebDAVConfig } from "./webdav-storage"

function safeDecodeURIComponent(str: string) {
  try {
    return decodeURIComponent(str)
  } catch {
    return str
  }
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

function getElementTextByLocalName(parent: Element, localName: string): string | null {
  const element = parent.getElementsByTagNameNS("*", localName)[0]
  return element?.textContent?.trim() || null
}

function hasXmlParserError(document: Document): boolean {
  return document.getElementsByTagName("parsererror").length > 0
}

function createBackupFileFromProps(
  hrefText: string | null,
  sizeText: string | null,
  lastModifiedText: string | null,
): BackupFile | null {
  if (!hrefText) return null

  const href = safeDecodeURIComponent(hrefText.trim())
  if (!href.endsWith(".json") || !href.includes(`${APP_NAME}_backup_`)) return null

  const parsedSize = sizeText ? parseInt(sizeText.trim(), 10) : 0
  const size = Number.isFinite(parsedSize) ? parsedSize : 0

  const parsedDate = lastModifiedText ? new Date(lastModifiedText.trim()) : new Date(0)
  const lastModified = Number.isNaN(parsedDate.getTime()) ? new Date(0) : parsedDate
  const name = href.split("/").pop() || href

  return {
    name,
    path: href,
    size,
    lastModified,
  }
}

function parseBackupFilesWithDomParser(xmlText: string): BackupFile[] | null {
  if (typeof DOMParser === "undefined") return null

  try {
    const document = new DOMParser().parseFromString(xmlText, "application/xml")
    if (hasXmlParserError(document)) return null

    return Array.from(document.getElementsByTagNameNS("*", "response"))
      .map((response) =>
        createBackupFileFromProps(
          getElementTextByLocalName(response, "href"),
          getElementTextByLocalName(response, "getcontentlength"),
          getElementTextByLocalName(response, "getlastmodified"),
        ),
      )
      .filter((file): file is BackupFile => Boolean(file))
  } catch {
    return null
  }
}

function parseBackupFilesWithRegex(xmlText: string): BackupFile[] {
  const namespacePrefix = `(?:[a-zA-Z0-9_-]+:)?`
  const responseRegex = new RegExp(
    `<${namespacePrefix}response[^>]*>([\\s\\S]*?)<\\/${namespacePrefix}response>`,
    "gi",
  )
  const responses = Array.from(xmlText.matchAll(responseRegex))

  return responses
    .map((match) => {
      const content = match[1]
      const hrefMatch = content.match(
        new RegExp(`<${namespacePrefix}href[^>]*>([^<]+)<\\/${namespacePrefix}href>`, "i"),
      )
      const sizeMatch = content.match(
        new RegExp(
          `<${namespacePrefix}getcontentlength[^>]*>([^<]+)<\\/${namespacePrefix}getcontentlength>`,
          "i",
        ),
      )
      const timeMatch = content.match(
        new RegExp(
          `<${namespacePrefix}getlastmodified[^>]*>([^<]+)<\\/${namespacePrefix}getlastmodified>`,
          "i",
        ),
      )

      return createBackupFileFromProps(
        hrefMatch?.[1] ?? null,
        sizeMatch?.[1] ?? null,
        timeMatch?.[1] ?? null,
      )
    })
    .filter((file): file is BackupFile => Boolean(file))
}

function parseBackupFilesFromWebDAVXml(xmlText: string): BackupFile[] {
  return parseBackupFilesWithDomParser(xmlText) ?? parseBackupFilesWithRegex(xmlText)
}

export type { WebDAVProvider } from "~types/webdav"

// 服务商预设信息
export interface WebDAVProviderPreset {
  id: WebDAVProvider
  /** i18n key for display name */
  labelKey: string
  /** 固定 URL（空字符串表示用户自填） */
  urlTemplate: string
  /** URL 输入框 placeholder */
  urlPlaceholder?: string
  /** i18n key for platform-specific hint */
  hintKey?: string
  /** 帮助文档链接 */
  helpUrl?: string
  /** 密码 placeholder i18n key */
  passwordPlaceholderKey?: string
}

export const WEBDAV_PROVIDER_PRESETS: WebDAVProviderPreset[] = [
  {
    id: "jianguoyun",
    labelKey: "providerJianguoyun",
    urlTemplate: "https://dav.jianguoyun.com/dav/",
    hintKey: "providerJianguoyunHint",
    helpUrl: "https://help.jianguoyun.com/?p=2064",
    passwordPlaceholderKey: "providerJianguoyunPasswordPlaceholder",
  },
  {
    id: "infinicloud",
    labelKey: "providerInfinicloud",
    urlTemplate: "https://connect.infini.cloud/dav",
    hintKey: "providerInfinicloudHint",
  },
  {
    id: "pcloud",
    labelKey: "providerPcloud",
    urlTemplate: "https://webdav.pcloud.com",
    hintKey: "providerPcloudHint",
    helpUrl: "https://docs.pcloud.com/protocols/webdav_protocol/",
  },
  {
    id: "nextcloud",
    labelKey: "providerNextcloud",
    urlTemplate: "",
    urlPlaceholder: "https://your-domain.com/remote.php/dav/files/username/",
    hintKey: "providerNextcloudHint",
  },
  {
    id: "synology",
    labelKey: "providerSynology",
    urlTemplate: "",
    urlPlaceholder: "https://your-nas.example.com/webdav/",
    hintKey: "providerSynologyHint",
    helpUrl: "https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/file_webdav",
  },
  {
    id: "seafile",
    labelKey: "providerSeafile",
    urlTemplate: "",
    urlPlaceholder: "https://your-seafile-domain.com/seafdav",
    hintKey: "providerSeafileHint",
  },
  {
    id: "custom",
    labelKey: "providerCustom",
    urlTemplate: "",
    urlPlaceholder: "https://dav.example.com/dav/",
  },
]

/**
 * 校验 provider 是否为已知的合法值
 */
export function isValidWebDAVProvider(value: unknown): value is WebDAVProvider {
  return WEBDAV_PROVIDER_PRESETS.some((p) => p.id === value)
}

/**
 * 根据 URL 特征推断服务商（用于老用户静默迁移）
 */
export function detectProviderFromUrl(url: string): WebDAVProvider {
  if (!url) return "custom"
  const lower = url.toLowerCase()
  if (lower.includes("jianguoyun.com") || lower.includes("nutscloud.com")) return "jianguoyun"
  if (lower.includes("infini.cloud")) return "infinicloud"
  if (lower.includes("pcloud.com")) return "pcloud"
  if (lower.includes("/remote.php/")) return "nextcloud"
  if (lower.includes("/seafdav") || lower.includes("/seafile-webdav")) return "seafile"
  // /webdav path alone is too generic; require QuickConnect-style domain or /webdav/ sub-path common to DSM
  if (
    lower.includes(".quickconnect.to") ||
    lower.includes(".synology.me") ||
    /\/webdav\//.test(lower)
  )
    return "synology"
  return "custom"
}

export type { WebDAVConfig, SyncResult } from "~types/webdav"

export const DEFAULT_WEBDAV_CONFIG: WebDAVConfig = {
  enabled: false,
  url: "",
  username: "",
  password: "",
  syncMode: "manual",
  syncInterval: 1440,
  remoteDir: APP_NAME,
}

/**
 * 生成备份文件名
 * 格式：{appName}_backup_{timestamp}.json
 */
function generateBackupFileName(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  const hour = String(now.getHours()).padStart(2, "0")
  const minute = String(now.getMinutes()).padStart(2, "0")
  const second = String(now.getSeconds()).padStart(2, "0")

  const timestamp = `${year}-${month}-${day}_${hour}-${minute}-${second}`
  return `${APP_NAME}_backup_${timestamp}.json`
}

// 失败详情，填进文案的 {detail}：HTTP 状态码或异常信息
const httpStatusDetail = (status: number): string => `HTTP ${status}`
const errorDetail = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : String(err)

/**
 * 备份文件信息
 */
export interface BackupFile {
  name: string
  size: number
  lastModified: Date
  path: string
}

/**
 * WebDAV 同步管理器
 */
export interface WebDAVRuntime {
  config: WebDAVConfig
  storage: PlatformStorage
  request: WebDAVTransport
  saveStatus: (patch: WebDAVStatus) => Promise<void>
}

export interface WebDAVConfigStore {
  getConfig: () => Partial<WebDAVConfig> | undefined
  saveConfig: (config: WebDAVConfig) => void
}

export class WebDAVSyncManager {
  private config: WebDAVConfig = DEFAULT_WEBDAV_CONFIG
  // 首次加载必须先于任何 setConfig 完成：它晚到时会把调用方刚设置的配置覆盖回已保存的值
  private readonly initialLoad: Promise<WebDAVConfig>

  constructor(
    private readonly runtime?: WebDAVRuntime,
    private configStore?: WebDAVConfigStore,
  ) {
    if (runtime) this.config = runtime.config
    this.initialLoad = runtime ? Promise.resolve(this.config) : this.loadConfig()
  }

  setConfigStore(configStore: WebDAVConfigStore): void {
    this.configStore = configStore
  }

  /**
   * 加载配置
   * 通过外部注入的 configStore 读取 settings，避免动态导入 settings-store 触发扩展端额外分块
   */
  async loadConfig(): Promise<WebDAVConfig> {
    const savedWebdav = this.configStore?.getConfig()
    if (savedWebdav) {
      const config: WebDAVConfig = {
        ...DEFAULT_WEBDAV_CONFIG,
        ...savedWebdav,
        provider: isValidWebDAVProvider(savedWebdav.provider) ? savedWebdav.provider : undefined,
      }
      // 静默迁移：老用户没有 provider 字段时，根据 URL 自动识别
      if (!config.provider && config.url) {
        config.provider = detectProviderFromUrl(config.url)
      }
      this.config = config
    }
    return this.config
  }

  /**
   * 设置配置
   * @param config 配置对象
   * @param persist 是否持久化到 storage (默认 true)
   */
  async setConfig(config: Partial<WebDAVConfig>, persist: boolean = true): Promise<void> {
    await this.initialLoad
    this.config = { ...this.config, ...config }
    if (persist) {
      if (!this.configStore) {
        throw new Error("Persisting WebDAV config requires a config store")
      }
      this.configStore.saveConfig(this.config)
    }
  }

  private async saveStatus(status: WebDAVStatus): Promise<void> {
    if (!this.runtime) throw new Error("Backup status requires an execution runtime")
    await this.runtime.saveStatus(status)
  }

  /**
   * 获取当前配置
   */
  getConfig(): WebDAVConfig {
    return { ...this.config }
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<SyncResult> {
    if (!this.config.url || !this.config.username || !this.config.password) {
      return { success: false, messageKey: "webdavConfigIncomplete" }
    }

    try {
      // 发送 PROPFIND 请求测试连接（测试备份目录是否可访问）
      const response = await this.request("PROPFIND", this.config.remoteDir, null, {
        Depth: "0",
      })

      if (response.ok || response.status === 404) {
        // 404 表示文件不存在但连接成功
        return { success: true, messageKey: "webdavConnectionSuccess" }
      } else if (response.status === 401) {
        return { success: false, messageKey: "webdavAuthFailed" }
      } else {
        return {
          success: false,
          messageKey: "webdavConnectionFailed",
          messageArgs: { detail: httpStatusDetail(response.status) },
        }
      }
    } catch (err) {
      return {
        success: false,
        messageKey: "webdavConnectionFailed",
        messageArgs: { detail: errorDetail(err) },
      }
    }
  }

  /**
   * 上传数据到 WebDAV
   */
  async upload(options: { automaticDeviceId?: string } = {}): Promise<SyncResult> {
    await this.initialLoad
    if (!this.config.url || !this.config.username || !this.config.password) {
      return { success: false, messageKey: "webdavConfigIncomplete" }
    }
    if (!this.runtime) return platform.webdav.runAction("upload", this.config)

    try {
      await this.saveStatus({ lastSyncStatus: "syncing" })

      const exportData = await createBackupDocument(this.runtime.storage, "full", undefined, {
        excludeKeys: options.automaticDeviceId ? ["readingHistory"] : [],
      })

      // 上传到 WebDAV（使用动态生成的文件名）
      const fileName = options.automaticDeviceId
        ? `${APP_NAME}_backup_auto_${options.automaticDeviceId}_${Date.now()}.json`
        : generateBackupFileName()
      const remotePath = this.buildRemotePath(fileName)

      // 确保目录存在
      if (this.config.remoteDir) {
        try {
          // 尝试创建目录，如果已存在通常会返回 405
          await this.request("MKCOL", this.config.remoteDir)
          // 201 Created
        } catch {
          // 忽略创建目录失败（可能是已存在 405，或无权限等，后续 PUT 会再次验证）
          // 实际上 405 会被 request 视为失败抛出 error，这里 catch 住即可
        }
      }

      const response = await this.request("PUT", remotePath, JSON.stringify(exportData), {
        "Content-Type": "application/json",
      })

      if (response.ok || response.status === 201 || response.status === 204) {
        const now = Date.now()
        await this.saveStatus({ lastSyncTime: now, lastSyncStatus: "success" })
        if (options.automaticDeviceId) {
          try {
            const prefix = `${APP_NAME}_backup_auto_${options.automaticDeviceId}_`
            const backups = (await this.getBackupList(Infinity)).filter(
              (file) => file.name.startsWith(prefix) && file.name !== fileName,
            )
            // The just-uploaded file counts as one, even if directory listing is eventually consistent.
            for (const backup of backups.slice(6)) {
              const deleted = await this.deleteFile(backup.name)
              if (!deleted.success) throw new Error(backup.name)
            }
          } catch (error) {
            await this.saveStatus({ lastSyncStatus: "failed" })
            return {
              success: false,
              messageKey: "webdavCleanupFailed",
              messageArgs: { detail: errorDetail(error) },
            }
          }
        }
        return { success: true, messageKey: "webdavUploadSuccess", timestamp: now }
      } else {
        await this.saveStatus({ lastSyncStatus: "failed" })
        return {
          success: false,
          messageKey: "webdavUploadFailed",
          messageArgs: { detail: httpStatusDetail(response.status) },
        }
      }
    } catch (err) {
      await this.saveStatus({ lastSyncStatus: "failed" })
      return {
        success: false,
        messageKey: "webdavUploadFailed",
        messageArgs: { detail: errorDetail(err) },
      }
    }
  }

  /**
   * 获取备份列表（按时间倒序）
   */
  async getBackupList(limit: number = 10): Promise<BackupFile[]> {
    if (!this.config.url || !this.config.username || !this.config.password) {
      return []
    }

    try {
      // PROPFIND 获取目录列表详细信息
      // 请求体告诉服务器我们需要哪些属性
      const body = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:getcontentlength/>
    <D:getlastmodified/>
  </D:prop>
</D:propfind>`

      const response = await this.request("PROPFIND", this.config.remoteDir, body, {
        Depth: "1",
        "Content-Type": "application/xml",
      })

      if (!response.ok) throw new Error(httpStatusDetail(response.status))

      const text = await response.text()
      const files = parseBackupFilesFromWebDAVXml(text)

      // 按时间倒序
      files.sort(
        (a, b) =>
          b.lastModified.getTime() - a.lastModified.getTime() || b.name.localeCompare(a.name),
      )

      return files.slice(0, limit)
    } catch (err) {
      console.error("Failed to get backup list:", err)
      throw err
    }
  }

  /**
   * 删除备份文件
   */
  async deleteFile(fileName: string): Promise<SyncResult> {
    if (!this.config.url || !this.config.username || !this.config.password) {
      return { success: false, messageKey: "webdavConfigIncomplete" }
    }

    try {
      const remotePath = this.buildRemotePath(fileName)
      const response = await this.request("DELETE", remotePath)

      if (response.ok || response.status === 204 || response.status === 404) {
        return { success: true, messageKey: "webdavDeleteSuccess" }
      } else {
        console.warn(`[WebDAV] delete failed: HTTP ${response.status}`)
        return { success: false, messageKey: "webdavDeleteFailed" }
      }
    } catch (err) {
      console.error("[WebDAV] delete failed:", err)
      return { success: false, messageKey: "webdavDeleteFailed" }
    }
  }

  /**
   * 从 WebDAV 下载并恢复数据
   * @param targetFileName 可选，指定下载的文件名。若不指定则下载最新。
   */
  async download(targetFileName?: string): Promise<SyncResult> {
    await this.initialLoad
    if (!this.config.url || !this.config.username || !this.config.password) {
      return { success: false, messageKey: "webdavConfigIncomplete" }
    }
    if (!this.runtime) return platform.webdav.runAction("download", this.config, targetFileName)

    try {
      await this.saveStatus({ lastSyncStatus: "syncing" })

      let fileName = targetFileName
      if (!fileName) {
        // Find latest backup
        const list = await this.getBackupList(1)
        if (list.length === 0) {
          await this.saveStatus({ lastSyncStatus: "failed" })
          return { success: false, messageKey: "webdavFileNotFound" }
        }
        fileName = list[0].name
      }

      const remotePath = this.buildRemotePath(fileName)
      const response = await this.request("GET", remotePath)

      if (!response.ok) {
        await this.saveStatus({ lastSyncStatus: "failed" })
        console.warn(`[WebDAV] download failed: HTTP ${response.status}`)
        return { success: false, messageKey: "webdavDownloadFailed" }
      }

      const text = await response.text()
      let backupData: BackupDocument
      try {
        backupData = normalizeBackupDocument(JSON.parse(text))
      } catch (error) {
        console.error("Backup validation failed:", error)
        await this.saveStatus({ lastSyncStatus: "failed" })
        return { success: false, messageKey: "webdavInvalidFormat" }
      }

      const now = Date.now()
      const restoredSettings = backupData.data.settings
      if (isObjectRecord(restoredSettings)) {
        backupData.data.settings = {
          ...restoredSettings,
          // Preserve saved settings, not temporary connection/schedule values from the request form.
          webdav: {
            ...DEFAULT_WEBDAV_CONFIG,
            ...(await readSavedWebDAVConfig(this.runtime.storage)),
          },
        }
      }

      await restoreBackupDocument(this.runtime.storage, backupData)
      await this.saveStatus({ lastSyncTime: now, lastSyncStatus: "success" })
      return { success: true, messageKey: "webdavDownloadSuccess", timestamp: now }
    } catch (err) {
      console.error("[WebDAV] download failed:", err)
      await this.saveStatus({ lastSyncStatus: "failed" })
      return { success: false, messageKey: "webdavDownloadFailed" }
    }
  }

  /**
   * 构建远程文件路径
   * 结果格式: remoteDir/fileName (e.g., "ophel/filename.json")
   */
  private buildRemotePath(fileName: string): string {
    let dir = this.config.remoteDir.trim()
    // 去除开头和结尾的斜杠
    dir = dir.replace(/^\/+|\/+$/g, "")
    // 如果 dir 为空，直接返回文件名
    if (!dir) return fileName
    return `${dir}/${fileName}`
  }

  /**
   * 发送 WebDAV 请求
   * - 扩展版：通过 background service worker 绕过 CORS
   * - 油猴版：使用 GM_xmlhttpRequest 绕过 CORS
   */
  private async request(
    method: string,
    path: string,
    body?: string | null,
    headers?: Record<string, string>,
  ): Promise<Response> {
    const url = this.buildUrl(path)

    const requestHeaders = { ...headers }
    requestHeaders.Authorization = `Basic ${btoaUtf8(`${this.config.username}:${this.config.password}`)}`
    return (this.runtime?.request ?? platform.webdav.request)(method, url, body, requestHeaders)
  }

  /**
   * 构建完整 URL
   * 逻辑：baseUrl + path
   * path 可能是 "ophel" (remoteDir) 或 "ophel/backup.json" (remoteDir + filename)
   */
  private buildUrl(path: string): string {
    let baseUrl = this.config.url.trim()
    if (!baseUrl.endsWith("/")) baseUrl += "/"

    // 移除 path 开头的斜杠，防止双斜杠
    const cleanPath = path.replace(/^\/+/, "")

    return baseUrl + cleanPath
  }
}

// 单例
let instance: WebDAVSyncManager | null = null

export function getWebDAVSyncManager(configStore?: WebDAVConfigStore): WebDAVSyncManager {
  if (!instance) {
    instance = new WebDAVSyncManager(undefined, configStore)
  } else if (configStore) {
    instance.setConfigStore(configStore)
  }
  return instance
}
