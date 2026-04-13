import { MSG_PROXY_FETCH, sendToBackground } from "~utils/messaging"
import { t } from "~utils/i18n"

// 平台检测
declare const __PLATFORM__: "extension" | "userscript" | undefined
const isUserscript = typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"
declare const unsafeWindow: Window | undefined

const OPHEL_WATERMARK_FETCH_TOGGLE = "OPHEL_WATERMARK_FETCH_TOGGLE"
const OPHEL_WATERMARK_PROCESS_REQUEST = "OPHEL_WATERMARK_PROCESS_REQUEST"
const OPHEL_WATERMARK_PROCESS_RESPONSE = "OPHEL_WATERMARK_PROCESS_RESPONSE"
const GEMINI_GOOGLEUSERCONTENT_HOST_PATTERN = /^https:\/\/lh3\.googleusercontent\.com\//i
const OPHEL_WATERMARK_LOADING_STYLE_ID = "ophel-watermark-loading-style"
const WATERMARK_NOT_DETECTED_ERROR = "watermark-not-detected"
const GEMINI_IMAGE_LOADING_HOST_SELECTOR = [
  "[data-image-attachment-index]",
  "single-image.generated-image",
  "generated-image",
  ".generated-image-container",
  ".image-container.replace-fife-images-at-export",
].join(", ")

type GeminiImageAction = "copy" | "download"
type WatermarkConfig = {
  logoSize: 48 | 96
  marginRight: number
  marginBottom: number
}
type WatermarkPosition = {
  x: number
  y: number
  width: number
  height: number
}
type WatermarkDetectionMetrics = {
  insideMean: number
  outsideMean: number
  score: number
  normalizedScore: number
}

// 油猴脚本的 GM_xmlhttpRequest 声明
declare function GM_xmlhttpRequest(details: {
  method: string
  url: string
  headers?: Record<string, string>
  responseType?: string
  onload?: (response: any) => void
  onerror?: (error: any) => void
}): void

async function fetchImageAsBlob(url: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url,
      headers: {
        Referer: "https://gemini.google.com/",
        Origin: "https://gemini.google.com",
      },
      responseType: "blob",
      onload: (response) => {
        if (response.status >= 200 && response.status < 300) {
          resolve(response.response as Blob)
        } else {
          reject(new Error(`HTTP ${response.status}`))
        }
      },
      onerror: (error) => reject(new Error(error?.message || "GM_xmlhttpRequest failed")),
    })
  })
}

/**
 * Watermark Remover
 * 原理参考: https://greasyfork.org/scripts/559574
 */
export class WatermarkRemover {
  static WATERMARK_BG_PATHS: Record<48 | 96, string> = {
    48: "assets/userscript/ophel-watermark-bg-48.png",
    96: "assets/userscript/ophel-watermark-bg-96.png",
  }

  static WATERMARK_CONFIGS: Record<48 | 96, WatermarkConfig> = {
    48: { logoSize: 48, marginRight: 32, marginBottom: 32 },
    96: { logoSize: 96, marginRight: 64, marginBottom: 64 },
  }
  static ALPHA_THRESHOLD = 0.002
  static MAX_ALPHA = 0.99
  static LOGO_VALUE = 255
  static DETECTION_MIN_SCORE = 0.012
  static DETECTION_MIN_NORMALIZED_SCORE = 0.09
  private alphaMaps: Record<number, Float32Array> = {}
  private bgImages: Record<number, HTMLImageElement> = {}
  private processingQueue = new Set<string>()
  private processingMap = new Map<string, Promise<string>>()
  private processedDataUrlCache = new Map<string, string>()
  private enabled = false
  private stopObserver: (() => void) | null = null
  private mainWorldMessageListener: ((event: MessageEvent) => void) | null = null
  private actionButtonListener: ((event: MouseEvent) => void) | null = null
  private userscriptOriginalFetch: typeof fetch | null = null

  constructor() {
    this.alphaMaps = {}
    this.bgImages = {}
    this.processingQueue = new Set()
    this.processingMap = new Map()
    this.processedDataUrlCache = new Map()
  }

  start() {
    if (this.enabled) return
    this.enabled = true

    if (!isUserscript) {
      this.setupMainWorldBridge()
      this.toggleMainWorldFetchInterception(true)
      this.setupActionButtonInterception()
    }

    if (isUserscript) {
      this.enableUserscriptFetchInterception()
    }

    this.processExistingImages()
    this.startObserver()
  }

  stop() {
    if (!this.enabled) return
    this.enabled = false

    if (!isUserscript) {
      this.toggleMainWorldFetchInterception(false)
      this.teardownMainWorldBridge()
    }

    this.disableUserscriptFetchInterception()
    this.teardownActionButtonInterception()
    this.processingMap.clear()
    this.processingQueue.clear()
    this.clearAllProcessingIndicators()
    this.removeProcessingIndicatorStyles()

    if (this.stopObserver) {
      this.stopObserver()
      this.stopObserver = null
    }
  }

  private isGeminiStandardSite(): boolean {
    return window.location.hostname === "gemini.google.com"
  }

  private shouldInterceptGeminiImageUrl(url: string): boolean {
    return GEMINI_GOOGLEUSERCONTENT_HOST_PATTERN.test(url)
  }

  private isLikelyGeneratedImage(img: HTMLImageElement): boolean {
    const source = img.currentSrc || img.src || ""
    if (!source) return false

    const naturalWidth = img.naturalWidth || img.width || 0
    const naturalHeight = img.naturalHeight || img.height || 0

    if (naturalWidth < 192 || naturalHeight < 192) return false

    return (
      this.shouldInterceptGeminiImageUrl(source) ||
      source.startsWith("data:image/") ||
      source.startsWith("blob:")
    )
  }

  private isSupportedGeminiImageSource(source: string): boolean {
    if (!source) return false
    return (
      this.shouldInterceptGeminiImageUrl(source) ||
      source.startsWith("data:image/") ||
      source.startsWith("blob:")
    )
  }

