import React, { useEffect, useMemo, useRef, useState } from "react"
import { createRoot } from "react-dom/client"

import { CopyIcon, DownloadIcon } from "~components/icons"
import { DialogOverlay } from "~components/ui/Dialog"
import { IMAGE_EXPORT_DIALOG_CSS } from "~styles/image-export-inline"
import { ExportDocumentError, type ExportDocumentInput } from "~utils/export-document"
import {
  renderExportImages,
  type ExportImageOptions,
  type ExportImagePage,
} from "~utils/export-image"
import { downloadBlob, downloadZipFiles } from "~utils/exporter"
import { t } from "~utils/i18n"
import { showToast } from "~utils/toast"

interface ImageExportDialogProps {
  input: ExportDocumentInput
  onClose: (exported: boolean) => void
}

function getRenderError(error: unknown): string {
  if (typeof error === "string") return error
  if (error instanceof ExportDocumentError) {
    if (error.kind === "image") return t("imageExportImageFailed")
    if (error.kind === "diagram") return t("imageExportDiagramFailed")
    if (error.kind === "limit") return t("imageExportLimit")
    if (error.kind === "single-limit") {
      return t(error.canReduceScale ? "imageExportSingleLimit" : "imageExportSingleLimitNoScale")
    }
  }
  return t("imageExportRenderFailed")
}

