import type { SiteAdapter } from "~adapters/base"
import { DOMToolkit } from "~utils/dom-toolkit"
import { t } from "~utils/i18n"
import type { UsageMonitorSettings } from "~utils/storage"
import {
  appendUsageEvent,
  getLocalDayKey,
  getUsageCounterRecord,
  incrementUsageCounter,
  resetUsageCounter,
  watchUsageCounterState,
  type UsageCounterRecord,
} from "~utils/usage-monitor-storage"

const STYLE_ID = "gh-usage-monitor-style"
const ROOT_CLASS = "gh-usage-monitor-host"
interface PendingSend {
  startedAt: number
  normalizedText: string
  preUserCount: number
  preGenerating: boolean
}

interface UsageEstimateSnapshot {
  inputChars: number
  loadedConversationChars: number
  loadedConversationTokens: number
  loadedOutputChars: number
  loadedOutputTokens: number
  requestTokens: number
  roundTripMin: number
  roundTripMax: number
  roundTripMid: number
}

const DEFAULT_RECORD: UsageCounterRecord = {
  count: 0,
  updatedAt: Date.now(),
  resetAt: Date.now(),
}

const normalizeText = (value: string): string =>
  value
    .replace(/[\u200B\u200C\u200D\uFEFF\u00A0]/g, "")
    .replace(/\s+/g, " ")
    .trim()

