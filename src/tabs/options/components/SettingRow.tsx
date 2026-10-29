/**
 * 设置行组件
 * 卡片内的一行设置项，左侧 Label + Description，右侧 Control
 */
import React from "react"

import { Switch } from "~components/ui"

export interface SettingRowProps {
  /** 标签文本或元素 */
  label: React.ReactNode
  /** 描述文本或元素 */
  description?: React.ReactNode
  /** 右侧控件 */
  children?: React.ReactNode
  /** 是否禁用 */
  disabled?: boolean
  /** 禁用时点击回调 */
  onDisabledClick?: () => void
  /** 自定义样式 */
  style?: React.CSSProperties
  /** 附加类名：has-sub 标记带从属行的上级行，is-sub 标记从属行（缩进、紧贴上级） */
  className?: string
  /** 稳定 setting id（用于定位/高亮） */
  settingId?: string
}

/**
 * 通用设置行组件
 */
export const SettingRow: React.FC<SettingRowProps> = ({
  label,
  description,
  children,
  disabled = false,
  onDisabledClick,
  style,
  className = "",
  settingId,
}) => {
  const isDisabledClickable = disabled && !!onDisabledClick
  return (
    <div
      className={`settings-row ${disabled ? "disabled" : ""} ${
        isDisabledClickable ? "disabled-clickable" : ""
      } ${className}`.trim()}
      data-setting-id={settingId}
      style={style}
      onClick={() => {
        if (isDisabledClickable) {
          onDisabledClick?.()
        }
      }}>
      <div className="settings-row-info">
        <div className="settings-row-label">{label}</div>
        {description && <div className="settings-row-desc">{description}</div>}
      </div>
      {children && <div className="settings-row-control">{children}</div>}
    </div>
  )
}

/**
 * 带开关的设置行（常用快捷组件）
 */
export interface ToggleRowProps {
  /** 标签文本或元素（带 Beta 标签时传元素，同时需要提供 ariaLabel） */
  label: React.ReactNode
  description?: React.ReactNode
  checked: boolean
  onChange: () => void
  disabled?: boolean
  onDisabledClick?: () => void
  className?: string
  /** 开关的可访问名称；label 为元素时无法自动推导，需显式传入 */
  ariaLabel?: string
  settingId?: string
}

export const ToggleRow: React.FC<ToggleRowProps> = ({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  onDisabledClick,
  className,
  ariaLabel,
  settingId,
}) => {
  return (
    <SettingRow
      label={label}
      description={description}
      disabled={disabled}
      onDisabledClick={onDisabledClick}
      className={className}
      settingId={settingId}>
      <Switch checked={checked} onChange={onChange} disabled={disabled} ariaLabel={ariaLabel} />
    </SettingRow>
  )
}

export default SettingRow
