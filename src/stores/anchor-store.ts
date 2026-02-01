/**
 * 锚点全局存储
 *
 * 用于在 MainPanel、QuickButtons、useShortcuts 之间共享锚点位置。
 * 纯内存存储，不持久化。
 */

type Listener = () => void

let anchorPosition: number | null = null
const listeners = new Set<Listener>()

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
