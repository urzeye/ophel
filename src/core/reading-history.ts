/**
 * Reading History Manager
 *
 * 管理阅读进度的记录与恢复
 * 数据存储已迁移到 reading-history-store.ts
 */

import type { SiteAdapter } from "~adapters/base"
import {
  getReadingHistoryStore,
  useReadingHistoryStore,
  type ReadingPosition,
} from "~stores/reading-history-store"
import { loadHistoryUntil } from "~utils/history-loader"
import { t } from "~utils/i18n"
import { smartScrollTo } from "~utils/scroll-helper"
import type { Settings } from "~utils/storage"

// 重新导出类型供其他模块使用
export type { ReadingPosition }

export class ReadingHistoryManager {
  private adapter: SiteAdapter
  private settings: Settings["readingHistory"]

  private isRecording = false
  private isRestoring = false // 恢复过程中暂停记录
  private currentSessionId: string | null = null
  private listeningContainer: Element | null = null
  private scrollHandler: ((e: Event) => void) | null = null
  private userInteractionHandler: ((e: Event) => void) | null = null
  private lastSaveTime = 0
  private ignoreScrollUntil = 0 // 初始化冷却期
  private positionKeeperRaF = 0 // 位置保持器的动画帧 ID
  private keepPositionEndTime = 0 // 位置保持结束时间

  public restoredTop: number | undefined

  constructor(adapter: SiteAdapter, settings: Settings["readingHistory"]) {
    this.adapter = adapter
    this.settings = settings
  }

  /**
   * 等待 store hydration 完成
   */
  async waitForHydration() {
    if (!useReadingHistoryStore.getState()._hasHydrated) {
      await new Promise<void>((resolve) => {
        const unsubscribe = useReadingHistoryStore.subscribe((state) => {
          if (state._hasHydrated) {
            unsubscribe()
            resolve()
          }
        })
      })
    }
  }

  updateSettings(settings: Settings["readingHistory"]) {
    this.settings = settings
    if (!this.settings.persistence && this.isRecording) {
      this.stopRecording()
    } else if (this.settings.persistence && !this.isRecording) {
      this.startRecording()
    }
  }

  startRecording() {
    if (this.isRecording) return
    this.isRecording = true
    this.currentSessionId = this.adapter.getSessionId() // 锁定当前会话 ID

    this.scrollHandler = (e: Event) => this.handleScroll(e)

    const container = this.adapter.getScrollContainer()
    if (container) {
      container.addEventListener("scroll", this.scrollHandler, {
        passive: true,
      })
      this.listeningContainer = container
    }

    // 设置 2 秒冷却期，防止 SPA 切换时的自动滚动被误记录
    this.ignoreScrollUntil = Date.now() + 2000

    // 监听用户交互，一旦用户手动操作，立即取消冷却和位置锁定
    this.userInteractionHandler = (e: Event) => {
      // 对于 keydown 事件，只响应会导致滚动的按键
      if (e.type === "keydown") {
        const key = (e as KeyboardEvent).key
        const scrollKeys = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]
        if (!scrollKeys.includes(key)) return
      }

      if (this.ignoreScrollUntil > 0) {
        this.ignoreScrollUntil = 0
      }
      if (this.positionKeeperRaF) {
        this.stopPositionKeeper()
      }
    }
    window.addEventListener("wheel", this.userInteractionHandler, { passive: true })
    window.addEventListener("touchmove", this.userInteractionHandler, { passive: true })
    window.addEventListener("keydown", this.userInteractionHandler, { passive: true })

    window.addEventListener("scroll", this.scrollHandler, {
      capture: true,
      passive: true,
    })