  private getImageSourceForAction(img: HTMLImageElement): string {
    const storedSource = img.getAttribute("data-ophel-wm-source") || ""
    if (storedSource) return storedSource

    const currentSource = img.currentSrc || img.src || ""
    return currentSource
  }

  private normalizePossibleUrl(value: string): string {
    if (!value) return ""
    if (value.startsWith("data:image/") || value.startsWith("blob:")) {
      return value
    }
    try {
      return new URL(value, window.location.href).toString()
    } catch {
      return value
    }
  }

  private getNormalizedGeminiPath(pathname = window.location.pathname): string {
    return pathname.replace(/^\/u\/\d+/, "")
  }

  private isGeminiConversationPath(pathname = this.getNormalizedGeminiPath()): boolean {
    return pathname === "/app" || pathname === "/app/" || pathname.startsWith("/app/")
  }

  private getWatermarkConfigBySize(size: 48 | 96): WatermarkConfig {
    return { ...WatermarkRemover.WATERMARK_CONFIGS[size] }
  }

  private shouldUseConversationPreviewWatermark(sourceUrl?: string): boolean {
    // /app 会话里的 preview 图仍可能走 48px 水印布局，不能再只按画布尺寸硬猜。
    if (!sourceUrl || !this.isGeminiConversationPath()) return false

    const normalizedSource = this.normalizePossibleUrl(sourceUrl)
    if (!this.shouldInterceptGeminiImageUrl(normalizedSource)) return false

    return normalizedSource.includes("/gg/")
  }

  private shouldSkipAutoProcessingSource(source: string): boolean {
    if (!source.startsWith("blob:") && !source.startsWith("data:image/")) {
      return false
    }

    if (isUserscript) {
      // userscript 的 /app 会话图大多已经变成 blob:，这里不能再直接跳过，
      // 否则会话缩略图与放大图都没有机会进入自动去水印流程。
      if (source.startsWith("blob:") && this.isGeminiConversationPath()) {
        return false
      }

      return this.userscriptOriginalFetch !== null
    }

    return this.isGeminiStandardSite()
  }

  private ensureProcessingIndicatorStyles() {
    if (document.getElementById(OPHEL_WATERMARK_LOADING_STYLE_ID)) return
    if (!document.head) return

    const style = document.createElement("style")
    style.id = OPHEL_WATERMARK_LOADING_STYLE_ID
    style.textContent = `
      [data-ophel-wm-loading="1"] {
        isolation: isolate;
      }

      .ophel-wm-loading-indicator {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.72);
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.22);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        pointer-events: none;
        z-index: 2;
      }

      .ophel-wm-loading-indicator::after {
        content: "";
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.35);
        border-top-color: rgba(255, 255, 255, 1);
        animation: ophel-wm-loading-spin 0.72s linear infinite;
      }

      @keyframes ophel-wm-loading-spin {
        from {
          transform: rotate(0deg);
        }

        to {
          transform: rotate(360deg);
        }
      }
    `

    document.head.appendChild(style)
  }

  private removeProcessingIndicatorStyles() {
    document.getElementById(OPHEL_WATERMARK_LOADING_STYLE_ID)?.remove()
  }

  private findProcessingIndicatorHost(img: HTMLImageElement): HTMLElement | null {
    const host = img.closest(GEMINI_IMAGE_LOADING_HOST_SELECTOR)
    if (host instanceof HTMLElement) return host
    if (img.parentElement instanceof HTMLElement) return img.parentElement
    return img
  }

  private restoreProcessingIndicatorHost(host: HTMLElement) {
    host.removeAttribute("data-ophel-wm-loading")
    host.removeAttribute("data-ophel-wm-loading-count")
    host.querySelector(".ophel-wm-loading-indicator")?.remove()

    if (host.dataset.ophelWmLoadingManagedPosition === "1") {
      host.style.position = host.dataset.ophelWmLoadingOriginalPosition || ""
      delete host.dataset.ophelWmLoadingManagedPosition
      delete host.dataset.ophelWmLoadingOriginalPosition
    }
  }

  private showImageProcessingIndicator(img: HTMLImageElement): HTMLElement | null {
    const host = this.findProcessingIndicatorHost(img)
    if (!host) return null

    this.ensureProcessingIndicatorStyles()

    const currentCount = Number(host.dataset.ophelWmLoadingCount || "0")
    if (currentCount <= 0) {
      if (window.getComputedStyle(host).position === "static") {
        host.dataset.ophelWmLoadingManagedPosition = "1"
        host.dataset.ophelWmLoadingOriginalPosition = host.style.position || ""
        host.style.position = "relative"
      }

      host.setAttribute("data-ophel-wm-loading", "1")

      const indicator = document.createElement("div")
      indicator.className = "ophel-wm-loading-indicator"
      indicator.setAttribute("aria-hidden", "true")
      indicator.title = t("watermarkProcessing") || "Processing image..."
      host.appendChild(indicator)
    }

    host.dataset.ophelWmLoadingCount = String(Math.max(0, currentCount) + 1)
    return host
  }

  private hideImageProcessingIndicator(host: HTMLElement | null) {
    if (!host) return

    const currentCount = Number(host.dataset.ophelWmLoadingCount || "0")
    if (currentCount > 1) {
      host.dataset.ophelWmLoadingCount = String(currentCount - 1)
      return
    }

    this.restoreProcessingIndicatorHost(host)
  }

  private clearAllProcessingIndicators() {
    document.querySelectorAll<HTMLElement>('[data-ophel-wm-loading="1"]').forEach((host) => {
      this.restoreProcessingIndicatorHost(host)
    })
  }

