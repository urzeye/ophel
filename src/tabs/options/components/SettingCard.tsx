/**
 * 设置卡片组件
 * 用于分组设置项的卡片容器
 */
import React from "react"

export interface SettingCardProps {
  /** 卡片标题 */
  title?: React.ReactNode
  /** 卡片描述 */
  description?: string
  /** 标题行右侧操作区 */
  action?: React.ReactNode
  /** 子元素 */
  children: React.ReactNode
  /** 自定义类名 */
  className?: string
  /** 自定义样式 */
  style?: React.CSSProperties
  /** 稳定 setting id（用于定位/高亮） */
  settingId?: string
}

export const SettingCard: React.FC<SettingCardProps> = ({
  title,
  description,
  action,
  children,
  className = "",
  style,
  settingId,
}) => {
  return (
    <div className={`settings-card ${className}`} style={style} data-setting-id={settingId}>
      {action ? (
        <>
          <div className="settings-card-head">
            {title && <div className="settings-card-title">{title}</div>}
            <div className="settings-card-head-action">{action}</div>
          </div>
          {description && <div className="settings-card-desc">{description}</div>}
        </>
      ) : (
        <>
          {title && <div className="settings-card-title">{title}</div>}
          {description && <div className="settings-card-desc">{description}</div>}
        </>
      )}
      {children}
    </div>
  )
}

export default SettingCard
