import type { toCanvas } from "html-to-image"

export const captureExportCanvas: typeof toCanvas = (node, options) => {
  const library = (
    globalThis as typeof globalThis & { htmlToImage?: { toCanvas: typeof toCanvas } }
  ).htmlToImage
  if (!library?.toCanvas) {
    throw new Error(
      "html-to-image is unavailable. Update the userscript to refresh its dependencies.",
    )
  }
  return library.toCanvas(node, options)
}