const CJK_REGEX = /[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g
const ASCII_ALNUM_REGEX = /[A-Za-z0-9]/g
const PUNCTUATION_REGEX = /[^\sA-Za-z0-9\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g

export class UsageCounterManager {
  private adapter: SiteAdapter
  private siteId: string
  private settings: UsageMonitorSettings
  private root: HTMLDivElement | null = null
  private slot: HTMLDivElement | null = null
  private activeAnchor: HTMLElement | null = null
  private mounted = false
  private mountTimer: number | null = null
  private renderTimer: number | null = null
  private renderInFlight = false
  private rerenderRequested = false
  private midnightTimer: number | null = null
  private pendingTimer: number | null = null
  private pendingSend: PendingSend | null = null
  private unwatchStorage: (() => void) | null = null
  private activeRecordKey = ""
  private currentRecord: UsageCounterRecord = { ...DEFAULT_RECORD }
  private injectedStyleRoots = new Set<ShadowRoot>()
  private readonly handleViewportChange = () => {
    if (!this.settings.enabled) return
    this.scheduleRender(0)
  }

  private readonly handleDocumentClick = (event: MouseEvent) => {
    if (!this.settings.enabled) return

    const editor = this.resolveEditor()
    if (!editor) return
    if (!this.isSubmitButtonClick(event, editor)) return

    this.schedulePendingSend(editor)
  }

  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if (!this.settings.enabled) return
    if (!this.isSubmitShortcut(event)) return

    const editor = this.resolveEditorFromTarget(event.target)
    if (!editor) return

    this.schedulePendingSend(editor)
  }

  private readonly handleDocumentInput = (event: Event) => {
    if (!this.settings.enabled) return

    const editor = this.resolveEditorFromTarget(event.target)
    if (!editor) return

    this.ensureMounted()
    this.scheduleRender(60)
  }

  private readonly handleDocumentFocus = () => {
    if (!this.settings.enabled) return
    this.ensureMounted()
    this.scheduleRender(0)
  }

  constructor(adapter: SiteAdapter, settings: UsageMonitorSettings, siteId: string) {
    this.adapter = adapter
    this.settings = this.normalizeSettings(settings)
    this.siteId = siteId
  }

  start() {
    if (!this.settings.enabled) return
    if (this.mounted) {
      this.ensureMounted()
      this.scheduleRender(0)
      return
    }

    this.mounted = true
    this.ensureStyles()

    document.addEventListener("click", this.handleDocumentClick, true)
    document.addEventListener("keydown", this.handleDocumentKeydown, true)
    document.addEventListener("input", this.handleDocumentInput, true)
    document.addEventListener("focusin", this.handleDocumentFocus, true)
    window.addEventListener("resize", this.handleViewportChange, true)
    window.addEventListener("scroll", this.handleViewportChange, true)

    this.unwatchStorage = watchUsageCounterState((newState) => {
      const record = newState.records[this.getRecordKey()]
      this.currentRecord = record
        ? {
            count: Math.max(0, Math.floor(record.count || 0)),
            updatedAt: record.updatedAt || Date.now(),
            resetAt: record.resetAt || Date.now(),
          }
        : { count: 0, updatedAt: Date.now(), resetAt: Date.now() }
      this.scheduleRender(0)
    })

    this.startMountLoop()
    this.scheduleMidnightReset()
    void this.syncCounterRecord(true)
    this.ensureMounted()
    this.scheduleRender(0)
  }

  stop() {
    if (!this.mounted) {
      this.removeRoot()
      this.removeStyles()
      return
    }

    this.mounted = false
    document.removeEventListener("click", this.handleDocumentClick, true)
    document.removeEventListener("keydown", this.handleDocumentKeydown, true)
    document.removeEventListener("input", this.handleDocumentInput, true)
    document.removeEventListener("focusin", this.handleDocumentFocus, true)
    window.removeEventListener("resize", this.handleViewportChange, true)
    window.removeEventListener("scroll", this.handleViewportChange, true)

    if (this.mountTimer !== null) {
      window.clearInterval(this.mountTimer)
      this.mountTimer = null
    }

    if (this.renderTimer !== null) {
      window.clearTimeout(this.renderTimer)
      this.renderTimer = null
    }

    if (this.midnightTimer !== null) {
      window.clearTimeout(this.midnightTimer)
      this.midnightTimer = null
    }

    if (this.pendingTimer !== null) {
      window.clearInterval(this.pendingTimer)
      this.pendingTimer = null
    }

    this.pendingSend = null
    this.unwatchStorage?.()
    this.unwatchStorage = null

    this.removeRoot()
    this.removeStyles()
  }

  destroy() {
    this.stop()
  }

  updateSettings(settings: UsageMonitorSettings) {
    this.settings = this.normalizeSettings(settings)

    if (!this.settings.enabled) {
      this.stop()
      return
    }

    if (!this.mounted) {
      this.start()
      return
    }

    this.activeRecordKey = ""
    this.scheduleMidnightReset()
    this.ensureMounted()
    void this.syncCounterRecord(true)
    this.scheduleRender(0)
  }

  handleUrlChange() {
    if (!this.settings.enabled) return

    this.pendingSend = null
    if (this.pendingTimer !== null) {
      window.clearInterval(this.pendingTimer)
      this.pendingTimer = null
    }

    this.activeRecordKey = ""
    this.adapter.findTextarea()
    this.ensureMounted(true)
    void this.syncCounterRecord(true)
    ;[80, 220, 500, 1000].forEach((delay) =>
      window.setTimeout(() => {
        if (!this.settings.enabled) return
        this.ensureMounted()
        this.scheduleRender(0)
      }, delay),
    )
  }

  private normalizeSettings(settings: UsageMonitorSettings | undefined): UsageMonitorSettings {
    return {
      enabled: settings?.enabled ?? false,
      dailyLimit: Math.max(1, Math.floor(settings?.dailyLimit ?? 100)),
      autoResetEnabled: settings?.autoResetEnabled ?? false,
    }
  }

  private startMountLoop() {
    if (this.mountTimer !== null) return

    this.mountTimer = window.setInterval(() => {
      const mountedChanged = this.ensureMounted()
      if (mountedChanged || this.root) {
        this.scheduleRender(0)
      }
    }, 1000)
  }

  private ensureMounted(force = false): boolean {
    if (!this.settings.enabled) return false

    const editor = this.resolveEditor()
    if (!editor) {
      if (force || (this.activeAnchor && !this.activeAnchor.isConnected)) {
        this.removeRoot()
      }
      return false
    }

    const target = this.resolveMountAnchor(editor)
    if (!target?.parentElement) return false
    this.ensureStylesForTarget(target)

    if (!this.root) {
      this.root = document.createElement("div")
      this.root.className = ROOT_CLASS
    }

    if (!this.slot) {
      this.slot = document.createElement("div")
      this.slot.className = `${ROOT_CLASS}-slot`
    }

    const changed =
      force ||
      this.activeAnchor !== target ||
      !this.root.isConnected ||
      !this.slot.isConnected ||
      this.slot.parentElement !== target.parentElement ||
      this.slot.nextSibling !== target
    if (changed) {
      if (target.parentElement && this.slot.parentElement !== target.parentElement) {
        target.parentElement.insertBefore(this.slot, target)
      } else if (target.parentElement && this.slot.nextSibling !== target) {
        target.parentElement.insertBefore(this.slot, target)
      }

      if (this.root.parentElement !== this.slot) {
        this.slot.appendChild(this.root)
      }
      this.activeAnchor = target
    }

    this.root.dataset.theme = this.detectThemeMode()
    this.applySlotLayout(target)
    return changed
  }

  private removeRoot() {
    this.activeAnchor = null
    this.root?.remove()
    this.root = null
    this.slot?.remove()
    this.slot = null
  }

  private bindPanelControls() {
    if (!this.root) return

    const resetButton = this.root.querySelector<HTMLElement>('[data-action="reset-counter"]')
    if (resetButton) {
      resetButton.onclick = async (event) => {
        event.preventDefault()
        event.stopPropagation()
        await this.syncCounterRecord()
        this.currentRecord = await resetUsageCounter(this.getRecordKey())
        this.scheduleRender(0)
      }
    }
  }

  private ensureStyles() {
    if (document.getElementById(STYLE_ID)) return

    const style = document.createElement("style")
    style.id = STYLE_ID
    style.textContent = this.getUsageMonitorStyles()
    document.head.appendChild(style)
  }

  private ensureStylesForTarget(target: HTMLElement) {
    const rootNode = target.getRootNode()
    if (!(rootNode instanceof ShadowRoot)) return

    DOMToolkit.cssToShadow(rootNode, this.getUsageMonitorStyles(), STYLE_ID)
    this.injectedStyleRoots.add(rootNode)
  }

  private getUsageMonitorStyles(): string {
    return `
      .${ROOT_CLASS} {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        margin: 0;
        pointer-events: auto;
      }

      .${ROOT_CLASS}-slot {
        width: 100%;
        display: flex;
        align-items: flex-start;
        overflow: visible;
        pointer-events: none;
        margin: 0 0 8px 0;
      }

      .${ROOT_CLASS} * {
        box-sizing: border-box;
      }

      .${ROOT_CLASS} .gh-usage-monitor-panel {
        pointer-events: auto;
        border: 1px solid var(--gh-card-border, var(--gh-border, #e5e7eb));
        border-radius: 14px;
        padding: 10px 12px;
        background: var(--gh-card-bg, var(--gh-bg, #ffffff));
        box-shadow: var(--gh-shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.1));
        color: var(--gh-text, #1f2937);
        font-size: 12px;
        line-height: 1.45;
      }

      .${ROOT_CLASS}[data-theme="dark"] .gh-usage-monitor-panel {
        border-color: var(--gh-card-border, var(--gh-border, #333333));
        background: var(--gh-card-bg, var(--gh-bg, #1e1e1e));
        box-shadow: var(--gh-shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.3));
        color: var(--gh-text, #e3e3e3);
      }

      .${ROOT_CLASS} .gh-usage-monitor-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
      }

      .${ROOT_CLASS} .gh-usage-monitor-title {
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      .${ROOT_CLASS} .gh-usage-monitor-meta {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }

      .${ROOT_CLASS} .gh-usage-monitor-count {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        white-space: nowrap;
      }

      .${ROOT_CLASS} .gh-usage-monitor-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--gh-user-query-bg, var(--gh-bg-secondary, #f9fafb));
        color: var(--gh-text-secondary, #6b7280);
        font-size: 11px;
        line-height: 1.2;
        white-space: nowrap;
      }

      .${ROOT_CLASS}[data-theme="dark"] .gh-usage-monitor-badge {
        background: var(--gh-user-query-bg, var(--gh-bg-secondary, #0b0b0b));
        color: var(--gh-text-secondary, #a0a0a0);
      }

      .${ROOT_CLASS} .gh-usage-monitor-reset {
        appearance: none;
        border: 1px solid var(--gh-input-border, var(--gh-border, #e5e7eb));
        border-radius: 999px;
        background: transparent;
        color: inherit;
        font-size: 11px;
        line-height: 1.2;
        padding: 4px 9px;
        cursor: pointer;
        transition: background-color 160ms ease, border-color 160ms ease, opacity 160ms ease;
      }

      .${ROOT_CLASS} .gh-usage-monitor-reset:hover {
        background: var(--gh-hover, #f3f4f6);
        border-color: var(--gh-border-active, #6366f1);
      }

      .${ROOT_CLASS} .gh-usage-monitor-control {
        appearance: none;
        border: 1px solid var(--gh-input-border, var(--gh-border, #e5e7eb));
        border-radius: 999px;
        background: transparent;
        color: inherit;
        font-size: 11px;
        line-height: 1.2;
        padding: 4px 9px;
        cursor: pointer;
        transition: background-color 160ms ease, border-color 160ms ease;
      }

      .${ROOT_CLASS} .gh-usage-monitor-control:hover {
        background: var(--gh-hover, #f3f4f6);
        border-color: var(--gh-border-active, #6366f1);
      }

      .${ROOT_CLASS}[data-theme="dark"] .gh-usage-monitor-reset {
        border-color: var(--gh-input-border, var(--gh-border, #333333));
      }

      .${ROOT_CLASS}[data-theme="dark"] .gh-usage-monitor-reset:hover {
        background: var(--gh-hover, #262626);
      }

      .${ROOT_CLASS} .gh-usage-monitor-progress {
        position: relative;
        height: 6px;
        border-radius: 999px;
        overflow: hidden;
        background: var(--gh-border, #e5e7eb);
        margin-bottom: 8px;
      }

      .${ROOT_CLASS} .gh-usage-monitor-progress-bar {
        height: 100%;
        width: 0;
        border-radius: inherit;
        background: var(--gh-primary, #4285f4);
        transition: width 160ms ease, background-color 160ms ease;
      }

      .${ROOT_CLASS}[data-theme="dark"] .gh-usage-monitor-progress {
        background: var(--gh-border, #333333);
      }

      .${ROOT_CLASS}[data-level="warning"] .gh-usage-monitor-progress-bar {
        background: var(--gh-secondary, #34a853);
      }

      .${ROOT_CLASS}[data-level="warning"] .gh-usage-monitor-count {
        color: var(--gh-secondary, #34a853);
      }

      .${ROOT_CLASS}[data-level="danger"] .gh-usage-monitor-progress-bar {
        background: var(--gh-danger, #ef4444);
      }

      .${ROOT_CLASS}[data-level="danger"] .gh-usage-monitor-count {
        color: var(--gh-danger, #ef4444);
      }

      .${ROOT_CLASS}[data-level="normal"] .gh-usage-monitor-count {
        color: var(--gh-primary, #4285f4);
      }

      .${ROOT_CLASS}[data-theme="dark"][data-level="normal"] .gh-usage-monitor-count {
        color: var(--gh-primary, #4285f4);
      }

      .${ROOT_CLASS}[data-theme="dark"][data-level="warning"] .gh-usage-monitor-count {
        color: var(--gh-secondary, #34a853);
      }

      .${ROOT_CLASS}[data-theme="dark"][data-level="danger"] .gh-usage-monitor-count {
        color: var(--gh-danger, #ef4444);
      }

      .${ROOT_CLASS} .gh-usage-monitor-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px 12px;
      }

      .${ROOT_CLASS} .gh-usage-monitor-item {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
      }

      .${ROOT_CLASS} .gh-usage-monitor-label {
        color: var(--gh-text-secondary, #6b7280);
      }

      .${ROOT_CLASS}[data-theme="dark"] .gh-usage-monitor-label {
        color: var(--gh-text-secondary, #a0a0a0);
      }

      .${ROOT_CLASS} .gh-usage-monitor-value {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        white-space: nowrap;
      }

      .${ROOT_CLASS} .gh-usage-monitor-footnote {
        margin-top: 8px;
        color: var(--gh-text-secondary, #6b7280);
        font-size: 11px;
        line-height: 1.45;
      }

      .${ROOT_CLASS}[data-theme="dark"] .gh-usage-monitor-footnote {
        color: var(--gh-text-secondary, #a0a0a0);
      }

      @media (max-width: 640px) {
        .${ROOT_CLASS} .gh-usage-monitor-grid {
          grid-template-columns: 1fr;
        }
      }
    `
  }

  private removeStyles() {
    document.getElementById(STYLE_ID)?.remove()
    for (const shadowRoot of this.injectedStyleRoots) {
      shadowRoot.getElementById(STYLE_ID)?.remove()
    }
    this.injectedStyleRoots.clear()
  }

  private applySlotLayout(target: HTMLElement) {
    if (!this.root || !this.slot || !target?.isConnected) return

    const targetRect = target.getBoundingClientRect()
    const parentRect = this.slot.parentElement?.getBoundingClientRect()
    const availableWidth = Math.max(280, Math.min(targetRect.width, window.innerWidth - 16))
    const leftOffset = parentRect ? Math.max(0, targetRect.left - parentRect.left) : 0

    this.slot.style.justifyContent = "flex-start"
    this.slot.style.minHeight = "0"
    this.slot.style.marginBottom = "8px"

    this.root.style.width = `${availableWidth}px`
    this.root.style.maxWidth = "100%"
    this.root.style.marginLeft = `${leftOffset}px`
    this.root.style.alignSelf = "flex-start"

    const panelHeight = this.root.offsetHeight
    this.slot.style.height = `${panelHeight + 8}px`
  }

  private scheduleMidnightReset() {
    if (this.midnightTimer !== null) {
      window.clearTimeout(this.midnightTimer)
      this.midnightTimer = null
    }

    if (!this.settings.autoResetEnabled) {
      return
    }

    const now = new Date()
    const next = new Date(now)
    next.setHours(24, 0, 0, 50)
    const delay = Math.max(1000, next.getTime() - now.getTime())

    this.midnightTimer = window.setTimeout(() => {
      void this.syncCounterRecord(true)
      this.scheduleRender(0)
      this.scheduleMidnightReset()
    }, delay)
  }

  private scheduleRender(delay = 0) {
    if (!this.settings.enabled) return

    if (this.renderTimer !== null) {
      window.clearTimeout(this.renderTimer)
    }

    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null
      void this.render()
    }, delay)
  }

  private async render() {
    if (!this.settings.enabled) return
    if (!this.root) {
      this.ensureMounted()
      if (!this.root) return
    }

    if (this.renderInFlight) {
      this.rerenderRequested = true
      return
    }

    this.renderInFlight = true

    try {
      await this.syncCounterRecord()

      const estimate = this.getEstimateSnapshot()
      const count = this.currentRecord.count
      const limit = Math.max(1, this.settings.dailyLimit)
      const ratio = count / limit
      const percent = Math.min(100, Math.max(0, ratio * 100))
      const level = ratio >= 1 ? "danger" : ratio >= 0.8 ? "warning" : "normal"

      this.root.dataset.level = level
      this.root.dataset.theme = this.detectThemeMode()

      const title = t("usageMonitorSettingsTitle") || "高级模型本地计数与预估"
      const usageLabel = this.settings.autoResetEnabled
        ? t("usageMonitorTodayUsed") || "今日已用"
        : t("usageMonitorLocallyUsed") || "本地已记"
      const inputCharsLabel = t("usageMonitorInputChars") || "输入字符"
      const loadedConversationLabel = t("usageMonitorLoadedConversationTokens") || "已加载对话"
      const loadedOutputLabel = t("usageMonitorLoadedOutputTokens") || "已加载输出"
      const requestTokensLabel = t("usageMonitorRequestTokens") || "当前请求"
      const roundTripLabel = t("usageMonitorRoundTripTokens") || "单轮往返"
      const roundTripDesc =
        t("usageMonitorRoundTripDesc") || "单轮往返 = 当前请求 + 一次预计回复的总消耗粗估区间"
      const resetButtonLabel = t("usageMonitorResetButton") || "清零"
      const manualModeLabel = this.settings.autoResetEnabled
        ? null
        : t("usageMonitorManualMode") || "手动模式"
      const contextCharsLabel = t("usageMonitorContextChars") || "上下文字符"

      this.root.replaceChildren(
        this.buildUsageMonitorPanel({
          title,
          usageLabel,
          resetButtonLabel,
          roundTripDesc,
          inputCharsLabel,
          loadedConversationLabel,
          loadedOutputLabel,
          requestTokensLabel,
          roundTripLabel,
          contextCharsLabel,
          manualModeLabel,
          count,
          limit,
          percent,
          estimate,
        }),
      )
      this.bindPanelControls()
      if (this.activeAnchor) {
        this.applySlotLayout(this.activeAnchor)
      }
    } finally {
      this.renderInFlight = false
      if (this.rerenderRequested) {
        this.rerenderRequested = false
        this.scheduleRender(0)
      }
    }
  }

  private async syncCounterRecord(force = false) {
    const recordKey = this.getRecordKey()
    if (!force && this.activeRecordKey === recordKey) return

    this.activeRecordKey = recordKey
    this.currentRecord = await getUsageCounterRecord(recordKey)
  }

  private getRecordKey(): string {
    const cid = this.adapter.getCurrentCid?.() || "default"
    if (this.settings.autoResetEnabled) {
      return `${this.siteId}::${cid}::day::${getLocalDayKey()}`
    }
    return `${this.siteId}::${cid}::manual`
  }

  private resolveEditor(): HTMLElement | null {
    const candidates = this.collectEditorCandidates()
    if (candidates.length > 0) {
      return candidates.sort(
        (a, b) => this.scoreEditorCandidate(b) - this.scoreEditorCandidate(a),
      )[0]
    }

    return this.adapter.findTextarea() || this.adapter.getTextareaElement()
  }

  private collectEditorCandidates(): HTMLElement[] {
    const seen = new Set<HTMLElement>()
    const candidates: HTMLElement[] = []

    for (const selector of this.adapter.getTextareaSelectors()) {
      let nodes: Element[] = []
      try {
        nodes = (DOMToolkit.query(selector, { all: true, shadow: true }) as Element[]) || []
      } catch {
        continue
      }

      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue
        if (seen.has(node)) continue
        seen.add(node)
        if (!this.adapter.isValidTextarea(node)) continue
        candidates.push(node)
      }
    }

    return candidates
  }

  private scoreEditorCandidate(editor: HTMLElement): number {
    if (!editor.isConnected) return Number.NEGATIVE_INFINITY

    const rect = editor.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return Number.NEGATIVE_INFINITY

    let score = 0

    if (editor === document.activeElement || editor.contains(document.activeElement)) {
      score += 1000
    }

    const submitButton =
      this.adapter.findSubmitButton(editor) || this.findSubmitButtonBySelectors(editor)
    if (submitButton && submitButton.isConnected) {
      score += 400
    }

    // 聊天输入区通常位于页面较靠下的位置；当未聚焦时，优先选择更接近视口底部的输入框。
    score += (rect.top / Math.max(window.innerHeight, 1)) * 120

    const ariaLabel = (editor.getAttribute("aria-label") || "").toLowerCase()
    const placeholder = (
      editor.getAttribute("placeholder") ||
      (editor as HTMLInputElement).placeholder ||
      ""
    ).toLowerCase()
    const signalText = `${ariaLabel} ${placeholder}`
    if (/prompt|message|chat|发送|输入|ask|query/.test(signalText)) {
      score += 120
    }

    return score
  }

  private resolveEditorFromTarget(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) {
      return this.resolveEditor()
    }

    for (const selector of this.adapter.getTextareaSelectors()) {
      try {
        if (target.matches(selector)) {
          return target as HTMLElement
        }
        const closest = DOMToolkit.closestComposed(target, selector)
        if (closest instanceof HTMLElement) {
          return closest
        }
      } catch {
        continue
      }
    }

    const editor = this.resolveEditor()
    if (editor && this.containsInComposedTree(editor, target)) {
      return editor
    }

    return null
  }

  private resolveMountAnchor(editor: HTMLElement): HTMLElement | null {
    const submitButton =
      this.adapter.findSubmitButton(editor) || this.findSubmitButtonBySelectors(editor)

    const strongCandidates = [
      DOMToolkit.closestComposed(editor, "form"),
      submitButton ? DOMToolkit.closestComposed(submitButton, "form") : null,
      this.findClosestCommonAncestor(editor, submitButton),
      DOMToolkit.closestComposed(editor, '[role="form"]'),
    ].filter(Boolean) as HTMLElement[]

    const bestStrongCandidate = this.pickBestMountCandidate(strongCandidates, editor, submitButton)
    if (bestStrongCandidate) {
      return bestStrongCandidate
    }

    const candidates = [
      DOMToolkit.closestComposed(editor, ".chat-input-editor-container"),
      DOMToolkit.closestComposed(editor, ".chat-editor"),
      DOMToolkit.closestComposed(editor, ".input-area-container"),
      DOMToolkit.closestComposed(editor, ".input-area"),
      DOMToolkit.closestComposed(editor, ".composer"),
      DOMToolkit.closestComposed(editor, ".footer-input-wrap"),
      DOMToolkit.closestComposed(editor, ".input-container"),
      DOMToolkit.closestComposed(editor, ".editor-container"),
      DOMToolkit.getComposedParentElement(editor),
      editor.parentElement,
    ].filter(Boolean) as HTMLElement[]

    return this.pickBestMountCandidate(candidates, editor, submitButton)
  }

  private pickBestMountCandidate(
    candidates: HTMLElement[],
    editor: HTMLElement,
    submitButton: HTMLElement | null,
  ): HTMLElement | null {
    const scored = Array.from(new Set(candidates))
      .filter((candidate) => {
        if (!candidate?.parentElement) return false
        if (candidate === document.body || candidate === document.documentElement) return false
        if (candidate.isContentEditable) return false
        const rect = candidate.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      .map((candidate) => ({
        candidate,
        score: this.scoreMountCandidate(candidate, editor, submitButton),
      }))
      .sort((a, b) => b.score - a.score)

    return scored[0]?.candidate || null
  }

  private scoreMountCandidate(
    candidate: HTMLElement,
    editor: HTMLElement,
    submitButton: HTMLElement | null,
  ): number {
    const candidateRect = candidate.getBoundingClientRect()
    const editorRect = editor.getBoundingClientRect()
    const area = Math.max(1, candidateRect.width * candidateRect.height)

    let score = 0
    const candidateContainsEditor = this.containsInComposedTree(candidate, editor)
    const candidateContainsSubmit = submitButton
      ? this.containsInComposedTree(candidate, submitButton)
      : false

    const tagName = candidate.tagName.toLowerCase()
    if (tagName === "form") score += 520
    if (candidate.getAttribute("role") === "form") score += 320
    if (candidateContainsEditor) score += 160
    if (candidateContainsSubmit) score += 180
    if (candidateContainsEditor && candidateContainsSubmit) {
      score += 260
    }

    // 避免退化到编辑器的局部包装节点，否则 slot 会被插进输入框内部。
    if (candidate === editor.parentElement) score -= 260

    const distance =
      Math.abs(candidateRect.top - editorRect.top) +
      Math.abs(candidateRect.left - editorRect.left) +
      Math.abs(candidateRect.bottom - editorRect.bottom)
    score -= distance * 0.2

    // 避免把面板挂到页面级大容器上，优先选择更局部的输入区包装节点。
    score -= area / 5000

    if (candidateRect.height < editorRect.height * 1.4) {
      score -= 140
    }

    const parent = candidate.parentElement
    if (parent) {
      const parentStyle = window.getComputedStyle(parent)
      const isRowFlex =
        parentStyle.display.includes("flex") && !parentStyle.flexDirection.startsWith("column")
      if (
        isRowFlex &&
        this.containsInComposedTree(parent, editor) &&
        (!submitButton || this.containsInComposedTree(parent, submitButton))
      ) {
        const parentRect = parent.getBoundingClientRect()
        const parentArea = Math.max(1, parentRect.width * parentRect.height)
        // 仅在父级也是一个比较局部的输入条容器时，才允许把挂载点提升到父级。
        if (parentArea < area * 2.2 && parentArea < window.innerWidth * window.innerHeight * 0.4) {
          score += 60
        }
      }
    }

    return score
  }

  private findClosestCommonAncestor(
    first: HTMLElement | null,
    second: HTMLElement | null,
  ): HTMLElement | null {
    if (!first || !second) return null

    const ancestors = new Set<HTMLElement>()
    let current: Node | null = first
    while (current) {
      if (current instanceof HTMLElement) {
        ancestors.add(current)
      }
      current = DOMToolkit.getComposedParent(current)
    }

    current = second
    while (current) {
      if (current instanceof HTMLElement && ancestors.has(current)) {
        if (current === document.body || current === document.documentElement) {
          return null
        }
        return current
      }
      current = DOMToolkit.getComposedParent(current)
    }

    return null
  }

  private findSubmitButtonBySelectors(editor: HTMLElement | null): HTMLElement | null {
    const selectors = this.adapter.getSubmitButtonSelectors()
    if (selectors.length === 0) return null

    const rootNode = editor?.getRootNode()
    const scopeCandidates = Array.from(
      new Set(
        [
          rootNode instanceof ShadowRoot ? rootNode : null,
          editor ? DOMToolkit.closestComposed(editor, "form") : null,
          editor?.parentElement,
          DOMToolkit.getComposedParentElement(editor),
          document.body,
        ].filter(Boolean) as ParentNode[],
      ),
    )

    for (const scope of scopeCandidates) {
      for (const selector of selectors) {
        try {
          const found = scope.querySelector(selector)
          if (found instanceof HTMLElement) return found
        } catch {
          continue
        }
      }
    }

    return null
  }

  private containsInComposedTree(container: HTMLElement, target: Element | null): boolean {
    let current: Node | null = target
    while (current) {
      if (current === container) {
        return true
      }
      current = DOMToolkit.getComposedParent(current)
    }
    return false
  }

  private isSubmitButtonClick(event: MouseEvent, editor: HTMLElement): boolean {
    const path = event.composedPath()
    const submitButton =
      this.adapter.findSubmitButton(editor) || this.findSubmitButtonBySelectors(editor)

    if (submitButton && path.includes(submitButton)) {
      return true
    }

    const selectors = this.adapter.getSubmitButtonSelectors()
    if (selectors.length === 0) return false

    for (const target of path) {
      if (!(target instanceof Element)) continue
      for (const selector of selectors) {
        try {
          if (target.matches(selector)) return true
        } catch {
          continue
        }
      }
    }

    return false
  }

  private isSubmitShortcut(event: KeyboardEvent): boolean {
    if (event.key !== "Enter") return false
    if (event.isComposing || event.keyCode === 229) return false

    const keyConfig = this.adapter.getSubmitKeyConfig()
    const usesModifier = keyConfig.key === "Ctrl+Enter"
    const hasPrimaryModifier = event.ctrlKey || event.metaKey

    if (usesModifier) {
      return hasPrimaryModifier && !event.shiftKey && !event.altKey
    }

    return !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
  }

  private schedulePendingSend(editor: HTMLElement) {
    const normalizedText = this.getEditorText(editor)
    if (!normalizedText) return

    const now = Date.now()
    if (
      this.pendingSend &&
      now - this.pendingSend.startedAt < 1200 &&
      this.pendingSend.normalizedText === normalizedText
    ) {
      return
    }

    // 不直接 hook 站点请求逻辑，而是记录一次“候选发送”。
    // 后续通过生成开始、用户消息节点增加、输入框被消费等信号联合确认，
    // 以尽量兼容不同站点的发送实现并降低误计数。
    this.pendingSend = {
      startedAt: now,
      normalizedText,
      preUserCount: this.getUserMessageCount(),
      preGenerating: this.adapter.isGenerating?.() ?? false,
    }

    if (this.pendingTimer === null) {
      this.pendingTimer = window.setInterval(() => {
        void this.confirmPendingSend()
      }, 120)
    }
  }

  private async confirmPendingSend() {
    if (!this.pendingSend) {
      if (this.pendingTimer !== null) {
        window.clearInterval(this.pendingTimer)
        this.pendingTimer = null
      }
      return
    }

    const pending = this.pendingSend
    const editor = this.resolveEditor()
    const currentText = this.getEditorText(editor)
    const currentUserCount = this.getUserMessageCount()
    const isGenerating = this.adapter.isGenerating?.() ?? false

    const age = Date.now() - pending.startedAt
    const userCountIncreased = currentUserCount > pending.preUserCount
    const generationStarted = isGenerating && !pending.preGenerating
    const editorCleared = pending.normalizedText.length > 0 && currentText.length === 0
    const editorChanged =
      pending.normalizedText.length > 0 &&
      currentText.length > 0 &&
      currentText !== pending.normalizedText

    // 站点之间没有统一的“发送成功”事件，这里采用多信号兜底确认：
    // 1. 用户消息节点数量增加
    // 2. 生成状态从未开始变为开始
    // 3. 输入框内容被站点消费并进入生成态
    const confirmed =
      userCountIncreased ||
      generationStarted ||
      (editorCleared && isGenerating) ||
      (editorChanged && isGenerating)

    if (confirmed) {
      this.pendingSend = null
      if (this.pendingTimer !== null) {
        window.clearInterval(this.pendingTimer)
        this.pendingTimer = null
      }

      const estimate = this.getEstimateSnapshot()
      await appendUsageEvent({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
        siteId: this.siteId,
        cid: this.adapter.getCurrentCid?.() || "default",
        sessionId: this.adapter.getSessionId?.() || "",
        countDelta: 1,
        requestTokens: estimate.requestTokens,
        roundTripTokens: estimate.roundTripMid,
        loadedConversationTokens: estimate.loadedConversationTokens,
        loadedOutputTokens: estimate.loadedOutputTokens,
      })

      await this.syncCounterRecord()
      this.currentRecord = await incrementUsageCounter(this.getRecordKey())
      this.scheduleRender(0)
      return
    }

    if (age > 4000) {
      this.pendingSend = null
      if (this.pendingTimer !== null) {
        window.clearInterval(this.pendingTimer)
        this.pendingTimer = null
      }
    }
  }

  private getUserMessageCount(): number {
    const selector = this.adapter.getUserQuerySelector()
    if (!selector) return 0

    try {
      const nodes = (DOMToolkit.query(selector, { all: true, shadow: true }) as Element[]) || []
      return nodes.filter((node) => node instanceof HTMLElement && node.isConnected).length
    } catch {
      return 0
    }
  }

  private getEditorText(editor: HTMLElement | null): string {
    if (!editor) return ""

    if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
      return normalizeText(editor.value || "")
    }

    return normalizeText(editor.textContent || "")
  }

  private getEstimateSnapshot(): UsageEstimateSnapshot {
    const editor = this.resolveEditor()
    const inputText = this.getEditorText(editor)
    const context = this.getLoadedConversationStats()
    const inputChars = inputText.length
    const inputOnlyTokens = this.estimateTokens(inputText)
    const requestTokens = this.estimateTokens(
      [context.conversationText, inputText].filter(Boolean).join("\n"),
    )
    const roundTripMin =
      requestTokens > 0 ? requestTokens + Math.max(32, Math.ceil(requestTokens * 0.5)) : 0
    const roundTripMax =
      requestTokens > 0 ? requestTokens + Math.max(128, Math.ceil(requestTokens * 2)) : 0
    const roundTripMid =
      roundTripMin > 0 || roundTripMax > 0 ? Math.round((roundTripMin + roundTripMax) / 2) : 0

    return {
      inputChars,
      loadedConversationChars: context.conversationChars,
      loadedConversationTokens: context.conversationTokens,
      loadedOutputChars: context.outputChars,
      loadedOutputTokens: context.outputTokens,
      requestTokens: Math.max(requestTokens, inputOnlyTokens),
      roundTripMin,
      roundTripMax,
      roundTripMid,
    }
  }

  private getLoadedConversationStats(): {
    conversationText: string
    conversationChars: number
    conversationTokens: number
    outputChars: number
    outputTokens: number
  } {
    const selectors = this.adapter.getChatContentSelectors()
    if (!selectors.length) {
      return {
        conversationText: "",
        conversationChars: 0,
        conversationTokens: 0,
        outputChars: 0,
        outputTokens: 0,
      }
    }

    let nodes: Element[] = []
    try {
      nodes = (DOMToolkit.query(selectors, { all: true, shadow: true }) as Element[]) || []
    } catch {
      nodes = []
    }

    if (nodes.length === 0) {
      return {
        conversationText: "",
        conversationChars: 0,
        conversationTokens: 0,
        outputChars: 0,
        outputTokens: 0,
      }
    }

    const userSelector = this.adapter.getUserQuerySelector()
    const uniqueNodes = Array.from(new Set(nodes))
    const conversationChunks: string[] = []
    const outputChunks: string[] = []

    // 这里只统计当前页面 DOM 中“已经加载出来”的会话内容。
    // 如果站点做了懒加载或折叠隐藏，未出现在 DOM 中的历史内容不会被计入。
    uniqueNodes.forEach((node) => {
      const isUser = userSelector ? this.matchesSelector(node, userSelector) : false
      const text = isUser
        ? this.adapter.extractUserQueryMarkdown(node)
        : this.adapter.extractAssistantResponseText(node)
      const normalized = normalizeText(text || node.textContent || "")
      if (!normalized) return

      conversationChunks.push(normalized)
      if (!isUser) {
        outputChunks.push(normalized)
      }
    })

    const conversationText = conversationChunks.join("\n")
    const outputText = outputChunks.join("\n")

    return {
      conversationText,
      conversationChars: conversationText.length,
      conversationTokens: this.estimateTokens(conversationText),
      outputChars: outputText.length,
      outputTokens: this.estimateTokens(outputText),
    }
  }

  private matchesSelector(element: Element, selector: string): boolean {
    try {
      return element.matches(selector)
    } catch {
      return false
    }
  }

  private estimateTokens(text: string): number {
    if (!text) return 0

    const cjkCount = (text.match(CJK_REGEX) || []).length
    const asciiCount = (text.match(ASCII_ALNUM_REGEX) || []).length
    const punctuationCount = (text.match(PUNCTUATION_REGEX) || []).length

    return Math.max(0, Math.ceil(cjkCount * 1.2 + asciiCount / 4 + punctuationCount / 2))
  }

  private detectThemeMode(): "light" | "dark" {
    const htmlClass = document.documentElement.className
    if (/\bdark\b/i.test(htmlClass)) return "dark"
    if (/\blight\b/i.test(htmlClass)) return "light"

    const bodyClass = document.body.className
    if (/\bdark-theme\b/i.test(bodyClass)) return "dark"
    if (/\blight-theme\b/i.test(bodyClass)) return "light"

    const dataTheme = document.body.dataset.theme || document.documentElement.dataset.theme
    if (dataTheme === "dark") return "dark"
    if (dataTheme === "light") return "light"

    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light"
  }

  private buildUsageMonitorPanel({
    title,
    usageLabel,
    resetButtonLabel,
    roundTripDesc,
    inputCharsLabel,
    loadedConversationLabel,
    loadedOutputLabel,
    requestTokensLabel,
    roundTripLabel,
    contextCharsLabel,
    manualModeLabel,
    count,
    limit,
    percent,
    estimate,
  }: {
    title: string
    usageLabel: string
    resetButtonLabel: string
    roundTripDesc: string
    inputCharsLabel: string
    loadedConversationLabel: string
    loadedOutputLabel: string
    requestTokensLabel: string
    roundTripLabel: string
    contextCharsLabel: string
    manualModeLabel: string | null
    count: number
    limit: number
    percent: number
    estimate: UsageEstimateSnapshot
  }): HTMLDivElement {
    const panel = document.createElement("div")
    panel.className = "gh-usage-monitor-panel"

    const top = document.createElement("div")
    top.className = "gh-usage-monitor-top"

    const titleElement = document.createElement("div")
    titleElement.className = "gh-usage-monitor-title"
    titleElement.textContent = title

    const meta = document.createElement("div")
    meta.className = "gh-usage-monitor-meta"

    if (manualModeLabel) {
      const badge = document.createElement("span")
      badge.className = "gh-usage-monitor-badge"
      badge.textContent = manualModeLabel
      meta.appendChild(badge)
    }

    const countElement = document.createElement("div")
    countElement.className = "gh-usage-monitor-count"
    countElement.textContent = `${usageLabel}: ${count} / ${limit}`

    const resetButton = document.createElement("button")
    resetButton.type = "button"
    resetButton.className = "gh-usage-monitor-reset"
    resetButton.dataset.action = "reset-counter"
    resetButton.textContent = resetButtonLabel

    meta.append(countElement, resetButton)
    top.append(titleElement, meta)

    const progress = document.createElement("div")
    progress.className = "gh-usage-monitor-progress"

    const progressBar = document.createElement("div")
    progressBar.className = "gh-usage-monitor-progress-bar"
    progressBar.style.width = `${percent.toFixed(1)}%`
    progress.appendChild(progressBar)

    const grid = document.createElement("div")
    grid.className = "gh-usage-monitor-grid"
    grid.append(
      this.createUsageMonitorItem(inputCharsLabel, `${estimate.inputChars} chars`),
      this.createUsageMonitorItem(
        loadedConversationLabel,
        `${estimate.loadedConversationTokens} tokens`,
      ),
      this.createUsageMonitorItem(loadedOutputLabel, `${estimate.loadedOutputTokens} tokens`),
      this.createUsageMonitorItem(requestTokensLabel, `${estimate.requestTokens} tokens`),
      this.createUsageMonitorItem(
        roundTripLabel,
        `${estimate.roundTripMin}-${estimate.roundTripMax}`,
      ),
      this.createUsageMonitorItem(contextCharsLabel, `${estimate.loadedConversationChars} chars`),
    )

    const footnote = document.createElement("div")
    footnote.className = "gh-usage-monitor-footnote"
    footnote.textContent = roundTripDesc

    panel.append(top, progress, grid, footnote)
    return panel
  }

  private createUsageMonitorItem(label: string, value: string): HTMLDivElement {
    const item = document.createElement("div")
    item.className = "gh-usage-monitor-item"

    const labelElement = document.createElement("span")
    labelElement.className = "gh-usage-monitor-label"
    labelElement.textContent = label

    const valueElement = document.createElement("span")
    valueElement.className = "gh-usage-monitor-value"
    valueElement.textContent = value

    item.append(labelElement, valueElement)
    return item
  }
}
