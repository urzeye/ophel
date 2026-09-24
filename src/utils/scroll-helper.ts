/**
 * 滚动辅助工具
 *
 * 统一封装站点滚动容器上的滚动操作：column-reverse 容器位置换算、
 * 阅读历史恢复期间的用户导航信号与位置锁同步。
 */

import type { SiteAdapter } from "~adapters/base"
import { EVENT_OUTLINE_JUMP_COMPLETED } from "~utils/messaging"
import { signalReadingHistoryUserNavigation } from "~utils/reading-history-navigation"

// 与 signalReadingHistoryUserNavigation 同条件：用户主动跳转完成后广播，
// 大纲管理器收到后立即刷新对齐新阅读位置（阅读历史自动恢复不触发）
function notifyOutlineJumpCompleted(preserveReadingHistoryRestore?: boolean): void {
  if (preserveReadingHistoryRestore) return
  if (typeof window === "undefined") return
  window.postMessage({ type: EVENT_OUTLINE_JUMP_COMPLETED }, "*")
}

// column-reverse 容器的滚动原点在视觉底部：scrollTop 为 0，向上滚动为负值。
// 该语义由 CSS 规范定义，对任意站点通用，直接按 computed style 检测。
function isColumnReverseContainer(container: HTMLElement): boolean {
  return (
    typeof window !== "undefined" &&
    window.getComputedStyle(container).flexDirection === "column-reverse"
  )
}

export function getTopScrollPosition(container: HTMLElement): number {
  if (isColumnReverseContainer(container)) {
    return Math.min(0, container.clientHeight - container.scrollHeight)
  }

  return 0
}

function getBottomScrollPosition(container: HTMLElement): number {
  if (isColumnReverseContainer(container)) {
    return 0
  }

  return container.scrollHeight
}

/**
 * 智能获取滚动容器
 * 优先尝试 adapter 的实现，失败时回退到 document.documentElement
 */
export function getScrollContainer(adapter: SiteAdapter | null): HTMLElement | null {
  if (!adapter) return document.documentElement

  // 尝试 adapter 的实现（普通页面模式）
  const container = adapter.getScrollContainer()
  if (container) {
    return container
  }

  return document.documentElement
}

/**
 * 智能滚动到顶部
 */
export async function smartScrollToTop(
  adapter: SiteAdapter | null,
  options: {
    preserveReadingHistoryRestore?: boolean
    restoreToken?: string
    signal?: AbortSignal
  } = {},
): Promise<{
  container: HTMLElement
  previousScrollTop: number
  scrollHeight: number
  virtualEdgeSettled: boolean
}> {
  if (!options.preserveReadingHistoryRestore) {
    signalReadingHistoryUserNavigation()
  }

  const currentContainer = adapter?.getScrollContainer() || document.documentElement
  if (options.signal?.aborted) {
    return {
      container: currentContainer,
      previousScrollTop: currentContainer.scrollTop,
      scrollHeight: currentContainer.scrollHeight,
      virtualEdgeSettled: false,
    }
  }

  const container = adapter?.getScrollContainer()

  if (container && container.scrollHeight > container.clientHeight) {
    const previousScrollTop = container.scrollTop
    const scrollHeight = container.scrollHeight

    container.scrollTo({
      top: getTopScrollPosition(container),
      behavior: "instant",
      ...{ __bypassLock: true },
    } as any)

    // 大纲刷新必须等虚拟列表把第一条挂进视口。scrollTop 先变成 0 时，屏幕上可能还是后半段。
    const virtualEdgeSettled = adapter?.usesVirtualOutlineFill()
      ? await adapter.waitForVirtualListEdge("start", options.signal)
      : true
    if (virtualEdgeSettled) {
      notifyOutlineJumpCompleted(options.preserveReadingHistoryRestore)
    }
    return { container, previousScrollTop, scrollHeight, virtualEdgeSettled }
  }

  // 最终回退到 document.documentElement
  const fallback = document.documentElement
  return {
    container: fallback,
    previousScrollTop: fallback.scrollTop,
    scrollHeight: fallback.scrollHeight,
    virtualEdgeSettled: true,
  }
}

