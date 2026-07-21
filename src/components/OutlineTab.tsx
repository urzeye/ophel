import { MagicCodex } from "~components/MagicCodex"
import { isMacOS } from "~constants/shortcuts"
import { buildStructuredTips } from "~utils/build-structured-tips"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  CheckIcon,
  ChevronDownIcon,
  ClearIcon,
  CollapseAllIcon,
  CopyIcon,
  CopyOutlineIcon,
  ExpandAllIcon,
  LocateIcon,
  OutlineDocumentIcon,
  ScrollBottomIcon,
  ScrollTopIcon,
  SearchIcon,
  StarIcon,
  UserQueryIcon,
} from "~components/icons"
import { Tooltip } from "~components/ui/Tooltip"
import type { ConversationManager } from "~core/conversation-manager"
import { signalReadingHistoryUserNavigation } from "~utils/reading-history-navigation"
import type { OutlineManager, OutlineNode } from "~core/outline-manager"
import type { OutlineSource } from "~adapters/base"
import { useSettingsStore } from "~stores/settings-store"
import {
  createOutlineTextFromExportMessages,
  createOutlineTextFromOutlineTree,
} from "~utils/export-outline"
import { t, getCurrentLang } from "~utils/i18n"
import { formatWordCount } from "~utils/format"
import { showToast } from "~utils/toast"

interface OutlineTabProps {
  manager: OutlineManager
  conversationManager: ConversationManager
  onJumpBefore?: () => void
  isCodexOpen?: boolean
}

const countOutlineNodes = (nodes: OutlineNode[]): number => {
  let count = 0
  for (const node of nodes) {
    count += 1
    if (node.children.length > 0) {
      count += countOutlineNodes(node.children)
    }
  }
  return count
}

const getOutlineSourceLabel = (source: OutlineSource): string => {
  if (source.kind === "conversation") {
    return t("outlineSourceConversation")
  }
  if (source.kind === "document") {
    return t("outlineSourceDocument")
  }
  return source.label
}

const writeClipboardText = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textArea = document.createElement("textarea")
  textArea.value = text
  textArea.style.position = "fixed"
  textArea.style.left = "-9999px"
  textArea.style.top = "0"
  document.body.appendChild(textArea)
  textArea.select()

  try {
    const copied = document.execCommand("copy")
    if (!copied) {
      throw new Error("execCommand copy returned false")
    }
  } finally {
    textArea.remove()
  }
}

const buildVisibilityMaps = (
  tree: OutlineNode[],
  displayLevel: number,
  minRelativeLevel: number,
  searchQuery: string,
  searchLevelManual: boolean,
  bookmarkMode: boolean,
) => {
  const parentMap: Record<number, number | null> = {}
  const parentNodeMap = new WeakMap<OutlineNode, OutlineNode | null>()
  const visibleNodeSet = new WeakSet<OutlineNode>()
  const visibleMap: Record<number, boolean> = {}
  const bookmarkMemo = new Map<number, boolean>()

  const hasBookmarkInSubtree = (node: OutlineNode): boolean => {
    const cached = bookmarkMemo.get(node.index)
    if (cached !== undefined) return cached
    let has = !!node.isBookmarked
    if (!has && node.children && node.children.length > 0) {
      for (const child of node.children) {
        if (hasBookmarkInSubtree(child)) {
          has = true
          break
        }
      }
    }
    bookmarkMemo.set(node.index, has)
    return has
  }

  const hasBookmarkInDescendants = (node: OutlineNode): boolean => {
    if (!node.children || node.children.length === 0) return false
    return node.children.some(hasBookmarkInSubtree)
  }

  const traverse = (
    node: OutlineNode,
    parentIndex: number | null,
    parentNode: OutlineNode | null,
    parentCollapsed: boolean,
    parentForceExpanded: boolean,
    ancestorHasBookmark: boolean,
  ) => {
    parentMap[node.index] = parentIndex
    parentNodeMap.set(node, parentNode)

    const nodeHasBookmark = hasBookmarkInSubtree(node)
    const isBookmarkRelevant = nodeHasBookmark || ancestorHasBookmark

    let shouldShow: boolean
    if (bookmarkMode) {
      if (isBookmarkRelevant) {
        const isSearchMatch = !searchQuery || node.isMatch || node.hasMatchedDescendant
        shouldShow = !parentCollapsed && isSearchMatch
      } else {
        shouldShow = false
      }
    } else {
      const isRootNode = node.relativeLevel === minRelativeLevel
      const isLevelAllowed = node.relativeLevel <= displayLevel || parentForceExpanded

      if (isRootNode) {
        if (searchQuery) {
          shouldShow = node.isMatch || node.hasMatchedDescendant
        } else {
          shouldShow = true
        }
      } else {
        const isRelevant =
          !searchQuery || node.isMatch || node.hasMatchedDescendant || parentForceExpanded

        if (searchQuery && !searchLevelManual) {
          shouldShow = isRelevant && !parentCollapsed
        } else if (searchQuery && searchLevelManual) {
          shouldShow = isRelevant && isLevelAllowed && !parentCollapsed
        } else {
          shouldShow = isLevelAllowed && !parentCollapsed
        }
      }

      if (parentCollapsed) {
        shouldShow = false
      }
    }

    if (node.forceVisible) {
      shouldShow = true
    }

    visibleMap[node.index] = shouldShow
    if (shouldShow) {
      visibleNodeSet.add(node)
    }

    const childParentCollapsed = node.collapsed || parentCollapsed
    const childParentForceExpanded = node.forceExpanded || parentForceExpanded
    const childAncestorHasBookmark =
      ancestorHasBookmark || (node.isBookmarked && !hasBookmarkInDescendants(node))

    if (node.children && node.children.length > 0) {
      node.children.forEach((child) => {
        traverse(
          child,
          node.index,
          node,
          childParentCollapsed,
          childParentForceExpanded,
          childAncestorHasBookmark,
        )
      })
    }
  }

  tree.forEach((root) => traverse(root, null, null, false, false, false))

  return { parentMap, parentNodeMap, visibleMap, visibleNodeSet }
}

const getConversationCopyHeadingLevel = (expandLevel: number, showUserQueries: boolean): number => {
  // When user queries are hidden and expandLevel is 0, we should still copy all visible headings
  // because the panel shows AI response headings even when expandLevel is 0
  if (!showUserQueries && expandLevel === 0) {
    return 6 // Copy all heading levels (H1-H6)
  }
  return showUserQueries ? expandLevel : Math.max(1, expandLevel)
}

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
const OUTLINE_LOCATE_HIGHLIGHT_MS = 3000
const OUTLINE_LOCATE_RETRY_DELAY_MS = 50
const OUTLINE_LOCATE_MAX_RETRIES = Math.ceil(
  OUTLINE_LOCATE_HIGHLIGHT_MS / OUTLINE_LOCATE_RETRY_DELAY_MS,
)

