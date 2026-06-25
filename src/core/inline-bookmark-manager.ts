/**
 * 页面内收藏图标管理器
 *
 * 在页面的标题元素（h1~h6）和用户问题旁边注入收藏图标，
 * 用户可直接点击收藏/取消收藏，无需打开大纲面板。
 */

import type { OutlineItem, SiteAdapter } from "~adapters/base"
import type { OutlineManager } from "~core/outline-manager"
import { useBookmarkStore } from "~stores/bookmarks-store"

import { DOMToolkit } from "~utils/dom-toolkit"
import { createSVGElement } from "~utils/icons"

// 显示模式
export type InlineBookmarkDisplayMode = "always" | "hover" | "hidden"

interface InlineBookmarkCandidate {
  item: OutlineItem
  sourceId: string
}

// 图标容器的 class 名
const ICON_CLASS = "gh-inline-bookmark"
const ICON_BOOKMARKED_CLASS = "gh-inline-bookmark--bookmarked"
const OUTLINE_TARGET_SELECTOR = "h1, h2, h3, h4, h5, h6"

// Style IDs
const GLOBAL_STYLE_ID = "gh-inline-bookmark-global-styles"
const SCOPED_STYLE_ID = "gh-inline-bookmark-scoped-styles"

export class InlineBookmarkManager {
  private outlineManager: OutlineManager
  private adapter: SiteAdapter
  private displayMode: InlineBookmarkDisplayMode = "always"
  private unsubscribe: (() => void) | null = null
  private unsubscribeBookmarks: (() => void) | null = null
  private observer: MutationObserver | null = null
  private injectDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private injectedSignatures = new WeakMap<Element, string>()
  private injectedRoots = new WeakSet<Node>()

  constructor(
    outlineManager: OutlineManager,
    adapter: SiteAdapter,
    displayMode: InlineBookmarkDisplayMode = "always",
  ) {
    this.outlineManager = outlineManager
    this.adapter = adapter
    this.displayMode = displayMode

    // 1. 注入全局 CSS 变量定义（Head）
    this.injectGlobalStyles()
    // 设置初始显示模式
    this.setDisplayMode(displayMode)

    // 订阅大纲变化
    this.unsubscribe = outlineManager.subscribe(() => {
      this.injectBookmarkIcons({ includeAdapterScan: false })
    })

    // 订阅书签变化
    this.unsubscribeBookmarks = useBookmarkStore.subscribe(() => {
      this.updateAllIconStates()
    })

    this.startDomObserver()

    // 初始注入
    this.injectBookmarkIcons()
  }

  /**
   * 1. 注入全局 CSS 变量 (Inheritable)
   * 控制不同模式下的 Opacity 和 Display
   */
  private injectGlobalStyles() {
    if (document.getElementById(GLOBAL_STYLE_ID)) return

    const style = document.createElement("style")
    style.id = GLOBAL_STYLE_ID
    style.textContent = `
      :root {
        --gh-icon-display: flex;
        --gh-icon-opacity-default: 0.3;
        --gh-icon-opacity-parent-hover: 0.5;
      }

      body.gh-inline-bookmark-mode-always {
        --gh-icon-display: flex;
        --gh-icon-opacity-default: 0.3;
        --gh-icon-opacity-parent-hover: 0.3;
      }

      body.gh-inline-bookmark-mode-hover {
        --gh-icon-display: flex;
        --gh-icon-opacity-default: 0; /* 默认隐藏 */
        --gh-icon-opacity-parent-hover: 0.5; /* 父元素悬停时显示 */
      }

      body.gh-inline-bookmark-mode-hidden {
        --gh-icon-display: none;
        --gh-icon-opacity-default: 0;
      }
    `
    document.head.appendChild(style)
  }

