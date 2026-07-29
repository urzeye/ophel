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
import type { WebDAVProvider } from "~types/webdav"
import { APP_NAME } from "~utils/config"
import { MSG_WEBDAV_REQUEST } from "~utils/messaging"

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

// WebDAV 配置接口
export interface WebDAVConfig {
  enabled: boolean
  url: string // WebDAV 服务器地址，如 https://dav.jianguoyun.com/dav/
  username: string
  password: string // 应用专用密码
  syncMode: "manual" | "auto"
  syncInterval: number // 自动同步间隔（分钟）
  remoteDir: string // 远程备份目录，如 /backup
  provider?: WebDAVProvider // 服务商标识（可选，兼容旧数据）
  lastSyncTime?: number // 上次同步时间戳
  lastSyncStatus?: "success" | "failed" | "syncing"
}

export const DEFAULT_WEBDAV_CONFIG: WebDAVConfig = {
  enabled: false,
  url: "",
  username: "",
  password: "",
  syncMode: "manual",
  syncInterval: 30,
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

// 同步结果
export interface SyncResult {
  success: boolean
  messageKey: string // 国际化键名
  messageArgs?: Record<string, any> // 消息参数（如错误详情）
  timestamp?: number
}

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
export class WebDAVSyncManager {
  private config: WebDAVConfig = DEFAULT_WEBDAV_CONFIG
  private autoSyncTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.loadConfig()
  }

  /**
   * 加载配置
   * ⭐ 使用 Zustand store 读取 settings
   */
  async loadConfig(): Promise<WebDAVConfig> {
    // 动态导入避免循环依赖
    const { getSettingsState } = await import("~stores/settings-store")
    const settings = getSettingsState()
    if (settings?.webdav) {
      const config: WebDAVConfig = {
        ...DEFAULT_WEBDAV_CONFIG,
        ...settings.webdav,
        provider: isValidWebDAVProvider(settings.webdav.provider)
          ? settings.webdav.provider
          : undefined,
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
   * 保存配置
   * ⭐ 通过 Zustand store 保存，确保一致性
   */
  /**
   * 设置配置
   * @param config 配置对象
   * @param persist 是否持久化到 storage (默认 true)
   */
  async setConfig(config: Partial<WebDAVConfig>, persist: boolean = true): Promise<void> {
    this.config = { ...this.config, ...config }
    if (persist) {
      // 动态导入避免循环依赖
      const { useSettingsStore } = await import("~stores/settings-store")
      useSettingsStore.getState().setSettings({ webdav: this.config })
    }
  }

  /**
   * 保存配置 (兼容旧方法，强制持久化)
   */
  async saveConfig(config: Partial<WebDAVConfig>): Promise<void> {
    return this.setConfig(config, true)
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
          messageArgs: { status: response.status },
        }
      }
    } catch (err) {
      return {
        success: false,
        messageKey: "webdavConnectionFailed",
        messageArgs: { error: String(err) },
      }
    }
  }

  /**
   * 上传数据到 WebDAV
   */
  async upload(): Promise<SyncResult> {
    if (!this.config.url || !this.config.username || !this.config.password) {
      return { success: false, messageKey: "webdavConfigIncomplete" }
    }

    try {
      await this.saveConfig({ lastSyncStatus: "syncing" })

      const exportData = await createBackupDocument(platform.storage, "full")

      // 上传到 WebDAV（使用动态生成的文件名）
      const fileName = generateBackupFileName()
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

      const response = await this.request("PUT", remotePath, JSON.stringify(exportData, null, 2), {
        "Content-Type": "application/json",
      })

      if (response.ok || response.status === 201 || response.status === 204) {
        const now = Date.now()
        await this.saveConfig({ lastSyncTime: now, lastSyncStatus: "success" })
        return { success: true, messageKey: "webdavUploadSuccess", timestamp: now }
      } else {
        await this.saveConfig({ lastSyncStatus: "failed" })
        return {
          success: false,
          messageKey: "webdavUploadFailed",
          messageArgs: { status: response.status },
        }
      }
    } catch (err) {
      await this.saveConfig({ lastSyncStatus: "failed" })
      return {
        success: false,
        messageKey: "webdavUploadFailed",
        messageArgs: { error: String(err) },
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

      if (!response.ok) return []

      const text = await response.text()
      const files = parseBackupFilesFromWebDAVXml(text)

      // 按时间倒序
      files.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())

      return files.slice(0, limit)
    } catch (err) {
      console.error("Failed to get backup list:", err)
      return []
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
        return {
          success: false,
          messageKey: "webdavDeleteFailed",
          messageArgs: { status: response.status },
        }
      }
    } catch (err) {
      return {
        success: false,
        messageKey: "webdavDeleteFailed",
        messageArgs: { error: String(err) },
      }
    }
  }

  /**
   * 从 WebDAV 下载并恢复数据
   * @param targetFileName 可选，指定下载的文件名。若不指定则下载最新。
   */
  async download(targetFileName?: string): Promise<SyncResult> {
    if (!this.config.url || !this.config.username || !this.config.password) {
      return { success: false, messageKey: "webdavConfigIncomplete" }
    }

    let restoreWriteStarted = false
    try {
      await this.saveConfig({ lastSyncStatus: "syncing" })

      let fileName = targetFileName
      if (!fileName) {
        // Find latest backup
        const list = await this.getBackupList(1)
        if (list.length === 0) {
          await this.saveConfig({ lastSyncStatus: "failed" })
          return { success: false, messageKey: "webdavFileNotFound" }
        }
        fileName = list[0].name
      }

      const remotePath = this.buildRemotePath(fileName)
      const response = await this.request("GET", remotePath)

      if (!response.ok) {
        await this.saveConfig({ lastSyncStatus: "failed" })
        return {
          success: false,
          messageKey: "webdavDownloadFailed",
          messageArgs: { status: response.status },
        }
      }

      const text = await response.text()
      let backupData: BackupDocument
      try {
        backupData = normalizeBackupDocument(JSON.parse(text))
      } catch (error) {
        console.error("Backup validation failed:", error)
        await this.saveConfig({ lastSyncStatus: "failed" })
        return { success: false, messageKey: "webdavInvalidFormat" }
      }

      const currentWebdavConfig = this.config
      const now = Date.now()
      const nextWebdavConfig: WebDAVConfig = {
        ...currentWebdavConfig,
        lastSyncTime: now,
        lastSyncStatus: "success",
      }
      const restoredSettings = backupData.data.settings
      if (isObjectRecord(restoredSettings)) {
        backupData.data.settings = {
          ...restoredSettings,
          webdav: nextWebdavConfig,
        }
      }

      restoreWriteStarted = true
      await restoreBackupDocument(platform.storage, backupData)
      if (isObjectRecord(restoredSettings)) {
        this.config = nextWebdavConfig
      } else {
        await this.saveConfig({ lastSyncTime: now, lastSyncStatus: "success" })
      }
      return { success: true, messageKey: "webdavDownloadSuccess", timestamp: now }
    } catch (err) {
      if (restoreWriteStarted) {
        this.config = { ...this.config, lastSyncStatus: "failed" }
      } else {
        await this.saveConfig({ lastSyncStatus: "failed" })
      }
      return {
        success: false,
        messageKey: "webdavDownloadFailed",
        messageArgs: { error: String(err) },
      }
    }
  }

  /**
   * 启动自动同步
   */
  startAutoSync(): void {
    this.stopAutoSync()
    if (this.config.enabled && this.config.syncMode === "auto" && this.config.syncInterval > 0) {
      this.autoSyncTimer = setInterval(
        () => {
          this.upload()
        },
        this.config.syncInterval * 60 * 1000,
      )
    }
  }

  /**
   * 停止自动同步
   */
  stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer)
      this.autoSyncTimer = null
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

    // 检测是否为油猴脚本环境
    // @ts-ignore - __PLATFORM__ 是构建时注入的全局变量
    const isUserscript = typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"

    if (isUserscript) {
      // 油猴脚本：使用 GM_xmlhttpRequest
      return this.requestViaGM(method, url, body, headers)
    } else {
      // 浏览器扩展：通过 background 代理请求以绕过 CORS
      return this.requestViaBackground(method, url, body, headers)
    }
  }

  /**
   * 油猴脚本环境：使用 GM_xmlhttpRequest 发送请求
   */
  private requestViaGM(
    method: string,
    url: string,
    body?: string | null,
    headers?: Record<string, string>,
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      // 构建请求头，添加 Basic Auth
      const requestHeaders: Record<string, string> = { ...headers }
      if (this.config.username && this.config.password) {
        const credentials = btoa(`${this.config.username}:${this.config.password}`)
        requestHeaders["Authorization"] = `Basic ${credentials}`
      }

      // @ts-ignore - GM_xmlhttpRequest 是油猴脚本 API
      GM_xmlhttpRequest({
        method,
        url,
        headers: requestHeaders,
        data: body || undefined,
        onload: (response: any) => {
          // 构造一个类 Response 对象返回
          resolve({
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            statusText: response.statusText,
            text: async () => response.responseText,
            headers: {
              get: (name: string) => {
                // 解析响应头
                const headerLines = response.responseHeaders?.split("\r\n") || []
                for (const line of headerLines) {
                  const [key, ...valueParts] = line.split(":")
                  if (key?.toLowerCase() === name.toLowerCase()) {
                    return valueParts.join(":").trim()
                  }
                }
                return null
              },
            },
          } as unknown as Response)
        },
        onerror: (error: any) => {
          reject(new Error(error.statusText || "GM_xmlhttpRequest failed"))
        },
        ontimeout: () => {
          reject(new Error("Request timeout"))
        },
      })
    })
  }

  /**
   * 浏览器扩展环境：通过 background service worker 发送请求
   */
  private async requestViaBackground(
    method: string,
    url: string,
    body?: string | null,
    headers?: Record<string, string>,
  ): Promise<Response> {
    const response = await chrome.runtime.sendMessage({
      type: MSG_WEBDAV_REQUEST,
      method,
      url,
      body,
      headers,
      auth: {
        username: this.config.username,
        password: this.config.password,
      },
    })

    if (!response.success) {
      throw new Error(response.error || "WebDAV request failed")
    }

    // 构造一个类 Response 对象返回
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.statusText,
      text: async () => response.body,
      headers: {
        get: (name: string) => response.headers?.[name.toLowerCase()] || null,
      },
    } as unknown as Response
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

export function getWebDAVSyncManager(): WebDAVSyncManager {
  if (!instance) {
    instance = new WebDAVSyncManager()
  }
  return instance
}
