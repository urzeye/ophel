import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { createRoot } from "react-dom/client"

import type { ThemeManager } from "~core/theme-manager"
import { DEFAULT_IMAGE_EXPORT } from "~constants/image-export"
import { ImageExportControls } from "~components/ImageExportControls"
import { useImageExport } from "~hooks/useImageExport"
import { useSettingsStore } from "~stores/settings-store"
import type { ImageExportPreferences } from "~types/image-export"
import { CopyIcon, DownloadIcon } from "~components/icons"
import { DialogOverlay } from "~components/ui/Dialog"
import { IMAGE_EXPORT_DIALOG_CSS } from "~styles/image-export-inline"
import { ExportDocumentError, type ExportDocumentInput } from "~utils/export-document"
import type { ExportImageOptions } from "~utils/export-image"
import { downloadBlob, downloadZipFiles } from "~utils/exporter"
import { t } from "~utils/i18n"
import { showToast } from "~utils/toast"

interface ImageExportDialogProps {
  input: ExportDocumentInput
  themeManager: Pick<ThemeManager, "subscribe" | "getSnapshot">
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

function formatFileSize(bytes: number): string {
  const unit = bytes >= 1_048_576 ? "MB" : "KB"
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / (unit === "MB" ? 1_048_576 : 1024))} ${unit}`
}

export function ImageExportDialog({ input, themeManager, onClose }: ImageExportDialogProps) {
  const prefs = useSettingsStore((state) => state.settings.export?.image ?? DEFAULT_IMAGE_EXPORT)
  const hydrated = useSettingsStore((state) => state._hasHydrated)
  const updatePreferences = (patch: Partial<ImageExportPreferences>) => {
    const store = useSettingsStore.getState()
    store.updateNestedSetting("export", "image", {
      ...store.persistedSettings.export?.image,
      ...patch,
    })
  }
  const mode = useSyncExternalStore(themeManager.subscribe, themeManager.getSnapshot)
  const theme = prefs.theme === "auto" ? mode : prefs.theme
  const {
    format,
    scale,
    layout,
    branding,
    width,
    fontSize,
    appearance,
    showTitle,
    showSource,
    showTime,
    includeQuestions,
    watermark,
  } = prefs
  const [title, setTitle] = useState(input.metadata.title)
  const [zoom, setZoom] = useState("fit")
  const [revision, setRevision] = useState(0)
  const [actionError, setActionError] = useState("")
  const [activity, setActivity] = useState<"download" | "copy" | null>(null)
  const saving = activity !== null
  const busyRef = useRef(saving)
  busyRef.current = saving
  const didExport = useRef(false)
  const closeButton = useRef<HTMLButtonElement>(null)
  const footerWatermarkSize =
    watermark.enabled && watermark.text.trim() && watermark.mode === "footer"
      ? watermark.fontSize
      : 0
  const options = useMemo<ExportImageOptions>(
    () => ({
      theme,
      scale,
      layout,
      branding,
      width,
      fontSize,
      appearance,
      showTitle,
      showSource,
      showTime,
      footerWatermarkSize,
    }),
    [
      theme,
      scale,
      layout,
      branding,
      width,
      fontSize,
      appearance,
      showTitle,
      showSource,
      showTime,
      footerWatermarkSize,
    ],
  )
  const documentInput = useMemo(
    () => ({
      ...input,
      metadata: { ...input.metadata, title },
      messages: includeQuestions
        ? input.messages
        : input.messages.filter((message) => message.role !== "user"),
    }),
    [input, title, includeQuestions],
  )
  const composition = useMemo(
    () => ({ format, scale, theme, watermark }),
    [format, scale, theme, watermark],
  )
  const result = useImageExport(
    documentInput,
    options,
    composition,
    revision,
    hydrated && documentInput.messages.length > 0,
  )
  const { pages, progress } = result
  const error = documentInput.messages.length ? result.error : t("imageExportEmpty")
  const rendering = !error && result.rendering
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
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href]",
        ),
      ).filter((element) => !element.matches(":disabled") && element.getClientRects().length > 0)
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

  useEffect(() => setActionError(""), [documentInput, options, composition])

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
        <ImageExportControls
          preferences={prefs}
          title={title}
          onTitleChange={setTitle}
          onChange={updatePreferences}
          onReset={() => {
            updatePreferences(DEFAULT_IMAGE_EXPORT)
            setTitle(input.metadata.title)
            setZoom("fit")
          }}
          disabled={saving || !hydrated}
        />
        <div className="gh-image-export-preview-pane">
          <div className="gh-image-export-preview-toolbar">
            <label>
              {t("imageExportZoom")}
              <select
                aria-label={t("imageExportZoom")}
                value={zoom}
                disabled={saving}
                onChange={(event) => setZoom(event.target.value)}>
                <option value="fit">{t("imageExportFit")}</option>
                <option value="50">50%</option>
                <option value="100">100%</option>
              </select>
            </label>
            {pages.length > 0 && (
              <span>
                {t("imageExportTotalSize", {
                  size: formatFileSize(pages.reduce((sum, page) => sum + page.blob.size, 0)),
                })}
              </span>
            )}
          </div>
          <section
            className="gh-image-export-preview"
            aria-busy={rendering}
            aria-label={t("imageExportTitle")}>
            {rendering ? (
              <div className="gh-image-export-state">
                <div className="gh-image-export-skeleton" aria-hidden="true">
                  <span className="gh-image-export-sk-title" />
                  <span className="gh-image-export-sk-meta" />
                  <span className="gh-image-export-sk-bubble" />
                  <span />
                  <span className="gh-image-export-sk-short" />
                  <span className="gh-image-export-sk-media" />
                </div>
                <progress
                  aria-label={t("imageExportTitle")}
                  max={progress.total || undefined}
                  value={progress.total ? progress.completed : undefined}
                />
                <p>{status}</p>
              </div>
            ) : error ? (
              <div className="gh-image-export-state">
                <svg
                  className="gh-image-export-error-icon"
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
                <p role="alert" className="gh-image-export-error">
                  {getRenderError(error)}
                </p>
                {error instanceof ExportDocumentError && error.kind === "single-limit" ? (
                  <div className="gh-image-export-error-actions">
                    {error.canReduceScale && (
                      <button
                        type="button"
                        className="gh-dialog-btn gh-dialog-btn-secondary"
                        onClick={() => updatePreferences({ scale: 1 })}>
                        {t("imageExportUseStandard")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="gh-dialog-btn gh-dialog-btn-primary"
                      onClick={() => updatePreferences({ layout: "split" })}>
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
                <figure
                  key={page.url}
                  style={
                    {
                      "--i": Math.min(index, 6),
                      ...(zoom !== "fit"
                        ? { width: (page.width * Number(zoom)) / 100, maxWidth: "none" }
                        : {}),
                    } as React.CSSProperties
                  }>
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
                    {` · ${formatFileSize(page.blob.size)}`}
                  </figcaption>
                </figure>
              ))
            )}
          </section>
        </div>
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
  const themeManager = window.__ophelThemeManager
  if (!themeManager)
    return Promise.reject(new Error("Image export requires the initialized ThemeManager"))
  return new Promise((resolve) => {
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    root.render(
      <ImageExportDialog
        input={input}
        themeManager={themeManager}
        onClose={(exported) => {
          root.unmount()
          container.remove()
          resolve(exported)
        }}
      />,
    )
  })
}
