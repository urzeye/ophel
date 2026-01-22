/**
 * SVG 图标生成工具
 * 使用 DOM API 创建 SVG 元素，避免 innerHTML（CSP 兼容）
 */

const SVG_NS = "http://www.w3.org/2000/svg"

export interface IconOptions {
  size?: number
  color?: string
  className?: string
}

// ===================== SVG Path 常量（供 React 组件复用） =====================

/** 复制图标 - 矩形属性 */
export const COPY_ICON_RECT = { x: 9, y: 9, width: 13, height: 13, rx: 2, ry: 2 }

/** 复制图标 - 路径 */
export const COPY_ICON_PATH = "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"

/** 成功勾选图标 - 折线点 */
export const CHECK_ICON_POINTS = "20 6 9 17 4 12"

/** 侧边栏图标路径 (placeholder - 当前未使用，仅为类型兼容) */
export const SIDEBAR_ICONS: Record<string, string> = {}

/**
 * 创建 SVG 元素的辅助函数
 */
function createSVGElement(tag: string, attrs: Record<string, string> = {}): SVGElement {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value)
  }
  return el
}

/**
 * 复制图标（两个重叠的矩形）
 */
export function createCopyIcon(options: IconOptions = {}): SVGSVGElement {
  const { size = 16, color = "currentColor", className = "" } = options

  const svg = createSVGElement("svg", {
    xmlns: SVG_NS,
    width: size.toString(),
    height: size.toString(),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    ...(className ? { class: className } : {}),
  }) as SVGSVGElement

  // 后面的矩形（较大）
  const rect1 = createSVGElement("rect", {
    x: "9",
    y: "9",
    width: "13",
    height: "13",
    rx: "2",
    ry: "2",
  })

  // 前面的矩形（较小，带路径）
  const path = createSVGElement("path", {
    d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  })

  svg.appendChild(rect1)
  svg.appendChild(path)

  return svg
}

/**
 * 勾选图标（成功状态）
 */
export function createCheckIcon(options: IconOptions = {}): SVGSVGElement {
  const { size = 16, color = "currentColor", className = "" } = options

  const svg = createSVGElement("svg", {
    xmlns: SVG_NS,
    width: size.toString(),
    height: size.toString(),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    "stroke-width": "2.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    ...(className ? { class: className } : {}),
  }) as SVGSVGElement

  const polyline = createSVGElement("polyline", {
    points: "20 6 9 17 4 12",
  })

  svg.appendChild(polyline)

  return svg
}

/**
 * 更新按钮内部的图标（复制 -> 勾选 -> 复制）
 * 使用 DOM API 避免 innerHTML（CSP Trusted Types 兼容）
 */
export function showCopySuccess(button: HTMLElement, options: IconOptions = {}): void {
  // 清空内容（避免 innerHTML，使用 replaceChildren）
  while (button.firstChild) {
    button.removeChild(button.firstChild)
  }

  // 添加勾选图标
  button.appendChild(createCheckIcon({ ...options, color: "#22c55e" }))

  // 1.5 秒后恢复
  setTimeout(() => {
    while (button.firstChild) {
      button.removeChild(button.firstChild)
    }
    // 重新创建复制图标
    button.appendChild(createCopyIcon(options))
  }, 1500)
}

/**
 * 初始化容器内的所有复制按钮（将空按钮填充 SVG 图标）
 */
export function initCopyButtons(
  container: Element | Document | ShadowRoot,
  options: IconOptions = {},
): void {
  const buttons = container.querySelectorAll(".gh-code-copy-btn:empty, .gh-table-copy-btn:empty")
  buttons.forEach((btn) => {
    btn.appendChild(createCopyIcon(options))
  })
}
