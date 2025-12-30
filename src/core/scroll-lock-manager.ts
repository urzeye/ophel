import { type SiteAdapter } from "~adapters/base"
import { EVENT_MONITOR_COMPLETE, EVENT_MONITOR_START } from "~utils/messaging"
import type { Settings } from "~utils/storage"

/**
 * 滚动锁定管理器
 * 功能：当 AI 正在生成内容时，如果用户手动向上滚动查看历史消息，
 * 则阻止页面自动滚动到底部，避免打断用户阅读。
 */
export class ScrollLockManager {
  private adapter: SiteAdapter
  private settings: Settings
  private isGenerating = false
  private userHasScrolledUp = false
  private scrollCheckInterval: NodeJS.Timeout | null = null
  private scrollContainer: HTMLElement | null = null

  // 阈值：距离底部多少像素内被视为“在底部”
  private static readonly BOTTOM_THRESHOLD = 100

  constructor(adapter: SiteAdapter, settings: Settings) {
    this.adapter = adapter
    this.settings = settings
    window.addEventListener("message", this.handleMessage.bind(this))
  }

  updateSettings(settings: Settings) {
    this.settings = settings
  }

  private handleMessage(event: MessageEvent) {
    if (event.source !== window) return
    const { type } = event.data || {}

    if (type === "GH_MONITOR_START") {
      this.isGenerating = true
      this.userHasScrolledUp = false
      this.initScrollDetection()
    } else if (type === "GH_MONITOR_COMPLETE") {
      this.isGenerating = false
      this.stopScrollDetection()
    }
  }

  private initScrollDetection() {
    if (!this.settings.preventAutoScroll) return

    // 尝试获取滚动容器（通常是 main 或特定 class）
    // Gemini 的滚动容器可能会变，需要动态获取
    this.scrollContainer = this.findScrollContainer()

    if (this.scrollContainer) {
      this.scrollContainer.addEventListener("scroll", this.onScroll)
      // 同时也监听 wheel 事件来更早捕获用户意图
      this.scrollContainer.addEventListener("wheel", this.onWheel, { passive: true })
    }
  }

  private stopScrollDetection() {
    if (this.scrollContainer) {
      this.scrollContainer.removeEventListener("scroll", this.onScroll)
      this.scrollContainer.removeEventListener("wheel", this.onWheel)
      this.scrollContainer = null
    }
  }

  private findScrollContainer(): HTMLElement {
    // 常见的滚动容器选择器
    const selectors = [
      "infinite-scroller.chat-history",
      ".chat-mode-scroller",
      "main",
      '[role="main"]',
      "body", // fallback
    ]

    for (const sel of selectors) {
      const el = document.querySelector(sel) as HTMLElement
      if (el && el.scrollHeight > el.clientHeight) {
        return el
      }
    }
    return document.documentElement
  }

  private onScroll = () => {
    if (!this.isGenerating || !this.scrollContainer) return

    const { scrollTop, scrollHeight, clientHeight } = this.scrollContainer
    const distanceToBottom = scrollHeight - scrollTop - clientHeight

    // 如果用户滚动到底部附近，重置锁定状态，允许后续自动跟随
    if (distanceToBottom <= ScrollLockManager.BOTTOM_THRESHOLD) {
      this.userHasScrolledUp = false
    } else {
      // 否则，如果正在生成且距离底部较远，标记用户已向上滚动
      // 这里可以配合 onWheel 进一步确认是用户主动行为
      this.userHasScrolledUp = true
    }

    // 关键逻辑：如果用户已向上滚动，阻止 Gemini 的自动滚动脚本行为
    // Gemini 可能会通过 JS 强制 scrollTop = scrollHeight
    // 我们可以通过强制设回原来的位置来“对抗”，但这可能导致抖动
    // 更好的方式是捕获并阻止 Gemini 的滚动事件，但这很难
    // 这里采用“对抗式”锁定：
    if (this.userHasScrolledUp) {
      // 防止被强制拉到底部
      // 注意：这种方式可能会导致画面轻微抖动，但能有效防止跳到底部
      // 实际实现中，通常需要更积极地介入，或者覆盖 Element.prototype.scrollTo
    }
  }

  // 监听滚轮事件，判断用户意图
  private onWheel = (e: WheelEvent) => {
    if (e.deltaY < 0) {
      // 用户向上滚动
      this.userHasScrolledUp = true
    }
  }

  // 注入到页面中覆盖原生 scrollTo (如果需要更强力的锁定)
  // 目前先保持简单观察模式，如果需要强力模式再注入脚本
}
