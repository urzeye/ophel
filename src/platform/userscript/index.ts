/**
 * Platform Implementation - Userscript (Tampermonkey/Violentmonkey)
 *
 * 油猴脚本平台实现，使用 GM_* API
 */

import { t } from "~utils/i18n"

import type {
  FetchOptions,
  FetchResponse,
  NotifyOptions,
  Platform,
  PlatformCapability,
  PlatformStorage,
} from "../types"

// GM API 类型声明
declare function GM_getValue<T>(key: string, defaultValue?: T): T
declare function GM_setValue(key: string, value: unknown): void
declare function GM_deleteValue(key: string): void
declare function GM_addValueChangeListener(
  key: string,
  callback: (name: string, oldValue: unknown, newValue: unknown, remote: boolean) => void,
): number
declare function GM_removeValueChangeListener(listenerId: number): void
declare function GM_xmlhttpRequest(details: {
  url: string
  method?: string
  headers?: Record<string, string>
  data?: string
  responseType?: string
  onload?: (response: {
    status: number
    statusText: string
    responseText: string
    response: unknown
  }) => void
  onerror?: (error: unknown) => void
}): void
declare function GM_notification(details: {
  title: string
  text: string
  timeout?: number
  silent?: boolean
  onclick?: () => void
}): void

/**
 * 油猴版存储实现
 */
const userscriptStorage: PlatformStorage = {
  async get<T>(key: string): Promise<T | undefined> {
    const value = GM_getValue(key)
    if (value === undefined || value === null) {
      return undefined
    }
    // GM_getValue 已经处理了 JSON 反序列化
    return value as T
  },

  async set<T>(key: string, value: T): Promise<void> {
    GM_setValue(key, value)
  },

  async remove(key: string): Promise<void> {
    GM_deleteValue(key)
  },

  watch<T>(
    key: string,
    callback: (newValue: T | undefined, oldValue: T | undefined) => void,
  ): () => void {
    const listenerId = GM_addValueChangeListener(key, (_name, oldValue, newValue, _remote) => {
      callback(newValue as T | undefined, oldValue as T | undefined)
    })
    return () => GM_removeValueChangeListener(listenerId)
  },
}

/**
 * 油猴脚本平台实现
 */
