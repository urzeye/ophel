import { MSG_PROXY_FETCH, sendToBackground } from "~utils/messaging"

// 平台检测
declare const __PLATFORM__: "extension" | "userscript" | undefined
const isUserscript = typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"
declare const unsafeWindow: Window | undefined

const OPHEL_WATERMARK_FETCH_TOGGLE = "OPHEL_WATERMARK_FETCH_TOGGLE"
const OPHEL_WATERMARK_PROCESS_REQUEST = "OPHEL_WATERMARK_PROCESS_REQUEST"
const OPHEL_WATERMARK_PROCESS_RESPONSE = "OPHEL_WATERMARK_PROCESS_RESPONSE"
const GEMINI_GOOGLEUSERCONTENT_HOST_PATTERN = /^https:\/\/lh3\.googleusercontent\.com\//i
const WATERMARK_NOT_DETECTED_ERROR = "watermark-not-detected"
const GEMINI_IMAGE_CONTAINER_SELECTOR = [
  "generated-image",
  ".generated-image-container",
  "single-image.generated-image",
  ".attachment-container.generated-images",
  "response-element",
  ".image-container.replace-fife-images-at-export",
  "[data-image-attachment-index]",
].join(", ")

type GeminiImageAction = "copy" | "download"
type WatermarkConfig = {
  logoSize: number
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
  confidence: number
  spatialScore: number
  gradientScore: number
  varianceScore: number
}

type WatermarkCandidate = {
  config: WatermarkConfig
  position: WatermarkPosition
  alphaMap: Float32Array
  metrics: WatermarkDetectionMetrics
  source: string
}

type ProcessedImageResult = {
  dataUrl: string
  watermarkRemoved: boolean
}

type DetectionContext = {
  gray: Float32Array
  grad: Float32Array
  width: number
  height: number
}

type TextureStats = {
  meanLum: number
  stdLum: number
}

type TextureAssessment = {
  texturePenalty: number
  tooDark: boolean
  tooFlat: boolean
  hardReject: boolean
}

type WatermarkRemovalTrial = {
  accepted: boolean
  imageData: ImageData
  config: WatermarkConfig
  position: WatermarkPosition
  alphaMap: Float32Array
  alphaGain: number
  metrics: WatermarkDetectionMetrics
  processedMetrics: WatermarkDetectionMetrics
  improvement: number
  gradientIncrease: number
  nearBlackIncrease: number
  texturePenalty: number
  validationCost: number
}

type TemplateWarp = {
  dx: number
  dy: number
  scale: number
}

type GeminiResolutionTier = "0.5k" | "1k" | "2k" | "4k"

type OfficialGeminiImageSize = {
  width: number
  height: number
  resolutionTier: GeminiResolutionTier
}

const WATERMARK_CONFIG_BY_TIER: Record<GeminiResolutionTier, WatermarkConfig> = {
  "0.5k": { logoSize: 48, marginRight: 32, marginBottom: 32 },
  "1k": { logoSize: 96, marginRight: 64, marginBottom: 64 },
  "2k": { logoSize: 96, marginRight: 64, marginBottom: 64 },
  "4k": { logoSize: 96, marginRight: 64, marginBottom: 64 },
}

const OFFICIAL_GEMINI_IMAGE_SIZES: readonly OfficialGeminiImageSize[] = [
  { width: 512, height: 512, resolutionTier: "0.5k" },
  { width: 256, height: 1024, resolutionTier: "0.5k" },
  { width: 192, height: 1536, resolutionTier: "0.5k" },
  { width: 424, height: 632, resolutionTier: "0.5k" },
  { width: 632, height: 424, resolutionTier: "0.5k" },
  { width: 448, height: 600, resolutionTier: "0.5k" },
  { width: 1024, height: 256, resolutionTier: "0.5k" },
  { width: 600, height: 448, resolutionTier: "0.5k" },
  { width: 464, height: 576, resolutionTier: "0.5k" },
  { width: 576, height: 464, resolutionTier: "0.5k" },
  { width: 1536, height: 192, resolutionTier: "0.5k" },
  { width: 384, height: 688, resolutionTier: "0.5k" },
  { width: 688, height: 384, resolutionTier: "0.5k" },
  { width: 792, height: 168, resolutionTier: "0.5k" },
  { width: 1024, height: 1024, resolutionTier: "1k" },
  { width: 512, height: 2064, resolutionTier: "1k" },
  { width: 352, height: 2928, resolutionTier: "1k" },
  { width: 848, height: 1264, resolutionTier: "1k" },
  { width: 1264, height: 848, resolutionTier: "1k" },
  { width: 896, height: 1200, resolutionTier: "1k" },
  { width: 2064, height: 512, resolutionTier: "1k" },
  { width: 1200, height: 896, resolutionTier: "1k" },
  { width: 928, height: 1152, resolutionTier: "1k" },
  { width: 1152, height: 928, resolutionTier: "1k" },
  { width: 2928, height: 352, resolutionTier: "1k" },
  { width: 768, height: 1376, resolutionTier: "1k" },
  { width: 1376, height: 768, resolutionTier: "1k" },
  { width: 1408, height: 768, resolutionTier: "1k" },
  { width: 1584, height: 672, resolutionTier: "1k" },
  { width: 2048, height: 2048, resolutionTier: "2k" },
  { width: 512, height: 2048, resolutionTier: "2k" },
  { width: 384, height: 3072, resolutionTier: "2k" },
  { width: 1696, height: 2528, resolutionTier: "2k" },
  { width: 2528, height: 1696, resolutionTier: "2k" },
  { width: 1792, height: 2400, resolutionTier: "2k" },
  { width: 2048, height: 512, resolutionTier: "2k" },
  { width: 2400, height: 1792, resolutionTier: "2k" },
  { width: 1856, height: 2304, resolutionTier: "2k" },
  { width: 2304, height: 1856, resolutionTier: "2k" },
  { width: 3072, height: 384, resolutionTier: "2k" },
  { width: 1536, height: 2752, resolutionTier: "2k" },
  { width: 2752, height: 1536, resolutionTier: "2k" },
  { width: 3168, height: 1344, resolutionTier: "2k" },
  { width: 4096, height: 4096, resolutionTier: "4k" },
  { width: 2048, height: 8192, resolutionTier: "4k" },
  { width: 1536, height: 12288, resolutionTier: "4k" },
  { width: 3392, height: 5056, resolutionTier: "4k" },
  { width: 5056, height: 3392, resolutionTier: "4k" },
  { width: 3584, height: 4800, resolutionTier: "4k" },
  { width: 8192, height: 2048, resolutionTier: "4k" },
  { width: 4800, height: 3584, resolutionTier: "4k" },
  { width: 3712, height: 4608, resolutionTier: "4k" },
  { width: 4608, height: 3712, resolutionTier: "4k" },
  { width: 12288, height: 1536, resolutionTier: "4k" },
  { width: 3072, height: 5504, resolutionTier: "4k" },
  { width: 5504, height: 3072, resolutionTier: "4k" },
  { width: 6336, height: 2688, resolutionTier: "4k" },
  { width: 1024, height: 1024, resolutionTier: "1k" },
  { width: 832, height: 1248, resolutionTier: "1k" },
  { width: 1248, height: 832, resolutionTier: "1k" },
  { width: 864, height: 1184, resolutionTier: "1k" },
  { width: 1184, height: 864, resolutionTier: "1k" },
  { width: 896, height: 1152, resolutionTier: "1k" },
  { width: 1152, height: 896, resolutionTier: "1k" },
  { width: 768, height: 1344, resolutionTier: "1k" },
  { width: 1344, height: 768, resolutionTier: "1k" },
  { width: 1536, height: 672, resolutionTier: "1k" },
]

