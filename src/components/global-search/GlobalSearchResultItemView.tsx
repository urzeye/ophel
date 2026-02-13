import React from "react"

import { splitGlobalSearchHighlightSegments } from "./highlight"
import type { GlobalSearchMatchReason, GlobalSearchResultItem } from "./types"

interface GlobalSearchResultItemViewProps {
  item: GlobalSearchResultItem
  index: number
  optionIdPrefix: string
  isActive: boolean
  highlightTokens: string[]
  outlineRoleLabels: {
    query: string
    reply: string
  }
  matchReasonLabels: Record<GlobalSearchMatchReason, string>
  onMouseMove: () => void
  onMouseEnter: (event: React.MouseEvent<HTMLDivElement>) => void
  onMouseLeave: () => void
  onClick: () => void
}

export const GlobalSearchResultItemView = ({
  item,
  index,
  optionIdPrefix,
  isActive,
  highlightTokens,
  outlineRoleLabels,
  matchReasonLabels,
  onMouseMove,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: GlobalSearchResultItemViewProps) => {
  const renderSearchHighlightedParts = (
    value: string,
    variant: "default" | "tag" | "code" = "default",
    fuzzyIndexes?: number[],
  ) => {
    const segments = splitGlobalSearchHighlightSegments(value, highlightTokens, fuzzyIndexes)

    return segments.map((segment, segmentIndex) => {
      if (segment.matchType === "none") {
        return (
          <React.Fragment key={`plain-${segmentIndex}-${segment.text.length}`}>
            {segment.text}
          </React.Fragment>
        )
      }

      const highlightClassName = [
        "settings-search-highlight",
        variant === "tag" ? "settings-search-highlight-tag" : "",
        variant === "code" ? "settings-search-highlight-code" : "",
        segment.matchType === "fuzzy" ? "settings-search-highlight-fuzzy" : "",
      ]
        .filter(Boolean)
        .join(" ")

      return (
        <mark
          key={`highlight-${segmentIndex}-${segment.text.length}`}
          className={highlightClassName}>
          {segment.text}
        </mark>
      )
    })
  }

  const isOutlineItem = item.category === "outline" && Boolean(item.outlineTarget)
  const isConversationItem = item.category === "conversations"
  const isPromptItem = item.category === "prompts"
  const isOutlineQuery = isOutlineItem && Boolean(item.outlineTarget?.isUserQuery)
  const outlineRoleLabel = isOutlineQuery ? outlineRoleLabels.query : outlineRoleLabels.reply
  const showCodeOnMeta = Boolean(item.code) && !isOutlineItem
  const fuzzyMatchField = item.fuzzyMatch?.field
  const fuzzyTitleIndexes = fuzzyMatchField === "title" ? item.fuzzyMatch?.indexes : undefined
  const fuzzyBreadcrumbIndexes =
    fuzzyMatchField === "breadcrumb" ? item.fuzzyMatch?.indexes : undefined
  const fuzzySnippetIndexes = fuzzyMatchField === "snippet" ? item.fuzzyMatch?.indexes : undefined
  const fuzzyCodeIndexes = fuzzyMatchField === "code" ? item.fuzzyMatch?.indexes : undefined
  const promptSnippetPrefix =
    item.category === "prompts" && item.matchReasons?.includes("content")
      ? `${matchReasonLabels.content}: `
      : ""
  const matchReasonBadges =
    item.matchReasons && item.matchReasons.length > 0
      ? item.matchReasons.map((reason) => ({
          reason,
          label: matchReasonLabels[reason],
        }))
      : []

  return (
    <div
      id={`${optionIdPrefix}-${index}`}
      role="option"
      aria-selected={isActive}
      tabIndex={-1}
      data-global-search-index={index}
      data-global-search-item-id={item.id}
      className={`settings-search-item ${isActive ? "active" : ""} ${
        isOutlineItem
          ? isOutlineQuery
            ? "outline-item outline-query"
            : "outline-item outline-reply"
          : ""
      } ${isConversationItem ? "conversation-item" : ""}`.trim()}
      onMouseMove={onMouseMove}
      onMouseEnter={(event) => {
        if (!isPromptItem) {
          return
        }

        onMouseEnter(event)
      }}
      onMouseLeave={() => {
        if (!isPromptItem) {
          return
        }

        onMouseLeave()
      }}
      onClick={onClick}>
      <div className="settings-search-item-title" title={item.title}>
        {isOutlineItem ? (
          <div className="settings-search-outline-head">
            <span
              className={`settings-search-outline-role ${isOutlineQuery ? "query" : "reply"}`}
              title={outlineRoleLabel}>
              {outlineRoleLabel}
            </span>
            {item.code ? (
              <span className="settings-search-outline-code" title={item.code}>
                {renderSearchHighlightedParts(item.code, "code", fuzzyCodeIndexes)}
              </span>
            ) : null}
            <span className="settings-search-item-title-text">
              {renderSearchHighlightedParts(item.title, "default", fuzzyTitleIndexes)}
            </span>
          </div>
        ) : (
          <span className="settings-search-item-title-text">
            {renderSearchHighlightedParts(item.title, "default", fuzzyTitleIndexes)}
          </span>
        )}
      </div>
      {item.snippet ? (
        <div
          className="settings-search-item-snippet"
          title={`${promptSnippetPrefix}${item.snippet}`}>
          {promptSnippetPrefix ? (
            <span className="settings-search-item-snippet-prefix">{promptSnippetPrefix}</span>
          ) : null}
          {renderSearchHighlightedParts(item.snippet, "default", fuzzySnippetIndexes)}
        </div>
      ) : null}
      <div className={`settings-search-item-meta ${showCodeOnMeta ? "" : "no-code"}`.trim()}>
        <div className="settings-search-item-meta-left">
          <span className="settings-search-item-breadcrumb" title={item.breadcrumb}>
            {renderSearchHighlightedParts(item.breadcrumb, "default", fuzzyBreadcrumbIndexes)}
          </span>
          {item.category === "conversations" && item.tagBadges && item.tagBadges.length > 0 ? (
            <div className="settings-search-tag-list">
              {item.tagBadges.map((tag) => (
                <span
                  key={tag.id}
                  className="settings-search-tag"
                  style={{ backgroundColor: tag.color }}
                  title={tag.name}>
                  {renderSearchHighlightedParts(tag.name, "tag")}
                </span>
              ))}
            </div>
          ) : null}
          {matchReasonBadges.length > 0 ? (
            <div className="settings-search-match-reason-list">
              {matchReasonBadges.map((reasonBadge) => (
                <span key={reasonBadge.reason} className="settings-search-match-reason-badge">
                  {reasonBadge.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {showCodeOnMeta ? (
          <code title={item.code}>
            {renderSearchHighlightedParts(item.code!, "code", fuzzyCodeIndexes)}
          </code>
        ) : null}
      </div>
    </div>
  )
}
