import type { ImageExportPreferences } from "~types/image-export"

export const DEFAULT_IMAGE_EXPORT: ImageExportPreferences = {
  format: "png",
  theme: "auto",
  scale: 2,
  layout: "single",
  branding: true,
  includeQuestions: true,
  showTitle: true,
  showSource: true,
  showTime: true,
  width: 800,
  fontSize: 16,
  appearance: "paper",
  watermark: {
    enabled: false,
    text: "",
    mode: "tile",
    color: "",
    opacity: 0.12,
    fontSize: 24,
    rotation: -30,
    gapX: 100,
    gapY: 100,
    stagger: true,
  },
}

export const WATERMARK_LIMITS = {
  opacity: { min: 0.05, max: 1, step: 0.01 },
  fontSize: { min: 12, max: 64, step: 1 },
  rotation: { min: -90, max: 90, step: 5 },
  gapX: { min: 20, max: 400, step: 10 },
  gapY: { min: 20, max: 400, step: 10 },
} as const
