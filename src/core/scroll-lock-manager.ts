/**
 * 滚动锁定管理器
 *
 * 功能：当功能开启时，阻止页面自动滚动到底部，方便用户阅读上文。
 *
 * 核心策略：
 * 1. 主世界脚本（scroll-lock-main.ts）负责 API 劫持
 * 2. 本管理器通过 postMessage 控制主世界脚本的启用/禁用
 * 3. 使用 MutationObserver + 定时器作为回滚保底机制
 */

import type { SiteAdapter } from "~adapters/base"
import type { Settings } from "~utils/storage"

export class ScrollLockManager {
  private adapter: SiteAdapter
  private settings: Settings
  private enabled = false

  // 回滚机制相关
  private observer: MutationObserver | null = null
  private cleanupInterval: ReturnType<typeof setInterval> | null = null
  private onScrollHandler: (() => void) | null = null
  private lastScrollTop = 0

  constructor(adapter: SiteAdapter, settings: Settings) {
    this.adapter = adapter
    this.settings = settings
    this.init()
  }

  updateSettings(settings: Settings) {
    const wasEnabled = this.settings.preventAutoScroll
    this.settings = settings

    // 动态开关支持
    if (!wasEnabled && settings.preventAutoScroll) {
      this.enable()
    } else if (wasEnabled && !settings.preventAutoScroll) {
      this.disable()
    }
  }

  private init() {
    if (!this.settings.preventAutoScroll) {
      return
    }

    this.enable()
  }

  private enable() {
    if (this.enabled) return
    this.enabled = true

    // 1. 通知主世界脚本启用 API 劫持
    this.toggleMainWorldHijack(true)

    // 2. 启动 scroll 事件监听器
    this.startScrollListener()

    // 3. 启动 MutationObserver 回滚机制
    this.startObserver()
  }

  private disable() {
    if (!this.enabled) return
    this.enabled = false

    // 通知主世界脚本禁用 API 劫持
    this.toggleMainWorldHijack(false)

    // 停止各种监听器
    this.stopScrollListener()
    this.stopObserver()
  }

  stop() {
    this.disable()
  }

  /**
   * 通过 postMessage 通知主世界脚本启用/禁用 API 劫持
   */
  private toggleMainWorldHijack(enabled: boolean) {
    window.postMessage({ type: "CHAT_HELPER_SCROLL_LOCK_TOGGLE", enabled }, "*")
  }

  /**
   * 获取滚动容器
   */
  private getScrollContainer(): HTMLElement | null {
    return this.adapter.getScrollContainer()
  }

  /**
   * 启动 scroll 事件监听器
   * 记录用户最后滚动位置，用于自动修正
   */
  private startScrollListener() {
    const container = this.getScrollContainer()
    if (container) {
      this.lastScrollTop = container.scrollTop
    }

    const onScroll = () => {
      if (this.enabled) {
        const container = this.getScrollContainer()
        if (container) {
          // 记录当前位置作为"合法"位置
          this.lastScrollTop = container.scrollTop
        }
      }
    }

    // 监听滚动容器的滚动事件
    const scrollContainer = this.getScrollContainer()
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", onScroll, { passive: true })
    }
    // 同时监听 window 滚动
    window.addEventListener("scroll", onScroll, { passive: true })
    this.onScrollHandler = onScroll
  }

  /**
   * 停止 scroll 事件监听器
   */
  private stopScrollListener() {
    if (this.onScrollHandler) {
      const scrollContainer = this.getScrollContainer()
      if (scrollContainer) {
        scrollContainer.removeEventListener("scroll", this.onScrollHandler)
      }
      window.removeEventListener("scroll", this.onScrollHandler)
      this.onScrollHandler = null
    }
  }

  /**
   * 启动 MutationObserver
   * 监听 DOM 变化，如果发现非用户意图的滚动跳变，强制回滚
   */
  private startObserver() {
    const contentSelectors = this.adapter.getChatContentSelectors()

    this.observer = new MutationObserver((mutations) => {
      if (!this.enabled) return

      let hasNewContent = false

      // 检测是否有新内容
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              const element = node as Element
              // 使用适配器提供的选择器判断
              for (const sel of contentSelectors) {
                if (
                  (element.matches && element.matches(sel)) ||
                  (element.querySelector && element.querySelector(sel))
                ) {
                  hasNewContent = true
                  break
                }
              }
            }
            if (hasNewContent) break
          }
        }
        if (hasNewContent) break
      }

      if (hasNewContent) {
        // 如果有新内容插入，立刻检查滚动位置是否发生了非预期的改变
        const container = this.getScrollContainer()
        if (container) {
          const currentScroll = container.scrollTop
          // 阈值 100px
          if (currentScroll > this.lastScrollTop + 100) {
            container.scrollTop = this.lastScrollTop
          }
        }
      }
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    // 定时器保底：周期性检查滚动位置
    this.cleanupInterval = setInterval(() => {
      if (this.enabled) {
        const container = this.getScrollContainer()
        if (container) {
          const current = container.scrollTop
          if (current > this.lastScrollTop + 200) {
            // 大幅跳变，回滚
            container.scrollTop = this.lastScrollTop
          } else {
            // 小幅变动，认为是合法阅读，更新基准
            this.lastScrollTop = current
          }
        }
      }
    }, 500)
  }

  /**
   * 停止 MutationObserver
   */
  private stopObserver() {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}
