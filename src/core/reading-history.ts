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
import {
  READING_HISTORY_RESTORE_TOKEN_ATTRIBUTE,
  READING_HISTORY_USER_NAVIGATION_EVENT,
} from "~utils/reading-history-navigation"
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
  private restoreAbortController: AbortController | null = null
  private restoreStateResetTimer: number | null = null
  private restoreToken: string | null = null
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
  async waitForHydration(
    timeoutMs = ReadingHistoryManager.HYDRATION_TIMEOUT_MS,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (useReadingHistoryStore.getState()._hasHydrated) {
      return true
    }
    if (signal?.aborted) return false

    return new Promise<boolean>((resolve) => {
      let resolved = false
      let timeoutId = 0

      const finish = (value: boolean) => {
        if (resolved) return
        resolved = true
        window.clearTimeout(timeoutId)
        unsubscribe()
        signal?.removeEventListener("abort", handleAbort)
        resolve(value)
      }

      const unsubscribe = useReadingHistoryStore.subscribe((state) => {
        if (state._hasHydrated) {
          finish(true)
        }
      })
      const handleAbort = () => finish(false)
      signal?.addEventListener("abort", handleAbort, { once: true })
      if (signal?.aborted) {
        handleAbort()
        return
      }

      timeoutId = window.setTimeout(() => {
        useReadingHistoryStore.setState({ _hasHydrated: true })
        finish(false)
      }, timeoutMs)
    })
  }

  updateSettings(settings: Settings["readingHistory"]) {
    this.settings = settings
    if (!this.settings.persistence) {
      this.stopRecording()
      return
    }

    if (!this.settings.autoRestore) {
      this.cancelRestore()
    }
    this.startRecording()
  }

  startRecording(options: { initialCooldownMs?: number } = {}) {
    if (!this.settings.persistence || this.isRecording) return
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

    // 默认保留 2 秒冷却期，防止 SPA 切换时的站点自动滚动被误记录。
    // 用户主动接管恢复时传入 0，确保随后的新位置可以立即保存。
    const initialCooldownMs = options.initialCooldownMs ?? 2000
    this.ignoreScrollUntil = initialCooldownMs > 0 ? Date.now() + initialCooldownMs : 0

    this.startUserInteractionTracking()

    window.addEventListener("scroll", this.scrollHandler, {
      capture: true,
      passive: true,
    })

    // 监听页面可见性变化和卸载，确保离开前保存
    window.addEventListener("visibilitychange", this.scrollHandler)
    window.addEventListener("beforeunload", this.scrollHandler)
  }

  stopRecording() {
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

    // 即使记录已停止，SPA 切换期间仍可能存在独立运行的恢复任务。
    this.stopUserInteractionTracking()
    this.cancelRestore()
  }

  private startUserInteractionTracking() {
    if (this.userInteractionHandler) return

    this.userInteractionHandler = (event: Event) => {
      const isExplicitNavigation = event.type === READING_HISTORY_USER_NAVIGATION_EVENT

      // loadHistoryUntil 会派发合成 wheel 事件来触发懒加载，不能把它当作用户输入。
      if (!isExplicitNavigation && !event.isTrusted) return

      if (event.type === "keydown") {
        const source = event.composedPath?.()?.[0]
        if (
          source instanceof HTMLElement &&
          (source.isContentEditable || source.matches("input, textarea, select"))
        ) {
          return
        }

        const scrollKeys = new Set([
          "ArrowUp",
          "ArrowDown",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
          "Spacebar",
        ])
        if (!scrollKeys.has((event as KeyboardEvent).key)) return
      }

      // Ophel 面板内部操作不会改变正文位置，不应中断恢复。不能把所有 Shadow DOM
      // 都视为 Ophel：Gemini Enterprise 等站点的正文也运行在第三方 Shadow Root 中。
      // 大纲等正文导航会通过 READING_HISTORY_USER_NAVIGATION_EVENT 显式表达用户意图。
      if (!isExplicitNavigation) {
        const path = event.composedPath?.() || []
        const isInsideOphelPanel = path.some(
          (target) =>
            target instanceof HTMLElement &&
            (target.matches("plasmo-csui, #ophel-userscript-root") ||
              target.classList.contains("gh-root")),
        )
        if (isInsideOphelPanel) return
      }

      this.ignoreScrollUntil = 0
      this.lastSaveTime = 0
      this.cancelRestore()
      this.startRecording({ initialCooldownMs: 0 })
    }

    window.addEventListener("pointerdown", this.userInteractionHandler, {
      capture: true,
      passive: true,
    })
    window.addEventListener("wheel", this.userInteractionHandler, {
      capture: true,
      passive: true,
    })
    window.addEventListener("touchmove", this.userInteractionHandler, {
      capture: true,
      passive: true,
    })
    window.addEventListener("keydown", this.userInteractionHandler, {
      capture: true,
      passive: true,
    })
    window.addEventListener(READING_HISTORY_USER_NAVIGATION_EVENT, this.userInteractionHandler)
  }

  private stopUserInteractionTracking() {
    if (!this.userInteractionHandler) return

    window.removeEventListener("pointerdown", this.userInteractionHandler, true)
    window.removeEventListener("wheel", this.userInteractionHandler, true)
    window.removeEventListener("touchmove", this.userInteractionHandler, true)
    window.removeEventListener("keydown", this.userInteractionHandler, true)
    window.removeEventListener(READING_HISTORY_USER_NAVIGATION_EVENT, this.userInteractionHandler)
    this.userInteractionHandler = null
  }

  private cancelRestore() {
    this.restoreAbortController?.abort()
    this.restoreAbortController = null
    this.clearRestoreToken()

    if (this.restoreStateResetTimer !== null) {
      window.clearTimeout(this.restoreStateResetTimer)
      this.restoreStateResetTimer = null
    }

    this.isRestoring = false
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
      if (this.saveProgress()) {
        this.lastSaveTime = now
      }
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

  private canUseCurrentSession(sessionId = this.getSessionId()): boolean {
    return !!sessionId && this.adapter.isUserConversationPage()
  }

  private lockCurrentSessionId(sessionId: string) {
    if (!sessionId) return
    if (!this.currentSessionId) {
      this.currentSessionId = sessionId
    }
  }

  private createRestoreToken(): string {
    return typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  private setRestoreToken(token: string) {
    this.restoreToken = token
    document.documentElement.setAttribute(READING_HISTORY_RESTORE_TOKEN_ATTRIBUTE, token)
  }

  private clearRestoreToken() {
    if (
      this.restoreToken &&
      document.documentElement.getAttribute(READING_HISTORY_RESTORE_TOKEN_ATTRIBUTE) ===
        this.restoreToken
    ) {
      document.documentElement.removeAttribute(READING_HISTORY_RESTORE_TOKEN_ATTRIBUTE)
    }
    this.restoreToken = null
  }

  private waitForAbortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.resolve()

    return new Promise((resolve) => {
      let timeoutId = 0
      const finish = () => {
        window.clearTimeout(timeoutId)
        signal?.removeEventListener("abort", finish)
        resolve()
      }

      timeoutId = window.setTimeout(finish, delayMs)
      signal?.addEventListener("abort", finish, { once: true })
      if (signal?.aborted) finish()
    })
  }

  private async waitForReadySessionId(
    timeoutMs = ReadingHistoryManager.SESSION_READY_TIMEOUT_MS,
    signal?: AbortSignal,
  ): Promise<string> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() <= deadline && !signal?.aborted) {
      const sessionId = this.getSessionId()
      if (this.canUseCurrentSession(sessionId)) {
        return sessionId
      }

      await this.waitForAbortableDelay(ReadingHistoryManager.SESSION_READY_POLL_MS, signal)
    }

    if (signal?.aborted) return ""

    const sessionId = this.getSessionId()
    if (this.canUseCurrentSession(sessionId)) {
      return sessionId
    }

    return ""
  }

  private saveProgress(): boolean {
    if (!this.isRecording || this.isRestoring) return false
    const sessionId = this.getSessionId()
    // 检查会话一致性：如果当前 URL 的会话 ID 与记录时不一致，说明发生了切换但还没重置
    if (this.currentSessionId && sessionId && sessionId !== this.currentSessionId) {
      return false
    }
    if (Date.now() < this.ignoreScrollUntil) {
      return false
    }
    if (!this.canUseCurrentSession(sessionId)) {
      return false
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
          return false
        }
      } else {
        return false
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
    return true
  }

  async restoreProgress(
    onProgress?: (msg: string) => void,
    options: { delayMs?: number } = {},
  ): Promise<boolean> {
    if (!this.settings.persistence || !this.settings.autoRestore) {
      return false
    }

    this.cancelRestore()
    const restoreController = new AbortController()
    const restoreToken = this.createRestoreToken()
    this.restoreAbortController = restoreController
    this.setRestoreToken(restoreToken)
    this.isRestoring = true
    this.startUserInteractionTracking()

    this.restoredTop = undefined
    let restoredSuccessfully = false

    try {
      if (options.delayMs && options.delayMs > 0) {
        await this.waitForAbortableDelay(options.delayMs, restoreController.signal)
        if (restoreController.signal.aborted) return false
      }

      await this.waitForHydration(
        ReadingHistoryManager.HYDRATION_TIMEOUT_MS,
        restoreController.signal,
      )
      if (restoreController.signal.aborted) return false

      const sessionId = await this.waitForReadySessionId(
        ReadingHistoryManager.SESSION_READY_TIMEOUT_MS,
        restoreController.signal,
      )
      if (!sessionId || restoreController.signal.aborted) {
        return false
      }

      this.lockCurrentSessionId(sessionId)

      const key = this.getKey(sessionId)
      const data = getReadingHistoryStore().getPosition(key)

      if (!data) {
        return false
      }

      // 1. 精确恢复：尝试通过内容锚点定位
      if (data.type && this.adapter.restoreScroll) {
        try {
          const contentRestored = await this.adapter.restoreScroll(data as any)
          if (restoreController.signal.aborted) return false

          if (contentRestored) {
            const scrollContainer = this.adapter.getScrollContainer() || document.documentElement
            this.restoredTop = (scrollContainer as HTMLElement).scrollTop || window.scrollY
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
          const result = await loadHistoryUntil({
            adapter: this.adapter,
            loadAll: true,
            preserveReadingHistoryRestore: true,
            restoreToken,
            signal: restoreController.signal,
            onProgress: (msg) => {
              onProgress?.(`${t("exportLoading")} ${msg}`)
            },
          })

          if (!result.success || restoreController.signal.aborted) {
            return false
          }

          const newScrollTop = data.top
          document.documentElement.dataset.ophelPositionLock = String(newScrollTop)

          await smartScrollTo(this.adapter, newScrollTop, {
            preservePositionLock: true,
            preserveReadingHistoryRestore: true,
            restoreToken,
            signal: restoreController.signal,
          })
          if (restoreController.signal.aborted) return false

          this.restoredTop = newScrollTop
          restoredSuccessfully = true
        } catch {
          return false
        }
      }

      return restoredSuccessfully
    } finally {
      if (this.restoreAbortController === restoreController) {
        this.restoreAbortController = null

        if (
          restoredSuccessfully &&
          !restoreController.signal.aborted &&
          this.restoredTop !== undefined
        ) {
          this.startPositionKeeper(this.restoredTop)
        } else {
          this.stopPositionKeeper()
        }

        this.restoreStateResetTimer = window.setTimeout(() => {
          this.isRestoring = false
          this.restoreStateResetTimer = null
        }, 1000)
      }
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
   * 用户交互（pointerdown/wheel/touchmove/keydown）会立即终止此锁定
   * 大纲跳转会显式发送导航事件，在滚动发生前释放锁定
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
        // 若恢复阶段根据平台实际落点修正了锁目标，Position Keeper 跟随最新值。
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
    }

    // 恢复可能在 Position Keeper 启动前被取消，此时也必须释放主世界锁。
    delete document.documentElement.dataset.ophelPositionLock
    delete document.documentElement.dataset.ophelPositionLockLastBlock
    this.clearRestoreToken()
  }
}
