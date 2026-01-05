import type { SiteAdapter } from "~adapters/base"
import { DOMToolkit } from "~utils/dom-toolkit"
import type { PageWidthConfig } from "~utils/storage"

/**
 * 页面宽度样式管理器
 * 负责动态注入和移除页面宽度样式，支持 Shadow DOM
 */
export class LayoutManager {
  private siteAdapter: SiteAdapter
  private widthConfig: PageWidthConfig
  private styleElement: HTMLStyleElement | null = null
  private processedShadowRoots = new WeakSet<ShadowRoot>()
  private shadowCheckInterval: NodeJS.Timeout | null = null

  constructor(siteAdapter: SiteAdapter, widthConfig: PageWidthConfig) {
    this.siteAdapter = siteAdapter
    this.widthConfig = widthConfig
  }

  updateConfig(widthConfig: PageWidthConfig) {
    this.widthConfig = widthConfig
    this.apply()
  }

  apply() {
    // 1. 处理主文档样式
    if (this.styleElement) {
      this.styleElement.remove()
      this.styleElement = null
    }

    const css = this.generateCSS()

    if (this.widthConfig && this.widthConfig.enabled) {
      this.styleElement = document.createElement("style")
      this.styleElement.id = "gemini-helper-width-styles"
      this.styleElement.textContent = css
      document.head.appendChild(this.styleElement)

      // 启动 Shadow DOM 注入逻辑
      this.startShadowInjection()
    } else {
      // 如果禁用了，也要清理 Shadow DOM 中的样式
      this.stopShadowInjection()
      this.clearShadowStyles()
    }
  }

  private generateCSS() {
    const globalWidth = `${this.widthConfig.value}${this.widthConfig.unit}`
    const selectors = this.siteAdapter.getWidthSelectors()
    return selectors
      .map((config: any) => {
        const { selector, globalSelector, property, value, extraCss, noCenter } = config
        const params = {
          finalWidth: value || globalWidth,
          targetSelector: globalSelector || selector, // 优先使用全局特定选择器
          property,
          extra: extraCss || "",
          centerCss: noCenter ? "" : "margin-left: auto !important; margin-right: auto !important;",
        }
        return `${params.targetSelector} { ${params.property}: ${params.finalWidth} !important; ${params.centerCss} ${params.extra} }`
      })
      .join("\n")
  }

  // ============= Shadow DOM 支持 =============

  private startShadowInjection() {
    // Shadow CSS 需要重新生成，因为不能使用带 ancestor 的 globalSelector
    // Shadow DOM 内部必须使用原始 selector，但包含同样的样式规则
    const shadowCss = this.generateShadowCSS()

    // 立即执行一次全量检查
    this.injectToAllShadows(shadowCss)

    // 使用定时器定期检查
    if (this.shadowCheckInterval) clearInterval(this.shadowCheckInterval)
    this.shadowCheckInterval = setInterval(() => {
      this.injectToAllShadows(shadowCss)
    }, 1000)
  }

  private generateShadowCSS() {
    const globalWidth = `${this.widthConfig.value}${this.widthConfig.unit}`
    const selectors = this.siteAdapter.getWidthSelectors()
    return selectors
      .map((config: any) => {
        const { selector, property, value, extraCss, noCenter } = config
        // Shadow DOM 中只使用原始 selector (不带父级限定)，靠 JS 过滤来保证安全
        const finalWidth = value || globalWidth
        const extra = extraCss || ""
        const centerCss = noCenter
          ? ""
          : "margin-left: auto !important; margin-right: auto !important;"
        return `${selector} { ${property}: ${finalWidth} !important; ${centerCss} ${extra} }`
      })
      .join("\n")
  }

  private stopShadowInjection() {
    if (this.shadowCheckInterval) {
      clearInterval(this.shadowCheckInterval)
      this.shadowCheckInterval = null
    }
  }

  private injectToAllShadows(css: string) {
    if (!document.body) return

    const siteAdapter = this.siteAdapter
    const processedShadowRoots = this.processedShadowRoots

    // 使用 DOMToolkit.walkShadowRoots 遍历所有 Shadow Root
    DOMToolkit.walkShadowRoots((shadowRoot, host) => {
      // 检查是否应该注入到该 Shadow DOM（通过 Adapter 过滤，例如排除侧边栏）
      if (host && !siteAdapter.shouldInjectIntoShadow(host)) {
        return
      }

      // 使用 DOMToolkit.cssToShadow 注入样式
      DOMToolkit.cssToShadow(shadowRoot, css, "gemini-helper-width-shadow-style")
      processedShadowRoots.add(shadowRoot)
    })
  }

  private clearShadowStyles() {
    if (!document.body) return

    const processedShadowRoots = this.processedShadowRoots

    // 使用 DOMToolkit.walkShadowRoots 遍历所有 Shadow Root
    DOMToolkit.walkShadowRoots((shadowRoot) => {
      const style = shadowRoot.getElementById("gemini-helper-width-shadow-style")
      if (style) style.remove()
      processedShadowRoots.delete(shadowRoot)
    })
  }
}
