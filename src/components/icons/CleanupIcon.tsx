/**
 * SVG 图标组件 - 清理/扫帚
 * 风格：Outline (stroke-based)
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const CleanupIcon: React.FC<IconProps> = ({
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
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block" }}>
    {/* 扫帚柄 */}
    <path d="M15.5 3L21 8.5" />
    {/* 扫帚头 */}
    <path d="M16 12L3 21l-1-1 2-2 3 3 14-14-3-3-4 4-2-2-4 4" style={{ display: "none" }} />
    {/* 简化版扫帚 */}
    <path d="M19.5 7.5L13 14" />
    <path d="M10 16L3 21" />
    <path d="M13.5 11.5L5 20" />
    <path d="M16 9L11 14" />
    <path d="M18 11.5L12 17.5" />
    {/* 重新绘制一个更清晰的扫帚 */}
    {/* 简单的拖把/扫帚形状 */}
    <path
      d="M9.5 20c-1 0-2.5 0-3.5-1.5S5 16.5 5 15.5c0-.5.5-1 1-1h9c.5 0 1 .5 1 1 0 1-.5 2-1 3.5s-2.5 1.5-3.5 1.5z"
      stroke="none"
      fill={color}
      opacity="0"
    />{" "}
    {/* Hide fill */}
    {/* Lucide style broom logic roughly */}
    {/* Or Sparkles for "Clean ghosts" */}
  </svg>
)

// Let's use Sparkles for "Clean Ghosts" as it's more magical
export const SparklesIcon: React.FC<IconProps> = ({
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
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block" }}>
    <path
      d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"
      style={{ display: "none" }}
    />

    {/* Sparkles */}
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    <path d="M20 3v4" />
    <path d="M22 5h-4" />
    <path d="M4 17v2" />
    <path d="M5 18H3" />
  </svg>
)

// Okay, actually implements cleanup - Broom
// Re-implementing clearer broom
export const BroomIcon: React.FC<IconProps> = ({
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
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block" }}>
    {/* Handle */}
    <path d="M18.5 5.5l-7 7" />
    {/* Head */}
    <path d="M10 14h-1.5a.5.5 0 0 0-.5.5v2.7c0 .7 0 1.3.5 1.8 1.4 1.4 3.7 1.4 5.1 0 .5-.5.5-1.1.5-1.8v-2.7a.5.5 0 0 0-.5-.5H13" />
    <path d="M19 8l2-2" />
  </svg>
)

export default BroomIcon
