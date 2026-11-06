import type { OutlineNavigationContext } from "~adapters/base"
import { anchorStore, withAnchorOp } from "~stores/anchor-store"
import { EVENT_OUTLINE_JUMP_COMPLETED } from "~utils/messaging"
import { signalReadingHistoryUserNavigation } from "~utils/reading-history-navigation"

export type OutlineNavigationAction = "top" | "bottom" | "anchor" | "save"

export function canNavigateOutlineContext(
  context: OutlineNavigationContext | null,
): context is OutlineNavigationContext & { container: HTMLElement } {
  return Boolean(
    context?.container?.isConnected &&
      context.container.clientHeight > 0 &&
      context.container.clientWidth > 0,
  )
}

/** 只操作调用时选中的正文；文档关闭时不回退到对话或整页。 */
export async function navigateOutlineContext(
  getContext: () => OutlineNavigationContext | null,
  action: OutlineNavigationAction,
): Promise<boolean> {
  // 标题跳转会在同一事件内立即滚动，保存动作必须同步捕获跳转前的位置。
  if (action === "save") {
    const context = getContext()
    if (!canNavigateOutlineContext(context)) return false
    anchorStore.set(context.container.scrollTop, context.key)
    return true
  }
  return withAnchorOp(async (signal) => {
    const context = getContext()
    if (signal.aborted || !canNavigateOutlineContext(context)) return false
    const { key, container } = context
    const current = container.scrollTop
    const saved = anchorStore.get(key)
    let target = action === "bottom" ? container.scrollHeight : 0
    if (action === "anchor") {
      if (saved === null) return false
      target = saved
    }
    signalReadingHistoryUserNavigation()
    container.scrollTo({ top: target, behavior: "instant" as ScrollBehavior })
    if (action === "anchor" || Math.abs(container.scrollTop - current) >= 4) {
      anchorStore.set(current, key)
    }
    window.postMessage({ type: EVENT_OUTLINE_JUMP_COMPLETED }, "*")
    return true
  })
}
