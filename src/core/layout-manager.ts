import type {
  LayoutCapability,
  PanelAvoidanceConfig,
  PanelAvoidanceInsetConfig,
  SiteAdapter,
  WidthSelectorConfig,
} from "~adapters/base"
import { useSettingsStore } from "~stores/settings-store"
import { DOMToolkit } from "~utils/dom-toolkit"
import { createSafeHTML } from "~utils/trusted-types"
import { t } from "~utils/i18n"
import { INTER_LOCAL_FONT_FACE, getPlatformFontFamily } from "~utils/font"
import type { PageWidthConfig, ZenModeConfig } from "~utils/storage"

// ==================== 样式 ID 常量 ====================
const STYLE_IDS = {
  PAGE_WIDTH: "gh-page-width-styles",
  PAGE_WIDTH_SHADOW: "gh-page-width-shadow",
  PANEL_AVOIDANCE: "gh-panel-avoidance-styles",
  PANEL_AVOIDANCE_SHADOW: "gh-panel-avoidance-shadow",
  USER_QUERY_WIDTH: "gh-user-query-width-styles",
  USER_QUERY_WIDTH_SHADOW: "gh-user-query-width-shadow",
  ZEN_MODE: "gh-zen-mode-styles",
  ZEN_MODE_SHADOW: "gh-zen-mode-shadow",
  CLEAN_MODE: "gh-clean-mode-styles",
  CLEAN_MODE_SHADOW: "gh-clean-mode-shadow",
} as const

const ZEN_MODE_EXIT_HOST_ID = "gh-zen-mode-exit-host"
const DEFAULT_ZEN_MODE_CONFIG: ZenModeConfig = {
  enabled: false,
  showExitButton: true,
}

/** 窄屏断点（CSS 逻辑像素），低于此值时内容宽度自动切换为近满屏，避免百分比宽度在手机上过窄 */
const NARROW_SCREEN_BREAKPOINT = 480
const DEFAULT_PANEL_AVOIDANCE_GAP = 16
const DEFAULT_PANEL_AVOIDANCE_MIN_VISIBLE_WIDTH = 120
const DEFAULT_PANEL_AVOIDANCE_MIN_SAFE_WIDTH = 360
const DEFAULT_PANEL_AVOIDANCE_MIN_VIEWPORT_WIDTH = 768
const PANEL_HOVER_WIDTH_ACTIVE_ATTR = "data-panel-hover-width-active"
const PANEL_BASE_WIDTH_ATTR = "data-panel-base-width"
const PANEL_ANCHOR_SIDE_ATTR = "data-panel-anchor-side"
const PANEL_HOVER_WIDTH_AVOIDANCE_SUPPRESSION_MS = 260

interface PanelReservation {
  targetWidth: number
  leftInset: number
  rightInset: number
  leftEdgeInset: number
  rightEdgeInset: number
}

interface HorizontalRect {
  left: number
  right: number
  width: number
}

interface PanelAvoidanceObstacle {
  element: HTMLElement
  rect: DOMRect
}

/**
 * 页面布局管理器
 * 负责动态注入页面宽度和用户问题宽度样式，支持 Shadow DOM
 */
export class LayoutManager {
  private siteAdapter: SiteAdapter
  private pageWidthConfig: PageWidthConfig
  private panelAvoidanceConfig: PanelAvoidanceConfig | null = null
  private userQueryWidthConfig: PageWidthConfig | null = null

  private pageWidthStyle: HTMLStyleElement | null = null
  private panelAvoidanceStyle: HTMLStyleElement | null = null
  private panelAvoidanceShadowCss = ""
  private userQueryWidthStyle: HTMLStyleElement | null = null
  private zenModeStyle: HTMLStyleElement | null = null
  private zenModeConfig: ZenModeConfig = DEFAULT_ZEN_MODE_CONFIG
  private zenModeEnabled = false
  private zenModeExitHost: HTMLElement | null = null
  private zenModeRootClassState: {
    selector: string
    className: string
    removeOnDisable: boolean
  } | null = null

  private cleanModeStyle: HTMLStyleElement | null = null
  private cleanModeEnabled = false

  private processedShadowRoots = new WeakSet<ShadowRoot>()
  private shadowCheckInterval: ReturnType<typeof setTimeout> | null = null
  private panelAvoidanceStarted = false
  private panelAvoidanceRaf: number | null = null
  private panelAvoidanceHostObserver: MutationObserver | null = null
  private panelAvoidancePanelObserver: MutationObserver | null = null
  private panelAvoidanceResizeObserver: ResizeObserver | null = null
  private panelAvoidanceScopeResizeObserver: ResizeObserver | null = null
  private panelAvoidanceObservedPanel: HTMLElement | null = null
  private panelAvoidanceObservedScope: HTMLElement | null = null
  private panelHoverWidthAvoidanceSuppressedUntil = 0

  constructor(siteAdapter: SiteAdapter, pageWidthConfig: PageWidthConfig) {
    this.siteAdapter = siteAdapter
    this.pageWidthConfig = pageWidthConfig
    this.panelAvoidanceConfig = this.getPanelAvoidanceConfig()
  }

  private getLayoutCapability(): LayoutCapability | undefined {
    return this.siteAdapter.getCapabilities().layout
  }

  private getWidthSelectors(): WidthSelectorConfig[] {
    return this.getLayoutCapability()?.getWidthSelectors?.() ?? this.siteAdapter.getWidthSelectors()
  }

  private getUserQueryWidthSelectors(): WidthSelectorConfig[] {
    return (
      this.getLayoutCapability()?.getUserQueryWidthSelectors?.() ??
      this.siteAdapter.getUserQueryWidthSelectors()
    )
  }

  private getPanelAvoidanceConfig(): PanelAvoidanceConfig | null {
    return (
      this.getLayoutCapability()?.getPanelAvoidanceConfig?.() ??
      this.siteAdapter.getPanelAvoidanceConfig()
    )
  }

