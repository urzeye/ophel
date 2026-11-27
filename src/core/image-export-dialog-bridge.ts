import type { ExportDocumentInput } from "~utils/export-document"

export type ImageExportDialogHandler = (input: ExportDocumentInput) => Promise<boolean>

let imageExportDialogHandler: ImageExportDialogHandler | null = null

export function registerImageExportDialogHandler(handler: ImageExportDialogHandler): () => void {
  imageExportDialogHandler = handler

  return () => {
    if (imageExportDialogHandler === handler) {
      imageExportDialogHandler = null
    }
  }
}

export function showImageExportDialog(input: ExportDocumentInput): Promise<boolean> {
  const handler = imageExportDialogHandler
  if (!handler) {
    return Promise.reject(new Error("[Ophel] Image export dialog is not available"))
  }

  return handler(input)
}
