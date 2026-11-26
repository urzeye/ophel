import { captureExportCanvas } from "~platform/image-capture"
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
  format: "png" | "jpeg"
  scale: 1 | 2
  layout: "single" | "split"
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

function createImageFrame(
  prepared: PreparedExportDocument,
  slice: ExportImageSlice,
  index: number,
  total: number,
): { page: HTMLElement; viewport: HTMLElement } {
  const page = document.createElement("div")
  page.className = prepared.root.className
  page.dataset.theme = prepared.options.theme
  page.style.width = `${prepared.options.width}px`
  const shell = document.createElement("main")
  shell.className = "gh-shell"
  shell.append(prepared.header.cloneNode(true))
  const viewport = document.createElement("div")
  viewport.className = "gh-export-slice"
  viewport.style.height = `${slice.end - slice.start}px`
  viewport.style.marginTop = "28px"
  shell.append(viewport)
  const footer = createExportBrand(prepared, index, total)
  if (footer) shell.append(footer)
  page.append(shell)
  return { page, viewport }
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
    const { root, conversation } = prepared
    const bounds = conversation.getBoundingClientRect()
    if (!bounds.height || !bounds.width)
      throw new ExportDocumentError("render", "Empty export layout")
    const contentHeight = Math.ceil(bounds.height)
    // 用同一个框架测量实际开销；1px 正文避免空块的 margin 折叠改变高度。
    const probe = createImageFrame(prepared, { start: 0, end: 1 }, 0, 1)
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
      const { page, viewport } = createImageFrame(prepared, slice, index, slices.length)
      const content = conversation.cloneNode(true) as HTMLElement
      content.style.transform = `translateY(-${slice.start}px)`
      viewport.append(content)
      root.after(page)
      try {
        const dimensions = page.getBoundingClientRect()
        const width = Math.ceil(dimensions.width * options.scale)
        const height = Math.ceil(dimensions.height * options.scale)
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
