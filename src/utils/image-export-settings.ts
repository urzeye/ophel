import { DEFAULT_IMAGE_EXPORT, WATERMARK_LIMITS } from "~constants/image-export"
import type { ImageExportPreferences } from "~types/image-export"

/** 旧备份缺少选项时补默认值，外部导入的数值必须有界，避免异常画布和水印循环。 */
export function normalizeImageExportPreferences(value: unknown): ImageExportPreferences {
  const raw = value && typeof value === "object" ? value : {}
  const input = raw as Partial<ImageExportPreferences>
  const defaults = DEFAULT_IMAGE_EXPORT
  const mark = input.watermark && typeof input.watermark === "object" ? input.watermark : {}
  const watermark = mark as Partial<ImageExportPreferences["watermark"]>
  const choice = <T>(candidate: unknown, choices: readonly T[], fallback: T): T =>
    choices.includes(candidate as T) ? (candidate as T) : fallback
  const bool = (candidate: unknown, fallback: boolean) =>
    typeof candidate === "boolean" ? candidate : fallback
  const number = (key: keyof typeof WATERMARK_LIMITS) => {
    const candidate = watermark[key]
    const { min, max } = WATERMARK_LIMITS[key]
    return typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.min(max, Math.max(min, candidate))
      : defaults.watermark[key]
  }
  return {
    format: choice(input.format, ["png", "jpeg"], defaults.format),
    theme: choice(input.theme, ["auto", "light", "dark"], defaults.theme),
    scale: choice(input.scale, [1, 2], defaults.scale),
    layout: choice(input.layout, ["single", "split"], defaults.layout),
    branding: bool(input.branding, defaults.branding),
    includeQuestions: bool(input.includeQuestions, defaults.includeQuestions),
    showTitle: bool(input.showTitle, defaults.showTitle),
    showSource: bool(input.showSource, defaults.showSource),
    showTime: bool(input.showTime, defaults.showTime),
    width: choice(input.width, [640, 800, 1000], defaults.width),
    fontSize: choice(input.fontSize, [14, 16, 18], defaults.fontSize),
    appearance: choice(input.appearance, ["paper", "card", "shadow"], defaults.appearance),
    watermark: {
      enabled: bool(watermark.enabled, defaults.watermark.enabled),
      text:
        typeof watermark.text === "string"
          ? watermark.text.replace(/[\r\n\t]/g, " ").slice(0, 120)
          : "",
      mode: choice(watermark.mode, ["footer", "tile"], defaults.watermark.mode),
      color:
        typeof watermark.color === "string" && /^#[0-9a-f]{6}$/i.test(watermark.color)
          ? watermark.color
          : "",
      opacity: number("opacity"),
      fontSize: number("fontSize"),
      rotation: number("rotation"),
      gapX: number("gapX"),
      gapY: number("gapY"),
      stagger: bool(watermark.stagger, defaults.watermark.stagger),
    },
  }
}
