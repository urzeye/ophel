import React, { useId } from "react"

import { ChevronDownIcon, RefreshIcon } from "~components/icons"
import { DEFAULT_IMAGE_EXPORT, WATERMARK_LIMITS } from "~constants/image-export"
import type { ImageExportPreferences, ImageExportWatermark } from "~types/image-export"
import { t } from "~utils/i18n"

const WATERMARK_COLOR_SWATCHES = ["#1f2937", "#64748b", "#ffffff", "#2563eb", "#b45309"] as const

function isDefaultPreferences(prefs: ImageExportPreferences): boolean {
  const def = DEFAULT_IMAGE_EXPORT
  return (
    prefs.format === def.format &&
    prefs.theme === def.theme &&
    prefs.scale === def.scale &&
    prefs.layout === def.layout &&
    prefs.branding === def.branding &&
    prefs.includeQuestions === def.includeQuestions &&
    prefs.showTitle === def.showTitle &&
    prefs.showSource === def.showSource &&
    prefs.showTime === def.showTime &&
    prefs.width === def.width &&
    prefs.fontSize === def.fontSize &&
    prefs.appearance === def.appearance &&
    prefs.watermark.enabled === def.watermark.enabled &&
    prefs.watermark.text === def.watermark.text &&
    prefs.watermark.mode === def.watermark.mode &&
    prefs.watermark.color === def.watermark.color &&
    prefs.watermark.opacity === def.watermark.opacity &&
    prefs.watermark.fontSize === def.watermark.fontSize &&
    prefs.watermark.rotation === def.watermark.rotation &&
    prefs.watermark.gapX === def.watermark.gapX &&
    prefs.watermark.gapY === def.watermark.gapY &&
    prefs.watermark.stagger === def.watermark.stagger
  )
}

