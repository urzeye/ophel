import React, { useEffect, useRef, useSyncExternalStore } from "react"

import { elementPickerController } from "~core/element-picker-controller"
import { t } from "~utils/i18n"

type ResolvedEventTarget =
  | { kind: "host"; element: Element }
  | { kind: "iframe-guard" }
  | { kind: "ophel" }
  | { kind: "none" }

const getComposedPath = (event: Event): EventTarget[] =>
  typeof event.composedPath === "function"
    ? event.composedPath()
    : event.target
      ? [event.target]
      : []

const getElementLabel = (element: Element | null): string =>
  element ? `<${element.localName || element.tagName.toLowerCase()}>` : ""

const stopNativeEvent = (event: Event): void => {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

export function ElementPickerOverlay() {
  const snapshot = useSyncExternalStore(
    elementPickerController.subscribe,
    elementPickerController.getSnapshot,
    elementPickerController.getSnapshot,
  )
  const overlayRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(false)
  const isActive = snapshot.phase === "picking"

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      queueMicrotask(() => {
        if (!mountedRef.current && elementPickerController.getSnapshot().phase === "picking") {
          elementPickerController.cancel("unmounted")
        }
      })
    }
  }, [])

  useEffect(() => {
    if (!isActive) return

    const ownRoot = overlayRef.current?.getRootNode()
    let currentTarget: Element | null = null
    let pendingTarget: Element | null | undefined
    let animationFrameId: number | null = null

    const resolveEventTarget = (event: Event): ResolvedEventTarget => {
      const path = getComposedPath(event)
      if (ownRoot instanceof ShadowRoot && path.includes(ownRoot)) {
        const isIframeGuard = path.some(
          (node) =>
            node instanceof Element && node.classList.contains("gh-element-picker-iframe-guard"),
        )
        if (isIframeGuard) return { kind: "iframe-guard" }
        return { kind: "ophel" }
      }

      const element = path.find((node): node is Element => node instanceof Element)
      return element ? { kind: "host", element } : { kind: "none" }
    }

    const clearTarget = () => {
      currentTarget = null
      const currentSnapshot = elementPickerController.getSnapshot()
      if (currentSnapshot.phase === "picking" && currentSnapshot.hoveredElement) {
        elementPickerController.clearHoveredElement()
      }
    }

    const commitTarget = (target: Element | null): boolean => {
      if (elementPickerController.getSnapshot().phase !== "picking") return false
      if (!target || !target.isConnected) {
        clearTarget()
        return false
      }

      const rect = target.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        clearTarget()
        return false
      }

      currentTarget = target
      elementPickerController.setHoveredElement(
        target,
        rect,
        target instanceof HTMLIFrameElement ? "unsupported-iframe" : "element",
      )
      return true
    }

    const flushGeometry = () => {
      animationFrameId = null
      const target = pendingTarget === undefined ? currentTarget : pendingTarget
      pendingTarget = undefined
      commitTarget(target)
    }

    const scheduleFrame = () => {
      if (animationFrameId !== null) return
      animationFrameId = window.requestAnimationFrame(flushGeometry)
    }

    const scheduleTarget = (target: Element | null) => {
      pendingTarget = target
      scheduleFrame()
    }

    const scheduleRefresh = () => {
      scheduleFrame()
    }

    const commitImmediateTarget = (target: Element): boolean => {
      pendingTarget = undefined
      return commitTarget(target)
    }

    const handlePointerCandidate = (event: PointerEvent) => {
      const resolved = resolveEventTarget(event)
      if (resolved.kind === "iframe-guard") {
        scheduleRefresh()
        return
      }
      scheduleTarget(resolved.kind === "host" ? resolved.element : null)
    }

    const handlePointerDown = (event: PointerEvent) => {
      const resolved = resolveEventTarget(event)
      if (resolved.kind !== "host") return

      stopNativeEvent(event)
      commitImmediateTarget(resolved.element)
    }

    const handleClick = (event: MouseEvent) => {
      const resolved = resolveEventTarget(event)
      if (resolved.kind !== "host") return

      stopNativeEvent(event)
      if (event.button !== 0 || !commitImmediateTarget(resolved.element)) return
      if (elementPickerController.getSnapshot().hoverKind === "unsupported-iframe") return

      elementPickerController.select(resolved.element)
    }

    const handleContextMenu = (event: MouseEvent) => {
      const resolved = resolveEventTarget(event)
      if (resolved.kind !== "host") return

      stopNativeEvent(event)
      commitImmediateTarget(resolved.element)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      stopNativeEvent(event)
      elementPickerController.cancel("escape")
    }

    document.addEventListener("pointermove", handlePointerCandidate, true)
    document.addEventListener("pointerover", handlePointerCandidate, true)
    document.addEventListener("pointerdown", handlePointerDown, true)
    document.addEventListener("click", handleClick, true)
    document.addEventListener("contextmenu", handleContextMenu, true)
    document.addEventListener("keydown", handleKeyDown, true)
    document.addEventListener("wheel", scheduleRefresh, { capture: true, passive: true })
    window.addEventListener("scroll", scheduleRefresh, true)
    window.addEventListener("resize", scheduleRefresh)

    return () => {
      document.removeEventListener("pointermove", handlePointerCandidate, true)
      document.removeEventListener("pointerover", handlePointerCandidate, true)
      document.removeEventListener("pointerdown", handlePointerDown, true)
      document.removeEventListener("click", handleClick, true)
      document.removeEventListener("contextmenu", handleContextMenu, true)
      document.removeEventListener("keydown", handleKeyDown, true)
      document.removeEventListener("wheel", scheduleRefresh, true)
      window.removeEventListener("scroll", scheduleRefresh, true)
      window.removeEventListener("resize", scheduleRefresh)
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId)
      }
    }
  }, [isActive])

  if (snapshot.phase !== "picking") return null

  const highlightStyle = snapshot.rect
    ? {
        width: `${snapshot.rect.width}px`,
        height: `${snapshot.rect.height}px`,
        transform: `translate3d(${snapshot.rect.left}px, ${snapshot.rect.top}px, 0)`,
      }
    : undefined
  const isUnsupportedIframe = snapshot.hoverKind === "unsupported-iframe"

  const blockGuardEvent = (event: React.SyntheticEvent) => {
    event.preventDefault()
    event.stopPropagation()
    event.nativeEvent.stopImmediatePropagation()
  }

  return (
    <div ref={overlayRef} className="gh-element-picker-overlay">
      {snapshot.rect && (
        <>
          <div
            aria-hidden="true"
            className={`gh-element-picker-highlight ${isUnsupportedIframe ? "is-unsupported" : ""}`}
            style={highlightStyle}
          />
          {isUnsupportedIframe && (
            <div
              aria-hidden="true"
              className="gh-element-picker-iframe-guard gh-interactive"
              style={highlightStyle}
              onPointerDown={blockGuardEvent}
              onPointerUp={blockGuardEvent}
              onClick={blockGuardEvent}
              onContextMenu={blockGuardEvent}
            />
          )}
        </>
      )}

      <section
        className={`gh-element-picker-instructions ${isUnsupportedIframe ? "is-unsupported" : ""}`}
        role="status"
        aria-live="polite">
        {snapshot.hoveredElement && (
          <span aria-hidden="true" className="gh-element-picker-tag">
            {getElementLabel(snapshot.hoveredElement)}
          </span>
        )}
        <span className="gh-element-picker-message">
          {isUnsupportedIframe
            ? t("elementPickerIframeUnsupported")
            : t("elementPickerInstruction")}
        </span>
        <span className="gh-element-picker-hint">{t("elementPickerCancelHint")}</span>
      </section>
    </div>
  )
}
