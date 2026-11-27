import { useEffect, useMemo, useState } from "react"

import type { ImageExportPreferences } from "~types/image-export"
import type { ExportDocumentInput } from "~utils/export-document"
import {
  captureExportImages,
  composeExportImages,
  type ExportImageOptions,
  type ExportImagePage,
} from "~utils/export-image"

function useDebouncedValue<T>(value: T): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), 200)
    return () => clearTimeout(timer)
  }, [value])
  return settled
}

type CompositionOptions = Pick<ImageExportPreferences, "format" | "scale" | "watermark"> & {
  theme: "light" | "dark"
}
type PreviewPage = ExportImagePage & { url: string }

/** 用请求身份隔离过期结果；调整水印或格式只重做合成，不再捕获正文。 */
export function useImageExport(
  input: ExportDocumentInput,
  options: ExportImageOptions,
  composition: CompositionOptions,
  revision: number,
  enabled: boolean,
) {
  const request = useMemo(
    () => ({ input, options, revision, enabled }),
    [input, options, revision, enabled],
  )
  const settled = useDebouncedValue(request)
  const settledComposition = useDebouncedValue(composition)
  type Capture = { request: typeof request; pages: ExportImagePage[] }
  const [capture, setCapture] = useState<Capture | null>(null)
  const [captureError, setCaptureError] = useState<{
    request: typeof request
    error: Error
  } | null>(null)
  const [preview, setPreview] = useState<{
    capture: Capture
    options: CompositionOptions
    pages: PreviewPage[]
  } | null>(null)
  const [compositionError, setCompositionError] = useState<{
    capture: Capture
    options: CompositionOptions
    error: Error
  } | null>(null)
  const [progress, setProgress] = useState({ completed: 0, total: 0 })

  useEffect(() => {
    if (!settled.enabled) return
    const controller = new AbortController()
    setCapture(null)
    setPreview(null)
    setCompositionError(null)
    setCaptureError(null)
    setProgress({ completed: 0, total: 0 })
    void captureExportImages(
      settled.input,
      settled.options,
      controller.signal,
      (completed, total) => {
        if (!controller.signal.aborted) setProgress({ completed, total })
      },
    )
      .then((pages) => {
        if (!controller.signal.aborted) setCapture({ request: settled, pages })
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return
        console.error("[ImageExport] Capture failed:", failure)
        setCaptureError({
          request: settled,
          error: failure instanceof Error ? failure : new Error(String(failure)),
        })
      })
    return () => controller.abort()
  }, [settled])

  useEffect(() => {
    if (!capture || capture.request !== request || settledComposition !== composition) return
    const controller = new AbortController()
    const urls: string[] = []
    setPreview(null)
    setCompositionError(null)
    setProgress({ completed: 0, total: 0 })
    void composeExportImages(capture.pages, composition, controller.signal, (completed, total) => {
      if (!controller.signal.aborted) setProgress({ completed, total })
    })
      .then((pages) => {
        if (controller.signal.aborted) return
        setPreview({
          capture,
          options: composition,
          pages: pages.map((page) => {
            const url = URL.createObjectURL(page.blob)
            urls.push(url)
            return { ...page, url }
          }),
        })
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return
        console.error("[ImageExport] Composition failed:", failure)
        setCompositionError({
          capture,
          options: composition,
          error: failure instanceof Error ? failure : new Error(String(failure)),
        })
      })
    return () => {
      controller.abort()
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [capture, request, composition, settledComposition])

  const currentCapture = capture?.request === request ? capture : null
  const ready =
    currentCapture && preview?.capture === currentCapture && preview.options === composition
  const error =
    captureError?.request === request
      ? captureError.error
      : currentCapture &&
          compositionError?.capture === currentCapture &&
          compositionError.options === composition
        ? compositionError.error
        : null
  return { pages: ready ? preview.pages : [], progress, error, rendering: !ready && !error }
}
