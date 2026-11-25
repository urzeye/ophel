import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

import { CONVERSATION_SYNC_REVIEW_STYLES } from "~styles/conversation-sync-review-inline"

import type {
  Conversation,
  ConversationManager,
  ConversationSyncReview as SyncReview,
  Folder,
  Tag,
} from "~core/conversation-manager"
import { getSafeConversationOpenUrl } from "~utils/conversation-url"
import { t } from "~utils/i18n"
import { showToast } from "~utils/toast"

import { ClearIcon, ExternalLinkIcon, InfoIcon, PinIcon } from "./icons"
import { DialogOverlay } from "./ui"
import { ConversationCleanupUndoNotice } from "./ConversationCleanupUndoNotice"

interface ReviewProps {
  manager: ConversationManager
  conversations: Record<string, Conversation>
  folders: Folder[]
  tags: Tag[]
  onInteractionStateChange?: (active: boolean) => void
}

export function ConversationSyncReview({
  manager,
  conversations,
  folders,
  tags,
  onInteractionStateChange,
}: ReviewProps) {
  const review = useSyncExternalStore(manager.subscribeSyncReview, manager.getSyncReview)
  const progress = useSyncExternalStore(manager.subscribeSyncProgress, manager.getSyncProgress)
  const [openContext, setOpenContext] = useState<string | null>(null)
  const closeReview = useCallback(() => setOpenContext(null), [])
  const isOpen = Boolean(review && review.context === openContext)

  useEffect(() => {
    if (openContext && (!review || review.context !== openContext)) setOpenContext(null)
  }, [openContext, review])

  useEffect(() => {
    onInteractionStateChange?.(isOpen)
    return () => onInteractionStateChange?.(false)
  }, [isOpen, onInteractionStateChange])

  if (!review) return null
  const count = review.missingIds.length
  return (
    <>
      {review.undoCount > 0 && (
        <ConversationCleanupUndoNotice
          key={`${review.context}:${review.undoRevision}`}
          manager={manager}
          context={review.context}
          revision={review.undoRevision}
          count={review.undoCount}
          disabled={Boolean(progress)}
        />
      )}
      {count > 0 && (
        <div className={`gh-sync-review-notice ${review.dismissed ? "is-compact" : ""}`}>
          {!review.dismissed && <InfoIcon size={16} />}
          <span role="status">
            {t(review.dismissed ? "conversationsMissingCompact" : "conversationsMissingNotice", {
              count,
            })}
          </span>
          <button
            type="button"
            disabled={Boolean(progress)}
            onClick={() => setOpenContext(review.context)}>
            {t("conversationsMissingReview")}
          </button>
          {!review.dismissed && (
            <button
              type="button"
              className="gh-sync-review-notice-close"
              aria-label={t("close")}
              onClick={manager.dismissSyncReview}>
              <ClearIcon size={14} />
            </button>
          )}
        </div>
      )}
      {isOpen && (
        <ReviewDialog
          manager={manager}
          review={review}
          conversations={conversations}
          folders={folders}
          tags={tags}
          syncing={Boolean(progress)}
          onClose={closeReview}
        />
      )}
    </>
  )
}