export const platform: Platform = {
  type: "userscript",

  storage: userscriptStorage,

  async fetch(url: string, options?: FetchOptions): Promise<FetchResponse> {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url,
        method: options?.method || "GET",
        headers: options?.headers,
        data: options?.body,
        responseType: "text",
        onload(response) {
          const ok = response.status >= 200 && response.status < 300
          resolve({
            ok,
            status: response.status,
            statusText: response.statusText,
            async text() {
              return response.responseText
            },
            async json<T>() {
              return JSON.parse(response.responseText) as T
            },
            async blob() {
              // 对于二进制数据，需要重新请求
              return new Promise((res, rej) => {
                GM_xmlhttpRequest({
                  url,
                  method: options?.method || "GET",
                  headers: options?.headers,
                  responseType: "blob" as any,
                  onload(blobResponse) {
                    res(blobResponse.response as Blob)
                  },
                  onerror: rej,
                })
              })
            },
          })
        },
        onerror(error) {
          reject(error)
        },
      })
    })
  },

  notify(options: NotifyOptions): void {
    GM_notification({
      title: options.title,
      text: options.message,
      timeout: options.timeout ?? 5000,
      silent: options.silent ?? true,
      onclick: () => {
        window.focus()
      },
    })
  },

  focusWindow(): void {
    window.focus()
  },

  openTab(url: string): void {
    window.open(url, "_blank")
  },

  hasCapability(cap: PlatformCapability): boolean {
    // 油猴版不支持这些能力
    const unsupported: PlatformCapability[] = [
      "cookies",
      "permissions",
      "tabs",
      "declarativeNetRequest",
      "commands",
    ]
    return !unsupported.includes(cap)
  },

  async getClaudeSessionKey() {
    // 检查是否在 claude.ai 域名
    if (!location.hostname.endsWith("claude.ai")) {
      return { success: false, error: t("claudeNotOnSiteHint") }
    }

    // 从 document.cookie 解析 sessionKey
    const match = document.cookie.match(/sessionKey=([^;]+)/)
    if (match && match[1]) {
      return { success: true, sessionKey: decodeURIComponent(match[1]) }
    }

    return { success: false, error: t("claudeNoCookieFound") }
  },

  async testClaudeSessionKey(sessionKey: string) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        url: "https://claude.ai/api/organizations",
        method: "GET",
        headers: {
          Accept: "application/json",
          Cookie: `sessionKey=${sessionKey}`,
        },
        onload(response) {
          try {
            if (response.status !== 200) {
              resolve({ success: true, isValid: false, error: `HTTP ${response.status}` })
              return
            }

            const text = response.responseText
            if (text.toLowerCase().includes("unauthorized")) {
              resolve({ success: true, isValid: false, error: "Unauthorized" })
              return
            }

            const orgs = JSON.parse(text)
            if (!Array.isArray(orgs) || orgs.length === 0) {
              resolve({ success: true, isValid: false, error: "No organizations" })
              return
            }

            // 识别账号类型
            const org = orgs[0]
            const tier = org?.rate_limit_tier
            const capabilities = org?.capabilities || []
            const apiDisabledReason = org?.api_disabled_reason

            let accountType = "Unknown"
            if (tier === "default_claude_max_5x") {
              accountType = "Max(5x)"
            } else if (tier === "default_claude_max_20x") {
              accountType = "Max(20x)"
            } else if (tier === "default_claude_ai") {
              accountType = "Free"
            } else if (tier === "auto_api_evaluation") {
              accountType = apiDisabledReason === "out_of_credits" ? "API(无额度)" : "API"
            } else if (capabilities.includes("claude_max")) {
              accountType = "Max"
            } else if (capabilities.includes("api")) {
              accountType = "API"
            } else if (capabilities.includes("chat")) {
              accountType = "Free"
            }

            resolve({ success: true, isValid: true, accountType })
          } catch {
            resolve({ success: true, isValid: false, error: "Parse error" })
          }
        },
        onerror() {
          resolve({ success: false, isValid: false, error: "Request failed" })
        },
      })
    })
  },

  async setClaudeSessionKey(sessionKey: string) {
    // 检查是否在 claude.ai 域名
    if (!location.hostname.endsWith("claude.ai")) {
      return { success: false, error: t("claudeNotOnSiteHint") }
    }

    // 设置 cookie
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()
    document.cookie = `sessionKey=${encodeURIComponent(sessionKey)}; domain=.claude.ai; path=/; expires=${expires}; secure; samesite=lax`

    // 刷新页面
    location.href = "https://claude.ai/"

    return { success: true }
  },

  async switchNextClaudeKey() {
    // 检查是否在 claude.ai 域名
    if (!location.hostname.endsWith("claude.ai")) {
      return { success: false, error: t("claudeNotOnSiteHint") }
    }

    try {
      // 1. 从 GM 存储读取 claudeSessionKeys
      // Zustand persist 存储结构: { state: { keys: [], currentKeyId: "" }, version: 0 }
      const storageData = GM_getValue("claudeSessionKeys") as any
      const rawKeys = storageData?.state?.keys || []

      if (rawKeys.length === 0) {
        return { success: false, error: "noClaudeKeys" }
      }

      const currentId = storageData?.state?.currentKeyId

      // 2. 筛选可用 Keys 并排序 (Pro 优先)
      let availableKeys = rawKeys.filter((k: any) => k.isValid !== false)

      // 如果没有可用 Key，尝试使用所有 Key
      if (availableKeys.length === 0) {
        availableKeys = [...rawKeys]
      }

      // 排序: Pro 优先，然后是名称
      availableKeys.sort((a: any, b: any) => {
        const isAPro = a.accountType?.toLowerCase()?.includes("pro")
        const isBPro = b.accountType?.toLowerCase()?.includes("pro")
        if (isAPro && !isBPro) return -1
        if (!isAPro && isBPro) return 1
        return a.name.localeCompare(b.name)
      })

      // 3. 找到下一个 Key
      const currentIndex = availableKeys.findIndex((k: any) => k.id === currentId)

      // 如果只有一个 Key 且当前正在使用它，则不执行切换
      if (availableKeys.length === 1 && currentIndex !== -1) {
        return { success: false, error: "claudeOnlyOneKey" }
      }

      let nextIndex = 0
      if (currentIndex !== -1) {
        nextIndex = (currentIndex + 1) % availableKeys.length
      }

      const nextKey = availableKeys[nextIndex]
      if (!nextKey) {
        return { success: false, error: "nextKeyNotFound" }
      }

      // 4. 设置 Cookie
      if (nextKey.key) {
        const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()
        document.cookie = `sessionKey=${encodeURIComponent(nextKey.key)}; domain=.claude.ai; path=/; expires=${expires}; secure; samesite=lax`
      }

      // 5. 更新存储中的当前 Key ID
      if (storageData?.state) {
        storageData.state.currentKeyId = nextKey.id
        GM_setValue("claudeSessionKeys", storageData)
      }

      // 6. 跳转到首页
      location.href = "https://claude.ai/"

      return { success: true, keyName: nextKey.name }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  },
}
