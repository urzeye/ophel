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
  private static readonly HYDRATION_TIMEOUT_MS = 5000
  private static readonly SESSION_READY_TIMEOUT_MS = 3000
  private static readonly SESSION_READY_POLL_MS = 100

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

  public restoredTop: number | undefined

  constructor(adapter: SiteAdapter, settings: Settings["readingHistory"]) {
    this.adapter = adapter
    this.settings = settings
  }

  /**
   * 等待 store hydration 完成
   */
  async waitForHydration(timeoutMs = ReadingHistoryManager.HYDRATION_TIMEOUT_MS): Promise<boolean> {
    if (useReadingHistoryStore.getState()._hasHydrated) {
      return true
    }

    return new Promise<boolean>((resolve) => {
      let resolved = false
      let timeoutId = 0

      const finish = (value: boolean) => {
        if (resolved) return
        resolved = true
        window.clearTimeout(timeoutId)
        unsubscribe()
        resolve(value)
      }

      const unsubscribe = useReadingHistoryStore.subscribe((state) => {
        if (state._hasHydrated) {
          finish(true)
        }
      })

      timeoutId = window.setTimeout(() => {
        useReadingHistoryStore.setState({ _hasHydrated: true })
        finish(false)
      }, timeoutMs)
    })
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
    this.currentSessionId = null

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

    // 监听用户交互，一旦用户手动滚动，立即取消冷却和位置锁定
    // 注意：不监听 pointerdown，因为点击大纲等 UI 操作不应中断 Position Keeper
    // 大纲点击通过同步更新 DOM 属性的方式与 Position Keeper 协作
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
    this.currentSessionId = null

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

  private getKey(sessionId = this.getSessionId()): string {
    const normalizedSessionId = sessionId || "unknown"
    const siteId = this.adapter.getSiteId()
    return `${siteId}:${normalizedSessionId}`
  }

  private getSessionId(): string {
    return this.adapter.getSessionId()?.trim() || ""
  }

  private lockCurrentSessionId(sessionId: string) {
    if (!sessionId) return
    if (!this.currentSessionId) {
      this.currentSessionId = sessionId
    }
  }

  private async waitForReadySessionId(
    timeoutMs = ReadingHistoryManager.SESSION_READY_TIMEOUT_MS,
  ): Promise<string> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() <= deadline) {
      const sessionId = this.getSessionId()
      if (sessionId && !this.adapter.isNewConversation()) {
        return sessionId
      }

      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, ReadingHistoryManager.SESSION_READY_POLL_MS),
      )
    }

    const sessionId = this.getSessionId()
    if (sessionId && !this.adapter.isNewConversation()) {
      return sessionId
    }

    return ""
  }

  private saveProgress() {
    if (!this.isRecording) return
    if (this.isRestoring) {
      return
    }
    const sessionId = this.getSessionId()
    // 检查会话一致性：如果当前 URL 的会话 ID 与记录时不一致，说明发生了切换但还没重置
    if (this.currentSessionId && sessionId && sessionId !== this.currentSessionId) {
      return
    }
    if (Date.now() < this.ignoreScrollUntil) {
      return
    }
    if (!sessionId || this.adapter.isNewConversation()) {
      return
    }

    this.lockCurrentSessionId(sessionId)

    const container = this.adapter.getScrollContainer()
    const scrollTop = container ? container.scrollTop : window.scrollY

    // 注意：Mac 等设备可能有弹性滚动（Overscroll）导致 scrollTop 为负数，故默认忽略小于 0 的值。
    // 但是！对于豆包这种 column-reverse 容器，其正常的往上滚动坐标就是负数。
    if (scrollTop < 0) {
      if (container) {
        const style = window.getComputedStyle(container)
        if (style.flexDirection !== "column-reverse") {
          return
        }
      } else {
        return
      }
    }

    const key = this.getKey(sessionId)

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

    // 确保 store 已 hydrated
    await this.waitForHydration()

    const sessionId = await this.waitForReadySessionId()
    if (!sessionId) {
      return false
    }

    this.lockCurrentSessionId(sessionId)

    const key = this.getKey(sessionId)
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
            // 同步设置 DOM 属性，主世界立即可见，拦截平台自动滚动
            document.documentElement.dataset.ophelPositionLock = String(this.restoredTop)
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

          // 同步设置 DOM 属性，主世界立即可见，拦截平台自动滚动
          document.documentElement.dataset.ophelPositionLock = String(newScrollTop)

          // 滚动到目标位置（content script 的 scrollTo 走原始原型链，不受主世界劫持影响）
          await smartScrollTo(this.adapter, newScrollTop)
          this.restoredTop = newScrollTop
          restoredSuccessfully = true
        } catch {
          // 恢复失败，清除位置锁
          delete document.documentElement.dataset.ophelPositionLock
          return false
        }
      }

      return restoredSuccessfully
    } finally {
      // 立即启动位置保持器（无延迟），对抗平台自动滚动
      if (restoredSuccessfully && this.restoredTop !== undefined) {
        this.startPositionKeeper(this.restoredTop)
      }
      // 延迟重置恢复标志，防止恢复过程中的滚动事件触发保存
      setTimeout(() => {
        this.isRestoring = false
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
   * 用户交互（wheel/touchmove/keydown）会立即终止此锁定
   * 不监听 pointerdown，以避免点击大纲等操作时误中断锁定
   *
   * 自适应超时策略：
   * - 最短保持 minHoldMs（2秒）
   * - 主世界每次拦截滚动时更新 lastBlock 时间戳（DOM 属性）
   * - 当无拦截超过 quietMs（2秒）后释放
   * - 最长不超过 maxHoldMs（15秒）
   */
  private startPositionKeeper(targetTop: number) {
    this.stopPositionKeeper()

    const startTime = Date.now()
    const minHoldMs = 2000
    const quietMs = 2000
    const maxHoldMs = 15000

    // 在主世界启用精确位置锁，拦截所有偏离 targetTop 的滚动（scrollTop/scrollTo/scrollIntoView 等）
    // 使用 DOM 属性实现同步跨世界通信，避免 postMessage 的异步竞态
    document.documentElement.dataset.ophelPositionLock = String(targetTop)
    // 初始化拦截时间戳，确保无拦截场景下不会锁到 maxHoldMs
    document.documentElement.dataset.ophelPositionLockLastBlock = String(startTime)

    const keepOpen = () => {
      const now = Date.now()
      const elapsed = now - startTime

      // 硬上限：最长保持 15 秒
      if (elapsed > maxHoldMs) {
        this.stopPositionKeeper()
        return
      }

      // 自适应释放：至少保持 2 秒后，若主世界无拦截超过 2 秒则释放
      if (elapsed > minHoldMs) {
        const lastBlock = Number(document.documentElement.dataset.ophelPositionLockLastBlock || "0")
        if (lastBlock > 0 && now - lastBlock > quietMs) {
          this.stopPositionKeeper()
          return
        }
      }

      const container = this.adapter.getScrollContainer()
      if (container) {
        // 检查 DOM 属性是否被外部更新（如大纲点击后同步更新了锁目标）
        const currentLockStr = document.documentElement.dataset.ophelPositionLock
        if (currentLockStr !== undefined) {
          const currentLock = Number(currentLockStr)
          if (!isNaN(currentLock) && Math.abs(currentLock - targetTop) > 5) {
            targetTop = currentLock
          }
        }

        // Content Script 的 scrollTop setter 走原始原型链，不受主世界劫持影响
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
      // 释放精确位置锁及清理拦截时间戳
      delete document.documentElement.dataset.ophelPositionLock
      delete document.documentElement.dataset.ophelPositionLockLastBlock
    }
  }
}
