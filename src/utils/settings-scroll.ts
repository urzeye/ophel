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

  // 目标在折叠的 <details> 内（如适配中心的「高级」区）时先展开，否则测不到位置也看不到高亮
  let collapsed = target.closest<HTMLDetailsElement>("details:not([open])")
  while (collapsed && scroller.contains(collapsed)) {
    collapsed.open = true
    collapsed = collapsed.parentElement?.closest<HTMLDetailsElement>("details:not([open])") ?? null
  }

  const { block = "nearest", behavior = "smooth", margin = 12 } = options
  const scrollerRect = scroller.getBoundingClientRect()
  if (scroller.clientHeight <= 0 || scrollerRect.height <= 0) return

  // 设置弹窗打开时带 scale 动画，getBoundingClientRect 返回缩放后的坐标，
  // 而 scrollTop 使用布局像素。直接相减会让越靠下的目标滚动距离越短，这里先还原纵向比例。
  const scaleY = scrollerRect.height / scroller.clientHeight
  // 吸顶条（如站点设置的站点选择器）会遮挡可视区顶部，定位时额外留出其高度
  const stickyHeader = scroller.querySelector<HTMLElement>("[data-settings-sticky]")
  const stickyOffset = stickyHeader ? stickyHeader.offsetHeight + 8 : 0
  const effectiveMargin = margin + stickyOffset
  const targetRect = target.getBoundingClientRect()
  const targetTop = (targetRect.top - scrollerRect.top) / scaleY
  const targetHeight = targetRect.height / scaleY
  const targetBottom = targetTop + targetHeight
  const viewportHeight = scroller.clientHeight
  const topOverflow = effectiveMargin - targetTop

  let delta: number
  if (block === "start") {
    delta = -topOverflow
  } else {
    const bottomOverflow = targetBottom - (viewportHeight - margin)
    if (topOverflow <= 0 && bottomOverflow <= 0) return
    // 目标比可视区还高时优先顶对齐，否则按越界方向滚最小量
    const availableHeight = viewportHeight - effectiveMargin * 2
    delta = topOverflow > 0 || targetHeight > availableHeight ? -topOverflow : bottomOverflow
  }

  scroller.scrollTo({ top: scroller.scrollTop + delta, behavior })
}