/**
 * 智能滚动到底部
 */
export async function smartScrollToBottom(
  adapter: SiteAdapter | null,
  options: { preserveReadingHistoryRestore?: boolean; signal?: AbortSignal } = {},
): Promise<{
  container: HTMLElement
  previousScrollTop: number
  virtualEdgeSettled: boolean
}> {
  if (!options.preserveReadingHistoryRestore) {
    signalReadingHistoryUserNavigation()
  }

  const container = adapter?.getScrollContainer()

  if (container && container.scrollHeight > container.clientHeight) {
    const previousScrollTop = container.scrollTop

    container.scrollTo({
      top: getBottomScrollPosition(container),
      behavior: "instant",
      ...{ __bypassLock: true },
    } as any)

    // 没到底就不要通知大纲，否则会按仍在中途的窗口重算高亮。
    if (adapter?.usesVirtualOutlineFill()) {
      const settled = await adapter.waitForVirtualListEdge("end", options.signal)
      if (!settled) return { container, previousScrollTop, virtualEdgeSettled: false }
    }

    notifyOutlineJumpCompleted(options.preserveReadingHistoryRestore)
    return { container, previousScrollTop, virtualEdgeSettled: true }
  }

  // 最终回退到 document.documentElement
  const fallback = document.documentElement
  return { container: fallback, previousScrollTop: fallback.scrollTop, virtualEdgeSettled: true }
}

/**
 * 智能滚动到指定位置
 */
export async function smartScrollTo(
  adapter: SiteAdapter | null,
  position: number,
  options: {
    preservePositionLock?: boolean
    preserveReadingHistoryRestore?: boolean
    restoreToken?: string
    signal?: AbortSignal
  } = {},
): Promise<{ success: boolean; currentScrollTop: number }> {
  if (!options.preserveReadingHistoryRestore) {
    signalReadingHistoryUserNavigation()
  }

  const getCurrentScrollTop = () => adapter?.getScrollContainer()?.scrollTop ?? window.scrollY
  if (options.signal?.aborted) {
    return { success: false, currentScrollTop: getCurrentScrollTop() }
  }

  const container = adapter?.getScrollContainer()

  if (container && container.scrollHeight > container.clientHeight) {
    container.scrollTo({ top: position, behavior: "instant", ...{ __bypassLock: true } } as any)
    if (options.preservePositionLock) {
      syncPositionLock(container.scrollTop)
    }
    notifyOutlineJumpCompleted(options.preserveReadingHistoryRestore)
    return { success: true, currentScrollTop: container.scrollTop }
  }

  // 最终回退
  document.documentElement.scrollTo({
    top: position,
    behavior: "instant",
    ...{ __bypassLock: true },
  } as any)
  if (options.preservePositionLock) {
    syncPositionLock(document.documentElement.scrollTop)
  }
  notifyOutlineJumpCompleted(options.preserveReadingHistoryRestore)
  return { success: true, currentScrollTop: document.documentElement.scrollTop }
}

/**
 * 阅读历史恢复专用：将平台实际落点同步给 Position Keeper。
 * 用户主动导航不调用此逻辑，避免自动恢复继续覆盖用户位置。
 */
function syncPositionLock(scrollTop: number) {
  if (document.documentElement.dataset.ophelPositionLock !== undefined) {
    document.documentElement.dataset.ophelPositionLock = String(scrollTop)
  }
}

/**
 * 获取当前滚动信息
 */
export async function getScrollInfo(adapter: SiteAdapter | null): Promise<{
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}> {
  const container = adapter?.getScrollContainer()

  if (container && container.scrollHeight > container.clientHeight) {
    return {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
    }
  }

  // 最终回退
  return {
    scrollTop: document.documentElement.scrollTop,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }
}
