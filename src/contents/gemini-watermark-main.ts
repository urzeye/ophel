import type { PlasmoCSConfig } from "plasmo"
import {
  isGeminiGeneratedImageUrl,
  normalizeGeminiImageUrl,
} from "~core/watermark/gemini-asset-url"

const OPHEL_WATERMARK_FETCH_TOGGLE = "OPHEL_WATERMARK_FETCH_TOGGLE"
const OPHEL_WATERMARK_PROCESS_REQUEST = "OPHEL_WATERMARK_PROCESS_REQUEST"
const OPHEL_WATERMARK_PROCESS_RESPONSE = "OPHEL_WATERMARK_PROCESS_RESPONSE"

export const config: PlasmoCSConfig = {
  matches: ["https://gemini.google.com/*"],
  world: "MAIN",
  run_at: "document_start",
}

if (!window.__ophelGeminiWatermarkMainInitialized) {
  window.__ophelGeminiWatermarkMainInitialized = true
  document.documentElement.setAttribute("data-ophel-wm-main", "1")
  document.documentElement.setAttribute("data-ophel-wm-main-fetch-enabled", "0")

  let watermarkFetchEnabled = false
  let watermarkRequestCounter = 0

  const pendingWatermarkRequests = new Map<
    string,
    {
      resolve: (dataUrl: string) => void
      reject: (error?: unknown) => void
      timeoutId: number
    }
  >()

  const clearPendingWatermarkRequests = (reason: string) => {
    for (const [requestId, request] of pendingWatermarkRequests.entries()) {
      window.clearTimeout(request.timeoutId)
      request.reject(new Error(reason))
      pendingWatermarkRequests.delete(requestId)
    }
  }

  const getRequestUrl = (input: unknown): string => {
    if (typeof input === "string") return input
    if (input && typeof input === "object" && "url" in input) {
      const requestLike = input as { url?: unknown }
      if (typeof requestLike.url === "string") return requestLike.url
    }
    return ""
  }

  const requestProcessedDataUrl = async (payload: {
    url: string
    blob?: Blob
  }): Promise<string> => {
    const requestId = `ophel-wm-${Date.now()}-${watermarkRequestCounter++}`
    let arrayBuffer: ArrayBuffer | undefined
    let mimeType = ""

    if (payload.blob) {
      arrayBuffer = await payload.blob.arrayBuffer()
      mimeType = payload.blob.type || ""
    }

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        pendingWatermarkRequests.delete(requestId)
        reject(new Error("Watermark process timeout"))
      }, 30000)

      pendingWatermarkRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
      })

      window.postMessage(
        {
          type: OPHEL_WATERMARK_PROCESS_REQUEST,
          requestId,
          url: payload.url,
          arrayBuffer,
          mimeType,
        },
        "*",
        arrayBuffer ? [arrayBuffer] : undefined,
      )
    })
  }

  const originalFetch = window.fetch.bind(window)
  window.fetch = async function (...args: Parameters<typeof fetch>) {
    const requestUrl = getRequestUrl(args[0])

    if (
      isImageCaptureActive() &&
      requestUrl &&
      (requestUrl.includes("/rd-gg/") ||
        requestUrl.includes("-d-I") ||
        requestUrl.includes("=s0-d") ||
        requestUrl.includes("=d-I"))
    ) {
      try {
        const resp = await originalFetch(...args)
        if (resp.ok) {
          const cloned = resp.clone()
          cloned.blob().then(async (blob) => {
            if (blob.type.startsWith("image/") || blob.size > 20000) {
              const reader = new FileReader()
              reader.onloadend = () => {
                const dataUrl = (reader.result as string) || ""
                if (dataUrl) {
                  window.postMessage(
                    {
                      type: OPHEL_GEMINI_IMAGE_CAPTURED,
                      href: requestUrl,
                      dataUrl,
                    },
                    "*",
                  )
                }
              }
              reader.readAsDataURL(blob)
            }
          })
        }
        return resp
      } catch {
        // Continue to normal flow
      }
    }

    if (!watermarkFetchEnabled) {
      return originalFetch(...args)
    }

    if (!requestUrl || !isGeminiGeneratedImageUrl(requestUrl)) {
      return originalFetch(...args)
    }

    const normalizedUrl = normalizeGeminiImageUrl(requestUrl)

    const nextArgs = [...args] as Parameters<typeof fetch>
    if (typeof nextArgs[0] === "string") {
      nextArgs[0] = normalizedUrl as any
    } else if (nextArgs[0] instanceof Request) {
      nextArgs[0] = new Request(normalizedUrl, nextArgs[0]) as any
    }

    let originalResponse: Response | null = null
    let originalBlob: Blob | null = null

    try {
      originalResponse = await originalFetch(...nextArgs)
      if (!originalResponse.ok) {
        return originalResponse
      }

      originalBlob = await originalResponse.blob()

      const processedDataUrl = await requestProcessedDataUrl({
        url: normalizedUrl,
        blob: originalBlob,
      })

      const processedResponse = await originalFetch(processedDataUrl)
      const processedBlob = await processedResponse.blob()

      return new Response(processedBlob, {
        status: originalResponse.status,
        statusText: originalResponse.statusText,
        headers: new Headers({
          "Content-Type": processedBlob.type || "image/png",
        }),
      })
    } catch {
      if (originalResponse && originalBlob) {
        return new Response(originalBlob, {
          status: originalResponse.status,
          statusText: originalResponse.statusText,
          headers: originalResponse.headers,
        })
      }

      return originalFetch(...args)
    }
  }

  const OPHEL_GEMINI_CAPTURE_START = "OPHEL_GEMINI_CAPTURE_START"
  const OPHEL_GEMINI_CAPTURE_STOP = "OPHEL_GEMINI_CAPTURE_STOP"
  const OPHEL_GEMINI_IMAGE_CAPTURED = "OPHEL_GEMINI_IMAGE_CAPTURED"

  let isImageCaptureActiveFlag = false

  const isImageCaptureActive = (): boolean => {
    return (
      isImageCaptureActiveFlag ||
      document.documentElement.getAttribute("data-ophel-export-capturing") === "1"
    )
  }

  const handleCapturedAnchor = async (anchor: HTMLAnchorElement) => {
    const href = anchor.href || anchor.getAttribute("href") || ""
    const filename = anchor.download || anchor.getAttribute("download") || ""
    let dataUrl = ""

    if (href.startsWith("data:")) {
      dataUrl = href
    } else if (href) {
      try {
        const resp = await originalFetch(href)
        if (resp.ok) {
          const blob = await resp.blob()
          const reader = new FileReader()
          dataUrl = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve((reader.result as string) || "")
            reader.onerror = () => resolve("")
            reader.readAsDataURL(blob)
          })
        }
      } catch {
        // fallback
      }
    }

    window.postMessage(
      {
        type: OPHEL_GEMINI_IMAGE_CAPTURED,
        href,
        filename,
        dataUrl,
      },
      "*",
    )
  }

  const originalCreateObjectURL = URL.createObjectURL.bind(URL)
  URL.createObjectURL = function (object: Blob | MediaSource): string {
    const url = originalCreateObjectURL(object)
    if (
      isImageCaptureActive() &&
      object instanceof Blob &&
      (object.type.startsWith("image/") || object.size > 20000)
    ) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const dataUrl = (reader.result as string) || ""
        if (dataUrl) {
          window.postMessage(
            {
              type: OPHEL_GEMINI_IMAGE_CAPTURED,
              href: url,
              dataUrl,
            },
            "*",
          )
        }
      }
      reader.readAsDataURL(object)
    }
    return url
  }

  const originalAnchorClick = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (isImageCaptureActive()) {
      handleCapturedAnchor(this)
      return
    }
    return originalAnchorClick.call(this)
  }

  const captureClickListener = (event: MouseEvent) => {
    if (!isImageCaptureActive()) return
    const anchor = (event.target as Element)?.closest?.("a")
    if (anchor instanceof HTMLAnchorElement) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      handleCapturedAnchor(anchor)
    }
  }
  document.addEventListener("click", captureClickListener, true)

  window.addEventListener("message", (event) => {
    if (event.source !== window) return

    if (event.data?.type === OPHEL_GEMINI_CAPTURE_START) {
      isImageCaptureActiveFlag = true
      document.documentElement.setAttribute("data-ophel-export-capturing", "1")
      return
    }

    if (event.data?.type === OPHEL_GEMINI_CAPTURE_STOP) {
      isImageCaptureActiveFlag = false
      document.documentElement.removeAttribute("data-ophel-export-capturing")
      return
    }

    if (event.data?.type === OPHEL_WATERMARK_FETCH_TOGGLE) {
      watermarkFetchEnabled = !!event.data.enabled
      document.documentElement.setAttribute(
        "data-ophel-wm-main-fetch-enabled",
        watermarkFetchEnabled ? "1" : "0",
      )
      if (!watermarkFetchEnabled) {
        clearPendingWatermarkRequests("Watermark interceptor disabled")
      }
      return
    }

    if (event.data?.type === OPHEL_WATERMARK_PROCESS_RESPONSE) {
      const requestId = event.data.requestId
      if (!requestId || !pendingWatermarkRequests.has(requestId)) return

      const pending = pendingWatermarkRequests.get(requestId)
      if (!pending) return

      pendingWatermarkRequests.delete(requestId)
      window.clearTimeout(pending.timeoutId)

      if (event.data.success && typeof event.data.dataUrl === "string") {
        pending.resolve(event.data.dataUrl)
      } else {
        pending.reject(new Error(event.data.error || "Watermark process failed"))
      }
    }
  })
}