  /**
   * 2. 注入 Scoped CSS (Into Shadow Root or Document)
   * 包含具体的布局和交互样式，使用全局变量
   */
  private injectScopedStyles(root: Node) {
    if (this.injectedRoots.has(root)) return

    // 如果是 Document，检查是否已存在（避免重复）
    // 如果是 ShadowRoot，需要在该 Root 下查找
    // const parent = root instanceof Document ? document.head : root

    // 检查是否存在
    if (root instanceof Document) {
      // Global styles handled separately, but scoped styles for main doc also needed?
      // Actually injectGlobalStyles handles body classes.
      // We need similar .gh-inline-bookmark rules in main document too if not shadow.
      // Let's use a specific ID check for the root
      if (document.getElementById(SCOPED_STYLE_ID)) {
        this.injectedRoots.add(root)
        return
      }
    } else {
      // Check inside shadow root
      if ((root as ParentNode).querySelector(`#${SCOPED_STYLE_ID}`)) {
        this.injectedRoots.add(root)
        return
      }
    }

    const style = document.createElement("style")
    style.id = SCOPED_STYLE_ID
    style.textContent = `
      .${ICON_CLASS} {
        position: absolute;
        left: var(--gh-icon-left, -24px); /* 支持通过 CSS 变量调整位置 */
        top: 50%;
        transform: translateY(-50%);
        cursor: pointer;
        transition: opacity 0.2s, transform 0.2s;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        z-index: 10;
        color: var(--gh-primary, #f59e0b);

        /* 使用 CSS 变量控制显示 */
        display: var(--gh-icon-display, flex);
        opacity: var(--gh-icon-opacity-default, 0.3);
      }

      /* Hover Effects depend on local structure, so must be in scoped css */
      .${ICON_CLASS}:hover {
        opacity: 1 !important;
        transform: translateY(-50%) scale(1.1);
      }

      .${ICON_CLASS}.${ICON_BOOKMARKED_CLASS} {
        opacity: 1 !important;
      }

      /* Parent Hover Effect */
      .gh-has-inline-bookmark:hover .${ICON_CLASS}:not(.${ICON_BOOKMARKED_CLASS}) {
        opacity: var(--gh-icon-opacity-parent-hover, 0.5);
      }

      /* Ensure parent relative positioning */
      .gh-has-inline-bookmark {
        position: relative !important;
      }
    `

    // Append to appropriate place
    if (root instanceof Document) {
      document.head.appendChild(style)
    } else {
      ;(root as ShadowRoot).appendChild(style)
    }

    this.injectedRoots.add(root)
  }

  /**
   * 设置显示模式
   */
  setDisplayMode(mode: InlineBookmarkDisplayMode) {
    this.displayMode = mode
    document.body.classList.remove(
      "gh-inline-bookmark-mode-always",
      "gh-inline-bookmark-mode-hover",
      "gh-inline-bookmark-mode-hidden",
    )
    // 这会触发全局 CSS 变量的更新，进而通过继承影响所有 Shadow DOM 内的图标
    document.body.classList.add(`gh-inline-bookmark-mode-${mode}`)

    if (mode === "hidden") {
      this.removeInjectedIcons()
    }
  }

  /**
   * 注入收藏图标到所有标题元素
   */
  injectBookmarkIcons(options: { includeAdapterScan?: boolean } = {}) {
    if (this.displayMode === "hidden") {
      this.removeInjectedIcons()
      return
    }

    const candidates = this.getInlineBookmarkItems(options.includeAdapterScan ?? true)
    const bookmarkStore = useBookmarkStore.getState()

    for (let idx = 0; idx < candidates.length; idx++) {
      const { item, sourceId } = candidates[idx]
      if (!item.element || !item.element.isConnected) continue

      const element = item.element as HTMLElement

      // 1. 确保该元素所在的 Root (Document 或 ShadowRoot) 注入了 Scoped CSS
      const root = element.getRootNode()
      if (root) {
        this.injectScopedStyles(root)
      }

      // 生成签名和检查是否已收藏
      const sessionId = this.outlineManager.getBookmarkSessionId(sourceId)
      const signature = this.outlineManager.getSignature(item, sourceId)
      const isBookmarked = bookmarkStore.getBookmarkId(sessionId, signature) !== null

      // 2. 注入图标。虚拟滚动可能复用 DOM 元素承载不同消息，
      // 所以不能只按元素去重，还要确认签名仍然一致。
      const existingIcon = element.querySelector(`.${ICON_CLASS}`) as HTMLElement | null
      if (
        existingIcon &&
        this.injectedSignatures.get(element) === signature &&
        existingIcon.dataset.signature === signature &&
        existingIcon.dataset.sourceId === sourceId
      ) {
        continue
      }

      existingIcon?.remove()

      // 确保元素有 position: relative
      element.classList.add("gh-has-inline-bookmark")

      // 创建图标容器
      const iconWrapper = document.createElement("span")
      iconWrapper.className = ICON_CLASS

      if (isBookmarked) {
        iconWrapper.classList.add(ICON_BOOKMARKED_CLASS)
      }

      iconWrapper.replaceChildren(this.createStarSvgElement(isBookmarked))

      // 数据与事件
      iconWrapper.dataset.signature = signature
      iconWrapper.dataset.sourceId = sourceId
      iconWrapper.dataset.level = String(item.level)
      iconWrapper.dataset.text = item.text

      iconWrapper.addEventListener("click", (e) => {
        e.stopPropagation()
        e.preventDefault()
        this.handleBookmarkClick(item, sourceId, signature, iconWrapper)
      })

      element.insertBefore(iconWrapper, element.firstChild)
      this.injectedSignatures.set(element, signature)
    }
  }

