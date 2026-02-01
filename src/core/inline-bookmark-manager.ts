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
    // 设置初始显示模式
    this.setDisplayMode(displayMode)
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

      /* 悬浮显示模式: body 有 gh-inline-bookmark-mode-hover 类 */
      /* 默认隐藏未收藏的图标 */
      body.gh-inline-bookmark-mode-hover .gh-has-inline-bookmark .${ICON_CLASS}:not(.${ICON_BOOKMARKED_CLASS}) {
        opacity: 0;
      }

      /* 鼠标悬停在标题上时，显示图标（半透明） */
      body.gh-inline-bookmark-mode-hover .gh-has-inline-bookmark:hover .${ICON_CLASS} {
        opacity: 0.5;
      }

      /* 鼠标悬停在图标上时，完全不透明 */
      body.gh-inline-bookmark-mode-hover .gh-has-inline-bookmark .${ICON_CLASS}:hover {
        opacity: 1;
      }

      /* 隐藏模式: body 有 gh-inline-bookmark-mode-hidden 类 */
      /* 完全隐藏所有图标（包括已收藏的） */
      body.gh-inline-bookmark-mode-hidden .${ICON_CLASS} {
        display: none !important;
      }

      /* 确保标题有 position: relative */
      .gh-has-inline-bookmark {
        position: relative !important;
      }
    `
    document.head.appendChild(style)
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
    document.body.classList.add(`gh-inline-bookmark-mode-${mode}`)
  }

  /**
   * 注入收藏图标到所有标题元素
   */
  injectBookmarkIcons() {
    // 即使是 hidden 模式也要注入，因为 css 会控制隐藏，这样切换模式时响应更快
    const flatItems = this.outlineManager.getFlatItems()

    const sessionId = this.adapter.getSessionId()
    const bookmarkStore = useBookmarkStore.getState()

    for (let idx = 0; idx < flatItems.length; idx++) {
      const item = flatItems[idx]
      if (!item.element || !item.element.isConnected) continue
      if (this.injectedElements.has(item.element)) continue

      const element = item.element as HTMLElement

      // 确保元素有 position: relative
      element.classList.add("gh-has-inline-bookmark")

      // 创建图标容器
      const iconWrapper = document.createElement("span")
      iconWrapper.className = ICON_CLASS

      // 生成签名和检查是否已收藏
      const signature = this.outlineManager.getSignature(item, idx)
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
        this.handleBookmarkClick(item, signature, iconWrapper) // Removed iconWrapper from arguments in definition below, wait, no, actually I'll use it for optimistic update? No, let's keep it simple.
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

    // UI update is handled by updateAllIconStates subscription
  }

  /**
   * 更新所有图标状态（当 store 变化时）
   */
  updateAllIconStates() {
    const bookmarkStore = useBookmarkStore.getState()
    const sessionId = this.adapter.getSessionId()

    document.querySelectorAll(`.${ICON_CLASS}`).forEach((iconWrapper) => {
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
    document.getElementById("gh-inline-bookmark-styles")?.remove()
    document.querySelectorAll(`.${ICON_CLASS}`).forEach((el) => el.remove())
    document.querySelectorAll(".gh-has-inline-bookmark").forEach((el) => {
      el.classList.remove("gh-has-inline-bookmark")
    })
    document.body.classList.remove(
      "gh-inline-bookmark-mode-always",
      "gh-inline-bookmark-mode-hover",
      "gh-inline-bookmark-mode-hidden",
    )
    this.injectedElements = new WeakSet()
  }
}
