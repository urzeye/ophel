import React, { useEffect, useRef, useState } from "react"

import { CheckIcon, ChevronDownIcon, CopyIcon, StarIcon } from "~components/icons"
import { Tooltip } from "~components/ui/Tooltip"
import type { OutlineNode } from "~core/outline-manager"
import { formatWordCount } from "~utils/format"
import { getCurrentLang, t } from "~utils/i18n"

const OUTLINE_ITEM_LINE_HEIGHT = 24
const OUTLINE_ITEM_VERTICAL_PADDING = 12
const OUTLINE_ITEM_VERTICAL_BORDER = 2
const OUTLINE_ITEM_HEIGHT =
  OUTLINE_ITEM_LINE_HEIGHT + OUTLINE_ITEM_VERTICAL_PADDING + OUTLINE_ITEM_VERTICAL_BORDER
const OUTLINE_ROW_GAP = 2
const OUTLINE_USER_QUERY_TOP_GAP = 2
const OUTLINE_USER_QUERY_BOTTOM_GAP = 2
const OUTLINE_VIRTUAL_OVERSCAN = 10
const OUTLINE_FALLBACK_VIEWPORT_HEIGHT = 420
const OUTLINE_HEIGHT_DRIFT_TOLERANCE = 1

export interface VisibleOutlineItem {
  node: OutlineNode
  depth: number
}

export interface OutlineVirtualMetrics {
  rowOffsets: number[]
  rowHeights: number[]
  totalHeight: number
  itemIndexByNodeIndex: Map<number, number>
}

export const flattenVisibleOutlineTree = (
  tree: OutlineNode[],
  visibleMap: Record<number, boolean>,
): VisibleOutlineItem[] => {
  const items: VisibleOutlineItem[] = []

  const traverse = (nodes: OutlineNode[], depth: number) => {
    for (const node of nodes) {
      if (!(visibleMap[node.index] ?? true)) continue

      items.push({ node, depth })

      if (node.children.length > 0) {
        traverse(node.children, depth + 1)
      }
    }
  }

  traverse(tree, 0)
  return items
}

const getOutlineVirtualRowSpacing = (item: VisibleOutlineItem, rowIndex: number) => {
  if (item.node.isUserQuery) {
    return {
      top: rowIndex === 0 ? 0 : OUTLINE_USER_QUERY_TOP_GAP,
      bottom: OUTLINE_USER_QUERY_BOTTOM_GAP,
    }
  }

  return { top: 0, bottom: OUTLINE_ROW_GAP }
}

export const buildOutlineVirtualMetrics = (items: VisibleOutlineItem[]): OutlineVirtualMetrics => {
  const rowOffsets: number[] = []
  const rowHeights: number[] = []
  const itemIndexByNodeIndex = new Map<number, number>()
  let totalHeight = 0

  items.forEach((item, index) => {
    const spacing = getOutlineVirtualRowSpacing(item, index)
    const rowHeight = OUTLINE_ITEM_HEIGHT + spacing.top + spacing.bottom

    rowOffsets.push(totalHeight)
    rowHeights.push(rowHeight)
    itemIndexByNodeIndex.set(item.node.index, index)
    totalHeight += rowHeight
  })

  return {
    rowOffsets,
    rowHeights,
    totalHeight,
    itemIndexByNodeIndex,
  }
}

const findOutlineRowAtOffset = (rowOffsets: number[], offset: number): number => {
  if (rowOffsets.length === 0) return 0

  let low = 0
  let high = rowOffsets.length - 1
  let result = 0

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (rowOffsets[mid] <= offset) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return result
}

