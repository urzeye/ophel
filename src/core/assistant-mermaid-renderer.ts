import { normalizeAssistantMermaidSource, type SiteAdapter } from "~adapters/base"
import { DOMToolkit } from "~utils/dom-toolkit"
import { t } from "~utils/i18n"
import { showToast } from "~utils/toast"

const STYLE_ID = "gh-assistant-mermaid-style"
const INITIAL_DELAY = 1000
const RESCAN_INTERVAL = 2000
const PANEL_SELECTOR = ".gh-assistant-mermaid"
const BLOCK_MANAGED_ATTR = "data-ophel-assistant-mermaid-managed"
const ORIGINAL_DISPLAY_ATTR = "data-ophel-assistant-mermaid-original-display"
const PREVIEW_ID_ATTR = "data-ophel-assistant-mermaid-preview-id"
const PREVIEW_TOKEN_ATTR = "data-ophel-assistant-mermaid-render-token"
const FULLSCREEN_ACTIVE_ATTR = "data-ophel-assistant-mermaid-fullscreen"
const FULLSCREEN_RESTORE_ZOOM_ATTR = "data-ophel-assistant-mermaid-restore-zoom"
const FULLSCREEN_MAX_ZOOM_ATTR = "data-ophel-assistant-mermaid-fullscreen-max-zoom"
const RUNTIME_ROOT_ATTR = "data-ophel-assistant-mermaid-runner"
const RUNTIME_VENDOR_PATH = "assets/assistant-mermaid-vendor.js"
const RUNTIME_RUNNER_PATH = "assets/assistant-mermaid-runner.js"
const RUNTIME_VENDOR_KEY = "assistantMermaidVendor"
const RUNTIME_RUNNER_KEY = "assistantMermaidRunner"
const RUNTIME_REQUEST_EVENT = "OPHEL_ASSISTANT_MERMAID_RENDER_REQUEST"
const RUNTIME_RESPONSE_EVENT = "OPHEL_ASSISTANT_MERMAID_RENDER_RESPONSE"
const RUNTIME_TIMEOUT_MS = 15000
const DEFAULT_PREVIEW_ZOOM = 1
const MIN_PREVIEW_ZOOM = 0.5
const MAX_PREVIEW_ZOOM = 3
const PREVIEW_ZOOM_STEP = 0.25
const FULLSCREEN_PREVIEW_PADDING = 24
const PNG_EXPORT_SCALE = 2
const PNG_EXPORT_PADDING = 24
const PNG_EXPORT_LIGHT_BG = "#ffffff"
const PNG_EXPORT_DARK_BG = "#0f172a"
const SVG_NS = "http://www.w3.org/2000/svg"

function isTaintedCanvasError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : ""

  const normalizedMessage = message.toLowerCase()
  const normalizedName = name.toLowerCase()

  return (
    normalizedName.includes("securityerror") ||
    normalizedMessage.includes("tainted canvas") ||
    normalizedMessage.includes("tainted canvases may not be exported")
  )
}

const ASSISTANT_MERMAID_CSS = `
.gh-assistant-mermaid {
  margin: 12px 0;
  border: 1px solid var(--gh-border, rgba(148, 163, 184, 0.28));
  border-radius: 10px;
  background: var(--gh-bg-secondary, rgba(255, 255, 255, 0.9));
  overflow: hidden;
}

.gh-assistant-mermaid-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--gh-border, rgba(148, 163, 184, 0.2));
  background: var(--gh-bg-primary, rgba(248, 250, 252, 0.96));
}

.gh-assistant-mermaid-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.gh-assistant-mermaid-toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.gh-assistant-mermaid-zoom {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.gh-assistant-mermaid-btn {
  appearance: none;
  border: 1px solid var(--gh-border, rgba(148, 163, 184, 0.28));
  background: transparent;
  color: var(--gh-text-secondary, #64748b);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.gh-assistant-mermaid-btn.is-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  padding: 4px 8px;
}

.gh-assistant-mermaid-btn-icon {
  width: 14px;
  height: 14px;
  display: block;
  flex: 0 0 auto;
}

.gh-assistant-mermaid-btn:hover {
  background: rgba(59, 130, 246, 0.08);
  color: var(--gh-text, #0f172a);
  border-color: rgba(59, 130, 246, 0.28);
}

.gh-assistant-mermaid-btn.is-active {
  background: rgba(59, 130, 246, 0.14);
  color: #2563eb;
  border-color: rgba(59, 130, 246, 0.3);
}

.gh-assistant-mermaid-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.gh-assistant-mermaid-preview {
  padding: 12px;
  overflow-x: auto;
  background: var(--gh-bg-primary, rgba(255, 255, 255, 0.96));
}

.gh-assistant-mermaid-preview:fullscreen,
.gh-assistant-mermaid-preview:-webkit-full-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: ${FULLSCREEN_PREVIEW_PADDING}px;
  box-sizing: border-box;
  overflow: auto;
  background: var(--gh-bg-primary, rgba(255, 255, 255, 0.98));
}

.gh-assistant-mermaid-preview[hidden] {
  display: none !important;
}

.gh-assistant-mermaid-preview svg {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

.gh-assistant-mermaid-preview:fullscreen svg,
.gh-assistant-mermaid-preview:-webkit-full-screen svg {
  margin: auto;
  flex: 0 0 auto;
}

body.dark-theme .gh-assistant-mermaid,
html.dark .gh-assistant-mermaid,
html[dark-theme] .gh-assistant-mermaid {
  background: rgba(15, 23, 42, 0.88);
}

body.dark-theme .gh-assistant-mermaid-toolbar,
html.dark .gh-assistant-mermaid-toolbar,
html[dark-theme] .gh-assistant-mermaid-toolbar,
body.dark-theme .gh-assistant-mermaid-preview,
html.dark .gh-assistant-mermaid-preview,
html[dark-theme] .gh-assistant-mermaid-preview {
  background: rgba(15, 23, 42, 0.92);
}

body.dark-theme .gh-assistant-mermaid-btn,
html.dark .gh-assistant-mermaid-btn,
html[dark-theme] .gh-assistant-mermaid-btn {
  color: rgba(226, 232, 240, 0.82);
  border-color: rgba(148, 163, 184, 0.26);
}

body.dark-theme .gh-assistant-mermaid-btn:hover,
html.dark .gh-assistant-mermaid-btn:hover,
html[dark-theme] .gh-assistant-mermaid-btn:hover {
  color: #eff6ff;
  background: rgba(59, 130, 246, 0.18);
}

body.dark-theme .gh-assistant-mermaid-btn.is-active,
html.dark .gh-assistant-mermaid-btn.is-active,
html[dark-theme] .gh-assistant-mermaid-btn.is-active {
  color: #93c5fd;
}
`