function ReviewDialog({
  manager,
  review,
  conversations,
  folders,
  tags,
  syncing,
  onClose,
}: ReviewProps & {
  review: SyncReview
  syncing: boolean
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const folderNames = new Map(
    folders.map((folder) => [
      folder.id,
      folder.id === "inbox" ? t("conversationsInbox") : folder.name,
    ]),
  )
  const tagMap = new Map(tags.map((tag) => [tag.id, tag]))
  const candidates = review.missingIds.map((id) => conversations[id]).filter(Boolean)
  const candidateIds = useMemo(() => new Set(review.missingIds), [review.missingIds])
  const selected = Array.from(selectedIds).filter((id) => candidateIds.has(id) && conversations[id])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = candidates.filter((conv) =>
    [
      conv.title,
      folderNames.get(conv.folderId),
      ...(conv.tagIds ?? []).map((id) => tagMap.get(id)?.name),
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)),
  )
  const allSelected = filtered.length > 0 && filtered.every((conv) => selectedIds.has(conv.id))

  useEffect(() => {
    setSelectedIds((previous) => {
      const next = new Set([...previous].filter((id) => candidateIds.has(id)))
      return next.size === previous.size ? previous : next
    })
  }, [candidateIds])

  useEffect(() => {
    if (selectAllRef.current)
      selectAllRef.current.indeterminate =
        !allSelected && filtered.some((conv) => selectedIds.has(conv.id))
  }, [allSelected, filtered, selectedIds])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let previousFocus = document.activeElement
    while (previousFocus?.shadowRoot?.activeElement) {
      previousFocus = previousFocus.shadowRoot.activeElement
    }
    // 原生事件先于 overlay 的宿主快捷键防护执行；React 冒泡事件会被防护拦截。
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== "Tab") return
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), a[href]"),
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    root.addEventListener("keydown", onKeyDown)
    const initialFocus = window.matchMedia("(max-width: 520px)").matches
      ? root.querySelector<HTMLButtonElement>("button")
      : searchRef.current
    initialFocus?.focus({ preventScroll: true })
    return () => {
      root.removeEventListener("keydown", onKeyDown)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [onClose])

  return (
    <DialogOverlay
      onClose={onClose}
      ariaLabel={t("conversationsMissingTitle")}
      dialogClassName="gh-dialog-frame gh-sync-review">
      <style>{CONVERSATION_SYNC_REVIEW_STYLES}</style>
      <div ref={rootRef} className="gh-sync-review-content">
        <header className="gh-dialog-frame-header">
          <div>
            <h2 className="gh-dialog-frame-title">{t("conversationsMissingTitle")}</h2>
          </div>
          <button
            type="button"
            className="gh-dialog-frame-close"
            aria-label={t("close")}
            onClick={onClose}>
            <ClearIcon size={16} />
          </button>
        </header>
        <div className="gh-sync-review-body">
          <p className="gh-dialog-frame-subtitle">{t("conversationsMissingDescription")}</p>
          <div className="gh-sync-review-controls">
            <input
              ref={searchRef}
              type="search"
              className="gh-dialog-input"
              aria-label={t("conversationsMissingSearch")}
              placeholder={t("conversationsMissingSearch")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="gh-sync-review-selection">
              <label>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  disabled={filtered.length === 0}
                  onChange={() => {
                    const next = new Set(selectedIds)
                    filtered.forEach((conv) =>
                      allSelected ? next.delete(conv.id) : next.add(conv.id),
                    )
                    setSelectedIds(next)
                  }}
                />
                {t("conversationsMissingSelectResults")}
              </label>
              <span className="gh-sync-review-count" role="status">
                {t("conversationsMissingSelection", {
                  selected: selected.length,
                  total: candidates.length,
                })}
              </span>
              <button
                type="button"
                className="gh-sync-review-invert"
                disabled={filtered.length === 0}
                onClick={() => {
                  setSelectedIds((previous) => {
                    const next = new Set(previous)
                    filtered.forEach((conv) =>
                      next.has(conv.id) ? next.delete(conv.id) : next.add(conv.id),
                    )
                    return next
                  })
                }}>
                {t("conversationsMissingInvertSelection")}
              </button>
            </div>
          </div>
          <div className="gh-sync-review-list">
            {filtered.length === 0 && (
              <p className="gh-sync-review-empty" role="status">
                {t(
                  candidates.length === 0
                    ? "conversationsMissingResolved"
                    : "conversationsNoSearchResult",
                )}
              </p>
            )}
            {filtered.map((conv) => {
              const url = getSafeConversationOpenUrl(conv)
              return (
                <div className="gh-sync-review-row" key={conv.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(conv.id)}
                      onChange={() => {
                        const next = new Set(selectedIds)
                        if (next.has(conv.id)) next.delete(conv.id)
                        else next.add(conv.id)
                        setSelectedIds(next)
                      }}
                    />
                    <span className="gh-sync-review-row-content">
                      <span className="gh-sync-review-row-title">{conv.title}</span>
                      <span className="gh-sync-review-meta">
                        <span>{folderNames.get(conv.folderId) ?? t("conversationsInbox")}</span>
                        {conv.pinned && (
                          <span>
                            <PinIcon size={12} />
                            {t("conversationsPinned")}
                          </span>
                        )}
                        {(conv.tagIds ?? []).map((id) => {
                          const tag = tagMap.get(id)
                          return tag ? (
                            <span key={id}>
                              <span
                                className="gh-sync-review-tag-dot"
                                style={{ backgroundColor: tag.color }}
                              />
                              {tag.name}
                            </span>
                          ) : null
                        })}
                      </span>
                    </span>
                  </label>
                  {url && (
                    <a
                      className="gh-sync-review-open"
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${t("conversationsMissingOpen")}: ${conv.title}`}
                      title={t("conversationsMissingOpen")}>
                      <ExternalLinkIcon size={16} />
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <footer className="gh-dialog-frame-footer gh-sync-review-footer">
          <p>{t("conversationsMissingLocalOnly")}</p>
          <div className="gh-sync-review-footer-actions">
            <button
              type="button"
              className="gh-dialog-btn gh-dialog-btn-secondary"
              onClick={onClose}>
              {t("conversationsMissingKeep")}
            </button>
            <button
              type="button"
              className="gh-dialog-btn gh-dialog-btn-danger"
              disabled={selected.length === 0 || syncing}
              onClick={() => {
                const removed = manager.removeMissingConversations(selected, review.context)
                if (removed === 0) {
                  showToast(t("conversationsMissingChanged"))
                  return
                }
                onClose()
              }}>
              {t("conversationsMissingRemove", { count: selected.length })}
            </button>
          </div>
        </footer>
      </div>
    </DialogOverlay>
  )
}
