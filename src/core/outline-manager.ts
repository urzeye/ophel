import type { OutlineItem, SiteAdapter } from "~adapters/base"
import type { Settings } from "~utils/storage"
import { useBookmarkStore, type Bookmark } from "~stores/bookmarks-store"

export interface OutlineNode extends OutlineItem {
  children: OutlineNode[]
  relativeLevel: number
  index: number
  collapsed: boolean
  forceExpanded?: boolean
  forceVisible?: boolean // 定位时强制可见
  isMatch?: boolean
  hasMatchedDescendant?: boolean
  queryIndex?: number
  // Bookmark props
  isBookmarked?: boolean
  isGhost?: boolean
  bookmarkId?: string
  scrollTop?: number
}

interface TreeState {
  collapsed: boolean
  forceExpanded?: boolean
  hadChildren: boolean
}

export class OutlineManager {
  private siteAdapter: SiteAdapter
  private settings: Settings["features"]["outline"]

  private tree: OutlineNode[] = []
  private flatItems: OutlineItem[] = []

  // State
  private minLevel: number = 1
  private treeKey: string = ""
  private listeners: (() => void)[] = []
  private updateIntervalId: NodeJS.Timeout | null = null
  private isAutoUpdating = false

  // UI State
  private expandLevel: number = 6
  private levelCounts: Record<number, number> = {}
  private isAllExpanded: boolean = false

  // Search State
  private searchQuery: string = ""
  private preSearchState: Record<string, TreeState> | null = null
  private preSearchExpandLevel: number | null = null // 保存搜索前的层级
  private searchLevelManual: boolean = false
  private matchCount: number = 0

  // Bookmark Filter Mode
  private bookmarkMode: boolean = false
  private preBookmarkModeState: Record<string, boolean> | null = null // 保存收藏模式前的折叠状态

  // 生成状态追踪（用于检测生成完成后刷新）
  private wasGenerating: boolean = false
  private postGenerationScheduled: boolean = false // 防止重复触发

  // 兜底方案：基于内容变化检测
  private lastTreeChangeTime: number = 0
  private fallbackRefreshTimer: NodeJS.Timeout | null = null
  private static readonly FALLBACK_DELAY = 3000 // 3秒无变化后触发强制刷新

  // Tab 激活状态（只有激活时才监听）
  private isActive: boolean = false

  // 设置变更回调
  private onExpandLevelChange?: (level: number) => void
  private onShowUserQueriesChange?: (show: boolean) => void

  constructor(
    adapter: SiteAdapter,
    settings: Settings["features"]["outline"],
    onExpandLevelChange?: (level: number) => void,
    onShowUserQueriesChange?: (show: boolean) => void,
  ) {
    this.siteAdapter = adapter
    this.settings = settings
    this.onExpandLevelChange = onExpandLevelChange
    this.onShowUserQueriesChange = onShowUserQueriesChange

    // 从设置中读取保存的层级
    this.expandLevel = settings.expandLevel ?? 6

    // Listen to monitor messages
    window.addEventListener("message", this.handleMessage.bind(this))

    // 不在构造函数中启动 auto-update，由 setActive 控制
  }

  // 设置 Tab 激活状态（由 OutlineTab 调用）
  setActive(active: boolean) {
    this.isActive = active
    this.updateAutoUpdateState()
  }

  // 根据条件启动/停止自动更新
  private updateAutoUpdateState() {
    // 只有当：大纲功能开启 AND 自动更新开启 AND Tab 处于激活状态 时才启用 Observer
    const shouldEnable = this.settings.enabled && this.settings.autoUpdate && this.isActive

    // 避免不必要的 start/stop：只有状态需要变化时才操作
    if (shouldEnable && !this.isAutoUpdating) {
      this.startAutoUpdate()
    } else if (!shouldEnable && this.isAutoUpdating) {
      this.stopAutoUpdate()
    }
    // 否则保持当前状态不变
  }

  updateSettings(newSettings: Settings["features"]["outline"]) {
    this.settings = newSettings
    // 同步 expandLevel
    if (newSettings.expandLevel !== undefined) {
      this.expandLevel = newSettings.expandLevel
    }
    this.refresh()
    // 根据新设置更新 auto-update 状态
    this.updateAutoUpdateState()
  }

