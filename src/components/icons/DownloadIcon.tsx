/**
 * SVG 图标组件 - 下载 (箭头向下落入托盘)
 * 风格：Outline (stroke-based)
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const DOWNLOAD_ICON_ARROW_PATH = "M12 3v12"
export const DOWNLOAD_ICON_CHEVRON_PATH = "m7 10 5 5 5-5"
export const DOWNLOAD_ICON_TRAY_PATH = "M5 21h14"

export const DownloadIcon: React.FC<IconProps> = ({
  size = 18,
  color = "currentColor",
  className = "",
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block" }}>
    <path d={DOWNLOAD_ICON_ARROW_PATH} />
    <path d={DOWNLOAD_ICON_CHEVRON_PATH} />
    <path d={DOWNLOAD_ICON_TRAY_PATH} />
  </svg>
)

export default DownloadIcon