  private startDomObserver() {
    const target = this.adapter.getObserveTarget() ?? document.body
    if (!target) return

    this.observer = new MutationObserver((mutations) => {
      if (this.hasRelevantMutation(mutations)) {
        this.scheduleInjectBookmarkIcons({ includeAdapterScan: true })
      }
    })

    this.observer.observe(target, {
      childList: true,
      subtree: true,
    })
  }

  private scheduleInjectBookmarkIcons(options: { includeAdapterScan: boolean }) {
    if (this.displayMode === "hidden") return
    if (this.injectDebounceTimer) {
      clearTimeout(this.injectDebounceTimer)
    }

    this.injectDebounceTimer = setTimeout(() => {
      this.injectDebounceTimer = null
      this.injectBookmarkIcons({ includeAdapterScan: options.includeAdapterScan })
    }, 120)
  }

  private hasRelevantMutation(mutations: MutationRecord[]): boolean {
    const subtreeSelector = this.getInlineBookmarkTargetSelector()
    const contentChangeSelector = this.getInlineBookmarkContentChangeSelector()

    return mutations.some((mutation) => {
      if (this.nodeIsInsideInlineBookmarkContent(mutation.target, contentChangeSelector)) {
        return true
      }

      for (const node of mutation.addedNodes) {
        if (
          this.nodeMatchesInlineBookmarkTarget(node, subtreeSelector) ||
          this.nodeIsInsideInlineBookmarkContent(node, contentChangeSelector)
        ) {
          return true
        }
      }
      return false
    })
  }

  private getInlineBookmarkTargetSelector(): string {
    const selectors = [
      OUTLINE_TARGET_SELECTOR,
      this.adapter.getUserQuerySelector(),
      ...this.adapter.getChatContentSelectors(),
    ].filter((selector): selector is string => Boolean(selector?.trim()))

    return Array.from(new Set(selectors)).join(", ")
  }

  private getInlineBookmarkContentChangeSelector(): string {
    const selectors = [OUTLINE_TARGET_SELECTOR, this.adapter.getUserQuerySelector()].filter(
      (selector): selector is string => Boolean(selector?.trim()),
    )

    return Array.from(new Set(selectors)).join(", ")
  }

  private nodeMatchesInlineBookmarkTarget(node: Node, selector: string): boolean {
    if (!(node instanceof Element)) return false

    try {
      return node.matches(selector) || node.querySelector(selector) !== null
    } catch {
      return (
        node.matches(OUTLINE_TARGET_SELECTOR) ||
        node.querySelector(OUTLINE_TARGET_SELECTOR) !== null
      )
    }
  }

  private nodeIsInsideInlineBookmarkContent(node: Node, selector: string): boolean {
    const element = node instanceof Element ? node : node.parentElement
    if (!element) return false

    try {
      return element.matches(selector) || element.closest(selector) !== null
    } catch {
      return (
        element.matches(OUTLINE_TARGET_SELECTOR) ||
        element.closest(OUTLINE_TARGET_SELECTOR) !== null
      )
    }
  }

  private getInlineBookmarkItems(includeAdapterScan: boolean): InlineBookmarkCandidate[] {
    const items: InlineBookmarkCandidate[] = []
    const seenElements = new Set<Element>()

    const pushItems = (candidates: OutlineItem[], sourceId: string) => {
      candidates.forEach((item) => {
        const element = item.element
        if (!element || seenElements.has(element)) return

        seenElements.add(element)
        items.push({ item, sourceId })
      })
    }

    if (includeAdapterScan) {
      pushItems(this.adapter.getInlineBookmarkItems(), "conversation")
    }
    pushItems(this.outlineManager.getFlatItems(), this.outlineManager.getActiveSourceId())

    return items
  }

