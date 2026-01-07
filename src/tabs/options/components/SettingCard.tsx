/**
 * 设置卡片组件
 * 用于分组设置项的卡片容器
 */
import React from "react"

export interface SettingCardProps {
  /** 卡片标题 */
  title?: string
  /** 卡片描述 */
  description?: string
  /** 子元素 */
  children: React.ReactNode
  /** 自定义样式 */
  style?: React.CSSProperties
}

export const SettingCard: React.FC<SettingCardProps> = ({
  title,
  description,
  children,
  style,
}) => {
  return (
    <div className="settings-card" style={style}>
      {title && <div className="settings-card-title">{title}</div>}
      {description && <div className="settings-card-desc">{description}</div>}
      {children}
    </div>
  )
}

export default SettingCard
