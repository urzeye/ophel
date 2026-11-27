import { captureExportCanvas } from "~platform/image-capture"
import type { ImageExportPreferences, ImageExportWatermark } from "~types/image-export"
import {
  createExportBrand,
  ExportDocumentError,
  prepareExportDocument,
  type ExportDocumentInput,
  type ExportDocumentOptions,
  type PreparedExportDocument,
} from "~utils/export-document"
import {
  getExportImageContentHeight,
  isWithinExportImageBudget,
  planExportImageSlices,
  type ExportImageSlice,
} from "~utils/export-image-layout"

export interface ExportImageOptions extends ExportDocumentOptions {
  scale: 1 | 2
  layout: "single" | "split"
  footerWatermarkSize: number
}

export interface ExportImagePage {
  blob: Blob
  width: number
  height: number
  /** 逻辑排版宽度（CSS px），用于预览缩放基准，避免切换 1×/2× 清晰度时画面跳变。 */
  cssWidth: number
  watermarkSlot?: { x: number; y: number; width: number; height: number }
}

// 仅复制成品使用的样式，避免宿主页数百个 CSS 属性膨胀每个 SVG 节点。
const CAPTURE_STYLES = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "box-sizing",
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "margin",
  "padding",
  "border",
  "border-collapse",
  "border-spacing",
  "table-layout",
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "border-top",
  "border-bottom",
  "border-left",
  "border-right",
  "background",
  "background-color",
  "background-image",
  "color",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant-numeric",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-decoration",
  "text-decoration-color",
  "text-underline-offset",
  "text-indent",
  "text-transform",
  "text-rendering",
  "text-wrap",
  "white-space",
  "word-break",
  "overflow-wrap",
  "tab-size",
  "overflow",
  "overflow-x",
  "overflow-y",
  "vertical-align",
  "list-style-type",
  "list-style-position",
  "transform",
  "transform-origin",
  "flex",
  "flex-grow",
  "flex-shrink",
  "flex-direction",
  "flex-wrap",
  "align-items",
  "align-self",
  "justify-content",
  "gap",
  "object-fit",
  "box-shadow",
  "fill",
  "stroke",
  "stroke-width",
  "math-style",
  "math-depth",
  "visibility",
]

function collectBreaks(conversation: HTMLElement): number[] {
  const top = conversation.getBoundingClientRect().top
  const points: number[] = []
  const atomic = Array.from(conversation.querySelectorAll("img, svg, math, tr")).map((node) =>
    node.getBoundingClientRect(),
  )
  const add = (bottom: number) => {
    if (!atomic.some((rect) => bottom > rect.top && bottom < rect.bottom))
      points.push(bottom - top + 2)
  }
  for (const block of Array.from(
    conversation.querySelectorAll(".gh-message, .gh-markdown-preview > *, li, tr"),
  )) {
    add(block.getBoundingClientRect().bottom)
    if (block.getBoundingClientRect().height < 1200 || block.matches("svg, math, img, table"))
      continue
    const range = document.createRange()
    range.selectNodeContents(block)
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.height > 0 && rect.height < 80) add(rect.bottom)
    }
  }
  return points
}

function createImageFrame(
  prepared: PreparedExportDocument,
  slice: ExportImageSlice,
  index: number,
  total: number,
  footerWatermarkSize: number,
): { page: HTMLElement; viewport: HTMLElement } {
  const page = prepared.root.cloneNode(false) as HTMLElement
  const shell = document.createElement("main")
  shell.className = "gh-shell"
  if (prepared.header) shell.append(prepared.header.cloneNode(true))
  const viewport = document.createElement("div")
  viewport.className = "gh-export-slice"
  viewport.style.height = `${slice.end - slice.start}px`
  shell.append(viewport)
  const footer = createExportBrand(prepared, index, total)
  if (footer) shell.append(footer)
  if (footerWatermarkSize) {
    const slot = document.createElement("div")
    slot.className = "gh-export-watermark-slot"
    slot.style.height = `${Math.ceil(footerWatermarkSize * 1.8 + 8)}px`
    shell.append(slot)
  }
  page.append(shell)
  return { page, viewport }
}

