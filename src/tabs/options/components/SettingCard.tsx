/**
 * 设置卡片组件
 * 用于分组设置项的卡片容器
 */
import React from "react"

import { ChevronDownIcon } from "~components/icons"
import { t } from "~utils/i18n"

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

export interface SettingCardAdvancedProps {
  /** 折叠区内的低频设置行 */
  children: React.ReactNode
}

/**
 * 设置卡片底部的「高级选项」折叠区。
 * 用原生 details/summary 实现：键盘天然可访问，且全局搜索定位时
 * scrollWithinSettingsContent 会自动展开闭合的 details 祖先，无需额外状态。
 */
export const SettingCardAdvanced: React.FC<SettingCardAdvancedProps> = ({ children }) => {
  return (
    <details className="settings-card-advanced">
      <summary className="settings-card-advanced-summary">
        <span className="settings-card-advanced-disclosure" aria-hidden="true">
          <ChevronDownIcon size={12} className="settings-card-advanced-icon" />
        </span>
        <span className="settings-card-advanced-label">{t("settingsAdvancedToggle")}</span>
      </summary>
      <div className="settings-card-advanced-body">{children}</div>
    </details>
  )
}
