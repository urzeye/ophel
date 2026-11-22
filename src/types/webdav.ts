/**
 * Shared WebDAV types.
 *
 * Keep provider identifiers in a leaf type module so settings types do not
 * depend on the WebDAV sync manager runtime module.
 */

// WebDAV 服务商标识
export type WebDAVProvider =
  | "jianguoyun"
  | "nextcloud"
  | "synology"
  | "seafile"
  | "infinicloud"
  | "pcloud"
  | "custom"

export interface WebDAVConfig {
  enabled: boolean
  url: string // WebDAV 服务器地址，如 https://dav.jianguoyun.com/dav/
  username: string
  password: string // 应用专用密码
  syncMode: "manual" | "auto"
  syncInterval: number // 自动同步间隔（分钟）
  remoteDir: string // 远程备份目录，如 /backup
  dataSources?: Array<"settings" | "conversations" | "prompts" | "claudeSessionKeys">
  provider?: WebDAVProvider // 服务商标识（可选，兼容旧数据）
}

export interface WebDAVStatus {
  lastSyncTime?: number // 上次同步时间戳
  lastSyncStatus?: "success" | "failed" | "syncing"
}

export interface SyncResult {
  success: boolean
  messageKey: string // 国际化键名
  messageArgs?: Record<string, string> // 文案占位符参数，如连接测试和上传失败文案的 {detail}
  timestamp?: number
}

export type WebDAVAction = "upload" | "download"

export type WebDAVTransport = (
  method: string,
  url: string,
  body?: string | null,
  headers?: Record<string, string>,
) => Promise<Response>

export const WEBDAV_BACKUP_INTERVALS = [60, 360, 1440] as const

export function normalizeWebDAVInterval(value: number): number {
  return WEBDAV_BACKUP_INTERVALS.some((interval) => interval === value) ? value : 1440
}

// getRandomValues also works on HTTP SitePack origins, where randomUUID is unavailable.
export function createWebDAVInstanceId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}
