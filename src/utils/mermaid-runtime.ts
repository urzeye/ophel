import { setSafeScriptSrc } from "~utils/trusted-types"

const REQUEST_EVENT = "OPHEL_ASSISTANT_MERMAID_RENDER_REQUEST"
const RESPONSE_EVENT = "OPHEL_ASSISTANT_MERMAID_RENDER_RESPONSE"
const TIMEOUT_MS = 15000
let runtimePromise: Promise<void> | null = null

function injectScript(src: string, marker: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-ophel-runtime="${marker}"]`,
    )
    if (existing?.dataset.loaded === "true") return resolve()
    const script = existing || document.createElement("script")
    const finish = (error?: Error) => {
      clearTimeout(timer)
      script.removeEventListener("load", onLoad)
      script.removeEventListener("error", onError)
      if (error) {
        script.remove()
        reject(error)
      } else {
        script.dataset.loaded = "true"
        resolve()
      }
    }
    const onLoad = () => finish()
    const onError = () => finish(new Error(`Failed to load script: ${src}`))
    const timer = setTimeout(() => finish(new Error("Mermaid runtime load timed out")), TIMEOUT_MS)
    script.addEventListener("load", onLoad, { once: true })
    script.addEventListener("error", onError, { once: true })
    try {
      script.dataset.ophelRuntime = marker
      script.async = false
      if (!existing) {
        if (!setSafeScriptSrc(script, src)) throw new Error("Failed to set trusted script src")
        ;(document.head || document.documentElement).appendChild(script)
      }
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export function ensureMermaidRuntime(): Promise<void> {
  if (document.documentElement.getAttribute("data-ophel-assistant-mermaid-runner") === "1") {
    return Promise.resolve()
  }
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const userscript = typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"
      const urls = window.__OPHEL_USERSCRIPT_ASSET_URLS__
      const vendor = userscript
        ? urls?.assistantMermaidVendor
        : chrome.runtime.getURL("assets/assistant-mermaid-vendor.js")
      const runner = userscript
        ? urls?.assistantMermaidRunner
        : chrome.runtime.getURL("assets/assistant-mermaid-runner.js")
      if (!vendor || !runner) throw new Error("Assistant Mermaid runtime asset URL is unavailable")
      await injectScript(vendor, "ophel-assistant-mermaid-vendor")
      await injectScript(runner, "ophel-assistant-mermaid-runner")
      if (document.documentElement.getAttribute("data-ophel-assistant-mermaid-runner") !== "1") {
        throw new Error("Assistant Mermaid runner did not initialize")
      }
    })().catch((error) => {
      runtimePromise = null
      throw error
    })
  }
  return runtimePromise
}

export function requestMermaidRender(
  request: {
    requestId: string
    previewId: string
    source: string
    theme: "default" | "dark"
    exportImage?: boolean
  },
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      window.removeEventListener("message", onMessage)
      signal?.removeEventListener("abort", onAbort)
    }
    const onAbort = () => {
      cleanup()
      reject(signal?.reason || new DOMException("Aborted", "AbortError"))
    }
    const onMessage = (event: MessageEvent) => {
      const payload = event.data
      // 油猴沙箱的 event.source 可能是页面 window 的代理，按唯一请求标识匹配。
      if (payload?.type !== RESPONSE_EVENT || payload.requestId !== request.requestId) return
      cleanup()
      if (payload.success === true) resolve()
      else reject(new Error(payload.error || "Mermaid render failed"))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error("Assistant Mermaid render timed out"))
    }, TIMEOUT_MS)
    window.addEventListener("message", onMessage)
    signal?.addEventListener("abort", onAbort, { once: true })
    window.postMessage({ type: REQUEST_EVENT, ...request }, "*")
  })
}
