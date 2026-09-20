// 指针从吸附侧直接离开窗口后，推迟收起面板的保持时长
export const WINDOW_EXIT_HOLD_MS = 800
// 判定离开方向的边缘距离；右侧需兼容经典滚动条占位
export const WINDOW_EXIT_EDGE_THRESHOLD_PX = 24

type EdgeSnapSide = "left" | "right" | null

/**
 * 根据指针离开窗口时的事件坐标判断离开方向。
 * 指针越出窗口时坐标会被钳制在视口边缘，因此只需比较两侧距离。
 */
export const resolveWindowExitSide = (
  clientX: number,
  viewportWidth: number,
  edgeThresholdPx: number = WINDOW_EXIT_EDGE_THRESHOLD_PX,
): EdgeSnapSide => {
  if (clientX <= edgeThresholdPx) return "left"
  if (viewportWidth - clientX <= edgeThresholdPx) return "right"
  return null
}
