/**
 * History Loader - 统一的懒加载历史工具
 *
 * 用于加载 Gemini 对话的懒加载历史内容
 * 供"去顶部"和"阅读记录恢复"功能复用
 */

import type { SiteAdapter } from "~adapters/base"
import { getScrollInfo, isFlutterProxy, smartScrollToTop } from "~utils/scroll-helper"

// ==================== 类型定义 ====================

export interface LoadHistoryOptions {
  /** 站点适配器 */
  adapter: SiteAdapter | null
  /** 加载到目标高度就停止（用于阅读恢复） */
  targetHeight?: number
  /** 加载所有历史（用于去顶部） */
  loadAll?: boolean
  /** 进度回调 */
  onProgress?: (msg: string) => void
  /** 中断信号 */
  signal?: AbortSignal
  /** 内部自动恢复调用保留当前恢复事务；用户主动调用保持默认 false */
  preserveReadingHistoryRestore?: boolean
  /** 跨世界校验当前恢复事务，阻止取消后迟到的主世界滚动 */
  restoreToken?: string
  /** 允许短对话短路（仅用户主动点击时启用） */
  allowShortCircuit?: boolean
}

export interface LoadHistoryResult {
  /** 是否成功完成（非中断） */
  success: boolean
  /** 加载后的最终高度 */
  finalHeight: number
  /** 加载前后高度差 */
  heightAdded: number
  /** 加载前的滚动位置 */
  previousScrollTop: number
  /** 是否处于 Flutter 模式 */
  isFlutterMode: boolean
  /** 是否静默完成（短会话） */
  silent: boolean
}

export interface LoadCompleteHistoryForExportOptions {
  adapter: SiteAdapter | null
  getSignature: (container: HTMLElement) => string
  waitMs?: number
  maxRounds?: number
  stableRounds?: number
  wheelDeltaY?: number
}

export interface LoadCompleteHistoryForExportResult {
  success: boolean
  rounds: number
  stableRounds: number
  finalHeight: number
  finalSignature: string
}

// ==================== 配置常量 ====================

const CONFIG = {
  /** 每轮等待时间（毫秒，与 demo.js 一致） */
  WAIT_MS: 1200,
  /** 连续无变化多少轮后认为加载完成（减少等待时间） */
  MAX_NO_CHANGE_ROUNDS: 2,
  /** 初始内容未就绪时的最大等待轮次（约 12 秒） */
  MAX_INITIAL_WAIT_ROUNDS: 10,
  /** 最大加载轮次（超时保护） */
  MAX_TOTAL_ROUNDS: 50,
}

function getTopScrollPosition(adapter: SiteAdapter | null, container: HTMLElement): number {
  const isReverse =
    adapter?.getSiteId() === "doubao" &&
    typeof window !== "undefined" &&
    window.getComputedStyle(container).flexDirection === "column-reverse"

  return isReverse ? Math.min(0, container.clientHeight - container.scrollHeight) : 0
}

// ==================== 核心函数 ====================

/**
 * 加载懒加载历史内容，直到满足条件
 *
 * @param options 加载选项
 * @returns 加载结果
 */
