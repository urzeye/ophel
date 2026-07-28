import React from "react"
import { createPortal } from "react-dom"

import { CheckIcon, ChevronDownIcon, GlobeIcon, SearchIcon } from "~components/icons"
import { Button } from "~components/ui"
import { SUPPORTED_AI_PLATFORMS } from "~constants/defaults"
import { OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS } from "~utils/dom-toolkit"
import { getHighlightStyles, renderMarkdown } from "~utils/markdown"
import { showCopySuccess } from "~utils/icons"
import { t } from "~utils/i18n"
import type { Prompt } from "~utils/storage"
import { createSafeHTML } from "~utils/trusted-types"

import { PlatformIcon } from "./PlatformIcon"

const PROMPT_EDITOR_STYLES = `
.gh-prompt-platform-picker-trigger {
  width: 100%;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 10px;
  border: 1px solid var(--gh-border, #d1d5db);
  border-radius: 8px;
  background: var(--gh-bg, #ffffff);
  color: var(--gh-text, #1f2937);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    box-shadow 0.15s;
}

.gh-prompt-platform-picker-trigger:hover {
  background: var(--gh-hover, #f3f4f6);
}

.gh-prompt-platform-picker-trigger[aria-expanded="true"] {
  border-color: var(--gh-primary, #4285f4);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--gh-primary, #4285f4) 14%, transparent);
}

.gh-prompt-platform-summary {
  min-width: 0;
  display: flex;
  flex: 1;
  align-items: center;
  gap: 7px;
  overflow: hidden;
}

.gh-prompt-platform-summary-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gh-prompt-platform-summary-more {
  flex: 0 0 auto;
  color: var(--gh-text-secondary, #6b7280);
}

.gh-prompt-platform-chevron {
  flex: 0 0 auto;
  color: var(--gh-text-secondary, #6b7280);
  transition: transform 0.18s ease;
}

.gh-prompt-platform-picker-trigger[aria-expanded="true"] .gh-prompt-platform-chevron {
  transform: rotate(180deg);
}

.gh-prompt-platform-picker-panel {
  position: fixed;
  z-index: 2147483647;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 10px;
  border: 1px solid var(--gh-border, #d1d5db);
  border-radius: 10px;
  background: var(--gh-bg-secondary, #f9fafb);
  box-shadow: var(--gh-shadow-sm, 0 8px 20px rgba(0, 0, 0, 0.08));
  animation: gh-prompt-platform-panel-in 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.gh-prompt-platform-search {
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  margin-bottom: 8px;
  border: 1px solid var(--gh-border, #d1d5db);
  border-radius: 8px;
  background: var(--gh-bg, #ffffff);
  color: var(--gh-text-secondary, #6b7280);
}

.gh-prompt-platform-search:focus-within {
  border-color: var(--gh-primary, #4285f4);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--gh-primary, #4285f4) 14%, transparent);
}

.gh-prompt-platform-search input {
  min-width: 0;
  flex: 1;
  padding: 7px 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--gh-text, #1f2937);
  font: inherit;
  font-size: 13px;
}

.gh-prompt-platform-search input::placeholder {
  color: var(--gh-text-tertiary, #9ca3af);
}

.gh-prompt-platform-all,
.gh-prompt-platform-option {
  min-height: 36px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--gh-text, #1f2937);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.gh-prompt-platform-all {
  width: 100%;
  margin-bottom: 8px;
  background: var(--gh-bg, #ffffff);
}

.gh-prompt-platform-options {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 6px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.gh-prompt-platform-option {
  width: 100%;
  background: var(--gh-bg, #ffffff);
}

.gh-prompt-platform-all span,
.gh-prompt-platform-option span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gh-prompt-platform-all[aria-pressed="true"],
.gh-prompt-platform-option[aria-pressed="true"] {
  border-color: var(--gh-primary, #4285f4);
  background: color-mix(in srgb, var(--gh-primary, #4285f4) 10%, var(--gh-bg, #ffffff));
  color: var(--gh-primary, #4285f4);
}

.gh-prompt-platform-all:hover,
.gh-prompt-platform-option:hover {
  background: var(--gh-hover, #f3f4f6);
}

.gh-prompt-platform-picker-trigger:active,
.gh-prompt-platform-all:active,
.gh-prompt-platform-option:active {
  transform: translateY(1px);
}

.gh-prompt-platform-picker-trigger:focus-visible,
.gh-prompt-platform-all:focus-visible,
.gh-prompt-platform-option:focus-visible {
  outline: 2px solid var(--gh-primary, #4285f4);
  outline-offset: 2px;
}

.gh-prompt-platform-empty {
  grid-column: 1 / -1;
  padding: 18px 12px;
  color: var(--gh-text-tertiary, #9ca3af);
  font-size: 12px;
  text-align: center;
}

.gh-prompt-platform-options,
.gh-prompt-editor-scrollable {
  scrollbar-width: thin;
  scrollbar-color: var(--gh-border, #d1d5db) transparent;
  scrollbar-gutter: stable;
}

.gh-prompt-platform-options::-webkit-scrollbar,
.gh-prompt-editor-scrollable::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.gh-prompt-platform-options::-webkit-scrollbar-track,
.gh-prompt-platform-options::-webkit-scrollbar-corner,
.gh-prompt-editor-scrollable::-webkit-scrollbar-track,
.gh-prompt-editor-scrollable::-webkit-scrollbar-corner {
  background: transparent;
}

.gh-prompt-platform-options::-webkit-scrollbar-thumb,
.gh-prompt-editor-scrollable::-webkit-scrollbar-thumb {
  min-height: 40px;
  border: 3px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--gh-text-tertiary, #9ca3af) 58%, transparent);
  background-clip: content-box;
}

.gh-prompt-platform-options::-webkit-scrollbar-thumb:hover,
.gh-prompt-editor-scrollable::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--gh-text-secondary, #6b7280) 76%, transparent);
  background-clip: content-box;
}

@keyframes gh-prompt-platform-panel-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 520px) {
  .gh-prompt-platform-options {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .gh-prompt-platform-picker-panel {
    animation: none;
  }

  .gh-prompt-platform-chevron {
    transition: none;
  }
}
`

