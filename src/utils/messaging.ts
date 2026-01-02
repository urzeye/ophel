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

export type ExtensionMessage = ShowNotificationMessage | FocusTabMessage | ProxyFetchMessage

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
