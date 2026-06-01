import { createUniqueExportAssetPath, type ExportAsset } from "~utils/exporter"

export interface ExportAssetCollector {
  assets: ExportAsset[]
  usedPaths: Set<string>
  imagePathsBySource?: Map<string, string>
  filePathsBySource?: Map<string, string>
}

export type ExportAttachmentKind = "image" | "file"
export type ExportAssetRole = "user" | "assistant"

export interface ExportAttachment {
  kind: ExportAttachmentKind
  name: string
  source?: string
  type?: string
  sizeLabel?: string
}

export interface ExportImageReference {
  source: string
  alt?: string
  extensionHint?: string
}

export interface ParsedExportFileAttachmentText {
  name: string
  type: string
  sizeLabel: string
}

export interface MarkdownDocumentAssetOptions {
  title?: string | null
  fallbackTitle?: string
  directory?: string
  idPrefix?: string
  description?: string
}

export interface ExportAssetReference {
  name: string
  path: string
}

export interface ExportImageAssetOptions {
  source: string
  alt?: string
  extensionHint?: string
  directory?: string
  idPrefix?: string
  filenamePrefix?: string
}

export interface ExportFileAssetOptions {
  source: string
  name: string
  mimeHint?: string
  directory?: string
  idPrefix?: string
  kind?: ExportAsset["kind"]
}

export interface ExportImageMarkdownOptions<T extends ExportImageReference = ExportImageReference> {
  siteId: string
  role: ExportAssetRole
  category?: string
  fallbackAlt?: string
  directory?: string
  prefix?: string
  getAlt?: (image: T) => string
  getExtensionHint?: (image: T) => string
}

export interface ExportAttachmentImageMarkdownOptions<
  T extends ExportAttachment = ExportAttachment,
> {
  siteId: string
  role?: ExportAssetRole
  category?: string
  fallbackAlt?: string
  directory?: string
  prefix?: string
  getAlt?: (attachment: T) => string
  getExtensionHint?: (attachment: T) => string
}

export interface ExportAttachmentFileMarkdownOptions<
  T extends ExportAttachment = ExportAttachment,
> {
  siteId: string
  role?: ExportAssetRole
  category?: string
  directory?: string
  prefix?: string
  fallbackName?: string
  getLabel?: (attachment: T) => string
  getMimeHint?: (attachment: T) => string | undefined
  includeAttachment?: (attachment: T) => boolean
}

export function createExportAssetCollector(): ExportAssetCollector {
  return {
    assets: [],
    usedPaths: new Set<string>(),
    imagePathsBySource: new Map<string, string>(),
    filePathsBySource: new Map<string, string>(),
  }
}

export function sanitizeExportFilename(value: string, fallback = "file", maxLength = 120): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, maxLength)
  return sanitized || fallback
}

export function escapeMarkdownLinkText(value: string): string {
  return value.replace(/[[\]]/g, "\\$&")
}

export function sanitizeExportAssetPrefixPart(value: string, fallback = "asset"): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return sanitized || fallback
}

export function createExportAssetPrefix(
  parts: Array<string | null | undefined | false>,
  fallback = "asset",
): string {
  const prefix = parts
    .filter((part): part is string => Boolean(part))
    .map((part) => sanitizeExportAssetPrefixPart(part, ""))
    .filter(Boolean)
    .join("-")
  return prefix || fallback
}