type MermaidTheme = "default" | "dark"
type MermaidView = "preview" | "code"

type PendingRenderRequest = {
  reject: (reason?: unknown) => void
  resolve: () => void
  timeoutId: number
}

function shouldRetryMermaidRender(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return [
    "runtime asset url is unavailable",
    "failed to load script",
    "runner did not initialize",
    "runtime is unavailable",
    "render timed out",
    "preview container not found",
  ].some((keyword) => message.toLowerCase().includes(keyword))
}

function isUserscriptPlatform(): boolean {
  return typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"
}

function getRuntimeAssetUrl(
  kind: typeof RUNTIME_VENDOR_KEY | typeof RUNTIME_RUNNER_KEY,
): string | null {
  if (isUserscriptPlatform()) {
    const assetUrl = window.__OPHEL_USERSCRIPT_ASSET_URLS__?.[kind]
    return typeof assetUrl === "string" && assetUrl.length > 0 ? assetUrl : null
  }

  if (typeof chrome === "undefined" || !chrome.runtime?.getURL) {
    return null
  }

  return chrome.runtime.getURL(
    kind === RUNTIME_VENDOR_KEY ? RUNTIME_VENDOR_PATH : RUNTIME_RUNNER_PATH,
  )
}

function isAssistantMermaidRuntimeReady(): boolean {
  return document.documentElement.getAttribute(RUNTIME_ROOT_ATTR) === "1"
}

function createToolbarIcon(documentRef: Document, viewBox: string): SVGSVGElement {
  const svg = documentRef.createElementNS(SVG_NS, "svg")
  svg.setAttribute("viewBox", viewBox)
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("focusable", "false")
  svg.classList.add("gh-assistant-mermaid-btn-icon")
  return svg
}

function createFitToPageIcon(documentRef: Document): SVGSVGElement {
  const svg = createToolbarIcon(documentRef, "0 0 24 24")
  const path = documentRef.createElementNS(SVG_NS, "path")
  path.setAttribute("fill", "currentColor")
  path.setAttribute("fill-rule", "evenodd")
  path.setAttribute("clip-rule", "evenodd")
  path.setAttribute(
    "d",
    "M9 3a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v4.5a1 1 0 0 0 2 0V4h4a1 1 0 0 0 1-1m6 0a1 1 0 0 1 1-1h4a2 2 0 0 1 2 2v4.5a1 1 0 1 1-2 0V4h-4a1 1 0 0 1-1-1m1 19a1 1 0 1 1 0-2h4v-4.5a1 1 0 1 1 2 0V20a2 2 0 0 1-2 2zm-7-1a1 1 0 0 1-1 1H4a2 2 0 0 1-2-2v-4.5a1 1 0 1 1 2 0V20h4a1 1 0 0 1 1 1M8 10h8v4H8zm-2 0a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z",
  )

  svg.appendChild(path)
  return svg
}

function createZoomOutIcon(documentRef: Document): SVGSVGElement {
  const svg = createToolbarIcon(documentRef, "0 0 24 24")
  const path = documentRef.createElementNS(SVG_NS, "path")
  path.setAttribute("fill", "currentColor")
  path.setAttribute("fill-rule", "evenodd")
  path.setAttribute("clip-rule", "evenodd")
  path.setAttribute(
    "d",
    "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13m0 2a8.46 8.46 0 0 0 5.263-1.825l.03.032 5 5a1 1 0 0 0 1.414-1.414l-5-5-.032-.03A8.5 8.5 0 1 0 10.5 19M8 9.5a1 1 0 0 0 0 2h5a1 1 0 1 0 0-2z",
  )

  svg.appendChild(path)
  return svg
}

function createZoomInIcon(documentRef: Document): SVGSVGElement {
  const svg = createToolbarIcon(documentRef, "0 0 24 24")
  const path = documentRef.createElementNS(SVG_NS, "path")
  path.setAttribute("fill", "currentColor")
  path.setAttribute("fill-rule", "evenodd")
  path.setAttribute("clip-rule", "evenodd")
  path.setAttribute(
    "d",
    "M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0m-1.237 6.675a8.5 8.5 0 1 1 1.413-1.413l.031.03 5 5a1 1 0 0 1-1.414 1.415l-5-5zM7 10.5a1 1 0 0 1 1-1h1.5V8a1 1 0 0 1 2 0v1.5H13a1 1 0 1 1 0 2h-1.5V13a1 1 0 1 1-2 0v-1.5H8a1 1 0 0 1-1-1",
  )

  svg.appendChild(path)
  return svg
}

function createFullscreenIcon(documentRef: Document): SVGSVGElement {
  const svg = createToolbarIcon(documentRef, "0 0 24 24")

  const path = documentRef.createElementNS(SVG_NS, "path")
  path.setAttribute("fill", "currentColor")
  path.setAttribute(
    "d",
    "M22 3v7a1 1 0 1 1-2 0V4h-6a1 1 0 1 1 0-2h7a1 1 0 0 1 1 1M11.005 21a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 2.002 0v6h6.003a1 1 0 0 1 1 1",
  )

  svg.appendChild(path)
  return svg
}

export class AssistantMermaidRenderer {
  private adapter: SiteAdapter
  private enabled: boolean
  private stopWatch: (() => void) | null = null
  private rescanTimer: number | null = null
  private clickHandler: ((e: MouseEvent) => void) | null = null
  private messageHandler: ((event: MessageEvent) => void) | null = null
  private fullscreenChangeHandler: (() => void) | null = null
  private runtimePromise: Promise<void> | null = null
  private processedBlocks = new WeakMap<HTMLElement, string>()
  private blockPanels = new WeakMap<HTMLElement, HTMLElement>()
  private panelBlocks = new WeakMap<HTMLElement, HTMLElement>()
  private injectedRoots = new WeakSet<Document | ShadowRoot>()
  private pendingRequests = new Map<string, PendingRenderRequest>()
  private previewIdCounter = 0

  constructor(adapter: SiteAdapter, enabled: boolean) {
    this.adapter = adapter
    this.enabled = enabled

    if (enabled) {
      this.init()
    }
  }

