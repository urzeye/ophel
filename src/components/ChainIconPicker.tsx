/**
 * Chain 图标选择器 - 极简版
 * 精选图标，网格展示，点击即选
 */

import React from "react"
import { SafeSvgMarkup } from "~components/ui"
import { CHAIN_ICON_PRESETS } from "~constants/chain-icons"
import { t } from "~utils/i18n"

const CHAIN_ICON_PICKER_STYLES = `
.gh-chain-icon-picker,
.gh-chain-icon-picker * {
  box-sizing: border-box;
}

.gh-chain-icon-picker {
  display: flex;
  flex-direction: column;
  width: 650px;
  max-width: 90vw;
  height: 520px;
  max-height: 80vh;
  background: var(--gh-bg, #ffffff);
  border-radius: 12px;
  overflow: hidden;
  color: var(--gh-text, #1f2937);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.28);
}

.gh-chain-icon-picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--gh-border, #e5e7eb);
  flex-shrink: 0;
}

.gh-chain-icon-picker-title {
  color: var(--gh-text, #1f2937);
  font-size: 16px;
  font-weight: 650;
  line-height: 1.4;
}

.gh-chain-icon-picker-close {
  padding: 8px 16px;
  border: 1px solid var(--gh-border, #e5e7eb);
  border-radius: 6px;
  background: var(--gh-bg, #ffffff);
  color: var(--gh-text, #1f2937);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.gh-chain-icon-picker-close:hover {
  background: var(--gh-hover, #f3f4f6);
  border-color: var(--gh-primary, #4285f4);
  color: var(--gh-primary, #4285f4);
}

.gh-chain-icon-picker-grid {
  flex: 1;
  min-height: 0;
  padding: 20px;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
  gap: 12px;
  align-content: start;
}

.gh-chain-icon-picker-grid::-webkit-scrollbar {
  width: 8px;
}

.gh-chain-icon-picker-grid::-webkit-scrollbar-thumb {
  background: var(--gh-border, #e5e7eb);
  border-radius: 4px;
}

.gh-chain-icon-picker-grid::-webkit-scrollbar-thumb:hover {
  background: var(--gh-text-secondary, #6b7280);
}

.gh-chain-icon-picker-item {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  min-width: 0;
  min-height: 58px;
  margin: 0;
  padding: 14px;
  border: 1.5px solid var(--gh-border, #e5e7eb);
  border-radius: 8px;
  background: var(--gh-bg, #ffffff);
  color: var(--gh-text-secondary, #6b7280);
  font: inherit;
  line-height: 1;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.gh-chain-icon-picker-item:hover {
  border-color: var(--gh-primary, #4285f4);
  background: rgba(66, 133, 244, 0.06);
  color: var(--gh-primary, #4285f4);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(66, 133, 244, 0.18);
}

.gh-chain-icon-picker-item.active {
  border-color: var(--gh-primary, #4285f4);
  background: rgba(66, 133, 244, 0.1);
  color: var(--gh-primary, #4285f4);
  box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.18);
}

.gh-chain-icon-picker-icon {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: currentColor;
}

.gh-chain-icon-picker-icon svg {
  width: 100%;
  height: 100%;
  display: block;
  fill: none;
  stroke: currentColor;
}

@media (max-width: 520px) {
  .gh-chain-icon-picker {
    width: calc(100vw - 24px);
    height: min(520px, calc(100vh - 48px));
  }

  .gh-chain-icon-picker-grid {
    grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
    gap: 10px;
    padding: 16px;
  }

  .gh-chain-icon-picker-item {
    min-height: 52px;
    padding: 12px;
  }

  .gh-chain-icon-picker-icon {
    width: 26px;
    height: 26px;
  }
}
`

interface ChainIconPickerProps {
  value?: string // 当前选中的图标 SVG
  onChange: (iconId: string, svg: string) => void
  onClose: () => void
}

const getPresetLabelKey = (id: string) =>
  `chainIconPreset${id.replace(/(^|[-_])([a-z])/g, (_match, _prefix, letter: string) =>
    letter.toUpperCase(),
  )}`

export function ChainIconPicker({ value, onChange, onClose }: ChainIconPickerProps) {
  return (
    <div className="gh-chain-icon-picker">
      <style>{CHAIN_ICON_PICKER_STYLES}</style>
      {/* 头部 */}
      <div className="gh-chain-icon-picker-header">
        <div className="gh-chain-icon-picker-title">{t("chainIconSelect")}</div>
        <button type="button" onClick={onClose} className="gh-chain-icon-picker-close">
          {t("chainIconClose")}
        </button>
      </div>

      {/* 图标网格 */}
      <div className="gh-chain-icon-picker-grid">
        {CHAIN_ICON_PRESETS.map((icon) => {
          const labelKey = getPresetLabelKey(icon.id)
          const label = t(labelKey)
          const title = label === labelKey ? icon.labelEn || icon.label : label

          return (
            <button
              type="button"
              key={icon.id}
              className={`gh-chain-icon-picker-item${value === icon.svg ? " active" : ""}`}
              onClick={() => onChange(icon.id, icon.svg)}
              aria-label={title}
              aria-pressed={value === icon.svg}
              title={title}>
              <SafeSvgMarkup className="gh-chain-icon-picker-icon" svg={icon.svg} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