const OFFICIAL_GEMINI_IMAGE_SIZE_INDEX = new Map(
  OFFICIAL_GEMINI_IMAGE_SIZES.map((entry) => [`${entry.width}x${entry.height}`, entry]),
)

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

  static WATERMARK_CONFIGS: readonly WatermarkConfig[] = [
    { logoSize: 48, marginRight: 32, marginBottom: 32 },
    { logoSize: 96, marginRight: 64, marginBottom: 64 },
  ]
  static ALPHA_NOISE_FLOOR = 3 / 255
  static ALPHA_THRESHOLD = 0.002
  static MAX_ALPHA = 0.99
  static LOGO_VALUE = 255
  static DETECTION_MIN_CONFIDENCE = 0.14
  static DETECTION_MIN_SPATIAL_SCORE = 0.18
  static DETECTION_MIN_GRADIENT_SCORE = 0.05
  static MAX_NEAR_BLACK_RATIO_INCREASE = 0.05
  static VALIDATION_MIN_IMPROVEMENT = 0.08
  static VALIDATION_TARGET_RESIDUAL = 0.22
  static VALIDATION_MAX_GRADIENT_INCREASE = 0.04
  static MAX_VALIDATION_CANDIDATES = 8
  static TEXTURE_REFERENCE_MARGIN = 1
  static TEXTURE_STD_FLOOR_RATIO = 0.8
  static TEXTURE_DARKNESS_VISIBILITY_HARD_REJECT_THRESHOLD = 1.5
  static TEXTURE_DARKNESS_HARD_REJECT_PENALTY_THRESHOLD = 0.5
  static TEXTURE_FLATNESS_HARD_REJECT_PENALTY_THRESHOLD = 0.2
  static NEAR_BLACK_THRESHOLD = 5
  static TEMPLATE_ALIGN_SHIFTS = [-0.5, -0.25, 0, 0.25, 0.5]
  static TEMPLATE_ALIGN_SCALES = [0.99, 1, 1.01]
  static ALPHA_GAIN_CANDIDATES = [1.05, 1.12, 1.2, 1.28, 1.36, 1.45, 1.6, 1.85]
  static STANDARD_SIZE_JITTERS = [-12, -8, -4, 4, 8, 12]
  static PREVIEW_ANCHOR_MIN_SIZE = 24
  static PREVIEW_ANCHOR_MIN_SIZE_RATIO = 0.55
  static PREVIEW_ANCHOR_MAX_SIZE_RATIO = 1.05
  static PREVIEW_ANCHOR_MARGIN_WINDOW = 16
  static PREVIEW_ANCHOR_MARGIN_EXTENSION = 8
  static PREVIEW_ANCHOR_SIZE_STEP = 2
  static PREVIEW_ANCHOR_MARGIN_STEP = 4
  static PREVIEW_ANCHOR_TOP_K = 8
  static PREVIEW_ANCHOR_MIN_SCORE = 0.2
  static PREVIEW_ANCHOR_LOCAL_DELTAS = [-1, 0, 1]
  private alphaMaps: Record<number, Float32Array> = {}
  private bgImages: Record<number, HTMLImageElement> = {}
  private alphaGradientCache = new WeakMap<Float32Array, Float32Array>()
  private processingQueue = new Set<string>()
  private processingMap = new Map<string, Promise<ProcessedImageResult>>()
  private processedDataUrlCache = new Map<string, string>()
  private enabled = false
  private stopObserver: (() => void) | null = null
  private mainWorldMessageListener: ((event: MessageEvent) => void) | null = null
  private actionButtonListener: ((event: MouseEvent) => void) | null = null
  private userscriptOriginalFetch: typeof fetch | null = null

  constructor() {
    this.alphaMaps = {}
    this.bgImages = {}
    this.alphaGradientCache = new WeakMap()
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

      const processedImage = sourceBlob
        ? this.ensureWatermarkRemoved(await this.processImageBlobToDataUrl(sourceBlob))
        : await this.getProcessedImageResult(sourceUrl, {
            requireWatermarkRemoval: true,
          })

      this.postMainWorldProcessResponse({
        requestId,
        success: true,
        dataUrl: processedImage.dataUrl,
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
        const processedImage = await this.getProcessedImageResult(requestUrl, {
          requireWatermarkRemoval: true,
        })
        const processedBlob = await this.dataUrlToBlob(processedImage.dataUrl)
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
    if (action === "copy" && el.closest("copy-button")) {
      return true
    }

    if (
      action === "download" &&
      el.closest(
        "download-generated-image-button, [data-test-id='download-generated-image-button']",
      )
    ) {
      return true
    }

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
      ?.closest(GEMINI_IMAGE_CONTAINER_SELECTOR)

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

  private async resolveActionImage(source: string): Promise<ProcessedImageResult> {
    if (source.startsWith("data:image/") || source.startsWith("blob:")) {
      return this.processImageSourceToDataUrl(source)
    }

    return this.getProcessedImageResult(source)
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

  private async resolveProcessedImageForAction(
    source: string,
    action: GeminiImageAction,
  ): Promise<ProcessedImageResult> {
    if (source.startsWith("data:image/") || source.startsWith("blob:")) {
      return this.resolveActionImage(source)
    }

    try {
      return await this.getProcessedImageResult(source, {
        bypassCache: true,
        requireNonPreviewSource: true,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (action === "copy" && message === "fullsize-source-unavailable") {
        return this.getProcessedImageResult(source, {
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
      const processedImage = await this.resolveProcessedImageForAction(source, actionInfo.action)

      if (relatedImage && processedImage.watermarkRemoved) {
        relatedImage.setAttribute("data-ophel-wm-processed", "1")
      }

      if (actionInfo.action === "copy") {
        await this.writeImageToClipboard(processedImage.dataUrl)
      } else {
        this.triggerDownloadFromDataUrl(processedImage.dataUrl)
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

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }

  private normalizeDimension(value: number): number | null {
    if (!Number.isFinite(value)) return null
    const rounded = Math.round(value)
    return rounded > 0 ? rounded : null
  }

  private buildConfigKey(config: WatermarkConfig): string {
    return `${config.logoSize}:${config.marginRight}:${config.marginBottom}`
  }

  private resolveOfficialGeminiWatermarkConfig(
    imageWidth: number,
    imageHeight: number,
  ): WatermarkConfig | null {
    const normalizedWidth = this.normalizeDimension(imageWidth)
    const normalizedHeight = this.normalizeDimension(imageHeight)
    if (!normalizedWidth || !normalizedHeight) return null
    const entry = OFFICIAL_GEMINI_IMAGE_SIZE_INDEX.get(`${normalizedWidth}x${normalizedHeight}`)
    if (!entry) return null
    return { ...WATERMARK_CONFIG_BY_TIER[entry.resolutionTier] }
  }

  private resolveOfficialGeminiSearchConfigs(
    imageWidth: number,
    imageHeight: number,
    limit = 3,
  ): WatermarkConfig[] {
    const normalizedWidth = this.normalizeDimension(imageWidth)
    const normalizedHeight = this.normalizeDimension(imageHeight)
    if (!normalizedWidth || !normalizedHeight) return []

    const exact = this.resolveOfficialGeminiWatermarkConfig(normalizedWidth, normalizedHeight)
    if (exact) return [exact]

    const targetAspectRatio = normalizedWidth / normalizedHeight
    const ranked = OFFICIAL_GEMINI_IMAGE_SIZES.map((entry) => {
      const baseConfig = WATERMARK_CONFIG_BY_TIER[entry.resolutionTier]
      const scaleX = normalizedWidth / entry.width
      const scaleY = normalizedHeight / entry.height
      const scale = (scaleX + scaleY) / 2
      const entryAspectRatio = entry.width / entry.height
      const relativeAspectRatioDelta =
        Math.abs(targetAspectRatio - entryAspectRatio) / entryAspectRatio
      const scaleMismatchRatio = Math.abs(scaleX - scaleY) / Math.max(scaleX, scaleY)
      if (relativeAspectRatioDelta > 0.02 || scaleMismatchRatio > 0.12) return null

      const config: WatermarkConfig = {
        logoSize: this.clamp(Math.round(baseConfig.logoSize * scale), 24, 192),
        marginRight: Math.max(8, Math.round(baseConfig.marginRight * scaleX)),
        marginBottom: Math.max(8, Math.round(baseConfig.marginBottom * scaleY)),
      }
      const position = this.calculateWatermarkPosition(normalizedWidth, normalizedHeight, config)
      if (!this.isWatermarkPositionInsideImage(normalizedWidth, normalizedHeight, position)) {
        return null
      }

      return {
        config,
        score:
          relativeAspectRatioDelta * 100 +
          scaleMismatchRatio * 20 +
          Math.abs(Math.log2(Math.max(scale, 1e-6))),
      }
    })
      .filter((entry): entry is { config: WatermarkConfig; score: number } => !!entry)
      .sort((a, b) => a.score - b.score)

    const deduped: WatermarkConfig[] = []
    const seen = new Set<string>()
    for (const entry of ranked) {
      const key = this.buildConfigKey(entry.config)
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(entry.config)
      if (deduped.length >= limit) break
    }
    return deduped
  }

  private getCandidateWatermarkConfigs(imageWidth: number, imageHeight: number): WatermarkConfig[] {
    const defaultConfig =
      this.resolveOfficialGeminiWatermarkConfig(imageWidth, imageHeight) ||
      (imageWidth > 1024 && imageHeight > 1024
        ? { ...WatermarkRemover.WATERMARK_CONFIGS[1] }
        : { ...WatermarkRemover.WATERMARK_CONFIGS[0] })

    const alternateConfig =
      defaultConfig.logoSize >= 96
        ? { ...WatermarkRemover.WATERMARK_CONFIGS[0] }
        : { ...WatermarkRemover.WATERMARK_CONFIGS[1] }

    const configs = [
      defaultConfig,
      alternateConfig,
      ...this.resolveOfficialGeminiSearchConfigs(imageWidth, imageHeight),
    ]
    const seen = new Set<string>()
    const deduped: WatermarkConfig[] = []

    for (const config of configs) {
      const key = this.buildConfigKey(config)
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(config)
    }

    return deduped
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

  private cloneImageData(imageData: ImageData): ImageData {
    return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height)
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

  private interpolateAlphaMap(
    sourceAlpha: Float32Array,
    sourceSize: number,
    targetSize: number,
  ): Float32Array {
    if (targetSize <= 0) return new Float32Array(0)
    if (sourceSize === targetSize) return new Float32Array(sourceAlpha)

    const out = new Float32Array(targetSize * targetSize)
    const scale = (sourceSize - 1) / Math.max(1, targetSize - 1)
    for (let y = 0; y < targetSize; y++) {
      const sy = y * scale
      const y0 = Math.floor(sy)
      const y1 = Math.min(sourceSize - 1, y0 + 1)
      const fy = sy - y0
      for (let x = 0; x < targetSize; x++) {
        const sx = x * scale
        const x0 = Math.floor(sx)
        const x1 = Math.min(sourceSize - 1, x0 + 1)
        const fx = sx - x0
        const p00 = sourceAlpha[y0 * sourceSize + x0]
        const p10 = sourceAlpha[y0 * sourceSize + x1]
        const p01 = sourceAlpha[y1 * sourceSize + x0]
        const p11 = sourceAlpha[y1 * sourceSize + x1]
        const top = p00 + (p10 - p00) * fx
        const bottom = p01 + (p11 - p01) * fx
        out[y * targetSize + x] = top + (bottom - top) * fy
      }
    }
    return out
  }

  private warpAlphaMap(
    alphaMap: Float32Array,
    size: number,
    { dx = 0, dy = 0, scale = 1 }: TemplateWarp,
  ): Float32Array {
    if (size <= 0) return new Float32Array(0)
    if (dx === 0 && dy === 0 && scale === 1) return new Float32Array(alphaMap)

    const sample = (x: number, y: number) => {
      const x0 = Math.floor(x)
      const y0 = Math.floor(y)
      const fx = x - x0
      const fy = y - y0
      const ix0 = this.clamp(x0, 0, size - 1)
      const iy0 = this.clamp(y0, 0, size - 1)
      const ix1 = this.clamp(x0 + 1, 0, size - 1)
      const iy1 = this.clamp(y0 + 1, 0, size - 1)
      const p00 = alphaMap[iy0 * size + ix0]
      const p10 = alphaMap[iy0 * size + ix1]
      const p01 = alphaMap[iy1 * size + ix0]
      const p11 = alphaMap[iy1 * size + ix1]
      const top = p00 + (p10 - p00) * fx
      const bottom = p01 + (p11 - p01) * fx
      return top + (bottom - top) * fy
    }

    const out = new Float32Array(size * size)
    const center = (size - 1) / 2
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const sx = (x - center) / scale + center + dx
        const sy = (y - center) / scale + center + dy
        out[y * size + x] = sample(sx, sy)
      }
    }
    return out
  }

  private meanAndVariance(values: Float32Array): { mean: number; variance: number } {
    let sum = 0
    for (let i = 0; i < values.length; i++) sum += values[i]
    const mean = values.length > 0 ? sum / values.length : 0
    let sq = 0
    for (let i = 0; i < values.length; i++) {
      const delta = values[i] - mean
      sq += delta * delta
    }
    return { mean, variance: values.length > 0 ? sq / values.length : 0 }
  }

  private normalizedCrossCorrelation(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length || a.length === 0) return 0
    const statsA = this.meanAndVariance(a)
    const statsB = this.meanAndVariance(b)
    const denominator = Math.sqrt(statsA.variance * statsB.variance) * a.length
    if (denominator < 1e-8) return 0

    let numerator = 0
    for (let i = 0; i < a.length; i++) {
      numerator += (a[i] - statsA.mean) * (b[i] - statsB.mean)
    }
    return numerator / denominator
  }

  private toGrayscale(imageData: ImageData): Float32Array {
    const { width, height, data } = imageData
    const gray = new Float32Array(width * height)
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4
      gray[i] = (0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2]) / 255
    }
    return gray
  }

  private getRegion(
    data: Float32Array,
    width: number,
    x: number,
    y: number,
    size: number,
    height = Math.ceil(data.length / Math.max(width, 1)),
  ): Float32Array {
    if (size <= 0 || x < 0 || y < 0 || x + size > width || y + size > height) {
      return new Float32Array(0)
    }
    const out = new Float32Array(size * size)
    for (let row = 0; row < size; row++) {
      const sourceBase = (y + row) * width + x
      const targetBase = row * size
      for (let col = 0; col < size; col++) {
        out[targetBase + col] = data[sourceBase + col]
      }
    }
    return out
  }

  private toRegionGrayscale(imageData: ImageData, position: WatermarkPosition): Float32Array {
    const size = Math.min(position.width, position.height)
    if (!this.isWatermarkPositionInsideImage(imageData.width, imageData.height, position)) {
      return new Float32Array(0)
    }

    const out = new Float32Array(size * size)
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const idx = ((position.y + row) * imageData.width + (position.x + col)) * 4
        out[row * size + col] =
          (0.2126 * imageData.data[idx] +
            0.7152 * imageData.data[idx + 1] +
            0.0722 * imageData.data[idx + 2]) /
          255
      }
    }
    return out
  }

  private sobelMagnitude(data: Float32Array, width: number, height: number): Float32Array {
    const grad = new Float32Array(width * height)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x
        const gx =
          -data[i - width - 1] -
          2 * data[i - 1] -
          data[i + width - 1] +
          data[i - width + 1] +
          2 * data[i + 1] +
          data[i + width + 1]
        const gy =
          -data[i - width - 1] -
          2 * data[i - width] -
          data[i - width + 1] +
          data[i + width - 1] +
          2 * data[i + width] +
          data[i + width + 1]
        grad[i] = Math.sqrt(gx * gx + gy * gy)
      }
    }
    return grad
  }

  private stdDevRegion(
    data: Float32Array,
    width: number,
    x: number,
    y: number,
    size: number,
  ): number {
    let sum = 0
    let sq = 0
    let total = 0
    for (let row = 0; row < size; row++) {
      const base = (y + row) * width + x
      for (let col = 0; col < size; col++) {
        const value = data[base + col]
        sum += value
        sq += value * value
        total += 1
      }
    }
    if (total === 0) return 0
    const mean = sum / total
    return Math.sqrt(Math.max(0, sq / total - mean * mean))
  }

  private getTemplateGradient(alphaMap: Float32Array, size: number): Float32Array {
    const cached = this.alphaGradientCache.get(alphaMap)
    if (cached) return cached
    const gradient = this.sobelMagnitude(alphaMap, size, size)
    this.alphaGradientCache.set(alphaMap, gradient)
    return gradient
  }

  private buildDetectionContext(imageData: ImageData): DetectionContext {
    const gray = this.toGrayscale(imageData)
    return {
      gray,
      grad: this.sobelMagnitude(gray, imageData.width, imageData.height),
      width: imageData.width,
      height: imageData.height,
    }
  }

  private measureWatermarkCandidate(
    imageData: ImageData,
    alphaMap: Float32Array,
    position: WatermarkPosition,
    context?: DetectionContext,
    includeVariance = true,
  ): WatermarkDetectionMetrics {
    const size = position.width
    if (
      !alphaMap ||
      alphaMap.length !== size * size ||
      !this.isWatermarkPositionInsideImage(imageData.width, imageData.height, position)
    ) {
      return {
        confidence: 0,
        spatialScore: 0,
        gradientScore: 0,
        varianceScore: 0,
      }
    }

    const grayRegion = context
      ? this.getRegion(context.gray, context.width, position.x, position.y, size)
      : this.toRegionGrayscale(imageData, position)
    if (grayRegion.length === 0 || grayRegion.length !== alphaMap.length) {
      return {
        confidence: 0,
        spatialScore: 0,
        gradientScore: 0,
        varianceScore: 0,
      }
    }

    const gradRegion = context
      ? this.getRegion(context.grad, context.width, position.x, position.y, size)
      : this.sobelMagnitude(grayRegion, size, size)
    const spatialScore = this.normalizedCrossCorrelation(grayRegion, alphaMap)
    const gradientScore = this.normalizedCrossCorrelation(
      gradRegion,
      this.getTemplateGradient(alphaMap, size),
    )

    let varianceScore = 0
    if (includeVariance && position.y > 8) {
      const referenceY = Math.max(0, position.y - size)
      const referenceHeight = Math.min(size, position.y - referenceY)
      if (referenceHeight > 8) {
        const sourceGray = context?.gray || this.toGrayscale(imageData)
        const watermarkStd = this.stdDevRegion(
          sourceGray,
          imageData.width,
          position.x,
          position.y,
          size,
        )
        const referenceStd = this.stdDevRegion(
          sourceGray,
          imageData.width,
          position.x,
          referenceY,
          referenceHeight,
        )
        if (referenceStd > 1e-8) {
          varianceScore = this.clamp(1 - watermarkStd / referenceStd, 0, 1)
        }
      }
    }

    return {
      confidence: this.clamp(
        Math.max(0, spatialScore) * 0.5 + Math.max(0, gradientScore) * 0.3 + varianceScore * 0.2,
        0,
        1,
      ),
      spatialScore,
      gradientScore,
      varianceScore,
    }
  }

  private getWatermarkSearchOffsets(logoSize: number): number[] {
    const step = logoSize >= 96 ? 6 : 4
    const radius = logoSize >= 96 ? 24 : 12
    const offsets = [0]
    for (let offset = step; offset <= radius; offset += step) {
      offsets.push(-offset, offset)
    }
    return offsets
  }

  private removeWatermark(
    imageData: ImageData,
    alphaMap: Float32Array,
    position: WatermarkPosition,
    alphaGain = 1,
  ) {
    const { x, y, width, height } = position
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const imageIndex = ((y + row) * imageData.width + (x + col)) * 4
        const alphaIndex = row * width + col
        const rawAlpha = alphaMap[alphaIndex]
        const signalAlpha = Math.max(0, rawAlpha - WatermarkRemover.ALPHA_NOISE_FLOOR) * alphaGain
        if (signalAlpha < WatermarkRemover.ALPHA_THRESHOLD) continue

        const alpha = Math.min(rawAlpha * alphaGain, WatermarkRemover.MAX_ALPHA)
        const oneMinusAlpha = 1 - alpha
        for (let channel = 0; channel < 3; channel++) {
          const watermarked = imageData.data[imageIndex + channel]
          const original =
            (watermarked - alpha * WatermarkRemover.LOGO_VALUE) / Math.max(oneMinusAlpha, 0.01)
          imageData.data[imageIndex + channel] = Math.max(0, Math.min(255, Math.round(original)))
        }
      }
    }
  }

  private calculateNearBlackRatio(imageData: ImageData, position: WatermarkPosition): number {
    let nearBlack = 0
    let total = 0
    for (let row = 0; row < position.height; row++) {
      for (let col = 0; col < position.width; col++) {
        const idx = ((position.y + row) * imageData.width + (position.x + col)) * 4
        const r = imageData.data[idx]
        const g = imageData.data[idx + 1]
        const b = imageData.data[idx + 2]
        if (
          r <= WatermarkRemover.NEAR_BLACK_THRESHOLD &&
          g <= WatermarkRemover.NEAR_BLACK_THRESHOLD &&
          b <= WatermarkRemover.NEAR_BLACK_THRESHOLD
        ) {
          nearBlack += 1
        }
        total += 1
      }
    }
    return total > 0 ? nearBlack / total : 0
  }

  private calculateRegionTextureStats(
    imageData: ImageData,
    position: WatermarkPosition,
  ): TextureStats {
    let sum = 0
    let sq = 0
    let total = 0
    for (let row = 0; row < position.height; row++) {
      for (let col = 0; col < position.width; col++) {
        const idx = ((position.y + row) * imageData.width + (position.x + col)) * 4
        const lum =
          0.2126 * imageData.data[idx] +
          0.7152 * imageData.data[idx + 1] +
          0.0722 * imageData.data[idx + 2]
        sum += lum
        sq += lum * lum
        total += 1
      }
    }
    const meanLum = total > 0 ? sum / total : 0
    const variance = total > 0 ? Math.max(0, sq / total - meanLum * meanLum) : 0
    return { meanLum, stdLum: Math.sqrt(variance) }
  }

  private getReferenceRegion(
    position: WatermarkPosition,
    imageData: ImageData,
  ): WatermarkPosition | null {
    const referenceY = position.y - position.height
    if (referenceY < 0) return null
    return {
      x: position.x,
      y: referenceY,
      width: position.width,
      height: position.height,
    }
  }

  private assessReferenceTextureAlignment(
    originalImageData: ImageData,
    candidateImageData: ImageData,
    position: WatermarkPosition,
  ): TextureAssessment {
    const referenceRegion = this.getReferenceRegion(position, originalImageData)
    if (!referenceRegion) {
      return { texturePenalty: 0, tooDark: false, tooFlat: false, hardReject: false }
    }

    const referenceStats = this.calculateRegionTextureStats(originalImageData, referenceRegion)
    const candidateStats = this.calculateRegionTextureStats(candidateImageData, position)
    const darknessPenalty =
      Math.max(
        0,
        referenceStats.meanLum - candidateStats.meanLum - WatermarkRemover.TEXTURE_REFERENCE_MARGIN,
      ) / Math.max(1, referenceStats.meanLum)
    const flatnessPenalty =
      Math.max(
        0,
        referenceStats.stdLum * WatermarkRemover.TEXTURE_STD_FLOOR_RATIO - candidateStats.stdLum,
      ) / Math.max(1, referenceStats.stdLum)
    const darknessVisibility =
      Math.max(
        0,
        referenceStats.meanLum - candidateStats.meanLum - WatermarkRemover.TEXTURE_REFERENCE_MARGIN,
      ) / Math.max(1, referenceStats.stdLum)
    const tooDark = darknessPenalty > 0
    const tooFlat = flatnessPenalty > 0
    const hardReject =
      (tooDark &&
        darknessVisibility >= WatermarkRemover.TEXTURE_DARKNESS_VISIBILITY_HARD_REJECT_THRESHOLD) ||
      (tooDark &&
        tooFlat &&
        darknessPenalty >= WatermarkRemover.TEXTURE_DARKNESS_HARD_REJECT_PENALTY_THRESHOLD &&
        flatnessPenalty >= WatermarkRemover.TEXTURE_FLATNESS_HARD_REJECT_PENALTY_THRESHOLD)

    return {
      texturePenalty: darknessPenalty * 2 + flatnessPenalty * 2,
      tooDark,
      tooFlat,
      hardReject,
    }
  }

  private hasDetectableWatermark(metrics: WatermarkDetectionMetrics): boolean {
    return (
      metrics.confidence >= WatermarkRemover.DETECTION_MIN_CONFIDENCE ||
      metrics.spatialScore >= WatermarkRemover.DETECTION_MIN_SPATIAL_SCORE ||
      metrics.gradientScore >= WatermarkRemover.DETECTION_MIN_GRADIENT_SCORE
    )
  }

  private shouldEscalateSearch(trial: WatermarkRemovalTrial): boolean {
    return (
      Math.abs(trial.processedMetrics.spatialScore) > WatermarkRemover.VALIDATION_TARGET_RESIDUAL ||
      Math.max(0, trial.processedMetrics.gradientScore) > 0.08 ||
      !trial.accepted
    )
  }

  private materializeCandidateImageData(
    originalImageData: ImageData,
    alphaMap: Float32Array,
    position: WatermarkPosition,
    alphaGain: number,
  ): ImageData {
    const candidate = this.cloneImageData(originalImageData)
    this.removeWatermark(candidate, alphaMap, position, alphaGain)
    return candidate
  }

  private evaluateRestorationCandidate(
    originalImageData: ImageData,
    candidate: WatermarkCandidate,
    alphaMap = candidate.alphaMap,
    alphaGain = 1,
  ): WatermarkRemovalTrial {
    const originalMetrics =
      alphaMap === candidate.alphaMap && alphaGain === 1
        ? candidate.metrics
        : this.measureWatermarkCandidate(originalImageData, alphaMap, candidate.position)
    const imageData = this.materializeCandidateImageData(
      originalImageData,
      alphaMap,
      candidate.position,
      alphaGain,
    )
    const processedMetrics = this.measureWatermarkCandidate(
      imageData,
      alphaMap,
      candidate.position,
      undefined,
      false,
    )
    const baselineNearBlackRatio = this.calculateNearBlackRatio(
      originalImageData,
      candidate.position,
    )
    const nearBlackIncrease =
      this.calculateNearBlackRatio(imageData, candidate.position) - baselineNearBlackRatio
    const improvement = originalMetrics.spatialScore - processedMetrics.spatialScore
    const gradientIncrease = processedMetrics.gradientScore - originalMetrics.gradientScore
    const textureAssessment = this.assessReferenceTextureAlignment(
      originalImageData,
      imageData,
      candidate.position,
    )
    const accepted =
      !textureAssessment.hardReject &&
      nearBlackIncrease <= WatermarkRemover.MAX_NEAR_BLACK_RATIO_INCREASE &&
      improvement >= WatermarkRemover.VALIDATION_MIN_IMPROVEMENT &&
      (Math.abs(processedMetrics.spatialScore) <= WatermarkRemover.VALIDATION_TARGET_RESIDUAL ||
        gradientIncrease <= WatermarkRemover.VALIDATION_MAX_GRADIENT_INCREASE)

    return {
      accepted,
      imageData,
      config: candidate.config,
      position: candidate.position,
      alphaMap,
      alphaGain,
      metrics: originalMetrics,
      processedMetrics,
      improvement,
      gradientIncrease,
      nearBlackIncrease,
      texturePenalty: textureAssessment.texturePenalty,
      validationCost:
        Math.abs(processedMetrics.spatialScore) +
        Math.max(0, processedMetrics.gradientScore) * 0.6 +
        Math.max(0, nearBlackIncrease) * 3 +
        textureAssessment.texturePenalty,
    }
  }

  private pickBetterRemovalTrial(
    current: WatermarkRemovalTrial | null,
    candidate: WatermarkRemovalTrial | null,
    minCostDelta = 0.002,
  ): WatermarkRemovalTrial | null {
    if (!candidate) return current
    if (!current) return candidate
    if (candidate.accepted !== current.accepted) {
      return candidate.accepted ? candidate : current
    }
    if (candidate.validationCost < current.validationCost - minCostDelta) {
      return candidate
    }
    if (
      Math.abs(candidate.validationCost - current.validationCost) <= minCostDelta &&
      candidate.improvement > current.improvement + minCostDelta
    ) {
      return candidate
    }
    if (candidate.metrics.confidence > current.metrics.confidence + 0.01) {
      return candidate
    }
    return current
  }

  private findBestTemplateWarp(
    imageData: ImageData,
    candidate: WatermarkCandidate,
  ): { alphaMap: Float32Array; shift: TemplateWarp } | null {
    const size = candidate.position.width
    if (!size || size <= 8) return null

    let bestMetrics = candidate.metrics
    let bestAlphaMap = candidate.alphaMap
    let bestShift: TemplateWarp = { dx: 0, dy: 0, scale: 1 }
    let bestConfidence =
      Math.max(0, candidate.metrics.spatialScore) * 0.7 +
      Math.max(0, candidate.metrics.gradientScore) * 0.3

    for (const scale of WatermarkRemover.TEMPLATE_ALIGN_SCALES) {
      for (const dy of WatermarkRemover.TEMPLATE_ALIGN_SHIFTS) {
        for (const dx of WatermarkRemover.TEMPLATE_ALIGN_SHIFTS) {
          if (dx === 0 && dy === 0 && scale === 1) continue
          const warpedAlphaMap = this.warpAlphaMap(candidate.alphaMap, size, { dx, dy, scale })
          const metrics = this.measureWatermarkCandidate(
            imageData,
            warpedAlphaMap,
            candidate.position,
            undefined,
            false,
          )
          const confidence =
            Math.max(0, metrics.spatialScore) * 0.7 + Math.max(0, metrics.gradientScore) * 0.3
          if (confidence > bestConfidence + 0.01) {
            bestMetrics = metrics
            bestAlphaMap = warpedAlphaMap
            bestShift = { dx, dy, scale }
            bestConfidence = confidence
          }
        }
      }
    }

    const improvedSpatial = bestMetrics.spatialScore >= candidate.metrics.spatialScore + 0.01
    const improvedGradient = bestMetrics.gradientScore >= candidate.metrics.gradientScore + 0.01
    return improvedSpatial || improvedGradient ? { alphaMap: bestAlphaMap, shift: bestShift } : null
  }

  private async buildPreviewAnchorCandidates(
    imageData: ImageData,
    context: DetectionContext,
    baseConfig: WatermarkConfig,
  ): Promise<WatermarkCandidate[]> {
    if (baseConfig.logoSize !== 48) return []

    const minSize = Math.max(
      WatermarkRemover.PREVIEW_ANCHOR_MIN_SIZE,
      Math.round(baseConfig.logoSize * WatermarkRemover.PREVIEW_ANCHOR_MIN_SIZE_RATIO),
    )
    const maxSize = Math.max(
      minSize,
      Math.round(baseConfig.logoSize * WatermarkRemover.PREVIEW_ANCHOR_MAX_SIZE_RATIO),
    )
    const minMarginRight = Math.max(
      8,
      baseConfig.marginRight - WatermarkRemover.PREVIEW_ANCHOR_MARGIN_WINDOW,
    )
    const maxMarginRight = baseConfig.marginRight + WatermarkRemover.PREVIEW_ANCHOR_MARGIN_EXTENSION
    const minMarginBottom = Math.max(
      8,
      baseConfig.marginBottom - WatermarkRemover.PREVIEW_ANCHOR_MARGIN_WINDOW,
    )
    const maxMarginBottom =
      baseConfig.marginBottom + WatermarkRemover.PREVIEW_ANCHOR_MARGIN_EXTENSION

    const alphaMaps = new Map<number, Float32Array>()
    const getPreviewAlphaMap = async (size: number) => {
      const cached = alphaMaps.get(size)
      if (cached) return cached
      const alphaMap = await this.getAlphaMap(size)
      alphaMaps.set(size, alphaMap)
      return alphaMap
    }
    for (let size = minSize; size <= maxSize; size += WatermarkRemover.PREVIEW_ANCHOR_SIZE_STEP) {
      alphaMaps.set(size, await getPreviewAlphaMap(size))
    }

    const coarseCandidates: Array<WatermarkCandidate & { coarseScore: number }> = []
    const pushTopCandidate = (candidate: WatermarkCandidate & { coarseScore: number }) => {
      coarseCandidates.push(candidate)
      coarseCandidates.sort((a, b) => b.coarseScore - a.coarseScore)
      if (coarseCandidates.length > WatermarkRemover.PREVIEW_ANCHOR_TOP_K) {
        coarseCandidates.length = WatermarkRemover.PREVIEW_ANCHOR_TOP_K
      }
    }

    for (let size = minSize; size <= maxSize; size += WatermarkRemover.PREVIEW_ANCHOR_SIZE_STEP) {
      const alphaMap = alphaMaps.get(size)
      if (!alphaMap) continue
      for (
        let marginRight = minMarginRight;
        marginRight <= maxMarginRight;
        marginRight += WatermarkRemover.PREVIEW_ANCHOR_MARGIN_STEP
      ) {
        for (
          let marginBottom = minMarginBottom;
          marginBottom <= maxMarginBottom;
          marginBottom += WatermarkRemover.PREVIEW_ANCHOR_MARGIN_STEP
        ) {
          const config: WatermarkConfig = { logoSize: size, marginRight, marginBottom }
          const position = this.calculateWatermarkPosition(
            imageData.width,
            imageData.height,
            config,
          )
          if (!this.isWatermarkPositionInsideImage(imageData.width, imageData.height, position)) {
            continue
          }
          const metrics = this.measureWatermarkCandidate(
            imageData,
            alphaMap,
            position,
            context,
            false,
          )
          const coarseScore =
            Math.max(0, metrics.gradientScore) * 0.6 + Math.max(0, metrics.spatialScore) * 0.4
          if (coarseScore < WatermarkRemover.PREVIEW_ANCHOR_MIN_SCORE) continue
          pushTopCandidate({
            config,
            position,
            alphaMap,
            metrics,
            source: "standard+preview",
            coarseScore,
          })
        }
      }
    }

    const refinedCandidates: WatermarkCandidate[] = []
    const seen = new Set<string>()
    for (const coarseCandidate of coarseCandidates) {
      for (const sizeDelta of WatermarkRemover.PREVIEW_ANCHOR_LOCAL_DELTAS) {
        const size = coarseCandidate.position.width + sizeDelta
        if (size < minSize || size > maxSize) continue
        const alphaMap = await getPreviewAlphaMap(size)
        if (!alphaMap) continue
        for (const dx of WatermarkRemover.PREVIEW_ANCHOR_LOCAL_DELTAS) {
          for (const dy of WatermarkRemover.PREVIEW_ANCHOR_LOCAL_DELTAS) {
            const position: WatermarkPosition = {
              x: coarseCandidate.position.x + dx,
              y: coarseCandidate.position.y + dy,
              width: size,
              height: size,
            }
            if (!this.isWatermarkPositionInsideImage(imageData.width, imageData.height, position)) {
              continue
            }
            const key = `${position.x}:${position.y}:${position.width}`
            if (seen.has(key)) continue
            seen.add(key)
            refinedCandidates.push({
              config: {
                logoSize: size,
                marginRight: imageData.width - position.x - size,
                marginBottom: imageData.height - position.y - size,
              },
              position,
              alphaMap,
              metrics: this.measureWatermarkCandidate(imageData, alphaMap, position, context),
              source: "standard+preview",
            })
          }
        }
      }
    }

    refinedCandidates.sort((a, b) => b.metrics.confidence - a.metrics.confidence)
    return refinedCandidates.slice(0, WatermarkRemover.PREVIEW_ANCHOR_TOP_K)
  }

  private async buildWatermarkCandidates(imageData: ImageData): Promise<WatermarkCandidate[]> {
    const context = this.buildDetectionContext(imageData)
    const baseConfigs = this.getCandidateWatermarkConfigs(imageData.width, imageData.height)
    const expandedConfigs: WatermarkConfig[] = []
    const seenConfigs = new Set<string>()
    const addConfig = (config: WatermarkConfig) => {
      if (!Number.isFinite(config.logoSize) || config.logoSize < 24) return
      const key = this.buildConfigKey(config)
      if (seenConfigs.has(key)) return
      const position = this.calculateWatermarkPosition(imageData.width, imageData.height, config)
      if (!this.isWatermarkPositionInsideImage(imageData.width, imageData.height, position)) return
      seenConfigs.add(key)
      expandedConfigs.push(config)
    }

    for (const config of baseConfigs) {
      addConfig(config)
      for (const delta of WatermarkRemover.STANDARD_SIZE_JITTERS) {
        const jitteredConfig: WatermarkConfig = {
          logoSize: config.logoSize + delta,
          marginRight: config.marginRight,
          marginBottom: config.marginBottom,
        }
        addConfig(jitteredConfig)
      }
    }

    const uniqueSizes = Array.from(new Set(expandedConfigs.map((config) => config.logoSize)))
    const alphaMaps = new Map<number, Float32Array>(
      await Promise.all(
        uniqueSizes.map(async (size) => [size, await this.getAlphaMap(size)] as const),
      ),
    )

    const candidates: WatermarkCandidate[] = []
    const seenPositions = new Set<string>()
    for (const config of expandedConfigs) {
      const basePosition = this.calculateWatermarkPosition(
        imageData.width,
        imageData.height,
        config,
      )
      const offsets = this.getWatermarkSearchOffsets(config.logoSize)
      const alphaMap = alphaMaps.get(config.logoSize)
      if (!alphaMap) continue

      for (const offsetY of offsets) {
        for (const offsetX of offsets) {
          const position: WatermarkPosition = {
            x: basePosition.x + offsetX,
            y: basePosition.y + offsetY,
            width: basePosition.width,
            height: basePosition.height,
          }
          if (!this.isWatermarkPositionInsideImage(imageData.width, imageData.height, position)) {
            continue
          }
          const key = `${position.x}:${position.y}:${position.width}`
          if (seenPositions.has(key)) continue
          seenPositions.add(key)
          candidates.push({
            config,
            position,
            alphaMap,
            metrics: this.measureWatermarkCandidate(imageData, alphaMap, position, context),
            source: "standard",
          })
        }
      }
    }

    const previewBaseConfig =
      baseConfigs.find((config) => config.logoSize === 48) || WatermarkRemover.WATERMARK_CONFIGS[0]
    for (const previewCandidate of await this.buildPreviewAnchorCandidates(
      imageData,
      context,
      previewBaseConfig,
    )) {
      const key = `${previewCandidate.position.x}:${previewCandidate.position.y}:${previewCandidate.position.width}`
      if (seenPositions.has(key)) continue
      seenPositions.add(key)
      candidates.push(previewCandidate)
    }

    candidates.sort((a, b) => {
      if (b.metrics.confidence !== a.metrics.confidence) {
        return b.metrics.confidence - a.metrics.confidence
      }
      if (b.metrics.spatialScore !== a.metrics.spatialScore) {
        return b.metrics.spatialScore - a.metrics.spatialScore
      }
      if (b.metrics.gradientScore !== a.metrics.gradientScore) {
        return b.metrics.gradientScore - a.metrics.gradientScore
      }
      return a.config.logoSize - b.config.logoSize
    })

    return candidates
  }

  private async resolveValidatedWatermarkRemoval(imageData: ImageData): Promise<ImageData | null> {
    const candidates = await this.buildWatermarkCandidates(imageData)
    let validatedAttempts = 0
    let bestTrial: WatermarkRemovalTrial | null = null

    for (const candidate of candidates) {
      if (!this.hasDetectableWatermark(candidate.metrics)) {
        if (bestTrial?.accepted) break
        continue
      }

      let selectedTrial = this.evaluateRestorationCandidate(imageData, candidate)
      const warped = this.findBestTemplateWarp(imageData, candidate)
      if (warped) {
        selectedTrial =
          this.pickBetterRemovalTrial(
            selectedTrial,
            this.evaluateRestorationCandidate(imageData, candidate, warped.alphaMap),
          ) || selectedTrial
      }

      if (this.shouldEscalateSearch(selectedTrial)) {
        for (const alphaGain of WatermarkRemover.ALPHA_GAIN_CANDIDATES) {
          selectedTrial =
            this.pickBetterRemovalTrial(
              selectedTrial,
              this.evaluateRestorationCandidate(
                imageData,
                candidate,
                selectedTrial.alphaMap,
                alphaGain,
              ),
            ) || selectedTrial
        }
      }

      bestTrial = this.pickBetterRemovalTrial(bestTrial, selectedTrial)
      validatedAttempts += 1
      if (validatedAttempts >= WatermarkRemover.MAX_VALIDATION_CANDIDATES) {
        break
      }
    }

    return bestTrial?.accepted ? bestTrial.imageData : null
  }

  private ensureWatermarkRemoved(result: ProcessedImageResult): ProcessedImageResult {
    if (result.watermarkRemoved) {
      return result
    }

    throw new Error(WATERMARK_NOT_DETECTED_ERROR)
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

  private async getAlphaMap(size: number): Promise<Float32Array> {
    if (this.alphaMaps[size]) return this.alphaMaps[size]

    if (size !== 48 && size !== 96) {
      const alpha96 = await this.getAlphaMap(96)
      const alphaMap = this.interpolateAlphaMap(alpha96, 96, size)
      this.alphaMaps[size] = alphaMap
      return alphaMap
    }

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
  ): Promise<ProcessedImageResult> {
    const canvas = document.createElement("canvas")
    canvas.width = loadedImg.width
    canvas.height = loadedImg.height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Could not get canvas context")

    ctx.drawImage(loadedImg, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const processedImageData = await this.resolveValidatedWatermarkRemoval(imageData)
    const watermarkRemoved = !!processedImageData

    if (processedImageData) {
      ctx.putImageData(processedImageData, 0, 0)
    }

    return {
      dataUrl: canvas.toDataURL("image/png"),
      watermarkRemoved,
    }
  }

  private async processImageSourceToDataUrl(source: string): Promise<ProcessedImageResult> {
    const loadedImg = await this.loadImageFromSource(source)
    return this.processLoadedImageToDataUrl(loadedImg)
  }

  private async processImageBlobToDataUrl(blob: Blob): Promise<ProcessedImageResult> {
    const blobUrl = URL.createObjectURL(blob)
    try {
      return await this.processImageSourceToDataUrl(blobUrl)
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
  }

  private buildProcessingCacheKey(
    normalizedSourceUrl: string,
    options?: {
      requireNonPreviewSource?: boolean
      requireWatermarkRemoval?: boolean
    },
  ): string {
    const previewMode = options?.requireNonPreviewSource ? "fullsize" : "any"
    const detectionMode = options?.requireWatermarkRemoval ? "required" : "optional"
    return `${normalizedSourceUrl}|${previewMode}|${detectionMode}`
  }

  private async getProcessedImageResult(
    sourceUrl: string,
    options?: {
      bypassCache?: boolean
      requireNonPreviewSource?: boolean
      requireWatermarkRemoval?: boolean
    },
  ): Promise<ProcessedImageResult> {
    const normalizedSourceUrl = this.replaceWithNormalSize(sourceUrl)
    const processingKey = this.buildProcessingCacheKey(normalizedSourceUrl, options)

    if (!options?.bypassCache && !options?.requireNonPreviewSource) {
      const cached = this.processedDataUrlCache.get(normalizedSourceUrl)
      if (cached) {
        return {
          dataUrl: cached,
          watermarkRemoved: true,
        }
      }
    }

    if (!options?.bypassCache) {
      const inFlight = this.processingMap.get(processingKey)
      if (inFlight) return inFlight
    }

    const processing = (async () => {
      const originalBlob = await this.fetchOriginalBlob(normalizedSourceUrl, {
        requireNonPreviewSource: options?.requireNonPreviewSource,
      })
      const processedImage = await this.processImageBlobToDataUrl(originalBlob)

      if (options?.requireWatermarkRemoval) {
        this.ensureWatermarkRemoved(processedImage)
      }

      if (
        !options?.bypassCache &&
        !options?.requireNonPreviewSource &&
        processedImage.watermarkRemoved
      ) {
        this.processedDataUrlCache.set(normalizedSourceUrl, processedImage.dataUrl)
        if (this.processedDataUrlCache.size > 100) {
          const oldestKey = this.processedDataUrlCache.keys().next().value
          if (oldestKey) {
            this.processedDataUrlCache.delete(oldestKey)
          }
        }
      }
      return processedImage
    })()

    if (!options?.bypassCache) {
      this.processingMap.set(processingKey, processing)
      try {
        return await processing
      } finally {
        this.processingMap.delete(processingKey)
      }
    }

    return processing
  }

  private isValidGeminiImage(img: HTMLImageElement) {
    if (img.closest(GEMINI_IMAGE_CONTAINER_SELECTOR)) {
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
        img.dataset.watermarkProcessed !== "true" &&
        img.dataset.watermarkProcessed !== "processing" &&
        !isSkippedForCurrentSource
      )
    })
  }

  private async resolveDisplayImageDataUrl(source: string): Promise<string> {
    if (source.startsWith("data:image/") || source.startsWith("blob:")) {
      const processedImage = this.ensureWatermarkRemoved(
        await this.processImageSourceToDataUrl(source),
      )
      return processedImage.dataUrl
    }

    const processedImage = await this.getProcessedImageResult(source, {
      requireWatermarkRemoval: true,
    })
    return processedImage.dataUrl
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
    const sourceForProcessing =
      originalSrc.startsWith("data:image/") || originalSrc.startsWith("blob:")
        ? originalSrc
        : this.replaceWithNormalSize(originalSrc)

    try {
      const newUrl = await this.resolveDisplayImageDataUrl(sourceForProcessing)
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
