/**
 * WebDAV 同步管理器
 * 支持将本地数据同步到 WebDAV 服务器（如坚果云、Nextcloud 等）
 */

import { MULTI_PROP_STORES, ZUSTAND_KEYS } from "~constants/defaults"
import { APP_NAME } from "~utils/config"
import { MSG_WEBDAV_REQUEST } from "~utils/messaging"
import { localStorage, STORAGE_KEYS, type Settings } from "~utils/storage"

function safeDecodeURIComponent(str: string) {
  try {
    return decodeURIComponent(str)
  } catch (e) {
    return str
  }
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
  private autoSyncTimer: NodeJS.Timeout | null = null

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
      this.config = { ...DEFAULT_WEBDAV_CONFIG, ...settings.webdav }
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

      // 获取本地所有数据
      const localData = await new Promise<Record<string, any>>((resolve) =>
        chrome.storage.local.get(null, resolve),
      )

      // Zustand persist 使用的 storage keys (从 constants/defaults.ts 导入)

      // Hydrate data：解析 JSON 字符串，并提取 Zustand persist 格式中的实际数据
      // 扁平化导出：移除 state 层，直接导出数据
      const hydratedData = Object.fromEntries(
        Object.entries(localData).map(([k, v]) => {
          try {
            let parsed = typeof v === "string" ? JSON.parse(v) : v

            // 处理 Zustand persist 格式：提取 state 中的数据
            // 格式: { state: { settings: {...} | prompts: [...] | conversations: {...} }, version: 0 }
            if (ZUSTAND_KEYS.includes(k) && parsed?.state) {
              // 直接提取 state 中与 key 同名的属性（主数据）
              // 例如: prompts store 的 state 中有 prompts 数组
              // 例如: conversations store 的 state 中有 conversations 对象
              if (parsed.state[k] !== undefined) {
                parsed = parsed.state[k]
              } else {
                // 如果没有同名属性，保留整个 state 内容
                parsed = parsed.state
              }
            }

            return [k, parsed]
          } catch {
            return [k, v]
          }
        }),
      )

      const exportData = {
        version: 3, // 升级版本号
        timestamp: new Date().toISOString(),
        data: hydratedData,
      }

      // 上传到 WebDAV（使用动态生成的文件名）
      const fileName = generateBackupFileName()
      const remotePath = this.buildRemotePath(fileName)

      // 确保目录存在
      if (this.config.remoteDir) {
        try {
          // 尝试创建目录，如果已存在通常会返回 405
          const mkcolResponse = await this.request("MKCOL", this.config.remoteDir)
          // 201 Created
        } catch (e) {
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
      // 简单正则解析 XML
      // 匹配 <D:response> 块
      const responseRegex = /<d:response>([\s\S]*?)<\/d:response>/gi
      const responses = Array.from(text.matchAll(responseRegex))

      const files: BackupFile[] = []

      for (const match of responses) {
        const content = match[1]

        // 解析 href
        const hrefMatch = content.match(/<d:href>([^<]+)<\/d:href>/i)
        if (!hrefMatch) continue
        const href = safeDecodeURIComponent(hrefMatch[1])

        // 排除目录本身（通常以斜杠结尾，或者是请求的根路径）
        // 这里简单判断：如果是 json 文件且包含 backup 关键字
        if (!href.endsWith(".json") || !href.includes(`${APP_NAME}_backup_`)) continue

        // 解析大小
        const sizeMatch = content.match(/<d:getcontentlength>([^<]+)<\/d:getcontentlength>/i)
        const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0

        // 解析时间
        const timeMatch = content.match(/<d:getlastmodified>([^<]+)<\/d:getlastmodified>/i)
        const lastModified = timeMatch ? new Date(timeMatch[1]) : new Date(0)

        // 提取文件名
        const name = href.split("/").pop() || href

        files.push({
          name,
          path: href,
          size,
          lastModified,
        })
      }

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
      const backupData = JSON.parse(text)

      // 基础格式和数据类型校验
      const { validateBackupData } = await import("~utils/backup-validator")
      const validation = validateBackupData(backupData)
      if (!validation.valid) {
        console.error("Backup validation failed:", validation.errorKeys)
        await this.saveConfig({ lastSyncStatus: "failed" })
        return { success: false, messageKey: "webdavInvalidFormat" }
      }

      // 1. 保存当前的WebDAV配置(避免被备份数据覆盖)
      const currentWebdavConfig = this.config

      // Zustand persist 使用的 storage keys 和多属性 store (从 constants/defaults.ts 导入)

      // 2. Dehydrate: 将对象序列化回 Zustand persist 格式
      const dehydratedData = Object.fromEntries(
        Object.entries(backupData.data).map(([k, v]) => {
          if (v === null || v === undefined) {
            return [k, v]
          }

          // 处理 Zustand stores
          if (ZUSTAND_KEYS.includes(k)) {
            let state: Record<string, any>
            if (MULTI_PROP_STORES.includes(k)) {
              // 多属性 store（如 conversations, readingHistory）
              // 如果导入的数据已经是包含多个属性的对象，直接使用
              // 否则（扁平化格式），将其包装为 { [k]: v }
              if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 1) {
                // 旧格式：已经是 { conversations: {...}, lastUsedFolderId: "..." }
                state = v
              } else {
                // 扁平化格式：v 直接是主数据（如 conversations 对象）
                state = { [k]: v }
              }
            } else {
              // 单属性 store
              state = { [k]: v }
            }
            return [k, JSON.stringify({ state, version: 0 })]
          }

          // 非 Zustand stores，直接序列化
          if (typeof v === "object") {
            return [k, JSON.stringify(v)]
          }
          return [k, v]
        }),
      )

      await new Promise<void>((resolve, reject) =>
        chrome.storage.local.set(dehydratedData, () =>
          chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(),
        ),
      )

      // 3. 恢复当前 WebDAV 配置（保持用户当前的 WebDAV 设置）
      // 直接操作 storage 而非 setSettings()，避免触发 Zustand persist
      await new Promise<void>((resolve, reject) => {
        chrome.storage.local.get("settings", (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError)
            return
          }

          // 解析当前 storage 中的 settings（刚写入的备份数据）
          let settingsWrapper = result.settings
          if (typeof settingsWrapper === "string") {
            try {
              settingsWrapper = JSON.parse(settingsWrapper)
            } catch {
              // 解析失败，跳过 WebDAV 配置恢复
              resolve()
              return
            }
          }

          // 更新 webdav 配置
          if (settingsWrapper?.state?.settings) {
            settingsWrapper.state.settings.webdav = currentWebdavConfig
          }

          // 写回 storage
          chrome.storage.local.set({ settings: JSON.stringify(settingsWrapper) }, () =>
            chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(),
          )
        })
      })

      const now = Date.now()
      return { success: true, messageKey: "webdavDownloadSuccess", timestamp: now }
    } catch (err) {
      await this.saveConfig({ lastSyncStatus: "failed" })
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
