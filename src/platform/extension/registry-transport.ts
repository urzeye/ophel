import type { RegistryTransport } from "~core/remote-config-types"

const REGISTRY_REQUEST_TIMEOUT_MS = 15_000

export const extensionRegistryTransport: RegistryTransport = async (url, maxBytes) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REGISTRY_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Registry request failed: HTTP ${response.status} ${response.statusText}`)
    }
    const contentLength = Number(response.headers.get("content-length"))
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`Registry response exceeds ${maxBytes} bytes`)
    }
    if (!response.body) {
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength > maxBytes) {
        throw new Error(`Registry response exceeds ${maxBytes} bytes`)
      }
      return bytes
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        controller.abort()
        throw new Error(`Registry response exceeds ${maxBytes} bytes`)
      }
      chunks.push(value)
    }

    const result = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.byteLength
    }
    return result
  } finally {
    clearTimeout(timeoutId)
  }
}