  updateSettings(enabled: boolean) {
    if (this.enabled === enabled) return

    this.enabled = enabled
    if (enabled) {
      this.init()
      return
    }

    this.stop()
  }

  stop() {
    if (this.stopWatch) {
      this.stopWatch()
      this.stopWatch = null
    }

    if (this.rescanTimer) {
      window.clearInterval(this.rescanTimer)
      this.rescanTimer = null
    }

    if (this.clickHandler) {
      document.removeEventListener("click", this.clickHandler, true)
      this.clickHandler = null
    }

    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler)
      this.messageHandler = null
    }

    if (this.fullscreenChangeHandler) {
      document.removeEventListener("fullscreenchange", this.fullscreenChangeHandler)
      document.removeEventListener(
        "webkitfullscreenchange",
        this.fullscreenChangeHandler as EventListener,
      )
      this.fullscreenChangeHandler = null
    }

    for (const pending of this.pendingRequests.values()) {
      window.clearTimeout(pending.timeoutId)
      pending.reject(new Error("Assistant Mermaid renderer stopped"))
    }
    this.pendingRequests.clear()

    this.processedBlocks = new WeakMap()
    this.blockPanels = new WeakMap()
    this.panelBlocks = new WeakMap()

    this.cleanupInjectedPanels()
  }

  refreshLocalizedTexts() {
    const panels = DOMToolkit.query(PANEL_SELECTOR, {
      all: true,
      shadow: true,
    }) as Element[]

    panels.forEach((panel) => {
      if (!(panel instanceof HTMLElement)) return

      const previewButton = panel.querySelector(
        "[data-mermaid-action='preview']",
      ) as HTMLButtonElement | null
      const codeButton = panel.querySelector(
        "[data-mermaid-action='code']",
      ) as HTMLButtonElement | null
      const copyButton = panel.querySelector(
        "[data-mermaid-action='copy']",
      ) as HTMLButtonElement | null
      const downloadButton = panel.querySelector(
        "[data-mermaid-action='download']",
      ) as HTMLButtonElement | null
      const zoomResetButton = panel.querySelector(
        "[data-mermaid-action='zoom-reset']",
      ) as HTMLButtonElement | null
      const zoomOutButton = panel.querySelector(
        "[data-mermaid-action='zoom-out']",
      ) as HTMLButtonElement | null
      const zoomInButton = panel.querySelector(
        "[data-mermaid-action='zoom-in']",
      ) as HTMLButtonElement | null
      const fullscreenButton = panel.querySelector(
        "[data-mermaid-action='fullscreen']",
      ) as HTMLButtonElement | null

      if (previewButton) {
        previewButton.textContent = t("assistantMermaidPreviewTab")
      }

      if (codeButton) {
        codeButton.textContent = t("assistantMermaidCodeTab")
      }

      if (copyButton) {
        copyButton.textContent = t("assistantMermaidCopyCode")
      }

      if (downloadButton) {
        downloadButton.textContent = t("assistantMermaidDownloadPng")
      }

      if (zoomResetButton) {
        this.configureZoomResetButton(zoomResetButton)
      }

      if (zoomOutButton) {
        this.configureZoomOutButton(zoomOutButton)
      }

      if (zoomInButton) {
        this.configureZoomInButton(zoomInButton)
      }

      if (fullscreenButton) {
        this.configureFullscreenButton(fullscreenButton)
      }
    })
  }

  private init() {
    if (this.adapter.getAssistantMermaidSupportMode() !== "fallback") {
      return
    }

    const selector = this.getAssistantSelector()
    if (!selector) {
      return
    }

    this.injectStyles(document)
    this.initClickHandler()
    this.initMessageHandler()
    this.initFullscreenChangeHandler()

    this.stopWatch = DOMToolkit.each(
      selector,
      (element) => {
        this.processResponseElement(element)
      },
      { shadow: true },
    )

    this.startRescanTimer()
  }

  private getAssistantSelector(): string | null {
    return this.adapter.getExportConfig()?.assistantResponseSelector || null
  }

  private initClickHandler() {
    if (this.clickHandler) return

    this.clickHandler = (event: MouseEvent) => {
      const path = event.composedPath()
      const button =
        (path.find(
          (node) => node instanceof HTMLElement && node.hasAttribute("data-mermaid-action"),
        ) as HTMLElement | undefined) ||
        ((event.target as HTMLElement | null)?.closest(
          "[data-mermaid-action]",
        ) as HTMLElement | null)
      if (!button) return

      const panel =
        (path.find((node) => node instanceof HTMLElement && node.matches(PANEL_SELECTOR)) as
          | HTMLElement
          | undefined) || (button.closest(PANEL_SELECTOR) as HTMLElement | null)
      if (!panel) return

      const block = this.panelBlocks.get(panel)
      if (!block) return

      event.preventDefault()
      event.stopPropagation()

      const action = button.dataset.mermaidAction
      if (action === "preview" || action === "code") {
        this.setView(block, panel, action)
        return
      }

      if (action === "zoom-in" || action === "zoom-out" || action === "zoom-reset") {
        this.adjustPreviewZoom(panel, action)
        return
      }

      if (action === "fullscreen") {
        this.togglePreviewFullscreen(panel).catch((error) => {
          console.error("[AssistantMermaidRenderer] Fullscreen failed:", error)
          showToast(t("assistantMermaidFullscreenFailed") || t("exportFailed"), 2000)
        })
        return
      }

      if (action === "copy") {
        this.copyMermaidSource(panel).catch((error) => {
          console.error("[AssistantMermaidRenderer] Copy failed:", error)
        })
        return
      }

      if (action === "download") {
        this.downloadMermaidPng(panel).catch((error) => {
          console.error("[AssistantMermaidRenderer] PNG download failed:", error)
          showToast(t("assistantMermaidDownloadFailed") || t("exportFailed"), 2000)
        })
      }
    }

    document.addEventListener("click", this.clickHandler, true)
  }

  private initMessageHandler() {
    if (this.messageHandler) return

    this.messageHandler = (event: MessageEvent) => {
      if (event.source !== window) return
      if (event.data?.type !== RUNTIME_RESPONSE_EVENT) return

      const requestId = typeof event.data.requestId === "string" ? event.data.requestId : ""
      if (!requestId) return

      const pending = this.pendingRequests.get(requestId)
      if (!pending) return

      window.clearTimeout(pending.timeoutId)
      this.pendingRequests.delete(requestId)

      if (event.data.success) {
        pending.resolve()
        return
      }

      pending.reject(new Error(event.data.error || "Mermaid render failed"))
    }

    window.addEventListener("message", this.messageHandler)
  }

  private initFullscreenChangeHandler() {
    if (this.fullscreenChangeHandler) return

    this.fullscreenChangeHandler = () => {
      const activePanel = DOMToolkit.query(`${PANEL_SELECTOR}[${FULLSCREEN_ACTIVE_ATTR}='1']`, {
        shadow: true,
      }) as HTMLElement | null
      if (!activePanel) return

      const preview = activePanel.querySelector(
        ".gh-assistant-mermaid-preview",
      ) as HTMLElement | null
      if (!preview) {
        this.clearFullscreenState(activePanel)
        return
      }

      if (document.fullscreenElement === preview) {
        this.fitPreviewToFullscreen(activePanel, preview)
        return
      }

      this.restorePreviewZoomAfterFullscreen(activePanel)
    }

    document.addEventListener("fullscreenchange", this.fullscreenChangeHandler)
    document.addEventListener(
      "webkitfullscreenchange",
      this.fullscreenChangeHandler as EventListener,
    )
  }

  private startRescanTimer() {
    if (this.rescanTimer) return

    window.setTimeout(() => {
      if (this.enabled) {
        this.rescan()
      }
    }, INITIAL_DELAY)

    this.rescanTimer = window.setInterval(() => {
      if (!this.enabled) return
      this.rescan()
    }, RESCAN_INTERVAL)
  }

  private rescan() {
    if (document.hidden || !document.hasFocus()) return

    const selector = this.getAssistantSelector()
    if (!selector) return

    const elements = DOMToolkit.query(selector, { all: true, shadow: true }) as Element[]
    for (const element of elements) {
      this.processResponseElement(element)
    }
  }

  private processResponseElement(element: Element) {
    if (!this.enabled || this.adapter.getAssistantMermaidSupportMode() !== "fallback") {
      return
    }

    const rootNode = element.getRootNode()
    if (rootNode instanceof ShadowRoot) {
      this.injectStyles(rootNode)
    }

    const blocks = this.adapter.getAssistantMermaidBlocks(element as ParentNode)
    blocks.forEach(({ element: block, source }) => {
      void this.processMermaidBlock(block, source)
    })
  }

  private async processMermaidBlock(block: HTMLElement, source: string) {
    if (!block.isConnected) return

    const blockRoot = block.getRootNode()
    if (blockRoot instanceof ShadowRoot) {
      this.injectStyles(blockRoot)
    }

    const renderSource = normalizeAssistantMermaidSource(source)
    if (!renderSource) return

    const theme = this.getMermaidTheme()
    const processedKey = `${theme}::${renderSource}`
    if (this.processedBlocks.get(block) === processedKey) {
      return
    }

    const panel = this.ensurePanel(block)
    const preview = panel.querySelector(".gh-assistant-mermaid-preview") as HTMLElement | null
    if (!preview) return

    const currentView = (panel.dataset.view as MermaidView | undefined) || "preview"
    const previewId = this.ensurePreviewId(preview)
    const requestId = this.createRequestId()
    preview.setAttribute(PREVIEW_TOKEN_ATTR, requestId)

    try {
      await this.ensureRuntime()
      await this.requestRender(requestId, previewId, renderSource, theme)
      if (!block.isConnected) return
      if (preview.getAttribute(PREVIEW_TOKEN_ATTR) !== requestId) {
        return
      }

      panel.hidden = false
      panel.dataset.source = renderSource
      this.setPreviewEnabled(panel, true)
      this.setDownloadEnabled(panel, true)
      this.setZoomEnabled(panel, true)
      this.applyPreviewZoom(panel, DEFAULT_PREVIEW_ZOOM)
      this.processedBlocks.set(block, processedKey)
      this.setView(block, panel, currentView)
    } catch (error) {
      console.warn("[AssistantMermaidRenderer] Mermaid render skipped:", error)
      if (shouldRetryMermaidRender(error)) {
        this.processedBlocks.delete(block)
        this.cleanupPanel(block)
      } else {
        this.processedBlocks.set(block, processedKey)
        this.applyRenderFallback(block, panel, renderSource)
      }
    }
  }

  private ensurePanel(block: HTMLElement): HTMLElement {
    const existing =
      this.blockPanels.get(block) ||
      ((block.previousElementSibling as HTMLElement | null)?.matches?.(PANEL_SELECTOR)
        ? (block.previousElementSibling as HTMLElement)
        : null)
    if (existing?.isConnected) {
      this.blockPanels.set(block, existing)
      this.panelBlocks.set(existing, block)
      return existing
    }

    const panel = document.createElement("div")
    panel.className = "gh-assistant-mermaid"
    panel.hidden = true

    const toolbar = document.createElement("div")
    toolbar.className = "gh-assistant-mermaid-toolbar"

    const leadingActions = document.createElement("div")
    leadingActions.className = "gh-assistant-mermaid-toolbar-group"

    const actions = document.createElement("div")
    actions.className = "gh-assistant-mermaid-actions"

    const previewButton = document.createElement("button")
    previewButton.type = "button"
    previewButton.className = "gh-assistant-mermaid-btn"
    previewButton.dataset.mermaidAction = "preview"
    previewButton.textContent = t("assistantMermaidPreviewTab")

    const codeButton = document.createElement("button")
    codeButton.type = "button"
    codeButton.className = "gh-assistant-mermaid-btn"
    codeButton.dataset.mermaidAction = "code"
    codeButton.textContent = t("assistantMermaidCodeTab")

    const copyButton = document.createElement("button")
    copyButton.type = "button"
    copyButton.className = "gh-assistant-mermaid-btn"
    copyButton.dataset.mermaidAction = "copy"
    copyButton.textContent = t("assistantMermaidCopyCode")

    const downloadButton = document.createElement("button")
    downloadButton.type = "button"
    downloadButton.className = "gh-assistant-mermaid-btn"
    downloadButton.dataset.mermaidAction = "download"
    downloadButton.textContent = t("assistantMermaidDownloadPng")

    const trailingActions = document.createElement("div")
    trailingActions.className = "gh-assistant-mermaid-toolbar-group"

    const zoomControls = document.createElement("div")
    zoomControls.className = "gh-assistant-mermaid-zoom"

    const zoomOutButton = document.createElement("button")
    zoomOutButton.type = "button"
    zoomOutButton.className = "gh-assistant-mermaid-btn is-icon"
    zoomOutButton.dataset.mermaidAction = "zoom-out"
    this.configureZoomOutButton(zoomOutButton)

    const zoomResetButton = document.createElement("button")
    zoomResetButton.type = "button"
    zoomResetButton.className = "gh-assistant-mermaid-btn is-icon"
    zoomResetButton.dataset.mermaidAction = "zoom-reset"
    this.configureZoomResetButton(zoomResetButton)

    const zoomInButton = document.createElement("button")
    zoomInButton.type = "button"
    zoomInButton.className = "gh-assistant-mermaid-btn is-icon"
    zoomInButton.dataset.mermaidAction = "zoom-in"
    this.configureZoomInButton(zoomInButton)

    const fullscreenButton = document.createElement("button")
    fullscreenButton.type = "button"
    fullscreenButton.className = "gh-assistant-mermaid-btn is-icon"
    fullscreenButton.dataset.mermaidAction = "fullscreen"
    this.configureFullscreenButton(fullscreenButton)

    zoomControls.append(zoomOutButton, zoomResetButton, zoomInButton, fullscreenButton)
    leadingActions.append(actions, zoomControls)
    actions.append(previewButton, codeButton)
    trailingActions.append(downloadButton, copyButton)
    toolbar.append(leadingActions, trailingActions)

    const preview = document.createElement("div")
    preview.className = "gh-assistant-mermaid-preview"
    this.ensurePreviewId(preview)

    panel.append(toolbar, preview)
    block.before(panel)

    block.setAttribute(BLOCK_MANAGED_ATTR, "true")
    if (!block.hasAttribute(ORIGINAL_DISPLAY_ATTR)) {
      block.setAttribute(ORIGINAL_DISPLAY_ATTR, block.style.display || "")
    }

    this.blockPanels.set(block, panel)
    this.panelBlocks.set(panel, block)
    return panel
  }

  private configureZoomResetButton(button: HTMLButtonElement) {
    const label = t("assistantMermaidFitToPage")
    button.classList.add("is-icon")
    button.setAttribute("aria-label", label)
    button.title = label
    button.replaceChildren(createFitToPageIcon(button.ownerDocument || document))
  }

  private configureZoomOutButton(button: HTMLButtonElement) {
    const label = t("assistantMermaidZoomOut")
    button.classList.add("is-icon")
    button.setAttribute("aria-label", label)
    button.title = label
    button.replaceChildren(createZoomOutIcon(button.ownerDocument || document))
  }

  private configureZoomInButton(button: HTMLButtonElement) {
    const label = t("assistantMermaidZoomIn")
    button.classList.add("is-icon")
    button.setAttribute("aria-label", label)
    button.title = label
    button.replaceChildren(createZoomInIcon(button.ownerDocument || document))
  }

  private configureFullscreenButton(button: HTMLButtonElement) {
    const label = t("assistantMermaidFullscreen")
    button.classList.add("is-icon")
    button.setAttribute("aria-label", label)
    button.title = label
    button.replaceChildren(createFullscreenIcon(button.ownerDocument || document))
  }

  private ensurePreviewId(preview: HTMLElement): string {
    const existingId = preview.getAttribute(PREVIEW_ID_ATTR)
    if (existingId) {
      return existingId
    }

    this.previewIdCounter += 1
    const previewId = `gh-assistant-mermaid-preview-${Date.now()}-${this.previewIdCounter}`
    preview.setAttribute(PREVIEW_ID_ATTR, previewId)
    return previewId
  }

  private setView(block: HTMLElement, panel: HTMLElement, view: MermaidView) {
    const preview = panel.querySelector(".gh-assistant-mermaid-preview") as HTMLElement | null
    if (!preview) return

    panel.dataset.view = view
    preview.hidden = view !== "preview"
    block.style.display =
      view === "preview" ? "none" : block.getAttribute(ORIGINAL_DISPLAY_ATTR) || ""

    const buttons = panel.querySelectorAll(
      "[data-mermaid-action='preview'], [data-mermaid-action='code']",
    )
    buttons.forEach((button) => {
      if (!(button instanceof HTMLElement)) return
      button.classList.toggle("is-active", button.dataset.mermaidAction === view)
    })
  }

  private setPreviewEnabled(panel: HTMLElement, enabled: boolean) {
    const previewButton = panel.querySelector(
      "[data-mermaid-action='preview']",
    ) as HTMLButtonElement | null
    if (!previewButton) return

    previewButton.disabled = !enabled
  }

  private setZoomEnabled(panel: HTMLElement, enabled: boolean) {
    const zoomButtons = panel.querySelectorAll(
      "[data-mermaid-action='zoom-out'], [data-mermaid-action='zoom-reset'], [data-mermaid-action='zoom-in'], [data-mermaid-action='fullscreen']",
    )

    zoomButtons.forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return
      button.disabled = !enabled
    })
  }

  private setDownloadEnabled(panel: HTMLElement, enabled: boolean) {
    const downloadButton = panel.querySelector(
      "[data-mermaid-action='download']",
    ) as HTMLButtonElement | null
    if (!downloadButton) return

    downloadButton.disabled = !enabled
  }

  private adjustPreviewZoom(panel: HTMLElement, action: "zoom-in" | "zoom-out" | "zoom-reset") {
    const currentZoom = Number.parseFloat(panel.dataset.zoom || `${DEFAULT_PREVIEW_ZOOM}`)
    if (action === "zoom-reset") {
      this.applyPreviewZoom(panel, DEFAULT_PREVIEW_ZOOM)
      return
    }

    const nextZoom =
      action === "zoom-in" ? currentZoom + PREVIEW_ZOOM_STEP : currentZoom - PREVIEW_ZOOM_STEP

    this.applyPreviewZoom(panel, nextZoom)
  }

  private applyPreviewZoom(panel: HTMLElement, zoom: number) {
    const preview = panel.querySelector(".gh-assistant-mermaid-preview") as HTMLElement | null
    const svg = preview?.querySelector("svg") as SVGSVGElement | null
    if (!preview || !svg) {
      this.setZoomEnabled(panel, false)
      return
    }

    const clampedZoom = Math.min(this.getMaxPreviewZoom(panel), Math.max(MIN_PREVIEW_ZOOM, zoom))
    panel.dataset.zoom = `${clampedZoom}`

    const fittedWidth = this.getPreviewBaseWidth(svg)
    svg.style.maxWidth = "none"
    svg.style.width = `${Math.max(1, Math.round(fittedWidth * clampedZoom))}px`
    svg.style.height = "auto"

    this.updateZoomButtonState(panel, clampedZoom)
  }

  private getMaxPreviewZoom(panel: HTMLElement): number {
    const fullscreenMaxZoom = Number.parseFloat(panel.getAttribute(FULLSCREEN_MAX_ZOOM_ATTR) || "")
    return Math.max(MAX_PREVIEW_ZOOM, Number.isFinite(fullscreenMaxZoom) ? fullscreenMaxZoom : 0)
  }

  private getPreviewBaseWidth(svg: SVGSVGElement): number {
    const cachedWidth = Number.parseFloat(svg.dataset.ophelBaseWidth || "")
    if (Number.isFinite(cachedWidth) && cachedWidth > 0) {
      return cachedWidth
    }

    const measuredWidth = svg.getBoundingClientRect().width
    const fallbackWidth =
      Number.parseFloat(svg.getAttribute("width") || "") || svg.viewBox?.baseVal?.width || 320
    const baseWidth = measuredWidth > 0 ? measuredWidth : fallbackWidth
    svg.dataset.ophelBaseWidth = `${baseWidth}`

    return baseWidth
  }

  private getPreviewBaseDimensions(svg: SVGSVGElement): { width: number; height: number } {
    const width = this.getPreviewBaseWidth(svg)
    const rect = svg.getBoundingClientRect()
    const attrWidth = Number.parseFloat(svg.getAttribute("width") || "")
    const attrHeight = Number.parseFloat(svg.getAttribute("height") || "")
    const viewBoxWidth = svg.viewBox?.baseVal?.width || 0
    const viewBoxHeight = svg.viewBox?.baseVal?.height || 0
    const ratio =
      (viewBoxWidth > 0 && viewBoxHeight > 0 && viewBoxHeight / viewBoxWidth) ||
      (rect.width > 0 && rect.height > 0 && rect.height / rect.width) ||
      (attrWidth > 0 && attrHeight > 0 && attrHeight / attrWidth) ||
      0.75

    return {
      width,
      height: width * ratio,
    }
  }

  private updateZoomButtonState(panel: HTMLElement, zoom: number) {
    const zoomOutButton = panel.querySelector(
      "[data-mermaid-action='zoom-out']",
    ) as HTMLButtonElement | null
    const zoomResetButton = panel.querySelector(
      "[data-mermaid-action='zoom-reset']",
    ) as HTMLButtonElement | null
    const zoomInButton = panel.querySelector(
      "[data-mermaid-action='zoom-in']",
    ) as HTMLButtonElement | null
    const maxZoom = this.getMaxPreviewZoom(panel)

    if (zoomOutButton) {
      zoomOutButton.disabled = zoom <= MIN_PREVIEW_ZOOM
    }

    if (zoomResetButton) {
      zoomResetButton.disabled = Math.abs(zoom - DEFAULT_PREVIEW_ZOOM) < 0.001
    }

    if (zoomInButton) {
      zoomInButton.disabled = zoom >= maxZoom
    }
  }

  private applyRenderFallback(block: HTMLElement, panel: HTMLElement, source: string) {
    const preview = panel.querySelector(".gh-assistant-mermaid-preview") as HTMLElement | null
    if (preview) {
      preview.replaceChildren()
    }

    panel.hidden = false
    panel.dataset.source = source
    this.setPreviewEnabled(panel, false)
    this.setDownloadEnabled(panel, false)
    this.setZoomEnabled(panel, false)
    this.setView(block, panel, "code")
  }

  private async togglePreviewFullscreen(panel: HTMLElement) {
    const preview = panel.querySelector(".gh-assistant-mermaid-preview") as HTMLElement | null
    if (!preview) {
      throw new Error("Mermaid preview container not found")
    }

    const block = this.panelBlocks.get(panel)
    if (block && panel.dataset.view !== "preview") {
      this.setView(block, panel, "preview")
    }

    if (document.fullscreenElement === preview) {
      await document.exitFullscreen()
      return
    }

    if (typeof preview.requestFullscreen !== "function") {
      throw new Error("Fullscreen API is unavailable")
    }

    panel.setAttribute(FULLSCREEN_ACTIVE_ATTR, "1")
    panel.setAttribute(
      FULLSCREEN_RESTORE_ZOOM_ATTR,
      panel.dataset.zoom || `${DEFAULT_PREVIEW_ZOOM}`,
    )

    try {
      await preview.requestFullscreen()
    } catch (error) {
      this.clearFullscreenState(panel)
      throw error
    }
  }

  private fitPreviewToFullscreen(panel: HTMLElement, preview: HTMLElement) {
    const svg = preview.querySelector("svg") as SVGSVGElement | null
    if (!svg) {
      this.setZoomEnabled(panel, false)
      return
    }

    const { width: baseWidth, height: baseHeight } = this.getPreviewBaseDimensions(svg)
    if (baseWidth <= 0 || baseHeight <= 0) return

    const availableWidth = Math.max(1, preview.clientWidth - FULLSCREEN_PREVIEW_PADDING * 2)
    const availableHeight = Math.max(1, preview.clientHeight - FULLSCREEN_PREVIEW_PADDING * 2)
    const fitZoom = Math.min(availableWidth / baseWidth, availableHeight / baseHeight)

    panel.setAttribute(FULLSCREEN_MAX_ZOOM_ATTR, `${Math.max(MAX_PREVIEW_ZOOM, fitZoom)}`)
    this.applyPreviewZoom(panel, fitZoom)
    preview.scrollTop = 0
    preview.scrollLeft = 0
  }

  private restorePreviewZoomAfterFullscreen(panel: HTMLElement) {
    const restoreZoom =
      Number.parseFloat(panel.getAttribute(FULLSCREEN_RESTORE_ZOOM_ATTR) || "") ||
      DEFAULT_PREVIEW_ZOOM

    this.clearFullscreenState(panel)
    this.applyPreviewZoom(panel, restoreZoom)
  }

  private clearFullscreenState(panel: HTMLElement) {
    panel.removeAttribute(FULLSCREEN_ACTIVE_ATTR)
    panel.removeAttribute(FULLSCREEN_RESTORE_ZOOM_ATTR)
    panel.removeAttribute(FULLSCREEN_MAX_ZOOM_ATTR)
  }

  private async copyMermaidSource(panel: HTMLElement) {
    const source = panel.dataset.source || ""
    if (!source) return

    await navigator.clipboard.writeText(source)
    showToast(t("copySuccess"), 1500)
  }

  private async downloadMermaidPng(panel: HTMLElement) {
    const preview = panel.querySelector(".gh-assistant-mermaid-preview") as HTMLElement | null
    const svg = preview?.querySelector("svg") as SVGSVGElement | null
    if (!svg) {
      throw new Error("Mermaid preview svg not found")
    }

    const { width, height } = this.getSvgExportDimensions(svg)
    const exportWidth = Math.max(1, Math.round(width))
    const exportHeight = Math.max(1, Math.round(height))
    let pngBlob: Blob

    try {
      pngBlob = await this.renderSvgToPngBlob(svg, exportWidth, exportHeight)
    } catch (error) {
      if (!svg.querySelector("foreignObject") || !isTaintedCanvasError(error)) {
        throw error
      }

      pngBlob = await this.renderSvgToPngBlob(svg, exportWidth, exportHeight, {
        downgradeForeignObjects: true,
      })
    }

    const url = URL.createObjectURL(pngBlob)
    try {
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = this.createPngFilename()
      anchor.click()
    } finally {
      URL.revokeObjectURL(url)
    }

    showToast(t("assistantMermaidDownloadSuccess") || t("exportSuccess"), 1500)
  }

  private getSvgExportDimensions(svg: SVGSVGElement): { width: number; height: number } {
    const rect = svg.getBoundingClientRect()
    const styledWidth = Number.parseFloat(svg.style.width || "")
    const styledHeight = Number.parseFloat(svg.style.height || "")
    const attrWidth = Number.parseFloat(svg.getAttribute("width") || "")
    const attrHeight = Number.parseFloat(svg.getAttribute("height") || "")
    const viewBoxWidth = svg.viewBox?.baseVal?.width || 0
    const viewBoxHeight = svg.viewBox?.baseVal?.height || 0
    const width =
      rect.width || styledWidth || attrWidth || this.getPreviewBaseWidth(svg) || viewBoxWidth || 320
    const ratio =
      (rect.width > 0 && rect.height > 0 && rect.height / rect.width) ||
      (styledWidth > 0 && styledHeight > 0 && styledHeight / styledWidth) ||
      (attrWidth > 0 && attrHeight > 0 && attrHeight / attrWidth) ||
      (viewBoxWidth > 0 && viewBoxHeight > 0 && viewBoxHeight / viewBoxWidth) ||
      0.75

    return {
      width,
      height: width * ratio,
    }
  }

  private serializeSvgForPng(
    svg: SVGSVGElement,
    width: number,
    height: number,
    options: { downgradeForeignObjects?: boolean } = {},
  ): string {
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute("xmlns", SVG_NS)
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink")
    clone.setAttribute("width", `${width}`)
    clone.setAttribute("height", `${height}`)
    clone.style.width = `${width}px`
    clone.style.height = `${height}px`
    clone.style.maxWidth = "none"

    if (options.downgradeForeignObjects) {
      this.downgradeForeignObjectsForPng(svg, clone)
    }

    return new XMLSerializer().serializeToString(clone)
  }

  private async renderSvgToPngBlob(
    svg: SVGSVGElement,
    exportWidth: number,
    exportHeight: number,
    options: { downgradeForeignObjects?: boolean } = {},
  ): Promise<Blob> {
    const svgMarkup = this.serializeSvgForPng(svg, exportWidth, exportHeight, options)
    const svgUrl = URL.createObjectURL(
      new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" }),
    )

    try {
      const image = await this.loadSvgImage(svgUrl)
      const canvas = document.createElement("canvas")
      canvas.width = Math.ceil((exportWidth + PNG_EXPORT_PADDING * 2) * PNG_EXPORT_SCALE)
      canvas.height = Math.ceil((exportHeight + PNG_EXPORT_PADDING * 2) * PNG_EXPORT_SCALE)

      const context = canvas.getContext("2d")
      if (!context) {
        throw new Error("Canvas 2D context is unavailable")
      }

      context.scale(PNG_EXPORT_SCALE, PNG_EXPORT_SCALE)
      context.fillStyle =
        this.getMermaidTheme() === "dark" ? PNG_EXPORT_DARK_BG : PNG_EXPORT_LIGHT_BG
      context.fillRect(0, 0, canvas.width / PNG_EXPORT_SCALE, canvas.height / PNG_EXPORT_SCALE)
      context.drawImage(image, PNG_EXPORT_PADDING, PNG_EXPORT_PADDING, exportWidth, exportHeight)

      return await this.canvasToBlob(canvas)
    } finally {
      URL.revokeObjectURL(svgUrl)
    }
  }

  private downgradeForeignObjectsForPng(sourceSvg: SVGSVGElement, exportSvg: SVGSVGElement) {
    const sourceForeignObjects = Array.from(sourceSvg.querySelectorAll("foreignObject"))
    const exportForeignObjects = Array.from(exportSvg.querySelectorAll("foreignObject"))

    exportForeignObjects.forEach((foreignObject, index) => {
      const replacement = this.createForeignObjectTextFallback(
        sourceForeignObjects[index],
        exportSvg.ownerDocument,
      )
      foreignObject.replaceWith(replacement)
    })
  }

  private createForeignObjectTextFallback(
    sourceForeignObject: Element | undefined,
    documentRef: Document,
  ): SVGGElement {
    const group = documentRef.createElementNS(SVG_NS, "g")
    if (!sourceForeignObject) {
      return group
    }

    const x = this.getForeignObjectMetric(sourceForeignObject, "x")
    const y = this.getForeignObjectMetric(sourceForeignObject, "y")
    const width = this.getForeignObjectMetric(sourceForeignObject, "width")
    const height = this.getForeignObjectMetric(sourceForeignObject, "height")
    const lines = this.getForeignObjectLines(sourceForeignObject)
    if (lines.length === 0 || width <= 0 || height <= 0) {
      return group
    }

    const styleElement = (sourceForeignObject.querySelector("*") as HTMLElement | null) || null
    const style = styleElement ? window.getComputedStyle(styleElement) : null
    const fontSize = Math.max(
      10,
      Number.parseFloat(style?.fontSize || "") || Math.min(16, Math.max(12, height * 0.35)),
    )
    const lineHeight =
      Number.parseFloat(style?.lineHeight || "") ||
      Math.max(fontSize * 1.2, height / Math.max(lines.length, 1))
    const centerX = x + width / 2
    const startY = y + height / 2 - ((lines.length - 1) * lineHeight) / 2
    const fill = style?.color || (this.getMermaidTheme() === "dark" ? "#e5e7eb" : "#111827")
    const fontFamily = style?.fontFamily || "Arial, sans-serif"
    const fontWeight = style?.fontWeight || "400"

    lines.forEach((line, index) => {
      const text = documentRef.createElementNS(SVG_NS, "text")
      text.setAttribute("x", `${centerX}`)
      text.setAttribute("y", `${startY + index * lineHeight}`)
      text.setAttribute("text-anchor", "middle")
      text.setAttribute("dominant-baseline", "middle")
      text.setAttribute("fill", fill)
      text.setAttribute("font-size", `${fontSize}`)
      text.setAttribute("font-family", fontFamily)
      text.setAttribute("font-weight", fontWeight)
      text.textContent = line
      group.appendChild(text)
    })

    return group
  }

  private getForeignObjectMetric(element: Element, name: string): number {
    const attributeValue = Number.parseFloat(element.getAttribute(name) || "")
    if (Number.isFinite(attributeValue)) {
      return attributeValue
    }

    const bbox =
      element instanceof SVGGraphicsElement
        ? element.getBBox()
        : {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
          }

    if (name === "x") return bbox.x
    if (name === "y") return bbox.y
    if (name === "width") return bbox.width
    if (name === "height") return bbox.height
    return 0
  }

  private getForeignObjectLines(element: Element): string[] {
    const root = (element.querySelector("*") as HTMLElement | null) || null
    const rawText =
      (root && typeof root.innerText === "string" && root.innerText) ||
      root?.textContent ||
      element.textContent ||
      ""

    return rawText
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
  }

  private loadSvgImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.decoding = "async"
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error("Failed to load Mermaid SVG image"))
      image.src = url
    })
  }

  private canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
          return
        }

        reject(new Error("Failed to convert Mermaid canvas to PNG blob"))
      }, "image/png")
    })
  }

  private createPngFilename(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    return `ophel-mermaid-${timestamp}.png`
  }

  private cleanupInjectedPanels() {
    const blocks = DOMToolkit.query(`[${BLOCK_MANAGED_ATTR}]`, {
      all: true,
      shadow: true,
    }) as Element[]
    blocks.forEach((element) => {
      if (!(element instanceof HTMLElement)) return
      element.style.display = element.getAttribute(ORIGINAL_DISPLAY_ATTR) || ""
      element.removeAttribute(BLOCK_MANAGED_ATTR)
      element.removeAttribute(ORIGINAL_DISPLAY_ATTR)
    })

    const panels = DOMToolkit.query(PANEL_SELECTOR, {
      all: true,
      shadow: true,
    }) as Element[]
    panels.forEach((panel) => panel.remove())
  }

  private cleanupPanel(block: HTMLElement) {
    const panel = this.blockPanels.get(block)
    if (panel?.isConnected) {
      panel.remove()
    }

    block.style.display = block.getAttribute(ORIGINAL_DISPLAY_ATTR) || ""
    block.removeAttribute(BLOCK_MANAGED_ATTR)
    block.removeAttribute(ORIGINAL_DISPLAY_ATTR)
  }

  private injectStyles(root: Document | ShadowRoot) {
    if (this.injectedRoots.has(root)) return
    if (root.querySelector?.(`#${STYLE_ID}`)) return

    const style = document.createElement("style")
    style.id = STYLE_ID
    style.textContent = ASSISTANT_MERMAID_CSS

    if (root instanceof ShadowRoot) {
      root.prepend(style)
    } else {
      document.head.appendChild(style)
    }

    this.injectedRoots.add(root)
  }

  private getMermaidTheme(): MermaidTheme {
    const htmlClass = document.documentElement.className
    const bodyClass = document.body.className
    const htmlHasDark = /\bdark\b/i.test(htmlClass)
    const bodyHasDarkTheme = /\bdark-theme\b/i.test(bodyClass)
    const htmlHasDarkThemeAttr = document.documentElement.hasAttribute("dark-theme")

    return htmlHasDark || bodyHasDarkTheme || htmlHasDarkThemeAttr ? "dark" : "default"
  }

  private createRequestId(): string {
    return `gh-assistant-mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  private async ensureRuntime(): Promise<void> {
    if (isAssistantMermaidRuntimeReady()) {
      return
    }

    if (!this.runtimePromise) {
      this.runtimePromise = (async () => {
        const vendorUrl = getRuntimeAssetUrl(RUNTIME_VENDOR_KEY)
        const runnerUrl = getRuntimeAssetUrl(RUNTIME_RUNNER_KEY)

        if (!vendorUrl || !runnerUrl) {
          throw new Error("Assistant Mermaid runtime asset URL is unavailable")
        }

        await this.injectScript(vendorUrl, "ophel-assistant-mermaid-vendor")
        await this.injectScript(runnerUrl, "ophel-assistant-mermaid-runner")

        if (!isAssistantMermaidRuntimeReady()) {
          throw new Error("Assistant Mermaid runner did not initialize")
        }
      })().catch((error) => {
        this.runtimePromise = null
        throw error
      })
    }

    return this.runtimePromise
  }

  private injectScript(src: string, marker: string): Promise<void> {
    const selector = `script[data-ophel-runtime="${marker}"]`
    const existing = document.querySelector(selector) as HTMLScriptElement | null
    if (existing?.dataset.loaded === "true") {
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      const script = existing || document.createElement("script")
      const cleanup = () => {
        script.removeEventListener("load", handleLoad)
        script.removeEventListener("error", handleError)
      }
      const handleLoad = () => {
        cleanup()
        script.dataset.loaded = "true"
        resolve()
      }
      const handleError = () => {
        cleanup()
        reject(new Error(`Failed to load script: ${src}`))
      }

      script.addEventListener("load", handleLoad, { once: true })
      script.addEventListener("error", handleError, { once: true })

      if (!existing) {
        script.dataset.ophelRuntime = marker
        script.dataset.loaded = "false"
        script.src = src
        script.async = false
        ;(document.head || document.documentElement).appendChild(script)
      }
    })
  }

  private requestRender(
    requestId: string,
    previewId: string,
    source: string,
    theme: MermaidTheme,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error("Assistant Mermaid render timed out"))
      }, RUNTIME_TIMEOUT_MS)

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
      })

      window.postMessage(
        {
          type: RUNTIME_REQUEST_EVENT,
          requestId,
          previewId,
          source,
          theme,
        },
        "*",
      )
    })
  }
}
