import type { SiteAdapter } from "~adapters/base"
import { useSettingsStore } from "~stores/settings-store"
import { DOMToolkit } from "~utils/dom-toolkit"
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
} as const

const ZEN_MODE_EXIT_HOST_ID = "gh-zen-mode-exit-host"
const ZEN_MODE_EXIT_LABEL = "退出禅模式"

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

  private processedShadowRoots = new WeakSet<ShadowRoot>()
  private shadowCheckInterval: NodeJS.Timeout | null = null

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
      this.unmountZenModeExitButton()
      this.refreshShadowInjection()
      return
    }

    const css = this.generateZenModeCSS()
    if (css) {
      this.zenModeStyle = this.injectStyle(STYLE_IDS.ZEN_MODE, css)
    }
    this.mountZenModeExitButton()
    this.refreshShadowInjection()
  }

  // ==================== CSS 生成 ====================

  private generatePageWidthCSS(): string {
    const width = `${this.pageWidthConfig.value}${this.pageWidthConfig.unit}`
    const selectors = this.siteAdapter.getWidthSelectors()
    return this.buildCSSFromSelectors(selectors, width, true)
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
    const selectors = this.siteAdapter.getZenModeSelectors()
    if (selectors.length === 0) return ""
    return selectors.map((selector) => `${selector} { display: none !important; }`).join("\n")
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
    host.style.cssText = [
      "position: fixed",
      "top: 60px",
      "right: 20px",
      "z-index: 2147483647",
      "pointer-events: auto",
    ].join(";")

    const primary = this.siteAdapter.getThemeColors().primary || "#2563eb"
    const exitLabel = t("zenModeExitButton") || ZEN_MODE_EXIT_LABEL
    const shadowRoot = host.attachShadow({ mode: "open" })
    shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .zen-exit-btn {
          appearance: none;
          border: 1px solid color-mix(in srgb, ${primary} 32%, rgba(255, 255, 255, 0.88));
          border-radius: 999px;
          background:
            linear-gradient(135deg, color-mix(in srgb, ${primary} 18%, rgba(255, 255, 255, 0.94)), rgba(255, 255, 255, 0.92));
          box-shadow:
            0 18px 40px rgba(15, 23, 42, 0.18),
            0 0 0 1px rgba(255, 255, 255, 0.35) inset;
          color: #111827;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
          font-size: 13px;
          font-weight: 700;
          line-height: 1;
          padding: 12px 16px;
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
        }

        .zen-exit-btn:hover {
          transform: translateY(-1px);
          box-shadow:
            0 22px 46px rgba(15, 23, 42, 0.22),
            0 0 0 1px rgba(255, 255, 255, 0.42) inset;
          border-color: color-mix(in srgb, ${primary} 45%, rgba(255, 255, 255, 0.92));
        }

        .zen-exit-btn:focus-visible {
          outline: 2px solid color-mix(in srgb, ${primary} 78%, white);
          outline-offset: 2px;
        }

        .zen-exit-icon {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: color-mix(in srgb, ${primary} 16%, white);
          color: ${primary};
          font-size: 12px;
          flex-shrink: 0;
        }

        .zen-exit-text {
          white-space: nowrap;
        }

        @media (max-width: 768px) {
          :host {
            top: auto;
            right: auto;
            left: 50%;
            bottom: 18px;
            transform: translateX(-50%);
          }
        }
      </style>
      <button class="zen-exit-btn" type="button" aria-label="${exitLabel}">
        <span class="zen-exit-icon" aria-hidden="true">×</span>
        <span class="zen-exit-text">${exitLabel}</span>
      </button>
    `

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

  // ==================== Shadow DOM 支持 ====================

  private refreshShadowInjection() {
    const hasAnyEnabled =
      this.pageWidthConfig?.enabled || this.userQueryWidthConfig?.enabled || this.zenModeEnabled

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

    const siteAdapter = this.siteAdapter

    DOMToolkit.walkShadowRoots((shadowRoot, host) => {
      if (host && !siteAdapter.shouldInjectIntoShadow(host)) return

      // 页面宽度
      if (this.pageWidthConfig?.enabled) {
        const css = this.buildCSSFromSelectors(
          siteAdapter.getWidthSelectors(),
          `${this.pageWidthConfig.value}${this.pageWidthConfig.unit}`,
          false,
        )
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
      this.processedShadowRoots.delete(shadowRoot)
    })
  }
}
