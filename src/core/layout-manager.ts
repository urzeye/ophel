import type { SiteAdapter } from "~adapters/base"
import { useSettingsStore } from "~stores/settings-store"
import { DOMToolkit } from "~utils/dom-toolkit"
import { createSafeHTML } from "~utils/trusted-types"
import { t } from "~utils/i18n"
import type { PageWidthConfig } from "~utils/storage"

// ==================== 样式 ID 常量 ====================
const STYLE_IDS = {
  PAGE_WIDTH: "gh-page-width-styles",
  PAGE_WIDTH_SHADOW: "gh-page-width-shadow",
  USER_QUERY_WIDTH: "gh-user-query-width-styles",
  USER_QUERY_WIDTH_SHADOW: "gh-user-query-width-shadow",
  ZEN_MODE: "gh-zen-mode-styles",
  ZEN_MODE_SHADOW: "gh-zen-mode-shadow",
  CLEAN_MODE: "gh-clean-mode-styles",
  CLEAN_MODE_SHADOW: "gh-clean-mode-shadow",
} as const

const ZEN_MODE_EXIT_HOST_ID = "gh-zen-mode-exit-host"
const ZEN_MODE_EXIT_LABEL = "退出禅模式"

/** 窄屏断点（CSS 逻辑像素），低于此值时内容宽度自动切换为近满屏，避免百分比宽度在手机上过窄 */
const NARROW_SCREEN_BREAKPOINT = 480

/**
 * 页面布局管理器
 * 负责动态注入页面宽度和用户问题宽度样式，支持 Shadow DOM
 */
export class LayoutManager {
  private siteAdapter: SiteAdapter
  private pageWidthConfig: PageWidthConfig
  private userQueryWidthConfig: PageWidthConfig | null = null

  private pageWidthStyle: HTMLStyleElement | null = null
  private userQueryWidthStyle: HTMLStyleElement | null = null
  private zenModeStyle: HTMLStyleElement | null = null
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

  constructor(siteAdapter: SiteAdapter, pageWidthConfig: PageWidthConfig) {
    this.siteAdapter = siteAdapter
    this.pageWidthConfig = pageWidthConfig
  }

  // ==================== 页面宽度 ====================

  updateConfig(config: PageWidthConfig) {
    this.pageWidthConfig = config
    this.apply()
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

  updateZenMode(enabled: boolean) {
    this.zenModeEnabled = enabled
    this.applyZenMode()
  }

  applyZenMode() {
    this.removeStyle(this.zenModeStyle)
    this.zenModeStyle = null

    if (!this.zenModeEnabled) {
      this.cleanupZenModeRootClass()
      this.unmountZenModeExitButton()
      this.refreshShadowInjection()
      return
    }

    this.syncZenModeRootClass()

    const css = this.generateZenModeCSS()
    if (css) {
      this.zenModeStyle = this.injectStyle(STYLE_IDS.ZEN_MODE, css)
    }
    this.mountZenModeExitButton()
    this.refreshShadowInjection()
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
      return
    }

    const css = this.generateCleanModeCSS()
    if (css) {
      this.cleanModeStyle = this.injectStyle(STYLE_IDS.CLEAN_MODE, css)
    }
    this.refreshShadowInjection()
  }

  // ==================== CSS 生成 ====================

  private generatePageWidthCSS(): string {
    const width = `${this.pageWidthConfig.value}${this.pageWidthConfig.unit}`
    const selectors = this.siteAdapter.getWidthSelectors()
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
    const selectors = this.siteAdapter.getUserQueryWidthSelectors()
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
    selectors: Array<{
      selector: string
      property: string
      globalSelector?: string
      value?: string
      transformValue?: (value: string) => string
      extraCss?: string
      noCenter?: boolean
    }>,
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

  // ==================== 工具方法 ====================

  private injectStyle(id: string, css: string): HTMLStyleElement {
    const style = document.createElement("style")
    style.id = id
    style.textContent = css
    document.head.appendChild(style)
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
    const exitLabel = t("zenModeExitButton") || ZEN_MODE_EXIT_LABEL
    const shadowRoot = host.attachShadow({ mode: "open" })
    shadowRoot.innerHTML = createSafeHTML(`
      <style>
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
          background: var(--gh-glass-bg, rgba(255, 255, 255, 0.25));
          border: 1px solid var(--gh-border, rgba(255, 255, 255, 0.15));
          border-radius: 9999px;
          box-shadow:
            var(--gh-shadow-lg, 0 10px 40px rgba(0, 0, 0, 0.15)),
            0 0 0 1px rgba(255, 255, 255, 0.1) inset;
          color: var(--gh-text, #1f2937);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 12px;
          font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", "PingFang SC", "Microsoft YaHei", sans-serif;
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
          background: var(--gh-glass-bg-hover, rgba(255, 255, 255, 0.4));
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
    this.updateZenMode(false)
    useSettingsStore.getState().updateDeepSetting("layout", "zenMode", siteId, { enabled: false })
  }

  // ==================== 国际化支持 ====================

  refreshLocalizedTexts() {
    if (!this.zenModeEnabled || !this.zenModeExitHost?.shadowRoot) return

    const exitLabel = t("zenModeExitButton") || ZEN_MODE_EXIT_LABEL
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
        const selectors = siteAdapter.getWidthSelectors()
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
          siteAdapter.getUserQueryWidthSelectors(),
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

      this.processedShadowRoots.add(shadowRoot)
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
      this.removeStyleFromShadow(shadowRoot, STYLE_IDS.ZEN_MODE_SHADOW)
      this.removeStyleFromShadow(shadowRoot, STYLE_IDS.CLEAN_MODE_SHADOW)
      this.processedShadowRoots.delete(shadowRoot)
    })
  }
}
