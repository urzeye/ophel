import React, { useLayoutEffect, useRef, useState } from "react"

import { GlobeIcon } from "~components/icons"
import { Tooltip } from "~components/ui"
import { SUPPORTED_AI_PLATFORMS } from "~constants/defaults"
import { t } from "~utils/i18n"

import { PlatformIcon } from "./PlatformIcon"

interface PromptPlatformSummaryProps {
  platforms?: string[]
  maxVisible?: number
  iconSize?: number
  currentPlatformId?: string | null
  fitAvailableWidth?: boolean
  className?: string
  style?: React.CSSProperties
}

const SUMMARY_GAP = 3

const SUMMARY_STYLE: React.CSSProperties = {
  minWidth: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: `${SUMMARY_GAP}px`,
  flexShrink: 0,
  lineHeight: 1,
  whiteSpace: "nowrap",
}

const ICON_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
}

const MORE_BADGE_STYLE: React.CSSProperties = {
  minWidth: "20px",
  height: "18px",
  padding: "0 5px",
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
  border: "1px solid var(--gh-border, #e5e7eb)",
  borderRadius: "999px",
  background: "var(--gh-hover, #f3f4f6)",
  color: "var(--gh-text-secondary, #6b7280)",
  fontSize: "10px",
  fontWeight: 600,
  lineHeight: 1,
}

export const PromptPlatformSummary: React.FC<PromptPlatformSummaryProps> = ({
  platforms,
  maxVisible,
  iconSize = 14,
  className = "",
  style,
  currentPlatformId,
  fitAvailableWidth = false,
}) => {
  const isAllPlatforms = !platforms?.length
  const resolvedPlatforms = SUPPORTED_AI_PLATFORMS.filter((platform) =>
    platforms?.includes(platform.id),
  ).sort((a, b) => Number(b.id === currentPlatformId) - Number(a.id === currentPlatformId))
  const fitContainerRef = useRef<HTMLSpanElement>(null)
  const [fittedVisibleCount, setFittedVisibleCount] = useState<number | null>(null)
  const visibleLimit = Math.max(
    1,
    Math.min(
      resolvedPlatforms.length,
      fitAvailableWidth ? fittedVisibleCount ?? resolvedPlatforms.length : maxVisible ?? 3,
    ),
  )

  useLayoutEffect(() => {
    if (!fitAvailableWidth || isAllPlatforms || resolvedPlatforms.length === 0) {
      setFittedVisibleCount(null)
      return
    }

    const container = fitContainerRef.current
    if (!container) return

    const calculateVisibleCount = () => {
      const availableWidth = container.clientWidth
      const configuredLimit = Math.min(
        resolvedPlatforms.length,
        maxVisible ?? resolvedPlatforms.length,
      )

      for (let count = configuredLimit; count >= 1; count -= 1) {
        const hiddenCount = resolvedPlatforms.length - count
        const iconsWidth = count * iconSize + Math.max(0, count - 1) * SUMMARY_GAP
        const moreBadgeWidth =
          hiddenCount > 0 ? Math.max(20, 10 + `+${hiddenCount}`.length * 6) + SUMMARY_GAP : 0

        if (iconsWidth + moreBadgeWidth <= availableWidth) {
          setFittedVisibleCount((current) => (current === count ? current : count))
          return
        }
      }

      setFittedVisibleCount(1)
    }

    calculateVisibleCount()

    const observer = new ResizeObserver(calculateVisibleCount)
    observer.observe(container)

    return () => observer.disconnect()
  }, [fitAvailableWidth, iconSize, isAllPlatforms, maxVisible, resolvedPlatforms.length])

  if (!isAllPlatforms && resolvedPlatforms.length === 0) return null

  const visiblePlatforms = resolvedPlatforms.slice(0, visibleLimit)
  const hiddenCount = resolvedPlatforms.length - visiblePlatforms.length
  const accessibleLabel = isAllPlatforms
    ? t("promptPlatformAll")
    : resolvedPlatforms.map((platform) => platform.name).join(", ")
  const summary = (
    <Tooltip
      content={accessibleLabel}
      maxWidth="min(360px, calc(100vw - 24px))"
      delay={250}
      triggerStyle={{ minWidth: 0, cursor: "default" }}>
      <span
        role="img"
        aria-label={accessibleLabel}
        className={`gh-prompt-platform-summary ${className}`.trim()}
        style={{ ...SUMMARY_STYLE, ...(fitAvailableWidth ? undefined : style) }}>
        {isAllPlatforms ? (
          <span aria-hidden="true" style={{ ...ICON_STYLE, width: iconSize, height: iconSize }}>
            <GlobeIcon size={iconSize} />
          </span>
        ) : (
          visiblePlatforms.map((platform) => (
            <span
              key={platform.id}
              aria-hidden="true"
              style={{ ...ICON_STYLE, width: iconSize, height: iconSize }}>
              <PlatformIcon name={platform.name} size={iconSize} />
            </span>
          ))
        )}
        {!isAllPlatforms && hiddenCount > 0 && (
          <span aria-hidden="true" style={MORE_BADGE_STYLE}>
            +{hiddenCount}
          </span>
        )}
      </span>
    </Tooltip>
  )

  if (!fitAvailableWidth) return summary

  return (
    <span
      ref={fitContainerRef}
      className="gh-prompt-platform-summary-fit"
      style={{
        width: "100%",
        minWidth: 0,
        display: "inline-flex",
        overflow: "hidden",
        ...style,
      }}>
      {summary}
    </span>
  )
}
