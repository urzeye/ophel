export interface ExportImageSlice {
  start: number
  end: number
}

export const IMAGE_EXPORT_MAX_PAGES = 64
export const IMAGE_EXPORT_MAX_PIXELS = 16_000_000
export const IMAGE_EXPORT_MAX_SIDE = 16_000

export function isWithinExportImageBudget(width: number, height: number, scale: number): boolean {
  const pixelWidth = Math.ceil(width * scale)
  const pixelHeight = Math.ceil(height * scale)
  return (
    Number.isFinite(pixelWidth) &&
    Number.isFinite(pixelHeight) &&
    pixelWidth > 0 &&
    pixelHeight > 0 &&
    scale > 0 &&
    Math.max(pixelWidth, pixelHeight) <= IMAGE_EXPORT_MAX_SIDE &&
    pixelWidth * pixelHeight <= IMAGE_EXPORT_MAX_PIXELS
  )
}

/** 返回正文可用高度；页眉、留白和品牌页脚同样占用画布预算。 */
export function getExportImageContentHeight(
  width: number,
  scale: number,
  frameHeight: number,
): number {
  if (
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !Number.isFinite(frameHeight) ||
    frameHeight < 0
  ) {
    throw new RangeError("Invalid image dimensions")
  }
  const pixelWidth = Math.ceil(width * scale)
  if (pixelWidth > IMAGE_EXPORT_MAX_SIDE) return 0
  const pixelHeight = Math.min(
    IMAGE_EXPORT_MAX_SIDE,
    Math.floor(IMAGE_EXPORT_MAX_PIXELS / pixelWidth),
  )
  return Math.max(0, Math.floor(pixelHeight / scale - frameHeight))
}

/** 优先在块或文字行边界分图；没有可用断点时仍保证每张画布有界。 */
export function planExportImageSlices(
  height: number,
  breaks: number[],
  maxHeight: number,
): ExportImageSlice[] {
  if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(maxHeight) || maxHeight < 1) {
    throw new RangeError("Invalid image dimensions")
  }
  const total = Math.ceil(height)
  const points = [...new Set(breaks.filter(Number.isFinite).map(Math.ceil))]
    .filter((point) => point > 0 && point < total)
    .sort((a, b) => a - b)
  const pages: ExportImageSlice[] = []
  let start = 0
  while (start < total) {
    let end = Math.min(start + maxHeight, total)
    if (end < total) {
      const candidates = points.filter((point) => point > start + maxHeight / 2 && point <= end)
      if (candidates.length) end = candidates[candidates.length - 1]
    }
    pages.push({ start, end })
    if (pages.length > IMAGE_EXPORT_MAX_PAGES) throw new RangeError("Too many export images")
    start = end
  }
  return pages
}
