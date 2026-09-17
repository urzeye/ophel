import type {
  AutoHideInputConfig,
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
  AUTO_HIDE_INPUT: "gh-auto-hide-input-styles",
} as const

const ZEN_MODE_EXIT_HOST_ID = "gh-zen-mode-exit-host"

// ==================== Auto Hide Input 常量 ====================
const AUTO_HIDE_FLOAT_CLASS = "gh-ahi-float"
const AUTO_HIDE_HIDDEN_CLASS = "gh-ahi-hidden"
/** 测量/重同步期间挂在 <html> 上关闭过渡，避免摘挂浮层类重置 transition 重播动画 */
const AUTO_HIDE_NO_ANIM_CLASS = "gh-ahi-no-anim"
/**
 * Ophel 自身 UI 的宿主节点（Shadow host 与挂在 body 的扩展元素）。
 * focusin/focusout/input/pointermove 都是 composed 事件，会穿透 Shadow DOM 到达
 * document；面板/设置模态框内的交互不能被误当成页面交互来驱动输入框显隐
 */
const OPHEL_UI_HOST_SELECTOR =
  "plasmo-csui, #ophel-userscript-root, #ophel-binding-issue-notice, #ophel-extension-update-fallback, #gh-zen-mode-exit-host"
/** 指针距视口底部 <= 该值时显示输入框（站点可用 config.revealDistancePx 覆盖） */
const DEFAULT_AUTO_HIDE_REVEAL_DISTANCE_PX = 210
/** 指针距视口底部 >= 该值时隐藏输入框；与显示阈值形成迟滞区间避免抖动 */
const DEFAULT_AUTO_HIDE_HIDE_DISTANCE_PX = DEFAULT_AUTO_HIDE_REVEAL_DISTANCE_PX + 180
/** 隐藏态在容器自身高度之外额外下移的偏移，保证完全移出视口 */
const DEFAULT_AUTO_HIDE_HIDDEN_OFFSET_PX = 28
const DEFAULT_AUTO_HIDE_Z_INDEX = 30
const AUTO_HIDE_POINTER_THROTTLE_MS = 50
const AUTO_HIDE_SCROLL_THROTTLE_MS = 100
const AUTO_HIDE_RESYNC_DEBOUNCE_MS = 120
/** 隐藏必须稳定持续该时长才生效；窗口内的相反结论会取消隐藏，避免事件扇出造成闪现 */
const AUTO_HIDE_HIDE_DELAY_MS = 200
/** 显示过渡（0.3s）结束后落回文档流的等待时长 */
const AUTO_HIDE_SETTLE_DELAY_MS = 350
/** 聚焦唤出必须紧跟的真实页面手势（pointerdown/keydown）时间窗 */
const AUTO_HIDE_FOCUS_GESTURE_WINDOW_MS = 500
const AUTO_HIDE_DEFAULT_SPACER_HEIGHT = 33
const AUTO_HIDE_CSS_VARS = [
  "--gh-ahi-top",
  "--gh-ahi-left",
  "--gh-ahi-width",
  "--gh-ahi-footer",
  "--gh-ahi-bg",
] as const
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

  private autoHideInputStyle: HTMLStyleElement | null = null
  private autoHideInputEnabled = false
  private autoHideInputConfig: AutoHideInputConfig | null = null
  private autoHideInputContainer: HTMLElement | null = null
  private autoHideInputHidden: boolean | null = null
  private autoHideInputLastPointer: PointerEvent | null = null
  private autoHideInputListenersBound = false
  private autoHideInputResizeObserver: ResizeObserver | null = null
  private autoHideInputObservedTarget: HTMLElement | null = null
  private autoHideInputMutationObserver: MutationObserver | null = null
  private autoHideInputCoarsePointer: MediaQueryList | null = null
  private autoHideInputPointerTimer: ReturnType<typeof setTimeout> | null = null
  private autoHideInputScrollTimer: ReturnType<typeof setTimeout> | null = null
  private autoHideInputResyncTimer: ReturnType<typeof setTimeout> | null = null
  private autoHideInputHideTimer: ReturnType<typeof setTimeout> | null = null
  private autoHideInputSettleTimer: ReturnType<typeof setTimeout> | null = null
  /** 聚焦唤出门闩：只有紧跟真实页面手势的聚焦才允许唤出，窗口重获焦点等程序化聚焦不唤出 */
  private autoHideInputFocusReveal = false
  private autoHideInputLastPageGestureAt = 0
  /** 指针当前是否悬停在 Ophel 自身 UI 上；悬停期间显隐冻结 */
  private autoHideInputPointerInOphelUi = false

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
  private panelAvoidanceScopeCache = new Map<string, HTMLElement | null>()
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
    // 站点包热更新后避让规则可能变化，重新读取；内置站点配置为静态，重读等价。
    this.panelAvoidanceConfig = this.getPanelAvoidanceConfig()
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
      this.panelAvoidanceHostObserver = new MutationObserver(this.handlePanelAvoidanceHostMutations)
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

  /**
   * 完全停止并释放布局副作用（适配器切换 / 站点离开时使用）。
   *
   * 与 update 系列方法的区别：不仅移除配置层（样式、避让监听、Zen/Clean 模式），
   * 还要求实例此后不可复用——modules registry 会丢弃引用并重建。
   */
  stop(): void {
    this.stopPanelAvoidance()

    this.removeStyle(this.pageWidthStyle)
    this.pageWidthStyle = null
    this.removeStyle(this.userQueryWidthStyle)
    this.userQueryWidthStyle = null
    this.removeStyle(this.zenModeStyle)
    this.zenModeStyle = null
    this.removeStyle(this.cleanModeStyle)
    this.cleanModeStyle = null

    // Zen 模式的根类只移除由本实例添加的那些，避免误删站点自带类名
    this.cleanupZenModeRootClass()
    this.unmountZenModeExitButton()
    this.zenModeEnabled = false
    this.cleanModeEnabled = false
    this.autoHideInputEnabled = false
    this.removeStyle(this.autoHideInputStyle)
    this.autoHideInputStyle = null
    this.teardownAutoHideInput()

    if (this.shadowCheckInterval) {
      clearInterval(this.shadowCheckInterval)
      this.shadowCheckInterval = null
    }
    this.panelAvoidanceShadowCss = ""

    // 已注入各 shadow root 的样式不会随 interval 停止而消失，必须显式移除；
    // 同时释放 processedShadowRoots 持有的 ShadowRoot 引用
    this.clearAllShadowStyles()
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

  // ==================== Auto Hide Input ====================
  //
  // 机制：可见时输入容器保持纯自然文档流（零干预，页面布局变化、Angular 重渲染、
  // 流式输出都不可能让它闪）；决定隐藏时才测量自然位置、改为 position: fixed 浮层
  // 并下移出场（原位置让给聊天内容，滚动末尾用 scrollContainer::after 伪元素占位，
  // 不往站点滚动容器注入真实 DOM 节点，对虚拟滚动列表安全）；
  // 隐藏态不可见，期间可自由重测量重同步；显示时先重测量再滑回，过渡结束后落回
  // 文档流（浮层位置 = 自然位置，零跳动）。
  // 显示触发：指针接近视口底部 / 手势聚焦（点击输入框、Alt+I 等真实页面手势后
  // 的 focusin 才唤出；窗口重获焦点、站点程序化 focus 不落闩）/ 输入框已有草稿。
  // 显隐稳定性（一次动作会扇出成一串时序不同的事件求值，逐个立即翻转就是"闪现"）：
  // 1. 冻结：指针/焦点在 Ophel 自身 UI 内、或窗口失焦时保持现状，不做任何翻转；
  // 2. 门闩跨窗口失焦与 Ophel UI 焦点保留，回来/关闭弹窗后恢复原状；
  // 3. 显示立即生效，隐藏必须稳定持续 AUTO_HIDE_HIDE_DELAY_MS 才落地。

  updateAutoHideInput(enabled: boolean) {
    // 设置订阅在任意设置变更时都会回调；同值重入会触发"删样式→重注入→重测量"，
    // 造成可见闪烁与多余 reflow，必须幂等
    if (enabled === this.autoHideInputEnabled) return
    this.autoHideInputEnabled = enabled
    this.applyAutoHideInput()
  }

  applyAutoHideInput() {
    this.removeStyle(this.autoHideInputStyle)
    this.autoHideInputStyle = null

    if (!this.autoHideInputEnabled) {
      this.teardownAutoHideInput()
      return
    }

    const config = this.siteAdapter.getAutoHideInputConfig()
    if (!config) {
      this.teardownAutoHideInput()
      return
    }

    this.autoHideInputConfig = config
    this.autoHideInputStyle = this.injectStyle(
      STYLE_IDS.AUTO_HIDE_INPUT,
      this.generateAutoHideInputCSS(config),
    )
    this.bindAutoHideListeners()
    this.startAutoHideMutationObserver()
    // 初始为可见的自然文档流；只记录容器引用，是否隐藏由决策入口判定
    this.autoHideInputContainer = document.querySelector(config.container) as HTMLElement | null
    this.updateAutoHideVisibility()
  }

  private generateAutoHideInputCSS(config: AutoHideInputConfig): string {
    const container = config.container
    const hiddenOffset = config.hiddenOffsetPx ?? DEFAULT_AUTO_HIDE_HIDDEN_OFFSET_PX
    const zIndex = config.zIndex ?? DEFAULT_AUTO_HIDE_Z_INDEX
    const floatCss = `
html.${AUTO_HIDE_FLOAT_CLASS} ${container} {
  position: fixed !important;
  top: var(--gh-ahi-top) !important;
  left: var(--gh-ahi-left) !important;
  width: var(--gh-ahi-width) !important;
  max-width: var(--gh-ahi-width) !important;
  padding-bottom: var(--gh-ahi-footer, 0px) !important;
  margin: 0 !important;
  box-sizing: border-box;
  overflow: visible !important;
  z-index: ${zIndex} !important;
  background: var(--gh-ahi-bg, transparent) !important;
  transform: translateY(0);
  opacity: 1;
  transition:
    transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform, opacity;
}
html.${AUTO_HIDE_FLOAT_CLASS}.${AUTO_HIDE_HIDDEN_CLASS} ${container} {
  transform: translateY(calc(100% + ${hiddenOffset}px)) !important;
  opacity: 0.01 !important;
  pointer-events: none !important;
}
html.${AUTO_HIDE_FLOAT_CLASS}.${AUTO_HIDE_NO_ANIM_CLASS} ${container} {
  transition: none !important;
}
`.trim()

    // 滚动末尾占位用 ::after 伪元素而非真实 DOM 节点：伪元素不进站点的
    // children / reconcile 范围、不触发 MutationObserver，对虚拟滚动列表安全。
    // 挂浮层类下，只在浮层化期间占位；未配置滚动容器选择器的站点不占位
    const spacerCss = config.scrollContainer
      ? `
html.${AUTO_HIDE_FLOAT_CLASS} ${config.scrollContainer}::after {
  content: "";
  display: block;
  flex-shrink: 0;
  width: 100%;
  height: ${config.spacerHeight ?? AUTO_HIDE_DEFAULT_SPACER_HEIGHT}px;
  pointer-events: none;
}`.trim()
      : ""

    return [floatCss, spacerCss, this.buildZenModeStyleCSS(config.styles || [])]
      .filter(Boolean)
      .join("\n")
  }

  /**
   * 测量容器自然位置并浮层化；容器不存在或不可见时解除浮层。
   * 仅在隐藏/即将隐藏/即将显示时调用——这些时刻容器要么不可见、要么将在
   * 同一任务内进入过渡，摘/挂浮层类不会上屏；可见态绝不调用本方法。
   */
  private syncAutoHideLayout() {
    const config = this.autoHideInputConfig
    const container = config
      ? (document.querySelector(config.container) as HTMLElement | null)
      : null
    const root = document.documentElement
    // 全程关闭过渡：摘/挂浮层类会重置 transform/opacity 的 transition，
    // 不关闭时每次重测量都把隐藏动画从头重播一遍（表现为输入框反复闪现）
    root.classList.add(AUTO_HIDE_NO_ANIM_CLASS)
    try {
      if (!config || !container) {
        this.unfloatAutoHideInput()
        return
      }

      // 浮层状态下读到的是浮层几何，必须先摘掉浮层类再强制 reflow 读自然位置
      if (root.classList.contains(AUTO_HIDE_FLOAT_CLASS)) {
        root.classList.remove(AUTO_HIDE_FLOAT_CLASS)
        void container.offsetHeight
      }

      const rect = container.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        this.unfloatAutoHideInput()
        return
      }

      const footerPad = Math.max(0, Math.ceil(window.innerHeight - rect.bottom))
      root.style.setProperty("--gh-ahi-top", `${rect.top}px`)
      root.style.setProperty("--gh-ahi-left", `${rect.left}px`)
      root.style.setProperty("--gh-ahi-width", `${rect.width}px`)
      root.style.setProperty("--gh-ahi-footer", `${footerPad}px`)
      root.style.setProperty("--gh-ahi-bg", this.resolveAutoHideBackground(container))
      root.classList.add(AUTO_HIDE_FLOAT_CLASS)

      // 在 no-anim 仍挂时强制 reflow 提交最终计算样式；否则中途那次 reflow 提交的
      // "无浮层"中间态会成为 transition 起点，finally 摘掉 no-anim 后隐藏动画从头重播
      void container.offsetHeight

      this.autoHideInputContainer = container
      this.observeAutoHideContainer(container)
    } finally {
      root.classList.remove(AUTO_HIDE_NO_ANIM_CLASS)
    }
  }

  /** 浮层容器覆盖底部区域时需要实底背景；沿祖先链取第一个非透明背景色。 */
  private resolveAutoHideBackground(container: HTMLElement): string {
    let current: HTMLElement | null = container
    while (current) {
      const bg = getComputedStyle(current).backgroundColor
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return bg
      current = current.parentElement
    }
    return getComputedStyle(document.body).backgroundColor || "transparent"
  }

  private unfloatAutoHideInput() {
    const root = document.documentElement
    root.classList.remove(AUTO_HIDE_FLOAT_CLASS)
    root.classList.remove(AUTO_HIDE_HIDDEN_CLASS)
    this.autoHideInputHidden = null
    this.autoHideInputContainer = null
    this.cancelAutoHideHideTimer()
    this.cancelAutoHideSettleTimer()
    this.autoHideInputResizeObserver?.disconnect()
    this.autoHideInputObservedTarget = null
  }

  private observeAutoHideContainer(container: HTMLElement) {
    // 同一容器保持单次观察。重复 observe 会重置 ResizeObserver 的上报基线，
    // 使其对每个"新"观察目标必投一次初始通知；而 syncAutoHideLayout 每次都会
    // 调用本方法，于是形成 测量→重挂→初始通知→防抖重测量 的自激回路（约 8Hz），
    // 表现为输入框位置快速跳变
    if (this.autoHideInputObservedTarget === container) return
    if (!this.autoHideInputResizeObserver) {
      this.autoHideInputResizeObserver = new ResizeObserver(() => {
        this.scheduleAutoHideResync()
      })
    }
    this.autoHideInputResizeObserver.disconnect()
    this.autoHideInputResizeObserver.observe(container)
    this.autoHideInputObservedTarget = container
  }

  private startAutoHideMutationObserver() {
    if (this.autoHideInputMutationObserver || !document.body) return

    // 发送消息 / 路由切换会重建输入区域 DOM；重测量统一走防抖。
    // 性能：回调在每次 childList 变异批次都触发（流式输出期间很频繁），
    // 只在容器断连或容器相关子树结构变化时才做 :has() 重校验
    this.autoHideInputMutationObserver = new MutationObserver((mutations) => {
      const config = this.autoHideInputConfig
      if (!config) return
      const container = this.autoHideInputContainer
      if (!container || !container.isConnected) {
        // 容器不存在（如零态页面）：只在有新节点加入时才尝试重新解析
        if (mutations.some((mutation) => mutation.addedNodes.length > 0)) {
          this.scheduleAutoHideResync()
        }
        return
      }
      const touchesContainer = mutations.some((mutation) => {
        const target = mutation.target
        return (
          target === container ||
          container.contains(target) ||
          (target instanceof Element && target.contains(container))
        )
      })
      if (touchesContainer && !container.matches(config.container)) {
        this.scheduleAutoHideResync()
      }
    })
    // 只观察 childList、不观察 attributes：依赖 :has() 的零态排除（如 is-zero-state）
    // 要求站点的页面切换是 DOM 重建式；原地切 class 的站点不适用，见
    // docs/developer/input-auto-hide-plan.md §4 约束清单
    this.autoHideInputMutationObserver.observe(document.body, { childList: true, subtree: true })
  }

  private scheduleAutoHideResync = () => {
    if (!this.autoHideInputEnabled) return
    if (this.autoHideInputResyncTimer) {
      clearTimeout(this.autoHideInputResyncTimer)
    }
    this.autoHideInputResyncTimer = setTimeout(() => {
      this.autoHideInputResyncTimer = null
      if (!this.autoHideInputEnabled) return
      if (this.autoHideInputHidden === true) {
        // 隐藏态不可见：自由重测量重同步，不会上屏
        this.syncAutoHideLayout()
      } else {
        // 可见态是纯自然布局：只刷新容器引用（SPA 重建 DOM），不做任何测量
        const config = this.autoHideInputConfig
        const container = config
          ? (document.querySelector(config.container) as HTMLElement | null)
          : null
        if (container) this.autoHideInputContainer = container
      }
      this.updateAutoHideVisibility()
    }, AUTO_HIDE_RESYNC_DEBOUNCE_MS)
  }

  private isAutoHideInputFocused(): boolean {
    return !!(
      this.autoHideInputContainer &&
      document.activeElement &&
      this.autoHideInputContainer.contains(document.activeElement)
    )
  }

  /**
   * 聚焦唤出需要门闩：DOM 焦点可能被站点脚本程序化移动（窗口重获焦点、
   * blur 后自动重聚焦等），不代表输入意图；只有真实页面手势后的聚焦才算
   */
  private isAutoHideInputFocusRevealed(): boolean {
    return this.autoHideInputFocusReveal && this.isAutoHideInputFocused()
  }

  private autoHideInputHasDraft(): boolean {
    return this.siteAdapter.hasInputDraft()
  }

  /**
   * 显隐决策的唯一入口。一次用户动作（切窗口、开弹窗、填变量）会扇出成一串
   * 时序不同的求值（focusin 同步、focusout 延迟一拍、pointermove 节流等），
   * 逐个立即翻转 = 输入框极速闪现。因此：冻结场景不翻转；显示立即生效；
   * 隐藏只在条件稳定持续 AUTO_HIDE_HIDE_DELAY_MS 后才落地。
   */
  private updateAutoHideVisibility = (event?: PointerEvent) => {
    if (!this.autoHideInputEnabled) return

    // 页面草稿是明确的输入意图（插入提示词、站点预填、正在打字）：
    // 压倒指针/焦点冻结立即唤出，否则插入后要等用户动一下鼠标才解冻
    if (this.autoHideInputHasDraft()) {
      this.autoHideInputPointerInOphelUi = false
      this.cancelAutoHideHideTimer()
      this.setAutoHideHidden(false)
      return
    }

    if (this.isAutoHideInteractionFrozen()) {
      this.cancelAutoHideHideTimer()
      return
    }

    if (this.shouldRevealAutoHideInput(event)) {
      this.cancelAutoHideHideTimer()
      this.setAutoHideHidden(false)
      return
    }

    if (this.shouldHideAutoHideInput(event)) {
      this.scheduleAutoHideHide()
      return
    }

    // 迟滞区间：保持现状
    this.cancelAutoHideHideTimer()
  }

  /** 冻结判定：指针/焦点在 Ophel 自身 UI 内、或窗口失焦时，任何翻转都是误动 */
  private isAutoHideInteractionFrozen(): boolean {
    return this.autoHideInputPointerInOphelUi || this.isOphelUiActive() || this.isWindowUnfocused()
  }

  private isWindowUnfocused(): boolean {
    return typeof document.hasFocus === "function" && !document.hasFocus()
  }

  /** 显示条件：触屏 / 手势聚焦门闩 / 草稿 / 指针接近视口底部 */
  private shouldRevealAutoHideInput(event?: PointerEvent): boolean {
    if (
      this.isAutoHideCoarsePointer() ||
      this.isAutoHideInputFocusRevealed() ||
      this.autoHideInputHasDraft()
    ) {
      return true
    }
    const pointer = event ?? this.autoHideInputLastPointer
    if (!pointer) return false
    const revealDistance =
      this.autoHideInputConfig?.revealDistancePx ?? DEFAULT_AUTO_HIDE_REVEAL_DISTANCE_PX
    return window.innerHeight - pointer.clientY <= revealDistance
  }

  /** 隐藏条件：无指针记录，或指针已远离视口底部（越过迟滞带） */
  private shouldHideAutoHideInput(event?: PointerEvent): boolean {
    const pointer = event ?? this.autoHideInputLastPointer
    if (!pointer) return true
    const revealDistance =
      this.autoHideInputConfig?.revealDistancePx ?? DEFAULT_AUTO_HIDE_REVEAL_DISTANCE_PX
    // 迟滞带是防抖动的硬前提：显式配置小于等于显示阈值时强制收敛到 reveal+1，
    // 不能让站点配错把迟滞消掉
    const hideDistance = Math.max(
      this.autoHideInputConfig?.hideDistancePx ?? DEFAULT_AUTO_HIDE_HIDE_DISTANCE_PX,
      revealDistance + 1,
    )
    return window.innerHeight - pointer.clientY >= hideDistance
  }

  private scheduleAutoHideHide() {
    if (this.autoHideInputHideTimer) return
    this.autoHideInputHideTimer = setTimeout(() => {
      this.autoHideInputHideTimer = null
      // 到点重新求值：条件仍成立才隐藏；期间被冻结或反转则放弃
      if (!this.autoHideInputEnabled) return
      if (this.isAutoHideInteractionFrozen()) return
      if (this.shouldRevealAutoHideInput()) return
      this.setAutoHideHidden(true)
    }, AUTO_HIDE_HIDE_DELAY_MS)
  }

  private cancelAutoHideHideTimer() {
    if (!this.autoHideInputHideTimer) return
    clearTimeout(this.autoHideInputHideTimer)
    this.autoHideInputHideTimer = null
  }

  /** 事件是否源自 Ophel 自身 UI；target 在 shadow 边界处已被重定向为宿主元素 */
  private isOphelUiEvent(event: Event): boolean {
    const target = event.target as Element | null
    if (!target || typeof target.closest !== "function") return false
    return target.closest(OPHEL_UI_HOST_SELECTOR) !== null
  }

  /** 焦点是否落在 Ophel 自身 UI 内（shadow 内聚焦时 activeElement 重定向为宿主） */
  private isOphelUiActive(): boolean {
    const active = document.activeElement
    return !!active && active.matches(OPHEL_UI_HOST_SELECTOR)
  }

  /** matchMedia 每次调用都会新建 MediaQueryList，显隐判定在指针/滚动热路径上，必须缓存 */
  private isAutoHideCoarsePointer(): boolean {
    if (!this.autoHideInputCoarsePointer) {
      this.autoHideInputCoarsePointer = window.matchMedia("(pointer: coarse)")
    }
    return this.autoHideInputCoarsePointer.matches
  }

  /**
   * 显隐状态机的唯一出口。
   * 隐藏：先测量+浮层化（同一任务内完成，浮层位置=自然位置，不上屏），再挂
   *   隐藏类，transform 过渡把容器滑出视口。
   * 显示：先重测量（隐藏期间布局可能已变；此时容器不可见，测量不上屏），摘掉
   *   隐藏类滑回浮层位置，过渡结束后落回自然文档流——可见态不受浮层机制影响。
   */
  private setAutoHideHidden(hidden: boolean) {
    const currentlyHidden = this.autoHideInputHidden === true
    if (hidden === currentlyHidden) {
      this.autoHideInputHidden = hidden
      return
    }
    this.autoHideInputHidden = hidden
    if (hidden) {
      this.cancelAutoHideSettleTimer()
      this.syncAutoHideLayout()
      // 容器不存在/不可见（如零态页面）时浮层化失败：保持自然可见，不挂隐藏类
      if (document.documentElement.classList.contains(AUTO_HIDE_FLOAT_CLASS)) {
        document.documentElement.classList.add(AUTO_HIDE_HIDDEN_CLASS)
      } else {
        this.autoHideInputHidden = false
      }
      return
    }
    this.syncAutoHideLayout()
    if (document.documentElement.classList.contains(AUTO_HIDE_FLOAT_CLASS)) {
      document.documentElement.classList.remove(AUTO_HIDE_HIDDEN_CLASS)
      this.scheduleAutoHideSettle()
    } else {
      this.autoHideInputHidden = false
    }
  }

  /** 显示过渡结束后摘掉浮层类，容器落回自然文档流（可见态零干预） */
  private scheduleAutoHideSettle() {
    this.cancelAutoHideSettleTimer()
    this.autoHideInputSettleTimer = setTimeout(() => {
      this.autoHideInputSettleTimer = null
      if (this.autoHideInputHidden !== false) return
      if (!this.autoHideInputEnabled) return
      document.documentElement.classList.remove(AUTO_HIDE_FLOAT_CLASS)
    }, AUTO_HIDE_SETTLE_DELAY_MS)
  }

  private cancelAutoHideSettleTimer() {
    if (!this.autoHideInputSettleTimer) return
    clearTimeout(this.autoHideInputSettleTimer)
    this.autoHideInputSettleTimer = null
  }

  private handleAutoHidePointerMove = (event: PointerEvent) => {
    // 指针移出窗口后不再触发 pointermove，lastPointer 停留在移出前位置：
    // 停在底部显示区时输入框保持可见，这是有意的 fail-visible 方向
    // 指针进入 Ophel UI 时冻结显隐：保持现状而不是按"离开页面"隐藏，
    // 否则弹窗边缘的鼠标移动会让输入框在隐藏/显示间来回切换
    const inOphelUi = this.isOphelUiEvent(event)
    this.autoHideInputPointerInOphelUi = inOphelUi
    this.autoHideInputLastPointer = inOphelUi ? null : event
    if (this.autoHideInputPointerTimer) return
    this.autoHideInputPointerTimer = setTimeout(() => {
      this.autoHideInputPointerTimer = null
      this.updateAutoHideVisibility(this.autoHideInputLastPointer ?? undefined)
    }, AUTO_HIDE_POINTER_THROTTLE_MS)
  }

  private handleAutoHideScroll = () => {
    if (this.autoHideInputScrollTimer) return
    this.autoHideInputScrollTimer = setTimeout(() => {
      this.autoHideInputScrollTimer = null
      this.updateAutoHideVisibility()
    }, AUTO_HIDE_SCROLL_THROTTLE_MS)
  }

  private handleAutoHideFocusIn = (event: FocusEvent) => {
    // 焦点进入 Ophel UI 不是页面输入意图：冻结显隐（取消待隐藏），不做任何翻转
    if (this.isOphelUiEvent(event)) {
      this.cancelAutoHideHideTimer()
      return
    }
    // 窗口失焦期间的程序化焦点抖动（如站点自动重聚焦）冻结处理
    if (this.isWindowUnfocused()) return
    // 只有紧跟真实页面手势（点击/按键）的聚焦才允许唤出；窗口重获焦点、
    // 站点脚本程序化 focus（如 Gemini 失焦后自动重聚焦）不落闩
    const target = event.target as Element | null
    const intoContainer = !!(
      target &&
      this.autoHideInputContainer &&
      this.autoHideInputContainer.contains(target)
    )
    if (
      intoContainer &&
      Date.now() - this.autoHideInputLastPageGestureAt <= AUTO_HIDE_FOCUS_GESTURE_WINDOW_MS
    ) {
      this.autoHideInputFocusReveal = true
    }
    this.updateAutoHideVisibility()
  }

  private handleAutoHideFocusOut = (event: FocusEvent) => {
    // Ophel UI 内部的焦点转移不影响页面输入框显隐
    if (this.isOphelUiEvent(event)) return
    const target = event.target as Element | null
    // focusout 时 activeElement 尚未切换，延迟到下一拍再判定
    setTimeout(() => {
      // 窗口失焦（切标签页/切窗口）：保留门闩与现状，切回后恢复原显隐
      if (this.isWindowUnfocused()) return
      // 焦点落入 Ophel UI（设置弹窗、变量对话框等）：保留门闩并冻结，
      // 关闭后编辑器重聚焦时恢复原状，全程零翻转
      if (this.isOphelUiActive()) {
        this.cancelAutoHideHideTimer()
        return
      }
      // 焦点落到页面其他元素：聚焦唤出资格失效，按指针/草稿重估
      if (target && this.autoHideInputContainer?.contains(target)) {
        this.autoHideInputFocusReveal = false
      }
      this.updateAutoHideVisibility()
    }, 0)
  }

  /** 记录真实页面手势并刷新指针位置；点击容器时直接落闩（编辑器已聚焦时不再触发 focusin） */
  private handleAutoHidePointerDown = (event: PointerEvent) => {
    if (this.isOphelUiEvent(event)) {
      this.autoHideInputPointerInOphelUi = true
      this.autoHideInputLastPointer = null
      this.cancelAutoHideHideTimer()
      return
    }
    this.autoHideInputPointerInOphelUi = false
    this.autoHideInputLastPointer = event
    this.autoHideInputLastPageGestureAt = Date.now()
    const target = event.target as Element | null
    if (target && this.autoHideInputContainer?.contains(target)) {
      this.autoHideInputFocusReveal = true
    }
    this.updateAutoHideVisibility(event)
  }

  private handleAutoHideKeyDown = (event: KeyboardEvent) => {
    if (this.isOphelUiEvent(event)) return
    this.autoHideInputLastPageGestureAt = Date.now()
    // 编辑器内的真实键盘输入本身就是输入意图：直接落闩并解除指针冻结
    //（覆盖面板关闭后鼠标未移动、指针冻结残留的键盘输入场景）
    const target = event.target as Element | null
    if (target && this.autoHideInputContainer?.contains(target)) {
      this.autoHideInputFocusReveal = true
      this.autoHideInputPointerInOphelUi = false
      this.updateAutoHideVisibility()
    }
  }

  private handleAutoHideWindowBlur = () => {
    // 窗口失焦期间冻结显隐：不清门闩、不重估，切回后恢复原状而非闪一轮
    this.cancelAutoHideHideTimer()
  }

  private handleAutoHideInputEvent = (event: Event) => {
    // 只响应页面编辑器的输入；Ophel 面板内的输入不改变草稿状态
    if (this.isOphelUiEvent(event)) return
    this.updateAutoHideVisibility()
  }

  private handleAutoHideWindowResize = () => {
    this.scheduleAutoHideResync()
  }

  private bindAutoHideListeners() {
    if (this.autoHideInputListenersBound) return
    document.addEventListener("pointermove", this.handleAutoHidePointerMove, { passive: true })
    document.addEventListener("pointerdown", this.handleAutoHidePointerDown, true)
    document.addEventListener("keydown", this.handleAutoHideKeyDown, true)
    document.addEventListener("scroll", this.handleAutoHideScroll, { passive: true, capture: true })
    document.addEventListener("focusin", this.handleAutoHideFocusIn, true)
    document.addEventListener("focusout", this.handleAutoHideFocusOut, true)
    document.addEventListener("input", this.handleAutoHideInputEvent, true)
    window.addEventListener("resize", this.handleAutoHideWindowResize, { passive: true })
    window.addEventListener("blur", this.handleAutoHideWindowBlur)
    this.autoHideInputListenersBound = true
  }

  private unbindAutoHideListeners() {
    if (!this.autoHideInputListenersBound) return
    document.removeEventListener("pointermove", this.handleAutoHidePointerMove)
    document.removeEventListener("pointerdown", this.handleAutoHidePointerDown, true)
    document.removeEventListener("keydown", this.handleAutoHideKeyDown, true)
    document.removeEventListener("scroll", this.handleAutoHideScroll, true)
    document.removeEventListener("focusin", this.handleAutoHideFocusIn, true)
    document.removeEventListener("focusout", this.handleAutoHideFocusOut, true)
    document.removeEventListener("input", this.handleAutoHideInputEvent, true)
    window.removeEventListener("resize", this.handleAutoHideWindowResize)
    window.removeEventListener("blur", this.handleAutoHideWindowBlur)
    this.autoHideInputListenersBound = false
    if (this.autoHideInputPointerTimer) {
      clearTimeout(this.autoHideInputPointerTimer)
      this.autoHideInputPointerTimer = null
    }
    if (this.autoHideInputScrollTimer) {
      clearTimeout(this.autoHideInputScrollTimer)
      this.autoHideInputScrollTimer = null
    }
  }

  private teardownAutoHideInput() {
    this.unbindAutoHideListeners()
    this.autoHideInputMutationObserver?.disconnect()
    this.autoHideInputMutationObserver = null
    if (this.autoHideInputResyncTimer) {
      clearTimeout(this.autoHideInputResyncTimer)
      this.autoHideInputResyncTimer = null
    }
    this.unfloatAutoHideInput()
    this.autoHideInputResizeObserver = null
    for (const name of AUTO_HIDE_CSS_VARS) {
      document.documentElement.style.removeProperty(name)
    }
    this.autoHideInputConfig = null
    this.autoHideInputLastPointer = null
    this.autoHideInputFocusReveal = false
    this.autoHideInputLastPageGestureAt = 0
    this.autoHideInputPointerInOphelUi = false
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
    const allPreserveFlow = [
      ...(zenConfig?.preserveFlow || []),
      ...(cleanConfig?.preserveFlow || []),
    ]
    const allStyles = [...(zenConfig?.styles || []), ...(cleanConfig?.styles || [])]

    const hideCss = allHide
      .map((selector) => `${selector} { display: none !important; }`)
      .join("\n")
    const preserveFlowCss = allPreserveFlow
      .map(
        (selector) =>
          `${selector} { visibility: hidden !important; pointer-events: none !important; user-select: none !important; }`,
      )
      .join("\n")
    const styleCss = this.buildZenModeStyleCSS(allStyles)

    return [hideCss, preserveFlowCss, styleCss].filter(Boolean).join("\n")
  }

  private generateCleanModeCSS(): string {
    const config = this.siteAdapter.getCleanModeConfig()
    if (!config) return ""

    const hideCss = (config.hide || [])
      .map((selector) => `${selector} { display: none !important; }`)
      .join("\n")
    const preserveFlowCss = (config.preserveFlow || [])
      .map(
        (selector) =>
          `${selector} { visibility: hidden !important; pointer-events: none !important; user-select: none !important; }`,
      )
      .join("\n")
    const styleCss = this.buildZenModeStyleCSS(config.styles || [])

    return [hideCss, preserveFlowCss, styleCss].filter(Boolean).join("\n")
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

    return this.getPanelReservation(
      panel,
      this.getPanelAvoidanceScopeRect(scope),
      config.obstacleSelectors,
    )
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
    if (this.panelAvoidanceObservedPanel?.isConnected) {
      return this.panelAvoidanceObservedPanel
    }

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

    if (this.panelAvoidanceScopeCache.has(selector)) {
      return this.panelAvoidanceScopeCache.get(selector) ?? null
    }

    const findVisible = (candidates: Iterable<Element>): HTMLElement | null => {
      for (const candidate of candidates) {
        if (!(candidate instanceof HTMLElement)) continue
        const rect = candidate.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) return candidate
      }
      return null
    }

    // 普通 DOM 中已找到可见容器时，不再为同一个选择器遍历整页 Shadow DOM。
    const scope =
      findVisible(document.querySelectorAll(selector)) ||
      findVisible(DOMToolkit.query(selector, { all: true, shadow: true }) as Element[])
    this.panelAvoidanceScopeCache.set(selector, scope)
    return scope
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
    obstacleSelectors = this.panelAvoidanceConfig?.obstacleSelectors,
  ): PanelReservation | null {
    const config = this.panelAvoidanceConfig
    if (!config || !panel.isConnected) return null

    const root = panel.closest(".gh-root")
    if (root?.classList.contains("gh-pass-through")) return null
    if (this.isPanelAvoidanceSuppressedByPanelState(panel)) return null

    const obstacles = this.getPanelAvoidanceObstacles(panel, obstacleSelectors)
    if (obstacles.length === 0) return null
    return this.getPanelReservationFromObstacles(obstacles, scopeRect)
  }

  private getPanelAvoidanceObstacles(
    panel: HTMLElement,
    obstacleSelectors = this.panelAvoidanceConfig?.obstacleSelectors,
  ): PanelAvoidanceObstacle[] {
    const obstacles: PanelAvoidanceObstacle[] = []
    const panelRect = this.getVisiblePanelAvoidanceObstacleRect(panel, {
      minWidth: this.panelAvoidanceConfig?.minVisiblePanelWidth,
      minHeight: 120,
    })

    if (!panelRect) return obstacles
    obstacles.push({ element: panel, rect: panelRect })

    for (const selector of obstacleSelectors || []) {
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
    // 一个布局帧内多个 inset 复用同一测量；跨帧重新查找以支持路由和面板切换。
    this.panelAvoidanceScopeCache.clear()
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

    const shadowCss = this.generatePanelAvoidanceCSS(panel, reservation, false)
    const shadowCssChanged = this.panelAvoidanceShadowCss !== shadowCss
    this.panelAvoidanceShadowCss = shadowCss
    this.panelAvoidanceStyle = this.upsertStyle(
      STYLE_IDS.PANEL_AVOIDANCE,
      css,
      this.panelAvoidanceStyle,
    )
    if (shadowCssChanged) {
      this.syncPanelAvoidanceShadowStyles()
    }
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

  private handlePanelAvoidanceHostMutations = (mutations: MutationRecord[]) => {
    const contentSelector = [
      ...this.siteAdapter.getChatContentSelectors(),
      this.siteAdapter.getUserQuerySelector(),
    ]
      .filter(Boolean)
      .join(", ")
    const config = this.panelAvoidanceConfig
    const layoutSelector = [
      config?.scopeSelector,
      ...(config?.obstacleSelectors || []),
      ...(config?.insetSelectors || []).flatMap((inset) => [
        inset.scopeSelector,
        ...(inset.obstacleSelectors || []),
      ]),
    ]
      .filter(Boolean)
      .join(", ")

    const affectsLayout = mutations.some((mutation) => {
      const target =
        mutation.target instanceof Element ? mutation.target : mutation.target.parentElement
      if (!target || !contentSelector || !target.closest(contentSelector)) return true

      // 回复内部的 token、收藏图标、Markdown 样式不改变安全区。
      // 容器尺寸变化由 ResizeObserver 处理；显式配置的布局/障碍节点仍需响应。
      if (!layoutSelector) return false
      if (target.matches(layoutSelector)) return true
      return [...mutation.addedNodes, ...mutation.removedNodes].some(
        (node) =>
          node instanceof Element &&
          (node.matches(layoutSelector) || node.querySelector(layoutSelector) !== null),
      )
    })

    if (affectsLayout) this.schedulePanelAvoidanceUpdate()
  }

  private schedulePanelAvoidanceUpdate = () => {
    // 页面宽度 / 禅模式 / 净化模式 / 面板避让都会改变输入框停靠位置，统一在此重测量
    this.scheduleAutoHideResync()
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
    const siteInstanceKey = this.siteAdapter.getSiteInstanceKey()
    const nextZenMode = { ...this.zenModeConfig, enabled: false }
    this.updateZenMode(nextZenMode)
    useSettingsStore.getState().updateDeepSetting("layout", "zenMode", siteInstanceKey, nextZenMode)
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