export const getOutlineVirtualRange = (
  metrics: OutlineVirtualMetrics,
  scrollTop: number,
  viewportHeight: number,
) => {
  const itemCount = metrics.rowOffsets.length
  if (itemCount === 0) return { start: 0, end: 0 }

  const effectiveViewportHeight = Math.max(viewportHeight, OUTLINE_FALLBACK_VIEWPORT_HEIGHT)
  const startIndex = findOutlineRowAtOffset(metrics.rowOffsets, Math.max(0, scrollTop))
  const viewportBottom = scrollTop + effectiveViewportHeight
  let endIndex = startIndex

  while (endIndex < itemCount && metrics.rowOffsets[endIndex] < viewportBottom) {
    endIndex += 1
  }

  return {
    start: Math.max(0, startIndex - OUTLINE_VIRTUAL_OVERSCAN),
    end: Math.min(itemCount, endIndex + OUTLINE_VIRTUAL_OVERSCAN),
  }
}

const isOutlineVirtualHeightDebugEnabled = (): boolean => {
  if (typeof document !== "undefined") {
    const value = document.documentElement.dataset.ophelDebugOutlineVirtualHeights
    if (value === "true" || value === "1") return true
  }

  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage?.getItem("ophel.debugOutlineVirtualHeights") === "1"
    )
  } catch {
    return false
  }
}

