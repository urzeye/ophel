import type { SiteAdapter } from "~adapters/base"
import { DOMToolkit } from "~utils/dom-toolkit"
import type { PageWidthConfig } from "~utils/storage"

// ==================== 样式 ID 常量 ====================
const STYLE_IDS = {
  PAGE_WIDTH: "gh-page-width-styles",
  PAGE_WIDTH_SHADOW: "gh-page-width-shadow",
  USER_QUERY_WIDTH: "gh-user-query-width-styles",
  USER_QUERY_WIDTH_SHADOW: "gh-user-query-width-shadow",
} as const

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

  // ==================== CSS 生成 ====================

  private generatePageWidthCSS(): string {
    const width = `${this.pageWidthConfig.value}${this.pageWidthConfig.unit}`
    const selectors = this.siteAdapter.getWidthSelectors()
    return this.buildCSSFromSelectors(selectors, width, true)
  }

  private generateUserQueryWidthCSS(): string {
    if (!this.userQueryWidthConfig) return ""
    // 添加默认值防止 undefined（默认 600px）
    const value = this.userQueryWidthConfig.value || "600"
    const unit = this.userQueryWidthConfig.unit || "px"
    const width = `${value}${unit}`
    const selectors = this.siteAdapter.getUserQueryWidthSelectors()
    return this.buildCSSFromSelectors(selectors, width, false)
  }

  private buildCSSFromSelectors(
    selectors: Array<{
      selector: string
      property: string
      globalSelector?: string
      value?: string
      extraCss?: string
      noCenter?: boolean
    }>,
    globalWidth: string,
    useGlobalSelector: boolean,
  ): string {
    return selectors
      .map((config) => {
        const { selector, globalSelector, property, value, extraCss, noCenter } = config
        const finalWidth = value || globalWidth
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

  // ==================== Shadow DOM 支持 ====================

  private refreshShadowInjection() {
    const hasAnyEnabled = this.pageWidthConfig?.enabled || this.userQueryWidthConfig?.enabled

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
        const value = this.userQueryWidthConfig.value || "600"
        const unit = this.userQueryWidthConfig.unit || "px"
        const css = this.buildCSSFromSelectors(
          siteAdapter.getUserQueryWidthSelectors(),
          `${value}${unit}`,
          false,
        )
        DOMToolkit.cssToShadow(shadowRoot, css, STYLE_IDS.USER_QUERY_WIDTH_SHADOW)
      } else {
        this.removeStyleFromShadow(shadowRoot, STYLE_IDS.USER_QUERY_WIDTH_SHADOW)
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
      this.processedShadowRoots.delete(shadowRoot)
    })
  }
}
