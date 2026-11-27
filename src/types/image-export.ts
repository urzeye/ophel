export interface ImageExportWatermark {
  enabled: boolean
  text: string
  mode: "footer" | "tile"
  color: string // 空字符串表示按成品明暗自动选择
  opacity: number
  fontSize: number
  rotation: number
  gapX: number
  gapY: number
  stagger: boolean
}

export interface ImageExportPreferences {
  format: "png" | "jpeg"
  theme: "auto" | "light" | "dark"
  scale: 1 | 2
  layout: "single" | "split"
  branding: boolean
  includeQuestions: boolean
  showTitle: boolean
  showSource: boolean
  showTime: boolean
  width: 640 | 800 | 1000
  fontSize: 14 | 16 | 18
  appearance: "paper" | "card" | "shadow"
  watermark: ImageExportWatermark
}
