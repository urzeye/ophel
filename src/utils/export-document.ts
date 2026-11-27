import { getExportImageDocumentCss } from "~styles/export-document-inline"
import { getAppIconUrl } from "~utils/config"
import {
  getExportHtmlCss,
  formatToHTML,
  resolveAssetData,
  type ExportAsset,
  type ExportBundle,
  type ExportMetadata,
} from "~utils/exporter"
import { t } from "~utils/i18n"
import { ensureMermaidRuntime, requestMermaidRender } from "~utils/mermaid-runtime"
import { createSafeHTML } from "~utils/trusted-types"
import type { ImageExportPreferences } from "~types/image-export"

/** 格式无关的数据快照：未来 PDF 复用视图，DOCX 复用消息和资源。 */
export interface ExportDocumentInput extends ExportBundle {
  metadata: ExportMetadata
  filename: string
}

export interface ExportDocumentOptions {
  theme: "light" | "dark"
  width: number
  branding: boolean
  fontSize: number
  appearance: ImageExportPreferences["appearance"]
  showTitle: boolean
  showSource: boolean
  showTime: boolean
  includeQuestions?: boolean
}

export interface PreparedExportDocument {
  root: HTMLElement
  conversation: HTMLElement
  header: HTMLElement | null
  logo: string
  options: ExportDocumentOptions
  dispose(): void
}

export class ExportDocumentError extends Error {
  constructor(
    readonly kind: "image" | "diagram" | "render" | "limit" | "single-limit",
    detail = "",
    readonly canReduceScale = false,
  ) {
    super(detail)
    this.name = "ExportDocumentError"
  }
}

function blobToDataURL(blob: Blob, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const cleanup = () => signal.removeEventListener("abort", onAbort)
    const onAbort = () => {
      reader.abort()
      cleanup()
      reject(signal.reason)
    }
    reader.onload = () => {
      cleanup()
      resolve(String(reader.result))
    }
    reader.onerror = () => {
      cleanup()
      reject(reader.error || new Error("Image decoding failed"))
    }
    signal.addEventListener("abort", onAbort, { once: true })
    reader.readAsDataURL(blob)
  })
}

export async function resolveExportImage(
  source: string,
  assets: ExportAsset[],
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted()
  if (/^data:image\//i.test(source)) return source
  const asset = assets.find(
    (item) =>
      item.relativePath === source ||
      item.sourceUrl === source ||
      item.relativePath?.split("/").map(encodeURIComponent).join("/") === source,
  )
  if (
    !asset &&
    !/^(https?:|blob:|chrome-extension:|moz-extension:|safari-web-extension:)/i.test(source)
  ) {
    throw new ExportDocumentError("image", source)
  }
  try {
    const data = await resolveAssetData(
      asset || { name: "image", sourceUrl: source, kind: "image" },
    )
    signal.throwIfAborted()
    const blob =
      data instanceof Blob ? data : new Blob([data], { type: asset?.mimeType || "image/png" })
    return await blobToDataURL(blob, signal)
  } catch (error) {
    signal.throwIfAborted()
    throw new ExportDocumentError("image", error instanceof Error ? error.message : String(error))
  }
}

function loadExportImage(
  image: HTMLImageElement,
  source: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      image.removeEventListener("load", onLoad)
      image.removeEventListener("error", onError)
      signal.removeEventListener("abort", onAbort)
    }
    const onLoad = () => {
      cleanup()
      if (image.naturalWidth > 0) resolve()
      else reject(new ExportDocumentError("image", `${image.alt}: Empty image`))
    }
    const onError = () => {
      cleanup()
      reject(new ExportDocumentError("image", `${image.alt}: Image loading failed`))
    }
    const onAbort = () => {
      cleanup()
      reject(signal.reason)
    }
    const timer = setTimeout(onError, 15000)
    image.addEventListener("load", onLoad, { once: true })
    image.addEventListener("error", onError, { once: true })
    signal.addEventListener("abort", onAbort, { once: true })
    // 替换已加载元素的 src 后立即 decode()，Firefox 可能仍检查旧请求并拒绝。
    image.src = source
  })
}

async function prepareDiagrams(root: HTMLElement, theme: "light" | "dark", signal: AbortSignal) {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>("pre > code.language-mermaid"))
  if (blocks.length === 0) return
  try {
    await ensureMermaidRuntime()
    for (const code of blocks) {
      signal.throwIfAborted()
      const preview = document.createElement("div")
      preview.className = "gh-export-diagram"
      const requestId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      preview.setAttribute("data-ophel-assistant-mermaid-preview-id", requestId)
      preview.setAttribute("data-ophel-assistant-mermaid-render-token", requestId)
      const wrapper = code.closest(".gh-code-wrapper") || code.parentElement!
      wrapper.replaceWith(preview)
      await requestMermaidRender(
        {
          requestId,
          previewId: requestId,
          source: code.textContent || "",
          theme: theme === "dark" ? "dark" : "default",
          exportImage: true,
        },
        signal,
      )
      if (!preview.querySelector("svg")) throw new Error("Mermaid preview container not found")
    }
  } catch (error) {
    signal.throwIfAborted()
    throw new ExportDocumentError("diagram", error instanceof Error ? error.message : String(error))
  }
}