  // State for Auto Update
  private observer: MutationObserver | null = null
  private updateDebounceTimer: NodeJS.Timeout | null = null

  private handleMessage(event: MessageEvent) {
    if (event.source !== window) return
    // Imports needed: EVENT_MONITOR_START, EVENT_MONITOR_COMPLETE
    // I will add them to the top of the file
    const { type } = event.data || {}

    if (type === "GH_MONITOR_START" /* EVENT_MONITOR_START */) {
      if (this.settings.autoUpdate) {
        this.startAutoUpdate()
      }
    } else if (type === "GH_MONITOR_COMPLETE" /* EVENT_MONITOR_COMPLETE */) {
      this.stopAutoUpdate()
      // Final refresh
      this.refresh()
    }
  }

  private startAutoUpdate() {
    if (this.observer) return

    this.isAutoUpdating = true

    this.observer = new MutationObserver(() => {
      this.triggerAutoUpdate()
    })

    // 观察 document.body，虽然范围大但为了确保捕获所有变化
    // legacy 使用的是 document.body
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  private stopAutoUpdate() {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
    if (this.updateDebounceTimer) {
      clearTimeout(this.updateDebounceTimer)
      this.updateDebounceTimer = null
    }
    this.isAutoUpdating = false
  }

  private triggerAutoUpdate() {
    const interval = (this.settings.updateInterval || 2) * 1000

    // Debounce logic: wait for interval before updating
    if (!this.updateDebounceTimer) {
      this.updateDebounceTimer = setTimeout(() => {
        this.executeAutoUpdate()
      }, interval)
    }
  }

  private executeAutoUpdate() {
    if (this.updateDebounceTimer) {
      clearTimeout(this.updateDebounceTimer)
      this.updateDebounceTimer = null
    }

    // 检测生成状态变化
    const isGenerating = this.siteAdapter.isGenerating()

    // 如果之前在生成，现在不生成了 = 生成刚完成（防止重复触发）
    if (this.wasGenerating && !isGenerating && !this.postGenerationScheduled) {
      this.postGenerationScheduled = true
      // 生成完成后延迟 500ms 再刷新，确保 DOM 稳定
      setTimeout(() => {
        this.postGenerationScheduled = false
        // 清空 treeKey 强制重建树，获取新的 DOM 元素引用
        this.treeKey = ""
        this.refresh()
      }, 500)
    }

    this.wasGenerating = isGenerating

    // 记录当前 treeKey 用于检测变化
    const oldTreeKey = this.treeKey
    this.refresh()

    // 兆底方案：检测内容变化
    if (this.treeKey !== oldTreeKey) {
      // 有新内容，记录时间并重置计时器
      this.lastTreeChangeTime = Date.now()
      if (this.fallbackRefreshTimer) {
        clearTimeout(this.fallbackRefreshTimer)
      }
      // 设置兆底计时器：如果 3 秒内没有新变化，触发强制刷新
      this.fallbackRefreshTimer = setTimeout(() => {
        this.fallbackRefreshTimer = null
        // 确保确实 3 秒没有变化
        if (Date.now() - this.lastTreeChangeTime >= OutlineManager.FALLBACK_DELAY - 100) {
          this.treeKey = "" // 强制重建
          this.refresh()
        }
      }, OutlineManager.FALLBACK_DELAY)
    }
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  private notify() {
    this.listeners.forEach((l) => l())
  }

  getTree(): OutlineNode[] {
    return this.tree
  }

  getSearchQuery() {
    return this.searchQuery
  }

  getScrollContainer(): HTMLElement | null {
    return this.siteAdapter.getScrollContainer()
  }

  // 收藏模式
  setBookmarkMode(enabled: boolean) {
    if (enabled && !this.bookmarkMode) {
      // 开启收藏模式：保存当前折叠状态
      this.preBookmarkModeState = this.saveTreeCollapsedState(this.tree)
      // 先全部折叠
      this.collapseAllExpandedState(this.tree)
      // 再展开收藏路径
      this.expandBookmarkPaths(this.tree)
    } else if (!enabled && this.bookmarkMode) {
      // 关闭收藏模式：恢复之前的折叠状态
      if (this.preBookmarkModeState) {
        this.restoreTreeCollapsedState(this.tree, this.preBookmarkModeState)
        this.preBookmarkModeState = null
      }
    }
    this.bookmarkMode = enabled

    // 如果当前有搜索，重新执行搜索以更新结果计数和高亮状态（应用新的过滤逻辑）
    if (this.searchQuery) {
      this.performSearch(this.searchQuery)
    }

    this.notify()
  }

  toggleBookmarkMode() {
    this.setBookmarkMode(!this.bookmarkMode)
  }

  getBookmarkMode() {
    return this.bookmarkMode
  }

  /**
   * 保存树的折叠状态
   */
  private saveTreeCollapsedState(nodes: OutlineNode[]): Record<string, boolean> {
    const state: Record<string, boolean> = {}
    const saveNode = (node: OutlineNode, path: string) => {
      const key = `${path}/${node.level}-${node.text}`
      state[key] = node.collapsed
      node.children.forEach((child, idx) => saveNode(child, `${key}/${idx}`))
    }
    nodes.forEach((n, idx) => saveNode(n, `root/${idx}`))
    return state
  }

  /**
   * 恢复树的折叠状态
   */
  private restoreTreeCollapsedState(nodes: OutlineNode[], state: Record<string, boolean>) {
    const restoreNode = (node: OutlineNode, path: string) => {
      const key = `${path}/${node.level}-${node.text}`
      if (key in state) {
        node.collapsed = state[key]
      }
      node.children.forEach((child, idx) => restoreNode(child, `${key}/${idx}`))
    }
    nodes.forEach((n, idx) => restoreNode(n, `root/${idx}`))
  }

  /**
   * 递归折叠所有节点（仅修改 collapsed 状态）
   */
  private collapseAllExpandedState(nodes: OutlineNode[]) {
    nodes.forEach((node) => {
      node.collapsed = true
      if (node.children.length > 0) {
        this.collapseAllExpandedState(node.children)
      }
    })
  }

  /**
   * 展开包含收藏的所有路径
   * 递归遍历树，如果节点本身是收藏或其后代有收藏，则展开该节点
   */
  private expandBookmarkPaths(nodes: OutlineNode[]): boolean {
    let hasBookmark = false
    nodes.forEach((node) => {
      let childHasBookmark = false
      if (node.children.length > 0) {
        childHasBookmark = this.expandBookmarkPaths(node.children)
      }

      if (childHasBookmark) {
        // 只有当后代有收藏时才展开（作为路径）
        // 如果仅仅是自己有收藏（叶子收藏），保持折叠（因为 collapseAll 已经设为 true 了）
        node.collapsed = false
      }

      if (node.isBookmarked || childHasBookmark) {
        hasBookmark = true
      }
    })
    return hasBookmark
  }

  extractUserQueryText(element: Element): string {
    return this.siteAdapter.extractUserQueryText(element)
  }

  /**
   * 根据标题级别和文本查找元素（支持 Shadow DOM 穿透）
   * 代理到 siteAdapter 以支持不同平台的实现
   */
  findElementByHeading(level: number, text: string): Element | null {
    return this.siteAdapter.findElementByHeading(level, text)
  }

  /**
   * 根据 queryIndex 和文本查找用户提问元素
   * 用于大纲跳转时元素失效后的重新查找
   * @param queryIndex 用户提问的序号（从 1 开始）
   * @param text 用户提问文本（用于验证和回退搜索）
   */
  findUserQueryElement(queryIndex: number, text: string): Element | null {
    return this.siteAdapter.findUserQueryElement(queryIndex, text)
  }

  getState() {
    // 根据是否开启用户提问，确定 minRelativeLevel
    const minRelativeLevel = this.settings.showUserQueries ? 0 : 1

    // 计算 displayLevel (Legacy logic)
    let displayLevel: number
    if (this.searchQuery && !this.searchLevelManual) {
      displayLevel = 100 // 足够大以显示所有
    } else {
      displayLevel = this.expandLevel ?? 6
    }
    // 限制最小值
    const minDisplayLevel = this.settings.showUserQueries ? 0 : 1
    if (displayLevel < minDisplayLevel) {
      displayLevel = minDisplayLevel
    }

    return {
      tree: this.tree,
      expandLevel: this.expandLevel,
      levelCounts: this.levelCounts,
      isAllExpanded: this.isAllExpanded,
      includeUserQueries: this.settings.showUserQueries,
      minRelativeLevel,
      displayLevel,
      searchLevelManual: this.searchLevelManual,
      matchCount: this.matchCount,
      bookmarkMode: this.bookmarkMode,
    }
  }

  // --- Bookmark Logic ---

  private generateSignature(item: OutlineItem): string {
    if (!item.element) return item.text
    // Signature: Title + First 50 chars of next sibling text content
    let context = ""
    try {
      if (item.element.nextElementSibling) {
        context = (item.element.nextElementSibling.textContent || "").trim().substring(0, 50)
      } else if (item.element instanceof HTMLElement) {
        // Fallback: try parent's next sibling if current is effectively a wrapper
        // context = item.element.parentElement?.nextElementSibling?...
      }
    } catch (e) {
      // Ignore
    }
    return `${item.text}::${context}`
  }

  // Helper public method for UI
  toggleBookmark(node: OutlineNode) {
    const sessionId = this.siteAdapter.getSessionId()
    const siteId = this.siteAdapter.getSiteId() // 站点标识
    const cid = this.siteAdapter.getCurrentCid() || "" // 账号 ID
    const signature = this.generateSignature(node)
    // Use node.element.offsetTop if available, or current scroll position?
    // Best is element.offsetTop usually.
    let scrollTop = 0
    if (node.element instanceof HTMLElement) {
      scrollTop = node.element.offsetTop
    } else if (node.scrollTop !== undefined) {
      scrollTop = node.scrollTop // If it's a ghost node or already has it
    }

    // 切换收藏状态
    const store = useBookmarkStore.getState()
    const existingId = store.getBookmarkId(sessionId, signature)

    if (existingId) {
      // 移除收藏
      store.removeBookmark(existingId)
      node.isBookmarked = false
      node.bookmarkId = undefined
    } else {
      // 添加收藏
      store.addBookmark(sessionId, siteId, cid, node, signature, scrollTop)
      node.isBookmarked = true
      node.bookmarkId = store.getBookmarkId(sessionId, signature) || undefined
    }

    // 直接通知 UI 更新，不重建树（避免折叠状态被重置）
    this.notify()
  }

  // Adjusted refresh signature
  refresh(overrideLevel?: number) {
    if (!this.settings.enabled) return

    let outlineData = this.siteAdapter.extractOutline(
      this.settings.maxLevel,
      this.settings.showUserQueries,
    )

    // --- Merge Bookmarks ---
    const sessionId = this.siteAdapter.getSessionId()
    const bookmarks = useBookmarkStore.getState().getBookmarksBySession(sessionId)

    if (bookmarks.length > 0) {
      // 1. Mark matched nodes
      // Create a map for fast lookup? No, signature might collision if simple.
      // Signatures are unique enough.

      const unmatchedBookmarkIds = new Set(bookmarks.map((b) => b.id))

      outlineData.forEach((item) => {
        const signature = this.generateSignature(item)
        // Find matching bookmark
        const bookmark = bookmarks.find((b) => b.signature === signature && b.title === item.text)

        if (bookmark) {
          ;(item as OutlineNode).isBookmarked = true
          ;(item as OutlineNode).bookmarkId = bookmark.id
          unmatchedBookmarkIds.delete(bookmark.id)
        }
      })

      // 2. Insert Ghost Nodes
      const ghosts: OutlineItem[] = []
      unmatchedBookmarkIds.forEach((bid) => {
        const bookmark = bookmarks.find((b) => b.id === bid)
        if (bookmark) {
          ghosts.push({
            level: bookmark.level,
            text: bookmark.title,
            element: null, // Ghost nodes have no element
            isUserQuery: false, // Assume false for now, or store type in bookmark
            // Custom props
            isBookmarked: true,
            isGhost: true,
            bookmarkId: bookmark.id,
            // Helper for sorting
            scrollTop: bookmark.scrollTop,
          } as any)
        }
      })

      if (ghosts.length > 0) {
        // Calculate offsets for real items to sort
        const container = this.siteAdapter.getScrollContainer()
        const getTop = (item: any) => {
          if (item.isGhost) return item.scrollTop
          if (item.element instanceof HTMLElement) return item.element.offsetTop
          return 0
        }

        // Merge and sort
        outlineData = [...outlineData, ...ghosts].sort((a, b) => getTop(a) - getTop(b))
      }
    }

    if (outlineData.length === 0) {
      // ... existing clear logic
      if (this.tree.length > 0) {
        this.tree = []
        this.notify()
      }
      return
    }

    // Calculate level counts
    this.levelCounts = {}
    outlineData.forEach((item) => {
      this.levelCounts[item.level] = (this.levelCounts[item.level] || 0) + 1
    })

    // Calculate minLevel (smart indentation)
    const headingLevels = outlineData.filter((item) => !item.isUserQuery).map((item) => item.level)
    this.minLevel = headingLevels.length > 0 ? Math.min(...headingLevels) : 1

    // Check if tree changed
    const outlineKey = outlineData.map((i) => `${i.text}:${(i as any).isBookmarked}`).join("|")
    const currentStateMap: Record<string, TreeState> = {}
    if (this.tree.length > 0) {
      this.captureTreeState(this.tree, currentStateMap)
    }

    // Always rebuild if overrideLevel is provided to ensure state is reset
    if (this.treeKey !== outlineKey || this.tree.length === 0 || overrideLevel !== undefined) {
      this.tree = this.buildTree(outlineData, this.minLevel)
      this.treeKey = outlineKey
    } else {
      return
    }

    // Restore state
    const displayLevel = overrideLevel !== undefined ? overrideLevel : this.expandLevel ?? 6
    this.expandLevel = displayLevel

    const minDisplayLevel = this.settings.showUserQueries ? 0 : 1
    const effectiveDisplayLevel = displayLevel < minDisplayLevel ? minDisplayLevel : displayLevel

    // 1. Initialize logic
    this.initializeCollapsedState(this.tree, effectiveDisplayLevel)

    // 2. Restore user state (ONLY if not overriding)
    if (overrideLevel === undefined && Object.keys(currentStateMap).length > 0) {
      this.restoreTreeState(this.tree, currentStateMap)
    }

    // Re-apply search if needed
    if (this.searchQuery) {
      this.performSearch(this.searchQuery)
    }

    // 收藏模式不再强制显示，由 UI 层根据 bookmarkMode 状态过滤

    // 计算 isAllExpanded 状态，确保按钮初始状态正确
    const maxActualLevel = Math.max(...Object.keys(this.levelCounts).map(Number), 1)
    this.isAllExpanded = this.expandLevel >= maxActualLevel

    this.notify()
  }

  // Build tree from flat list
  private buildTree(outline: OutlineItem[], minLevel: number): OutlineNode[] {
    const tree: OutlineNode[] = []
    const stack: OutlineNode[] = []
    let queryCount = 0

    outline.forEach((item, index) => {
      const relativeLevel = item.isUserQuery ? 0 : item.level - minLevel + 1

      let queryIndex: number | undefined
      if (item.isUserQuery) {
        queryCount++
        queryIndex = queryCount
      }

      const node: OutlineNode = {
        ...item,
        relativeLevel,
        index, // This index is from the flat list returned by extractOutline
        queryIndex,
        children: [],
        collapsed: false,
      }
      // Inherit bookmark props from merged item
      if ((item as any).isBookmarked) node.isBookmarked = true
      if ((item as any).isGhost) node.isGhost = true
      if ((item as any).bookmarkId) node.bookmarkId = (item as any).bookmarkId

      while (stack.length > 0 && stack[stack.length - 1].relativeLevel >= relativeLevel) {
        stack.pop()
      }

      if (stack.length === 0) {
        tree.push(node)
      } else {
        stack[stack.length - 1].children.push(node)
      }
      stack.push(node)
    })

    return tree
  }

  // State Management
  private captureTreeState(nodes: OutlineNode[], stateMap: Record<string, TreeState>) {
    nodes.forEach((node) => {
      const key = `${node.level}_${node.text}`
      const hasChildren = node.children && node.children.length > 0
      stateMap[key] = {
        collapsed: node.collapsed,
        forceExpanded: node.forceExpanded,
        hadChildren: hasChildren,
      }
      if (hasChildren) {
        this.captureTreeState(node.children, stateMap)
      }
    })
  }

  private restoreTreeState(nodes: OutlineNode[], stateMap: Record<string, TreeState>) {
    nodes.forEach((node) => {
      const key = `${node.level}_${node.text}`
      const state = stateMap[key]
      if (state) {
        const hasChildrenNow = node.children && node.children.length > 0
        const hadChildrenBefore = state.hadChildren

        // Only restore collapsed state if we didn't go from no-children to children
        if (hadChildrenBefore || !hasChildrenNow) {
          node.collapsed = state.collapsed
        }

        if (state.forceExpanded !== undefined) {
          node.forceExpanded = state.forceExpanded
        }
      }
      if (node.children.length > 0) {
        this.restoreTreeState(node.children, stateMap)
      }
    })
  }

  // Legacy: 使用原始 level (H1-H6) 判断，不是 relativeLevel
  private initializeCollapsedState(nodes: OutlineNode[], displayLevel: number) {
    nodes.forEach((node) => {
      if (node.children && node.children.length > 0) {
        // Legacy: child.level > displayLevel
        const allChildrenHidden = node.children.every((child) => child.level > displayLevel)
        node.collapsed = allChildrenHidden
        this.initializeCollapsedState(node.children, displayLevel)
      } else {
        node.collapsed = false
      }
    })
  }

  // Legacy: 使用原始 level (H1-H6) 判断，不是 relativeLevel
  private clearForceExpandedState(nodes: OutlineNode[], displayLevel: number) {
    nodes.forEach((node) => {
      node.forceExpanded = false
      if (node.children && node.children.length > 0) {
        // Legacy: child.level > displayLevel
        const allChildrenHidden = node.children.every((child) => child.level > displayLevel)
        node.collapsed = allChildrenHidden
        this.clearForceExpandedState(node.children, displayLevel)
      } else {
        node.collapsed = false
      }
    })
  }

  // Actions
  toggleNode(node: OutlineNode) {
    node.collapsed = !node.collapsed
    if (!node.collapsed) {
      node.forceExpanded = true
    }
    this.notify()
  }

  // 折叠全部 (Legacy: toggleExpandAll when isAllExpanded = true)
  collapseAll() {
    // Legacy: collapse to minLevel or 0 if showing user queries
    const targetLevel = this.settings.showUserQueries ? 0 : this.minLevel || 1
    this.setLevel(targetLevel)
  }

  // 展开全部 (Legacy: toggleExpandAll when isAllExpanded = false)
  expandAll() {
    // Legacy: expand to maxActualLevel
    const maxActualLevel = Math.max(...Object.keys(this.levelCounts).map(Number), 1)
    this.setLevel(maxActualLevel)
  }

  // 设置展开层级 (Legacy: setLevel 完全复刻)
  setLevel(level: number) {
    this.expandLevel = level

    // Legacy: clearForceExpandedState 已经正确设置了 collapsed 状态
    // 不再需要额外调用 initializeCollapsedState
    if (this.tree.length > 0) {
      this.clearForceExpandedState(this.tree, level)
    }

    // Update isAllExpanded based on level vs maxActualLevel
    const maxActualLevel = Math.max(...Object.keys(this.levelCounts).map(Number), 1)
    this.isAllExpanded = level >= maxActualLevel

    // Legacy: 如果在搜索状态下调整了 Slider，标记为手动
    if (this.searchQuery) {
      this.searchLevelManual = true
    }

    // 通知父组件保存设置
    if (this.onExpandLevelChange) {
      this.onExpandLevelChange(level)
    }

    this.notify()
  }

  // 设置是否显示用户提问（持久化）
  setShowUserQueries(show: boolean) {
    this.settings.showUserQueries = show

    // 需要重新构建树
    this.refresh()

    // 强制通知界面更新（修复 Bug：如果 tree 内容没变，refresh 会提前返回不通知，导致 UI 按钮状态不更新）
    this.notify()

    // 通知父组件保存设置
    if (this.onShowUserQueriesChange) {
      this.onShowUserQueriesChange(show)
    }
  }

  // 切换显示用户提问模式（UI按钮调用）
  toggleGroupMode() {
    this.setShowUserQueries(!this.settings.showUserQueries)
  }

  // Legacy: expandParents 完全复刻 + 强制可见支持
  // 设置整条路径（包括目标和所有祖先）为 forceVisible
  revealNode(index: number) {
    // 先清除之前的 forceVisible 标记
    const clearForceVisible = (nodes: OutlineNode[]) => {
      nodes.forEach((node) => {
        node.forceVisible = false
        if (node.children && node.children.length > 0) {
          clearForceVisible(node.children)
        }
      })
    }
    clearForceVisible(this.tree)

    // 查找目标并标记整条路径
    const markPath = (
      items: OutlineNode[],
      targetIndex: number,
      parents: OutlineNode[] = [],
    ): boolean => {
      for (const item of items) {
        if (item.index === targetIndex) {
          // 找到目标：标记所有父级 + 目标本身为 forceVisible
          parents.forEach((p) => {
            p.collapsed = false
            p.forceExpanded = true
            p.forceVisible = true
          })
          // 目标节点也标记为 forceVisible
          item.forceVisible = true
          return true
        }
        if (item.children && item.children.length > 0) {
          if (markPath(item.children, targetIndex, [...parents, item])) {
            return true
          }
        }
      }
      return false
    }

    if (markPath(this.tree, index)) {
      this.notify()
    }
  }

  // 清除所有 forceVisible 标记（高亮消失后调用）
  // 只恢复被 revealNode 临时修改过的节点状态，不影响其他手动展开的节点
  clearForceVisible() {
    const clear = (nodes: OutlineNode[]) => {
      nodes.forEach((node) => {
        // 只重置被 forceVisible 标记的节点
        if (node.forceVisible) {
          node.forceVisible = false
          node.forceExpanded = false
          // 根据当前层级设置决定是否折叠
          if (node.children && node.children.length > 0) {
            const hasChildBeyondLevel = node.children.every(
              (child) => child.relativeLevel > this.expandLevel,
            )
            node.collapsed = hasChildBeyondLevel
          }
        }
        if (node.children && node.children.length > 0) {
          clear(node.children)
        }
      })
    }
    clear(this.tree)

    this.notify()
  }

  // Legacy: handleSearch 完全复刻
  setSearchQuery(query: string) {
    if (!query) {
      // === 结束搜索 ===
      // 1. 清理搜索状态
      this.searchQuery = ""
      this.searchLevelManual = false

      // 2. 恢复折叠状态
      if (this.tree.length > 0) {
        // 2.1 恢复搜索前的层级设置
        if (this.preSearchExpandLevel !== null) {
          this.expandLevel = this.preSearchExpandLevel
          this.preSearchExpandLevel = null
        }

        // 2.2 先重置为恢复后的层级状态（兜底）
        const displayLevel = this.expandLevel ?? 6
        this.clearForceExpandedState(this.tree, displayLevel)

        // 2.3 如果有搜索前的状态快照，则恢复它（覆盖默认状态）
        if (this.preSearchState) {
          this.restoreTreeState(this.tree, this.preSearchState)
          this.preSearchState = null // 恢复后清除快照
        }
      }
    } else {
      // === 开始或更新搜索 ===
      // 如果是从无搜索状态进入搜索状态，保存当前快照
      if (!this.searchQuery && this.tree.length > 0) {
        this.preSearchState = {}
        this.captureTreeState(this.tree, this.preSearchState)
        this.preSearchExpandLevel = this.expandLevel // 保存搜索前的层级
      }

      // 每次搜索词变化都要重置折叠状态
      // 这样当用户逐字输入时，之前展开的节点会被正确收起
      if (this.tree.length > 0) {
        this.clearForceExpandedState(this.tree, 0)
      }

      this.searchQuery = query
      this.searchLevelManual = false // Legacy: 重置手动层级标记
      this.performSearch(query)
    }
    this.notify()
  }

  private performSearch(query: string) {
    const normalize = (str: string) => str.toLowerCase()
    const normalizedQuery = normalize(query)
    let matchCount = 0

    const traverse = (nodes: OutlineNode[]): boolean => {
      let hasAnyMatch = false
      nodes.forEach((node) => {
        const isMatch = normalize(node.text).includes(normalizedQuery)
        // Ensure bookmarks are also searchable
        node.isMatch = isMatch

        // 统计逻辑：如果有书签模式，只统计书签相关的匹配项
        if (isMatch) {
          if (this.bookmarkMode) {
            // 重新计算 hasBookmarkDescendant
            const hasBookmarkDescendant = (n: OutlineNode): boolean => {
              if (n.isBookmarked) return true
              return n.children?.some(hasBookmarkDescendant) || false
            }

            // 只有当节点自身是书签，或者它是通往书签的路径时，才算有效结果
            if (node.isBookmarked || hasBookmarkDescendant(node)) {
              matchCount++
            }
          } else {
            matchCount++
          }
        }

        if (node.children.length > 0) {
          // 默认继续向下搜索
          let shouldTraverseChildren = true

          // 特殊策略：书签模式下，如果当前节点本身是书签，但没有后续书签路径
          // （即它是叶子书签，此时它的 children 纯粹是上下文内容）
          // 不应对这些子内容进行搜索
          if (this.bookmarkMode) {
            const hasBookmarkDescendant = (n: OutlineNode): boolean => {
              if (n.isBookmarked) return true
              return n.children?.some(hasBookmarkDescendant) || false
            }

            // 如果节点是书签，且后代没有书签 -> 它是叶子书签 -> 停止搜索子级
            if (node.isBookmarked && !node.children.some(hasBookmarkDescendant)) {
              shouldTraverseChildren = false
            }

            // 如果节点不是书签，也没后代书签 -> 它是无关节点 -> 停止搜索（其实外层UI已经过滤了）
            // 但为了性能，这里也可以停。不过我们主要关注上面那个逻辑。
          }

          if (shouldTraverseChildren) {
            node.hasMatchedDescendant = traverse(node.children)
          } else {
            node.hasMatchedDescendant = false
          }
        } else {
          node.hasMatchedDescendant = false
        }

        if (node.hasMatchedDescendant) {
          node.collapsed = false
        }

        if (isMatch || node.hasMatchedDescendant) {
          hasAnyMatch = true
        }
      })
      return hasAnyMatch
    }

    traverse(this.tree)
    this.matchCount = matchCount
  }

  // Sync Scroll Helper
  // Returns index of the item that should be highlighted
  findVisibleItemIndex(viewportTop: number, viewportBottom: number): number | null {
    // 只有 followMode === 'current' 时才启用同步高亮
    if (this.settings.followMode !== "current") return null

    // 使用内部方法进行搜索，支持重试
    const doSearch = (): { currentItem: OutlineNode | null; invalidCount: number } => {
      // Flatten tree first (in order)
      const flatten = (nodes: OutlineNode[]): OutlineNode[] => {
        const res: OutlineNode[] = []
        nodes.forEach((n) => {
          res.push(n)
          if (n.children.length > 0) {
            res.push(...flatten(n.children))
          }
        })
        return res
      }

      const allItems = flatten(this.tree)

      let currentItem: OutlineNode | null = null
      let invalidCount = 0

      for (const item of allItems) {
        // Skip ghost nodes for scroll tracking
        if (item.isGhost) continue

        let element = item.element

        // 元素失效时使用 siteAdapter 重新查找（支持 Shadow DOM）
        if (!element || !element.isConnected) {
          const found = this.siteAdapter.findElementByHeading(item.level, item.text)
          if (found) {
            element = found as HTMLElement
            item.element = element // 更新引用
          }
        }

        if (!element || !element.isConnected) {
          invalidCount++
          continue
        }

        // We need direct DOM access here. Since this runs in content script, it's allowed.
        const rect = element.getBoundingClientRect()

        if (rect.top >= viewportTop && rect.top < viewportBottom) {
          currentItem = item
          break
        }
        if (rect.top < viewportTop && rect.bottom > viewportTop) {
          currentItem = item
          break
        }
      }

      return { currentItem, invalidCount }
    }

    let result = doSearch()

    // 如果有失效元素且没找到匹配项，立即刷新并重试一次
    if (result.invalidCount > 0 && !result.currentItem) {
      this.refresh() // 立即同步刷新
      result = doSearch() // 重试搜索
    }

    return result.currentItem ? result.currentItem.index : null
  }
}
