import { createUniqueExportAssetPath, type ExportAsset } from "~utils/exporter"

export interface ExportAssetCollector {
  assets: ExportAsset[]
  usedPaths: Set<string>
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

export function createExportAssetCollector(): ExportAssetCollector {
  return {
    assets: [],
    usedPaths: new Set<string>(),
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
