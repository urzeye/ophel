/**
 * 设置行组件
 * 卡片内的一行设置项，左侧 Label + Description，右侧 Control
 */
import React, { useId } from "react"

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
  /** 稳定 setting id（用于定位/高亮） */
  settingId?: string
  /** 关联表单控件，使可见标题可点击 */
  controlId?: string
  labelId?: string
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
  settingId,
  controlId,
  labelId,
}) => {
  const isDisabledClickable = disabled && !!onDisabledClick
  return (
    <div
      className={`settings-row ${disabled ? "disabled" : ""} ${
        isDisabledClickable ? "disabled-clickable" : ""
      }`}
      data-setting-id={settingId}
      style={style}
      onClick={() => {
        if (isDisabledClickable) {
          onDisabledClick?.()
        }
      }}>
      <div className="settings-row-info">
        {controlId ? (
          <label id={labelId} className="settings-row-label" htmlFor={controlId}>
            {label}
          </label>
        ) : (
          <div id={labelId} className="settings-row-label">
            {label}
          </div>
        )}
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
  settingId?: string
}

export const ToggleRow: React.FC<ToggleRowProps> = ({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  onDisabledClick,
  settingId,
}) => {
  const generatedId = useId()
  const inputId = settingId ? `setting-${settingId}` : `setting-toggle-${generatedId}`
  const labelId = `${inputId}-label`

  return (
    <SettingRow
      label={label}
      description={description}
      disabled={disabled}
      onDisabledClick={onDisabledClick}
      settingId={settingId}
      controlId={inputId}
      labelId={labelId}>
      <Switch
        id={inputId}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        ariaLabelledBy={labelId}
      />
    </SettingRow>
  )
}

export default SettingRow