export function getExportAttachmentSourceKey(source: string): string {
  if (!source) return ""
  if (/^(blob:|data:)/i.test(source)) return source

  try {
    const url = new URL(source, window.location.href)
    return `${url.host.toLowerCase()}${url.pathname}`
  } catch {
    return source.split(/[?#]/)[0]
  }
}

export function extractExportFilenameFromUrl(
  source: string,
  options: { ignoreGenericDownload?: boolean } = {},
): string {
  if (!source) return ""

  try {
    const pathname = new URL(source, window.location.href).pathname
    const filename = decodeURIComponent(pathname.split("/").pop() || "")
    if (options.ignoreGenericDownload && filename === "download") return ""
    return filename
  } catch {
    return ""
  }
}

export function extractExportExtension(value: string): string {
  return value.match(/\.([A-Za-z0-9]{1,10})(?:$|[?#\s])/)?.[1]?.toLowerCase() || ""
}

export function extractExportExtensionFromUrl(source: string): string {
  return extractExportExtension(extractExportFilenameFromUrl(source))
}

export function parseExportFileAttachmentText(textParts: string[]): ParsedExportFileAttachmentText {
  const parts = textParts.map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean)
  let name = ""

  for (let index = 0; index < parts.length - 1; index += 1) {
    if (/^\.[A-Za-z0-9]{1,10}$/.test(parts[index + 1])) {
      name = `${parts[index]}${parts[index + 1]}`
      break
    }
  }

  if (!name) {
    name = parts.find((part) => /^[^.\s].*\.[A-Za-z0-9]{1,10}$/.test(part)) || ""
  }

  const extensionPart = parts.find((part) => /^\.[A-Za-z0-9]{1,10}$/.test(part)) || ""
  const sizeLabel = parts.find((part) => /^\d+(?:\.\d+)?\s*(?:B|KB|MB|GB|TB)$/i.test(part)) || ""
  const fallbackName =
    name ||
    parts.find((part) => part !== sizeLabel && !/^\.[A-Za-z0-9]{1,10}$/.test(part)) ||
    extensionPart
  const type = extractExportExtension(fallbackName) || (extensionPart ? extensionPart.slice(1) : "")

  return { name: fallbackName, type, sizeLabel }
}

export function formatExportAttachmentLabel(
  attachment: Pick<ExportAttachment, "name" | "type" | "sizeLabel">,
): string {
  const name = attachment.name || "attachment"
  const type = attachment.type?.trim() || ""
  const details = [
    type && !name.toLowerCase().endsWith(`.${type.toLowerCase()}`) ? type : "",
    attachment.sizeLabel || "",
  ].filter(Boolean)

  return details.length > 0 ? `${name} (${details.join(", ")})` : name
}

export function extractMarkdownTitle(content: string, fallback = "document"): string {
  const titleLine = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .find((line) => /^#\s+/.test(line.trim()))
  return titleLine?.replace(/^#\s+/, "").trim() || fallback
}

export function buildMarkdownFilename(title: string, fallback = "document"): string {
  return `${sanitizeExportFilename(title, fallback, 80)}.md`
}

export function normalizeExportAssetUrl(value: string): string {
  if (!value) return ""
  if (/^(blob:|data:)/i.test(value)) return value

  try {
    return new URL(value, window.location.href).toString()
  } catch {
    return value
  }
}

export function isDownloadableExportAssetUrl(value: string): boolean {
  if (!value) return false
  if (/^(blob:|data:)/i.test(value)) return true
  if (!/^https?:\/\//i.test(value)) return false

  try {
    const url = new URL(value)
    if (url.hostname === window.location.hostname && /^\/?(app|share)(\/|$)/.test(url.pathname)) {
      return false
    }
    if (/faviconV2|google_logo_icon|\/32\/type\//i.test(url.href)) return false
    return true
  } catch {
    return false
  }
}

export function dataUrlToExportBlob(dataUrl: string): Blob {
  const [header, payload = ""] = dataUrl.split(",", 2)
  const mimeType = header.match(/^data:([^;]+)/)?.[1] || "application/octet-stream"
  const isBase64 = /;base64/i.test(header)

  if (!isBase64) {
    return new Blob([decodeURIComponent(payload)], { type: mimeType })
  }

  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mimeType })
}

export function getExtensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(";")[0].trim()
  const extensions: Record<string, string> = {
    "application/msword": "doc",
    "application/json": "json",
    "application/pdf": "pdf",
    "application/vnd.ms-excel": "xls",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "image/avif": "avif",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "text/csv": "csv",
    "text/html": "html",
    "text/markdown": "md",
    "text/plain": "txt",
    "video/mp4": "mp4",
    "video/webm": "webm",
  }
  return extensions[normalized] || ""
}

export function getMimeTypeFromExtension(extension: string): string {
  const normalized = extension.toLowerCase().replace(/^\./, "")
  const mimeTypes: Record<string, string> = {
    avif: "image/avif",
    csv: "text/csv",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    gif: "image/gif",
    htm: "text/html",
    html: "text/html",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    json: "application/json",
    m4a: "audio/mp4",
    md: "text/markdown;charset=utf-8",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    ogg: "audio/ogg",
    pdf: "application/pdf",
    png: "image/png",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    svg: "image/svg+xml",
    txt: "text/plain;charset=utf-8",
    wav: "audio/wav",
    webm: "video/webm",
    webp: "image/webp",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }
  return mimeTypes[normalized] || ""
}

export function getExtensionFromExportAssetHint(hint: string): string {
  const normalized = hint.toLowerCase().split(";")[0].trim().replace(/^\./, "")
  if (!normalized) return ""
  const filenameExtension = normalized.match(/\.([a-z0-9]{1,10})$/)?.[1] || ""
  if (filenameExtension && getMimeTypeFromExtension(filenameExtension)) {
    return filenameExtension
  }
  const extension = getExtensionFromMimeType(normalized)
  if (extension) return extension
  return getMimeTypeFromExtension(normalized) ? normalized : ""
}

export function getExportAssetExtension(source: string): string {
  if (source.startsWith("data:")) {
    const mimeType = source.match(/^data:([^;,]+)/)?.[1] || ""
    return getExtensionFromMimeType(mimeType)
  }

  try {
    const pathname = new URL(source, window.location.href).pathname
    return pathname.match(/\.([A-Za-z0-9]{1,10})$/)?.[1]?.toLowerCase() || ""
  } catch {
    return ""
  }
}

export function normalizeImageExtension(value: string): string {
  const extension = value
    .toLowerCase()
    .replace(/^jpg$/, "jpeg")
    .replace(/^svg\+xml$/, "svg")
  if (["png", "jpeg", "webp", "gif", "avif", "svg"].includes(extension)) {
    return extension === "jpeg" ? "jpg" : extension
  }
  return "png"
}

export function getImageExportExtension(source: string, hint = ""): string {
  if (source.startsWith("data:image/")) {
    const match = source.match(/^data:image\/([a-zA-Z0-9.+-]+)[;,]/)
    return normalizeImageExtension(match?.[1] || "png")
  }

  return normalizeImageExtension(
    getExportAssetExtension(source) || getExtensionFromExportAssetHint(hint) || "png",
  )
}

export function getImageExportMimeType(source: string, extension: string): string {
  if (source.startsWith("data:image/")) {
    return source.slice(5, source.indexOf(";"))
  }

  if (extension === "svg") return "image/svg+xml"
  return extension === "jpg" ? "image/jpeg" : `image/${extension}`
}

export function getExportAssetMimeType(
  source: string,
  hint: string,
  kind: ExportAsset["kind"] = "file",
): string | undefined {
  if (source.startsWith("data:")) {
    return source.match(/^data:([^;,]+)/)?.[1] || undefined
  }

  const normalizedHint = hint.toLowerCase().split(";")[0].trim()
  if (normalizedHint.includes("/")) return normalizedHint

  const lowerHint = normalizedHint
  const extension = lowerHint.match(/\.([a-z0-9]{1,10})$/)?.[1] || lowerHint
  const fromExtension = extension ? getMimeTypeFromExtension(extension) : ""
  if (fromExtension) return fromExtension

  if (kind === "audio") return "audio/mpeg"
  if (kind === "video") return "video/mp4"
  return undefined
}

export function ensureExportFilenameExtension(
  filename: string,
  source: string,
  mimeHint?: string,
): string {
  const cleanName = filename || "file"
  if (/\.[A-Za-z0-9]{1,10}$/.test(cleanName)) return cleanName

  const extension =
    getExportAssetExtension(source) || getExtensionFromExportAssetHint(mimeHint || "")
  return extension ? `${cleanName}.${extension}` : cleanName
}

export function addImageExportAsset(
  collector: ExportAssetCollector,
  options: ExportImageAssetOptions,
): string {
  const source = normalizeExportAssetUrl(options.source)
  if (!source) return ""

  collector.imagePathsBySource ??= new Map<string, string>()
  const existingPath = collector.imagePathsBySource.get(source)
  if (existingPath) return existingPath

  const index = collector.imagePathsBySource.size + 1
  const extension = getImageExportExtension(source, options.extensionHint || options.alt || "")
  const filenamePrefix = options.filenamePrefix || options.idPrefix || "image"
  const requestedName = `${filenamePrefix}-${String(index).padStart(3, "0")}.${extension}`
  const directory = (options.directory || "assets/images").replace(/\/+$/, "")
  const path = createUniqueExportAssetPath(`${directory}/${requestedName}`, collector.usedPaths)
  const name = path.split("/").pop() || requestedName

  collector.imagePathsBySource.set(source, path)
  collector.assets.push({
    id: `${options.idPrefix || "image"}-${index}`,
    name,
    relativePath: path,
    mimeType: getImageExportMimeType(source, extension),
    kind: "image",
    content: source.startsWith("data:image/") ? dataUrlToExportBlob(source) : undefined,
    sourceUrl: source.startsWith("data:image/") ? undefined : source,
    description: options.alt || undefined,
  })

  return path
}

export function addFileExportAsset(
  collector: ExportAssetCollector,
  options: ExportFileAssetOptions,
): string {
  const source = normalizeExportAssetUrl(options.source)
  if (!source) return ""

  collector.filePathsBySource ??= new Map<string, string>()
  const existingPath = collector.filePathsBySource.get(source)
  if (existingPath) return existingPath

  const kind = options.kind || "file"
  const filename = ensureExportFilenameExtension(
    sanitizeExportFilename(options.name || "file"),
    source,
    options.mimeHint,
  )
  const directory = (options.directory || "assets/files").replace(/\/+$/, "")
  const path = createUniqueExportAssetPath(`${directory}/${filename}`, collector.usedPaths)
  const name = path.split("/").pop() || filename
  const mimeType = getExportAssetMimeType(source, options.mimeHint || name, kind)

  collector.filePathsBySource.set(source, path)
  collector.assets.push({
    id: `${options.idPrefix || kind || "file"}-${collector.filePathsBySource.size}`,
    name,
    relativePath: path,
    mimeType,
    kind,
    content: source.startsWith("data:") ? dataUrlToExportBlob(source) : undefined,
    sourceUrl: source.startsWith("data:") ? undefined : source,
    description: options.name || undefined,
  })

  return path
}

export function formatExportImageMarkdown<T extends ExportImageReference>(
  image: T,
  collector: ExportAssetCollector | undefined,
  options: ExportImageMarkdownOptions<T>,
): string {
  if (!image.source) return ""

  const fallbackAlt = options.fallbackAlt || "image"
  const alt = (options.getAlt?.(image) || image.alt || fallbackAlt).trim() || fallbackAlt
  const label = escapeMarkdownLinkText(alt)
  const prefix =
    options.prefix ||
    createExportAssetPrefix([options.siteId, options.role, options.category || "image"])
  const assetPath = collector
    ? addImageExportAsset(collector, {
        source: image.source,
        alt,
        extensionHint:
          options.getExtensionHint?.(image) || image.extensionHint || image.alt || fallbackAlt,
        directory: options.directory || "assets/images",
        idPrefix: prefix,
        filenamePrefix: prefix,
      })
    : image.source

  return assetPath ? `![${label}](${assetPath})` : ""
}

export function formatExportImageMarkdownList<T extends ExportImageReference>(
  images: T[],
  collector: ExportAssetCollector | undefined,
  options: ExportImageMarkdownOptions<T>,
): string[] {
  return images.map((image) => formatExportImageMarkdown(image, collector, options)).filter(Boolean)
}

export function formatExportImageAttachments<T extends ExportAttachment>(
  attachments: T[],
  collector: ExportAssetCollector | undefined,
  options: ExportAttachmentImageMarkdownOptions<T>,
): string[] {
  return attachments
    .filter((attachment) => attachment.kind === "image" && Boolean(attachment.source))
    .map((attachment) =>
      formatExportImageMarkdown(
        {
          source: attachment.source || "",
          alt: options.getAlt?.(attachment) || attachment.name,
          extensionHint:
            options.getExtensionHint?.(attachment) || attachment.name || attachment.type || "",
        },
        collector,
        {
          siteId: options.siteId,
          role: options.role || "user",
          category: options.category || "image",
          fallbackAlt: options.fallbackAlt || "uploaded image",
          directory: options.directory,
          prefix: options.prefix,
        },
      ),
    )
    .filter(Boolean)
}

export function formatExportFileAttachments<T extends ExportAttachment>(
  attachments: T[],
  collector: ExportAssetCollector | undefined,
  options: ExportAttachmentFileMarkdownOptions<T>,
): string[] {
  const prefix =
    options.prefix ||
    createExportAssetPrefix([options.siteId, options.role || "user", options.category || "file"])
  const fallbackName = options.fallbackName || "attachment"

  return attachments
    .filter((attachment) =>
      options.includeAttachment
        ? options.includeAttachment(attachment)
        : attachment.kind === "file",
    )
    .map((attachment) => {
      const label = escapeMarkdownLinkText(
        options.getLabel?.(attachment) || formatExportAttachmentLabel(attachment) || fallbackName,
      )
      const assetPath =
        attachment.source && collector
          ? addFileExportAsset(collector, {
              source: attachment.source,
              name: attachment.name || fallbackName,
              mimeHint: options.getMimeHint?.(attachment) || attachment.type || attachment.name,
              directory: options.directory || "assets/files",
              idPrefix: prefix,
            })
          : attachment.source

      return assetPath ? `- [${label}](${assetPath})` : `- ${label}`
    })
}

export function addMarkdownDocumentAsset(
  collector: ExportAssetCollector,
  content: string,
  options: MarkdownDocumentAssetOptions = {},
): ExportAssetReference {
  const fallbackTitle = options.fallbackTitle || "document"
  const title = options.title || extractMarkdownTitle(content, fallbackTitle)
  const name = buildMarkdownFilename(title, fallbackTitle)
  const description = options.description ?? (options.title || undefined)
  const existing = collector.assets.find(
    (asset) =>
      asset.kind === "document" && asset.content === content && asset.description === description,
  )
  if (existing?.relativePath) {
    return { name: existing.name, path: existing.relativePath }
  }

  const directory = (options.directory || "assets/documents").replace(/\/+$/, "")
  const path = createUniqueExportAssetPath(`${directory}/${name}`, collector.usedPaths)
  const pathName = path.split("/").pop() || name

  collector.assets.push({
    id: `${options.idPrefix || "document"}-${collector.assets.length + 1}`,
    name: pathName,
    relativePath: path,
    mimeType: "text/markdown;charset=utf-8",
    kind: "document",
    content,
    description,
  })

  return { name: pathName, path }
}

export function appendMarkdownDocumentAssetLink(
  collector: ExportAssetCollector,
  content: string,
  options: MarkdownDocumentAssetOptions = {},
): string {
  const asset = addMarkdownDocumentAsset(collector, content, options)
  return `${content}\n\n[${escapeMarkdownLinkText(asset.name)}](${asset.path})`
}

export function createMarkdownDocumentAssetLink(
  collector: ExportAssetCollector,
  content: string,
  options: MarkdownDocumentAssetOptions = {},
): string {
  const asset = addMarkdownDocumentAsset(collector, content, options)
  const label = options.title || asset.name
  return `[${escapeMarkdownLinkText(label)}](${asset.path})`
}