  /**
   * 创建星星 SVG
   */
  /**
   * 创建星星 SVG (DOM API)
   */
  private createStarSvgElement(filled: boolean): SVGElement {
    const fillColor = filled ? "#f59e0b" : "none"
    const strokeColor = filled ? "#f59e0b" : "currentColor"

    // 1. 创建 SVG 容器
    const svg = createSVGElement("svg", {
      viewBox: "0 0 24 24",
      width: "16",
      height: "16",
      fill: fillColor,
      stroke: strokeColor,
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    })

    // 2. 创建 Polygon
    const polygon = createSVGElement("polygon", {
      points:
        "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2",
    })

    svg.appendChild(polygon)
    return svg
  }

  /**
   * 处理书签点击
   */
  private handleBookmarkClick(
    item: OutlineItem,
    sourceId: string,
    signature: string,
    _iconWrapper: HTMLElement,
  ) {
    const bookmarkStore = useBookmarkStore.getState()
    const sessionId = this.outlineManager.getBookmarkSessionId(sourceId)
    const siteId = this.adapter.getSiteId()
    const cid = this.adapter.getCurrentCid() || ""

    const scrollContainer = this.adapter.getOutlineScrollContainer(sourceId)
    const scrollTop = (item.element as HTMLElement).offsetTop + (scrollContainer?.scrollTop || 0)

    bookmarkStore.toggleBookmark(sessionId, siteId, cid, item, signature, scrollTop)
  }

  /**
   * 更新所有图标状态
   */
  updateAllIconStates() {
    if (this.displayMode === "hidden") {
      this.removeInjectedIcons()
      return
    }

    const bookmarkStore = useBookmarkStore.getState()

    const icons = DOMToolkit.query(`.${ICON_CLASS}`, {
      all: true,
      shadow: true,
    }) as Element[]

    icons.forEach((iconWrapper) => {
      const wrapper = iconWrapper as HTMLElement
      const signature = wrapper.dataset.signature
      const sourceId = wrapper.dataset.sourceId || "conversation"
      if (!signature) return

      const sessionId = this.outlineManager.getBookmarkSessionId(sourceId)
      const isBookmarked = bookmarkStore.getBookmarkId(sessionId, signature) !== null
      const hasClass = wrapper.classList.contains(ICON_BOOKMARKED_CLASS)

      if (isBookmarked !== hasClass) {
        if (isBookmarked) {
          wrapper.classList.add(ICON_BOOKMARKED_CLASS)
          wrapper.replaceChildren(this.createStarSvgElement(true))
        } else {
          wrapper.classList.remove(ICON_BOOKMARKED_CLASS)
          wrapper.replaceChildren(this.createStarSvgElement(false))
        }
      }
    })
  }

  /**
   * 移除已注入的页面图标和容器标记，保留当前实例的订阅关系。
   */
  private removeInjectedIcons() {
    const icons = DOMToolkit.query(`.${ICON_CLASS}`, {
      all: true,
      shadow: true,
    }) as Element[]
    icons.forEach((el) => el.remove())

    const containers = DOMToolkit.query(".gh-has-inline-bookmark", {
      all: true,
      shadow: true,
    }) as Element[]
    containers.forEach((el) => {
      el.classList.remove("gh-has-inline-bookmark")
    })

    this.injectedSignatures = new WeakMap()
  }

  static cleanupInjectedArtifacts() {
    document.getElementById(GLOBAL_STYLE_ID)?.remove()
    document.getElementById(SCOPED_STYLE_ID)?.remove()

    const scopedStyles = DOMToolkit.query(`#${SCOPED_STYLE_ID}`, {
      all: true,
      shadow: true,
    }) as Element[]
    scopedStyles.forEach((el) => el.remove())

    const icons = DOMToolkit.query(`.${ICON_CLASS}`, {
      all: true,
      shadow: true,
    }) as Element[]
    icons.forEach((el) => el.remove())

    const containers = DOMToolkit.query(".gh-has-inline-bookmark", {
      all: true,
      shadow: true,
    }) as Element[]
    containers.forEach((el) => {
      el.classList.remove("gh-has-inline-bookmark")
    })

    document.body.classList.remove(
      "gh-inline-bookmark-mode-always",
      "gh-inline-bookmark-mode-hover",
      "gh-inline-bookmark-mode-hidden",
    )
  }

  /**
   * 清理
   */
  cleanup() {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    if (this.unsubscribeBookmarks) {
      this.unsubscribeBookmarks()
      this.unsubscribeBookmarks = null
    }
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
    if (this.injectDebounceTimer) {
      clearTimeout(this.injectDebounceTimer)
      this.injectDebounceTimer = null
    }

    InlineBookmarkManager.cleanupInjectedArtifacts()
    this.injectedSignatures = new WeakMap()
    this.injectedRoots = new WeakSet()
  }
}
