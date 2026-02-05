/**
 * Messaging Protocol Definitions
 */

// ============================================================================
// Content Script <-> Background Service Worker
// ============================================================================

export const MSG_SHOW_NOTIFICATION = "SHOW_NOTIFICATION"
export const MSG_FOCUS_TAB = "FOCUS_TAB"

export interface ShowNotificationPayload {
  title: string
  body: string
}

export interface ShowNotificationMessage extends ShowNotificationPayload {
  type: typeof MSG_SHOW_NOTIFICATION
}

export interface FocusTabMessage {
  type: typeof MSG_FOCUS_TAB
}

export const MSG_PROXY_FETCH = "PROXY_FETCH"

export interface ProxyFetchPayload {
  url: string
}

export interface ProxyFetchMessage extends ProxyFetchPayload {
  type: typeof MSG_PROXY_FETCH
}

// WebDAV 代理请求（绕过 CORS）
export const MSG_WEBDAV_REQUEST = "WEBDAV_REQUEST"

export interface WebDAVRequestPayload {
  method: string
  url: string
  body?: string | null
  headers?: Record<string, string>
  auth?: { username: string; password: string }
}

export interface WebDAVRequestMessage extends WebDAVRequestPayload {
  type: typeof MSG_WEBDAV_REQUEST
}

// 检查权限
export const MSG_CHECK_PERMISSION = "CHECK_PERMISSION"

export interface CheckPermissionPayload {
  origin: string
}

export interface CheckPermissionMessage extends CheckPermissionPayload {
  type: typeof MSG_CHECK_PERMISSION
}

// 检查多个权限（用于权限管理页面）
export const MSG_CHECK_PERMISSIONS = "CHECK_PERMISSIONS"

export interface CheckPermissionsPayload {
  origins?: string[]
  permissions?: string[]
}

export interface CheckPermissionsMessage extends CheckPermissionsPayload {
  type: typeof MSG_CHECK_PERMISSIONS
}

// 请求权限
export const MSG_REQUEST_PERMISSIONS = "REQUEST_PERMISSIONS"

export interface RequestPermissionsPayload {
  origins?: string[]
  permissions?: string[]
}

export interface RequestPermissionsMessage extends RequestPermissionsPayload {
  type: typeof MSG_REQUEST_PERMISSIONS
}

// 撤销权限
export const MSG_REVOKE_PERMISSIONS = "REVOKE_PERMISSIONS"

export interface RevokePermissionsPayload {
  origins?: string[]
  permissions?: string[]
}

export interface RevokePermissionsMessage extends RevokePermissionsPayload {
  type: typeof MSG_REVOKE_PERMISSIONS
}

// 打开 Options 页面
export const MSG_OPEN_OPTIONS_PAGE = "OPEN_OPTIONS_PAGE"

export interface OpenOptionsPageMessage {
  type: typeof MSG_OPEN_OPTIONS_PAGE
}

// 打开 URL（用于 chrome:// 等特殊协议）
export const MSG_OPEN_URL = "OPEN_URL"

export interface OpenUrlPayload {
  url: string
}

export interface OpenUrlMessage extends OpenUrlPayload {
  type: typeof MSG_OPEN_URL
}

// 清除全部数据（通知各上下文重置内存态）
export const MSG_CLEAR_ALL_DATA = "CLEAR_ALL_DATA"

export interface ClearAllDataMessage {
  type: typeof MSG_CLEAR_ALL_DATA
}

// 设置Claude SessionKey Cookie
export const MSG_SET_CLAUDE_SESSION_KEY = "SET_CLAUDE_SESSION_KEY"

export interface SetClaudeSessionKeyPayload {
  key: string // SessionKey值,空字符串表示移除cookie(使用默认)
}

export interface SetClaudeSessionKeyMessage extends SetClaudeSessionKeyPayload {
  type: typeof MSG_SET_CLAUDE_SESSION_KEY
}

// 测试Claude SessionKey有效性（通过background代理绕过CORS）
export const MSG_TEST_CLAUDE_TOKEN = "TEST_CLAUDE_TOKEN"

export interface TestClaudeTokenPayload {
  sessionKey: string // 要测试的SessionKey
}

export interface TestClaudeTokenMessage extends TestClaudeTokenPayload {
  type: typeof MSG_TEST_CLAUDE_TOKEN
}

// 获取Claude SessionKey Cookie（从background获取，绕过权限限制）
export const MSG_GET_CLAUDE_SESSION_KEY = "GET_CLAUDE_SESSION_KEY"

export interface GetClaudeSessionKeyMessage {
  type: typeof MSG_GET_CLAUDE_SESSION_KEY
}

// 检测Claude页面是否正在生成（用于测试前安全检查）
export const MSG_CHECK_CLAUDE_GENERATING = "CHECK_CLAUDE_GENERATING"

export interface CheckClaudeGeneratingMessage {
  type: typeof MSG_CHECK_CLAUDE_GENERATING
}

export type ExtensionMessage =
  | ShowNotificationMessage
  | FocusTabMessage
  | ProxyFetchMessage
  | WebDAVRequestMessage
  | CheckPermissionMessage
  | CheckPermissionsMessage
  | RequestPermissionsMessage
  | RevokePermissionsMessage
  | OpenOptionsPageMessage
  | OpenUrlMessage
  | ClearAllDataMessage
  | SetClaudeSessionKeyMessage
  | TestClaudeTokenMessage
  | GetClaudeSessionKeyMessage
  | CheckClaudeGeneratingMessage
  | SwitchNextClaudeKeyMessage
  | GetAIStudioModelsMessage

export const MSG_SWITCH_NEXT_CLAUDE_KEY = "SWITCH_NEXT_CLAUDE_KEY"

export interface SwitchNextClaudeKeyMessage {
  type: typeof MSG_SWITCH_NEXT_CLAUDE_KEY
}

// 获取 AI Studio 模型列表（从 content script 获取）
export const MSG_GET_AISTUDIO_MODELS = "GET_AISTUDIO_MODELS"

export interface GetAIStudioModelsMessage {
  type: typeof MSG_GET_AISTUDIO_MODELS
}

export interface AIStudioModelInfo {
  id: string
  name: string
}

/**
 * Send a message to the background service worker with type safety
 */
export function sendToBackground<T extends ExtensionMessage>(message: T): Promise<any> {
  return chrome.runtime.sendMessage(message)
}

// ============================================================================
// Main World (Monitor) <-> Isolated World (Content Script)
// ============================================================================

export const EVENT_MONITOR_INIT = "GH_MONITOR_INIT"
export const EVENT_MONITOR_START = "GH_MONITOR_START"
export const EVENT_MONITOR_COMPLETE = "GH_MONITOR_COMPLETE"
export const EVENT_PRIVACY_TOGGLE = "GH_PRIVACY_TOGGLE"

export interface MonitorConfigPayload {
  urlPatterns: string[]
  silenceThreshold: number
}

export interface MonitorEventPayload {
  url?: string
  timestamp: number
  activeCount?: number
  lastUrl?: string
  type?: string
}

export interface WindowMessage {
  type: string
  payload?: any
}
