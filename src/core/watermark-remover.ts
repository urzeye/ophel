import { MSG_PROXY_FETCH, sendToBackground } from "~utils/messaging"
import { t } from "~utils/i18n"
import { processBananaWatermarkImageData } from "~core/watermark/banana-engine"
import {
  classifyGeminiAssetUrl,
  isGeminiDisplayPreviewImageUrl,
  isGeminiGeneratedImageUrl,
  normalizeGeminiImageUrl,
} from "~core/watermark/gemini-asset-url"

// 平台检测
declare const __PLATFORM__: "extension" | "userscript" | undefined
const isUserscript = typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"
declare const unsafeWindow: Window | undefined

const OPHEL_WATERMARK_FETCH_TOGGLE = "OPHEL_WATERMARK_FETCH_TOGGLE"
const OPHEL_WATERMARK_PROCESS_REQUEST = "OPHEL_WATERMARK_PROCESS_REQUEST"
const OPHEL_WATERMARK_PROCESS_RESPONSE = "OPHEL_WATERMARK_PROCESS_RESPONSE"
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
export type WatermarkProcessScene = "display" | "download" | "copy" | "fetch" | "export"

// 油猴脚本的 GM_xmlhttpRequest 声明
declare function GM_xmlhttpRequest(details: {
  method: string
  url: string
  headers?: Record<string, string>
  responseType?: string
  onload?: (response: { status: number; response: Blob }) => void
  onerror?: (error?: { message?: string }) => void
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
 */
export class WatermarkRemover {
  private static activeInstance: WatermarkRemover | null = null
  private processingQueue = new Set<string>()
  private processingMap = new Map<string, Promise<string>>()
  private processedDataUrlCache = new Map<string, string>()
  private skippedSourceCache = new Set<string>()
  private enabled = false
  private stopObserver: (() => void) | null = null
  private mainWorldMessageListener: ((event: MessageEvent) => void) | null = null
  private actionButtonListener: ((event: MouseEvent) => void) | null = null
  private userscriptOriginalFetch: typeof fetch | null = null

  constructor() {
    this.processingQueue = new Set()
    this.processingMap = new Map()
    this.processedDataUrlCache = new Map()
    this.skippedSourceCache = new Set()
  }

  static getActiveInstance(): WatermarkRemover | null {
    return WatermarkRemover.activeInstance
  }

  start() {
    if (this.enabled) return
    this.enabled = true
    WatermarkRemover.activeInstance = this

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
    this.skippedSourceCache.clear()
    this.clearAllProcessingIndicators()
    this.removeProcessingIndicatorStyles()
    if (WatermarkRemover.activeInstance === this) {
      WatermarkRemover.activeInstance = null
    }

    if (this.stopObserver) {
      this.stopObserver()
      this.stopObserver = null
    }
  }

  private isGeminiStandardSite(): boolean {
    return window.location.hostname === "gemini.google.com"
  }

  private shouldInterceptGeminiImageUrl(url: string): boolean {
    return isGeminiGeneratedImageUrl(url)
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

  private shouldSkipAutoProcessingSource(source: string): boolean {
    if (!source.startsWith("blob:") && !source.startsWith("data:image/")) {
      return false
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
        bottom: 20px;
        right: 20px;
        width: 30px;
        height: 30px;
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
      indicator.title = t("watermarkProcessing")
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

  private getCurrentImageSource(img: HTMLImageElement): string {
    return img.currentSrc || img.src || ""
  }

  private getComparableProcessingSource(source: string): string {
    if (!source) return ""
    return this.shouldInterceptGeminiImageUrl(source) ? this.replaceWithNormalSize(source) : source
  }

  private resetProcessedImageStateIfSourceChanged(img: HTMLImageElement, source: string) {
    if (img.getAttribute("data-ophel-wm-processed") === "1" && source.startsWith("data:image/")) {
      return
    }

    const comparableSource = this.getComparableProcessingSource(source)
    const processedSource = img.getAttribute("data-ophel-wm-source") || ""
    const skippedSource = img.getAttribute("data-ophel-wm-skip-source") || ""

    if (processedSource && processedSource !== comparableSource) {
      img.removeAttribute("data-ophel-wm-source")
      img.removeAttribute("data-ophel-wm-processed")
      delete img.dataset.watermarkProcessed
    }

    if (skippedSource && skippedSource !== comparableSource) {
      img.removeAttribute("data-ophel-wm-skip-source")
      delete img.dataset.watermarkProcessed
    }
  }

  private getRemoteSkippedSourceCacheKey(sourceUrl: string, scene: WatermarkProcessScene): string {
    return `${scene}:${sourceUrl}`
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

    const normalizedSourceUrl = this.replaceWithNormalSize(sourceUrl)
    try {
      const sourceBlob = sourceArrayBuffer
        ? new Blob([sourceArrayBuffer], { type: sourceMimeType || "image/png" })
        : undefined

      const dataUrl = sourceBlob
        ? await this.processFetchBlobToDataUrl(sourceBlob, normalizedSourceUrl)
        : await this.getProcessedDataUrl(normalizedSourceUrl, { scene: "fetch" })

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

  private buildFetchArgsWithSourceUrl(
    args: Parameters<typeof fetch>,
    sourceUrl: string,
    targetWindow: Window,
  ): Parameters<typeof fetch> {
    const nextArgs = [...args] as Parameters<typeof fetch>
    const input = nextArgs[0]

    if (typeof input === "string") {
      nextArgs[0] = sourceUrl
      return nextArgs
    }

    const RequestCtor =
      (targetWindow as Window & typeof globalThis).Request ||
      (typeof Request !== "undefined" ? Request : null)
    if (RequestCtor && input && typeof input === "object" && "url" in input) {
      try {
        nextArgs[0] = new RequestCtor(sourceUrl, input as Request)
        return nextArgs
      } catch {
        nextArgs[0] = sourceUrl
        return nextArgs
      }
    }

    nextArgs[0] = sourceUrl
    return nextArgs
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
        return this.userscriptOriginalFetch!(...args)
      }

      const normalizedUrl = this.replaceWithNormalSize(requestUrl)
      const nextArgs = this.buildFetchArgsWithSourceUrl(args, normalizedUrl, pageWindow)
      let originalResponse: Response | null = null
      let originalBlob: Blob | null = null

      try {
        originalResponse = await this.userscriptOriginalFetch!(...nextArgs)
        if (!originalResponse.ok) {
          return originalResponse
        }

        originalBlob = await originalResponse.blob()

        const dataUrl = await this.processFetchBlobToDataUrl(originalBlob, normalizedUrl)
        const processedBlob = await this.dataUrlToBlob(dataUrl)

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

        return this.userscriptOriginalFetch!(...args)
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
    if (this.actionButtonListener || !this.isGeminiStandardSite()) return

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

  private async resolveActionDataUrl(
    source: string,
    scene: WatermarkProcessScene = "display",
  ): Promise<string> {
    if (source.startsWith("data:image/")) {
      return source
    }

    if (source.startsWith("blob:")) {
      return this.processImageSourceToDataUrl(source, { scene })
    }

    return this.getProcessedDataUrl(source, { scene })
  }

  async resolveProcessedImageDataUrl(
    source: string,
    options?: {
      bypassCache?: boolean
      requireNonPreviewSource?: boolean
      scene?: WatermarkProcessScene
    },
  ): Promise<string | null> {
    const normalizedSource = this.normalizePossibleUrl(source)
    if (!normalizedSource || !this.isSupportedGeminiImageSource(normalizedSource)) return null

    try {
      if (normalizedSource.startsWith("data:image/")) {
        return await this.resolveActionDataUrl(normalizedSource, options?.scene ?? "export")
      }

      if (normalizedSource.startsWith("blob:")) {
        return await this.resolveActionDataUrl(normalizedSource, options?.scene ?? "export")
      }

      return await this.getProcessedDataUrl(normalizedSource, {
        bypassCache: options?.bypassCache,
        requireNonPreviewSource: options?.requireNonPreviewSource,
        scene: options?.scene ?? "export",
      })
    } catch (error) {
      if (error instanceof Error && error.message === WATERMARK_NOT_DETECTED_ERROR) {
        return null
      }
      return null
    }
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
      return this.resolveActionDataUrl(source, action)
    }

    try {
      return await this.getProcessedDataUrl(source, {
        bypassCache: true,
        requireNonPreviewSource: true,
        scene: action,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (action === "copy" && message === "fullsize-source-unavailable") {
        return this.getProcessedDataUrl(source, {
          bypassCache: true,
          requireNonPreviewSource: false,
          scene: action,
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
      const normalizedCandidateUrl = normalizeGeminiImageUrl(candidateUrl)
      const suffixIndex = candidateUrl.search(/[?#]/)
      const endIndex = suffixIndex === -1 ? candidateUrl.length : suffixIndex
      const lastSlashIndex = candidateUrl.lastIndexOf("/", endIndex)
      const optionStartIndex = candidateUrl.lastIndexOf("=", endIndex)

      if (optionStartIndex === -1 || optionStartIndex < lastSlashIndex) {
        return [normalizedCandidateUrl]
      }

      const rawOptions = candidateUrl.slice(optionStartIndex + 1, endIndex)
      if (!rawOptions) return [normalizedCandidateUrl]

      const optionTokens = rawOptions.split("-").filter(Boolean)
      const tokensWithoutSize = optionTokens.filter((token) => {
        const normalizedToken = token.toLowerCase()
        if (/^s\d+$/.test(normalizedToken)) return false
        if (/^w\d+$/.test(normalizedToken)) return false
        if (/^h\d+$/.test(normalizedToken)) return false
        return true
      })

      const withoutD = tokensWithoutSize.filter((token) => token.toLowerCase() !== "d")
      const withoutRj = tokensWithoutSize.filter((token) => token.toLowerCase() !== "rj")
      const withoutDRj = withoutD.filter((token) => token.toLowerCase() !== "rj")
      const hasDownloadToken = tokensWithoutSize.some((token) => token.toLowerCase() === "d")
      const hasRjToken = tokensWithoutSize.some((token) => token.toLowerCase() === "rj")

      const variants = [
        ["s0", ...tokensWithoutSize],
        hasDownloadToken ? ["s0", ...withoutD] : ["s0", "d", ...tokensWithoutSize],
        ...(hasRjToken
          ? [
              ["s0", ...withoutRj],
              hasDownloadToken ? ["s0", ...withoutDRj] : ["s0", "d", ...withoutDRj],
            ]
          : []),
      ]

      const rebuilt: string[] = []
      if (!rebuilt.includes(normalizedCandidateUrl)) {
        rebuilt.push(normalizedCandidateUrl)
      }
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

    const getFirstPathSegment = (candidateUrl: string): string => {
      try {
        const parsed = new URL(candidateUrl)
        return parsed.pathname.split("/").filter(Boolean)[0] || ""
      } catch {
        return ""
      }
    }

    const replaceFirstPathSegment = (candidateUrl: string, nextSegment: string): string => {
      if (!nextSegment) return candidateUrl

      try {
        const parsed = new URL(candidateUrl)
        const parts = parsed.pathname.split("/")
        const firstSegmentIndex = parts.findIndex(Boolean)
        if (firstSegmentIndex === -1) return candidateUrl
        parts[firstSegmentIndex] = nextSegment
        parsed.pathname = parts.join("/")
        return parsed.toString()
      } catch {
        return candidateUrl
      }
    }

    const getPreviewSegmentFromRdVariant = (variant: string): string => {
      if (!variant) return "gg"
      if (variant === "gg" || variant.startsWith("gg-")) return variant
      return `gg-${variant}`
    }

    const addSegmentVariants = (segment: string) => {
      addPathVariants(replaceFirstPathSegment(normalized, segment))
    }

    const classification = classifyGeminiAssetUrl(normalized)
    if (classification) {
      const currentSegment = getFirstPathSegment(normalized)

      if (classification.family === "gg") {
        const previewSegment = classification.variant ? `gg-${classification.variant}` : "gg"
        const downloadSegment = classification.variant ? `gg-${classification.variant}-dl` : "gg-dl"
        const rdSegment = classification.variant ? `rd-gg-${classification.variant}` : "rd-gg"
        const rdDownloadSegment = `${rdSegment}-dl`

        if (classification.isPreview) {
          addSegmentVariants(rdDownloadSegment)
          addSegmentVariants(rdSegment)
          addSegmentVariants(downloadSegment)
          addSegmentVariants(previewSegment)
          return candidates
        }

        addSegmentVariants(currentSegment || downloadSegment)
        addSegmentVariants(rdDownloadSegment)
        addSegmentVariants(rdSegment)
        addSegmentVariants(previewSegment)
        return candidates
      }

      const rdSegment = `rd-${classification.variant}`
      const rdDownloadSegment = `${rdSegment}-dl`
      const previewSegment = getPreviewSegmentFromRdVariant(classification.variant)
      const downloadSegment = previewSegment === "gg" ? "gg-dl" : `${previewSegment}-dl`

      addSegmentVariants(
        currentSegment || (classification.isDownload ? rdDownloadSegment : rdSegment),
      )
      addSegmentVariants(classification.isDownload ? rdSegment : rdDownloadSegment)
      addSegmentVariants(downloadSegment)
      addSegmentVariants(previewSegment)
      return candidates
    }

    if (normalized.includes("/gg/")) {
      addPathVariants(normalized.replace("/gg/", "/rd-gg-dl/"))
      addPathVariants(normalized.replace("/gg/", "/rd-gg/"))
      addPathVariants(normalized)
      return candidates
    }

    if (normalized.includes("/rd-gg/")) {
      addPathVariants(normalized)
      addPathVariants(normalized.replace("/rd-gg/", "/rd-gg-dl/"))
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
        if (options?.requireNonPreviewSource && isGeminiDisplayPreviewImageUrl(candidateUrl)) {
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
    options?: { scene?: WatermarkProcessScene },
  ): Promise<string> {
    const canvas = document.createElement("canvas")
    canvas.width = loadedImg.width
    canvas.height = loadedImg.height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Could not get canvas context")

    ctx.drawImage(loadedImg, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    const result = processBananaWatermarkImageData(imageData, {
      sourceUrl,
      scene: options?.scene ?? "display",
      adaptiveMode: "always",
      maxPasses: 4,
    })

    if (result.status === "skipped") {
      throw new Error(WATERMARK_NOT_DETECTED_ERROR)
    }

    if (result.status === "failed") {
      throw new Error(result.error)
    }

    ctx.putImageData(result.imageData, 0, 0)

    return canvas.toDataURL("image/png")
  }

  private async processImageSourceToDataUrl(
    source: string,
    options?: { scene?: WatermarkProcessScene },
  ): Promise<string> {
    const loadedImg = await this.loadImageFromSource(source)
    return this.processLoadedImageToDataUrl(loadedImg, source, options)
  }

  private async processImageBlobToDataUrl(
    blob: Blob,
    sourceUrl?: string,
    options?: { scene?: WatermarkProcessScene },
  ): Promise<string> {
    const blobUrl = URL.createObjectURL(blob)
    try {
      const loadedImg = await this.loadImageFromSource(blobUrl)
      return await this.processLoadedImageToDataUrl(loadedImg, sourceUrl, options)
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
  }

  private async processFetchBlobToDataUrl(blob: Blob, sourceUrl: string): Promise<string> {
    const normalizedSourceUrl = this.replaceWithNormalSize(sourceUrl)
    const skipCacheKey = this.getRemoteSkippedSourceCacheKey(normalizedSourceUrl, "fetch")

    this.throwIfSourceSkipped(skipCacheKey)

    try {
      return await this.processImageBlobToDataUrl(blob, normalizedSourceUrl, {
        scene: "fetch",
      })
    } catch (error) {
      if (error instanceof Error && error.message === WATERMARK_NOT_DETECTED_ERROR) {
        this.rememberSkippedSource(skipCacheKey)
      }
      throw error
    }
  }

  private async getProcessedDataUrl(
    sourceUrl: string,
    options?: {
      bypassCache?: boolean
      requireNonPreviewSource?: boolean
      scene?: WatermarkProcessScene
    },
  ): Promise<string> {
    const normalizedSourceUrl = this.replaceWithNormalSize(sourceUrl)
    const skipCacheKey = this.getRemoteSkippedSourceCacheKey(
      normalizedSourceUrl,
      options?.scene ?? "download",
    )

    if (!options?.bypassCache) {
      const cached = this.processedDataUrlCache.get(normalizedSourceUrl)
      if (cached) return cached
    }

    this.throwIfSourceSkipped(skipCacheKey)

    if (!options?.bypassCache) {
      const inFlight = this.processingMap.get(normalizedSourceUrl)
      if (inFlight) return inFlight
    }

    const processing = (async () => {
      try {
        const originalBlob = await this.fetchOriginalBlob(normalizedSourceUrl, {
          requireNonPreviewSource: options?.requireNonPreviewSource,
        })
        const processedDataUrl = await this.processImageBlobToDataUrl(
          originalBlob,
          normalizedSourceUrl,
          { scene: options?.scene ?? "download" },
        )
        if (!options?.bypassCache) {
          this.processedDataUrlCache.set(normalizedSourceUrl, processedDataUrl)
          this.trimProcessedDataUrlCache()
        }
        return processedDataUrl
      } catch (error) {
        if (error instanceof Error && error.message === WATERMARK_NOT_DETECTED_ERROR) {
          this.rememberSkippedSource(skipCacheKey)
        }
        throw error
      }
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

  private rememberSkippedSource(cacheKey: string) {
    if (!cacheKey) return
    if (this.processedDataUrlCache.has(cacheKey)) return
    this.skippedSourceCache.add(cacheKey)
    if (this.skippedSourceCache.size <= 120) return

    const oldestKey = this.skippedSourceCache.keys().next().value
    if (oldestKey) {
      this.skippedSourceCache.delete(oldestKey)
    }
  }

  private throwIfSourceSkipped(cacheKey: string) {
    if (this.processedDataUrlCache.has(cacheKey)) return
    if (cacheKey && this.skippedSourceCache.has(cacheKey)) {
      throw new Error(WATERMARK_NOT_DETECTED_ERROR)
    }
  }

  private async getProcessedDisplayDataUrl(sourceUrl: string): Promise<string> {
    return this.resolveActionDataUrl(sourceUrl)
  }

  private isValidGeminiImage(img: HTMLImageElement) {
    if (img.closest("generated-image,.generated-image-container")) {
      return true
    }

    return this.isLikelyGeneratedImage(img)
  }

  private findGeminiImages() {
    return [...document.querySelectorAll<HTMLImageElement>("img")].filter((img) => {
      const source = this.getCurrentImageSource(img)
      this.resetProcessedImageStateIfSourceChanged(img, source)

      const comparableSource = this.getComparableProcessingSource(source)
      const skipSource = img.getAttribute("data-ophel-wm-skip-source") || ""
      const isSkippedForCurrentSource =
        img.dataset.watermarkProcessed === "skipped" && skipSource === comparableSource
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
    const originalSrc = this.getCurrentImageSource(img)
    if (!originalSrc || !this.isSupportedGeminiImageSource(originalSrc)) return
    this.resetProcessedImageStateIfSourceChanged(img, originalSrc)
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
      img.dataset.watermarkProcessed = "true"
      img.setAttribute("data-ophel-wm-source", sourceForProcessing)
      img.setAttribute("data-ophel-wm-processed", "1")
      img.removeAttribute("data-ophel-wm-skip-source")
      img.removeAttribute("srcset")
      img.src = newUrl
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
    return normalizeGeminiImageUrl(src)
  }

  private startObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false
      for (const m of mutations) {
        if (m.addedNodes.length > 0) shouldCheck = true
        if (m.type === "attributes" && m.target instanceof HTMLImageElement) {
          this.resetProcessedImageStateIfSourceChanged(
            m.target,
            this.getCurrentImageSource(m.target),
          )
          shouldCheck = true
        }
      }
      if (shouldCheck) this.processExistingImages()
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcset"],
    })
    this.stopObserver = () => observer.disconnect()
  }
}