  private extractSupportedUrlFromNode(node: Element): string {
    const remoteCandidates: string[] = []
    const blobCandidates: string[] = []
    const dataCandidates: string[] = []

    const collectCandidate = (rawValue: string) => {
      if (!rawValue) return
      const directSource = this.normalizePossibleUrl(rawValue)
      if (this.isSupportedGeminiImageSource(directSource)) {
        if (this.shouldInterceptGeminiImageUrl(directSource)) {
          remoteCandidates.push(directSource)
        } else if (directSource.startsWith("blob:")) {
          blobCandidates.push(directSource)
        } else if (directSource.startsWith("data:image/")) {
          dataCandidates.push(directSource)
        }
      }

      const embeddedRemoteUrls = rawValue.match(
        /https?:\/\/[^\s"'<>]*googleusercontent\.com[^\s"'<>]*/gi,
      )
      if (!embeddedRemoteUrls || embeddedRemoteUrls.length === 0) return

      for (const embeddedUrl of embeddedRemoteUrls) {
        const embeddedSource = this.normalizePossibleUrl(embeddedUrl)
        if (this.shouldInterceptGeminiImageUrl(embeddedSource)) {
          remoteCandidates.push(embeddedSource)
        }
      }
    }

    for (const attr of Array.from(node.attributes)) {
      collectCandidate(attr?.value || "")
    }

    if (node instanceof HTMLAnchorElement && node.href) {
      collectCandidate(node.href)
    }

    if (node instanceof HTMLImageElement) {
      collectCandidate(node.currentSrc || node.src || "")
    }

    return remoteCandidates[0] || blobCandidates[0] || dataCandidates[0] || ""
  }

  private getRequestUrl(input: unknown): string {
    if (typeof input === "string") return input
    if (input && typeof input === "object" && "url" in input) {
      const requestLike = input as { url?: unknown }
      if (typeof requestLike.url === "string") return requestLike.url
    }
    return ""
  }

  private toggleMainWorldFetchInterception(enabled: boolean) {
    if (!this.isGeminiStandardSite()) return
    window.postMessage(
      {
        type: OPHEL_WATERMARK_FETCH_TOGGLE,
        enabled,
      },
      "*",
    )
  }

  private setupMainWorldBridge() {
    if (this.mainWorldMessageListener || !this.isGeminiStandardSite()) return

    this.mainWorldMessageListener = (event: MessageEvent) => {
      if (event.source !== window) return

      const message = event.data as
        | {
            type?: string
            requestId?: string
            url?: string
            arrayBuffer?: ArrayBuffer
            mimeType?: string
          }
        | undefined

      if (!message || message.type !== OPHEL_WATERMARK_PROCESS_REQUEST) return

      const requestId = message.requestId || ""
      const sourceUrl = message.url || ""
      const sourceArrayBuffer = message.arrayBuffer
      const sourceMimeType = message.mimeType || ""
      if (!requestId || !sourceUrl) return

      this.handleMainWorldProcessRequest(requestId, sourceUrl, sourceArrayBuffer, sourceMimeType)
    }

    window.addEventListener("message", this.mainWorldMessageListener)
  }

  private teardownMainWorldBridge() {
    if (!this.mainWorldMessageListener) return
    window.removeEventListener("message", this.mainWorldMessageListener)
    this.mainWorldMessageListener = null
  }

  private postMainWorldProcessResponse(payload: {
    requestId: string
    success: boolean
    dataUrl?: string
    error?: string
  }) {
    window.postMessage(
      {
        type: OPHEL_WATERMARK_PROCESS_RESPONSE,
        ...payload,
      },
      "*",
    )
  }

  private async handleMainWorldProcessRequest(
    requestId: string,
    sourceUrl: string,
    sourceArrayBuffer?: ArrayBuffer,
    sourceMimeType?: string,
  ) {
    if (!this.enabled || !this.shouldInterceptGeminiImageUrl(sourceUrl)) {
      this.postMainWorldProcessResponse({
        requestId,
        success: false,
        error: "Watermark interceptor disabled",
      })
      return
    }

    try {
      const sourceBlob = sourceArrayBuffer
        ? new Blob([sourceArrayBuffer], { type: sourceMimeType || "image/png" })
        : undefined

      const dataUrl = sourceBlob
        ? await this.processImageBlobToDataUrl(sourceBlob, sourceUrl)
        : await this.getProcessedDataUrl(sourceUrl)

      this.postMainWorldProcessResponse({
        requestId,
        success: true,
        dataUrl,
      })
    } catch (error) {
      this.postMainWorldProcessResponse({
        requestId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown processing error",
      })
    }
  }

  private getUserscriptPageWindow(): Window {
    if (typeof unsafeWindow !== "undefined" && unsafeWindow && unsafeWindow !== window) {
      return unsafeWindow
    }
    return window
  }

  private enableUserscriptFetchInterception() {
    if (!isUserscript || this.userscriptOriginalFetch || !this.isGeminiStandardSite()) {
      return
    }

    const pageWindow = this.getUserscriptPageWindow()
    this.userscriptOriginalFetch = pageWindow.fetch.bind(pageWindow)

    pageWindow.fetch = (async (...args: Parameters<typeof fetch>) => {
      const requestUrl = this.getRequestUrl(args[0])
      if (!this.enabled || !requestUrl || !this.shouldInterceptGeminiImageUrl(requestUrl)) {
        return this.userscriptOriginalFetch!.apply(pageWindow, args as any)
      }

      try {
        const dataUrl = await this.getProcessedDataUrl(requestUrl)
        const processedBlob = await this.dataUrlToBlob(dataUrl)
        return new Response(processedBlob, {
          status: 200,
          statusText: "OK",
          headers: new Headers({
            "Content-Type": processedBlob.type || "image/png",
          }),
        })
      } catch {
        return this.userscriptOriginalFetch!.apply(pageWindow, args as any)
      }
    }) as typeof fetch
  }

  private disableUserscriptFetchInterception() {
    if (!isUserscript || !this.userscriptOriginalFetch) return
    const pageWindow = this.getUserscriptPageWindow()
    pageWindow.fetch = this.userscriptOriginalFetch
    this.userscriptOriginalFetch = null
  }

  private setupActionButtonInterception() {
    if (isUserscript || this.actionButtonListener || !this.isGeminiStandardSite()) return

    this.actionButtonListener = (event: MouseEvent) => {
      this.handleActionButtonClick(event)
    }

    document.addEventListener("click", this.actionButtonListener, true)
  }

  private teardownActionButtonInterception() {
    if (!this.actionButtonListener) return
    document.removeEventListener("click", this.actionButtonListener, true)
    this.actionButtonListener = null
  }

  private isActionButtonElement(el: Element, action: GeminiImageAction): boolean {
    const label = [
      el.getAttribute("aria-label") || "",
      el.getAttribute("data-tooltip") || "",
      el.getAttribute("mattooltip") || "",
      el.getAttribute("title") || "",
      (el.textContent || "").trim(),
    ]
      .join(" ")
      .trim()

    const normalized = label.trim().toLowerCase()

    if (action === "copy") {
      return (
        normalized.includes("copy") ||
        normalized.includes("copy image") ||
        normalized.includes("copy full") ||
        normalized.includes("复制") ||
        normalized.includes("複製")
      )
    }

    return (
      normalized.includes("download") ||
      normalized.includes("save image") ||
      normalized.includes("full size") ||
      normalized.includes("下载") ||
      normalized.includes("下載")
    )
  }

  private findImageAction(
    event: MouseEvent,
  ): { action: GeminiImageAction; button: HTMLElement } | null {
    const elementPath = (
      typeof event.composedPath === "function" ? event.composedPath() : []
    ).filter((node): node is Element => node instanceof Element)

    const directTarget = event.target instanceof Element ? event.target : null
    const candidates: HTMLElement[] = []

    if (directTarget) {
      const directCandidate = directTarget.closest("button,[role='button']") as HTMLElement | null
      if (directCandidate) candidates.push(directCandidate)
    }

    for (const node of elementPath) {
      if (
        node instanceof HTMLElement &&
        (node.matches("button") || node.getAttribute("role") === "button")
      ) {
        candidates.push(node)
      }
    }

    const uniqueCandidates = Array.from(new Set(candidates))
    if (uniqueCandidates.length === 0) return null

    for (const candidate of uniqueCandidates) {
      if (this.isActionButtonElement(candidate, "copy")) {
        return { action: "copy", button: candidate }
      }

      if (this.isActionButtonElement(candidate, "download")) {
        return { action: "download", button: candidate }
      }

      for (const descendant of Array.from(
        candidate.querySelectorAll("[aria-label],[data-tooltip],[mattooltip]"),
      )) {
        if (this.isActionButtonElement(descendant, "copy")) {
          return { action: "copy", button: candidate }
        }
        if (this.isActionButtonElement(descendant, "download")) {
          return { action: "download", button: candidate }
        }
      }
    }

    return null
  }

  private findRelatedGeminiImage(button: HTMLElement): HTMLImageElement | null {
    let current: Element | null = button
    for (let i = 0; i < 6 && current; i++) {
      const imageCandidates = Array.from(current.querySelectorAll("img")) as HTMLImageElement[]
      for (const imageInContainer of imageCandidates) {
        const source = this.getImageSourceForAction(imageInContainer)
        if (
          this.isValidGeminiImage(imageInContainer) &&
          this.isSupportedGeminiImageSource(source)
        ) {
          return imageInContainer
        }
      }
      current = current.parentElement
    }

    const rect = button.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const nearestImage = document
      .elementFromPoint(centerX, centerY)
      ?.closest("generated-image, .generated-image-container")

    if (nearestImage) {
      const nearbyImages = Array.from(nearestImage.querySelectorAll("img")) as HTMLImageElement[]
      for (const img of nearbyImages) {
        const source = this.getImageSourceForAction(img)
        if (this.isValidGeminiImage(img) && this.isSupportedGeminiImageSource(source)) {
          return img
        }
      }
    }

    return null
  }

  private findBestVisibleGeminiImage(): HTMLImageElement | null {
    const allCandidates = Array.from(document.querySelectorAll<HTMLImageElement>("img")).filter(
      (img) => {
        if (!this.isValidGeminiImage(img)) return false
        return this.isSupportedGeminiImageSource(this.getImageSourceForAction(img))
      },
    )

    const visibleCandidates = allCandidates.filter((img) => {
      const rect = img.getBoundingClientRect()
      return rect.width > 120 && rect.height > 120 && rect.bottom > 0 && rect.right > 0
    })

    if (visibleCandidates.length === 0) return null

    visibleCandidates.sort((a, b) => {
      const ra = a.getBoundingClientRect()
      const rb = b.getBoundingClientRect()
      return rb.width * rb.height - ra.width * ra.height
    })

    return visibleCandidates[0] || null
  }

  private findRelatedGeminiImageFromEvent(event: MouseEvent): HTMLImageElement | null {
    const path = typeof event.composedPath === "function" ? event.composedPath() : []
    for (const node of path) {
      if (!(node instanceof Element)) continue

      if (node instanceof HTMLImageElement) {
        const source = this.getImageSourceForAction(node)
        if (this.isValidGeminiImage(node) && this.isSupportedGeminiImageSource(source)) {
          return node
        }
      }

      const scopedImages = Array.from(node.querySelectorAll?.("img") || []) as HTMLImageElement[]
      for (const scopedImage of scopedImages) {
        const source = this.getImageSourceForAction(scopedImage)
        if (this.isValidGeminiImage(scopedImage) && this.isSupportedGeminiImageSource(source)) {
          return scopedImage
        }
      }
    }

    return null
  }

  private findGeminiSourceUrlFromEvent(event: MouseEvent): string {
    const path = typeof event.composedPath === "function" ? event.composedPath() : []
    let blobFallback = ""
    let dataFallback = ""

    for (const node of path) {
      if (!(node instanceof Element)) continue

      const source = this.extractSupportedUrlFromNode(node)
      if (!source) continue

      if (this.shouldInterceptGeminiImageUrl(source)) {
        return source
      }

      if (!blobFallback && source.startsWith("blob:")) {
        blobFallback = source
      }

      if (!dataFallback && source.startsWith("data:image/")) {
        dataFallback = source
      }
    }

    return blobFallback || dataFallback || ""
  }

  private async resolveActionDataUrl(source: string): Promise<string> {
    if (source.startsWith("data:image/")) {
      return source
    }

    if (source.startsWith("blob:")) {
      return this.processImageSourceToDataUrl(source)
    }

    return this.getProcessedDataUrl(source)
  }

  private async writeImageToClipboard(dataUrl: string) {
    const blob = await this.dataUrlToBlob(dataUrl)
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      throw new Error("Clipboard API unavailable")
    }

    const clipboardItem = new ClipboardItem({
      [blob.type || "image/png"]: blob,
    })

    await navigator.clipboard.write([clipboardItem])
  }

