import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { createRoot } from "react-dom/client"

import { CheckIcon, CopyIcon, DownloadIcon, ExternalLinkIcon } from "~components/icons"
import { ImageFileIcon } from "~components/icons/ImageFileIcon"
import { ImageExportControls } from "~components/ImageExportControls"
import { DialogOverlay } from "~components/ui/Dialog"
import { Tooltip } from "~components/ui/Tooltip"
import { DEFAULT_IMAGE_EXPORT } from "~constants/image-export"
import type { ThemeManager } from "~core/theme-manager"
import { useImageExport } from "~hooks/useImageExport"
import { useSettingsStore } from "~stores/settings-store"
import { IMAGE_EXPORT_DIALOG_CSS } from "~styles/image-export-inline"
import type { ImageExportPreferences } from "~types/image-export"
import { ExportDocumentError, type ExportDocumentInput } from "~utils/export-document"
import type { ExportImageOptions } from "~utils/export-image"
import { downloadBlob, downloadZipFiles } from "~utils/exporter"
import { t } from "~utils/i18n"
import { showToast } from "~utils/toast"

type ZoomOption = "fit" | "50" | "75" | "100"

const ZOOM_OPTIONS: readonly { value: ZoomOption; label: () => string }[] = [
  { value: "fit", label: () => t("imageExportFit") },
  { value: "50", label: () => "50%" },
  { value: "75", label: () => "75%" },
  { value: "100", label: () => "100%" },
]

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
  const [zoom, setZoom] = useState<ZoomOption>("fit")
  const [revision, setRevision] = useState(0)
  const [actionError, setActionError] = useState("")
  const [activity, setActivity] = useState<"download" | "copy" | null>(null)
  const [copiedTarget, setCopiedTarget] = useState<"all" | number | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [canPan, setCanPan] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewRef = useRef<HTMLElement>(null)
  const panStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startScrollLeft: number
    startScrollTop: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)
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
  const { pages, progress, updating } = result
  const error = documentInput.messages.length ? result.error : t("imageExportEmpty")
  const rendering = !error && result.rendering
  const initialRendering = rendering && !updating
  const clipboardSupported = typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write
  const canCopyPng = format === "png" && clipboardSupported
  const canCopy = pages.length === 1 && canCopyPng

  const markCopied = (target: "all" | number) => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    setCopiedTarget(target)
    copiedTimerRef.current = setTimeout(() => {
      copiedTimerRef.current = null
      setCopiedTarget(null)
    }, 1800)
  }

  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    const previousFocus = document.activeElement
    const dialog = closeButton.current?.closest<HTMLElement>("[role='dialog']")
    if (dialog) {
      dialog.tabIndex = -1
      dialog.focus({ preventScroll: true })
    }
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

  useEffect(() => {
    setActionError("")
    setCopiedTarget(null)
  }, [documentInput, options, composition])

  // 检测预览内容是否水平超出可视区（超宽时开启抓手拖拽提示；拖拽手势同时支持横纵平移）
  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    const updateCanPan = () => {
      setCanPan(el.scrollWidth > el.clientWidth + 2)
    }
    updateCanPan()
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateCanPan) : null
    observer?.observe(el)
    const stage = el.firstElementChild
    if (stage) observer?.observe(stage)
    return () => observer?.disconnect()
  }, [pages, zoom])

  // 窗口失焦时中断拖拽，避免指针状态残留
  useEffect(() => {
    const endPanOnBlur = () => {
      const state = panStateRef.current
      if (!state) return
      const el = previewRef.current
      if (el?.hasPointerCapture(state.pointerId)) {
        try {
          el.releasePointerCapture(state.pointerId)
        } catch {
          // 忽略已失效指针捕获
        }
      }
      panStateRef.current = null
      setIsPanning(false)
    }
    window.addEventListener("blur", endPanOnBlur)
    return () => window.removeEventListener("blur", endPanOnBlur)
  }, [])

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || panStateRef.current) return
    const target = event.target as HTMLElement | null
    if (target?.closest("a, .gh-image-export-page-actions button")) return
    const el = previewRef.current
    if (!el) return
    if (el.scrollWidth <= el.clientWidth + 2 && el.scrollHeight <= el.clientHeight + 2) return
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: el.scrollLeft,
      startScrollTop: el.scrollTop,
      moved: false,
    }
  }

  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const state = panStateRef.current
    const el = previewRef.current
    if (!state || !el || event.pointerId !== state.pointerId) return
    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY
    if (!state.moved && Math.hypot(dx, dy) < 4) return
    if (!state.moved) {
      state.moved = true
      setIsPanning(true)
      try {
        el.setPointerCapture(event.pointerId)
      } catch {
        // 忽略无法捕获场景
      }
    }
    el.scrollLeft = state.startScrollLeft - dx
    el.scrollTop = state.startScrollTop - dy
  }

  const finishPreviewPan = (event: React.PointerEvent<HTMLElement>) => {
    const state = panStateRef.current
    if (!state || event.pointerId !== state.pointerId) return
    const el = previewRef.current
    if (el?.hasPointerCapture(state.pointerId)) {
      try {
        el.releasePointerCapture(state.pointerId)
      } catch {
        // 忽略已释放的指针捕获
      }
    }
    if (state.moved) {
      suppressClickRef.current = true
      setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
    }
    panStateRef.current = null
    setIsPanning(false)
  }

  const close = () => onClose(didExport.current)
  const extension = format === "jpeg" ? "jpg" : "png"

  const download = async () => {
    if (!pages.length || rendering || saving) return
    setActivity("download")
    closeButton.current?.closest<HTMLElement>("[role='dialog']")?.focus()
    setActionError("")
    try {
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

  const downloadSinglePage = async (index: number) => {
    const page = pages[index]
    if (!page || rendering || saving) return
    setActivity("download")
    setActionError("")
    try {
      const suffix = pages.length > 1 ? `-${String(index + 1).padStart(2, "0")}` : ""
      const success = await downloadBlob(page.blob, `${input.filename}${suffix}.${extension}`)
      if (success) {
        didExport.current = true
        showToast(t("exportSuccess"))
      } else setActionError(t("exportFailed"))
    } finally {
      setActivity(null)
    }
  }

  const copyBlob = async (blob: Blob, target: "all" | number) => {
    if (!canCopyPng || saving || rendering) return
    setActivity("copy")
    setActionError("")
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
      didExport.current = true
      markCopied(target)
      showToast(t("copySuccess"))
    } catch {
      setActionError(t("imageExportCopyFailed"))
    } finally {
      setActivity(null)
    }
  }

  const copy = async () => {
    if (!canCopy) return
    closeButton.current?.closest<HTMLElement>("[role='dialog']")?.focus()
    await copyBlob(pages[0].blob, "all")
  }

  const copyDisabledHint =
    !rendering && pages.length > 0 && !canCopy
      ? t(
          pages.length !== 1 || format !== "png"
            ? "imageExportCopyHint"
            : "imageExportCopyUnavailable",
        )
      : ""

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

  const totalBytes = pages.reduce((sum, page) => sum + page.blob.size, 0)
  const toolbarMeta =
    pages.length === 1
      ? `${pages[0].width} × ${pages[0].height} px · ${formatFileSize(totalBytes)}`
      : pages.length > 1
        ? t("imageExportTotalSize", { size: formatFileSize(totalBytes) })
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
        <div className="gh-image-export-header-lead">
          <div className="gh-image-export-header-icon" aria-hidden="true">
            <ImageFileIcon size={16} />
          </div>
          <div className="gh-image-export-heading">
            <h2>{t("imageExportTitle")}</h2>
            <p title={input.metadata.title}>{input.metadata.title}</p>
          </div>
        </div>
        <button
          ref={closeButton}
          type="button"
          className="gh-image-export-close"
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
            strokeLinecap="round"
            aria-hidden="true">
            <path d="m6 6 12 12M6 18 18 6" />
          </svg>
        </button>
      </header>
      <div className="gh-image-export-body">
        <ImageExportControls
          preferences={prefs}
          title={title}
          defaultTitle={input.metadata.title}
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
            <div
              className="gh-image-export-zoom-bar"
              role="group"
              aria-label={t("imageExportZoom")}>
              {ZOOM_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className="gh-image-export-zoom-btn"
                  aria-pressed={zoom === item.value}
                  disabled={saving}
                  onClick={() => setZoom(item.value)}>
                  {item.label()}
                </button>
              ))}
            </div>
            <div className="gh-image-export-toolbar-right">
              {toolbarMeta && <span className="gh-image-export-toolbar-meta">{toolbarMeta}</span>}
              {pages.length === 1 && !error && (
                <a
                  className="gh-image-export-open-btn"
                  href={pages[0].url}
                  target="_blank"
                  rel="noreferrer"
                  title={t("imageExportOpenPreview")}
                  aria-label={t("imageExportOpenPreview")}>
                  <ExternalLinkIcon size={13} />
                  <span>{t("imageExportOpenPreview")}</span>
                </a>
              )}
            </div>
          </div>
          <div
            className={`gh-image-export-update-bar${updating ? " is-active" : ""}`}
            aria-hidden={!updating}>
            {updating && (
              <progress
                aria-label={t("imageExportTitle")}
                max={progress.total || undefined}
                value={progress.total ? progress.completed : undefined}
              />
            )}
          </div>
          <section
            ref={previewRef}
            className={`gh-image-export-preview${updating ? " is-updating" : ""}${canPan ? " is-pannable" : ""}${isPanning ? " is-panning" : ""}`}
            aria-busy={rendering}
            aria-label={t("imageExportTitle")}
            onPointerDown={handlePreviewPointerDown}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={finishPreviewPan}
            onPointerCancel={finishPreviewPan}
            onLostPointerCapture={finishPreviewPan}>
            {initialRendering ? (
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
              <div className="gh-image-export-preview-stage">
                {pages.map((page, index) => {
                  const pageLabel = t("imageExportPage", {
                    index: String(index + 1),
                    total: String(pages.length),
                    width: String(page.width),
                    height: String(page.height),
                  })
                  const logicalWidth = page.cssWidth || width
                  return (
                    <figure
                      key={index}
                      style={
                        {
                          "--i": Math.min(index, 6),
                          ...(zoom !== "fit"
                            ? {
                                width: Math.round((logicalWidth * Number(zoom)) / 100),
                                maxWidth: "none",
                              }
                            : {}),
                        } as React.CSSProperties
                      }>
                      {pages.length > 1 && (
                        <figcaption className="gh-image-export-page-bar">
                          <span className="gh-image-export-caption-meta">
                            {pageLabel}
                            {` · ${formatFileSize(page.blob.size)}`}
                          </span>
                          <span className="gh-image-export-page-actions">
                            {canCopyPng && (
                              <Tooltip content={t("imageExportCopy")}>
                                <button
                                  type="button"
                                  className="gh-image-export-caption-btn"
                                  aria-label={t("imageExportCopy")}
                                  disabled={rendering || saving}
                                  onClick={() => void copyBlob(page.blob, index)}>
                                  {copiedTarget === index ? (
                                    <CheckIcon size={13} />
                                  ) : (
                                    <CopyIcon size={13} />
                                  )}
                                </button>
                              </Tooltip>
                            )}
                            <Tooltip content={t("imageExportDownload")}>
                              <button
                                type="button"
                                className="gh-image-export-caption-btn"
                                aria-label={t("imageExportDownload")}
                                disabled={rendering || saving}
                                onClick={() => void downloadSinglePage(index)}>
                                <DownloadIcon size={13} />
                              </button>
                            </Tooltip>
                            <Tooltip content={t("imageExportOpenPreview")}>
                              <a
                                className="gh-image-export-caption-btn"
                                href={page.url}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={t("imageExportOpenPreview")}>
                                <ExternalLinkIcon size={13} />
                              </a>
                            </Tooltip>
                          </span>
                        </figcaption>
                      )}
                      <button
                        type="button"
                        className={`gh-image-export-canvas-btn${zoom === "fit" ? " is-fit" : " is-zoomed"}`}
                        aria-label={t("imageExportZoom")}
                        disabled={saving}
                        onClick={() => {
                          if (suppressClickRef.current) return
                          setZoom((current) => (current === "fit" ? "100" : "fit"))
                        }}>
                        <img src={page.url} alt={pageLabel} draggable={false} />
                      </button>
                    </figure>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
      <footer className="gh-image-export-footer">
        <p
          className={`gh-image-export-status${actionError ? " gh-image-export-error" : ""}`}
          role={actionError ? "alert" : "status"}>
          {actionError || status}
        </p>
        <div className="gh-image-export-actions">
          <button
            type="button"
            className="gh-dialog-btn gh-dialog-btn-secondary"
            disabled={saving}
            onClick={close}>
            {t("close")}
          </button>
          <Tooltip content={copyDisabledHint} disabled={!copyDisabledHint}>
            <button
              type="button"
              className="gh-dialog-btn gh-dialog-btn-secondary"
              disabled={!canCopy || rendering || saving}
              onClick={() => void copy()}>
              {copiedTarget === "all" ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
              <span>{t(copiedTarget === "all" ? "imageExportCopied" : "imageExportCopy")}</span>
            </button>
          </Tooltip>
          <button
            type="button"
            className="gh-dialog-btn gh-dialog-btn-primary"
            disabled={!pages.length || rendering || saving}
            onClick={() => void download()}>
            <DownloadIcon size={15} />
            <span>{t(pages.length > 1 ? "imageExportDownloadAll" : "imageExportDownload")}</span>
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
