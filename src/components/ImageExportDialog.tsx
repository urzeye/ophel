import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { createRoot } from "react-dom/client"

import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  ImageFileIcon,
} from "~components/icons"
import { ImageExportControls } from "~components/ImageExportControls"
import { DialogOverlay, getDeepActiveElement } from "~components/ui/Dialog"
import { Tooltip } from "~components/ui/Tooltip"
import { DEFAULT_IMAGE_EXPORT } from "~constants/image-export"
import type { ThemeManager } from "~core/theme-manager"
import { useImageExport } from "~hooks/useImageExport"
import { useSettingsStore } from "~stores/settings-store"
import { IMAGE_EXPORT_DIALOG_CSS } from "~styles/image-export-inline"
import type { ImageExportPreferences, ImageExportWatermark } from "~types/image-export"
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

const ZOOM_SEQUENCE: readonly ZoomOption[] = ["fit", "50", "75", "100"]

// 水印关闭或文案为空时使用稳定常量，避免无关滑块/颜色变动触发预览重合成与闪烁。
const INACTIVE_WATERMARK: ImageExportWatermark = {
  ...DEFAULT_IMAGE_EXPORT.watermark,
  enabled: false,
  text: "",
}

const IMAGE_EXPORT_STYLE_ID = "gh-image-export-dialog-styles"
let imageExportStylesInjected = false

