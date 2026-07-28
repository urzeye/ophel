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
    let settled = false
    let request: { abort(): void } | undefined
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      reject(error instanceof Error ? error : new Error(String(error)))
    }

    request = GM_xmlhttpRequest({
      url,
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
