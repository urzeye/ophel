import type { SiteAdapter } from "~adapters/base"
import { DOMToolkit } from "~utils/dom-toolkit"
import { t } from "~utils/i18n"
import { setSafeHTML } from "~utils/trusted-types"
import { showToast } from "~utils/toast"

const STYLE_ID = "gh-assistant-mermaid-style"
const INITIAL_DELAY = 1000
const RESCAN_INTERVAL = 2000
const PANEL_SELECTOR = ".gh-assistant-mermaid"
const BLOCK_MANAGED_ATTR = "data-ophel-assistant-mermaid-managed"
const ORIGINAL_DISPLAY_ATTR = "data-ophel-assistant-mermaid-original-display"

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

.gh-assistant-mermaid-preview {
  padding: 12px;
  overflow-x: auto;
  background: var(--gh-bg-primary, rgba(255, 255, 255, 0.96));
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

type MermaidApi = typeof import("mermaid").default
type MermaidTheme = "default" | "dark"
type MermaidView = "preview" | "code"

export class AssistantMermaidRenderer {
  private adapter: SiteAdapter
  private enabled: boolean
  private stopWatch: (() => void) | null = null
  private rescanTimer: number | null = null
  private clickHandler: ((e: MouseEvent) => void) | null = null
  private mermaidPromise: Promise<MermaidApi> | null = null
  private processedBlocks = new WeakMap<HTMLElement, string>()
  private blockPanels = new WeakMap<HTMLElement, HTMLElement>()
  private panelBlocks = new WeakMap<HTMLElement, HTMLElement>()
  private injectedRoots = new WeakSet<Document | ShadowRoot>()

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

    this.cleanupInjectedPanels()
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
      const target = event.target as HTMLElement | null
      const button = target?.closest("[data-mermaid-action]") as HTMLElement | null
      if (!button) return

      const panel = button.closest(PANEL_SELECTOR) as HTMLElement | null
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

      if (action === "copy") {
        this.copyMermaidSource(panel).catch((error) => {
          console.error("[AssistantMermaidRenderer] Copy failed:", error)
        })
      }
    }

    document.addEventListener("click", this.clickHandler, true)
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

    const theme = this.getMermaidTheme()
    const processedKey = `${theme}::${source}`
    if (this.processedBlocks.get(block) === processedKey) {
      return
    }

    const panel = this.ensurePanel(block)
    const preview = panel.querySelector(".gh-assistant-mermaid-preview") as HTMLElement | null
    if (!preview) return

    const currentView = (panel.dataset.view as MermaidView | undefined) || "preview"

    try {
      const mermaid = await this.loadMermaid()
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme,
      })

      const parsed = await mermaid.parse(source, { suppressErrors: true })
      if (!parsed) {
        this.processedBlocks.set(block, processedKey)
        this.cleanupPanel(block)
        return
      }

      const renderId = `gh-assistant-mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const { svg, bindFunctions } = await mermaid.render(renderId, source)
      if (!block.isConnected) return

      setSafeHTML(preview, svg)
      bindFunctions?.(preview)

      panel.hidden = false
      panel.dataset.source = source
      this.processedBlocks.set(block, processedKey)
      this.setView(block, panel, currentView)
    } catch (error) {
      console.warn("[AssistantMermaidRenderer] Mermaid render skipped:", error)
      this.processedBlocks.set(block, processedKey)
      this.cleanupPanel(block)
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

    actions.append(previewButton, codeButton)
    toolbar.append(actions, copyButton)

    const preview = document.createElement("div")
    preview.className = "gh-assistant-mermaid-preview"

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

  private async copyMermaidSource(panel: HTMLElement) {
    const source = panel.dataset.source || ""
    if (!source) return

    await navigator.clipboard.writeText(source)
    showToast(t("copySuccess"), 1500)
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

  private loadMermaid(): Promise<MermaidApi> {
    if (!this.mermaidPromise) {
      this.mermaidPromise = import("mermaid").then((module) => module.default)
    }

    return this.mermaidPromise
  }
}
