import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  CheckIcon,
  ChevronDownIcon,
  ClearIcon,
  CollapseAllIcon,
  CopyIcon,
  DeleteIcon,
  EditIcon,
  ExpandAllIcon,
  EyeIcon,
  LocateIcon,
  MoreHorizontalIcon,
  PinIcon,
  ScrollBottomIcon,
  ScrollTopIcon,
  StarIcon,
  TimeIcon,
} from "~components/icons"
import { Tooltip } from "~components/ui/Tooltip"
import type { OutlineManager, OutlineNode } from "~core/outline-manager"
import { useSettingsStore } from "~stores/settings-store"
import { t, getCurrentLang } from "~utils/i18n"
import { formatWordCount } from "~utils/format"
import { CHECK_ICON_POINTS, COPY_ICON_PATH, COPY_ICON_RECT } from "~utils/icons"
import { showToast } from "~utils/toast"

interface OutlineTabProps {
  manager: OutlineManager
  onJumpBefore?: () => void
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
    parentCollapsed: boolean,
    parentForceExpanded: boolean,
    ancestorHasBookmark: boolean,
  ) => {
    parentMap[node.index] = parentIndex

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

    const childParentCollapsed = node.collapsed || parentCollapsed
    const childParentForceExpanded = node.forceExpanded || parentForceExpanded
    const childAncestorHasBookmark =
      ancestorHasBookmark || (node.isBookmarked && !hasBookmarkInDescendants(node))

    if (node.children && node.children.length > 0) {
      node.children.forEach((child) =>
        traverse(
          child,
          node.index,
          childParentCollapsed,
          childParentForceExpanded,
          childAncestorHasBookmark,
        ),
      )
    }
  }

  tree.forEach((root) => traverse(root, null, false, false, false))

  return { parentMap, visibleMap }
}

// 递归渲染大纲树节点
// 使用 outline-hidden 类而非条件渲染
const OutlineNodeView: React.FC<{
  node: OutlineNode
  onToggle: (node: OutlineNode) => void
  onClick: (node: OutlineNode) => void
  onCopy: (e: React.MouseEvent, node: OutlineNode) => void
  onToggleBookmark: (e: React.MouseEvent, node: OutlineNode) => void
  activeIndex: number | null
  visibleHighlightIndex: number | null
  setItemRef: (index: number, el: HTMLElement | null) => void
  visibleMap: Record<number, boolean>
  searchQuery: string
  extractUserQueryText?: (element: Element) => string // Used for full text extraction
}> = ({
  node,
  onToggle,
  onClick,
  onCopy,
  onToggleBookmark,
  activeIndex,
  visibleHighlightIndex,
  setItemRef,
  visibleMap,
  searchQuery,
  extractUserQueryText,
}) => {
  const isActive = node.index === activeIndex
  const isVisibleHighlight = node.index === visibleHighlightIndex
  const hasChildren = node.children && node.children.length > 0
  // Legacy: isExpanded 直接看 hasChildren 和 collapsed，不考虑搜索
  // 箭头始终显示（只要有子节点），因为用户可能想手动展开查看不匹配的子节点
  const isExpanded = hasChildren && !node.collapsed

  const shouldShow = visibleMap[node.index] ?? true

  // ===== CSS 类名 (Legacy exact) =====
  const itemClassName = [
    "outline-item",
    `outline-level-${node.relativeLevel}`,
    node.isUserQuery ? "user-query-node" : "",
    node.isGhost ? "ghost-node" : "", // Add ghost styling class
    isActive ? "sync-highlight" : "",
    isVisibleHighlight ? "sync-highlight-visible" : "",
    !shouldShow ? "outline-hidden" : "",
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

  return (
    <>
      <Tooltip
        content={
          node.wordCount && node.wordCount > 0 ? (
            <div>
              {node.text}
              <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "2px" }}>
                ({formatWordCount(node.wordCount, getCurrentLang())} {t("words") || "words"})
              </div>
            </div>
          ) : (
            node.text
          )
        }
        disabled={isHoveringAction}
        triggerStyle={{ width: "100%", display: "block" }}
        triggerClassName={!shouldShow ? "outline-hidden" : ""}
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
              <span className="user-query-badge-icon">
                <ConversationIcon size={14} />
              </span>
              <span className="user-query-badge-number">{node.queryIndex}</span>
            </span>
          )}

          {/* 文字 (带搜索高亮) */}
          <span className={`outline-item-text ${node.isGhost ? "ghost-text" : ""}`}>
            {renderTextWithHighlight()}
          </span>

          {/* Bookmark Button (Hover or Bookmarked) */}
          <span className={`outline-item-bookmark-wrapper ${node.isBookmarked ? "active" : ""}`}>
            <Tooltip
              content={
                node.isBookmarked
                  ? t("removeBookmark") || "Remove Bookmark"
                  : t("addBookmark") || "Add Bookmark"
              }>
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
          {true && (
            <Tooltip content={t("copy") || "复制"}>
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
          )}
        </div>
      </Tooltip>

      {/* 子节点 (始终渲染) */}
      {hasChildren &&
        node.children.map((child, idx) => (
          <OutlineNodeView
            key={`${child.level}-${child.text}-${idx}`}
            node={child}
            onToggle={onToggle}
            onClick={onClick}
            onCopy={onCopy}
            onToggleBookmark={onToggleBookmark}
            activeIndex={activeIndex}
            visibleHighlightIndex={visibleHighlightIndex}
            setItemRef={setItemRef}
            visibleMap={visibleMap}
            searchQuery={searchQuery}
            extractUserQueryText={extractUserQueryText}
          />
        ))}
    </>
  )
}