interface PromptEditorDialogProps {
  isOpen: boolean
  editingPrompt: Partial<Prompt> | null
  setEditingPrompt: React.Dispatch<React.SetStateAction<Partial<Prompt> | null>>
  categories: string[]
  showPreview: boolean
  setShowPreview: React.Dispatch<React.SetStateAction<boolean>>
  editPreviewRef: React.RefObject<HTMLDivElement>
  onClose: () => void
  onSave: () => void
}

interface PlatformPickerPosition {
  top: number
  left: number
  width: number
  height: number
  placement: "top" | "bottom"
}

const PLATFORM_PICKER_GAP = 8
const PLATFORM_PICKER_VIEWPORT_PADDING = 12
const PLATFORM_PICKER_PREFERRED_HEIGHT = 320

export const PromptEditorDialog: React.FC<PromptEditorDialogProps> = ({
  isOpen,
  editingPrompt,
  setEditingPrompt,
  categories,
  showPreview,
  setShowPreview,
  editPreviewRef,
  onClose,
  onSave,
}) => {
  const [isPlatformPickerOpen, setIsPlatformPickerOpen] = React.useState(false)
  const [platformSearchQuery, setPlatformSearchQuery] = React.useState("")
  const [platformPickerPosition, setPlatformPickerPosition] =
    React.useState<PlatformPickerPosition | null>(null)
  const platformPickerRef = React.useRef<HTMLDivElement>(null)
  const platformPickerPanelRef = React.useRef<HTMLDivElement>(null)
  const platformPickerTriggerRef = React.useRef<HTMLButtonElement>(null)
  const platformSearchInputRef = React.useRef<HTMLInputElement>(null)

  const updatePlatformPickerPosition = React.useCallback(() => {
    const trigger = platformPickerTriggerRef.current
    if (!trigger) return

    const triggerRect = trigger.getBoundingClientRect()
    const visualViewport = window.visualViewport
    const viewportTop = visualViewport?.offsetTop ?? 0
    const viewportLeft = visualViewport?.offsetLeft ?? 0
    const viewportWidth = visualViewport?.width ?? window.innerWidth
    const viewportHeight = visualViewport?.height ?? window.innerHeight
    const viewportRight = viewportLeft + viewportWidth
    const viewportBottom = viewportTop + viewportHeight
    const availableWidth = Math.max(0, viewportWidth - PLATFORM_PICKER_VIEWPORT_PADDING * 2)
    const width = Math.min(triggerRect.width, availableWidth)
    const left = Math.min(
      Math.max(triggerRect.left, viewportLeft + PLATFORM_PICKER_VIEWPORT_PADDING),
      viewportRight - width - PLATFORM_PICKER_VIEWPORT_PADDING,
    )
    const spaceBelow = Math.max(
      0,
      viewportBottom - triggerRect.bottom - PLATFORM_PICKER_GAP - PLATFORM_PICKER_VIEWPORT_PADDING,
    )
    const spaceAbove = Math.max(
      0,
      triggerRect.top - viewportTop - PLATFORM_PICKER_GAP - PLATFORM_PICKER_VIEWPORT_PADDING,
    )
    const placement =
      spaceBelow >= PLATFORM_PICKER_PREFERRED_HEIGHT || spaceBelow >= spaceAbove ? "bottom" : "top"
    const availableHeight = placement === "bottom" ? spaceBelow : spaceAbove
    const height = Math.min(PLATFORM_PICKER_PREFERRED_HEIGHT, availableHeight)
    const rawTop =
      placement === "bottom"
        ? triggerRect.bottom + PLATFORM_PICKER_GAP
        : triggerRect.top - PLATFORM_PICKER_GAP - height
    const top = Math.min(
      Math.max(rawTop, viewportTop + PLATFORM_PICKER_VIEWPORT_PADDING),
      viewportBottom - height - PLATFORM_PICKER_VIEWPORT_PADDING,
    )
    const nextPosition: PlatformPickerPosition = {
      top: Math.round(top),
      left: Math.round(left),
      width: Math.round(width),
      height: Math.round(height),
      placement,
    }

    setPlatformPickerPosition((current) =>
      current &&
      current.top === nextPosition.top &&
      current.left === nextPosition.left &&
      current.width === nextPosition.width &&
      current.height === nextPosition.height &&
      current.placement === nextPosition.placement
        ? current
        : nextPosition,
    )
  }, [])

  React.useEffect(() => {
    if (!isOpen) {
      setIsPlatformPickerOpen(false)
      setPlatformSearchQuery("")
      setPlatformPickerPosition(null)
    }
  }, [isOpen])

  React.useLayoutEffect(() => {
    if (!isPlatformPickerOpen) {
      setPlatformPickerPosition(null)
      return
    }

    let positionFrame = 0
    const schedulePositionUpdate = () => {
      window.cancelAnimationFrame(positionFrame)
      positionFrame = window.requestAnimationFrame(updatePlatformPickerPosition)
    }

    updatePlatformPickerPosition()
    window.addEventListener("resize", schedulePositionUpdate)
    window.addEventListener("scroll", schedulePositionUpdate, true)
    window.visualViewport?.addEventListener("resize", schedulePositionUpdate)
    window.visualViewport?.addEventListener("scroll", schedulePositionUpdate)

    return () => {
      window.cancelAnimationFrame(positionFrame)
      window.removeEventListener("resize", schedulePositionUpdate)
      window.removeEventListener("scroll", schedulePositionUpdate, true)
      window.visualViewport?.removeEventListener("resize", schedulePositionUpdate)
      window.visualViewport?.removeEventListener("scroll", schedulePositionUpdate)
    }
  }, [isPlatformPickerOpen, updatePlatformPickerPosition])

  React.useEffect(() => {
    if (!isPlatformPickerOpen) return

    const focusFrame = window.requestAnimationFrame(() => {
      platformSearchInputRef.current?.focus()
    })
    const handlePointerDown = (event: PointerEvent) => {
      if (platformPickerRef.current?.contains(event.target as Node)) return
      if (platformPickerPanelRef.current?.contains(event.target as Node)) return
      setIsPlatformPickerOpen(false)
      setPlatformSearchQuery("")
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      setIsPlatformPickerOpen(false)
      setPlatformSearchQuery("")
      platformPickerTriggerRef.current?.focus()
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isPlatformPickerOpen])

  if (!isOpen) return null

  const selectedPlatformIds = editingPrompt?.platforms ?? []
  const selectedPlatforms = SUPPORTED_AI_PLATFORMS.filter((platform) =>
    selectedPlatformIds.includes(platform.id),
  )
  const normalizedPlatformSearch = platformSearchQuery.trim().toLowerCase()
  const filteredPlatforms = normalizedPlatformSearch
    ? SUPPORTED_AI_PLATFORMS.filter((platform) =>
        platform.name.toLowerCase().includes(normalizedPlatformSearch),
      )
    : SUPPORTED_AI_PLATFORMS

  return createPortal(
    <div
      className="prompt-modal gh-interactive"
      {...OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "var(--gh-overlay-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2147483646,
        animation: "fadeIn 0.2s",
      }}>
      <div
        className="prompt-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gh-prompt-editor-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--gh-bg, white)",
          borderRadius: "12px",
          width: "90%",
          maxWidth: "500px",
          padding: "24px",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          boxSizing: "border-box",
          animation: "slideUp 0.3s",
          boxShadow: "var(--gh-shadow, 0 20px 50px rgba(0,0,0,0.3))",
        }}>
        <div
          id="gh-prompt-editor-title"
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "20px",
            color: "var(--gh-text, #1f2937)",
          }}>
          {editingPrompt?.id ? t("editPrompt") : t("addNewPrompt")}
        </div>

        {/* 标题 */}
        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 500,
              color: "var(--gh-text, #374151)",
              marginBottom: "6px",
            }}>
            {t("title")}
          </label>
          <input
            type="text"
            value={editingPrompt?.title || ""}
            onChange={(e) => setEditingPrompt({ ...editingPrompt, title: e.target.value })}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid var(--gh-border, #d1d5db)",
              borderRadius: "6px",
              fontSize: "14px",
              boxSizing: "border-box",
              background: "var(--gh-bg, #ffffff)",
              color: "var(--gh-text, #1f2937)",
            }}
          />
        </div>

        {/* 分类 */}
        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 500,
              color: "var(--gh-text, #374151)",
              marginBottom: "6px",
            }}>
            {t("category")}
          </label>
          <input
            type="text"
            value={editingPrompt?.category || ""}
            onChange={(e) => setEditingPrompt({ ...editingPrompt, category: e.target.value })}
            placeholder={t("categoryPlaceholder")}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid var(--gh-border, #d1d5db)",
              borderRadius: "6px",
              fontSize: "14px",
              boxSizing: "border-box",
              background: "var(--gh-bg, #ffffff)",
              color: "var(--gh-text, #1f2937)",
            }}
          />
          {categories.length > 0 && (
            <div
              style={{
                marginTop: "6px",
                display: "flex",
                gap: "4px",
                flexWrap: "wrap",
                userSelect: "none",
              }}>
              {categories.map((cat) => (
                <span
                  key={cat}
                  onClick={() => setEditingPrompt({ ...editingPrompt, category: cat })}
                  style={{
                    padding: "2px 8px",
                    fontSize: "11px",
                    background:
                      editingPrompt?.category === cat
                        ? "var(--gh-primary, #4285f4)"
                        : "var(--gh-hover, #f3f4f6)",
                    color:
                      editingPrompt?.category === cat
                        ? "var(--gh-text-on-primary, white)"
                        : "var(--gh-text-secondary, #6b7280)",
                    borderRadius: "10px",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}>
                  {cat}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 适用平台 */}
        <div style={{ marginBottom: "16px" }}>
          <div
            id="gh-prompt-platform-label"
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 500,
              color: "var(--gh-text, #374151)",
              marginBottom: "6px",
            }}>
            {t("promptPlatformLabel")}
          </div>
          <div ref={platformPickerRef}>
            <button
              ref={platformPickerTriggerRef}
              type="button"
              className="gh-prompt-platform-picker-trigger"
              aria-expanded={isPlatformPickerOpen}
              aria-controls="gh-prompt-platform-picker-panel"
              aria-labelledby="gh-prompt-platform-label gh-prompt-platform-summary"
              onClick={() => {
                setIsPlatformPickerOpen((open) => !open)
                if (isPlatformPickerOpen) setPlatformSearchQuery("")
              }}>
              <span id="gh-prompt-platform-summary" className="gh-prompt-platform-summary">
                {selectedPlatforms.length === 0 ? (
                  <>
                    <GlobeIcon size={16} />
                    <span className="gh-prompt-platform-summary-name">
                      {t("promptPlatformAll")}
                    </span>
                  </>
                ) : (
                  <>
                    <PlatformIcon name={selectedPlatforms[0].name} size={16} />
                    <span className="gh-prompt-platform-summary-name">
                      {selectedPlatforms[0].name}
                    </span>
                    {selectedPlatforms.length > 1 && (
                      <span className="gh-prompt-platform-summary-more">
                        +{selectedPlatforms.length - 1}
                      </span>
                    )}
                  </>
                )}
              </span>
              <ChevronDownIcon
                size={16}
                className="gh-prompt-platform-chevron"
                aria-hidden="true"
              />
            </button>

            {isPlatformPickerOpen &&
              platformPickerPosition &&
              createPortal(
                <div
                  ref={platformPickerPanelRef}
                  id="gh-prompt-platform-picker-panel"
                  className="gh-prompt-platform-picker-panel gh-interactive"
                  {...OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS}
                  role="group"
                  aria-labelledby="gh-prompt-platform-label"
                  data-placement={platformPickerPosition.placement}
                  style={{
                    top: `${platformPickerPosition.top}px`,
                    left: `${platformPickerPosition.left}px`,
                    width: `${platformPickerPosition.width}px`,
                    height: `${platformPickerPosition.height}px`,
                    pointerEvents: "auto",
                  }}>
                  <div className="gh-prompt-platform-search">
                    <SearchIcon size={15} aria-hidden="true" />
                    <input
                      ref={platformSearchInputRef}
                      type="search"
                      value={platformSearchQuery}
                      onChange={(event) => setPlatformSearchQuery(event.target.value)}
                      placeholder={t("promptPlatformSearch")}
                      aria-label={t("promptPlatformSearch")}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <button
                    type="button"
                    className="gh-prompt-platform-all"
                    aria-pressed={selectedPlatformIds.length === 0}
                    onClick={() => {
                      setEditingPrompt({ ...editingPrompt, platforms: undefined })
                    }}>
                    <GlobeIcon size={16} />
                    <span>{t("promptPlatformAll")}</span>
                    {selectedPlatformIds.length === 0 && <CheckIcon size={15} />}
                  </button>

                  <div className="gh-prompt-platform-options">
                    {filteredPlatforms.length === 0 ? (
                      <div className="gh-prompt-platform-empty">{t("promptPlatformNoMatches")}</div>
                    ) : (
                      filteredPlatforms.map((platform) => {
                        const selected = selectedPlatformIds.includes(platform.id)
                        return (
                          <button
                            type="button"
                            key={platform.id}
                            className="gh-prompt-platform-option"
                            aria-pressed={selected}
                            onClick={() => {
                              const next = selected
                                ? selectedPlatformIds.filter((id) => id !== platform.id)
                                : [...selectedPlatformIds, platform.id]
                              setEditingPrompt({
                                ...editingPrompt,
                                platforms: next.length > 0 ? next : undefined,
                              })
                            }}>
                            <PlatformIcon name={platform.name} size={16} />
                            <span>{platform.name}</span>
                            {selected && <CheckIcon size={15} />}
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>,
                document.body,
              )}
          </div>
        </div>

        {/* 内容 */}
        <div style={{ marginBottom: "16px" }}>
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "6px",
              }}>
              <label
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--gh-text, #374151)",
                }}>
                {t("content")}
              </label>
              {/* ⭐ 预览开关 */}
              <button
                onClick={() => setShowPreview(!showPreview)}
                style={{
                  padding: "2px 8px",
                  fontSize: "12px",
                  background: showPreview
                    ? "var(--gh-primary, #4285f4)"
                    : "var(--gh-hover, #f3f4f6)",
                  color: showPreview ? "white" : "var(--gh-text-secondary, #6b7280)",
                  border: "1px solid var(--gh-border, #d1d5db)",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}>
                {t("promptMarkdownPreview")}
              </button>
            </div>
            <textarea
              className="gh-prompt-editor-scrollable"
              value={editingPrompt?.content || ""}
              onChange={(e) => setEditingPrompt({ ...editingPrompt, content: e.target.value })}
              style={{
                width: "100%",
                minHeight: "120px",
                padding: "8px 12px",
                border: "1px solid var(--gh-border, #d1d5db)",
                borderRadius: "6px",
                fontSize: "14px",
                resize: "vertical",
                boxSizing: "border-box",
                fontFamily: "inherit",
                background: "var(--gh-bg, #ffffff)",
                color: "var(--gh-text, #1f2937)",
                display: showPreview ? "none" : "block",
              }}
            />
            {/* ⭐ Markdown 预览区域 */}
            {showPreview && (
              <>
                <div
                  className="gh-markdown-preview gh-prompt-editor-scrollable"
                  style={{
                    width: "100%",
                    minHeight: "120px",
                    maxHeight: "200px",
                    padding: "8px 12px",
                    border: "1px solid var(--gh-border, #d1d5db)",
                    borderRadius: "6px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    background: "var(--gh-bg-secondary, #f9fafb)",
                    color: "var(--gh-text, #1f2937)",
                    overflowY: "auto",
                    lineHeight: 1.6,
                  }}
                  ref={editPreviewRef}
                  onClick={(e) => {
                    // 事件委托处理复制按钮（支持点击 SVG 内部）
                    const target = e.target as HTMLElement
                    const btn = target.closest(".gh-code-copy-btn") as HTMLElement
                    if (btn) {
                      const code = btn.nextElementSibling?.textContent || ""
                      navigator.clipboard.writeText(code).then(() => {
                        showCopySuccess(btn, { size: 14 })
                      })
                    }
                  }}
                  dangerouslySetInnerHTML={{
                    __html: createSafeHTML(renderMarkdown(editingPrompt?.content || "")),
                  }}
                />
                <style>{getHighlightStyles()}</style>
              </>
            )}
          </div>
        </div>

        {/* 按钮 */}
        <div
          style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
          <Button
            variant="ghost"
            onClick={onClose}
            style={{ background: "var(--gh-hover, #f3f4f6)" }}>
            {t("cancel")}
          </Button>
          <Button variant="primary" onClick={onSave}>
            {editingPrompt?.id ? t("save") : t("add")}
          </Button>
        </div>
      </div>
      <style>{PROMPT_EDITOR_STYLES}</style>
    </div>,
    document.body,
  )
}
