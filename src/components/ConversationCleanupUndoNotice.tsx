import React, { useCallback, useEffect, useId, useRef, useState } from "react"

import type { ConversationManager } from "~core/conversation-manager"
import { t } from "~utils/i18n"
import { showToast } from "~utils/toast"

const UNDO_NOTICE_DURATION_MS = 5000

interface CleanupUndoNoticeProps {
  manager: ConversationManager
  context: string
  revision: number
  count: number
  disabled: boolean
}

export function ConversationCleanupUndoNotice({
  manager,
  context,
  revision,
  count,
  disabled,
}: CleanupUndoNoticeProps) {
  const [remainingMs, setRemainingMs] = useState(UNDO_NOTICE_DURATION_MS)
  const remainingRef = useRef(UNDO_NOTICE_DURATION_MS)
  const noticeRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pageHidden, setPageHidden] = useState(() => document.hidden)
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  )
  const hintId = useId()
  const paused = hovered || focused || pageHidden || disabled
  const expire = useCallback(
    () => manager.expireCleanupUndo(context, revision),
    [manager, context, revision],
  )

  useEffect(() => {
    const notice = noticeRef.current
    if (!notice) return
    // React 的 enter/leave 合成事件在 Shadow DOM portal 中会丢失；在元素上直接监听。
    const onPointerEnter = (event: PointerEvent) => {
      if (event.pointerType !== "touch") setHovered(true)
    }
    const onPointerLeave = () => setHovered(false)
    const onFocusIn = () => setFocused(true)
    const onFocusOut = (event: FocusEvent) => {
      setFocused(event.relatedTarget instanceof Node && notice.contains(event.relatedTarget))
    }
    setHovered(notice.matches(":hover") && window.matchMedia("(hover: hover)").matches)
    const root = notice.getRootNode() as Document | ShadowRoot
    setFocused(notice.contains(root.activeElement))
    const onVisibilityChange = () => setPageHidden(document.hidden)
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onMotionChange = () => setReducedMotion(media.matches)
    document.addEventListener("visibilitychange", onVisibilityChange)
    media.addEventListener("change", onMotionChange)
    notice.addEventListener("pointerenter", onPointerEnter)
    notice.addEventListener("pointerleave", onPointerLeave)
    notice.addEventListener("focusin", onFocusIn)
    notice.addEventListener("focusout", onFocusOut)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      media.removeEventListener("change", onMotionChange)
      notice.removeEventListener("pointerenter", onPointerEnter)
      notice.removeEventListener("pointerleave", onPointerLeave)
      notice.removeEventListener("focusin", onFocusIn)
      notice.removeEventListener("focusout", onFocusOut)
    }
  }, [])

  useEffect(() => {
    if (paused) return
    let previousTime = performance.now()
    let frameId: number
    const tick = (now: number) => {
      remainingRef.current = Math.max(0, remainingRef.current - (now - previousTime))
      previousTime = now
      // 弧与数字共用一个时钟；减少动态效果时仅每秒更新一次。
      setRemainingMs(
        reducedMotion ? Math.ceil(remainingRef.current / 1000) * 1000 : remainingRef.current,
      )
      if (remainingRef.current === 0) {
        expire()
        return
      }
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [paused, reducedMotion, expire])

  const message = t("conversationsCleanupDone", { count })
  const hint = t("conversationsCleanupUndoHint", { seconds: UNDO_NOTICE_DURATION_MS / 1000 })

  return (
    <div ref={noticeRef} className="gh-sync-review-notice gh-cleanup-undo-notice" role="status">
      <span className="gh-cleanup-undo-message" title={message}>
        {message}
      </span>
      <button
        type="button"
        className="gh-cleanup-undo-action"
        disabled={disabled}
        title={hint}
        aria-describedby={hintId}
        onClick={() => {
          if (manager.undoMissingConversationCleanup() > 0)
            showToast(t("conversationsCleanupRestored"))
        }}>
        <span className="gh-cleanup-countdown" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle className="gh-cleanup-countdown-track" cx="12" cy="12" r="10" />
            <circle
              className="gh-cleanup-countdown-progress"
              cx="12"
              cy="12"
              r="10"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={1 - remainingMs / UNDO_NOTICE_DURATION_MS}
              transform="rotate(-90 12 12)"
            />
          </svg>
          <span className="gh-cleanup-countdown-seconds">{Math.ceil(remainingMs / 1000)}</span>
        </span>
        <span>{t("conversationsCleanupUndo")}</span>
      </button>
      <span className="gh-cleanup-undo-hint" id={hintId}>
        {hint}
      </span>
    </div>
  )
}
