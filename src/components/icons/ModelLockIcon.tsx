interface IconProps {
  size?: number
  color?: string
  className?: string
}

/**
 * Model Lock Icon - 锁 + AI 元素（锁上有齿轮表示模型）
 * 与 ScrollLockIcon 区分开
 */
export const ModelLockIcon: React.FC<IconProps> = ({
  size = 18,
  color = "currentColor",
  className = "",
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}>
      {/* Lock Shackle (looks like robot head top/antenna base) */}
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      {/* Lock Body (Robot Face) */}
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      {/* Eyes */}
      <circle cx="9" cy="15" r="1.5" fill={color} stroke="none" />
      <circle cx="15" cy="15" r="1.5" fill={color} stroke="none" />
      {/* Mouth (Happy/Neutral) */}
      <path d="M9 19h6" />
    </svg>
  )
}
