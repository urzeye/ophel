import React, { useId } from "react"

import { WATERMARK_LIMITS } from "~constants/image-export"
import type { ImageExportPreferences, ImageExportWatermark } from "~types/image-export"
import { t } from "~utils/i18n"

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
    <fieldset>
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
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="gh-image-export-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

export function ImageExportControls({
  preferences: prefs,
  title,
  onTitleChange,
  onChange,
  onReset,
  disabled,
}: {
  preferences: ImageExportPreferences
  title: string
  onTitleChange: (title: string) => void
  onChange: (patch: Partial<ImageExportPreferences>) => void
  onReset: () => void
  disabled: boolean
}) {
  const mark = prefs.watermark
  const idPrefix = useId()
  const updateMark = (patch: Partial<ImageExportWatermark>) =>
    onChange({ watermark: { ...mark, ...patch } })
  const range = (key: keyof typeof WATERMARK_LIMITS, label: string) => (
    <label className="gh-image-export-field" htmlFor={`${idPrefix}-${key}`}>
      <span>
        {label}
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
        {...WATERMARK_LIMITS[key]}
        value={mark[key]}
        onChange={(event) => updateMark({ [key]: Number(event.target.value) })}
      />
    </label>
  )

  return (
    <aside className="gh-image-export-controls">
      <fieldset disabled={disabled} className="gh-image-export-all-controls">
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

        <details className="gh-image-export-group">
          <summary>{t("imageExportContent")}</summary>
          <label className="gh-image-export-field">
            <span>{t("imageExportEditTitle")}</span>
            <input
              type="text"
              value={title}
              maxLength={300}
              disabled={!prefs.showTitle}
              onChange={(event) => onTitleChange(event.target.value)}
            />
          </label>
          <Toggle
            label={t("imageExportShowTitle")}
            checked={prefs.showTitle}
            onChange={(showTitle) => onChange({ showTitle })}
          />
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
            checked={prefs.branding}
            onChange={(branding) => onChange({ branding })}
          />
          <p className="gh-image-export-hint">{t("imageExportBrandingHint")}</p>
        </details>

        <details className="gh-image-export-group">
          <summary>{t("imageExportTypography")}</summary>
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
        </details>

        <Toggle
          label={t("imageExportWatermark")}
          checked={mark.enabled}
          onChange={(enabled) => updateMark({ enabled })}
        />
        {mark.enabled && (
          <div className="gh-image-export-watermark-controls">
            <label className="gh-image-export-field">
              <span>{t("imageExportWatermarkText")}</span>
              <input
                type="text"
                value={mark.text}
                maxLength={120}
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
              onChange={(auto) => updateMark({ color: auto ? "" : "#808080" })}
            />
            {mark.color && (
              <label className="gh-image-export-field">
                <span>{t("imageExportWatermarkColor")}</span>
                <input
                  type="color"
                  value={mark.color}
                  onChange={(event) => updateMark({ color: event.target.value })}
                />
              </label>
            )}
            {range("opacity", t("imageExportWatermarkOpacity"))}
            {range("fontSize", t("imageExportWatermarkSize"))}
            {mark.mode === "tile" && (
              <details className="gh-image-export-group">
                <summary>{t("imageExportWatermarkAdvanced")}</summary>
                {range("rotation", t("imageExportWatermarkRotation"))}
                {range("gapX", t("imageExportWatermarkGapX"))}
                {range("gapY", t("imageExportWatermarkGapY"))}
                <Toggle
                  label={t("imageExportWatermarkStagger")}
                  checked={mark.stagger}
                  onChange={(stagger) => updateMark({ stagger })}
                />
              </details>
            )}
          </div>
        )}
        <button
          type="button"
          className="gh-dialog-btn gh-dialog-btn-secondary gh-image-export-reset"
          onClick={onReset}>
          {t("imageExportReset")}
        </button>
        <p className="gh-image-export-hint">{t("imageExportRemembered")}</p>
      </fieldset>
    </aside>
  )
}