export const OutlineTab: React.FC<OutlineTabProps> = ({ manager, onJumpBefore }) => {
  // 获取设置 - 使用 Zustand Store
  const { settings } = useSettingsStore()

  // Initialize state from manager to prevent flicker
  const initialState = manager.getState()

  const [tree, setTree] = useState<OutlineNode[]>(initialState.tree)
  const [activeIndex, setActiveIndex] = useState<number | null>(null) // manager doesn't track activeIndex
  const [visibleHighlightIndex, setVisibleHighlightIndex] = useState<number | null>(null)
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

  // const { bookmarks } = useBookmarkStore() // Removed unused bookmarks

  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const prevTreeLengthRef = useRef<number>(0) // 用 ref 追踪上一次树长度
  const shouldScrollToBottomRef = useRef<boolean>(false) // 标记是否需要滚动
  const activeIndexRef = useRef<number | null>(null)
  const visibleHighlightRef = useRef<number | null>(null)
  const itemRefMap = useRef<Map<number, HTMLElement>>(new Map())
  const visibilityMapsRef = useRef<{
    parentMap: Record<number, number | null>
    visibleMap: Record<number, boolean>
    hasData: boolean
  }>({ parentMap: {}, visibleMap: {}, hasData: false })

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
    if ((window as any).__ophelPendingSearchOutline) {
      delete (window as any).__ophelPendingSearchOutline
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

      // 递归计算所有节点数量（包括子节点）
      const countNodes = (nodes: OutlineNode[]): number => {
        let count = 0
        for (const node of nodes) {
          count += 1
          if (node.children && node.children.length > 0) {
            count += countNodes(node.children)
          }
        }
        return count
      }

      const newTotalNodes = countNodes(state.tree)
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

  const updateActiveIndex = useCallback((idx: number | null) => {
    if (activeIndexRef.current !== idx) {
      activeIndexRef.current = idx
      setActiveIndex(idx)
    }
  }, [])

  const updateVisibleHighlightIndex = useCallback((idx: number | null) => {
    if (visibleHighlightRef.current !== idx) {
      visibleHighlightRef.current = idx
      setVisibleHighlightIndex(idx)
    }
  }, [])

  const setItemRef = useCallback((index: number, el: HTMLElement | null) => {
    const map = itemRefMap.current
    if (el) {
      map.set(index, el)
    } else {
      map.delete(index)
    }
  }, [])

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

  const { parentMap, visibleMap } = visibilityMaps

  visibilityMapsRef.current = { parentMap, visibleMap, hasData: tree.length > 0 }

  useEffect(() => {
    const nextVisible = getVisibleHighlightIndex(activeIndexRef.current)
    updateVisibleHighlightIndex(nextVisible)
  }, [parentMap, visibleMap, tree.length, getVisibleHighlightIndex, updateVisibleHighlightIndex])

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
    let retryTimer: NodeJS.Timeout
    let lastScrollHeight = 0
    let resizeObserver: ResizeObserver | null = null
    let staleTimer: NodeJS.Timeout | null = null
    let idleHandle: number | null = null
    const staleDebounceMs = 300
    const staleIdleTimeoutMs = 500
    const mutationObservers = new Map<Node, MutationObserver>()

    const handleResize = () => {
      manager.markScrollPositionsStale()
    }

    const scheduleStaleMark = () => {
      if (staleTimer) return
      staleTimer = setTimeout(() => {
        staleTimer = null

        const requestIdle =
          typeof window !== "undefined"
            ? (
                window as Window & {
                  requestIdleCallback?: (
                    callback: IdleRequestCallback,
                    options?: IdleRequestOptions,
                  ) => number
                }
              ).requestIdleCallback
            : undefined

        if (requestIdle) {
          if (idleHandle !== null) return
          idleHandle = requestIdle(
            () => {
              idleHandle = null
              manager.markScrollPositionsStale()
            },
            { timeout: staleIdleTimeoutMs },
          )
        } else {
          manager.markScrollPositionsStale()
        }
      }, staleDebounceMs)
    }

    const observeRoot = (root: Node) => {
      if (mutationObservers.has(root)) return

      const observer = new MutationObserver(() => {
        scheduleStaleMark()
      })

      observer.observe(root, { childList: true, subtree: true, characterData: true })
      mutationObservers.set(root, observer)
    }

    const attachMutationObservers = (container: HTMLElement) => {
      try {
        observeRoot(container)
      } catch (e) {
        console.warn("[OutlineTab] Failed to attach MutationObserver:", e)
      }
    }

    const handleScroll = () => {
      if (!scrollContainer) return

      const scrollTop = scrollContainer.scrollTop
      const viewportHeight = scrollContainer.clientHeight
      const nextScrollHeight = scrollContainer.scrollHeight
      if (nextScrollHeight !== lastScrollHeight) {
        lastScrollHeight = nextScrollHeight
        manager.markScrollPositionsStale()
      }
      const idx = manager.findVisibleItemIndex(scrollTop, viewportHeight)

      if (idx === null) {
        updateActiveIndex(null)
        updateVisibleHighlightIndex(null)
        return
      }

      updateActiveIndex(idx)
      const visibleIdx = getVisibleHighlightIndex(idx)
      updateVisibleHighlightIndex(visibleIdx)

      if (visibleIdx === null) return

      requestAnimationFrame(() => {
        const listContainer = listRef.current
        if (!listContainer) return

        const outlineItem = itemRefMap.current.get(visibleIdx) || null
        if (!outlineItem) return

        const wrapperRect = listContainer.getBoundingClientRect()
        const itemRect = outlineItem.getBoundingClientRect()
        if (itemRect.top < wrapperRect.top || itemRect.bottom > wrapperRect.bottom) {
          const scrollOffset =
            itemRect.top - wrapperRect.top - wrapperRect.height / 2 + itemRect.height / 2
          listContainer.scrollBy({ top: scrollOffset, behavior: "instant" })
        }
      })
    }

    const initListener = () => {
      const container = manager.getScrollContainer()
      if (container) {
        scrollContainer = container
        lastScrollHeight = container.scrollHeight
        scrollContainer.addEventListener("scroll", handleScroll, { passive: true })
        window.addEventListener("resize", handleResize, { passive: true })
        attachMutationObservers(container)
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            lastScrollHeight = scrollContainer?.scrollHeight || 0
            manager.markScrollPositionsStale()
          })
          resizeObserver.observe(scrollContainer)
        }
        // Initial check
        handleScroll()
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
      if (staleTimer) {
        clearTimeout(staleTimer)
      }
      if (idleHandle !== null) {
        const cancelIdle =
          typeof window !== "undefined"
            ? (window as Window & { cancelIdleCallback?: (handle: number) => void })
                .cancelIdleCallback
            : undefined
        if (cancelIdle) {
          cancelIdle(idleHandle)
        }
        idleHandle = null
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
    getVisibleHighlightIndex,
    updateActiveIndex,
    updateVisibleHighlightIndex,
  ])

  // 大纲列表滚动监听 (Dynamic Scroll Button state)
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const checkScroll = () => {
      const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 10
      setScrollState(isAtBottom ? "top" : "bottom")
    }
    el.addEventListener("scroll", checkScroll)
    // Initial check
    checkScroll()
    return () => el.removeEventListener("scroll", checkScroll)
  }, []) // Empty dependency array as listRef strictly stable

  const handleToggle = useCallback(
    (node: OutlineNode) => {
      manager.toggleNode(node)
    },
    [manager],
  )

  const handleClick = useCallback(
    async (node: OutlineNode) => {
      let targetElement = node.element

      // 元素失效时重新查找
      if (!targetElement || !targetElement.isConnected) {
        // 用户提问节点（level=0）需要使用专门的查找逻辑
        if (node.isUserQuery && node.level === 0) {
          // 按 queryIndex 和文本查找用户提问元素
          const found = manager.findUserQueryElement(node.queryIndex!, node.text)
          if (found) {
            targetElement = found as HTMLElement
            node.element = targetElement
          }
        } else {
          // 普通标题使用 findElementByHeading
          const found = manager.findElementByHeading(node.level, node.text)
          if (found) {
            targetElement = found as HTMLElement
            node.element = targetElement
          }
        }
      }

      if (targetElement && targetElement.isConnected) {
        // 等待锚点保存完成后再跳转（instant 模式必须）
        if (onJumpBefore) {
          await onJumpBefore()
        }
        // 传入 __bypassLock: true 以绕过 ScrollLockManager 的拦截
        targetElement.scrollIntoView({
          behavior: "instant",
          block: "start",
          __bypassLock: true,
        } as any)
        // 高亮效果
        targetElement.classList.add("outline-highlight")
        setTimeout(() => targetElement?.classList.remove("outline-highlight"), 2000)
      } else if (node.isGhost && node.scrollTop !== undefined) {
        // Ghost 节点（收藏对应内容不存在）：使用保存的 scrollTop 回退
        const scrollContainer = manager.getScrollContainer()
        if (scrollContainer) {
          scrollContainer.scrollTo({ top: node.scrollTop, behavior: "smooth" })
          showToast(t("bookmarkContentMissing") || "收藏内容不存在，已跳转到保存位置", 3000)
        }
      } else {
        showToast(t("bookmarkContentMissing") || "收藏内容已被删除或折叠", 2000)
      }
    },
    [manager, onJumpBefore],
  )

  const handleCopy = useCallback((e: React.MouseEvent, node: OutlineNode) => {
    e.stopPropagation()
    const text = node.text
    navigator.clipboard.writeText(text)
  }, [])

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

    let currentItem: (typeof tree)[0] | null = null
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

    // 3. 展开目标项的所有父级节点
    manager.revealNode(currentItem.index)

    // 4. 延迟滚动和高亮（等待 DOM 更新）
    setTimeout(() => {
      const listContainer = listRef.current
      if (!listContainer) return

      const outlineItem = listContainer.querySelector(
        `.outline-item[data-index="${currentItem!.index}"]`,
      )
      if (!outlineItem) return

      // 滚动大纲面板到该项（居中显示）
      outlineItem.scrollIntoView({ behavior: "instant", block: "center" })

      // 高亮该大纲项（3秒后消失并清除 forceVisible）
      outlineItem.classList.add("highlight")
      setTimeout(() => {
        outlineItem.classList.remove("highlight")
        manager.clearForceVisible()
      }, 3000)
    }, 50)
  }, [tree, searchQuery, manager])

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
      ;(window as any).__ophelPendingLocateOutline = false
      handleLocateCurrent()
    }

    // 检查挂载时是否有待处理的定位请求
    if ((window as any).__ophelPendingLocateOutline) {
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
      <div
        className="outline-fixed-toolbar"
        style={{
          padding: "8px",
          borderBottom: "1px solid var(--gh-border, #e5e7eb)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          backgroundColor: "var(--gh-bg, #fff)",
        }}>
        {/* Row 1: Buttons & Search */}
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "2px" }}>
            {/* Group Mode */}
            <Tooltip
              content={
                showUserQueries
                  ? t("outlineOnlyUserQueries") || "仅显示提问"
                  : t("outlineShowUserQueries") || "显示所有"
              }>
              <button
                onClick={handleGroupModeToggle}
                className={`outline-toolbar-btn ${showUserQueries ? "active-subtle" : ""}`}>
                <ConversationIcon size={16} />
              </button>
            </Tooltip>

            {/* Bookmark Mode Toggle */}
            <Tooltip content={t("bookmarkMode") || "收藏"}>
              <button
                onClick={handleToggleBookmarkMode}
                className={`outline-toolbar-btn ${bookmarkMode ? "active-subtle" : ""}`}>
                <StarIcon size={16} filled={bookmarkMode} color="currentColor" />
              </button>
            </Tooltip>

            {/* Expand/Collapse */}
            <Tooltip
              content={
                bookmarkMode
                  ? t("bookmarkModeDisabled") || "收藏模式下不可用"
                  : isAllExpanded
                    ? t("outlineCollapseAll")
                    : t("outlineExpandAll")
              }>
              <button
                onClick={bookmarkMode ? undefined : handleExpandAll}
                disabled={bookmarkMode}
                style={{
                  width: "26px",
                  height: "26px",
                  padding: 0,
                  border: "1px solid var(--gh-input-border, #d1d5db)",
                  borderRadius: "4px",
                  backgroundColor: "var(--gh-bg, #fff)",
                  color: bookmarkMode
                    ? "var(--gh-text-disabled, #9ca3af)"
                    : "var(--gh-text, #374151)",
                  cursor: bookmarkMode ? "not-allowed" : "pointer",
                  opacity: bookmarkMode ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                {isAllExpanded ? <CollapseAllIcon size={16} /> : <ExpandAllIcon size={16} />}
              </button>
            </Tooltip>

            {/* Locate Current */}
            <Tooltip content={t("outlineLocateCurrent") || "定位到当前位置"}>
              <button
                onClick={handleLocateCurrent}
                style={{
                  width: "26px",
                  height: "26px",
                  padding: 0,
                  border: "1px solid var(--gh-input-border, #d1d5db)",
                  borderRadius: "4px",
                  backgroundColor: "var(--gh-bg, #fff)",
                  color: "var(--gh-text, #374151)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                <LocateIcon size={16} />
              </button>
            </Tooltip>

            {/* Dynamic Scroll (Top/Bottom) */}
            <Tooltip
              content={
                scrollState === "bottom"
                  ? t("outlineScrollBottom") || "滚动到底部"
                  : t("outlineScrollTop") || "回到顶部"
              }>
              <button
                onClick={handleDynamicScroll}
                style={{
                  width: "26px",
                  height: "26px",
                  padding: 0,
                  border: "1px solid var(--gh-input-border, #d1d5db)",
                  borderRadius: "4px",
                  backgroundColor: "var(--gh-bg, #fff)",
                  color: "var(--gh-text, #374151)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                }}>
                {scrollState === "bottom" ? (
                  <ScrollBottomIcon size={16} />
                ) : (
                  <ScrollTopIcon size={16} />
                )}
              </button>
            </Tooltip>
          </div>

          {/* Search Input */}
          <div
            className="outline-search-wrapper"
            style={{
              flex: 1,
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}>
            <input
              ref={inputRef}
              type="text"
              className="outline-search-input"
              placeholder={t("outlineSearch") || "搜索..."}
              value={searchQuery}
              onChange={handleSearchChange}
              style={{
                width: "100%",
                padding: "4px 24px 4px 8px",
                borderRadius: "4px",
                border: "1px solid var(--gh-input-border, #d1d5db)",
                fontSize: "12px",
                boxSizing: "border-box",
                height: "26px",
                backgroundColor: "var(--gh-input-bg, #fff)",
                color: "var(--gh-text, #374151)",
              }}
            />
            {searchQuery && (
              <button
                className="outline-search-clear"
                onClick={handleSearchClear}
                style={{
                  position: "absolute",
                  right: "4px",
                  background: "none",
                  border: "none",
                  color: "var(--gh-text-tertiary, #9ca3af)",
                  cursor: "pointer",
                  fontSize: "14px",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
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
                title = t("bookmarkModeDisabled") || "收藏模式下不可用"
              } else if (lvl === 0) {
                title = showUserQueries
                  ? t("outlineOnlyUserQueries") || "仅显示提问"
                  : t("outlineCollapseAll") || "折叠全部"
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
          {matchCount} {t("outlineSearchResult") || "个结果"}
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

          if (bookmarkMode && !hasVisibleBookmarks && !searchQuery) {
            return (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--gh-text-tertiary, #9ca3af)",
                  marginTop: "40px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: "rgba(245, 158, 11, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#f59e0b",
                    marginBottom: "8px",
                  }}>
                  <StarIcon size={20} filled={true} color="#f59e0b" />
                </div>
                <div
                  style={{ fontSize: "14px", fontWeight: 500, color: "var(--gh-text, #374151)" }}>
                  {t("outlineNoBookmarks") || "暂无收藏"}
                </div>
                <div style={{ fontSize: "12px", opacity: 0.7 }}>
                  {t("outlineAddBookmarkHint") || "点击条目旁的星号添加收藏"}
                </div>
              </div>
            )
          }

          if (isTreeEmpty) {
            return (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--gh-text-tertiary, #9ca3af)",
                  marginTop: "20px",
                  fontSize: "12px",
                }}>
                {t("outlineEmpty") || "暂无大纲内容"}
              </div>
            )
          }

          return (
            <div className="outline-list">
              {tree.map((node, idx) => (
                <OutlineNodeView
                  key={`${node.level}-${node.text}-${idx}`}
                  node={node}
                  onToggle={handleToggle}
                  onClick={handleClick}
                  onCopy={handleCopy}
                  onToggleBookmark={handleToggleBookmark}
                  activeIndex={activeIndex}
                  visibleHighlightIndex={visibleHighlightIndex}
                  setItemRef={setItemRef}
                  visibleMap={visibleMap}
                  searchQuery={searchQuery}
                  extractUserQueryText={extractUserQueryText}
                />
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