  private triggerDownloadFromDataUrl(dataUrl: string) {
    const link = document.createElement("a")
    link.href = dataUrl
    link.download = `gemini-image-${Date.now()}.png`
    link.rel = "noopener"
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  private shouldUseNativeGeminiAction(): boolean {
    if (isUserscript) {
      return this.userscriptOriginalFetch !== null
    }

    return (
      document.documentElement.getAttribute("data-ophel-wm-main") === "1" &&
      document.documentElement.getAttribute("data-ophel-wm-main-fetch-enabled") === "1"
    )
  }

  private async resolveProcessedDataUrlForAction(
    source: string,
    action: GeminiImageAction,
  ): Promise<string> {
    if (source.startsWith("data:image/")) {
      return source
    }

    if (source.startsWith("blob:")) {
      return this.resolveActionDataUrl(source)
    }

    try {
      return await this.getProcessedDataUrl(source, {
        bypassCache: true,
        requireNonPreviewSource: true,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (action === "copy" && message === "fullsize-source-unavailable") {
        return this.getProcessedDataUrl(source, {
          bypassCache: true,
          requireNonPreviewSource: false,
        })
      }
      throw error
    }
  }

  private async handleActionButtonClick(event: MouseEvent) {
    if (!this.enabled || !this.isGeminiStandardSite()) return

    const actionInfo = this.findImageAction(event)
    if (!actionInfo) return

    if (this.shouldUseNativeGeminiAction()) {
      return
    }

    const relatedImage =
      this.findRelatedGeminiImageFromEvent(event) ||
      this.findRelatedGeminiImage(actionInfo.button) ||
      this.findBestVisibleGeminiImage()

    const source =
      this.findGeminiSourceUrlFromEvent(event) ||
      (relatedImage ? this.getImageSourceForAction(relatedImage) : "")

    if (!source) {
      return
    }

    if (!this.isSupportedGeminiImageSource(source)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    const loadingHost = relatedImage ? this.showImageProcessingIndicator(relatedImage) : null

    try {
      const processedDataUrl = await this.resolveProcessedDataUrlForAction(
        source,
        actionInfo.action,
      )

      if (!processedDataUrl) {
        return
      }

      if (relatedImage) {
        relatedImage.setAttribute("data-ophel-wm-processed", "1")
      }

      if (actionInfo.action === "copy") {
        await this.writeImageToClipboard(processedDataUrl)
      } else {
        this.triggerDownloadFromDataUrl(processedDataUrl)
      }
    } catch {
      return
    } finally {
      this.hideImageProcessingIndicator(loadingHost)
    }
  }

  private calculateAlphaMap(imageData: ImageData): Float32Array {
    const { width, height, data } = imageData
    const alphaMap = new Float32Array(width * height)
    for (let i = 0; i < alphaMap.length; i++) {
      const idx = i * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      const maxChannel = Math.max(r, g, b)
      alphaMap[i] = maxChannel / 255
    }
    return alphaMap
  }

  private removeWatermark(
    imageData: ImageData,
    alphaMap: Float32Array,
    position: { x: number; y: number; width: number; height: number },
  ) {
    const { x, y, width, height } = position
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const imgIdx = ((y + row) * imageData.width + (x + col)) * 4
        const alphaIdx = row * width + col
        let alpha = alphaMap[alphaIdx]
        if (alpha < WatermarkRemover.ALPHA_THRESHOLD) continue
        alpha = Math.min(alpha, WatermarkRemover.MAX_ALPHA)
        const oneMinusAlpha = 1 - alpha
        for (let c = 0; c < 3; c++) {
          const watermarked = imageData.data[imgIdx + c]
          const original = (watermarked - alpha * WatermarkRemover.LOGO_VALUE) / oneMinusAlpha
          imageData.data[imgIdx + c] = Math.max(0, Math.min(255, Math.round(original)))
        }
      }
    }
  }

  private detectWatermarkConfig(
    imageWidth: number,
    imageHeight: number,
    sourceUrl?: string,
  ): WatermarkConfig {
    if (this.shouldUseConversationPreviewWatermark(sourceUrl)) {
      return this.getWatermarkConfigBySize(48)
    }

    if (imageWidth > 1024 && imageHeight > 1024) {
      return this.getWatermarkConfigBySize(96)
    }

    return this.getWatermarkConfigBySize(48)
  }

  private calculateWatermarkPosition(
    imageWidth: number,
    imageHeight: number,
    config: WatermarkConfig,
  ): WatermarkPosition {
    const { logoSize, marginRight, marginBottom } = config
    return {
      x: imageWidth - marginRight - logoSize,
      y: imageHeight - marginBottom - logoSize,
      width: logoSize,
      height: logoSize,
    }
  }

  private isWatermarkPositionInsideImage(
    imageWidth: number,
    imageHeight: number,
    position: WatermarkPosition,
  ): boolean {
    return (
      position.x >= 0 &&
      position.y >= 0 &&
      position.x + position.width <= imageWidth &&
      position.y + position.height <= imageHeight
    )
  }

  private getPixelLuminance(data: Uint8ClampedArray, idx: number): number {
    return (data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722) / 255
  }

  private measureWatermarkCandidate(
    imageData: ImageData,
    alphaMap: Float32Array,
    position: WatermarkPosition,
  ): WatermarkDetectionMetrics {
    let insideWeightedSum = 0
    let insideWeight = 0

    for (let row = 0; row < position.height; row++) {
      for (let col = 0; col < position.width; col++) {
        const alpha = alphaMap[row * position.width + col]
        if (alpha < WatermarkRemover.ALPHA_THRESHOLD) continue

        const pixelIdx = ((position.y + row) * imageData.width + (position.x + col)) * 4
        const luminance = this.getPixelLuminance(imageData.data, pixelIdx)
        const weight = alpha * alpha
        insideWeightedSum += luminance * weight
        insideWeight += weight
      }
    }

    const insideMean = insideWeight > 0 ? insideWeightedSum / insideWeight : 0
    const samplePadding = Math.max(8, Math.round(position.width / 4))
    const sampleStartX = Math.max(0, position.x - samplePadding)
    const sampleStartY = Math.max(0, position.y - samplePadding)
    const sampleEndX = Math.min(imageData.width, position.x + position.width + samplePadding)
    const sampleEndY = Math.min(imageData.height, position.y + position.height + samplePadding)
    let outsideSum = 0
    let outsideCount = 0

    for (let y = sampleStartY; y < sampleEndY; y++) {
      for (let x = sampleStartX; x < sampleEndX; x++) {
        const insideRegion =
          x >= position.x &&
          x < position.x + position.width &&
          y >= position.y &&
          y < position.y + position.height

        if (insideRegion) continue

        const pixelIdx = (y * imageData.width + x) * 4
        outsideSum += this.getPixelLuminance(imageData.data, pixelIdx)
        outsideCount += 1
      }
    }

    const outsideMean = outsideCount > 0 ? outsideSum / outsideCount : insideMean
    const score = insideMean - outsideMean
    const headroom = Math.max(0.08, 1 - Math.min(outsideMean, 0.98))
    return {
      insideMean,
      outsideMean,
      score,
      normalizedScore: score / headroom,
    }
  }

  private hasDetectableWatermark(metrics: WatermarkDetectionMetrics): boolean {
    return (
      metrics.score >= WatermarkRemover.DETECTION_MIN_SCORE ||
      metrics.normalizedScore >= WatermarkRemover.DETECTION_MIN_NORMALIZED_SCORE
    )
  }

  private getWatermarkBgUrl(size: 48 | 96): string {
    if (isUserscript) {
      return size === 48
        ? window.__OPHEL_USERSCRIPT_ASSET_URLS__?.watermarkBg48 || ""
        : window.__OPHEL_USERSCRIPT_ASSET_URLS__?.watermarkBg96 || ""
    }

    return chrome.runtime.getURL(WatermarkRemover.WATERMARK_BG_PATHS[size])
  }

  private async loadBgImage(size: 48 | 96): Promise<HTMLImageElement> {
    if (this.bgImages[size]) return this.bgImages[size]
    return new Promise((resolve, reject) => {
      const bgUrl = this.getWatermarkBgUrl(size)
      if (!bgUrl) {
        reject(new Error(`Missing watermark background asset for size ${size}`))
        return
      }

      const img = new Image()
      img.onload = () => {
        this.bgImages[size] = img
        resolve(img)
      }
      img.onerror = reject
      img.src = bgUrl
    })
  }

  private async getAlphaMap(size: 48 | 96): Promise<Float32Array> {
    if (this.alphaMaps[size]) return this.alphaMaps[size]
    const bgImage = await this.loadBgImage(size)
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Could not get canvas context")
    ctx.drawImage(bgImage, 0, 0)
    const imageData = ctx.getImageData(0, 0, size, size)
    const alphaMap = this.calculateAlphaMap(imageData)
    this.alphaMaps[size] = alphaMap
    return alphaMap
  }

  private loadImageFromSource(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
  }

  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const parsed = dataUrl.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i)
    if (!parsed) {
      throw new Error("Invalid data URL")
    }

    const mimeType = parsed[1] || "application/octet-stream"
    const isBase64 = !!parsed[2]
    const payload = parsed[3] || ""

    if (!isBase64) {
      return new Blob([decodeURIComponent(payload)], { type: mimeType })
    }

    const normalizedPayload = payload.replace(/\s+/g, "")
    const binary = atob(normalizedPayload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }

    return new Blob([bytes], { type: mimeType })
  }

