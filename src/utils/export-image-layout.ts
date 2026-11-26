export interface ExportImageSlice {
  start: number
  end: number
}

export const IMAGE_EXPORT_CONTENT_HEIGHT = 3200
export const IMAGE_EXPORT_MAX_PAGES = 64

/** 优先在块或文字行边界分图；没有可用断点时仍保证每张画布有界。 */
export function planExportImageSlices(
  height: number,
  breaks: number[],
  maxHeight = IMAGE_EXPORT_CONTENT_HEIGHT,
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
