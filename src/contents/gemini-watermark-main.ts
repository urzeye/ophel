import type { PlasmoCSConfig } from "plasmo"

import {
  GEMINI_EXPORT_CAPTURE_START_MESSAGE,
  GEMINI_EXPORT_CAPTURE_STOP_MESSAGE,
  GEMINI_EXPORT_CAPTURING_ATTR,
  GEMINI_EXPORT_IMAGE_CAPTURED_MESSAGE,
} from "~core/gemini-export-image-bridge"
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

  // ---------- 导出全尺寸图片捕获 ----------
  // 导出时适配器为每张生成图模拟点击站点原生“下载完整尺寸的图片”按钮，并开启
  // 一个捕获窗口。窗口内从原生下载链路（fetch 响应、createObjectURL、下载 anchor）
  // 收集候选 blob，解码校验像素尺寸严格大于页面预览后才回发 CAPTURED 消息；
  // 预览图等不合格候选一律丢弃，失败不回发消息，由适配器超时回退。
  type ImageCaptureWindow = {
    captureId: string
    minWidth: number
    minHeight: number
    resolved: boolean
  }

  let imageCaptureWindow: ImageCaptureWindow | null = null
  const captureObjectUrlBlobs = new Map<string, Blob>()

  const isExportCaptureActive = (): boolean =>
    document.documentElement.getAttribute(GEMINI_EXPORT_CAPTURING_ATTR) === "1"

  const isLikelyFullSizeDownloadUrl = (url: string): boolean =>
    url.includes("/rd-gg/") || url.includes("-d-I") || url.includes("=s0-d") || url.includes("=d-I")

  const blobToDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve((reader.result as string) || "")
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })

  const rememberCaptureObjectUrlBlob = (url: string, blob: Blob) => {
    captureObjectUrlBlobs.set(url, blob)
    while (captureObjectUrlBlobs.size > 16) {
      const oldestKey = captureObjectUrlBlobs.keys().next().value
      if (!oldestKey) break
      captureObjectUrlBlobs.delete(oldestKey)
    }
  }

  const submitCaptureCandidate = async (blob: Blob) => {
    const activeWindow = imageCaptureWindow
    if (!activeWindow || activeWindow.resolved) return

    let width = 0
    let height = 0
    try {
      const bitmap = await createImageBitmap(blob)
      width = bitmap.width
      height = bitmap.height
      bitmap.close()
    } catch {
      return
    }

    if (imageCaptureWindow !== activeWindow || activeWindow.resolved) return
    if (width <= activeWindow.minWidth || height <= activeWindow.minHeight) return

    activeWindow.resolved = true
    try {
      const imageBlob = blob.type.startsWith("image/")
        ? blob
        : new Blob([blob], { type: "image/png" })
      const dataUrl = await blobToDataUrl(imageBlob)
      if (!dataUrl.startsWith("data:image/")) {
        activeWindow.resolved = false
        return
      }
      window.postMessage(
        {
          type: GEMINI_EXPORT_IMAGE_CAPTURED_MESSAGE,
          captureId: activeWindow.captureId,
          dataUrl,
          width,
          height,
        },
        "*",
      )
    } catch {
      activeWindow.resolved = false
    }
  }

  const handleSuppressedDownloadAnchor = (anchor: HTMLAnchorElement) => {
    const href = anchor.href || anchor.getAttribute("href") || ""
    if (!href) return

    if (href.startsWith("blob:")) {
      const knownBlob = captureObjectUrlBlobs.get(href)
      if (knownBlob) {
        void submitCaptureCandidate(knownBlob)
        return
      }
    }

    if (/^(?:blob:|data:|https?:)/i.test(href)) {
      originalFetch(href, { credentials: "include" })
        .then((response) =>
          response.ok ? response.blob() : Promise.reject(new Error(`HTTP ${response.status}`)),
        )
        .then((blob) => submitCaptureCandidate(blob))
        .catch(() => {
          // 候选获取失败保持静默，等待窗口内其他捕获来源或适配器超时回退。
        })
    }
  }
  // ---------------------------------------

  window.fetch = async function (...args: Parameters<typeof fetch>) {
    const requestUrl = getRequestUrl(args[0])

    if (imageCaptureWindow && requestUrl && isLikelyFullSizeDownloadUrl(requestUrl)) {
      const response = await originalFetch(...args)
      if (response.ok) {
        response
          .clone()
          .blob()
          .then((blob) => submitCaptureCandidate(blob))
          .catch(() => {
            // 读取响应副本失败不影响页面自身的下载流程。
          })
      }
      return response
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

  const originalCreateObjectURL = URL.createObjectURL.bind(URL)
  URL.createObjectURL = function (object: Blob | MediaSource): string {
    const url = originalCreateObjectURL(object)
    if (isExportCaptureActive() && object instanceof Blob) {
      rememberCaptureObjectUrlBlob(url, object)
      void submitCaptureCandidate(object)
    }
    return url
  }

  const originalAnchorClick = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (isExportCaptureActive()) {
      handleSuppressedDownloadAnchor(this)
      return
    }
    return originalAnchorClick.call(this)
  }

  // 页面对（可能已脱离文档的）下载 anchor 直接 dispatchEvent(click) 时不会经过
  // document 监听，也不会调用 click()；这里补齐拦截，避免捕获期间触发真实下载。
  const originalAnchorDispatchEvent = HTMLAnchorElement.prototype.dispatchEvent
  HTMLAnchorElement.prototype.dispatchEvent = function (
    this: HTMLAnchorElement,
    event: Event,
  ): boolean {
    if (isExportCaptureActive() && event?.type === "click") {
      handleSuppressedDownloadAnchor(this)
      return false
    }
    return originalAnchorDispatchEvent.call(this, event)
  }

  const captureClickListener = (event: MouseEvent) => {
    if (!isExportCaptureActive()) return
    const target = event.target
    const anchor = target instanceof Element ? target.closest("a") : null
    if (anchor instanceof HTMLAnchorElement) {
      event.preventDefault()
      event.stopImmediatePropagation()
      handleSuppressedDownloadAnchor(anchor)
    }
  }
  document.addEventListener("click", captureClickListener, true)

  window.addEventListener("message", (event) => {
    if (event.source !== window) return

    if (event.data?.type === GEMINI_EXPORT_CAPTURE_START_MESSAGE) {
      const captureId = typeof event.data.captureId === "string" ? event.data.captureId : ""
      if (!captureId) return
      const minWidth = Number(event.data.minWidth)
      const minHeight = Number(event.data.minHeight)
      imageCaptureWindow = {
        captureId,
        minWidth: Number.isFinite(minWidth) && minWidth > 0 ? minWidth : 0,
        minHeight: Number.isFinite(minHeight) && minHeight > 0 ? minHeight : 0,
        resolved: false,
      }
      return
    }

    if (event.data?.type === GEMINI_EXPORT_CAPTURE_STOP_MESSAGE) {
      const captureId = typeof event.data.captureId === "string" ? event.data.captureId : ""
      if (!captureId) {
        imageCaptureWindow = null
        captureObjectUrlBlobs.clear()
        return
      }
      if (imageCaptureWindow?.captureId === captureId) {
        imageCaptureWindow = null
      }
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
