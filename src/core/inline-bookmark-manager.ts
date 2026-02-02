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

// 显示模式
export type InlineBookmarkDisplayMode = "always" | "hover" | "hidden"

// 图标容器的 class 名
const ICON_CLASS = "gh-inline-bookmark"
const ICON_BOOKMARKED_CLASS = "gh-inline-bookmark--bookmarked"

// Style IDs
const GLOBAL_STYLE_ID = "gh-inline-bookmark-global-styles"
const SCOPED_STYLE_ID = "gh-inline-bookmark-scoped-styles"

export class InlineBookmarkManager {
  private outlineManager: OutlineManager
  private adapter: SiteAdapter
  private displayMode: InlineBookmarkDisplayMode = "always"
  private unsubscribe: (() => void) | null = null
  private unsubscribeBookmarks: (() => void) | null = null
  private injectedElements = new WeakSet<Element>()
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

    // 订阅大纲变化
    this.unsubscribe = outlineManager.subscribe(() => {
      this.injectBookmarkIcons()
    })

    // 订阅书签变化
    this.unsubscribeBookmarks = useBookmarkStore.subscribe(() => {
      this.updateAllIconStates()
    })

    // 初始注入
    this.injectBookmarkIcons()
    // 设置初始显示模式
    this.setDisplayMode(displayMode)
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
    const parent = root instanceof Document ? document.head : root

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
  }

  /**
   * 注入收藏图标到所有标题元素
   */
  injectBookmarkIcons() {
    const flatItems = this.outlineManager.getFlatItems()
    const sessionId = this.adapter.getSessionId()
    const bookmarkStore = useBookmarkStore.getState()

    for (let idx = 0; idx < flatItems.length; idx++) {
      const item = flatItems[idx]
      if (!item.element || !item.element.isConnected) continue

      const element = item.element as HTMLElement

      // 1. 确保该元素所在的 Root (Document 或 ShadowRoot) 注入了 Scoped CSS
      const root = element.getRootNode()
      if (root) {
        this.injectScopedStyles(root)
      }

      // 2. 注入图标 (同前，防止重复)
      if (this.injectedElements.has(element)) continue
      if (element.querySelector(`.${ICON_CLASS}`)) {
        this.injectedElements.add(element)
        continue
      }

      // 确保元素有 position: relative
      element.classList.add("gh-has-inline-bookmark")

      // 创建图标容器
      const iconWrapper = document.createElement("span")
      iconWrapper.className = ICON_CLASS

      // 生成签名和检查是否已收藏
      const signature = this.outlineManager.getSignature(item)
      const isBookmarked = bookmarkStore.getBookmarkId(sessionId, signature) !== null

      if (isBookmarked) {
        iconWrapper.classList.add(ICON_BOOKMARKED_CLASS)
      }

      iconWrapper.innerHTML = this.createStarSvg(isBookmarked)

      // 数据与事件
      iconWrapper.dataset.signature = signature
      iconWrapper.dataset.level = String(item.level)
      iconWrapper.dataset.text = item.text

      iconWrapper.addEventListener("click", (e) => {
        e.stopPropagation()
        e.preventDefault()
        this.handleBookmarkClick(item, signature, iconWrapper)
      })

      element.insertBefore(iconWrapper, element.firstChild)
      this.injectedElements.add(element)
    }
  }

  /**
   * 创建星星 SVG
   */
  private createStarSvg(filled: boolean): string {
    const fillColor = filled ? "#f59e0b" : "none"
    const strokeColor = filled ? "#f59e0b" : "currentColor"
    return `
      <svg viewBox="0 0 24 24" width="16" height="16"
           fill="${fillColor}"
           stroke="${strokeColor}" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    `
  }

  /**
   * 处理书签点击
   */
  private handleBookmarkClick(item: OutlineItem, signature: string, _iconWrapper: HTMLElement) {
    const bookmarkStore = useBookmarkStore.getState()
    const sessionId = this.adapter.getSessionId()
    const siteId = this.adapter.getSiteId()
    const cid = this.adapter.getCurrentCid() || ""

    const scrollContainer = this.outlineManager.getScrollContainer()
    const scrollTop = (item.element as HTMLElement).offsetTop + (scrollContainer?.scrollTop || 0)

    bookmarkStore.toggleBookmark(sessionId, siteId, cid, item, signature, scrollTop)
  }

  /**
   * 更新所有图标状态
   */
  updateAllIconStates() {
    const bookmarkStore = useBookmarkStore.getState()
    const sessionId = this.adapter.getSessionId()

    const icons = DOMToolkit.query(`.${ICON_CLASS}`, {
      all: true,
      shadow: true,
    }) as Element[]

    icons.forEach((iconWrapper) => {
      const wrapper = iconWrapper as HTMLElement
      const signature = wrapper.dataset.signature
      if (!signature) return

      const isBookmarked = bookmarkStore.getBookmarkId(sessionId, signature) !== null
      const hasClass = wrapper.classList.contains(ICON_BOOKMARKED_CLASS)

      if (isBookmarked !== hasClass) {
        if (isBookmarked) {
          wrapper.classList.add(ICON_BOOKMARKED_CLASS)
          wrapper.innerHTML = this.createStarSvg(true)
        } else {
          wrapper.classList.remove(ICON_BOOKMARKED_CLASS)
          wrapper.innerHTML = this.createStarSvg(false)
        }
      }
    })
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

    // 清理全局样式
    document.getElementById(GLOBAL_STYLE_ID)?.remove()
    document.getElementById(SCOPED_STYLE_ID)?.remove() // 清理 Doc 上的 Scoped

    // 清理 Shadow DOM 中的 Styles 和 Icons
    // 注意：我们也需要清理 Shadow Root 里的 style 标签
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
    this.injectedElements = new WeakSet()
    this.injectedRoots = new WeakSet()
  }
}