export async function loadHistoryUntil(options: LoadHistoryOptions): Promise<LoadHistoryResult> {
  const {
    adapter,
    targetHeight,
    loadAll: _loadAll = false,
    onProgress,
    signal,
    preserveReadingHistoryRestore = false,
    restoreToken,
    allowShortCircuit = false,
  } = options

  // 获取初始滚动信息并滚动到顶部
  let { previousScrollTop, container } = await smartScrollToTop(adapter, {
    preserveReadingHistoryRestore,
    restoreToken,
    signal,
  })

  // 检测 Flutter 模式
  const isFlutterMode = isFlutterProxy(container)

  // Flutter 模式下，滚动已由 Main World 处理，直接返回
  if (isFlutterMode) {
    const info = await getScrollInfo(adapter)
    return {
      success: true,
      finalHeight: info.scrollHeight,
      heightAdded: 0,
      previousScrollTop,
      isFlutterMode: true,
      silent: true,
    }
  }

  // 获取滚动到顶部后的当前高度（重要：不是之前的高度）
  let initialHeight = container.scrollHeight
  let lastHeight = initialHeight
  let noChangeCount = 0
  let loopCount = 0

  // 加载循环
  while (true) {
    // 检查中断信号
    if (signal?.aborted) {
      return {
        success: false,
        finalHeight: container.scrollHeight,
        heightAdded: container.scrollHeight - initialHeight,
        previousScrollTop,
        isFlutterMode: false,
        silent: false,
      }
    }

    loopCount++

    // 超时保护
    if (loopCount >= CONFIG.MAX_TOTAL_ROUNDS) {
      return {
        success: true,
        finalHeight: container.scrollHeight,
        heightAdded: container.scrollHeight - initialHeight,
        previousScrollTop,
        isFlutterMode: false,
        silent: false,
      }
    }

    // 强制保持在顶部并派发 WheelEvent 触发懒加载
    container.scrollTop = getTopScrollPosition(adapter, container)
    container.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true }))

    // 等待懒加载触发
    await sleep(CONFIG.WAIT_MS, signal)

    // 再次检查中断
    if (signal?.aborted) {
      return {
        success: false,
        finalHeight: container.scrollHeight,
        heightAdded: container.scrollHeight - initialHeight,
        previousScrollTop,
        isFlutterMode: false,
        silent: false,
      }
    }

    // 尝试刷新容器引用
    if (adapter && (container.tagName === "HTML" || container.tagName === "BODY")) {
      const newContainer = adapter.getScrollContainer()
      if (
        newContainer &&
        newContainer !== container &&
        newContainer.tagName !== "HTML" &&
        newContainer.tagName !== "BODY"
      ) {
        container = newContainer
        // 重新初始化高度基准
        initialHeight = container.scrollHeight
        lastHeight = container.scrollHeight
        // 重新滚动到顶部
        container.scrollTop = getTopScrollPosition(adapter, container)
      }
    }

    // 检查高度变化
    const currentHeight = container.scrollHeight

    // 检查是否达到目标高度（用于阅读恢复）
    if (targetHeight !== undefined && currentHeight >= targetHeight) {
      return {
        success: true,
        finalHeight: currentHeight,
        heightAdded: currentHeight - initialHeight,
        previousScrollTop,
        isFlutterMode: false,
        silent: false,
      }
    }

    if (currentHeight > lastHeight) {
      // 高度增加，继续加载
      lastHeight = currentHeight
      noChangeCount = 0
      onProgress?.(`${Math.round(currentHeight / 1000)}k`)
    } else {
      noChangeCount++

      // 快速完成检查
      const isContentReady = container.scrollHeight > container.clientHeight + 100
      const isFirstRoundNoChange = loopCount === 1 && currentHeight === initialHeight

      // 用户主动点击去顶部时：首轮无变化 = 没有更多历史可加载，直接结束
      if (isFirstRoundNoChange && allowShortCircuit) {
        return {
          success: true,
          finalHeight: currentHeight,
          heightAdded: 0,
          previousScrollTop,
          isFlutterMode: false,
          silent: true,
        }
      }

      // 阅读恢复场景：首轮无变化且内容已就绪
      if (isFirstRoundNoChange && isContentReady) {
        return {
          success: true,
          finalHeight: currentHeight,
          heightAdded: 0,
          previousScrollTop,
          isFlutterMode: false,
          silent: true,
        }
      }

      // 动态调整最大等待轮次：如果内容未就绪，多等几轮
      const maxNoChangeRounds = isContentReady
        ? CONFIG.MAX_NO_CHANGE_ROUNDS
        : CONFIG.MAX_INITIAL_WAIT_ROUNDS

      if (noChangeCount >= maxNoChangeRounds) {
        // 加载完成
        return {
          success: true,
          finalHeight: currentHeight,
          heightAdded: currentHeight - initialHeight,
          previousScrollTop,
          isFlutterMode: false,
          silent: false,
        }
      }
    }
  }
}

export async function loadCompleteHistoryForExport(
  options: LoadCompleteHistoryForExportOptions,
): Promise<LoadCompleteHistoryForExportResult> {
  const {
    adapter,
    getSignature,
    waitMs = 800,
    maxRounds = 60,
    stableRounds = 4,
    wheelDeltaY = -800,
  } = options

  let container = adapter?.getScrollContainer() || null
  if (!container) {
    return {
      success: false,
      rounds: 0,
      stableRounds: 0,
      finalHeight: 0,
      finalSignature: "",
    }
  }

  if (container.scrollHeight <= container.clientHeight + 5) {
    return {
      success: true,
      rounds: 0,
      stableRounds: 0,
      finalHeight: container.scrollHeight,
      finalSignature: getSignature(container),
    }
  }

  let lastSignature = ""
  let stableCount = 0
  let finalSignature = ""

  for (let round = 0; round < maxRounds; round++) {
    const refreshedContainer = adapter?.getScrollContainer()
    if (refreshedContainer) {
      container = refreshedContainer
    }

    scrollLazyHistoryContainerToTop(container, wheelDeltaY)
    await sleep(waitMs)

    const settledContainer = adapter?.getScrollContainer()
    if (settledContainer) {
      container = settledContainer
    }

    finalSignature = getSignature(container)
    if (finalSignature === lastSignature) {
      stableCount++
    } else {
      lastSignature = finalSignature
      stableCount = 0
    }

    if (stableCount >= stableRounds) {
      return {
        success: true,
        rounds: round + 1,
        stableRounds: stableCount,
        finalHeight: container.scrollHeight,
        finalSignature,
      }
    }
  }

  return {
    success: false,
    rounds: maxRounds,
    stableRounds: stableCount,
    finalHeight: container.scrollHeight,
    finalSignature,
  }
}

// ==================== 工具函数 ====================

function scrollLazyHistoryContainerToTop(container: HTMLElement, wheelDeltaY: number): void {
  if (container === document.documentElement || container === document.body) {
    window.scrollTo({ top: 0, behavior: "auto" })
  } else {
    container.scrollTop = 0
    container.scrollTo?.({
      top: 0,
      behavior: "auto",
      ...{ __bypassLock: true },
    } as ScrollToOptions)
  }

  container.dispatchEvent(new Event("scroll", { bubbles: true, composed: true }))
  container.dispatchEvent(
    new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: wheelDeltaY,
    }),
  )
  window.dispatchEvent(new Event("scroll"))
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve()

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeoutId)
      signal?.removeEventListener("abort", finish)
      resolve()
    }
    const timeoutId = setTimeout(finish, ms)
    signal?.addEventListener("abort", finish, { once: true })
    if (signal?.aborted) finish()
  })
}
