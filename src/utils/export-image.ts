import { captureExportCanvas } from "~platform/image-capture"
import {
  createExportBrand,
  ExportDocumentError,
  prepareExportDocument,
  type ExportDocumentInput,
  type ExportDocumentOptions,
} from "~utils/export-document"
import { planExportImageSlices } from "~utils/export-image-layout"

export interface ExportImageOptions extends ExportDocumentOptions {
  format: "png" | "jpeg"
  scale: 1 | 2
}

export interface ExportImagePage {
  blob: Blob
  width: number
  height: number
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
  "border-radius",
  "border-top",
  "border-bottom",
  "border-left",
  "border-right",
  "background",
  "background-color",
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
  "text-indent",
  "text-transform",
  "text-rendering",
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
  "flex-direction",
  "flex-wrap",
  "align-items",
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

export async function renderExportImages(
  input: ExportDocumentInput,
  options: ExportImageOptions,
  signal: AbortSignal,
  onProgress: (completed: number, total: number) => void,
): Promise<ExportImagePage[]> {
  const prepared = await prepareExportDocument(input, options, signal)
  try {
    signal.throwIfAborted()
    const { root, conversation, header } = prepared
    const bounds = conversation.getBoundingClientRect()
    if (!bounds.height || !bounds.width)
      throw new ExportDocumentError("render", "Empty export layout")
    const slices = planExportImageSlices(bounds.height, collectBreaks(conversation))
    const pages: ExportImagePage[] = []
    onProgress(0, slices.length)
    for (const [index, slice] of slices.entries()) {
      signal.throwIfAborted()
      const page = document.createElement("div")
      page.className = root.className
      page.dataset.theme = options.theme
      page.style.width = `${options.width}px`
      const shell = document.createElement("main")
      shell.className = "gh-shell"
      shell.append(header.cloneNode(true))
      const viewport = document.createElement("div")
      viewport.className = "gh-export-slice"
      viewport.style.height = `${slice.end - slice.start}px`
      viewport.style.marginTop = "28px"
      const content = conversation.cloneNode(true) as HTMLElement
      content.style.transform = `translateY(-${slice.start}px)`
      viewport.append(content)
      shell.append(viewport)
      const footer = createExportBrand(prepared, index, slices.length)
      if (footer) shell.append(footer)
      page.append(shell)
      root.after(page)
      try {
        const width = Math.ceil(page.getBoundingClientRect().width * options.scale)
        const height = Math.ceil(page.getBoundingClientRect().height * options.scale)
        if (width * height > 16_000_000 || Math.max(width, height) > 16_000) {
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
          // html-to-image 1.11.13 的 toBlob 不传递 type，显式使用浏览器编码器。
          const mimeType = options.format === "jpeg" ? "image/jpeg" : "image/png"
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, mimeType, 0.94),
          )
          signal.throwIfAborted()
          if (!blob || blob.size === 0 || blob.type !== mimeType) {
            throw new ExportDocumentError("render", "Image encoding failed")
          }
          pages.push({ blob, width, height })
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