function Choice<T extends string | number>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string
  value: T
  choices: readonly (readonly [T, string])[]
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="gh-image-export-choice-group">
      <legend>{label}</legend>
      <div className="gh-image-export-options">
        {choices.map(([option, text]) => (
          <button
            key={option}
            type="button"
            className="gh-image-export-choice"
            aria-pressed={value === option}
            onClick={() => onChange(option)}>
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="gh-image-export-toggle-wrap">
      <label className="gh-image-export-toggle">
        <span className="gh-image-export-toggle-label">{label}</span>
        <span className="gh-image-export-switch">
          <input
            type="checkbox"
            role="switch"
            className="gh-image-export-switch-input"
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span className="gh-image-export-switch-track" aria-hidden="true" />
        </span>
      </label>
      {hint && <p className="gh-image-export-toggle-hint">{hint}</p>}
    </div>
  )
}

export function ImageExportControls({
  preferences: prefs,
  title,
  defaultTitle,
  onTitleChange,
  onChange,
  onReset,
  disabled,
}: {
  preferences: ImageExportPreferences
  title: string
  defaultTitle: string
  onTitleChange: (title: string) => void
  onChange: (patch: Partial<ImageExportPreferences>) => void
  onReset: () => void
  disabled: boolean
}) {
  const mark = prefs.watermark
  const idPrefix = useId()
  const updateMark = (patch: Partial<ImageExportWatermark>) =>
    onChange({ watermark: { ...mark, ...patch } })
  const isModified = !isDefaultPreferences(prefs) || title !== defaultTitle
  const titleEdited = title !== defaultTitle
  const enabledContentCount = [
    prefs.showTitle,
    prefs.showSource,
    prefs.showTime,
    prefs.includeQuestions,
    prefs.branding,
  ].filter(Boolean).length
  const appearanceSummary =
    prefs.appearance === "paper"
      ? t("imageExportPaper")
      : prefs.appearance === "card"
        ? t("imageExportCard")
        : t("imageExportShadow")

  const range = (key: keyof typeof WATERMARK_LIMITS, label: string) => {
    const limits = WATERMARK_LIMITS[key]
    const pct = ((mark[key] - limits.min) / (limits.max - limits.min)) * 100
    return (
      <label
        className="gh-image-export-field gh-image-export-range-field"
        htmlFor={`${idPrefix}-${key}`}>
        <span>
          <span className="gh-image-export-field-label">{label}</span>
          <output aria-hidden="true">
            {key === "opacity"
              ? `${Math.round(mark[key] * 100)}%`
              : key === "rotation"
                ? `${mark[key]}°`
                : `${mark[key]}px`}
          </output>
        </span>
        <input
          id={`${idPrefix}-${key}`}
          type="range"
          className="gh-image-export-range"
          style={{ "--range-pct": `${Math.max(0, Math.min(100, pct))}%` } as React.CSSProperties}
          {...limits}
          value={mark[key]}
          onChange={(event) => updateMark({ [key]: Number(event.target.value) })}
        />
      </label>
    )
  }

  return (
    <aside className="gh-image-export-controls">
      <fieldset disabled={disabled} className="gh-image-export-all-controls">
        <div className="gh-image-export-primary-controls">
          <Choice
            label={t("imageExportLayout")}
            value={prefs.layout}
            choices={[
              ["single", t("imageExportSingle")],
              ["split", t("imageExportSplit")],
            ]}
            onChange={(layout) => onChange({ layout })}
          />
          <Choice
            label={t("imageExportFormat")}
            value={prefs.format}
            choices={[
              ["png", "PNG"],
              ["jpeg", "JPG"],
            ]}
            onChange={(format) => onChange({ format })}
          />
          <Choice
            label={t("imageExportTheme")}
            value={prefs.theme}
            choices={[
              ["auto", t("imageExportFollowTheme")],
              ["light", t("themeLight")],
              ["dark", t("themeDark")],
            ]}
            onChange={(theme) => onChange({ theme })}
          />
          <Choice
            label={t("imageExportQuality")}
            value={prefs.scale}
            choices={[
              [1, t("imageExportStandard")],
              [2, t("imageExportHigh")],
            ]}
            onChange={(scale) => onChange({ scale })}
          />
        </div>

        <details className="gh-image-export-group">
          <summary>
            <span className="gh-image-export-summary-title">{t("imageExportContent")}</span>
            <span className="gh-image-export-summary-end">
              <span className="gh-image-export-summary-meta">{enabledContentCount}/5</span>
              <ChevronDownIcon size={13} className="gh-image-export-chevron" />
            </span>
          </summary>
          <div className="gh-image-export-group-body">
            <Toggle
              label={t("imageExportShowTitle")}
              checked={prefs.showTitle}
              onChange={(showTitle) => onChange({ showTitle })}
            />
            {prefs.showTitle && (
              <div className="gh-image-export-field gh-image-export-title-field">
                <label htmlFor={`${idPrefix}-title`} className="gh-image-export-field-label">
                  {t("imageExportEditTitle")}
                </label>
                <div className="gh-image-export-input-row">
                  <input
                    id={`${idPrefix}-title`}
                    type="text"
                    value={title}
                    maxLength={300}
                    onChange={(event) => onTitleChange(event.target.value)}
                  />
                  {titleEdited && (
                    <button
                      type="button"
                      className="gh-image-export-inline-icon-btn"
                      aria-label={t("restore")}
                      title={t("restore")}
                      onClick={() => onTitleChange(defaultTitle)}>
                      <RefreshIcon size={13} />
                    </button>
                  )}
                </div>
              </div>
            )}
            <Toggle
              label={t("imageExportShowSource")}
              checked={prefs.showSource}
              onChange={(showSource) => onChange({ showSource })}
            />
            <Toggle
              label={t("imageExportShowTime")}
              checked={prefs.showTime}
              onChange={(showTime) => onChange({ showTime })}
            />
            <Toggle
              label={t("imageExportIncludeQuestions")}
              checked={prefs.includeQuestions}
              onChange={(includeQuestions) => onChange({ includeQuestions })}
            />
            <Toggle
              label={t("imageExportBranding")}
              hint={t("imageExportBrandingHint")}
              checked={prefs.branding}
              onChange={(branding) => onChange({ branding })}
            />
          </div>
        </details>

        <details className="gh-image-export-group">
          <summary>
            <span className="gh-image-export-summary-title">{t("imageExportTypography")}</span>
            <span className="gh-image-export-summary-end">
              <span className="gh-image-export-summary-meta">
                {`${prefs.width}px · ${appearanceSummary}`}
              </span>
              <ChevronDownIcon size={13} className="gh-image-export-chevron" />
            </span>
          </summary>
          <div className="gh-image-export-group-body">
            <Choice
              label={t("imageExportWidth")}
              value={prefs.width}
              choices={[
                [640, t("imageExportNarrow")],
                [800, t("imageExportMedium")],
                [1000, t("imageExportWide")],
              ]}
              onChange={(width) => onChange({ width })}
            />
            <Choice
              label={t("imageExportFontSize")}
              value={prefs.fontSize}
              choices={[
                [14, t("imageExportSmall")],
                [16, t("imageExportMedium")],
                [18, t("imageExportLarge")],
              ]}
              onChange={(fontSize) => onChange({ fontSize })}
            />
            <Choice
              label={t("imageExportAppearance")}
              value={prefs.appearance}
              choices={[
                ["paper", t("imageExportPaper")],
                ["card", t("imageExportCard")],
                ["shadow", t("imageExportShadow")],
              ]}
              onChange={(appearance) => onChange({ appearance })}
            />
          </div>
        </details>

        <div className="gh-image-export-watermark-section">
          <Toggle
            label={t("imageExportWatermark")}
            checked={mark.enabled}
            onChange={(enabled) => updateMark({ enabled })}
          />
          {mark.enabled && (
            <div className="gh-image-export-watermark-card">
              <label className="gh-image-export-field">
                <span className="gh-image-export-field-label">{t("imageExportWatermarkText")}</span>
                <input
                  type="text"
                  value={mark.text}
                  maxLength={120}
                  placeholder={t("imageExportWatermarkPlaceholder")}
                  onChange={(event) => updateMark({ text: event.target.value })}
                />
              </label>
              <Choice
                label={t("imageExportWatermarkMode")}
                value={mark.mode}
                choices={[
                  ["footer", t("imageExportWatermarkFooter")],
                  ["tile", t("imageExportWatermarkTile")],
                ]}
                onChange={(mode) => updateMark({ mode })}
              />
              <Toggle
                label={t("imageExportWatermarkAutoColor")}
                checked={!mark.color}
                onChange={(auto) => updateMark({ color: auto ? "" : "#64748b" })}
              />
              {mark.color && (
                <div className="gh-image-export-field">
                  <span className="gh-image-export-field-label">
                    {t("imageExportWatermarkColor")}
                  </span>
                  <div className="gh-image-export-color-row">
                    <label className="gh-image-export-color-picker">
                      <input
                        type="color"
                        value={mark.color}
                        aria-label={t("imageExportWatermarkColor")}
                        onChange={(event) => updateMark({ color: event.target.value })}
                      />
                      <span
                        className="gh-image-export-color-swatch"
                        style={{ backgroundColor: mark.color }}
                        aria-hidden="true"
                      />
                      <code>{mark.color.toUpperCase()}</code>
                    </label>
                    <div className="gh-image-export-swatches">
                      {WATERMARK_COLOR_SWATCHES.map((swatch) => (
                        <button
                          key={swatch}
                          type="button"
                          className="gh-image-export-swatch-btn"
                          style={{ backgroundColor: swatch }}
                          aria-label={swatch}
                          aria-pressed={mark.color.toLowerCase() === swatch}
                          onClick={() => updateMark({ color: swatch })}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {range("opacity", t("imageExportWatermarkOpacity"))}
              {range("fontSize", t("imageExportWatermarkSize"))}
              {mark.mode === "tile" && (
                <details className="gh-image-export-group gh-image-export-subgroup">
                  <summary>
                    <span className="gh-image-export-summary-title">
                      {t("imageExportWatermarkAdvanced")}
                    </span>
                    <ChevronDownIcon size={13} className="gh-image-export-chevron" />
                  </summary>
                  <div className="gh-image-export-group-body">
                    {range("rotation", t("imageExportWatermarkRotation"))}
                    {range("gapX", t("imageExportWatermarkGapX"))}
                    {range("gapY", t("imageExportWatermarkGapY"))}
                    <Toggle
                      label={t("imageExportWatermarkStagger")}
                      checked={mark.stagger}
                      onChange={(stagger) => updateMark({ stagger })}
                    />
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="gh-image-export-controls-footer">
          <button
            type="button"
            className="gh-dialog-btn gh-dialog-btn-secondary gh-image-export-reset"
            disabled={!isModified}
            onClick={onReset}>
            <RefreshIcon size={14} />
            <span>{t("imageExportReset")}</span>
          </button>
          <p className="gh-image-export-hint">{t("imageExportRemembered")}</p>
        </div>
      </fieldset>
    </aside>
  )
}