    // 监听页面可见性变化和卸载，确保离开前保存
    window.addEventListener("visibilitychange", this.scrollHandler)
    window.addEventListener("beforeunload", this.scrollHandler)
  }

  stopRecording() {
    if (!this.isRecording) return
    this.isRecording = false

    if (this.scrollHandler) {
      if (this.listeningContainer) {
        this.listeningContainer.removeEventListener("scroll", this.scrollHandler)
        this.listeningContainer = null
      }
      window.removeEventListener("scroll", this.scrollHandler, {
        capture: true,
      })
      window.removeEventListener("visibilitychange", this.scrollHandler)
      window.removeEventListener("beforeunload", this.scrollHandler)
      this.scrollHandler = null
    }

    if (this.userInteractionHandler) {
      window.removeEventListener("wheel", this.userInteractionHandler)
      window.removeEventListener("touchmove", this.userInteractionHandler)
      window.removeEventListener("keydown", this.userInteractionHandler)
      this.userInteractionHandler = null
    }

    this.stopPositionKeeper()
  }

  restartRecording() {
    this.stopRecording()
    this.startRecording()
  }

  private handleScroll(e: Event) {
    if (!this.settings.persistence) return

    // 如果是滚动事件，过滤非主容器的滚动（例如侧边栏）
    if (e.type === "scroll") {
      const container = this.adapter.getScrollContainer()
      const target = e.target as HTMLElement | Document | Window
      // 如果有明确的主容器，且由于 capture=true 捕捉到了其他容器的滚动，则忽略
      if (container && target && target !== document && target !== window && target !== container) {
        return
      }
    }

    const now = Date.now()
    // 对于 beforeunload 和 visibilitychange，不进行节流，总是尝试操作（但在 saveProgress 内部会检查是否值得保存，这里主要是为了触发逻辑）
    // 实际上 saveProgress 没有节流 checks，只有 handleScroll 有。
    // 对于重要事件，绕过节流
    if (
      e.type === "beforeunload" ||
      e.type === "visibilitychange" ||
      now - this.lastSaveTime > 1000
    ) {
      this.saveProgress()
      this.lastSaveTime = now
    }
  }

  private getKey(): string {
    const sessionId = this.adapter.getSessionId() || "unknown"
    const siteId = this.adapter.getSiteId()
    return `${siteId}:${sessionId}`
  }

  private saveProgress() {
    if (!this.isRecording) return
    if (this.isRestoring) {
      return
    }
    // 检查会话一致性：如果当前 URL 的会话 ID 与记录时不一致，说明发生了切换但还没重置
    if (this.currentSessionId && this.adapter.getSessionId() !== this.currentSessionId) {
      return
    }
    if (Date.now() < this.ignoreScrollUntil) {
      return
    }
    if (this.adapter.isNewConversation()) {
      return
    }

    const container = this.adapter.getScrollContainer()
    const scrollTop = container ? container.scrollTop : window.scrollY

    if (scrollTop < 0) return

    const key = this.getKey()

    let anchorInfo = {}
    try {
      if (this.adapter.getVisibleAnchorElement) {
        anchorInfo = this.adapter.getVisibleAnchorElement() || {}
      }
    } catch {
      // 静默处理锚点获取错误
    }

    const data: ReadingPosition = {
      top: scrollTop,
      ts: Date.now(),
      ...anchorInfo,
    }

    getReadingHistoryStore().savePosition(key, data)
  }

  async restoreProgress(onProgress?: (msg: string) => void): Promise<boolean> {
    if (!this.settings.autoRestore) {
      return false
    }

    // 如果是新会话（无 ID），不进行恢复
    if (this.adapter.isNewConversation()) {
      return false
    }

    // 确保 store 已 hydrated
    await this.waitForHydration()

    const key = this.getKey()
    const data = getReadingHistoryStore().getPosition(key)

    if (!data) {
      return false
    }

    // 开始恢复，暂停记录
    this.isRestoring = true

    // 用于跟踪是否已通过精确恢复或 Fast Path 完成
    let restoredSuccessfully = false

    try {
      // 1. 精确恢复：尝试通过内容锚点定位
      if (data.type && this.adapter.restoreScroll) {
        try {
          const contentRestored = await this.adapter.restoreScroll(data as any)
          if (contentRestored) {
            const scrollContainer = this.adapter.getScrollContainer() || document.documentElement
            this.restoredTop = (scrollContainer as HTMLElement).scrollTop || window.scrollY
            restoredSuccessfully = true
          }
        } catch {
          // 精确恢复失败，继续尝试位置恢复
        }
      }

      if (!restoredSuccessfully) {
        if (data.top === undefined) {
          return false
        }

        try {
          // 加载所有历史
          const result = await loadHistoryUntil({
            adapter: this.adapter,
            loadAll: true,
            onProgress: (msg) => {
              onProgress?.(`${t("exportLoading")} ${msg}`)
            },
          })

          if (!result.success) {
            return false
          }

          // 计算新的滚动位置
          // 注意：无需加上 heightAdded，因为 savedTop 本身就是相对于完整内容（或当时加载的内容）的绝对坐标
          // 只有在"保持相对位置"（Anchor）且内容被挤下去时才需要修正，但这里我们是想"回到原来的绝对位置"
          const newScrollTop = data.top!

          // 滚动到目标位置
          await smartScrollTo(this.adapter, newScrollTop)
          this.restoredTop = newScrollTop
          restoredSuccessfully = true
        } catch {
          // 恢复失败
          return false
        }
      }

      return restoredSuccessfully
    } finally {
      // 延迟重置恢复标志，防止恢复过程中的滚动事件触发保存
      setTimeout(() => {
        this.isRestoring = false
        // 启动位置锁定保护：持续 3 秒强制保持位置，对抗 Gemini 的自动滚动
        if (this.restoredTop !== undefined) {
          this.startPositionKeeper(this.restoredTop, 3000)
        }
      }, 1000)
    }
  }

  // rawScroll 方法已删除 - 未被使用

  cleanup() {
    const days = this.settings.cleanupDays || 7
    getReadingHistoryStore().cleanup(days)
  }

  /**
   * 启动位置保持器 (Position Keeper)
   * 使用 requestAnimationFrame 持续强制锁定滚动位置，对抗页面的自动滚动
   * 用户交互会立即终止此锁定
   */
  private startPositionKeeper(targetTop: number, duration: number) {
    this.stopPositionKeeper()
    this.keepPositionEndTime = Date.now() + duration

    const keepOpen = () => {
      if (Date.now() > this.keepPositionEndTime) {
        this.stopPositionKeeper()
        return
      }

      const container = this.adapter.getScrollContainer()
      if (container) {
        // 只有当偏差较大时才强制修正，避免微小抖动
        if (Math.abs(container.scrollTop - targetTop) > 5) {
          container.scrollTop = targetTop
        }
      }

      this.positionKeeperRaF = requestAnimationFrame(keepOpen)
    }

    this.positionKeeperRaF = requestAnimationFrame(keepOpen)
  }

  private stopPositionKeeper() {
    if (this.positionKeeperRaF) {
      cancelAnimationFrame(this.positionKeeperRaF)
      this.positionKeeperRaF = 0
      this.keepPositionEndTime = 0
    }
  }
}
