/**
 * 设置行组件
 * 卡片内的一行设置项，左侧 Label + Description，右侧 Control
 */
import React from "react"

import { Switch } from "~components/ui"

export interface SettingRowProps {
  /** 标签文本或元素 */
  label: React.ReactNode
  /** 描述文本 */
  description?: string
  /** 右侧控件 */
  children?: React.ReactNode
  /** 是否禁用 */
  disabled?: boolean
  /** 禁用时点击回调 */
  onDisabledClick?: () => void
  /** 自定义样式 */
  style?: React.CSSProperties
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
}) => {
  const isDisabledClickable = disabled && !!onDisabledClick
  return (
    <div
      className={`settings-row ${disabled ? "disabled" : ""} ${
        isDisabledClickable ? "disabled-clickable" : ""
      }`}
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
  label: string
  description?: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
  onDisabledClick?: () => void
}

export const ToggleRow: React.FC<ToggleRowProps> = ({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  onDisabledClick,
}) => {
  return (
    <SettingRow
      label={label}
      description={description}
      disabled={disabled}
      onDisabledClick={onDisabledClick}>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </SettingRow>
  )
}

export default SettingRow
