/**
 * 页面原生弹窗避让的判定策略(与 DOM API 解耦,便于单测)。
 *
 * 检测分两层:
 * - 强信号仅 dialog:modal(showModal 使页面其余部分 inert,语义可信),
 *   由调用方用选择器直接判定,可见即算弹窗;
 * - 弱信号(其余可见的 dialog[open] / role="dialog" / role="alertdialog" /
 *   aria-modal)经本模块的注册表判定:先乐观算作弹窗;一旦用户在其之外
 *   发生有效交互(说明它不阻断页面,是常驻容器误标),即放行;
 *   元素隐藏后重置,重新出现时再次按弹窗处理。
 */

/** 矩形覆盖视口达到该比例即视为遮罩/全屏容器 */
const VIEWPORT_COVER_RATIO = 0.85

export interface Size {
  width: number
  height: number
}

export const isViewportCovering = (rect: Size, viewport: Size): boolean =>
  rect.width >= viewport.width * VIEWPORT_COVER_RATIO &&
  rect.height >= viewport.height * VIEWPORT_COVER_RATIO

export interface ModalCandidate {
  contains(target: unknown): boolean
}

export interface WeakModalRegistry<T extends ModalCandidate> {
  /** 用当前可见的弱信号元素刷新状态,返回是否存在仍应计为弹窗的元素 */
  update(visible: readonly T[]): boolean
  /** 记录一次用户交互;交互落在所有弱信号元素之外时放行它们,返回是否有新放行 */
  forgiveOnOutsideInteraction(target: T | null, opts?: { onBackdrop?: boolean }): boolean
}

export const createWeakModalRegistry = <
  T extends ModalCandidate = Element,
>(): WeakModalRegistry<T> => {
  const forgiven = new Set<T>()
  let visible: readonly T[] = []

  return {
    update(nextVisible) {
      visible = nextVisible
      const visibleSet = new Set(nextVisible)
      for (const el of forgiven) {
        if (!visibleSet.has(el)) forgiven.delete(el)
      }
      return nextVisible.some((el) => !forgiven.has(el))
    },
    forgiveOnOutsideInteraction(target, opts) {
      if (visible.length === 0) return false
      // 点在弹窗内部或全屏遮罩(通常是真实弹窗的 backdrop)上,不算外部交互
      if (target && visible.some((el) => el.contains(target))) return false
      if (opts?.onBackdrop) return false
      let changed = false
      for (const el of visible) {
        if (!forgiven.has(el)) {
          forgiven.add(el)
          changed = true
        }
      }
      return changed
    },
  }
}
