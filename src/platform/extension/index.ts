/**
 * Platform Implementation - Browser Extension
 *
 * 浏览器扩展平台实现，通过 chrome.runtime.sendMessage 与 background 通信
 */

import type {
  FetchOptions,
  FetchResponse,
  NotifyOptions,
  Platform,
  PlatformCapability,
  PlatformStorage,
} from "../types"

/**
 * 扩展版存储实现
 */
const extensionStorage: PlatformStorage = {
  async get<T>(key: string): Promise<T | undefined> {
    const result = await chrome.storage.local.get(key)
    return result[key] as T | undefined
  },

  async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [key]: value })
  },

  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove(key)
  },

  watch<T>(
    key: string,
    callback: (newValue: T | undefined, oldValue: T | undefined) => void,
  ): () => void {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (key in changes) {
        callback(changes[key].newValue as T | undefined, changes[key].oldValue as T | undefined)
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  },
}

/**
 * 浏览器扩展平台实现
 */
export const platform: Platform = {
  type: "extension",

  storage: extensionStorage,

  async fetch(url: string, options?: FetchOptions): Promise<FetchResponse> {
    // 通过 background 代理请求
    const response = await chrome.runtime.sendMessage({
      type: "PROXY_FETCH",
      url,
      ...options,
    })

    if (!response.success) {
      throw new Error(response.error || "Fetch failed")
    }

    // 模拟 Response 接口
    const data = response.data
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async text() {
        return typeof data === "string" ? data : JSON.stringify(data)
      },
      async json<T>() {
        return typeof data === "string" ? JSON.parse(data) : data
      },
      async blob() {
        // Base64 data URL 转 Blob
        if (typeof data === "string" && data.startsWith("data:")) {
          const res = await globalThis.fetch(data)
          return res.blob()
        }
        return new Blob([data])
      },
    }
  },

  notify(options: NotifyOptions): void {
    chrome.runtime.sendMessage({
      type: "SHOW_NOTIFICATION",
      title: options.title,
      body: options.message,
    })
  },

  focusWindow(): void {
    chrome.runtime.sendMessage({ type: "FOCUS_TAB" })
  },

  openTab(url: string): void {
    chrome.runtime.sendMessage({ type: "OPEN_URL", url })
  },

  hasCapability(cap: PlatformCapability): boolean {
    // 扩展版支持所有能力
    return true
  },

  async getClaudeSessionKey() {
    return chrome.runtime.sendMessage({ type: "GET_CLAUDE_SESSION_KEY" })
  },

  async testClaudeSessionKey(sessionKey: string) {
    return chrome.runtime.sendMessage({ type: "TEST_CLAUDE_TOKEN", sessionKey })
  },

  async setClaudeSessionKey(sessionKey: string) {
    return chrome.runtime.sendMessage({ type: "SET_CLAUDE_SESSION_KEY", key: sessionKey })
  },

  async switchNextClaudeKey() {
    return chrome.runtime.sendMessage({ type: "SWITCH_NEXT_CLAUDE_KEY" })
  },
}
