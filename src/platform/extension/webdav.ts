import type { WebDAVTransport, WebDAVAction, WebDAVConfig, SyncResult } from "~types/webdav"
import { MSG_WEBDAV_ACTION, MSG_WEBDAV_REQUEST } from "~utils/messaging"

export const fetchWebDAV: WebDAVTransport = async (method, url, body, headers) => {
  const response = await fetch(url, {
    method,
    body: body || undefined,
    headers,
    signal: AbortSignal.timeout(25_000),
  })
  // Consume the body before returning, so stalled downloads are bounded by the same timeout.
  const text = await response.text()
  return new Response(text || null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

export const extensionWebDAV = {
  request: (async (method, url, body, headers) => {
    const result = await chrome.runtime.sendMessage({
      type: MSG_WEBDAV_REQUEST,
      method,
      url,
      body,
      headers,
    })
    if (!result?.success) throw new Error(result?.error || "WebDAV request failed")
    return new Response(result.body || null, {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
    })
  }) as WebDAVTransport,
  async runAction(
    action: WebDAVAction,
    config: WebDAVConfig,
    fileName?: string,
  ): Promise<SyncResult> {
    const result = await chrome.runtime.sendMessage({
      type: MSG_WEBDAV_ACTION,
      action,
      config,
      fileName,
    })
    if (!result || typeof result.success !== "boolean")
      throw new Error("WebDAV action returned no result")
    return result
  },
}