type OutlineScrollBlock = "start" | "center" | "end" | "nearest"

type OutlineScrollSnapshot = {
  scrollTop: number
  viewportHeight: number
  scrollState: "top" | "bottom"
  rangeStart: number
  rangeEnd: number
}

interface VisibleOutlineItem {
  node: OutlineNode
  depth: number
}

interface OutlineVirtualMetrics {
  rowOffsets: number[]
  rowHeights: number[]
  totalHeight: number
  itemIndexByNodeIndex: Map<number, number>
}

const flattenVisibleOutlineTree = (
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

const buildOutlineVirtualMetrics = (items: VisibleOutlineItem[]): OutlineVirtualMetrics => {
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

const getOutlineVirtualRange = (
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

const VirtualizedOutlineTree: React.FC<{
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

export const OutlineTab: React.FC<OutlineTabProps> = ({
  manager,
  conversationManager,
  onJumpBefore,
  isCodexOpen = false,
}) => {
  // 获取设置 - 使用 Zustand Store
  const { settings } = useSettingsStore()
  const currentSettings = settings
  const isMac = React.useMemo(() => isMacOS(), [])
  const shortcutNotSetLabel = t("shortcutNotSet")

  const structuredTips = React.useMemo(
    () => buildStructuredTips(currentSettings.shortcuts?.keybindings, isMac, shortcutNotSetLabel),
    [currentSettings.shortcuts?.keybindings, currentSettings.language, isMac, shortcutNotSetLabel],
  )

  // Initialize state from manager to prevent flicker
  const initialState = manager.getState()

  const [tree, setTree] = useState<OutlineNode[]>(initialState.tree)
  const [searchQuery, setSearchQuery] = useState(manager.getSearchQuery())
  const [isAllExpanded, setIsAllExpanded] = useState(initialState.isAllExpanded)
  const [showUserQueries, setShowUserQueries] = useState(initialState.includeUserQueries)
  const [scrollState, setScrollState] = useState<"top" | "bottom">("bottom")
  const [expandLevel, setExpandLevel] = useState(initialState.expandLevel ?? 6)
  const [levelCounts, setLevelCounts] = useState<Record<number, number>>(initialState.levelCounts)
  // New state for legacy parity
  const [displayLevel, setDisplayLevel] = useState(initialState.displayLevel)
  const [minRelativeLevel, setMinRelativeLevel] = useState(initialState.minRelativeLevel)
  const [searchLevelManual, setSearchLevelManual] = useState(initialState.searchLevelManual)
  const [matchCount, setMatchCount] = useState(initialState.matchCount)
  const [bookmarkMode, setBookmarkMode] = useState(initialState.bookmarkMode)
  const [outlineSources, setOutlineSources] = useState<OutlineSource[]>(initialState.sources)
  const [activeSourceId, setActiveSourceId] = useState(initialState.activeSourceId)
  const [isCopyingFullOutline, setIsCopyingFullOutline] = useState(false)
  const [fullOutlineCopySuccess, setFullOutlineCopySuccess] = useState(false)
  const [outlineScrollTop, setOutlineScrollTop] = useState(0)
  const [outlineViewportHeight, setOutlineViewportHeight] = useState(0)

  // const { bookmarks } = useBookmarkStore() // Removed unused bookmarks

  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const prevTreeLengthRef = useRef<number>(0) // 用 ref 追踪上一次树长度
  const shouldScrollToBottomRef = useRef<boolean>(false) // 标记是否需要滚动
  const activeIndexRef = useRef<number | null>(null)
  const activeNodeRef = useRef<OutlineNode | null>(null)
  const visibleHighlightRef = useRef<number | null>(null)
  const itemRefMap = useRef<Map<number, HTMLElement>>(new Map())
  const virtualMetricsRef = useRef<OutlineVirtualMetrics>({
    rowOffsets: [],
    rowHeights: [],
    totalHeight: 0,
    itemIndexByNodeIndex: new Map(),
  })
  const jumpRequestIdRef = useRef(0)
  const locateHighlightRef = useRef<{
    element: Element
    timer: ReturnType<typeof setTimeout>
  } | null>(null)
  const pendingLocateHighlightRef = useRef<{
    index: number
    requestId: number
  } | null>(null)
  const locateHighlightRequestIdRef = useRef(0)
  const userScrollingOutlineRef = useRef(false)
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const outlineScrollFrameRef = useRef<number | null>(null)
  const outlineScrollSnapshotRef = useRef<OutlineScrollSnapshot>({
    scrollTop: 0,
    viewportHeight: 0,
    scrollState: "bottom",
    rangeStart: 0,
    rangeEnd: 0,
  })
  const visibilityMapsRef = useRef<{
    parentMap: Record<number, number | null>
    parentNodeMap: WeakMap<OutlineNode, OutlineNode | null>
    visibleMap: Record<number, boolean>
    visibleNodeSet: WeakSet<OutlineNode>
    hasData: boolean
  }>({
    parentMap: {},
    parentNodeMap: new WeakMap<OutlineNode, OutlineNode | null>(),
    visibleMap: {},
    visibleNodeSet: new WeakSet<OutlineNode>(),
    hasData: false,
  })

  // Tab 激活状态管理：挂载时激活，卸载时取消
  useEffect(() => {
    manager.setActive(true)
    return () => {
      manager.setActive(false)
    }
  }, [manager])

  // 监听并执行搜索聚焦
  useEffect(() => {
    const handleSearchOutline = () => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.select()
      }
    }

    window.addEventListener("ophel:searchOutline", handleSearchOutline)

    // 检查是否有待处理的搜索请求
    if (window.__ophelPendingSearchOutline) {
      delete window.__ophelPendingSearchOutline
      // 延迟确保渲染完成
      setTimeout(handleSearchOutline, 100)
    }

    return () => {
      window.removeEventListener("ophel:searchOutline", handleSearchOutline)
    }
  }, [])

  // 订阅 Manager 更新
  useEffect(() => {
    const update = () => {
      // 智能滚动：检测用户是否已在底部附近（更新前）
      /*
      let wasAtBottom = false
      if (listRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = listRef.current
        wasAtBottom = scrollTop + clientHeight >= scrollHeight - 50 // 50px 容差
      }
      */

      const state = manager.getState()

      const newTotalNodes = countOutlineNodes(state.tree)
      const prevTotalNodes = prevTreeLengthRef.current

      // 根据 followMode 决定是否自动滚动
      // followMode === 'latest'：自动滚动到最新消息
      // followMode === 'current' 或 'manual'：不自动滚动
      const followMode = settings?.features?.outline?.followMode || "current"

      if (followMode === "latest" && newTotalNodes > prevTotalNodes) {
        // 跟随最新消息模式：有新节点就滚动
        shouldScrollToBottomRef.current = true
      }

      setTree([...state.tree])
      setSearchQuery(manager.getSearchQuery())

      setIsAllExpanded(state.isAllExpanded)
      setExpandLevel(state.expandLevel ?? 6)
      setLevelCounts(state.levelCounts || {})
      setShowUserQueries(state.includeUserQueries)
      // New state sync
      setDisplayLevel(state.displayLevel)
      setMinRelativeLevel(state.minRelativeLevel)
      setSearchLevelManual(state.searchLevelManual)
      setMatchCount(state.matchCount)
      setBookmarkMode(state.bookmarkMode)
      setOutlineSources(state.sources)
      setActiveSourceId(state.activeSourceId)

      // 更新 ref 以供下次比较（现在是总节点数）
      prevTreeLengthRef.current = newTotalNodes
    }
    update() // 初始加载
    return manager.subscribe(update)
  }, [manager, settings?.features?.outline?.followMode]) // 添加 followMode 依赖

  // 智能滚动：在 tree 渲染完成后执行滚动
  useEffect(() => {
    if (shouldScrollToBottomRef.current && listRef.current) {
      const listEl = listRef.current
      // 使用 requestAnimationFrame 确保 DOM 完全渲染
      requestAnimationFrame(() => {
        listEl.scrollTo({ top: listEl.scrollHeight, behavior: "smooth" })
      })
      shouldScrollToBottomRef.current = false
    }
  }, [tree]) // 依赖 tree，当 tree 变化（渲染完成）后执行

  const syncOutlineScrollState = useCallback((force = false) => {
    const el = listRef.current
    if (!el) return

    const scrollTop = el.scrollTop
    const viewportHeight = el.clientHeight
    const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 10
    const nextScrollState = isAtBottom ? "top" : "bottom"
    const nextRange = getOutlineVirtualRange(virtualMetricsRef.current, scrollTop, viewportHeight)
    const previous = outlineScrollSnapshotRef.current
    const rangeChanged =
      nextRange.start !== previous.rangeStart || nextRange.end !== previous.rangeEnd
    const viewportChanged = viewportHeight !== previous.viewportHeight
    const scrollStateChanged = nextScrollState !== previous.scrollState

    outlineScrollSnapshotRef.current = {
      scrollTop,
      viewportHeight,
      scrollState: nextScrollState,
      rangeStart: nextRange.start,
      rangeEnd: nextRange.end,
    }

    if (force || scrollStateChanged) {
      setScrollState(nextScrollState)
    }
    if (force || rangeChanged || viewportChanged) {
      setOutlineScrollTop(scrollTop)
      setOutlineViewportHeight(viewportHeight)
    }
  }, [])

  const scheduleOutlineScrollStateSync = useCallback(() => {
    if (outlineScrollFrameRef.current !== null) return

    outlineScrollFrameRef.current = requestAnimationFrame(() => {
      outlineScrollFrameRef.current = null
      syncOutlineScrollState()
    })
  }, [syncOutlineScrollState])

  const scrollOutlineNodeIntoView = useCallback(
    (
      nodeIndex: number,
      block: OutlineScrollBlock = "nearest",
      behavior: ScrollBehavior = "instant" as ScrollBehavior,
    ): boolean => {
      const el = listRef.current
      const metrics = virtualMetricsRef.current
      const rowIndex = metrics.itemIndexByNodeIndex.get(nodeIndex)

      if (!el || rowIndex === undefined) return false

      const rowTop = metrics.rowOffsets[rowIndex]
      const rowBottom = rowTop + metrics.rowHeights[rowIndex]
      const viewportTop = el.scrollTop
      const viewportBottom = viewportTop + el.clientHeight
      let nextTop = viewportTop

      if (block === "start") {
        nextTop = rowTop
      } else if (block === "center") {
        nextTop = rowTop - (el.clientHeight - metrics.rowHeights[rowIndex]) / 2
      } else if (block === "end") {
        nextTop = rowBottom - el.clientHeight
      } else if (rowTop < viewportTop) {
        nextTop = rowTop
      } else if (rowBottom > viewportBottom) {
        nextTop = rowBottom - el.clientHeight
      } else {
        syncOutlineScrollState(true)
        return true
      }

      const maxTop = Math.max(0, el.scrollHeight - el.clientHeight)
      const clampedTop = Math.max(0, Math.min(nextTop, maxTop))

      if (Math.abs(clampedTop - el.scrollTop) > 1) {
        el.scrollTo({ top: clampedTop, behavior })
        syncOutlineScrollState(true)
      }

      return true
    },
    [syncOutlineScrollState],
  )

  const removeOutlineItemClasses = useCallback((...classNames: string[]) => {
    if (classNames.length === 0) return

    const removeClasses = (item: Element) => {
      item.classList.remove(...classNames)
    }

    itemRefMap.current.forEach(removeClasses)
    const selector = classNames.map((className) => `.outline-item.${className}`).join(", ")
    listRef.current?.querySelectorAll(selector).forEach(removeClasses)
  }, [])

  const removeOutlineItemClass = useCallback(
    (className: string) => {
      removeOutlineItemClasses(className)
    },
    [removeOutlineItemClasses],
  )

  const applySingleSyncHighlight = useCallback((idx: number | null) => {
    const target = idx !== null ? itemRefMap.current.get(idx) || null : null
    itemRefMap.current.forEach((item) => {
      if (item !== target) item.classList.remove("sync-highlight", "sync-highlight-visible")
    })
    listRef.current
      ?.querySelectorAll(".outline-item.sync-highlight, .outline-item.sync-highlight-visible")
      .forEach((item) => {
        if (item !== target) item.classList.remove("sync-highlight", "sync-highlight-visible")
      })

    if (target) {
      target.classList.remove("sync-highlight-visible")
      target.classList.add("sync-highlight")
    }
  }, [])

  // 滚动同步高亮：直接操作 DOM class，不触发 React re-render
  const updateActiveIndex = useCallback((idx: number | null, node: OutlineNode | null = null) => {
    activeIndexRef.current = idx
    activeNodeRef.current = node
  }, [])

  const updateVisibleHighlightIndex = useCallback(
    (idx: number | null) => {
      applySingleSyncHighlight(idx)
      visibleHighlightRef.current = idx
    },
    [applySingleSyncHighlight],
  )

  const applyPendingLocateHighlight = useCallback(
    (index: number): boolean => {
      const pending = pendingLocateHighlightRef.current
      if (!pending || pending.index !== index || locateHighlightRef.current) {
        return false
      }

      const outlineItem = itemRefMap.current.get(index)
      if (!outlineItem) return false

      outlineItem.classList.add("highlight")
      const requestId = pending.requestId
      const timer = setTimeout(() => {
        outlineItem.classList.remove("highlight")
        if (pendingLocateHighlightRef.current?.requestId === requestId) {
          pendingLocateHighlightRef.current = null
        }
        manager.clearForceVisible()
        locateHighlightRef.current = null
      }, OUTLINE_LOCATE_HIGHLIGHT_MS)

      locateHighlightRef.current = { element: outlineItem, timer }
      return true
    },
    [manager],
  )

  const setItemRef = useCallback(
    (index: number, el: HTMLElement | null) => {
      const map = itemRefMap.current
      if (el) {
        map.set(index, el)
        if (index !== visibleHighlightRef.current) {
          el.classList.remove("sync-highlight", "sync-highlight-visible")
        }
        // 树重建后 DOM 元素更新，重新应用当前高亮 class
        if (index === visibleHighlightRef.current) {
          applySingleSyncHighlight(index)
        }
        applyPendingLocateHighlight(index)
      } else {
        map.delete(index)
      }
    },
    [applyPendingLocateHighlight, applySingleSyncHighlight],
  )

  const clearLocateHighlight = useCallback(
    (options?: { clearForceVisible?: boolean }) => {
      locateHighlightRequestIdRef.current += 1
      pendingLocateHighlightRef.current = null

      const current = locateHighlightRef.current
      if (current) {
        clearTimeout(current.timer)
        locateHighlightRef.current = null
      }

      removeOutlineItemClass("highlight")

      if (options?.clearForceVisible) {
        manager.clearForceVisible()
      }
    },
    [manager, removeOutlineItemClass],
  )

  const getVisibleHighlightIndex = useCallback((idx: number | null): number | null => {
    if (idx === null) return null
    const { parentMap, visibleMap, hasData } = visibilityMapsRef.current
    if (!hasData) return idx
    let current: number | null | undefined = idx
    while (current !== null && current !== undefined) {
      if (visibleMap[current]) return current
      current = parentMap[current]
    }
    return null
  }, [])

  const getVisibleHeadingHighlightIndex = useCallback((node: OutlineNode | null): number | null => {
    if (!node) return null
    const { parentNodeMap, visibleNodeSet, hasData } = visibilityMapsRef.current
    if (!hasData) return node.index

    let current: OutlineNode | null | undefined = node
    while (current) {
      if (visibleNodeSet.has(current)) {
        return current.index
      }
      current = parentNodeMap.get(current)
    }

    return null
  }, [])

  const isCurrentVisibilityNode = useCallback((node: OutlineNode | null): boolean => {
    if (!node) return false
    const { parentNodeMap, hasData } = visibilityMapsRef.current
    return !hasData || parentNodeMap.has(node)
  }, [])

  const visibilityMaps = useMemo(
    () =>
      buildVisibilityMaps(
        tree,
        displayLevel,
        minRelativeLevel,
        searchQuery,
        searchLevelManual,
        bookmarkMode,
      ),
    [tree, displayLevel, minRelativeLevel, searchQuery, searchLevelManual, bookmarkMode],
  )

  const { parentMap, parentNodeMap, visibleMap, visibleNodeSet } = visibilityMaps
  const visibleItems = useMemo(
    () => flattenVisibleOutlineTree(tree, visibleMap),
    [tree, visibleMap],
  )
  const virtualMetrics = useMemo(() => buildOutlineVirtualMetrics(visibleItems), [visibleItems])
  const outlineSourceOptions = useMemo(
    () => outlineSources.filter((source) => source.available),
    [outlineSources],
  )

  const hasVisibleNodes = useMemo(() => {
    const checkVisible = (nodes: OutlineNode[]): boolean => {
      for (const node of nodes) {
        if (visibleMap[node.index]) {
          return true
        }
        if (node.children && node.children.length > 0 && checkVisible(node.children)) {
          return true
        }
      }
      return false
    }

    return checkVisible(tree)
  }, [tree, visibleMap])

  visibilityMapsRef.current = {
    parentMap,
    parentNodeMap,
    visibleMap,
    visibleNodeSet,
    hasData: tree.length > 0,
  }
  virtualMetricsRef.current = virtualMetrics

  useEffect(() => {
    const activeNode = activeNodeRef.current
    const nextVisible =
      activeNode && isCurrentVisibilityNode(activeNode)
        ? getVisibleHeadingHighlightIndex(activeNode)
        : getVisibleHighlightIndex(activeIndexRef.current)
    updateVisibleHighlightIndex(nextVisible)
  }, [
    parentMap,
    visibleMap,
    tree.length,
    isCurrentVisibilityNode,
    getVisibleHeadingHighlightIndex,
    getVisibleHighlightIndex,
    updateVisibleHighlightIndex,
  ])

  // Scroll sync highlight (data-driven)
  // Falls back to nearest visible ancestor when the target is hidden
  useEffect(() => {
    const followMode = settings?.features?.outline?.followMode || "current"
    if (followMode !== "current") {
      updateActiveIndex(null)
      updateVisibleHighlightIndex(null)
      return
    }

    let scrollContainer: HTMLElement | null = null
    let retryCount = 0
    let retryTimer: ReturnType<typeof setTimeout>
    let resizeObserver: ResizeObserver | null = null
    let scrollSyncFrame: number | null = null
    let outlineAutoScrollFrame: number | null = null
    const mutationObservers = new Map<Node, MutationObserver>()

    const handleResize = () => {
      manager.markScrollPositionsStale()
      handleScroll()
    }

    const observeRoot = (root: Node) => {
      if (mutationObservers.has(root)) return

      const observer = new MutationObserver(() => {
        manager.markScrollPositionsStale()
        handleScroll()
      })

      observer.observe(root, { childList: true, subtree: true })
      mutationObservers.set(root, observer)
    }

    const attachMutationObservers = (container: HTMLElement) => {
      try {
        observeRoot(container)
      } catch (e) {
        console.warn("[OutlineTab] Failed to attach MutationObserver:", e)
      }
    }

    const cancelOutlineAutoScroll = () => {
      if (outlineAutoScrollFrame !== null) {
        cancelAnimationFrame(outlineAutoScrollFrame)
        outlineAutoScrollFrame = null
      }
    }

    const scheduleOutlineAutoScroll = (visibleIdx: number) => {
      if (outlineAutoScrollFrame !== null) {
        cancelOutlineAutoScroll()
      }

      outlineAutoScrollFrame = requestAnimationFrame(() => {
        outlineAutoScrollFrame = null
        if (userScrollingOutlineRef.current) return
        const listContainer = listRef.current
        if (!listContainer) return

        const outlineItem = itemRefMap.current.get(visibleIdx) || null
        if (!outlineItem) {
          scrollOutlineNodeIntoView(visibleIdx, "center")
          return
        }

        const wrapperRect = listContainer.getBoundingClientRect()
        const itemRect = outlineItem.getBoundingClientRect()
        if (itemRect.top < wrapperRect.top || itemRect.bottom > wrapperRect.bottom) {
          scrollOutlineNodeIntoView(visibleIdx, "center")
        }
      })
    }

    const runScrollSync = () => {
      if (!scrollContainer) return

      const activeNode = manager.findMountedActiveNode(scrollContainer)
      const idx = activeNode?.index ?? null

      if (idx === null) {
        if (activeIndexRef.current !== null) {
          updateActiveIndex(null)
        }
        if (visibleHighlightRef.current !== null) {
          updateVisibleHighlightIndex(null)
        }
        cancelOutlineAutoScroll()
        return
      }

      if (idx !== activeIndexRef.current || activeNode !== activeNodeRef.current) {
        updateActiveIndex(idx, activeNode)
      }

      const visibleIdx = getVisibleHeadingHighlightIndex(activeNode)

      const previousVisibleIdx = visibleHighlightRef.current
      const visibleIdxChanged = visibleIdx !== previousVisibleIdx

      if (visibleIdxChanged) {
        updateVisibleHighlightIndex(visibleIdx)
      }

      if (visibleIdx === null) {
        cancelOutlineAutoScroll()
      } else if (visibleIdxChanged) {
        scheduleOutlineAutoScroll(visibleIdx)
      }
    }

    const handleScroll = () => {
      if (scrollSyncFrame !== null) return

      scrollSyncFrame = requestAnimationFrame(() => {
        scrollSyncFrame = null
        runScrollSync()
      })
    }

    const initListener = () => {
      const container = manager.getScrollContainer()
      if (container) {
        scrollContainer = container
        scrollContainer.addEventListener("scroll", handleScroll, { passive: true })
        window.addEventListener("resize", handleResize, { passive: true })
        attachMutationObservers(container)
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            manager.markScrollPositionsStale()
            handleScroll()
          })
          resizeObserver.observe(scrollContainer)
        }
        // Initial check
        runScrollSync()
      } else if (retryCount < 20) {
        retryCount++
        retryTimer = setTimeout(initListener, 300)
      } else {
        // Fallback to window only if desperate, but typically window scroll won't help if container is internal
        // But for safety let's leave valid container check
        console.warn("[OutlineTab] Failed to find scroll container after retries")
      }
    }

    initListener()

    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener("scroll", handleScroll)
      }
      window.removeEventListener("resize", handleResize)
      if (scrollSyncFrame !== null) {
        cancelAnimationFrame(scrollSyncFrame)
        scrollSyncFrame = null
      }
      if (outlineAutoScrollFrame !== null) {
        cancelOutlineAutoScroll()
      }
      mutationObservers.forEach((observer) => observer.disconnect())
      mutationObservers.clear()
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }
      if (retryTimer) {
        clearTimeout(retryTimer)
      }
    }
  }, [
    manager,
    tree.length,
    settings?.features?.outline?.followMode,
    getVisibleHeadingHighlightIndex,
    scrollOutlineNodeIntoView,
    updateActiveIndex,
    updateVisibleHighlightIndex,
  ])

  // 大纲列表滚动监听 (Dynamic Scroll Button state)
  useEffect(() => {
    const el = listRef.current
    if (!el) return

    el.addEventListener("scroll", scheduleOutlineScrollStateSync, { passive: true })

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleOutlineScrollStateSync)
      resizeObserver.observe(el)
    }

    // Initial check
    syncOutlineScrollState(true)

    return () => {
      el.removeEventListener("scroll", scheduleOutlineScrollStateSync)
      if (outlineScrollFrameRef.current !== null) {
        cancelAnimationFrame(outlineScrollFrameRef.current)
        outlineScrollFrameRef.current = null
      }
      resizeObserver?.disconnect()
    }
  }, [scheduleOutlineScrollStateSync, syncOutlineScrollState]) // listRef is stable after mount

  useEffect(() => {
    const el = listRef.current
    if (!el) return

    const maxTop = Math.max(0, el.scrollHeight - el.clientHeight)
    if (el.scrollTop > maxTop) {
      el.scrollTop = maxTop
    }
    syncOutlineScrollState(true)
  }, [syncOutlineScrollState, virtualMetrics.totalHeight])

  // 用户手动滚动大纲面板时，暂停自动定位（修复 Firefox 滚轮事件传播导致的回弹）
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const onWheel = () => {
      userScrollingOutlineRef.current = true
      if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current)
      userScrollTimerRef.current = setTimeout(() => {
        userScrollingOutlineRef.current = false
      }, 1500)
    }
    el.addEventListener("wheel", onWheel, { passive: true })
    return () => {
      el.removeEventListener("wheel", onWheel)
      if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current)
    }
  }, [])

  const handleToggle = useCallback(
    (node: OutlineNode) => {
      manager.toggleNode(node)
    },
    [manager],
  )

  const handleClick = useCallback(
    async (node: OutlineNode) => {
      signalReadingHistoryUserNavigation()
      const jumpRequestId = ++jumpRequestIdRef.current
      clearLocateHighlight({ clearForceVisible: true })
      updateVisibleHighlightIndex(getVisibleHighlightIndex(activeIndexRef.current))
      let targetElement = node.element
      let anchorCaptured = false

      // 元素失效时重新查找
      if (!targetElement || !targetElement.isConnected) {
        if (onJumpBefore) {
          await onJumpBefore()
          anchorCaptured = true
        }

        const found = await manager.resolveOutlineTarget(node, node.queryIndex)
        if (found) {
          targetElement = found as HTMLElement
          node.element = targetElement
        }
      }

      if (jumpRequestId !== jumpRequestIdRef.current) {
        return
      }

      if (targetElement && targetElement.isConnected) {
        // 等待锚点保存完成后再跳转（instant 模式必须）
        if (onJumpBefore && !anchorCaptured) {
          await onJumpBefore()
        }

        if (jumpRequestId !== jumpRequestIdRef.current) {
          return
        }

        // 通过 adapter 滚动——避免 scrollIntoView 在 Shadow DOM 场景下
        // 意外滚动外层容器（如 Gemini Enterprise 的 mat-sidenav-content）
        manager.scrollToOutlineTarget(targetElement as HTMLElement)
        updateActiveIndex(node.index, node)
        updateVisibleHighlightIndex(getVisibleHighlightIndex(node.index))

        // 高亮效果
        targetElement.classList.add("outline-highlight")
        setTimeout(() => targetElement?.classList.remove("outline-highlight"), 2000)
      } else if (
        node.isGhost &&
        node.scrollTop !== undefined &&
        manager.scrollToOutlinePosition(node.scrollTop)
      ) {
        // Ghost 节点（收藏对应内容不存在）：使用保存的 scrollTop 回退
        updateActiveIndex(node.index, node)
        updateVisibleHighlightIndex(getVisibleHighlightIndex(node.index))
        showToast(t("bookmarkContentMissing"), 3000)
      }
    },
    [
      clearLocateHighlight,
      getVisibleHighlightIndex,
      manager,
      onJumpBefore,
      updateActiveIndex,
      updateVisibleHighlightIndex,
    ],
  )

  const handleCopyFullOutline = useCallback(async () => {
    if (isCopyingFullOutline) return

    setIsCopyingFullOutline(true)
    try {
      let result: ReturnType<typeof createOutlineTextFromExportMessages>

      if (activeSourceId === "conversation") {
        const messages = await conversationManager.collectCurrentConversationExportMessages()
        if (!messages || messages.length === 0) {
          showToast(t("outlineEmpty"))
          return
        }

        result = createOutlineTextFromExportMessages(messages, {
          includeUserQueries: showUserQueries,
          maxHeadingLevel: getConversationCopyHeadingLevel(expandLevel, showUserQueries),
        })
      } else {
        result = createOutlineTextFromOutlineTree(tree, {
          includeUserQueries: showUserQueries,
          isIncluded: (node) => visibleMap[node.index ?? -1] ?? true,
        })
      }

      if (!result.text) {
        showToast(t("outlineEmpty"))
        return
      }

      await writeClipboardText(result.text)
      setFullOutlineCopySuccess(true)
      showToast(t("outlineFullCopySuccess").replace("{count}", String(result.count)))
      window.setTimeout(() => setFullOutlineCopySuccess(false), 1500)
    } catch (error) {
      console.error("[OutlineTab] Failed to copy outline:", error)
      showToast(t("copyFailed"))
    } finally {
      setIsCopyingFullOutline(false)
    }
  }, [
    activeSourceId,
    conversationManager,
    expandLevel,
    isCopyingFullOutline,
    showUserQueries,
    tree,
    visibleMap,
  ])

  // 用于提取完整用户提问文本（当显示被截断时）
  const extractUserQueryText = useCallback(
    (element: Element): string => manager.extractUserQueryText(element),
    [manager],
  )

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      manager.setSearchQuery(e.target.value)
    },
    [manager],
  )

  const handleSearchClear = useCallback(() => {
    manager.setSearchQuery("")
  }, [manager])

  const handleExpandAll = useCallback(() => {
    if (isAllExpanded) {
      manager.collapseAll()
    } else {
      manager.expandAll()
    }
  }, [manager, isAllExpanded])

  const handleToggleBookmark = useCallback(
    (e: React.MouseEvent, node: OutlineNode) => {
      e.stopPropagation()
      manager.toggleBookmark(node)
    },
    [manager],
  )

  const handleToggleBookmarkMode = useCallback(() => {
    manager.toggleBookmarkMode()
  }, [manager])

  const handleGroupModeToggle = useCallback(() => {
    manager.toggleGroupMode()
  }, [manager])

  const handleDynamicScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    if (scrollState === "bottom") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    } else {
      el.scrollTo({ top: 0, behavior: "smooth" })
    }
  }, [scrollState])

  // Legacy: locateCurrentPosition 完全复刻
  const handleLocateCurrent = useCallback(() => {
    const scrollContainer = manager.getScrollContainer()
    if (!scrollContainer) return

    // 0. 如果在搜索模式，先清除搜索
    if (searchQuery) {
      manager.setSearchQuery("")
      // 同步 UI 状态
      setSearchQuery("")
    }

    // 1. 收集所有大纲项（展平树结构）
    const flattenTree = (items: typeof tree): typeof tree => {
      const result: typeof tree = []
      items.forEach((item) => {
        result.push(item)
        if (item.children && item.children.length > 0) {
          result.push(...flattenTree(item.children))
        }
      })
      return result
    }
    const allItems = flattenTree(tree)

    // 2. 找到当前可视区域中的第一个大纲元素
    const containerRect = scrollContainer.getBoundingClientRect()
    const viewportTop = containerRect.top
    const viewportBottom = containerRect.bottom

    const mountedActiveIndex = manager.findMountedActiveItemIndex(scrollContainer)
    let currentItem =
      mountedActiveIndex !== null
        ? allItems.find((item) => item.index === mountedActiveIndex) || null
        : null

    if (!currentItem) {
      for (const item of allItems) {
        if (!item.element || !item.element.isConnected) continue

        const rect = item.element.getBoundingClientRect()
        if (rect.top >= viewportTop && rect.top < viewportBottom) {
          currentItem = item
          break
        }
        if (rect.top < viewportTop && rect.bottom > viewportTop) {
          currentItem = item
          break
        }
      }
    }

    if (!currentItem) {
      // 找最接近视口顶部的元素
      let minDistance = Infinity
      for (const item of allItems) {
        if (!item.element || !item.element.isConnected) continue
        const rect = item.element.getBoundingClientRect()
        const distance = Math.abs(rect.top - viewportTop)
        if (distance < minDistance) {
          minDistance = distance
          currentItem = item
        }
      }
    }

    if (!currentItem) return

    clearLocateHighlight({ clearForceVisible: true })

    // 3. 展开目标项的所有父级节点
    manager.revealNode(currentItem.index)
    const locateHighlightRequestId = ++locateHighlightRequestIdRef.current
    pendingLocateHighlightRef.current = {
      index: currentItem.index,
      requestId: locateHighlightRequestId,
    }

    // 4. 虚拟列表需要先滚动到目标行，等待该行挂载后再加高亮
    const tryScrollAndHighlight = (attempt: number) => {
      if (locateHighlightRequestId !== locateHighlightRequestIdRef.current) return

      scrollOutlineNodeIntoView(currentItem!.index, "center")

      requestAnimationFrame(() => {
        if (locateHighlightRequestId !== locateHighlightRequestIdRef.current) return

        if (applyPendingLocateHighlight(currentItem!.index)) return

        if (attempt < OUTLINE_LOCATE_MAX_RETRIES) {
          setTimeout(() => tryScrollAndHighlight(attempt + 1), OUTLINE_LOCATE_RETRY_DELAY_MS)
        } else if (pendingLocateHighlightRef.current?.requestId === locateHighlightRequestId) {
          pendingLocateHighlightRef.current = null
          manager.clearForceVisible()
        }
      })
    }

    setTimeout(() => tryScrollAndHighlight(0), OUTLINE_LOCATE_RETRY_DELAY_MS)
  }, [
    tree,
    searchQuery,
    manager,
    applyPendingLocateHighlight,
    clearLocateHighlight,
    scrollOutlineNodeIntoView,
  ])

  useEffect(
    () => () => {
      clearLocateHighlight({ clearForceVisible: true })
    },
    [clearLocateHighlight],
  )

  const handleLevelClick = useCallback(
    (level: number) => {
      manager.setLevel(level)
    },
    [manager],
  )

  // 监听快捷键触发的定位事件
  useEffect(() => {
    const handleLocateEvent = () => {
      // 清除全局标记
      window.__ophelPendingLocateOutline = false
      handleLocateCurrent()
    }

    // 检查挂载时是否有待处理的定位请求
    if (window.__ophelPendingLocateOutline) {
      // 延迟执行，确保组件完全渲染
      setTimeout(() => {
        handleLocateEvent()
      }, 100)
    }

    window.addEventListener("ophel:locateOutline", handleLocateEvent)
    return () => {
      window.removeEventListener("ophel:locateOutline", handleLocateEvent)
    }
  }, [handleLocateCurrent])

  return (
    <div
      className="gh-outline-tab"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}>
      {/* Fixed Toolbar */}
      <div className="outline-fixed-toolbar gh-panel-tool-stack">
        {/* Row 1: Buttons & Search */}
        <div className="gh-panel-toolbar">
          <div className="gh-panel-toolbar-group">
            {/* Group Mode */}
            <Tooltip content={t("outlineShowUserQueries")}>
              <button
                type="button"
                onClick={handleGroupModeToggle}
                aria-label={t("outlineShowUserQueries")}
                aria-pressed={showUserQueries}
                className={`outline-toolbar-btn ${showUserQueries ? "active-subtle" : ""}`}>
                <UserQueryIcon size={15} />
              </button>
            </Tooltip>

            {/* Bookmark Mode Toggle */}
            <Tooltip content={t("bookmarkMode")}>
              <button
                type="button"
                onClick={handleToggleBookmarkMode}
                aria-label={t("bookmarkMode")}
                aria-pressed={bookmarkMode}
                className={`outline-toolbar-btn ${bookmarkMode ? "active-subtle" : ""}`}>
                <StarIcon size={16} filled={bookmarkMode} color="currentColor" />
              </button>
            </Tooltip>

            {/* Expand/Collapse */}
            <Tooltip
              content={
                bookmarkMode
                  ? t("bookmarkModeDisabled")
                  : isAllExpanded
                    ? t("outlineCollapseAll")
                    : t("outlineExpandAll")
              }>
              <button
                type="button"
                onClick={bookmarkMode ? undefined : handleExpandAll}
                disabled={bookmarkMode}
                aria-label={
                  bookmarkMode
                    ? t("bookmarkModeDisabled")
                    : isAllExpanded
                      ? t("outlineCollapseAll")
                      : t("outlineExpandAll")
                }
                className="outline-toolbar-btn">
                {isAllExpanded ? <CollapseAllIcon size={18} /> : <ExpandAllIcon size={18} />}
              </button>
            </Tooltip>

            {/* Copy Outline */}
            <Tooltip
              content={isCopyingFullOutline ? t("outlineCopyFullRunning") : t("outlineCopyFull")}>
              <button
                type="button"
                onClick={handleCopyFullOutline}
                disabled={isCopyingFullOutline}
                aria-label={
                  isCopyingFullOutline ? t("outlineCopyFullRunning") : t("outlineCopyFull")
                }
                className={`outline-toolbar-btn ${isCopyingFullOutline ? "is-busy" : ""}`}>
                {fullOutlineCopySuccess ? (
                  <CheckIcon size={14} color="#10b981" />
                ) : (
                  <CopyOutlineIcon size={16} />
                )}
              </button>
            </Tooltip>

            {/* Locate Current */}
            <Tooltip content={t("outlineLocateCurrent")}>
              <button
                type="button"
                onClick={handleLocateCurrent}
                aria-label={t("outlineLocateCurrent")}
                className="outline-toolbar-btn">
                <LocateIcon size={16} />
              </button>
            </Tooltip>

            {/* Dynamic Scroll (Top/Bottom) */}
            <Tooltip
              content={scrollState === "bottom" ? t("outlineScrollBottom") : t("outlineScrollTop")}>
              <button
                type="button"
                onClick={handleDynamicScroll}
                aria-label={
                  scrollState === "bottom" ? t("outlineScrollBottom") : t("outlineScrollTop")
                }
                className="outline-toolbar-btn">
                {scrollState === "bottom" ? (
                  <ScrollBottomIcon size={16} />
                ) : (
                  <ScrollTopIcon size={16} />
                )}
              </button>
            </Tooltip>
          </div>

          {/* Search Input */}
          <div className="outline-search-wrapper gh-panel-search">
            <span className="gh-panel-search-icon" aria-hidden="true">
              <SearchIcon size={15} />
            </span>
            <input
              ref={inputRef}
              type="text"
              className="outline-search-input gh-panel-search-input"
              placeholder={t("outlineSearch")}
              aria-label={t("outlineSearch")}
              value={searchQuery}
              onChange={handleSearchChange}
            />
            {searchQuery && (
              <button
                type="button"
                className="outline-search-clear gh-panel-search-action"
                onClick={handleSearchClear}
                aria-label={t("clear")}
                title={t("clear")}>
                <ClearIcon size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Level Slider */}
        <div className="outline-level-slider-container" style={{ padding: "0 4px" }}>
          {/* Level Dots */}
          <div
            className="outline-level-dots"
            style={{
              display: "flex",
              justifyContent: "space-between",
              position: "relative",
              padding: "6px 0",
              alignItems: "center",
            }}>
            {/* Background Line */}
            <div
              className="outline-level-line-bg"
              style={{
                position: "absolute",
                top: "50%",
                left: "4px",
                right: "4px",
                height: "4px",
                background: "var(--gh-border, #e5e7eb)",
                zIndex: 0,
                transform: "translateY(-50%)",
                borderRadius: "2px",
              }}></div>
            {/* Progress Line */}
            <div
              className="outline-level-progress"
              style={{
                position: "absolute",
                top: "50%",
                left: "4px",
                height: "4px",
                background: bookmarkMode
                  ? "var(--gh-text-disabled, #9ca3af)"
                  : "var(--gh-primary, #3b82f6)",
                zIndex: 0,
                transform: "translateY(-50%)",
                borderRadius: "2px",
                width: `calc((${expandLevel} / 6) * (100% - 8px))`,
                transition: "width 0.2s ease",
              }}></div>

            {/* Dots */}
            {[0, 1, 2, 3, 4, 5, 6].map((lvl) => {
              // Tooltip Text
              let title = ""
              if (bookmarkMode) {
                title = t("bookmarkModeDisabled")
              } else if (lvl === 0) {
                title = showUserQueries ? t("outlineUserQueryRoleLabel") : t("outlineCollapseAll")
              } else {
                title = `H${lvl}: ${levelCounts[lvl] || 0}`
              }

              const isActive = lvl <= expandLevel
              return (
                <Tooltip key={lvl} content={title}>
                  <div
                    className={`outline-level-dot ${isActive ? "active" : ""} ${bookmarkMode ? "disabled" : ""}`}
                    data-level={lvl}
                    onClick={bookmarkMode ? undefined : () => handleLevelClick(lvl)}
                    style={{
                      width: "14px",
                      height: "14px",
                      borderRadius: "50%",
                      backgroundColor: isActive
                        ? bookmarkMode
                          ? "var(--gh-text-disabled, #9ca3af)"
                          : "var(--gh-primary, #3b82f6)"
                        : "var(--gh-slider-dot-bg, #d1d5db)",
                      border: isActive ? "2px solid var(--gh-bg, #fff)" : "none",
                      zIndex: 1,
                      cursor: bookmarkMode ? "not-allowed" : "pointer",
                      position: "relative",
                      transition: "all 0.2s ease",
                      boxSizing: "border-box",
                      boxShadow: isActive
                        ? bookmarkMode
                          ? "0 0 0 1px var(--gh-text-disabled, #9ca3af)"
                          : "0 0 0 1px var(--gh-primary, #3b82f6)"
                        : "none",
                      opacity: bookmarkMode ? 0.5 : 1,
                    }}
                  />
                </Tooltip>
              )
            })}
          </div>
        </div>
      </div>

      {/* 搜索结果条 (Sticky) */}
      {searchQuery && (
        <div
          className="outline-result-bar"
          style={{
            textAlign: "center",
            padding: "6px 8px", //稍微增加横向padding
            margin: "0 8px 0 8px", // 去除底部外边距，由下方容器 padding 控制
            color: "var(--gh-border-active)",
            fontSize: "13px",
            background: matchCount > 0 ? "var(--gh-folder-bg-default)" : "transparent",
            borderRadius: "4px",
            border: matchCount === 0 ? "1px dashed var(--gh-border, #e5e7eb)" : "none",
            flexShrink: 0, // 防止被压缩
          }}>
          {matchCount} {t("outlineSearchResult")}
        </div>
      )}

      {outlineSourceOptions.length > 1 && !searchQuery && (
        <div className="outline-source-switch" aria-label={t("outlineSourceSwitchLabel")}>
          {outlineSourceOptions.map((source) => (
            <button
              key={source.id}
              type="button"
              className={`outline-source-switch-option ${
                activeSourceId === source.id ? "active" : ""
              }`}
              onClick={() => manager.setActiveSource(source.id)}>
              <span>{getOutlineSourceLabel(source)}</span>
            </button>
          ))}
        </div>
      )}

      {/* 大纲树 */}
      <div
        ref={listRef}
        className={`gh-outline-tree-container gh-panel-bookmark-mode-${settings?.features?.outline?.panelBookmarkMode || "always"}`}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: searchQuery ? "0 8px 8px 8px" : "8px", // 搜索时顶部 padding 为 0 (依赖 ResultBar 的视觉分隔或紧凑布局)
        }}>
        {/* 搜索结果条 */}

        {(() => {
          // Helper: recursively check if node has bookmark
          const hasBookmarkedNode = (nodes: OutlineNode[]): boolean => {
            return nodes.some(
              (node) =>
                node.isBookmarked ||
                (node.children && node.children.length > 0 && hasBookmarkedNode(node.children)),
            )
          }
          const hasVisibleBookmarks = hasBookmarkedNode(tree)
          const isTreeEmpty = tree.length === 0
          const isOutlineVisuallyEmpty = !searchQuery && (isTreeEmpty || !hasVisibleNodes)
          const emptyDescription =
            showUserQueries && displayLevel === 0
              ? t("outlineEmptyDescUserQueryOnly")
              : t("outlineEmptyDescDefault")
          const zhCommaIndex = emptyDescription.indexOf("，")
          const enCommaIndex = emptyDescription.indexOf(",")
          let splitIndex = -1
          if (zhCommaIndex >= 0 && enCommaIndex >= 0) {
            splitIndex = Math.min(zhCommaIndex, enCommaIndex)
          } else {
            splitIndex = Math.max(zhCommaIndex, enCommaIndex)
          }

          const emptyDescriptionFirstLine =
            splitIndex >= 0 ? emptyDescription.slice(0, splitIndex).trim() : emptyDescription
          const emptyDescriptionSecondLine =
            splitIndex >= 0 ? emptyDescription.slice(splitIndex + 1).trim() : ""

          if (bookmarkMode && !hasVisibleBookmarks && !searchQuery) {
            return (
              <div className="outline-empty-state">
                <div
                  className="outline-empty-state-icon"
                  style={{ background: "rgba(245, 158, 11, 0.1)", color: "#f59e0b" }}
                  aria-hidden="true">
                  <StarIcon size={20} filled={true} color="#f59e0b" />
                </div>
                <div className="outline-empty-state-title">{t("outlineNoBookmarks")}</div>
                <div className="outline-empty-state-desc">{t("outlineAddBookmarkHint")}</div>

                <div
                  style={{
                    marginTop: "32px",
                    width: "100%",
                    display: "flex",
                    justifyContent: "center",
                  }}>
                  {!isCodexOpen && (
                    <MagicCodex
                      isOpen={true}
                      onClose={() => {}}
                      tips={structuredTips}
                      isStatic={true}
                    />
                  )}
                </div>
              </div>
            )
          }

          if (isOutlineVisuallyEmpty) {
            return (
              <div className="outline-empty-state">
                <div className="outline-empty-state-icon" aria-hidden="true">
                  <OutlineDocumentIcon size={20} color="currentColor" />
                </div>
                <div className="outline-empty-state-title">{t("outlineEmpty")}</div>
                <div className="outline-empty-state-desc">
                  <span className="outline-empty-state-desc-line">{emptyDescriptionFirstLine}</span>
                  {emptyDescriptionSecondLine && (
                    <span className="outline-empty-state-desc-line">
                      {emptyDescriptionSecondLine}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    marginTop: "32px",
                    width: "100%",
                    display: "flex",
                    justifyContent: "center",
                  }}>
                  {!isCodexOpen && (
                    <MagicCodex
                      isOpen={true}
                      onClose={() => {}}
                      tips={structuredTips}
                      isStatic={true}
                    />
                  )}
                </div>
              </div>
            )
          }

          return (
            <VirtualizedOutlineTree
              items={visibleItems}
              metrics={virtualMetrics}
              scrollTop={outlineScrollTop}
              viewportHeight={outlineViewportHeight}
              onToggle={handleToggle}
              onClick={handleClick}
              onToggleBookmark={handleToggleBookmark}
              setItemRef={setItemRef}
              searchQuery={searchQuery}
              extractUserQueryText={extractUserQueryText}
            />
          )
        })()}
      </div>
    </div>
  )
}
