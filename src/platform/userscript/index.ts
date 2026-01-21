/**
 * Platform Implementation - Userscript (Tampermonkey/Violentmonkey)
 *
 * 油猴脚本平台实现，使用 GM_* API
 */

import type {
  FetchOptions,
  FetchResponse,
  NotifyOptions,
  Platform,
  PlatformCapability,
  PlatformStorage,
} from "../types"

// GM API 扩展声明
declare const GM_info: {
  script: {
    version: string
  }
}

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
    ]
    return !unsupported.includes(cap)
  },
}
