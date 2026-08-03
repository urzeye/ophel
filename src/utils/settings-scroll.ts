/**
 * 设置页内容区受限滚动
 *
 * scrollIntoView 会连带滚动所有可滚动祖先（overflow:hidden 的弹窗容器、背景页 document），
 * 内容不足一屏时会把整个设置面板或背景页面顶偏且无法滚回。
 * 这里只滚动最近的 .settings-content 容器，不触碰任何外层祖先。
 */

export interface ScrollWithinSettingsContentOptions {
  /** nearest（默认）：目标已完整可见时不滚动，否则按越界方向滚最小量；start：始终与可视区上边缘对齐 */
  block?: "nearest" | "start"
  behavior?: ScrollBehavior
  /** 目标与可视区边缘保留的呼吸距离（px） */
  margin?: number
}

export const scrollWithinSettingsContent = (
  target: HTMLElement,
  options: ScrollWithinSettingsContentOptions = {},
): void => {
  const scroller = target.closest<HTMLElement>(".settings-content")
  if (!scroller) return

  const { block = "nearest", behavior = "smooth", margin = 12 } = options
  const targetRect = target.getBoundingClientRect()
  const scrollerRect = scroller.getBoundingClientRect()
  const topOverflow = scrollerRect.top + margin - targetRect.top

  let delta: number
  if (block === "start") {
    delta = -topOverflow
  } else {
    const bottomOverflow = targetRect.bottom - (scrollerRect.bottom - margin)
    if (topOverflow <= 0 && bottomOverflow <= 0) return
    // 目标比可视区还高时优先顶对齐，否则按越界方向滚最小量
    delta = topOverflow > 0 ? -topOverflow : bottomOverflow
  }

  scroller.scrollTo({ top: scroller.scrollTop + delta, behavior })
}
