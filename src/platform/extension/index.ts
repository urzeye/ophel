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
} from "../types"
import {
  MSG_CHECK_REMOTE_CONFIG,
  MSG_ENSURE_SITE_PACK_BINDING_ORIGIN,
  MSG_ENSURE_SITE_PACK_ORIGINS,
  MSG_GET_REMOTE_CONFIG_STATE,
  MSG_IGNORE_REMOTE_CONFIG_PATCH,
  MSG_CLEAR_REMOTE_CONFIG_CACHE,
  MSG_INSTALL_LOCAL_REMOTE_CONFIG_PATCH,
  MSG_RECONCILE_SITE_PACK_REGISTRATIONS,
  MSG_REMOVE_LOCAL_REMOTE_CONFIG_PATCH,
  sendToBackground,
} from "~utils/messaging"
import { extensionStorage } from "./storage"

export { extensionStorage }

const notificationSoundPaths: Record<string, string> = {
  default: "assets/notification-sounds/streaming-complete-v2.mp3",
  softChime: "assets/notification-sounds/soft-chime.ogg",
  glassPing: "assets/notification-sounds/glass-ping.ogg",
  brightAlert: "assets/notification-sounds/bright-alert.ogg",
}

/**
 * 浏览器扩展平台实现
 */
export const platform: Platform = {
  type: "extension",

  storage: extensionStorage,

  remoteConfig: {
    async getState() {
      const response = await sendToBackground({ type: MSG_GET_REMOTE_CONFIG_STATE })
      if (!response.success || !response.state) {
        throw new Error(response.error || "Failed to load remote config state")
      }
      return response.state
    },

    async checkForUpdates(options) {
      const response = await sendToBackground({
        type: MSG_CHECK_REMOTE_CONFIG,
        force: true,
        ...(options?.sources && options.sources.length > 0
          ? { sources: [...options.sources] }
          : {}),
      })
      if (response.result) return response.result
      throw new Error(response.error || "Remote config check returned no result")
    },

    async resetSite(siteId, patchVersion) {
      const response = await sendToBackground({
        type: MSG_IGNORE_REMOTE_CONFIG_PATCH,
        siteId,
        patchVersion,
      })
      if (!response.success) {
        throw new Error(response.error || "Failed to reset remote config site")
      }
      return true
    },

    async installLocalPatch(patch, fileName) {
      const response = await sendToBackground({
        type: MSG_INSTALL_LOCAL_REMOTE_CONFIG_PATCH,
        patch,
        ...(fileName ? { fileName } : {}),
      })
      if (!response.success) {
        throw new Error(response.error || "Failed to install local patch")
      }
      return true
    },

    async removeLocalPatch(siteId) {
      const response = await sendToBackground({
        type: MSG_REMOVE_LOCAL_REMOTE_CONFIG_PATCH,
        siteId,
      })
      if (!response.success) {
        throw new Error(response.error || "Failed to remove local patch")
      }
      return true
    },

    async clearCache() {
      const response = await sendToBackground({
        type: MSG_CLEAR_REMOTE_CONFIG_CACHE,
      })
      if (!response.success) {
        throw new Error(response.error || "Failed to clear remote config cache")
      }
      return true
    },
  },

  sitePacks: {
    async ensureOrigins(packId) {
      const response = await sendToBackground({
        type: MSG_ENSURE_SITE_PACK_ORIGINS,
        packId,
      })
      if (!response.success) {
        throw new Error(response.error || "Failed to authorize SitePack origins")
      }
      if (response.granted === true) return "ready"
      if (response.granted === false) return "denied"
      throw new Error("SitePack origin authorization returned no result")
    },

    async ensureBindingOrigin(origin, binding, requestName) {
      const response = await sendToBackground({
        type: MSG_ENSURE_SITE_PACK_BINDING_ORIGIN,
        origin,
        binding,
        requestName,
      })
      if (!response.success) {
        throw new Error(response.error || "Failed to authorize SitePack binding origin")
      }
      if (response.granted === true) return "ready"
      if (response.granted === false) return "denied"
      throw new Error("SitePack binding origin authorization returned no result")
    },

    async reconcile() {
      const response = await sendToBackground({
        type: MSG_RECONCILE_SITE_PACK_REGISTRATIONS,
      })
      if (!response.success) {
        throw new Error(response.error || "Failed to reconcile SitePack registrations")
      }
      return {
        activeOrigins: response.activeOrigins ?? [],
        missingPermissionOrigins: response.missingPermissionOrigins ?? [],
        originReferences: response.originReferences ?? [],
        bindingIssues: response.bindingIssues ?? [],
      }
    },
  },

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
      async json() {
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

  getNotificationSoundUrl(presetId: string): string | undefined {
    const path = notificationSoundPaths[presetId]
    return path ? chrome.runtime.getURL(path) : undefined
  },

  focusWindow(): void {
    chrome.runtime.sendMessage({ type: "FOCUS_TAB" })
  },

  openTab(url: string): void {
    chrome.runtime.sendMessage({ type: "OPEN_URL", url })
  },

  hasCapability(_cap: PlatformCapability): boolean {
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
