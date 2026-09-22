/**
 * 锚点全局存储
 *
 * 用于在 MainPanel、QuickButtons、useShortcuts 之间共享锚点位置。
 * 纯内存存储，不持久化。
 */

type Listener = () => void

let anchorPosition: number | null = null
const listeners = new Set<Listener>()

/**
 * 锚点相关异步操作的串行化锁。
 *
 * 去顶部 / 去底部 / 返回锚点 / 手动设锚等操作都是
 * 「读取当前位置 → 异步滚动 → 写回锚点」的非原子序列，
 * 中间的 await 会让第二次调用读到被第一次改过的状态，
 * 导致两个锚点塌缩成同一个位置（快速连点后锚点卡死）。
 *
 * 该锁确保同一时刻只有一个锚点操作在飞。在飞期间的新触发采用
 * 抢占语义：中断旧操作（通过 signal）、等待其完全退出后再执行新操作，
 * 避免去顶部的历史懒加载（每轮固定等待约 1.2s）持锁期间吞掉后续点击。
 */
interface RunningAnchorOp {
  abort: AbortController
  done: Promise<void>
}

let runningAnchorOp: RunningAnchorOp | null = null

export async function withAnchorOp<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  // 抢占并等待旧操作完全退出；循环是因为等待期间可能又有更新的操作抢先进来
  while (runningAnchorOp) {
    runningAnchorOp.abort.abort()
    await runningAnchorOp.done
  }

  const abort = new AbortController()
  let markDone!: () => void
  const done = new Promise<void>((resolve) => {
    markDone = resolve
  })
  const self: RunningAnchorOp = { abort, done }
  runningAnchorOp = self

  try {
    return await fn(abort.signal)
  } finally {
    if (runningAnchorOp === self) runningAnchorOp = null
    markDone()
  }
}

export const anchorStore = {
  /**
   * 获取当前锚点位置
   */
  get: (): number | null => anchorPosition,

  /**
   * 设置锚点位置
   */
  set: (position: number): void => {
    anchorPosition = position
    listeners.forEach((fn) => fn())
  },

  /**
   * 清除锚点
   */
  clear: (): void => {
    anchorPosition = null
    listeners.forEach((fn) => fn())
  },

  /**
   * 订阅锚点变化
   * @returns 取消订阅函数
   */
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  /**
   * 获取快照（用于 useSyncExternalStore）
   */
  getSnapshot: (): number | null => anchorPosition,
}

/**
 * 检查是否有锚点
 */
export const hasAnchor = (): boolean => anchorPosition !== null