function ensureImageExportDialogStyles(): void {
  if (imageExportStylesInjected && document.getElementById(IMAGE_EXPORT_STYLE_ID)) return
  const existing = document.getElementById(IMAGE_EXPORT_STYLE_ID)
  if (existing) {
    imageExportStylesInjected = true
    return
  }
  const style = document.createElement("style")
  style.id = IMAGE_EXPORT_STYLE_ID
  style.textContent = IMAGE_EXPORT_DIALOG_CSS
  document.head.appendChild(style)
  imageExportStylesInjected = true
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

interface ImageExportDialogProps {
  input: ExportDocumentInput
  themeManager: Pick<ThemeManager, "subscribe" | "getSnapshot">
  onClose: (exported: boolean) => void
  focusRef?: React.MutableRefObject<(() => void) | null>
  onUnmount?: () => void
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

export function ImageExportDialog({
  input,
  themeManager,
  onClose,
  focusRef,
  onUnmount,
}: ImageExportDialogProps) {
  const prefs = useSettingsStore((state) => state.settings.export?.image ?? DEFAULT_IMAGE_EXPORT)
  const hydrated = useSettingsStore((state) => state._hasHydrated)
  const [resetUndo, setResetUndo] = useState<{
    prefs: ImageExportPreferences
    title: string
    zoom: ZoomOption
  } | null>(null)
  const updatePreferences = useCallback(
    (patch: Partial<ImageExportPreferences>, clearUndo = true) => {
      if (clearUndo) setResetUndo(null)
      const store = useSettingsStore.getState()
      store.updateNestedSetting("export", "image", {
        ...store.persistedSettings.export?.image,
        ...patch,
      })
    },
    [],
  )
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
  const [canZoomFromFit, setCanZoomFromFit] = useState(false)
  const resetSnapshotRef = useRef({ prefs, title, zoom, defaultTitle: input.metadata.title })
  resetSnapshotRef.current = { prefs, title, zoom, defaultTitle: input.metadata.title }
  const resetUndoRef = useRef(resetUndo)
  resetUndoRef.current = resetUndo
  const handleControlsTitleChange = useCallback((nextTitle: string) => {
    setResetUndo(null)
    setTitle(nextTitle)
  }, [])
  const handleControlsChange = useCallback(
    (patch: Partial<ImageExportPreferences>) => updatePreferences(patch),
    [updatePreferences],
  )
  const handleControlsReset = useCallback(() => {
    const snap = resetSnapshotRef.current
    setResetUndo({ prefs: snap.prefs, title: snap.title, zoom: snap.zoom })
    updatePreferences(DEFAULT_IMAGE_EXPORT, false)
    setTitle(snap.defaultTitle)
    setZoom("fit")
  }, [updatePreferences])
  const handleControlsUndoReset = useCallback(() => {
    const current = resetUndoRef.current
    if (!current) return
    setResetUndo(null)
    updatePreferences(current.prefs, false)
    setTitle(current.title)
    setZoom(current.zoom)
  }, [updatePreferences])
  const statusId = useId()
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
  const didExport = useRef(false)
  const closeButton = useRef<HTMLButtonElement>(null)
  const hasActiveWatermark = watermark.enabled && Boolean(watermark.text.trim())
  const effectiveWatermark = hasActiveWatermark ? watermark : INACTIVE_WATERMARK
  const footerWatermarkSize =
    hasActiveWatermark && watermark.mode === "footer" ? watermark.fontSize : 0
  const hasExportableMessages = includeQuestions
    ? input.messages.length > 0
    : input.messages.some((message) => message.role !== "user")
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
      includeQuestions,
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
      includeQuestions,
      footerWatermarkSize,
    ],
  )
  // 保留完整消息数组交由 export-document 统一编号后再隐藏用户提问，防止关闭包含提问时消息序号丢失。
  const documentInput = useMemo(
    () => ({
      ...input,
      metadata: { ...input.metadata, title },
    }),
    [input, title],
  )
  const composition = useMemo(
    () => ({ format, scale, theme, watermark: effectiveWatermark }),
    [format, scale, theme, effectiveWatermark],
  )
  const result = useImageExport(
    documentInput,
    options,
    composition,
    revision,
    hydrated && hasExportableMessages,
  )
  const { pages, progress, updating, phase } = result
  const error = hasExportableMessages ? result.error : t("imageExportEmpty")
  const rendering = !error && result.rendering
  const initialRendering = rendering && !updating
  const clipboardSupported = typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write
  const canCopyPng = format === "png" && clipboardSupported
  const canCopy = pages.length === 1 && canCopyPng
  const displaySubtitle = title.trim() || input.metadata.title

  const focusDialogContainer = useCallback(() => {
    closeButton.current?.closest<HTMLElement>("[role='dialog']")?.focus({ preventScroll: true })
  }, [])

  const onUnmountRef = useRef(onUnmount)
  onUnmountRef.current = onUnmount
  useEffect(() => {
    if (focusRef) focusRef.current = focusDialogContainer
    return () => {
      if (focusRef) focusRef.current = null
      onUnmountRef.current?.()
    }
  }, [focusRef, focusDialogContainer])

  const markCopied = (target: "all" | number) => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    setCopiedTarget(target)
    copiedTimerRef.current = setTimeout(() => {
      copiedTimerRef.current = null
      setCopiedTarget(null)
    }, 1800)
  }

  useEffect(() => {
    ensureImageExportDialogStyles()
  }, [])

  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    },
    [],
  )

  const close = () => onClose(didExport.current)
  const extension = format === "jpeg" ? "jpg" : "png"

  const download = async () => {
    if (!pages.length || rendering || saving) return
    setActivity("download")
    focusDialogContainer()
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
    focusDialogContainer()
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
    focusDialogContainer()
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
    await copyBlob(pages[0].blob, "all")
  }

  // 按需生成独立 ObjectURL 打开新标签页，不绑定预览刷新/关窗时的 revoke 生命周期，防止新页图片失效。
  const openFullImage = (blob: Blob) => {
    if (rendering || saving) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    link.click()
  }

  const keyboardStateRef = useRef({
    saving,
    rendering,
    canCopy,
    hasPages: pages.length > 0,
    onClose,
    download,
    copy,
  })
  keyboardStateRef.current = {
    saving,
    rendering,
    canCopy,
    hasPages: pages.length > 0,
    onClose,
    download,
    copy,
  }

  useEffect(() => {
    const previousFocus = getDeepActiveElement()
    const dialog = closeButton.current?.closest<HTMLElement>("[role='dialog']")
    if (dialog) {
      dialog.focus({ preventScroll: true })
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const state = keyboardStateRef.current

      // Checkbox 的键盘保护会截断冒泡，关闭与高频快捷键需在本弹窗捕获阶段处理。
      if (event.key === "Escape" && !state.saving) {
        event.preventDefault()
        event.stopPropagation()
        state.onClose(didExport.current)
        return
      }

      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        const lower = event.key.toLowerCase()
        if (lower === "s") {
          event.preventDefault()
          event.stopPropagation()
          if (state.hasPages && !state.rendering && !state.saving) void state.download()
          return
        }
        if (
          lower === "c" &&
          !isEditableTarget(event.target) &&
          !window.getSelection()?.toString() &&
          state.canCopy &&
          !state.rendering &&
          !state.saving
        ) {
          event.preventDefault()
          event.stopPropagation()
          void state.copy()
          return
        }
      }

      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !state.saving &&
        !isEditableTarget(event.target)
      ) {
        if (event.key === "0") {
          event.preventDefault()
          setZoom("fit")
          return
        }
        if (event.key === "+" || event.key === "=") {
          event.preventDefault()
          setZoom((current) => {
            const idx = ZOOM_SEQUENCE.indexOf(current)
            return ZOOM_SEQUENCE[Math.min(ZOOM_SEQUENCE.length - 1, idx + 1)]
          })
          return
        }
        if (event.key === "-") {
          event.preventDefault()
          setZoom((current) => {
            const idx = ZOOM_SEQUENCE.indexOf(current)
            return ZOOM_SEQUENCE[Math.max(0, idx - 1)]
          })
          return
        }
      }

      if (event.key !== "Tab" || !dialog) return
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href]",
        ),
      ).filter(
        (element) =>
          !element.matches(":disabled") &&
          !element.closest("fieldset:disabled") &&
          element.getClientRects().length > 0,
      )
      if (controls.length === 0) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", handleKeyDown, true)
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        const restoreTarget = previousFocus.matches(":disabled")
          ? previousFocus.closest<HTMLElement>("[role='dialog']")
          : previousFocus
        restoreTarget?.focus({ preventScroll: true })
      }
    }
  }, [])

  useEffect(() => {
    setActionError("")
    setCopiedTarget(null)
  }, [documentInput, options, composition])

  // 检测预览内容是否水平超出可视区（开启抓手拖拽），以及 fit 模式下图片是否确实被缩小显示。
  const firstLogicalWidth = pages[0]?.cssWidth || width
  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    const updatePreviewMetrics = () => {
      setCanPan(el.scrollWidth > el.clientWidth + 2)
      const firstFigure = el.querySelector<HTMLElement>("figure")
      setCanZoomFromFit(
        zoom === "fit" &&
          Boolean(firstFigure) &&
          firstFigure!.clientWidth > 0 &&
          firstFigure!.clientWidth < firstLogicalWidth - 2,
      )
    }
    updatePreviewMetrics()
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(updatePreviewMetrics) : null
    observer?.observe(el)
    const stage = el.firstElementChild
    if (stage) observer?.observe(stage)
    return () => observer?.disconnect()
  }, [pages, zoom, firstLogicalWidth])

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
    if (target?.closest("a, button:not(.gh-image-export-canvas-btn), input, select, summary"))
      return
    const el = previewRef.current
    if (!el || el.scrollWidth <= el.clientWidth + 2) return
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

  const copyDisabledHint =
    !rendering && pages.length > 0 && !canCopy
      ? t(
          !clipboardSupported
            ? "imageExportCopyUnavailable"
            : pages.length > 1
              ? "imageExportCopyHint"
              : "imageExportCopyPngOnlyHint",
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
        : t(phase === "composing" ? "imageExportApplying" : "imageExportPreparing")
      : pages.length === 1
        ? t("imageExportReadySingle")
        : pages.length > 1
          ? t("imageExportReady", { count: String(pages.length) })
          : ""
  const showCopyStatusNote = !actionError && !saving && !rendering && Boolean(copyDisabledHint)

  const totalBytes = pages.reduce((sum, page) => sum + page.blob.size, 0)
  const toolbarMeta =
    pages.length === 1
      ? `${pages[0].width} × ${pages[0].height} px · ${formatFileSize(totalBytes)}`
      : pages.length > 1
        ? t("imageExportTotalSize", { size: formatFileSize(totalBytes) })
        : ""

  const renderProgressBar = () =>
    progress.total > 0 ? (
      <progress
        aria-label={t("imageExportTitle")}
        max={progress.total}
        value={progress.completed}
      />
    ) : (
      <div
        className="gh-image-export-indeterminate"
        role="progressbar"
        aria-label={t("imageExportTitle")}
      />
    )

  const renderErrorActions = () => {
    if (!hasExportableMessages) {
      if (input.messages.length > 0 && !includeQuestions) {
        return (
          <button
            type="button"
            className="gh-dialog-btn gh-dialog-btn-primary"
            onClick={() => updatePreferences({ includeQuestions: true })}>
            {t("imageExportIncludeQuestions")}
          </button>
        )
      }
      return null
    }
    if (error instanceof ExportDocumentError && error.kind === "single-limit") {
      return (
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
      )
    }
    if (error instanceof ExportDocumentError && error.kind === "limit") {
      const canReduce = scale === 2
      const canSplit = layout === "single"
      if (canReduce || canSplit) {
        return (
          <div className="gh-image-export-error-actions">
            {canReduce && (
              <button
                type="button"
                className="gh-dialog-btn gh-dialog-btn-secondary"
                onClick={() => updatePreferences({ scale: 1 })}>
                {t("imageExportUseStandard")}
              </button>
            )}
            {canSplit && (
              <button
                type="button"
                className="gh-dialog-btn gh-dialog-btn-primary"
                onClick={() => updatePreferences({ layout: "split" })}>
                {t("imageExportUseSplit")}
              </button>
            )}
          </div>
        )
      }
    }
    return (
      <button
        type="button"
        className="gh-dialog-btn gh-dialog-btn-primary"
        onClick={() => setRevision((current) => current + 1)}>
        {t("imageExportRetry")}
      </button>
    )
  }

  return (
    <DialogOverlay
      onClose={close}
      closeOnOverlayClick={!saving}
      closeOnEscape={false}
      trapFocus={false}
      dialogClassName="gh-image-export-dialog"
      ariaLabel={t("imageExportTitle")}>
      <header className="gh-image-export-header">
        <div className="gh-image-export-header-lead">
          <div className="gh-image-export-header-icon" aria-hidden="true">
            <ImageFileIcon size={16} />
          </div>
          <div className="gh-image-export-heading">
            <h2>{t("imageExportTitle")}</h2>
            <Tooltip
              content={displaySubtitle}
              showOnlyWhenTruncated
              triggerStyle={{ display: "block", minWidth: 0 }}>
              <p>{displaySubtitle}</p>
            </Tooltip>
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
          onTitleChange={handleControlsTitleChange}
          onChange={handleControlsChange}
          onReset={handleControlsReset}
          canUndoReset={resetUndo !== null}
          onUndoReset={resetUndo ? handleControlsUndoReset : undefined}
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
                <Tooltip content={t("imageExportOpenPreview")}>
                  <button
                    type="button"
                    className="gh-image-export-open-btn"
                    disabled={rendering || saving}
                    aria-label={t("imageExportOpenPreview")}
                    onClick={() => openFullImage(pages[0].blob)}>
                    <ExternalLinkIcon size={13} />
                    <span>{t("imageExportOpenPreview")}</span>
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
          <div
            className={`gh-image-export-update-bar${updating ? " is-active" : ""}`}
            aria-hidden={!updating}>
            {updating && renderProgressBar()}
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
                {renderProgressBar()}
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
                {renderErrorActions()}
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
                  const figureStyle: React.CSSProperties & { "--i": number } =
                    zoom !== "fit"
                      ? {
                          "--i": Math.min(index, 6),
                          width: Math.round((logicalWidth * Number(zoom)) / 100),
                          maxWidth: "none",
                        }
                      : {
                          "--i": Math.min(index, 6),
                          maxWidth: logicalWidth,
                        }
                  return (
                    <figure key={index} style={figureStyle}>
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
                                    <CheckIcon size={14} />
                                  ) : (
                                    <CopyIcon size={14} />
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
                                <DownloadIcon size={14} />
                              </button>
                            </Tooltip>
                            <Tooltip content={t("imageExportOpenPreview")}>
                              <button
                                type="button"
                                className="gh-image-export-caption-btn"
                                aria-label={t("imageExportOpenPreview")}
                                disabled={rendering || saving}
                                onClick={() => openFullImage(page.blob)}>
                                <ExternalLinkIcon size={14} />
                              </button>
                            </Tooltip>
                          </span>
                        </figcaption>
                      )}
                      <button
                        type="button"
                        className={`gh-image-export-canvas-btn${
                          zoom === "fit"
                            ? canZoomFromFit
                              ? " is-fit"
                              : " is-static"
                            : " is-zoomed"
                        }`}
                        aria-label={`${t("imageExportZoom")}: ${zoom === "fit" ? t("imageExportFit") : `${zoom}%`}`}
                        disabled={saving}
                        onClick={() => {
                          if (suppressClickRef.current || canPan) return
                          if (zoom === "fit") {
                            if (canZoomFromFit) setZoom("100")
                            return
                          }
                          setZoom("fit")
                        }}
                        onDoubleClick={() => {
                          if (!canPan) return
                          setZoom("fit")
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
          id={statusId}
          className={`gh-image-export-status${actionError ? " gh-image-export-error" : ""}`}
          role={actionError ? "alert" : "status"}>
          <span>{actionError || status}</span>
          {showCopyStatusNote && (
            <span className="gh-image-export-status-note">{copyDisabledHint}</span>
          )}
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
              aria-busy={activity === "copy"}
              aria-describedby={copyDisabledHint ? statusId : undefined}
              onClick={() => void copy()}>
              {copiedTarget === "all" ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
              <span>{t(copiedTarget === "all" ? "imageExportCopied" : "imageExportCopy")}</span>
            </button>
          </Tooltip>
          <button
            type="button"
            className="gh-dialog-btn gh-dialog-btn-primary"
            disabled={!pages.length || rendering || saving}
            aria-busy={activity === "download"}
            onClick={() => void download()}>
            <DownloadIcon size={15} />
            <span>{t(pages.length > 1 ? "imageExportDownloadAll" : "imageExportDownload")}</span>
          </button>
        </div>
      </footer>
    </DialogOverlay>
  )
}

// 单例守卫：防止快捷键或重复触发叠加挂载多个图片导出弹窗实例。
let activeImageExportDialog: { focus: () => void } | null = null

export function showImageExportDialog(input: ExportDocumentInput): Promise<boolean> {
  const themeManager = window.__ophelThemeManager
  if (!themeManager)
    return Promise.reject(new Error("Image export requires the initialized ThemeManager"))
  if (activeImageExportDialog) {
    activeImageExportDialog.focus()
    return Promise.resolve(false)
  }
  return new Promise((resolve) => {
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    const dialogFocusRef: { current: (() => void) | null } = { current: null }
    let settled = false
    const handle = {
      focus: () => {
        dialogFocusRef.current?.()
      },
    }
    const finish = (exported: boolean, shouldUnmount: boolean) => {
      if (settled) return
      settled = true
      if (activeImageExportDialog === handle) {
        activeImageExportDialog = null
      }
      if (shouldUnmount) {
        root.unmount()
      }
      container.remove()
      resolve(exported)
    }
    activeImageExportDialog = handle
    try {
      root.render(
        <ImageExportDialog
          input={input}
          themeManager={themeManager}
          focusRef={dialogFocusRef}
          onUnmount={() => finish(false, false)}
          onClose={(exported) => finish(exported, true)}
        />,
      )
    } catch (error) {
      finish(false, true)
      throw error
    }
  })
}