// 单行大纲节点视图。树形可见性由上层 flattenVisibleOutlineTree 统一处理。
const OutlineNodeView: React.FC<{
  node: OutlineNode
  onToggle: (node: OutlineNode) => void
  onClick: (node: OutlineNode) => void
  onToggleBookmark: (e: React.MouseEvent, node: OutlineNode) => void
  setItemRef: (index: number, el: HTMLElement | null) => void
  searchQuery: string
  extractUserQueryText?: (element: Element) => string // Used for full text extraction
}> = ({
  node,
  onToggle,
  onClick,
  onToggleBookmark,
  setItemRef,
  searchQuery,
  extractUserQueryText,
}) => {
  const hasChildren = node.children && node.children.length > 0
  // Legacy: isExpanded 直接看 hasChildren 和 collapsed，不考虑搜索
  // 箭头始终显示（只要有子节点），因为用户可能想手动展开查看不匹配的子节点
  const isExpanded = hasChildren && !node.collapsed

  // ===== 复制处理 (阻止冒泡) =====
  const [copySuccess, setCopySuccess] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    // 智能获取文本
    let textToCopy = node.text

    // 尝试从 DOM 获取完整文本
    if (node.element && node.element.isConnected) {
      if (node.isUserQuery && extractUserQueryText) {
        // 用户提问：使用专门提取逻辑 (处理 <br> 等)
        const fullText = extractUserQueryText(node.element)
        if (fullText) textToCopy = fullText
      } else {
        // 普通标题：直接取 textContent
        const fullText = node.element.textContent
        if (fullText) textToCopy = fullText.trim()
      }
    }

    try {
      // 优先使用 Clipboard API
      await navigator.clipboard.writeText(textToCopy)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 1500)
    } catch (err) {
      console.error("[DEBUG] Clipboard API failed, trying fallback:", err)
      // 备用方案：使用 execCommand
      try {
        const textArea = document.createElement("textarea")
        textArea.value = textToCopy
        textArea.style.position = "fixed"
        textArea.style.left = "-9999px"
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand("copy")
        document.body.removeChild(textArea)
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 1500)
      } catch (fallbackErr) {
        console.error("[DEBUG] Fallback copy also failed:", fallbackErr)
      }
    }
  }

  // ===== 状态控制：鼠标悬停在操作按钮时不显示主 Tooltip =====
  const [isHoveringAction, setIsHoveringAction] = useState(false)

  // ===== CSS 类名 (Legacy exact) =====
  const itemClassName = [
    "outline-item",
    `outline-level-${node.relativeLevel}`,
    node.isUserQuery ? "user-query-node" : "",
    node.isGhost ? "ghost-node" : "", // Add ghost styling class
  ]
    .filter(Boolean)
    .join(" ")

  // ===== 搜索高亮处理 (Legacy: regex split) =====
  const renderTextWithHighlight = () => {
    if (searchQuery && node.isMatch) {
      try {
        const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const regex = new RegExp(`(${escapedQuery})`, "gi")
        const parts = node.text.split(regex)
        return (
          <>
            {parts.map((part, i) =>
              part.toLowerCase() === searchQuery.toLowerCase() ? (
                <mark
                  key={i}
                  style={{
                    backgroundColor: "var(--gh-search-highlight-bg)",
                    color: "inherit",
                    padding: 0,
                    borderRadius: "2px",
                  }}>
                  {part}
                </mark>
              ) : (
                part
              ),
            )}
          </>
        )
      } catch {
        return node.text
      }
    }
    return node.text
  }

  return (
    <Tooltip
      content={
        node.wordCount && node.wordCount > 0 ? (
          <div>
            {node.text}
            <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "2px" }}>
              ({formatWordCount(node.wordCount, getCurrentLang())} {t("words")})
            </div>
          </div>
        ) : (
          node.text
        )
      }
      disabled={isHoveringAction}
      triggerStyle={{ width: "100%", display: "block" }}
      delay={500}>
      <div
        className={itemClassName}
        data-index={node.index}
        data-level={node.relativeLevel}
        ref={(el) => setItemRef(node.index, el)}
        onClick={() => onClick(node)}>
        {/* 折叠箭头 (Legacy: ▸) - 使用 hasChildren 显示箭头，允许手动展开 */}
        <span
          className={`outline-item-toggle ${hasChildren ? (isExpanded ? "expanded" : "") : "invisible"}`}
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation()
              onToggle(node)
            }
          }}>
          <ChevronDownIcon size={16} style={{ transform: "rotate(-90deg)" }} />
        </span>

        {/* 用户提问: 徽章 (图标+角标数字) */}
        {node.isUserQuery && (
          <span className="user-query-badge">
            <span className="user-query-badge-icon">💬</span>
            <span className="user-query-badge-number">{node.queryIndex}</span>
          </span>
        )}

        {/* 文字 (带搜索高亮) */}
        <span className={`outline-item-text ${node.isGhost ? "ghost-text" : ""}`}>
          {renderTextWithHighlight()}
        </span>

        {/* Bookmark Button (Hover or Bookmarked) */}
        <span className={`outline-item-bookmark-wrapper ${node.isBookmarked ? "active" : ""}`}>
          <Tooltip content={node.isBookmarked ? t("removeBookmark") : t("addBookmark")}>
            <span
              className={`outline-item-bookmark-btn ${node.isBookmarked ? "active" : ""}`}
              onClick={(e) => onToggleBookmark(e, node)}
              onMouseEnter={() => setIsHoveringAction(true)}
              onMouseLeave={() => setIsHoveringAction(false)}>
              <StarIcon
                size={14}
                filled={node.isBookmarked}
                color={node.isBookmarked ? "#f59e0b" : "currentColor"}
              />
            </span>
          </Tooltip>
        </span>

        {/* 复制按钮 (所有节点显示) */}
        <Tooltip content={t("copy")}>
          <span
            className="outline-item-copy-btn"
            onClick={handleCopy}
            onMouseEnter={() => setIsHoveringAction(true)}
            onMouseLeave={() => setIsHoveringAction(false)}>
            {copySuccess ? (
              // 成功对号图标
              <CheckIcon size={14} color="#10b981" />
            ) : (
              // 复制图标
              <CopyIcon size={14} />
            )}
          </span>
        </Tooltip>
      </div>
    </Tooltip>
  )
}