/** 只缓存压缩后的干净 PNG；不跨设置保留大量 Canvas 或重复获取附件。 */
export async function captureExportImages(
  input: ExportDocumentInput,
  options: ExportImageOptions,
  signal: AbortSignal,
  onProgress: (completed: number, total: number) => void,
): Promise<ExportImagePage[]> {
  const prepared = await prepareExportDocument(input, options, signal)
  try {
    signal.throwIfAborted()
    const { root, conversation } = prepared
    const bounds = conversation.getBoundingClientRect()
    if (!bounds.height || !bounds.width)
      throw new ExportDocumentError("render", "Empty export layout")
    const contentHeight = Math.ceil(bounds.height)
    // 用同一个框架测量实际开销；1px 正文避免空块的 margin 折叠改变高度。
    const probe = createImageFrame(
      prepared,
      { start: 0, end: 1 },
      0,
      1,
      options.footerWatermarkSize,
    )
    root.after(probe.page)
    const frameHeight = probe.page.getBoundingClientRect().height - 1
    probe.page.remove()
    if (
      options.layout === "single" &&
      !isWithinExportImageBudget(options.width, contentHeight + frameHeight, options.scale)
    ) {
      throw new ExportDocumentError(
        "single-limit",
        "Long image exceeds the pixel budget",
        options.scale === 2 &&
          isWithinExportImageBudget(options.width, contentHeight + frameHeight, 1),
      )
    }
    const maxContentHeight = getExportImageContentHeight(options.width, options.scale, frameHeight)
    if (maxContentHeight < 1)
      throw new ExportDocumentError("limit", "Image frame exceeds the pixel budget")
    const slices =
      options.layout === "single"
        ? [{ start: 0, end: contentHeight }]
        : planExportImageSlices(contentHeight, collectBreaks(conversation), maxContentHeight)
    const pages: ExportImagePage[] = []
    onProgress(0, slices.length)
    for (const [index, slice] of slices.entries()) {
      signal.throwIfAborted()
      const { page, viewport } = createImageFrame(
        prepared,
        slice,
        index,
        slices.length,
        options.footerWatermarkSize,
      )
      const content = conversation.cloneNode(true) as HTMLElement
      content.style.transform = `translateY(-${slice.start}px)`
      viewport.append(content)
      root.after(page)
      try {
        const dimensions = page.getBoundingClientRect()
        const cssWidth = Math.ceil(dimensions.width)
        const width = Math.ceil(dimensions.width * options.scale)
        const height = Math.ceil(dimensions.height * options.scale)
        const slot = page.querySelector(".gh-export-watermark-slot")?.getBoundingClientRect()
        const watermarkSlot = slot
          ? {
              x: slot.left - dimensions.left,
              y: slot.top - dimensions.top,
              width: slot.width,
              height: slot.height,
            }
          : undefined
        if (!isWithinExportImageBudget(dimensions.width, dimensions.height, options.scale)) {
          throw new ExportDocumentError("limit", "Export image exceeds the pixel budget")
        }
        const canvas = await captureExportCanvas(page, {
          pixelRatio: options.scale,
          skipAutoScale: true,
          skipFonts: true,
          includeStyleProperties: CAPTURE_STYLES,
        })
        try {
          signal.throwIfAborted()
          const blob = await encodeCanvas(canvas, "png")
          signal.throwIfAborted()
          pages.push({ blob, width, height, cssWidth, watermarkSlot })
          onProgress(index + 1, slices.length)
        } finally {
          canvas.width = 0
          canvas.height = 0
        }
      } finally {
        page.remove()
      }
    }
    return pages
  } catch (error) {
    if (error instanceof RangeError) throw new ExportDocumentError("limit", error.message)
    throw error
  } finally {
    prepared.dispose()
  }
}

async function encodeCanvas(
  canvas: HTMLCanvasElement,
  format: ImageExportPreferences["format"],
): Promise<Blob> {
  // html-to-image 1.11.13 的 toBlob 不传递 type，显式调用浏览器编码器并校验结果。
  const mimeType = format === "jpeg" ? "image/jpeg" : "image/png"
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, 0.94))
  if (!blob || !blob.size || blob.type !== mimeType)
    throw new ExportDocumentError("render", "Image encoding failed")
  return blob
}

export function drawExportWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  watermark: ImageExportWatermark,
  theme: "light" | "dark",
  slot?: ExportImagePage["watermarkSlot"],
): void {
  if (!watermark.enabled || !watermark.text.trim()) return
  ctx.save()
  try {
    ctx.fillStyle = watermark.color || (theme === "dark" ? "#ffffff" : "#1f2937")
    ctx.globalAlpha = watermark.opacity
    ctx.font = `500 ${watermark.fontSize}px system-ui, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    if (watermark.mode === "footer") {
      if (!slot) throw new ExportDocumentError("render", "Watermark footer layout is missing")
      ctx.fillText(watermark.text, slot.x + slot.width / 2, slot.y + slot.height / 2, slot.width)
      return
    }
    const textWidth = Math.min(ctx.measureText(watermark.text).width, width - 48)
    const angle = (watermark.rotation * Math.PI) / 180
    // 按旋转后的包围盒计算间距，长文案和大字号同样不会互相重叠。
    const stepX =
      Math.abs(textWidth * Math.cos(angle)) +
      Math.abs(watermark.fontSize * Math.sin(angle)) +
      watermark.gapX
    const stepY =
      Math.abs(textWidth * Math.sin(angle)) +
      Math.abs(watermark.fontSize * Math.cos(angle)) +
      watermark.gapY
    for (let row = 0, y = -stepY / 2; y < height + stepY; row++, y += stepY) {
      const offset = watermark.stagger && row % 2 ? stepX / 2 : 0
      for (let x = -stepX / 2 + offset; x < width + stepX; x += stepX) {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(angle)
        ctx.fillText(watermark.text, 0, 0, textWidth)
        ctx.restore()
      }
    }
  } finally {
    ctx.restore()
  }
}

export async function composeExportImages(
  pages: ExportImagePage[],
  options: Pick<ImageExportPreferences, "format" | "scale" | "watermark"> & {
    theme: "light" | "dark"
  },
  signal: AbortSignal,
  onProgress: (completed: number, total: number) => void,
): Promise<ExportImagePage[]> {
  signal.throwIfAborted()
  if (options.format === "png" && (!options.watermark.enabled || !options.watermark.text.trim()))
    return pages
  const result: ExportImagePage[] = []
  onProgress(0, pages.length)
  for (const [index, page] of pages.entries()) {
    signal.throwIfAborted()
    const bitmap = await createImageBitmap(page.blob)
    const canvas = document.createElement("canvas")
    try {
      signal.throwIfAborted()
      canvas.width = page.width
      canvas.height = page.height
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new ExportDocumentError("render", "Canvas context is unavailable")
      ctx.drawImage(bitmap, 0, 0)
      ctx.scale(options.scale, options.scale)
      drawExportWatermark(
        ctx,
        page.width / options.scale,
        page.height / options.scale,
        options.watermark,
        options.theme,
        page.watermarkSlot,
      )
      const blob = await encodeCanvas(canvas, options.format)
      signal.throwIfAborted()
      result.push({ ...page, blob })
      onProgress(index + 1, pages.length)
    } finally {
      bitmap.close()
      canvas.width = 0
      canvas.height = 0
    }
  }
  return result
}
