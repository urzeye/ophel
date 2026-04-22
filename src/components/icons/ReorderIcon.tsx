/**
 * SVG 图标组件 - 列表排序手柄（三条横线）
 * 风格：Fill-based，1024×1024 viewBox
 * 用途：可排序列表的拖拽手柄（设置页快捷按钮排序等）
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

export const ReorderIcon: React.FC<IconProps> = ({
  size = 16,
  color = "currentColor",
  className = "",
  style,
}) => (
  <svg
    viewBox="0 0 1024 1024"
    width={size}
    height={size}
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ display: "block", flexShrink: 0, ...style }}>
    <rect x="100" y="282" width="824" height="80" rx="40" fill={color} />
    <rect x="100" y="472" width="824" height="80" rx="40" fill={color} />
    <rect x="100" y="662" width="824" height="80" rx="40" fill={color} />
  </svg>
)

export default ReorderIcon