export const VirtualizedOutlineTree: React.FC<{
  items: VisibleOutlineItem[]
  metrics: OutlineVirtualMetrics
  scrollTop: number
  viewportHeight: number
  onToggle: (node: OutlineNode) => void
  onClick: (node: OutlineNode) => void
  onToggleBookmark: (e: React.MouseEvent, node: OutlineNode) => void
  setItemRef: (index: number, el: HTMLElement | null) => void
  searchQuery: string
  extractUserQueryText?: (element: Element) => string
}> = ({
  items,
  metrics,
  scrollTop,
  viewportHeight,
  onToggle,
  onClick,
  onToggleBookmark,
  setItemRef,
  searchQuery,
  extractUserQueryText,
}) => {
  const virtualListRef = useRef<HTMLDivElement>(null)
  const warnedHeightDriftKeysRef = useRef<Set<string>>(new Set())
  const range = getOutlineVirtualRange(metrics, scrollTop, viewportHeight)
  const renderedItems = items.slice(range.start, range.end)
  const virtualListStyle = {
    "--gh-outline-item-height": `${OUTLINE_ITEM_HEIGHT}px`,
    height: metrics.totalHeight,
    position: "relative",
  } as React.CSSProperties

  useEffect(() => {
    if (!isOutlineVirtualHeightDebugEnabled()) return

    const root = virtualListRef.current
    if (!root) return

    const frame = window.requestAnimationFrame(() => {
      root.querySelectorAll<HTMLElement>(".outline-virtual-row").forEach((row) => {
        const item = row.querySelector<HTMLElement>(".outline-item")
        if (!item) return

        const nodeIndex = item.dataset.index || "unknown"
        const itemHeight = item.getBoundingClientRect().height
        const rowHeight = row.getBoundingClientRect().height
        const expectedRowHeight = Number(row.dataset.expectedRowHeight || OUTLINE_ITEM_HEIGHT)
        const itemOverflow = item.scrollHeight - item.clientHeight
        const itemDrift = Math.abs(itemHeight - OUTLINE_ITEM_HEIGHT)
        const rowDrift = Math.abs(rowHeight - expectedRowHeight)

        if (
          itemDrift <= OUTLINE_HEIGHT_DRIFT_TOLERANCE &&
          rowDrift <= OUTLINE_HEIGHT_DRIFT_TOLERANCE &&
          itemOverflow <= OUTLINE_HEIGHT_DRIFT_TOLERANCE
        ) {
          return
        }

        const warningKey = [
          nodeIndex,
          itemHeight.toFixed(2),
          rowHeight.toFixed(2),
          expectedRowHeight,
          itemOverflow,
        ].join(":")
        if (warnedHeightDriftKeysRef.current.has(warningKey)) return
        warnedHeightDriftKeysRef.current.add(warningKey)

        console.warn("[OutlineTab] Virtual outline row height drift", {
          nodeIndex,
          nodeKind: row.dataset.nodeKind,
          itemHeight,
          expectedItemHeight: OUTLINE_ITEM_HEIGHT,
          rowHeight,
          expectedRowHeight,
          itemOverflow,
        })
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [range.start, range.end, metrics.totalHeight])

  return (
    <div
      ref={virtualListRef}
      className="outline-list outline-list-virtual"
      style={virtualListStyle}>
      {renderedItems.map((item, offset) => {
        const rowIndex = range.start + offset
        const spacing = getOutlineVirtualRowSpacing(item, rowIndex)

        return (
          <div
            key={item.node.index}
            className="outline-virtual-row"
            data-depth={item.depth}
            data-node-kind={item.node.isUserQuery ? "user-query" : "heading"}
            data-expected-row-height={metrics.rowHeights[rowIndex]}
            style={{
              position: "absolute",
              top: metrics.rowOffsets[rowIndex],
              left: 0,
              right: 0,
              height: metrics.rowHeights[rowIndex],
              paddingTop: spacing.top,
              paddingBottom: spacing.bottom,
              boxSizing: "border-box",
            }}>
            <OutlineNodeView
              node={item.node}
              onToggle={onToggle}
              onClick={onClick}
              onToggleBookmark={onToggleBookmark}
              setItemRef={setItemRef}
              searchQuery={searchQuery}
              extractUserQueryText={extractUserQueryText}
            />
          </div>
        )
      })}
    </div>
  )
}