export async function prepareExportDocument(
  input: ExportDocumentInput,
  options: ExportDocumentOptions,
  signal: AbortSignal,
): Promise<PreparedExportDocument> {
  signal.throwIfAborted()
  const host = document.createElement("div")
  host.setAttribute("aria-hidden", "true")
  host.setAttribute("data-ophel-export-renderer", "true")
  host.inert = true
  Object.assign(host.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: `${options.width}px`,
    pointerEvents: "none",
  })
  const shadow = host.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent =
    getExportHtmlCss()
      .replaceAll(":root", ".gh-export-document")
      .replaceAll('html[data-theme="dark"]', '.gh-export-document[data-theme="dark"]')
      .replace(/(^|[\s,])(?:html|body)(?=\s*[{,])/g, "$1.gh-export-document") +
    getExportImageDocumentCss()
  const parsed = new DOMParser().parseFromString(
    createSafeHTML(formatToHTML(input.metadata, input.messages)),
    "text/html",
  )
  const root = document.createElement("div")
  root.className = "gh-export-document"
  root.dataset.theme = options.theme
  root.dataset.appearance = options.appearance
  root.dataset.width = String(options.width)
  root.style.setProperty("--gh-export-font-size", `${options.fontSize}px`)
  root.style.width = `${options.width}px`
  const shell = parsed.querySelector(".gh-shell")
  if (!shell) throw new ExportDocumentError("render", "Document content is missing")
  root.append(document.importNode(shell, true))
  root
    .querySelectorAll(".gh-toolbar, .gh-code-copy-btn, .gh-doc-footer, .gh-kicker")
    .forEach((node) => node.remove())
  // 先由 formatToHTML 基于完整对话计算轮次编号，再按选项隐藏用户提问节点，避免开启消息编号时序号丢失。
  if (options.includeQuestions === false) {
    root.querySelectorAll('.gh-message[data-role="user"]').forEach((node) => node.remove())
  }
  const header = root.querySelector<HTMLElement>(".gh-doc-header")!
  const effectiveShowTitle = options.showTitle && Boolean(input.metadata.title.trim())
  const effectiveShowTime = options.showTime && Boolean(input.metadata.exportTime.trim())
  const effectiveShowSource = options.showSource && Boolean(input.metadata.source.trim())
  if (!effectiveShowTitle) header.querySelector("h1")?.remove()
  const meta = header.querySelector<HTMLElement>(".gh-doc-meta")!
  const [time, dot, source] = Array.from(meta.children)
  if (time) time.className = "gh-doc-time"
  if (source) source.className = "gh-doc-source"
  if (!effectiveShowTime) time?.remove()
  if (!effectiveShowSource) source?.remove()
  if (!effectiveShowTime || !effectiveShowSource) dot?.remove()
  if (!effectiveShowTime && !effectiveShowSource) meta.remove()
  const hasHeader = effectiveShowTitle || effectiveShowSource || effectiveShowTime
  if (!hasHeader) header.remove()
  root.dataset.hasHeader = String(hasHeader)
  root.querySelectorAll("details").forEach((node) => (node.open = true))
  const imageSources = new Map<HTMLImageElement, string>()
  for (const image of Array.from(root.querySelectorAll("img"))) {
    imageSources.set(image, image.getAttribute("src") || "")
    // 接入活动文档前移除地址，避免相对附件路径先被宿主页错误请求。
    image.removeAttribute("src")
    image.removeAttribute("srcset")
    image.loading = "eager"
  }
  shadow.append(style, root)
  document.body.append(host)
  const removeHost = () => host.remove()
  signal.addEventListener("abort", removeHost, { once: true })
  const dispose = () => {
    signal.removeEventListener("abort", removeHost)
    host.remove()
  }
  try {
    await prepareDiagrams(root, options.theme, signal)
    // 将附件内嵌后再捕获，避免截图库重新下载带鉴权或跨域资源。
    const cache = new Map<string, Promise<string>>()
    const resolve = (source: string) => {
      if (!cache.has(source))
        cache.set(source, resolveExportImage(source, input.assets || [], signal))
      return cache.get(source)!
    }
    for (const [image, source] of imageSources) {
      signal.throwIfAborted()
      await loadExportImage(image, await resolve(source), signal)
    }
    const logo = options.branding ? await resolve(getAppIconUrl()) : ""
    // 成品使用系统字体，不等待宿主页无关的网络字体。
    signal.throwIfAborted()
    // 超宽公式整体缩放，保留排版；先批量测量再统一写入，避免多公式循环触发读写交替回流。
    const mathScales: Array<{ node: HTMLElement; ratio: number }> = []
    for (const math of Array.from(root.querySelectorAll<HTMLElement>(".math-block"))) {
      const rendered = math.querySelector("math")
      if (!rendered) continue
      const renderedWidth = rendered.getBoundingClientRect().width
      if (!renderedWidth) continue
      const ratio = Math.min(1, math.clientWidth / renderedWidth)
      if (ratio < 1) mathScales.push({ node: math, ratio })
    }
    for (const { node, ratio } of mathScales) {
      node.style.fontSize = `${ratio}em`
    }
    return {
      root,
      header: hasHeader ? header : null,
      conversation: root.querySelector<HTMLElement>(".gh-conversation")!,
      logo,
      options,
      dispose,
    }
  } catch (error) {
    dispose()
    throw error
  }
}

export function createExportBrand(
  prepared: PreparedExportDocument,
  index: number,
  count: number,
): HTMLElement | null {
  if (!prepared.options.branding) return null
  const footer = document.createElement("footer")
  footer.className = "gh-export-brand"
  const signature = document.createElement("span")
  signature.className = "gh-export-brand-signature"
  const logo = document.createElement("img")
  logo.src = prepared.logo
  logo.alt = ""
  const text = document.createElement("strong")
  text.textContent = t("imageExportPoweredBy")
  signature.append(logo, text)
  const site = document.createElement("span")
  site.className = "gh-export-brand-site"
  site.textContent = `ophel.app${count > 1 ? ` · ${index + 1} / ${count}` : ""}`
  footer.append(signature, site)
  return footer
}
