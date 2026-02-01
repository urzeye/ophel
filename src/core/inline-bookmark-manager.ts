/**
 * 页面内收藏图标管理器
 *
 * 在页面的标题元素（h1~h6）和用户问题旁边注入收藏图标，
 * 用户可直接点击收藏/取消收藏，无需打开大纲面板。
 */

import type { OutlineItem, SiteAdapter } from "~adapters/base"
import type { OutlineManager } from "~core/outline-manager"
import { useBookmarkStore } from "~stores/bookmarks-store"

// 显示模式
export type InlineBookmarkDisplayMode = "always" | "hover" | "hidden"

// 图标容器的 class 名
const ICON_CLASS = "gh-inline-bookmark"
const ICON_BOOKMARKED_CLASS = "gh-inline-bookmark--bookmarked"

export class InlineBookmarkManager {
  private outlineManager: OutlineManager
  private adapter: SiteAdapter
  private displayMode: InlineBookmarkDisplayMode = "always"
  private unsubscribe: (() => void) | null = null
  private unsubscribeBookmarks: (() => void) | null = null
  private injectedElements = new WeakSet<Element>()

  constructor(
    outlineManager: OutlineManager,
    adapter: SiteAdapter,
    displayMode: InlineBookmarkDisplayMode = "always",
  ) {
    this.outlineManager = outlineManager
    this.adapter = adapter
    this.displayMode = displayMode

    // 注入 CSS 样式（只注入一次）
    this.injectStyles()

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
  }

  /**
   * 注入 CSS 样式
   */
  private injectStyles() {
    const styleId = "gh-inline-bookmark-styles"
    if (document.getElementById(styleId)) return

    const style = document.createElement("style")
    style.id = styleId
    style.textContent = `
      .${ICON_CLASS} {
        position: absolute;
        left: -24px;
        top: 50%;
        transform: translateY(-50%);
        cursor: pointer;
        opacity: 0.3;
        transition: opacity 0.2s, transform 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        z-index: 10;
        color: var(--gh-primary, #f59e0b);
      }

      .${ICON_CLASS}:hover {
        opacity: 1;
        transform: translateY(-50%) scale(1.1);
      }

      .${ICON_CLASS}.${ICON_BOOKMARKED_CLASS} {
        opacity: 1;
      }

      /* 悬浮显示模式 */
      .gh-inline-bookmark-hover .${ICON_CLASS}:not(.${ICON_BOOKMARKED_CLASS}) {
        opacity: 0;
      }

      .gh-inline-bookmark-hover:hover .${ICON_CLASS} {
        opacity: 0.5;
      }

      .gh-inline-bookmark-hover .${ICON_CLASS}:hover {
        opacity: 1;
      }

      /* 隐藏模式 */
      .gh-inline-bookmark-hidden .${ICON_CLASS}:not(.${ICON_BOOKMARKED_CLASS}) {
        display: none;
      }

      /* 确保标题有 position: relative */
      .gh-has-inline-bookmark {
        position: relative !important;
      }
    `
    document.head.appendChild(style)
  }

  /**
   * 注入收藏图标到所有标题元素
   */
  injectBookmarkIcons() {
    if (this.displayMode === "hidden") return

    const flatItems = this.outlineManager.getFlatItems()

    const sessionId = this.adapter.getSessionId()
    const siteId = this.adapter.getSiteId()
    const cid = this.adapter.getCurrentCid() || ""
    const bookmarkStore = useBookmarkStore.getState()

    for (const item of flatItems) {
      if (!item.element || !item.element.isConnected) continue
      if (this.injectedElements.has(item.element)) continue

      const element = item.element as HTMLElement

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

      // 创建 SVG 图标（内联，避免依赖 React）
      iconWrapper.innerHTML = this.createStarSvg(isBookmarked)

      // 存储必要信息
      iconWrapper.dataset.signature = signature
      iconWrapper.dataset.level = String(item.level)
      iconWrapper.dataset.text = item.text

      // 点击事件
      iconWrapper.addEventListener("click", (e) => {
        e.stopPropagation()
        e.preventDefault()
        this.handleBookmarkClick(item, signature, iconWrapper)
      })

      // 插入到元素中（作为第一个子元素）
      element.insertBefore(iconWrapper, element.firstChild)
      this.injectedElements.add(item.element)
    }
  }

  /**
   * 创建星星 SVG
   */
  private createStarSvg(filled: boolean): string {
    // 已收藏时使用黄色实心，未收藏时使用灰色空心
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
   * 处理收藏点击
   */
  private async handleBookmarkClick(
    item: OutlineItem,
    signature: string,
    iconWrapper: HTMLElement,
  ) {
    const sessionId = this.adapter.getSessionId()
    const siteId = this.adapter.getSiteId()
    const cid = this.adapter.getCurrentCid() || ""

    // 获取当前滚动位置
    const scrollContainer = this.adapter.getScrollContainer()
    const scrollTop = scrollContainer?.scrollTop || 0

    // 切换收藏状态
    useBookmarkStore.getState().toggleBookmark(sessionId, siteId, cid, item, signature, scrollTop)

    // 更新图标状态
    const isNowBookmarked = useBookmarkStore.getState().getBookmarkId(sessionId, signature) !== null
    this.updateIconState(iconWrapper, isNowBookmarked)
  }

  /**
   * 更新单个图标状态
   */
  private updateIconState(iconWrapper: HTMLElement, isBookmarked: boolean) {
    if (isBookmarked) {
      iconWrapper.classList.add(ICON_BOOKMARKED_CLASS)
    } else {
      iconWrapper.classList.remove(ICON_BOOKMARKED_CLASS)
    }
    iconWrapper.innerHTML = this.createStarSvg(isBookmarked)
  }

  /**
   * 更新所有图标状态
   */
  private updateAllIconStates() {
    const sessionId = this.adapter.getSessionId()
    const bookmarkStore = useBookmarkStore.getState()

    const icons = document.querySelectorAll(`.${ICON_CLASS}`)
    for (const icon of Array.from(icons)) {
      const signature = (icon as HTMLElement).dataset.signature
      if (!signature) continue

      const isBookmarked = bookmarkStore.getBookmarkId(sessionId, signature) !== null
      this.updateIconState(icon as HTMLElement, isBookmarked)
    }
  }

  /**
   * 设置显示模式
   */
  setDisplayMode(mode: InlineBookmarkDisplayMode) {
    this.displayMode = mode

    // 更新 body class 以应用不同的 CSS 规则
    document.body.classList.remove("gh-inline-bookmark-hover", "gh-inline-bookmark-hidden")

    if (mode === "hover") {
      document.body.classList.add("gh-inline-bookmark-hover")
    } else if (mode === "hidden") {
      document.body.classList.add("gh-inline-bookmark-hidden")
      // 隐藏模式时移除所有图标
      this.cleanup()
    }
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

    // 移除所有注入的图标
    const icons = document.querySelectorAll(`.${ICON_CLASS}`)
    for (const icon of Array.from(icons)) {
      icon.remove()
    }

    // 移除添加的 class
    const elements = document.querySelectorAll(".gh-has-inline-bookmark")
    for (const el of Array.from(elements)) {
      el.classList.remove("gh-has-inline-bookmark")
    }

    this.injectedElements = new WeakSet()
  }
}
