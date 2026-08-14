import type { RegistryTransport } from "~core/remote-config-types"

const REGISTRY_REQUEST_TIMEOUT_MS = 15_000

declare function GM_xmlhttpRequest(details: {
  url: string
  method: "GET"
  headers: Record<string, string>
  responseType: "arraybuffer"
  anonymous: boolean
  timeout: number
  onload: (response: { status: number; statusText: string; response: ArrayBuffer | null }) => void
  onprogress: (response: { loaded: number }) => void
  onerror: (error: unknown) => void
  ontimeout: () => void
}): { abort(): void }

export const userscriptRegistryTransport: RegistryTransport = (url, maxBytes) =>
  new Promise((resolve, reject) => {
    // jsDelivr 对 branch URL 下发 max-age=604800 的缓存头，GM_xmlhttpRequest 会走浏览器
    // HTTP 缓存，陈旧索引最长可残留 7 天；jsDelivr 忽略 query，而浏览器按完整 URL 缓存，
    // 追加时间戳参数即可绕过（扩展端 fetch 用 cache: "no-store" 解决同一问题）
    const requestUrl = `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`
    let settled = false
    let request: { abort(): void } | undefined
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      reject(error instanceof Error ? error : new Error(String(error)))
    }

    request = GM_xmlhttpRequest({
      url: requestUrl,
      method: "GET",
      headers: { Accept: "application/json" },
      responseType: "arraybuffer",
      anonymous: true,
      timeout: REGISTRY_REQUEST_TIMEOUT_MS,
      onload(response) {
        if (settled) return
        if (response.status < 200 || response.status >= 300) {
          fail(
            new Error(
              `Registry request failed: HTTP ${response.status} ${response.statusText}`.trim(),
            ),
          )
          return
        }
        if (!(response.response instanceof ArrayBuffer)) {
          fail(new Error("Registry request returned no binary response"))
          return
        }
        if (response.response.byteLength > maxBytes) {
          fail(new Error(`Registry response exceeds ${maxBytes} bytes`))
          return
        }
        settled = true
        resolve(new Uint8Array(response.response))
      },
      onprogress(response) {
        if (response.loaded > maxBytes) {
          fail(new Error(`Registry response exceeds ${maxBytes} bytes`))
          request?.abort()
        }
      },
      onerror(error) {
        fail(error)
      },
      ontimeout() {
        fail(new Error(`Registry request timed out after ${REGISTRY_REQUEST_TIMEOUT_MS}ms`))
      },
    })
  })