  // ==================== 页面宽度 ====================

  updateConfig(config: PageWidthConfig) {
    this.pageWidthConfig = config
    this.apply()
    this.schedulePanelAvoidanceUpdate()
  }

  apply() {
    this.removeStyle(this.pageWidthStyle)
    this.pageWidthStyle = null

    if (!this.pageWidthConfig?.enabled) {
      this.refreshShadowInjection()
      return
    }

    const css = this.generatePageWidthCSS()
    this.pageWidthStyle = this.injectStyle(STYLE_IDS.PAGE_WIDTH, css)
    this.refreshShadowInjection()
  }

  // ==================== 面板安全区避让 ====================

  startPanelAvoidance() {
    if (!this.panelAvoidanceConfig || this.panelAvoidanceStarted) return

    this.panelAvoidanceStarted = true
    window.addEventListener("resize", this.schedulePanelAvoidanceUpdate)
    window.visualViewport?.addEventListener("resize", this.schedulePanelAvoidanceUpdate)
    document.addEventListener("visibilitychange", this.handlePanelAvoidanceVisibilityChange)

    if (document.body) {
      this.panelAvoidanceHostObserver = new MutationObserver(this.schedulePanelAvoidanceUpdate)
      this.panelAvoidanceHostObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "aria-hidden", "data-state"],
      })
    }

    this.refreshShadowInjection()
    this.schedulePanelAvoidanceUpdate()
  }

  stopPanelAvoidance() {
    if (!this.panelAvoidanceStarted) {
      this.clearPanelAvoidanceStyle()
      return
    }

    this.panelAvoidanceStarted = false
    window.removeEventListener("resize", this.schedulePanelAvoidanceUpdate)
    window.visualViewport?.removeEventListener("resize", this.schedulePanelAvoidanceUpdate)
    document.removeEventListener("visibilitychange", this.handlePanelAvoidanceVisibilityChange)

    if (this.panelAvoidanceRaf !== null) {
      window.cancelAnimationFrame(this.panelAvoidanceRaf)
      this.panelAvoidanceRaf = null
    }

    this.panelAvoidanceHostObserver?.disconnect()
    this.panelAvoidanceHostObserver = null
    this.panelAvoidancePanelObserver?.disconnect()
    this.panelAvoidancePanelObserver = null
    this.panelAvoidanceResizeObserver?.disconnect()
    this.panelAvoidanceResizeObserver = null
    this.panelAvoidanceScopeResizeObserver?.disconnect()
    this.panelAvoidanceScopeResizeObserver = null
    this.panelAvoidanceObservedPanel = null
    this.panelAvoidanceObservedScope = null
    this.panelHoverWidthAvoidanceSuppressedUntil = 0
    this.clearPanelAvoidanceStyle()
    this.refreshShadowInjection()
  }

  // ==================== 用户问题宽度 ====================

  updateUserQueryConfig(config: PageWidthConfig) {
    this.userQueryWidthConfig = config
    this.applyUserQueryWidth()
  }

  applyUserQueryWidth() {
    this.removeStyle(this.userQueryWidthStyle)
    this.userQueryWidthStyle = null

    if (!this.userQueryWidthConfig?.enabled) {
      this.refreshShadowInjection()
      return
    }

    const css = this.generateUserQueryWidthCSS()
    this.userQueryWidthStyle = this.injectStyle(STYLE_IDS.USER_QUERY_WIDTH, css)
    this.refreshShadowInjection()
  }

  // ==================== Zen Mode ====================

  updateZenMode(config: boolean | ZenModeConfig) {
    this.zenModeConfig =
      typeof config === "boolean"
        ? { ...this.zenModeConfig, enabled: config }
        : { ...DEFAULT_ZEN_MODE_CONFIG, ...config }
    this.zenModeEnabled = this.zenModeConfig.enabled
    this.applyZenMode()
  }

  applyZenMode() {
    this.removeStyle(this.zenModeStyle)
    this.zenModeStyle = null

    if (!this.zenModeEnabled) {
      this.cleanupZenModeRootClass()
      this.unmountZenModeExitButton()
      this.refreshShadowInjection()
      this.schedulePanelAvoidanceUpdate()
      return
    }

    this.syncZenModeRootClass()

    const css = this.generateZenModeCSS()
    if (css) {
      this.zenModeStyle = this.injectStyle(STYLE_IDS.ZEN_MODE, css)
    }
    if (this.zenModeConfig.showExitButton === false) {
      this.unmountZenModeExitButton()
    } else {
      this.mountZenModeExitButton()
    }
    this.refreshShadowInjection()
    this.schedulePanelAvoidanceUpdate()
  }

  // ==================== Clean Mode ====================

  updateCleanMode(enabled: boolean) {
    this.cleanModeEnabled = enabled
    this.applyCleanMode()
  }

  applyCleanMode() {
    this.removeStyle(this.cleanModeStyle)
    this.cleanModeStyle = null

    if (!this.cleanModeEnabled) {
      this.refreshShadowInjection()
      this.schedulePanelAvoidanceUpdate()
      return
    }

    const css = this.generateCleanModeCSS()
    if (css) {
      this.cleanModeStyle = this.injectStyle(STYLE_IDS.CLEAN_MODE, css)
    }
    this.refreshShadowInjection()
    this.schedulePanelAvoidanceUpdate()
  }

  // ==================== CSS 生成 ====================

  private generatePageWidthCSS(): string {
    const width = `${this.pageWidthConfig.value}${this.pageWidthConfig.unit}`
    const selectors = this.getWidthSelectors()
    const mainCss = this.buildCSSFromSelectors(selectors, width, true)

    // 当配置单位为 "%" 时，追加窄屏兜底媒体查询
    // （当前设置归一化后 pageWidthConfig.unit 仅会是 "%"）
    if (this.pageWidthConfig.unit === "%") {
      const narrowCss = this.buildCSSFromSelectors(selectors, "95%", true)
      return `${mainCss}\n@media (max-width: ${NARROW_SCREEN_BREAKPOINT}px) {\n${narrowCss}\n}`
    }

    return mainCss
  }

  private generateUserQueryWidthCSS(): string {
    if (!this.userQueryWidthConfig) return ""
    // 添加默认值防止 undefined（默认 81%）
    const value = this.userQueryWidthConfig.value || "81"
    const unit = this.userQueryWidthConfig.unit || "%"
    const width = `${value}${unit}`
    const selectors = this.getUserQueryWidthSelectors()
    return this.buildCSSFromSelectors(selectors, width, false)
  }

  private generateZenModeCSS(): string {
    const zenConfig = this.siteAdapter.getZenModeConfig()
    const cleanConfig = this.siteAdapter.getCleanModeConfig()
    if (!zenConfig && !cleanConfig) return ""

    // 禅模式是超集，合并禅模式 + 净化模式的所有选择器
    const allHide = [...(zenConfig?.hide || []), ...(cleanConfig?.hide || [])]
    const allStyles = [...(zenConfig?.styles || []), ...(cleanConfig?.styles || [])]

    const hideCss = allHide
      .map((selector) => `${selector} { display: none !important; }`)
      .join("\n")
    const styleCss = this.buildZenModeStyleCSS(allStyles)

    return [hideCss, styleCss].filter(Boolean).join("\n")
  }

  private generateCleanModeCSS(): string {
    const config = this.siteAdapter.getCleanModeConfig()
    if (!config) return ""

    const hideCss = (config.hide || [])
      .map((selector) => `${selector} { display: none !important; }`)
      .join("\n")
    const styleCss = this.buildZenModeStyleCSS(config.styles || [])

    return [hideCss, styleCss].filter(Boolean).join("\n")
  }

  private buildCSSFromSelectors(
    selectors: WidthSelectorConfig[],
    globalWidth: string,
    useGlobalSelector: boolean,
  ): string {
    return selectors
      .map((config) => {
        const { selector, globalSelector, property, value, transformValue, extraCss, noCenter } =
          config
        const rawWidth = value || globalWidth
        const finalWidth = transformValue ? transformValue(rawWidth) : rawWidth
        const targetSelector = useGlobalSelector ? globalSelector || selector : selector
        const centerCss = noCenter
          ? ""
          : "margin-left: auto !important; margin-right: auto !important;"
        const extra = extraCss || ""
        return `${targetSelector} { ${property}: ${finalWidth} !important; ${centerCss} ${extra} }`
      })
      .join("\n")
  }

  private generatePanelAvoidanceCSS(
    panel: HTMLElement,
    reservation: PanelReservation | null,
    useGlobalSelector = true,
  ): string {
    const config = this.panelAvoidanceConfig
    if (!config) return ""

    const widthCss = reservation
      ? this.buildCSSFromSelectors(
          config.widthSelectors,
          `${Math.max(0, Math.floor(reservation.targetWidth))}px`,
          useGlobalSelector,
        )
      : ""
    const insetCss = (config.insetSelectors || [])
      .map((insetConfig) => {
        const insetReservation = this.getPanelAvoidanceInsetReservation(
          panel,
          insetConfig,
          reservation,
        )
        if (!insetReservation) return ""

        return this.buildPanelAvoidanceInsetCSS(
          insetConfig,
          `${Math.max(
            0,
            Math.floor(
              insetConfig.insetMode === "edge"
                ? insetReservation.leftEdgeInset
                : insetReservation.leftInset,
            ),
          )}px`,
          `${Math.max(
            0,
            Math.floor(
              insetConfig.insetMode === "edge"
                ? insetReservation.rightEdgeInset
                : insetReservation.rightInset,
            ),
          )}px`,
        )
      })
      .join("\n")

    return [widthCss, insetCss].filter(Boolean).join("\n")
  }

  private getPanelAvoidanceInsetReservation(
    panel: HTMLElement,
    config: PanelAvoidanceInsetConfig,
    fallbackReservation: PanelReservation | null,
  ): PanelReservation | null {
    if (!config.scopeSelector) return fallbackReservation

    const scope = this.findPanelAvoidanceScope(config.scopeSelector)
    if (!scope) return null

    return this.getPanelReservation(panel, this.getPanelAvoidanceScopeRect(scope))
  }

  private buildPanelAvoidanceInsetCSS(
    config: PanelAvoidanceInsetConfig,
    leftInset: string,
    rightInset: string,
  ): string {
    const applySide = config.applySide || "both"
    const leftProperty = config.leftProperty || "padding-left"
    const rightProperty = config.rightProperty || "padding-right"
    const extra = config.extraCss || ""
    const leftCss = applySide === "right" ? "" : `${leftProperty}: ${leftInset} !important;`
    const rightCss = applySide === "left" ? "" : `${rightProperty}: ${rightInset} !important;`

    return `${config.selector} { ${leftCss} ${rightCss} ${extra} }`
  }

  private getPanelAvoidanceBaseWidth(scopeWidth: number): number {
    const rawWidth = this.pageWidthConfig?.enabled
      ? `${this.pageWidthConfig.value}${this.pageWidthConfig.unit}`
      : this.panelAvoidanceConfig?.defaultWidth
    const parsedWidth = this.parsePanelAvoidanceWidth(rawWidth, scopeWidth)

    return parsedWidth ?? scopeWidth
  }

  private parsePanelAvoidanceWidth(
    rawWidth: string | undefined,
    scopeWidth: number,
  ): number | null {
    if (!rawWidth) return null

    const width = rawWidth.trim()
    const numericValue = Number.parseFloat(width)
    if (!Number.isFinite(numericValue) || numericValue <= 0) return null

    if (width.endsWith("%")) {
      return (scopeWidth * numericValue) / 100
    }
    if (width.endsWith("px")) {
      return numericValue
    }

    return numericValue
  }

  private findMainPanel(): HTMLElement | null {
    let panel: HTMLElement | null = null

    DOMToolkit.walkShadowRoots((shadowRoot) => {
      if (panel) return
      const candidate = shadowRoot.querySelector(".gh-main-panel")
      if (candidate instanceof HTMLElement) {
        panel = candidate
      }
    })

    if (panel) return panel

    const fallback = document.querySelector(".gh-main-panel")
    return fallback instanceof HTMLElement ? fallback : null
  }

  private findPanelAvoidanceScope(
    selector = this.panelAvoidanceConfig?.scopeSelector,
  ): HTMLElement | null {
    if (!selector) return null

    const candidates = DOMToolkit.query(selector, {
      all: true,
      shadow: true,
    }) as Element[] | null

    for (const candidate of candidates || []) {
      if (!(candidate instanceof HTMLElement)) continue

      const rect = candidate.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        return candidate
      }
    }

    return null
  }

  private getPanelAvoidanceScopeRect(scope: HTMLElement | null): HorizontalRect {
    if (!scope) {
      return {
        left: 0,
        right: window.innerWidth,
        width: window.innerWidth,
      }
    }

    const rect = scope.getBoundingClientRect()
    const left = Math.max(0, rect.left)
    const right = Math.min(window.innerWidth, rect.right)

    return {
      left,
      right,
      width: Math.max(0, right - left),
    }
  }

  private isPanelAvoidanceViewportTooNarrow(): boolean {
    const minViewportWidth =
      this.panelAvoidanceConfig?.minViewportWidth ?? DEFAULT_PANEL_AVOIDANCE_MIN_VIEWPORT_WIDTH
    const viewportWidth = Math.min(
      window.innerWidth,
      window.visualViewport?.width ?? window.innerWidth,
    )

    return viewportWidth < minViewportWidth
  }

  private getPanelReservation(
    panel: HTMLElement,
    scopeRect: HorizontalRect,
  ): PanelReservation | null {
    const config = this.panelAvoidanceConfig
    if (!config || !panel.isConnected) return null

    const root = panel.closest(".gh-root")
    if (root?.classList.contains("gh-pass-through")) return null
    if (this.isPanelAvoidanceSuppressedByPanelState(panel)) return null

    const obstacles = this.getPanelAvoidanceObstacles(panel)
    if (obstacles.length === 0) return null
    return this.getPanelReservationFromObstacles(obstacles, scopeRect)
  }

  private getPanelAvoidanceObstacles(panel: HTMLElement): PanelAvoidanceObstacle[] {
    const obstacles: PanelAvoidanceObstacle[] = []
    const panelRect = this.getVisiblePanelAvoidanceObstacleRect(panel, {
      minWidth: this.panelAvoidanceConfig?.minVisiblePanelWidth,
      minHeight: 120,
    })

    if (!panelRect) return obstacles
    obstacles.push({ element: panel, rect: panelRect })

    for (const selector of this.panelAvoidanceConfig?.obstacleSelectors || []) {
      const candidates = DOMToolkit.query(selector, {
        all: true,
        shadow: true,
      }) as Element[] | null

      for (const candidate of candidates || []) {
        if (!(candidate instanceof HTMLElement)) continue
        if (candidate === panel || panel.contains(candidate) || candidate.closest(".gh-root")) {
          continue
        }

        const rect = this.getVisiblePanelAvoidanceObstacleRect(candidate, {
          minWidth: 80,
          minHeight: 120,
        })
        if (!rect) continue

        obstacles.push({ element: candidate, rect })
      }
    }

    return this.dedupePanelAvoidanceObstacles(obstacles)
  }

  private getVisiblePanelAvoidanceObstacleRect(
    element: HTMLElement,
    options: { minWidth?: number; minHeight?: number },
  ): DOMRect | null {
    const style = window.getComputedStyle(element)
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number.parseFloat(style.opacity || "1") <= 0.1
    ) {
      return null
    }

    const rect = this.getPanelAvoidanceObstacleRect(element)
    const visibleLeft = Math.max(0, rect.left)
    const visibleRight = Math.min(window.innerWidth, rect.right)
    const visibleWidth = Math.max(0, visibleRight - visibleLeft)
    const minVisibleWidth = options.minWidth ?? DEFAULT_PANEL_AVOIDANCE_MIN_VISIBLE_WIDTH
    const minVisibleHeight = options.minHeight ?? 0

    if (visibleWidth < minVisibleWidth || rect.height < minVisibleHeight) return null

    return rect
  }

  private getPanelAvoidanceObstacleRect(element: HTMLElement): DOMRect {
    const rect = element.getBoundingClientRect()
    if (
      !element.classList.contains("gh-main-panel") ||
      element.getAttribute(PANEL_HOVER_WIDTH_ACTIVE_ATTR) !== "true"
    ) {
      return rect
    }

    const baseWidth = Number.parseFloat(element.getAttribute(PANEL_BASE_WIDTH_ATTR) || "")
    if (!Number.isFinite(baseWidth) || baseWidth <= 0 || baseWidth >= rect.width) {
      return rect
    }

    const anchorSide = element.getAttribute(PANEL_ANCHOR_SIDE_ATTR)
    const left = anchorSide === "right" ? rect.right - baseWidth : rect.left
    return new DOMRect(left, rect.top, baseWidth, rect.height)
  }

  private dedupePanelAvoidanceObstacles(
    obstacles: PanelAvoidanceObstacle[],
  ): PanelAvoidanceObstacle[] {
    const deduped: PanelAvoidanceObstacle[] = []

    for (const obstacle of obstacles) {
      const duplicate = deduped.some(
        (existing) =>
          existing.element === obstacle.element ||
          (existing.element.contains(obstacle.element) &&
            this.arePanelAvoidanceRectsSimilar(existing.rect, obstacle.rect)) ||
          (obstacle.element.contains(existing.element) &&
            this.arePanelAvoidanceRectsSimilar(existing.rect, obstacle.rect)),
      )
      if (!duplicate) deduped.push(obstacle)
    }

    return deduped
  }

  private arePanelAvoidanceRectsSimilar(left: DOMRect, right: DOMRect): boolean {
    return (
      Math.abs(left.left - right.left) < 2 &&
      Math.abs(left.right - right.right) < 2 &&
      Math.abs(left.top - right.top) < 2 &&
      Math.abs(left.bottom - right.bottom) < 2
    )
  }

  private getPanelReservationFromObstacles(
    obstacles: PanelAvoidanceObstacle[],
    scopeRect: HorizontalRect,
  ): PanelReservation | null {
    const config = this.panelAvoidanceConfig
    if (!config) return null

    if (scopeRect.width <= 0) return null

    let reservedLeft = 0
    let reservedRight = 0
    const scopeCenter = scopeRect.left + scopeRect.width / 2

    for (const { rect } of obstacles) {
      const visibleLeft = Math.max(0, rect.left)
      const visibleRight = Math.min(window.innerWidth, rect.right)
      const overlapLeft = Math.max(scopeRect.left, visibleLeft)
      const overlapRight = Math.min(scopeRect.right, visibleRight)
      const overlapWidth = Math.max(0, overlapRight - overlapLeft)
      if (overlapWidth <= 0) continue

      const obstacleCenter = overlapLeft + overlapWidth / 2
      if (obstacleCenter < scopeCenter) {
        reservedLeft = Math.max(reservedLeft, overlapRight - scopeRect.left)
      } else {
        reservedRight = Math.max(reservedRight, scopeRect.right - overlapLeft)
      }
    }

    if (reservedLeft <= 0 && reservedRight <= 0) return null

    const gap = config.gap ?? DEFAULT_PANEL_AVOIDANCE_GAP
    const minSafeWidth = config.minSafeWidth ?? DEFAULT_PANEL_AVOIDANCE_MIN_SAFE_WIDTH
    const leftGap = reservedLeft > 0 ? gap : 0
    const rightGap = reservedRight > 0 ? gap : 0
    const safeLeft = scopeRect.left + reservedLeft + leftGap
    const safeRight = scopeRect.right - reservedRight - rightGap
    const safeWidth = safeRight - safeLeft

    if (safeWidth < minSafeWidth) return null

    const baseWidth = this.getPanelAvoidanceBaseWidth(scopeRect.width)
    const targetWidth = Math.min(baseWidth, safeWidth)
    const leftEdgeInset = Math.max(0, safeLeft - scopeRect.left)
    const rightEdgeInset = Math.max(0, scopeRect.right - safeRight)
    const leftover = Math.max(0, safeWidth - targetWidth) / 2
    const leftInset = leftEdgeInset + leftover
    const rightInset = rightEdgeInset + leftover

    return {
      targetWidth,
      leftInset,
      rightInset,
      leftEdgeInset,
      rightEdgeInset,
    }
  }

  private isPanelAvoidanceSuppressedByPanelState(panel: HTMLElement): boolean {
    const panelMode = useSettingsStore.getState().settings?.panel?.panelMode ?? "floating"

    if (panelMode !== "floating") return true

    return (
      panel.classList.contains("edge-snapped-left") ||
      panel.classList.contains("edge-snapped-right")
    )
  }

  private markPanelHoverWidthAvoidanceSuppressed() {
    this.panelHoverWidthAvoidanceSuppressedUntil = Math.max(
      this.panelHoverWidthAvoidanceSuppressedUntil,
      performance.now() + PANEL_HOVER_WIDTH_AVOIDANCE_SUPPRESSION_MS,
    )
  }

  private isPanelHoverWidthAvoidanceSuppressed(panel: HTMLElement | null): boolean {
    if (panel?.classList.contains("dragging")) {
      return false
    }

    return (
      panel?.getAttribute(PANEL_HOVER_WIDTH_ACTIVE_ATTR) === "true" ||
      performance.now() < this.panelHoverWidthAvoidanceSuppressedUntil
    )
  }

  private handlePanelAvoidancePanelMutation = (records: MutationRecord[]) => {
    const panel = this.panelAvoidanceObservedPanel
    const hasHoverWidthMutation = records.some(
      (record) =>
        record.type === "attributes" &&
        record.target === panel &&
        record.attributeName === PANEL_HOVER_WIDTH_ACTIVE_ATTR,
    )

    if (hasHoverWidthMutation || this.isPanelHoverWidthAvoidanceSuppressed(panel)) {
      this.markPanelHoverWidthAvoidanceSuppressed()
      return
    }

    this.schedulePanelAvoidanceUpdate()
  }

  private handlePanelAvoidancePanelResize = () => {
    if (this.isPanelHoverWidthAvoidanceSuppressed(this.panelAvoidanceObservedPanel)) {
      this.markPanelHoverWidthAvoidanceSuppressed()
      return
    }

    this.schedulePanelAvoidanceUpdate()
  }

  private syncPanelAvoidanceObservers(panel: HTMLElement | null, scope: HTMLElement | null) {
    if (this.panelAvoidanceObservedPanel !== panel) {
      this.panelAvoidancePanelObserver?.disconnect()
      this.panelAvoidancePanelObserver = null
      this.panelAvoidanceResizeObserver?.disconnect()
      this.panelAvoidanceResizeObserver = null
      this.panelAvoidanceObservedPanel = panel

      if (panel) {
        this.panelAvoidancePanelObserver = new MutationObserver(
          this.handlePanelAvoidancePanelMutation,
        )
        this.panelAvoidancePanelObserver.observe(panel, {
          attributes: true,
          attributeFilter: [
            "class",
            "style",
            "data-edge-snap-transitioning",
            PANEL_HOVER_WIDTH_ACTIVE_ATTR,
            PANEL_BASE_WIDTH_ATTR,
            PANEL_ANCHOR_SIDE_ATTR,
          ],
        })

        if (typeof ResizeObserver !== "undefined") {
          this.panelAvoidanceResizeObserver = new ResizeObserver(
            this.handlePanelAvoidancePanelResize,
          )
          this.panelAvoidanceResizeObserver.observe(panel)
        }
      }
    }

    this.syncPanelAvoidanceScopeObserver(scope)
  }

  private syncPanelAvoidanceScopeObserver(scope: HTMLElement | null) {
    if (this.panelAvoidanceObservedScope === scope) return

    this.panelAvoidanceScopeResizeObserver?.disconnect()
    this.panelAvoidanceScopeResizeObserver = null
    this.panelAvoidanceObservedScope = scope

    if (!scope || typeof ResizeObserver === "undefined") return

    this.panelAvoidanceScopeResizeObserver = new ResizeObserver(this.schedulePanelAvoidanceUpdate)
    this.panelAvoidanceScopeResizeObserver.observe(scope)
  }

  private syncPanelAvoidanceStyle() {
    if (!this.panelAvoidanceConfig) {
      this.clearPanelAvoidanceStyle()
      return
    }

    if (this.isPanelAvoidanceViewportTooNarrow()) {
      this.clearPanelAvoidanceStyle()
      return
    }

    const panel = this.findMainPanel()
    const scope = this.findPanelAvoidanceScope()
    if (this.panelAvoidanceConfig.scopeSelector && !scope) {
      this.syncPanelAvoidanceObservers(panel, null)
      this.clearPanelAvoidanceStyle()
      return
    }

    const scopeRect = this.getPanelAvoidanceScopeRect(scope)
    this.syncPanelAvoidanceObservers(panel, scope)

    const reservation = panel ? this.getPanelReservation(panel, scopeRect) : null
    if (!panel) {
      this.clearPanelAvoidanceStyle()
      return
    }

    const css = this.generatePanelAvoidanceCSS(panel, reservation, true)
    if (!css) {
      this.clearPanelAvoidanceStyle()
      return
    }

    this.panelAvoidanceShadowCss = this.generatePanelAvoidanceCSS(panel, reservation, false)
    this.panelAvoidanceStyle = this.upsertStyle(
      STYLE_IDS.PANEL_AVOIDANCE,
      css,
      this.panelAvoidanceStyle,
    )
    this.syncPanelAvoidanceShadowStyles()
  }

  private clearPanelAvoidanceStyle() {
    const hadShadowCss = Boolean(this.panelAvoidanceShadowCss)

    this.removeStyle(this.panelAvoidanceStyle)
    this.panelAvoidanceStyle = null
    this.panelAvoidanceShadowCss = ""
    if (hadShadowCss) {
      this.syncPanelAvoidanceShadowStyles()
    }
  }

  private schedulePanelAvoidanceUpdate = () => {
    if (!this.panelAvoidanceStarted || !this.panelAvoidanceConfig) return
    if (this.panelAvoidanceRaf !== null) return

    this.panelAvoidanceRaf = window.requestAnimationFrame(() => {
      this.panelAvoidanceRaf = null
      this.syncPanelAvoidanceStyle()
    })
  }

  private handlePanelAvoidanceVisibilityChange = () => {
    if (document.visibilityState !== "hidden") {
      this.schedulePanelAvoidanceUpdate()
    }
  }

  // ==================== 工具方法 ====================

  private injectStyle(id: string, css: string): HTMLStyleElement {
    const style = document.createElement("style")
    style.id = id
    style.textContent = css
    document.head.appendChild(style)
    return style
  }

  private upsertStyle(
    id: string,
    css: string,
    currentStyle: HTMLStyleElement | null,
  ): HTMLStyleElement {
    const existing = currentStyle?.isConnected
      ? currentStyle
      : (document.getElementById(id) as HTMLStyleElement | null)
    const style = existing || document.createElement("style")

    style.id = id
    if (style.textContent !== css) {
      style.textContent = css
    }
    if (style.parentElement !== document.head || style.nextSibling) {
      document.head.appendChild(style)
    }

    return style
  }

  private removeStyle(style: HTMLStyleElement | null) {
    if (style) style.remove()
  }

  private buildZenModeStyleCSS(
    rules: Array<{
      selector: string
      property: string
      value: string
      globalSelector?: string
      extraCss?: string
    }>,
  ): string {
    return rules
      .map((rule) => {
        const targetSelector = rule.globalSelector || rule.selector
        const extra = rule.extraCss || ""
        return `${targetSelector} { ${rule.property}: ${rule.value} !important; ${extra} }`
      })
      .join("\n")
  }

  private syncZenModeRootClass() {
    const rootClass = this.siteAdapter.getZenModeConfig()?.rootClass
    if (!rootClass) return

    const currentState = this.zenModeRootClassState
    if (
      !currentState ||
      currentState.selector !== rootClass.selector ||
      currentState.className !== rootClass.className
    ) {
      const element = document.querySelector(rootClass.selector)
      if (!(element instanceof HTMLElement)) return

      this.zenModeRootClassState = {
        selector: rootClass.selector,
        className: rootClass.className,
        removeOnDisable: !element.classList.contains(rootClass.className),
      }
    }

    document.querySelectorAll(rootClass.selector).forEach((element) => {
      if (element instanceof HTMLElement && !element.classList.contains(rootClass.className)) {
        element.classList.add(rootClass.className)
      }
    })
  }

  private cleanupZenModeRootClass() {
    if (!this.zenModeRootClassState?.removeOnDisable) {
      this.zenModeRootClassState = null
      return
    }

    const { selector, className } = this.zenModeRootClassState
    document.querySelectorAll(selector).forEach((element) => {
      if (element instanceof HTMLElement) {
        element.classList.remove(className)
      }
    })

    this.zenModeRootClassState = null
  }

  private mountZenModeExitButton() {
    if (!document.body) return

    if (this.zenModeExitHost?.isConnected) {
      return
    }

    const existingHost = document.getElementById(ZEN_MODE_EXIT_HOST_ID)
    if (existingHost instanceof HTMLElement) {
      existingHost.remove()
    }

    const host = document.createElement("div")
    host.id = ZEN_MODE_EXIT_HOST_ID
    // 使用 shadowRoot 内部样式控制，以便媒体查询可以完美覆盖
    host.style.cssText = ["position: fixed", "z-index: 2147483647", "pointer-events: auto"].join(
      ";",
    )

    const primary = this.siteAdapter.getThemeColors().primary || "#2563eb"
    const exitLabel = t("zenModeExitButton")
    const shadowRoot = host.attachShadow({ mode: "open" })
    shadowRoot.innerHTML = createSafeHTML(`
      <style>
        ${INTER_LOCAL_FONT_FACE}
        :host {
          all: initial;
          display: block; /* 必须是 block 或 flex，否则 transform 在 inline 元素上不生效 */
          position: fixed;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2147483647;
          pointer-events: auto;
          animation: ghSlideDown 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes ghSlideDown {
          0% {
            opacity: 0;
            transform: translateY(-24px) translateX(-50%) scale(0.92);
          }
          100% {
            opacity: 1;
            transform: translateY(0) translateX(-50%) scale(1);
          }
        }

        .zen-exit-btn {
          appearance: none;
          background: var(--gh-bg, rgba(255, 255, 255, 0.92));
          border: 1px solid var(--gh-border, rgba(128, 128, 128, 0.25));
          border-radius: 9999px;
          box-shadow:
            var(--gh-shadow-lg, 0 10px 40px rgba(0, 0, 0, 0.15)),
            0 0 0 1px rgba(255, 255, 255, 0.1) inset;
          color: var(--gh-text, #1f2937);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 12px;
          font-family: ${getPlatformFontFamily()};
          font-size: 14px;
          font-weight: 500;
          line-height: 1;
          padding: 10px 18px 10px 12px;
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .zen-exit-btn:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow:
            var(--gh-shadow-lg, 0 20px 60px rgba(0, 0, 0, 0.2)),
            0 0 0 1px var(--gh-primary, ${primary}) inset,
            0 0 20px rgba(255, 255, 255, 0.1) inset;
          background: var(--gh-bg, rgba(255, 255, 255, 0.97));
        }

        .zen-exit-btn:active {
          transform: translateY(1px) scale(0.98);
          transition-duration: 0.1s;
        }

        .zen-exit-btn:focus-visible {
          outline: 2px solid var(--gh-primary, ${primary});
          outline-offset: 4px;
        }

        .zen-exit-icon {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--gh-primary, ${primary});
          color: var(--gh-text-on-primary, #ffffff);
          flex-shrink: 0;
          transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .zen-exit-btn:hover .zen-exit-icon {
          transform: rotate(90deg) scale(1.1);
        }

        .zen-exit-text {
          white-space: nowrap;
          letter-spacing: 0.2px;
        }

        @media (max-width: 768px) {
          :host {
            top: auto !important;
            bottom: 32px;
            animation-name: ghSlideUp;
            /* 必须重置 transform，否则动画覆盖不完美 */
          }

          @keyframes ghSlideUp {
            0% {
              opacity: 0;
              transform: translateY(24px) translateX(-50%) scale(0.92);
            }
            100% {
              opacity: 1;
              transform: translateY(0) translateX(-50%) scale(1);
            }
          }
        }
      </style>
      <button class="zen-exit-btn" type="button" aria-label="${exitLabel}">
        <span class="zen-exit-icon" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </span>
        <span class="zen-exit-text">${exitLabel}</span>
      </button>
    `)

    const button = shadowRoot.querySelector(".zen-exit-btn") as HTMLButtonElement | null
    button?.addEventListener("click", this.handleZenModeExit)

    document.body.appendChild(host)
    this.zenModeExitHost = host
  }

  private unmountZenModeExitButton() {
    if (this.zenModeExitHost?.shadowRoot) {
      const button = this.zenModeExitHost.shadowRoot.querySelector(
        ".zen-exit-btn",
      ) as HTMLButtonElement | null
      button?.removeEventListener("click", this.handleZenModeExit)
    }

    this.zenModeExitHost?.remove()
    this.zenModeExitHost = null
  }

  private handleZenModeExit = () => {
    const siteId = this.siteAdapter.getSiteId()
    const nextZenMode = { ...this.zenModeConfig, enabled: false }
    this.updateZenMode(nextZenMode)
    useSettingsStore.getState().updateDeepSetting("layout", "zenMode", siteId, nextZenMode)
  }

  // ==================== 国际化支持 ====================

  refreshLocalizedTexts() {
    if (!this.zenModeEnabled || !this.zenModeExitHost?.shadowRoot) return

    const exitLabel = t("zenModeExitButton")
    const textSpan = this.zenModeExitHost.shadowRoot.querySelector(".zen-exit-text")
    const btn = this.zenModeExitHost.shadowRoot.querySelector(".zen-exit-btn")

    if (textSpan) {
      textSpan.textContent = exitLabel
    }
    if (btn) {
      btn.setAttribute("aria-label", exitLabel)
    }
  }

  // ==================== Shadow DOM 支持 ====================

  private refreshShadowInjection() {
    const hasAnyEnabled =
      this.pageWidthConfig?.enabled ||
      this.userQueryWidthConfig?.enabled ||
      this.panelAvoidanceStarted ||
      this.zenModeEnabled ||
      this.cleanModeEnabled

    if (!hasAnyEnabled) {
      this.stopShadowInjection()
      this.clearAllShadowStyles()
      return
    }

    this.startShadowInjection()
  }

  private startShadowInjection() {
    // 立即执行一次
    this.injectToAllShadows()

    // 定期检查新增的 Shadow DOM
    if (!this.shadowCheckInterval) {
      this.shadowCheckInterval = setInterval(() => this.injectToAllShadows(), 1000)
    }
  }

  private stopShadowInjection() {
    if (this.shadowCheckInterval) {
      clearInterval(this.shadowCheckInterval)
      this.shadowCheckInterval = null
    }
  }

  private injectToAllShadows() {
    if (!document.body) return

    if (this.zenModeEnabled) {
      this.syncZenModeRootClass()
    }

    const siteAdapter = this.siteAdapter

    DOMToolkit.walkShadowRoots((shadowRoot, host) => {
      if (host && !siteAdapter.shouldInjectIntoShadow(host)) return

      // 页面宽度
      if (this.pageWidthConfig?.enabled) {
        const width = `${this.pageWidthConfig.value}${this.pageWidthConfig.unit}`
        const selectors = this.getWidthSelectors()
        let css = this.buildCSSFromSelectors(selectors, width, false)
        if (this.pageWidthConfig.unit === "%") {
          const narrowCss = this.buildCSSFromSelectors(selectors, "95%", false)
          css = `${css}\n@media (max-width: ${NARROW_SCREEN_BREAKPOINT}px) {\n${narrowCss}\n}`
        }
        DOMToolkit.cssToShadow(shadowRoot, css, STYLE_IDS.PAGE_WIDTH_SHADOW)
      } else {
        this.removeStyleFromShadow(shadowRoot, STYLE_IDS.PAGE_WIDTH_SHADOW)
      }

      // 用户问题宽度
      if (this.userQueryWidthConfig?.enabled) {
        const value = this.userQueryWidthConfig.value || "81"
        const unit = this.userQueryWidthConfig.unit || "%"
        const css = this.buildCSSFromSelectors(
          this.getUserQueryWidthSelectors(),
          `${value}${unit}`,
          false,
        )
        DOMToolkit.cssToShadow(shadowRoot, css, STYLE_IDS.USER_QUERY_WIDTH_SHADOW)
      } else {
        this.removeStyleFromShadow(shadowRoot, STYLE_IDS.USER_QUERY_WIDTH_SHADOW)
      }

      // Zen Mode
      if (this.zenModeEnabled) {
        const css = this.generateZenModeCSS()
        if (css) {
          DOMToolkit.cssToShadow(shadowRoot, css, STYLE_IDS.ZEN_MODE_SHADOW)
        } else {
          this.removeStyleFromShadow(shadowRoot, STYLE_IDS.ZEN_MODE_SHADOW)
        }
      } else {
        this.removeStyleFromShadow(shadowRoot, STYLE_IDS.ZEN_MODE_SHADOW)
      }

      // Clean Mode
      if (this.cleanModeEnabled) {
        const css = this.generateCleanModeCSS()
        if (css) {
          DOMToolkit.cssToShadow(shadowRoot, css, STYLE_IDS.CLEAN_MODE_SHADOW)
        } else {
          this.removeStyleFromShadow(shadowRoot, STYLE_IDS.CLEAN_MODE_SHADOW)
        }
      } else {
        this.removeStyleFromShadow(shadowRoot, STYLE_IDS.CLEAN_MODE_SHADOW)
      }

      // Panel Avoidance
      if (this.panelAvoidanceShadowCss) {
        DOMToolkit.cssToShadow(
          shadowRoot,
          this.panelAvoidanceShadowCss,
          STYLE_IDS.PANEL_AVOIDANCE_SHADOW,
        )
      } else {
        this.removeStyleFromShadow(shadowRoot, STYLE_IDS.PANEL_AVOIDANCE_SHADOW)
      }

      this.processedShadowRoots.add(shadowRoot)
    })
  }

  private syncPanelAvoidanceShadowStyles() {
    if (!document.body) return

    const siteAdapter = this.siteAdapter
    DOMToolkit.walkShadowRoots((shadowRoot, host) => {
      if (host && !siteAdapter.shouldInjectIntoShadow(host)) return

      if (this.panelAvoidanceShadowCss) {
        DOMToolkit.cssToShadow(
          shadowRoot,
          this.panelAvoidanceShadowCss,
          STYLE_IDS.PANEL_AVOIDANCE_SHADOW,
        )
      } else {
        this.removeStyleFromShadow(shadowRoot, STYLE_IDS.PANEL_AVOIDANCE_SHADOW)
      }
    })
  }

  private removeStyleFromShadow(shadowRoot: ShadowRoot, id: string) {
    const style = shadowRoot.getElementById(id)
    if (style) style.remove()
  }

  private clearAllShadowStyles() {
    if (!document.body) return

    DOMToolkit.walkShadowRoots((shadowRoot) => {
      this.removeStyleFromShadow(shadowRoot, STYLE_IDS.PAGE_WIDTH_SHADOW)
      this.removeStyleFromShadow(shadowRoot, STYLE_IDS.USER_QUERY_WIDTH_SHADOW)
      this.removeStyleFromShadow(shadowRoot, STYLE_IDS.PANEL_AVOIDANCE_SHADOW)
      this.removeStyleFromShadow(shadowRoot, STYLE_IDS.ZEN_MODE_SHADOW)
      this.removeStyleFromShadow(shadowRoot, STYLE_IDS.CLEAN_MODE_SHADOW)
      this.processedShadowRoots.delete(shadowRoot)
    })
  }
}
