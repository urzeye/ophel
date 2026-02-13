import { MSG_PROXY_FETCH, sendToBackground } from "~utils/messaging"

// 平台检测
declare const __PLATFORM__: "extension" | "userscript" | undefined
const isUserscript = typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"
declare const unsafeWindow: Window | undefined

const OPHEL_WATERMARK_FETCH_TOGGLE = "OPHEL_WATERMARK_FETCH_TOGGLE"
const OPHEL_WATERMARK_PROCESS_REQUEST = "OPHEL_WATERMARK_PROCESS_REQUEST"
const OPHEL_WATERMARK_PROCESS_RESPONSE = "OPHEL_WATERMARK_PROCESS_RESPONSE"
const GEMINI_GOOGLEUSERCONTENT_HOST_PATTERN = /^https:\/\/lh3\.googleusercontent\.com\//i

type GeminiImageAction = "copy" | "download"
type WatermarkConfig = {
  logoSize: 48 | 96
  marginRight: number
  marginBottom: number
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
  // 水印背景图片 Base64 (48x48)
  static BG_48 =
    "data:image/png;base64,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"

  // 水印背景图片 Base64 (96x96)
  static BG_96 =
    "data:image/png;base64,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"

  static ALPHA_THRESHOLD = 0.002
  static MAX_ALPHA = 0.99
  static LOGO_VALUE = 255
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
        ? await this.processImageBlobToDataUrl(sourceBlob)
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

  private detectWatermarkConfig(imageWidth: number, imageHeight: number): WatermarkConfig {
    if (imageWidth > 1024 && imageHeight > 1024) {
      return { logoSize: 96, marginRight: 64, marginBottom: 64 }
    }
    return { logoSize: 48, marginRight: 32, marginBottom: 32 }
  }

  private calculateWatermarkPosition(
    imageWidth: number,
    imageHeight: number,
    config: WatermarkConfig,
  ) {
    const { logoSize, marginRight, marginBottom } = config
    return {
      x: imageWidth - marginRight - logoSize,
      y: imageHeight - marginBottom - logoSize,
      width: logoSize,
      height: logoSize,
    }
  }

  private async loadBgImage(size: number): Promise<HTMLImageElement> {
    if (this.bgImages[size]) return this.bgImages[size]
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        this.bgImages[size] = img
        resolve(img)
      }
      img.onerror = reject
      img.src = size === 48 ? WatermarkRemover.BG_48 : WatermarkRemover.BG_96
    })
  }

  private async getAlphaMap(size: number): Promise<Float32Array> {
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

  private async processLoadedImageToDataUrl(loadedImg: HTMLImageElement): Promise<string> {
    const canvas = document.createElement("canvas")
    canvas.width = loadedImg.width
    canvas.height = loadedImg.height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Could not get canvas context")

    ctx.drawImage(loadedImg, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const config = this.detectWatermarkConfig(canvas.width, canvas.height)
    const position = this.calculateWatermarkPosition(canvas.width, canvas.height, config)
    const alphaMap = await this.getAlphaMap(config.logoSize)
    this.removeWatermark(imageData, alphaMap, position)
    ctx.putImageData(imageData, 0, 0)

    return canvas.toDataURL("image/png")
  }

  private async processImageSourceToDataUrl(source: string): Promise<string> {
    const loadedImg = await this.loadImageFromSource(source)
    return this.processLoadedImageToDataUrl(loadedImg)
  }

  private async processImageBlobToDataUrl(blob: Blob): Promise<string> {
    const blobUrl = URL.createObjectURL(blob)
    try {
      return await this.processImageSourceToDataUrl(blobUrl)
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
      const processedDataUrl = await this.processImageBlobToDataUrl(originalBlob)
      if (!options?.bypassCache) {
        this.processedDataUrlCache.set(normalizedSourceUrl, processedDataUrl)
        if (this.processedDataUrlCache.size > 100) {
          const oldestKey = this.processedDataUrlCache.keys().next().value
          if (oldestKey) {
            this.processedDataUrlCache.delete(oldestKey)
          }
        }
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

  private isValidGeminiImage(img: HTMLImageElement) {
    if (img.closest("generated-image,.generated-image-container")) {
      return true
    }

    return this.isLikelyGeneratedImage(img)
  }

  private findGeminiImages() {
    return [...document.querySelectorAll<HTMLImageElement>("img")].filter((img) => {
      const source = this.getImageSourceForAction(img)
      return (
        this.isValidGeminiImage(img) &&
        this.isSupportedGeminiImageSource(source) &&
        img.dataset.watermarkProcessed !== "true" &&
        img.dataset.watermarkProcessed !== "processing"
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
    if (this.processingQueue.has(originalSrc)) return
    this.processingQueue.add(originalSrc)
    img.dataset.watermarkProcessed = "processing"

    try {
      // 替换为原始尺寸URL（去除尺寸限制）
      const sourceForProcessing =
        originalSrc.startsWith("data:image/") || originalSrc.startsWith("blob:")
          ? originalSrc
          : this.replaceWithNormalSize(originalSrc)

      const newUrl = await this.resolveActionDataUrl(sourceForProcessing)
      img.src = newUrl
      img.dataset.watermarkProcessed = "true"
      img.setAttribute("data-ophel-wm-source", sourceForProcessing)
      img.setAttribute("data-ophel-wm-processed", "1")
    } catch {
      img.dataset.watermarkProcessed = "error"
      img.removeAttribute("data-ophel-wm-processed")
    } finally {
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