  private buildRemoteFetchCandidates(url: string): string[] {
    const normalized = this.replaceWithNormalSize(url)
    const candidates: string[] = []
    const addCandidate = (candidate: string) => {
      if (!candidate) return
      if (!candidates.includes(candidate)) {
        candidates.push(candidate)
      }
    }

    const buildOptionVariants = (candidateUrl: string): string[] => {
      const suffixIndex = candidateUrl.search(/[?#]/)
      const endIndex = suffixIndex === -1 ? candidateUrl.length : suffixIndex
      const lastSlashIndex = candidateUrl.lastIndexOf("/", endIndex)
      const optionStartIndex = candidateUrl.lastIndexOf("=", endIndex)

      if (optionStartIndex === -1 || optionStartIndex < lastSlashIndex) {
        return [candidateUrl]
      }

      const rawOptions = candidateUrl.slice(optionStartIndex + 1, endIndex)
      if (!rawOptions) return [candidateUrl]

      const optionTokens = rawOptions.split("-").filter(Boolean)
      const keptTokens = optionTokens.filter((token) => {
        const normalizedToken = token.toLowerCase()
        if (/^s\d+$/.test(normalizedToken)) return false
        if (/^w\d+$/.test(normalizedToken)) return false
        if (/^h\d+$/.test(normalizedToken)) return false
        return true
      })

      const withoutD = keptTokens.filter((token) => token.toLowerCase() !== "d")
      const withoutDRj = withoutD.filter((token) => token.toLowerCase() !== "rj")
      const variants = [
        ["s0", "d", ...withoutDRj],
        ["s0", ...withoutDRj],
        ["s0", "d", ...withoutD],
        ["s0", ...withoutD],
      ]

      const rebuilt: string[] = []
      for (const tokens of variants) {
        const optionString = tokens.join("-")
        const variantUrl = `${candidateUrl.slice(0, optionStartIndex + 1)}${optionString}${candidateUrl.slice(endIndex)}`
        if (!rebuilt.includes(variantUrl)) {
          rebuilt.push(variantUrl)
        }
      }

      return rebuilt
    }

    const addPathVariants = (candidateUrl: string) => {
      for (const variantUrl of buildOptionVariants(candidateUrl)) {
        addCandidate(variantUrl)
      }
    }

    if (normalized.includes("/gg/")) {
      addPathVariants(normalized.replace("/gg/", "/rd-gg-dl/"))
      addPathVariants(normalized.replace("/gg/", "/rd-gg/"))
      addPathVariants(normalized)
      return candidates
    }

    if (normalized.includes("/rd-gg/")) {
      addPathVariants(normalized.replace("/rd-gg/", "/rd-gg-dl/"))
      addPathVariants(normalized)
      addPathVariants(normalized.replace("/rd-gg/", "/gg/"))
      return candidates
    }

    if (normalized.includes("/rd-gg-dl/")) {
      addPathVariants(normalized)
      addPathVariants(normalized.replace("/rd-gg-dl/", "/rd-gg/"))
      addPathVariants(normalized.replace("/rd-gg-dl/", "/gg/"))
      return candidates
    }

    addPathVariants(normalized)
    return candidates
  }

  private async fetchOriginalBlobSingle(url: string): Promise<Blob> {
    if (isUserscript) {
      return fetchImageAsBlob(url)
    }

    const response = await sendToBackground({
      type: MSG_PROXY_FETCH,
      url,
    })

    if (!response.success || !response.data) {
      throw new Error(response.error || "Unknown proxy error")
    }

    return this.dataUrlToBlob(response.data as string)
  }

  private async fetchOriginalBlob(
    normalSizeUrl: string,
    options?: { requireNonPreviewSource?: boolean },
  ): Promise<Blob> {
    const fetchCandidates = this.shouldInterceptGeminiImageUrl(normalSizeUrl)
      ? this.buildRemoteFetchCandidates(normalSizeUrl)
      : [normalSizeUrl]

    let lastError: unknown = null
    for (const candidateUrl of fetchCandidates) {
      try {
        const blob = await this.fetchOriginalBlobSingle(candidateUrl)
        if (options?.requireNonPreviewSource && /\/gg\//.test(candidateUrl)) {
          throw new Error("fullsize-source-unavailable")
        }
        return blob
      } catch (error) {
        lastError = error
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Failed to fetch original image")
  }

  private async processLoadedImageToDataUrl(
    loadedImg: HTMLImageElement,
    sourceUrl?: string,
    options?: { requireDetectableWatermark?: boolean },
  ): Promise<string> {
    const canvas = document.createElement("canvas")
    canvas.width = loadedImg.width
    canvas.height = loadedImg.height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Could not get canvas context")

    ctx.drawImage(loadedImg, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const config = this.detectWatermarkConfig(canvas.width, canvas.height, sourceUrl)
    const position = this.calculateWatermarkPosition(canvas.width, canvas.height, config)
    const alphaMap = await this.getAlphaMap(config.logoSize)

    if (
      options?.requireDetectableWatermark &&
      this.isWatermarkPositionInsideImage(canvas.width, canvas.height, position)
    ) {
      const metrics = this.measureWatermarkCandidate(imageData, alphaMap, position)
      if (!this.hasDetectableWatermark(metrics)) {
        throw new Error(WATERMARK_NOT_DETECTED_ERROR)
      }
    }

    this.removeWatermark(imageData, alphaMap, position)
    ctx.putImageData(imageData, 0, 0)

    return canvas.toDataURL("image/png")
  }

  private async processImageSourceToDataUrl(
    source: string,
    options?: { requireDetectableWatermark?: boolean },
  ): Promise<string> {
    const loadedImg = await this.loadImageFromSource(source)
    return this.processLoadedImageToDataUrl(loadedImg, source, options)
  }

  private async processImageBlobToDataUrl(blob: Blob, sourceUrl?: string): Promise<string> {
    const blobUrl = URL.createObjectURL(blob)
    try {
      const loadedImg = await this.loadImageFromSource(blobUrl)
      return await this.processLoadedImageToDataUrl(loadedImg, sourceUrl)
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
  }

  private async getProcessedDataUrl(
    sourceUrl: string,
    options?: { bypassCache?: boolean; requireNonPreviewSource?: boolean },
  ): Promise<string> {
    const normalizedSourceUrl = this.replaceWithNormalSize(sourceUrl)

    if (!options?.bypassCache) {
      const cached = this.processedDataUrlCache.get(normalizedSourceUrl)
      if (cached) return cached
    }

    if (!options?.bypassCache) {
      const inFlight = this.processingMap.get(normalizedSourceUrl)
      if (inFlight) return inFlight
    }

    const processing = (async () => {
      const originalBlob = await this.fetchOriginalBlob(normalizedSourceUrl, {
        requireNonPreviewSource: options?.requireNonPreviewSource,
      })
      const processedDataUrl = await this.processImageBlobToDataUrl(
        originalBlob,
        normalizedSourceUrl,
      )
      if (!options?.bypassCache) {
        this.processedDataUrlCache.set(normalizedSourceUrl, processedDataUrl)
        this.trimProcessedDataUrlCache()
      }
      return processedDataUrl
    })()

    if (!options?.bypassCache) {
      this.processingMap.set(normalizedSourceUrl, processing)
      try {
        return await processing
      } finally {
        this.processingMap.delete(normalizedSourceUrl)
      }
    }

    return processing
  }

  private trimProcessedDataUrlCache() {
    if (this.processedDataUrlCache.size <= 100) return

    const oldestKey = this.processedDataUrlCache.keys().next().value
    if (oldestKey) {
      this.processedDataUrlCache.delete(oldestKey)
    }
  }

  private async getProcessedDisplayDataUrl(sourceUrl: string): Promise<string> {
    if (
      isUserscript &&
      this.isGeminiConversationPath() &&
      (sourceUrl.startsWith("blob:") || sourceUrl.startsWith("data:image/"))
    ) {
      return this.processImageSourceToDataUrl(sourceUrl, {
        requireDetectableWatermark: true,
      })
    }

    if (!isUserscript || !this.shouldInterceptGeminiImageUrl(sourceUrl)) {
      return this.resolveActionDataUrl(sourceUrl)
    }

    const normalizedSourceUrl = this.replaceWithNormalSize(sourceUrl)
    const cached = this.processedDataUrlCache.get(normalizedSourceUrl)
    if (cached) return cached

    const processingKey = `display:${normalizedSourceUrl}`
    const inFlight = this.processingMap.get(processingKey)
    if (inFlight) return inFlight

    const processing = (async () => {
      const originalBlob = await this.fetchOriginalBlobSingle(normalizedSourceUrl)
      const processedDataUrl = await this.processImageBlobToDataUrl(
        originalBlob,
        normalizedSourceUrl,
      )
      this.processedDataUrlCache.set(normalizedSourceUrl, processedDataUrl)
      this.trimProcessedDataUrlCache()
      return processedDataUrl
    })()

    this.processingMap.set(processingKey, processing)
    try {
      return await processing
    } finally {
      this.processingMap.delete(processingKey)
    }
  }

  private isValidGeminiImage(img: HTMLImageElement) {
    if (img.closest("generated-image,.generated-image-container")) {
      return true
    }

    return this.isLikelyGeneratedImage(img)
  }

  private findGeminiImages() {
    return [...document.querySelectorAll<HTMLImageElement>("img")].filter((img) => {
      const source = this.getImageSourceForAction(img)
      const skipSource = img.getAttribute("data-ophel-wm-skip-source") || ""
      const isSkippedForCurrentSource =
        img.dataset.watermarkProcessed === "skipped" && skipSource === source
      return (
        this.isValidGeminiImage(img) &&
        this.isSupportedGeminiImageSource(source) &&
        !this.shouldSkipAutoProcessingSource(source) &&
        img.dataset.watermarkProcessed !== "true" &&
        img.dataset.watermarkProcessed !== "processing" &&
        !isSkippedForCurrentSource
      )
    })
  }

  private async processExistingImages() {
    const images = this.findGeminiImages()
    for (const img of images) {
      this.processSingleImage(img)
    }
  }

  private async processSingleImage(img: HTMLImageElement) {
    const originalSrc = img.currentSrc || img.src
    if (!originalSrc || !this.isSupportedGeminiImageSource(originalSrc)) return
    if (this.shouldSkipAutoProcessingSource(originalSrc)) return
    if (this.processingQueue.has(originalSrc)) return
    this.processingQueue.add(originalSrc)
    img.dataset.watermarkProcessed = "processing"
    const loadingHost = this.showImageProcessingIndicator(img)
    const sourceForProcessing =
      originalSrc.startsWith("data:image/") || originalSrc.startsWith("blob:")
        ? originalSrc
        : this.replaceWithNormalSize(originalSrc)

    try {
      const newUrl = await this.getProcessedDisplayDataUrl(sourceForProcessing)
      img.src = newUrl
      img.dataset.watermarkProcessed = "true"
      img.setAttribute("data-ophel-wm-source", sourceForProcessing)
      img.setAttribute("data-ophel-wm-processed", "1")
      img.removeAttribute("data-ophel-wm-skip-source")
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (message === WATERMARK_NOT_DETECTED_ERROR) {
        img.dataset.watermarkProcessed = "skipped"
        img.setAttribute("data-ophel-wm-skip-source", sourceForProcessing)
        img.removeAttribute("data-ophel-wm-source")
        img.removeAttribute("data-ophel-wm-processed")
        return
      }

      img.dataset.watermarkProcessed = "error"
      img.removeAttribute("data-ophel-wm-processed")
    } finally {
      this.hideImageProcessingIndicator(loadingHost)
      this.processingQueue.delete(originalSrc)
    }
  }

  /**
   * 替换为原始尺寸URL
   */
  private replaceWithNormalSize(src: string): string {
    if (!src) return src
    if (src.startsWith("data:image/") || src.startsWith("blob:")) return src
    if (!this.shouldInterceptGeminiImageUrl(src)) return src

    const suffixIndex = src.search(/[?#]/)
    const endIndex = suffixIndex === -1 ? src.length : suffixIndex
    const lastSlashIndex = src.lastIndexOf("/", endIndex)
    const optionStartIndex = src.lastIndexOf("=", endIndex)

    if (optionStartIndex === -1 || optionStartIndex < lastSlashIndex) {
      return src
    }

    const rawOptions = src.slice(optionStartIndex + 1, endIndex)
    if (!rawOptions) return src

    const optionTokens = rawOptions.split("-").filter(Boolean)
    const keptTokens = optionTokens.filter((token) => {
      const normalized = token.toLowerCase()
      if (/^s\d+$/.test(normalized)) return false
      if (/^w\d+$/.test(normalized)) return false
      if (/^h\d+$/.test(normalized)) return false
      if (normalized === "rj") return false
      return true
    })

    const normalizedOptions = ["s0", ...keptTokens].join("-")
    return `${src.slice(0, optionStartIndex + 1)}${normalizedOptions}${src.slice(endIndex)}`
  }

  private startObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false
      for (const m of mutations) {
        if (m.addedNodes.length > 0) shouldCheck = true
      }
      if (shouldCheck) this.processExistingImages()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    this.stopObserver = () => observer.disconnect()
  }
}