export function ImageExportDialog({ input, onClose }: ImageExportDialogProps) {
  const [format, setFormat] = useState<ExportImageOptions["format"]>("png")
  const [theme, setTheme] = useState<ExportImageOptions["theme"]>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  )
  const [scale, setScale] = useState<1 | 2>(2)
  const [layout, setLayout] = useState<ExportImageOptions["layout"]>("single")
  const [branding, setBranding] = useState(true)
  const [includeQuestions, setIncludeQuestions] = useState(true)
  const [revision, setRevision] = useState(0)
  const [pages, setPages] = useState<(ExportImagePage & { url: string })[]>([])
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [rendering, setRendering] = useState(true)
  const [error, setError] = useState<ExportDocumentError | string | null>(null)
  const [actionError, setActionError] = useState("")
  const [activity, setActivity] = useState<"download" | "copy" | null>(null)
  const saving = activity !== null
  const busyRef = useRef(saving)
  busyRef.current = saving
  const didExport = useRef(false)
  const closeButton = useRef<HTMLButtonElement>(null)
  const options = useMemo(
    () => ({ format, theme, scale, layout, branding, width: 800 }),
    [format, theme, scale, layout, branding],
  )
  const canCopy =
    pages.length === 1 &&
    format === "png" &&
    typeof ClipboardItem !== "undefined" &&
    !!navigator.clipboard?.write

  useEffect(() => {
    const previousFocus = document.activeElement
    const dialog = closeButton.current?.closest<HTMLElement>("[role='dialog']")
    if (dialog) dialog.tabIndex = -1
    closeButton.current?.focus()
    const trapFocus = (event: Event) => {
      const key = event as KeyboardEvent
      // Checkbox 的键盘保护会截断冒泡，关闭快捷键需在本弹窗捕获阶段处理。
      if (key.key === "Escape" && !busyRef.current) {
        key.preventDefault()
        key.stopPropagation()
        onClose(didExport.current)
        return
      }
      if (key.key !== "Tab" || !dialog) return
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), a[href]",
        ),
      ).filter((element) => !element.matches(":disabled"))
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog) {
        key.preventDefault()
        ;(key.shiftKey ? last : first)?.focus()
      } else if (key.shiftKey && document.activeElement === first) {
        key.preventDefault()
        last?.focus()
      } else if (!key.shiftKey && document.activeElement === last) {
        key.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener("keydown", trapFocus, true)
    return () => {
      document.removeEventListener("keydown", trapFocus, true)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [onClose])

  useEffect(() => {
    const controller = new AbortController()
    const urls: string[] = []
    setPages([])
    setRendering(true)
    setError(null)
    setActionError("")
    setProgress({ completed: 0, total: 0 })
    const messages = includeQuestions
      ? input.messages
      : input.messages.filter((message) => message.role !== "user")
    if (messages.length === 0) {
      setError(t("imageExportEmpty"))
      setRendering(false)
      return () => controller.abort()
    }
    void renderExportImages(
      { ...input, messages },
      options,
      controller.signal,
      (completed, total) => {
        if (!controller.signal.aborted) setProgress({ completed, total })
      },
    )
      .then((result) => {
        if (controller.signal.aborted) return
        setPages(
          result.map((page) => {
            const url = URL.createObjectURL(page.blob)
            urls.push(url)
            return { ...page, url }
          }),
        )
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return
        console.error("[ImageExport] Render failed:", failure)
        setError(failure instanceof ExportDocumentError ? failure : getRenderError(failure))
      })
      .finally(() => {
        if (!controller.signal.aborted) setRendering(false)
      })
    return () => {
      controller.abort()
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [input, options, includeQuestions, revision])

  const close = () => onClose(didExport.current)
  const download = async () => {
    if (!pages.length || rendering || saving) return
    setActivity("download")
    closeButton.current?.closest<HTMLElement>("[role='dialog']")?.focus()
    setActionError("")
    try {
      const extension = format === "jpeg" ? "jpg" : "png"
      const success =
        pages.length === 1
          ? await downloadBlob(pages[0].blob, `${input.filename}.${extension}`)
          : await downloadZipFiles(
              pages.map((page, index) => ({
                path: `${input.filename}-${String(index + 1).padStart(2, "0")}.${extension}`,
                data: page.blob,
              })),
              `${input.filename}.zip`,
            )
      if (success) {
        didExport.current = true
        showToast(t("exportSuccess"))
      } else setActionError(t("exportFailed"))
    } finally {
      setActivity(null)
    }
  }
  const copy = async () => {
    if (!canCopy || saving || rendering) return
    setActivity("copy")
    closeButton.current?.closest<HTMLElement>("[role='dialog']")?.focus()
    setActionError("")
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pages[0].blob })])
      didExport.current = true
      showToast(t("copySuccess"))
    } catch {
      setActionError(t("imageExportCopyFailed"))
    } finally {
      setActivity(null)
    }
  }
  const status = saving
    ? t(activity === "copy" ? "imageExportCopying" : "exportOverlayDownloading")
    : rendering
      ? progress.total
        ? t("imageExportProgress", {
            current: String(progress.completed),
            total: String(progress.total),
          })
        : t("imageExportPreparing")
      : pages.length
        ? t("imageExportReady", { count: String(pages.length) })
        : ""

  return (
    <DialogOverlay
      onClose={close}
      closeOnOverlayClick={!saving}
      closeOnEscape={false}
      dialogClassName="gh-image-export-dialog"
      ariaLabel={t("imageExportTitle")}>
      <style>{IMAGE_EXPORT_DIALOG_CSS}</style>
      <header className="gh-image-export-header">
        <div className="gh-image-export-heading">
          <h2>{t("imageExportTitle")}</h2>
          <p title={input.metadata.title}>{input.metadata.title}</p>
        </div>
        <button
          ref={closeButton}
          type="button"
          className="gh-dialog-btn gh-dialog-btn-secondary gh-image-export-close"
          onClick={close}
          disabled={saving}
          aria-label={t("close")}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true">
            <path d="m6 6 12 12M6 18 18 6" />
          </svg>
        </button>
      </header>
      <div className="gh-image-export-body">
        <aside className="gh-image-export-controls">
          <fieldset disabled={saving} className="gh-image-export-wide-options">
            <legend>{t("imageExportLayout")}</legend>
            <div className="gh-image-export-options">
              {(["single", "split"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="gh-image-export-choice"
                  aria-pressed={layout === value}
                  onClick={() => setLayout(value)}>
                  {t(value === "single" ? "imageExportSingle" : "imageExportSplit")}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={saving}>
            <legend>{t("imageExportFormat")}</legend>
            <div className="gh-image-export-options">
              {(["png", "jpeg"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="gh-image-export-choice"
                  aria-pressed={format === value}
                  onClick={() => setFormat(value)}>
                  {value === "png" ? "PNG" : "JPG"}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={saving}>
            <legend>{t("imageExportTheme")}</legend>
            <div className="gh-image-export-options">
              {(["light", "dark"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="gh-image-export-choice"
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}>
                  {t(value === "light" ? "themeLight" : "themeDark")}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={saving} className="gh-image-export-wide-options">
            <legend>{t("imageExportQuality")}</legend>
            <div className="gh-image-export-options">
              {([1, 2] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="gh-image-export-choice"
                  aria-pressed={scale === value}
                  onClick={() => setScale(value)}>
                  {t(value === 1 ? "imageExportStandard" : "imageExportHigh")}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="gh-image-export-toggle">
            <input
              type="checkbox"
              checked={includeQuestions}
              disabled={saving}
              onChange={(event) => setIncludeQuestions(event.target.checked)}
            />
            <span>{t("imageExportIncludeQuestions")}</span>
          </label>
          <label className="gh-image-export-toggle">
            <input
              type="checkbox"
              checked={branding}
              disabled={saving}
              onChange={(event) => setBranding(event.target.checked)}
            />
            <span>
              {t("imageExportBranding")}
              <small>{t("imageExportBrandingHint")}</small>
            </span>
          </label>
        </aside>
        <section
          className="gh-image-export-preview"
          aria-busy={rendering}
          aria-label={t("imageExportTitle")}>
          {rendering ? (
            <div className="gh-image-export-state">
              <progress
                aria-label={t("imageExportTitle")}
                max={progress.total || undefined}
                value={progress.total ? progress.completed : undefined}
              />
              <p>{status}</p>
            </div>
          ) : error ? (
            <div className="gh-image-export-state">
              <p role="alert" className="gh-image-export-error">
                {getRenderError(error)}
              </p>
              {error instanceof ExportDocumentError && error.kind === "single-limit" ? (
                <div className="gh-image-export-error-actions">
                  {error.canReduceScale && (
                    <button
                      type="button"
                      className="gh-dialog-btn gh-dialog-btn-secondary"
                      onClick={() => setScale(1)}>
                      {t("imageExportUseStandard")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="gh-dialog-btn gh-dialog-btn-primary"
                    onClick={() => setLayout("split")}>
                    {t("imageExportUseSplit")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="gh-dialog-btn gh-dialog-btn-primary"
                  onClick={() => setRevision((current) => current + 1)}>
                  {t("imageExportRetry")}
                </button>
              )}
            </div>
          ) : (
            pages.map((page, index) => (
              <figure key={page.url}>
                <a
                  href={page.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("imageExportOpenPreview")}>
                  <img
                    src={page.url}
                    alt={t("imageExportPage", {
                      index: String(index + 1),
                      total: String(pages.length),
                      width: String(page.width),
                      height: String(page.height),
                    })}
                  />
                </a>
                <figcaption>
                  {t("imageExportPage", {
                    index: String(index + 1),
                    total: String(pages.length),
                    width: String(page.width),
                    height: String(page.height),
                  })}
                </figcaption>
              </figure>
            ))
          )}
        </section>
      </div>
      <footer className="gh-image-export-footer">
        <p
          className={`gh-image-export-status${actionError ? " gh-image-export-error" : ""}`}
          role={actionError ? "alert" : "status"}>
          {actionError || status}
          <br />
          {!rendering && pages.length > 0 && !canCopy
            ? t(
                pages.length !== 1 || format !== "png"
                  ? "imageExportCopyHint"
                  : "imageExportCopyUnavailable",
              )
            : ""}
        </p>
        <div className="gh-image-export-actions">
          <button
            type="button"
            className="gh-dialog-btn gh-dialog-btn-secondary"
            disabled={saving}
            onClick={close}>
            {t("close")}
          </button>
          <button
            type="button"
            className="gh-dialog-btn gh-dialog-btn-secondary"
            disabled={!canCopy || rendering || saving}
            onClick={() => void copy()}>
            <CopyIcon size={16} />
            {t("imageExportCopy")}
          </button>
          <button
            type="button"
            className="gh-dialog-btn gh-dialog-btn-primary"
            disabled={!pages.length || rendering || saving}
            onClick={() => void download()}>
            <DownloadIcon size={16} />
            {t(pages.length > 1 ? "imageExportDownloadAll" : "imageExportDownload")}
          </button>
        </div>
      </footer>
    </DialogOverlay>
  )
}

export function showImageExportDialog(input: ExportDocumentInput): Promise<boolean> {
  return new Promise((resolve) => {
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    root.render(
      <ImageExportDialog
        input={input}
        onClose={(exported) => {
          root.unmount()
          container.remove()
          resolve(exported)
        }}
      />,
    )
  })
}
