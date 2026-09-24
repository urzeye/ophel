import type { OutlineItem, OutlineSource, SiteAdapter } from "~adapters/base"
import { SITE_IDS } from "~constants"
import type { Settings } from "~utils/storage"
import { useBookmarkStore, type Bookmark } from "~stores/bookmarks-store"
import { useSettingsStore } from "~stores/settings-store"
import { showToast } from "~utils/toast"
import { t } from "~utils/i18n"
import {
  EVENT_MONITOR_COMPLETE,
  EVENT_MONITOR_START,
  EVENT_OUTLINE_DATA_UPDATED,
  EVENT_OUTLINE_JUMP_COMPLETED,
} from "~utils/messaging"
import { signalReadingHistoryUserNavigation } from "~utils/reading-history-navigation"
import {
  estimateGroupedVirtualTops,
  type VirtualOutlineSlot,
} from "~utils/virtual-outline-position"

type ExtendedOutlineItem = OutlineItem & {
  isBookmarked?: boolean
  isGhost?: boolean
  bookmarkId?: string
  scrollTop?: number
}

type MeasuredOutlineNode = {
  node: OutlineNode
} & MeasuredOutlineElement

type MeasuredOutlineElement = {
  top: number
  height: number
}

type ScrollViewportRect = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

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
  scrollHeight?: number
}

interface TreeState {
  collapsed: boolean
  forceExpanded?: boolean
  hadChildren: boolean
}

type OutlineActiveConsumer = "outlineTab" | "globalSearch"

/**
 * 增量 djb2 hash 器：逐段混入字符串，避免把全部大纲文本
 * join 成一个长字符串再 hash（长对话每次刷新都会产生大字符串分配）
 */
function createDjb2Mixer() {
  let hash = 5381
  return {
    mix(str: string) {
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
      }
    },
    digest(): string {
      return hash.toString(16).padStart(8, "0")
    },
  }
}

export class OutlineManager {
  private siteAdapter: SiteAdapter
  private settings: Settings["features"]["outline"]

  private tree: OutlineNode[] = []
  private flatItems: OutlineItem[] = []
  private flatNodes: OutlineNode[] = []
  private scrollNodes: OutlineNode[] = []
  private scrollPositions: number[] = []
  private scrollHeights: number[] = []
  private scrollPositionsStale: boolean = true
  private sources: OutlineSource[] = []
  private activeSourceId: string = "conversation"

  // State
  private minLevel: number = 1
  private treeKey: string = ""
  private listeners: (() => void)[] = []
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
  private ghostBookmarkIds: Set<string> = new Set()

  // 生成状态追踪（用于检测生成完成后刷新）
  private wasGenerating: boolean = false
  private postGenerationScheduled: boolean = false // 防止重复触发
  private pendingPostGenerationRefresh: boolean = false // 切 Tab 时暂存待刷新标记

  // 兜底方案：基于内容变化检测
  private lastTreeChangeTime: number = 0
  private fallbackRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private static readonly FALLBACK_DELAY = 3000 // 3秒无变化后触发强制刷新

  // 使用方激活状态（只有至少一个入口需要实时大纲时才监听）
  private isActive: boolean = false
  private activeConsumers = new Set<OutlineActiveConsumer>()

  // 防止 refresh 期间书签更新触发循环调用
  private isRefreshing: boolean = false

  // Global refresh debounce (防止多处同时触发时的重复执行)
  private refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private readonly REFRESH_DEBOUNCE_MS = 300
  // 程序化跳转后的错峰刷新节奏（与 handleUrlChange 同理）：虚拟滚动站点的
  // DOM 换挂载是异步的，单次过早 refresh 会抽到旧 DOM 且因文本未变静默跳过
  private readonly JUMP_REFRESH_DELAYS = [80, 250, 600, 1200]

  // 设置变更回调
  private onExpandLevelChange?: (level: number) => void
  private onShowUserQueriesChange?: (show: boolean) => void

  // 需要手动释放的资源
  private boundHandleMessage = (event: MessageEvent) => this.handleMessage(event)
  private unsubscribeBookmarks: (() => void) | null = null
  private destroyed = false

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
    this.sources = this.normalizeSources(this.siteAdapter.getOutlineSources())

    // 从设置中读取保存的层级
    this.expandLevel = settings.expandLevel ?? 6

    // Listen to monitor messages
    window.addEventListener("message", this.boundHandleMessage)

    // 订阅 bookmarks-store，当书签变化时刷新大纲
    this.unsubscribeBookmarks = useBookmarkStore.subscribe(() => {
      // 只有在激活状态下才刷新，避免不必要的计算
      if (this.isActive) {
        this.refresh()
      }
    })

    // 不在构造函数中启动 auto-update，由 setActive 控制
  }

  // 设置 Tab 激活状态（由 OutlineTab 调用）
  setActive(active: boolean) {
    this.setActiveConsumer("outlineTab", active)
  }

  setGlobalSearchActive(active: boolean) {
    this.setActiveConsumer("globalSearch", active)
  }

  private setActiveConsumer(consumer: OutlineActiveConsumer, active: boolean) {
    const wasActive = this.isActive
    const wasConsumerActive = this.activeConsumers.has(consumer)

    if (active) {
      this.activeConsumers.add(consumer)
    } else {
      this.activeConsumers.delete(consumer)
    }

    this.isActive = this.activeConsumers.size > 0
    this.updateAutoUpdateState()

    const shouldRefreshOnActivation =
      !wasActive || (consumer === "outlineTab" && active && !wasConsumerActive)

    if (!this.isActive || !shouldRefreshOnActivation) return

    // 切回时如果有待处理的生成完成刷新，立即执行
    if (this.pendingPostGenerationRefresh) {
      this.pendingPostGenerationRefresh = false
      this.treeKey = ""
    }

    this.refresh()
  }

  // 根据条件启动/停止自动更新
  private updateAutoUpdateState() {
    // 只有当：大纲功能开启 AND 自动更新开启 AND Tab 处于激活状态 时才启用 Observer
    const shouldEnable = this.shouldEnableAutoUpdate()

    // 避免不必要的 start/stop：只有状态需要变化时才操作
    if (shouldEnable && !this.isAutoUpdating) {
      this.startAutoUpdate()
    } else if (!shouldEnable && this.isAutoUpdating) {
      this.stopAutoUpdate()
    }

    const shouldUsePeriodicFallback = this.shouldEnablePeriodicOutlineRefreshFallback()
    if (shouldUsePeriodicFallback && !this.periodicOutlineRefreshTimer) {
      this.startPeriodicOutlineRefreshFallback()
    } else if (!shouldUsePeriodicFallback && this.periodicOutlineRefreshTimer) {
      this.stopPeriodicOutlineRefreshFallback()
    }

    const shouldObserveSources =
      this.settings.enabled && this.isActive && this.siteAdapter.supportsDynamicOutlineSources()

    if (shouldObserveSources && !this.sourceObserver) {
      this.startSourceObserver()
    } else if (!shouldObserveSources && this.sourceObserver) {
      this.stopSourceObserver()
    }
    // 否则保持当前状态不变
  }

  updateSettings(newSettings: Settings["features"]["outline"]) {
    const updateIntervalChanged = this.settings.updateInterval !== newSettings.updateInterval
    this.settings = newSettings
    if (updateIntervalChanged && this.periodicOutlineRefreshTimer) {
      this.stopPeriodicOutlineRefreshFallback()
    }
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
  private updateDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private periodicOutlineRefreshTimer: ReturnType<typeof setInterval> | null = null
  private sourceObserver: MutationObserver | null = null
  private sourceRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private outlineSourcesSignature: string = ""
  private routeChangeVersion = 0

  private handleMessage(event: MessageEvent) {
    const { type } = event.data || {}

    // 油猴沙箱中 event.source 可能是代理对象而非 window 本身（与 network-monitor
    // 的放宽校验一致）；这两类事件仅触发一次刷新，无安全风险，按类型放行
    if (type === EVENT_OUTLINE_DATA_UPDATED) {
      // 适配器从站外数据源（如 DeepSeek 历史消息接口）补齐了大纲数据
      if (this.isActive) {
        this.refresh()
      }
      return
    }

    if (type === EVENT_OUTLINE_JUMP_COMPLETED) {
      // 程序化跳转完成后错峰刷新：仅当树里存在未挂载且无缓存位置的条目
      // （虚拟滚动 + 外部数据回填）才有意义，普通站点不受影响。
      // 必须用 immediate 绕过全局防抖，否则多次探测会被合并成一次过早的扫描
      if (this.isActive && this.hasPositionlessOutlineNodes()) {
        for (const delay of this.JUMP_REFRESH_DELAYS) {
          setTimeout(() => {
            if (this.destroyed || !this.isActive) return
            this.refresh(undefined, true)
          }, delay)
        }
      }
      return
    }

    if (event.source !== window) return

    if (type === EVENT_MONITOR_START) {
      if (this.settings.autoUpdate) {
        this.startAutoUpdate()
      }
    } else if (type === EVENT_MONITOR_COMPLETE) {
      this.stopAutoUpdate()
      // Final refresh
      this.refresh()
    }
  }

  private shouldEnableAutoUpdate(): boolean {
    return this.settings.enabled && this.settings.autoUpdate && this.isActive
  }

  private shouldEnablePeriodicOutlineRefreshFallback(): boolean {
    return (
      this.shouldEnableAutoUpdate() &&
      this.activeSourceId === "conversation" &&
      this.siteAdapter.usesPeriodicOutlineRefreshFallback()
    )
  }

  private getOutlineUpdateIntervalMs(): number {
    return (this.settings.updateInterval || 2) * 1000
  }

  private startAutoUpdate() {
    if (this.observer || !this.shouldEnableAutoUpdate()) return

    this.isAutoUpdating = true

    this.observer = new MutationObserver(() => {
      this.triggerAutoUpdate()
    })

    // 优先观察适配器指定的容器（比整个 document.body 范围更小），
    // 若适配器未提供则 fallback 到 document.body
    const observeTarget = this.siteAdapter.getObserveTarget() ?? document.body
    this.observer.observe(observeTarget, {
      childList: true,
      subtree: true,
      characterData: false, // 关闭文本变化监听，只监听 DOM 节点的增删，避免 AI 生成时每个字符都触发
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
    // 注意：不清理 refreshDebounceTimer，因为它可能是由其他路径触发的
    // （例如设置更新、书签变化等），清理会导致这些 refresh 丢失
    this.isAutoUpdating = false
  }

  private startPeriodicOutlineRefreshFallback() {
    if (this.periodicOutlineRefreshTimer || !this.shouldEnablePeriodicOutlineRefreshFallback()) {
      return
    }

    this.periodicOutlineRefreshTimer = setInterval(() => {
      if (!this.shouldEnablePeriodicOutlineRefreshFallback()) return
      this.refresh()
    }, this.getOutlineUpdateIntervalMs())
  }

  private stopPeriodicOutlineRefreshFallback() {
    if (!this.periodicOutlineRefreshTimer) return

    clearInterval(this.periodicOutlineRefreshTimer)
    this.periodicOutlineRefreshTimer = null
  }

  private startSourceObserver() {
    if (this.sourceObserver) return

    this.outlineSourcesSignature = this.siteAdapter.getOutlineSourcesSignature()

    this.sourceObserver = new MutationObserver(() => {
      if (this.sourceRefreshTimer) return
      this.sourceRefreshTimer = setTimeout(() => {
        this.sourceRefreshTimer = null
        const nextSignature = this.siteAdapter.getOutlineSourcesSignature()
        if (nextSignature !== this.outlineSourcesSignature) {
          this.outlineSourcesSignature = nextSignature
          this.refresh()
        }
      }, 500)
    })

    this.sourceObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  private stopSourceObserver() {
    if (this.sourceObserver) {
      this.sourceObserver.disconnect()
      this.sourceObserver = null
    }
    if (this.sourceRefreshTimer) {
      clearTimeout(this.sourceRefreshTimer)
      this.sourceRefreshTimer = null
    }
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
        if (!this.isActive) {
          // Tab 已切走，标记为待刷新，切回时再执行
          this.pendingPostGenerationRefresh = true
          return
        }
        // 清空 treeKey 强制重建树，获取新的 DOM 元素引用
        this.treeKey = ""
        this.refresh()
      }, 500)
    }

    this.wasGenerating = isGenerating

    // 记录当前 treeKey 用于检测变化
    const oldTreeKey = this.treeKey
    this.refresh(undefined, true) // immediate = true，确保 fallback 检测逻辑正常工作

    // 兜底方案：检测内容变化
    if (this.treeKey !== oldTreeKey) {
      // 有新内容，记录时间并重置计时器
      this.lastTreeChangeTime = Date.now()
      if (this.fallbackRefreshTimer) {
        clearTimeout(this.fallbackRefreshTimer)
      }
      // 记录触发 timer 时的 treeKey，用于判断后续是否已自然更新
      const keyAtSchedule = this.treeKey
      // 设置兜底计时器：如果 3 秒内没有新变化，触发强制刷新
      this.fallbackRefreshTimer = setTimeout(() => {
        this.fallbackRefreshTimer = null
        // 确保确实 3 秒没有变化
        if (Date.now() - this.lastTreeChangeTime >= OutlineManager.FALLBACK_DELAY - 100) {
          // 只有 treeKey 没有自然更新时才强制重建，避免打断正常状态恢复
          if (this.treeKey === keyAtSchedule) {
            this.treeKey = "" // 强制重建
            this.refresh()
          }
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

  // 释放全部外部资源：面板卸载或适配器切换后必须调用，避免泄漏监听与计时器
  destroy() {
    if (this.destroyed) return
    this.destroyed = true

    window.removeEventListener("message", this.boundHandleMessage)
    this.unsubscribeBookmarks?.()
    this.unsubscribeBookmarks = null

    this.stopAutoUpdate()
    this.stopPeriodicOutlineRefreshFallback()
    this.stopSourceObserver()

    if (this.refreshDebounceTimer) {
      clearTimeout(this.refreshDebounceTimer)
      this.refreshDebounceTimer = null
    }
    if (this.fallbackRefreshTimer) {
      clearTimeout(this.fallbackRefreshTimer)
      this.fallbackRefreshTimer = null
    }

    this.listeners = []
    this.activeConsumers.clear()
    this.isActive = false
  }

  private notify() {
    this.listeners.forEach((l) => l())
  }

  private normalizeSources(sources: OutlineSource[]): OutlineSource[] {
    const normalized = sources.filter((source) => source.available)
    if (normalized.length > 0) return normalized
    return [{ id: "conversation", kind: "conversation", label: "对话", available: true }]
  }

  private updateSources(): boolean {
    const nextSources = this.normalizeSources(this.siteAdapter.getOutlineSources())
    const nextKey = nextSources
      .map((source) => `${source.id}:${source.kind}:${source.label}:${source.count ?? ""}`)
      .join("|")
    const currentKey = this.sources
      .map((source) => `${source.id}:${source.kind}:${source.label}:${source.count ?? ""}`)
      .join("|")

    this.sources = nextSources

    if (!this.sources.some((source) => source.id === this.activeSourceId)) {
      this.activeSourceId = this.sources[0]?.id ?? "conversation"
      this.treeKey = ""
    }

    return nextKey !== currentKey
  }

  getBookmarkSessionId(sourceId = this.activeSourceId): string {
    const sessionId = this.siteAdapter.getSessionId()
    if (sourceId === "conversation") return sessionId
    return `${sessionId}::${sourceId}`
  }

  getTree(): OutlineNode[] {
    return this.tree
  }

  /**
   * 获取扁平化的大纲项列表
   * 供 InlineBookmarkManager 使用
   */
  getFlatItems(): OutlineItem[] {
    return this.flatItems
  }

  getSources(): OutlineSource[] {
    return this.sources
  }

  getActiveSourceId(): string {
    return this.activeSourceId
  }

  setActiveSource(sourceId: string): void {
    if (sourceId === this.activeSourceId) return

    const target = this.sources.find((source) => source.id === sourceId && source.available)
    if (!target) return

    this.activeSourceId = sourceId
    this.tree = []
    this.flatItems = []
    this.flatNodes = []
    this.scrollNodes = []
    this.scrollPositions = []
    this.scrollHeights = []
    this.scrollPositionsStale = true
    this.treeKey = ""
    this.preSearchState = null
    this.preSearchExpandLevel = null
    this.searchLevelManual = false
    this.matchCount = 0

    // 若切换到非对话源（如文档源），且当前 expandLevel 为 0（在对话中代表“仅用户提问”）
    // 由于文档源中不存在用户提问节点，保留 0 级会导致文档所有标题被隐藏而呈现空状态，因此重置为默认展开级别 6
    if (target.kind === "document" || sourceId !== "conversation") {
      if (this.expandLevel === 0) {
        this.expandLevel = 6
      }
    }

    this.updateAutoUpdateState()
    this.refresh()
    this.notify()
  }

  /**
   * 获取大纲项的签名（用于书签标识）
   * 供 InlineBookmarkManager 使用
   */
  getSignature(item: OutlineItem, sourceId = this.activeSourceId): string {
    return this.generateSignature(item, sourceId)
  }

  getSearchQuery() {
    return this.searchQuery
  }

  getScrollContainer(): HTMLElement | null {
    return this.siteAdapter.getOutlineScrollContainer(this.activeSourceId)
  }

  markScrollPositionsStale() {
    this.scrollPositionsStale = true
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

  async resolveOutlineTarget(
    item: Pick<OutlineItem, "level" | "text" | "isUserQuery" | "id" | "navigationId">,
    queryIndex?: number,
  ): Promise<Element | null> {
    return this.siteAdapter.resolveOutlineTarget(item, queryIndex, this.activeSourceId)
  }

  scrollToOutlineTarget(element: HTMLElement): void {
    signalReadingHistoryUserNavigation()
    this.siteAdapter.scrollToOutlineSourceTarget(element, this.activeSourceId)
  }

  scrollToOutlinePosition(position: number, behavior: ScrollBehavior = "smooth"): boolean {
    const container = this.getScrollContainer()
    if (!container) return false

    signalReadingHistoryUserNavigation()
    container.scrollTo({ top: position, behavior })
    return true
  }

  getState() {
    // 检查当前树或扁平节点中是否存在用户提问节点
    const hasUserQueries =
      this.activeSourceId === "conversation" &&
      (this.tree.some((node) => node.isUserQuery) ||
        this.flatNodes.some((node) => node.isUserQuery))
    // 根据是否开启用户提问且当前源实际包含用户提问，确定 minRelativeLevel
    const minRelativeLevel = this.settings.showUserQueries && hasUserQueries ? 0 : 1

    // 计算 displayLevel (Legacy logic)
    let displayLevel: number
    if (this.searchQuery && !this.searchLevelManual) {
      displayLevel = 100 // 足够大以显示所有
    } else {
      displayLevel = this.expandLevel ?? 6
    }
    // 限制最小值：若当前源不支持用户提问，最小显示级别强制为 1
    const minDisplayLevel = this.settings.showUserQueries && hasUserQueries ? 0 : 1
    if (displayLevel < minDisplayLevel) {
      displayLevel = minDisplayLevel
    }

    return {
      tree: this.tree,
      expandLevel: this.expandLevel,
      levelCounts: this.levelCounts,
      isAllExpanded: this.isAllExpanded,
      // 开关状态只反映设置值；当前源是否有用户提问仅影响层级钳制，
      // 否则在无用户提问的页面按钮会恒为未选中且点击看似无响应
      includeUserQueries: this.settings.showUserQueries,
      minRelativeLevel,
      displayLevel,
      searchLevelManual: this.searchLevelManual,
      matchCount: this.matchCount,
      bookmarkMode: this.bookmarkMode,
      sources: this.sources,
      activeSourceId: this.activeSourceId,
    }
  }

  getGhostBookmarkIds(): string[] {
    return Array.from(this.ghostBookmarkIds)
  }

  clearGhostBookmarks(): number {
    const ids = this.getGhostBookmarkIds()
    if (ids.length === 0) return 0
    const store = useBookmarkStore.getState()
    ids.forEach((id) => store.removeBookmark(id))
    this.ghostBookmarkIds.clear()
    this.refresh()
    return ids.length
  }

  // --- Bookmark Logic ---

  private generateSignature(item: OutlineItem, sourceId = this.activeSourceId): string {
    // 1. 优先使用稳定 ID (message-id)
    if (item.id) {
      return sourceId === "conversation" ? item.id : `${sourceId}:${item.id}`
    }

    // 2. 回退方案 (text::context)
    let context = ""

    // 优先使用 Adapter 显式提供的上下文 (例如 AI Studio 的 Next Turn Preview)
    if (item.context) {
      context = item.context
    } else {
      // 否则尝试从 DOM 获取下一个兄弟节点的文本
      try {
        if (item.element?.nextElementSibling) {
          context = (item.element.nextElementSibling.textContent || "").trim().substring(0, 50)
        }
      } catch {
        // Ignore
      }
    }

    const signature = `${item.text}::${context}`
    return sourceId === "conversation" ? signature : `${sourceId}:${signature}`
  }

  // Helper public method for UI
  toggleBookmark(node: OutlineNode) {
    const sessionId = this.getBookmarkSessionId()
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
  refresh(overrideLevel?: number, immediate = false) {
    if (this.destroyed || !this.settings.enabled || this.isRefreshing) return

    // immediate = true: 立即执行（用于 fallback 检测和路由切换）
    // immediate = false: 防抖执行（用于书签、设置变更等）
    if (immediate) {
      // 取消待执行的防抖 refresh
      if (this.refreshDebounceTimer) {
        clearTimeout(this.refreshDebounceTimer)
        this.refreshDebounceTimer = null
      }
      this.isRefreshing = true
      try {
        this._doRefresh(overrideLevel)
      } finally {
        this.isRefreshing = false
      }
      return
    }

    // 全局防抖：300ms 内的多次 refresh 调用合并为一次
    if (this.refreshDebounceTimer) {
      clearTimeout(this.refreshDebounceTimer)
    }

    this.refreshDebounceTimer = setTimeout(() => {
      this.refreshDebounceTimer = null
      // 再次检查 enabled 状态（可能在等待期间被禁用）
      if (!this.settings.enabled || this.isRefreshing) return
      this.isRefreshing = true
      try {
        this._doRefresh(overrideLevel)
      } finally {
        this.isRefreshing = false
      }
    }, this.REFRESH_DEBOUNCE_MS)
  }

  /**
   * SPA 路由变化时调用：立即清空当前 tree，避免 UI 上一闪而过的旧对话大纲；
   * 然后用几次错峰 refresh 适配 ChatGPT 等站点 DOM 切换的异步性
   * （pushState 是同步的，但 React 重新渲染新对话的 DOM 是异步的——
   * 立即 refresh 抓到的还是旧 DOM，所以排几个延迟点）。
   */
  handleUrlChange(): void {
    const routeVersion = ++this.routeChangeVersion

    // 取消所有待执行的 refresh（包括防抖的），避免旧路由的 refresh 在新路由渲染后触发
    if (this.refreshDebounceTimer) {
      clearTimeout(this.refreshDebounceTimer)
      this.refreshDebounceTimer = null
    }

    if (this.isAutoUpdating) {
      this.stopAutoUpdate()
    }
    this.stopPeriodicOutlineRefreshFallback()

    this.tree = []
    this.flatItems = []
    this.flatNodes = []
    this.scrollNodes = []
    this.scrollPositions = []
    this.scrollHeights = []
    this.scrollPositionsStale = true
    this.treeKey = ""
    this.levelCounts = {}
    this.notify()
    // 几次延迟 refresh：覆盖站点从慢到快的 DOM 渲染节奏
    // 所有 refresh 都延迟执行，避免扫描到旧 DOM
    // 使用 immediate=true 避免被防抖合并，确保每个探测都能执行
    const delays = [80, 250, 600, 1200]
    delays.forEach((delay, index) => {
      setTimeout(() => {
        if (routeVersion !== this.routeChangeVersion) return

        this.refresh(undefined, true)

        if (index === delays.length - 1) {
          this.updateAutoUpdateState()
        }
      }, delay)
    })
  }

  private _doRefresh(overrideLevel?: number) {
    const sourcesChanged = this.updateSources()

    // Read showWordCount from live settings store to pick up changes without page refresh
    const liveSettings = useSettingsStore.getState().settings
    const showWordCount = liveSettings?.features?.outline?.showWordCount ?? false

    let outlineData = this.siteAdapter.extractOutlineForSource(
      this.activeSourceId,
      this.settings.maxLevel,
      this.settings.showUserQueries,
      showWordCount,
    )
    // --- Merge Bookmarks ---
    const sessionId = this.getBookmarkSessionId()
    const bookmarks = useBookmarkStore.getState().getBookmarksBySession(sessionId)
    this.ghostBookmarkIds = new Set()

    if (bookmarks.length > 0) {
      const bookmarkById = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]))
      const bookmarksBySignature = new Map<string, Map<string, Bookmark>>()
      bookmarks.forEach((bookmark) => {
        let bookmarksByTitle = bookmarksBySignature.get(bookmark.signature)
        if (!bookmarksByTitle) {
          bookmarksByTitle = new Map()
          bookmarksBySignature.set(bookmark.signature, bookmarksByTitle)
        }
        // Preserve Array.find semantics if duplicate bookmarks share signature + title.
        if (!bookmarksByTitle.has(bookmark.title)) {
          bookmarksByTitle.set(bookmark.title, bookmark)
        }
      })
      const unmatchedBookmarkIds = new Set(bookmarks.map((b) => b.id))

      outlineData.forEach((item) => {
        const signature = this.generateSignature(item)
        const bookmark = bookmarksBySignature.get(signature)?.get(item.text)

        if (bookmark) {
          ;(item as OutlineNode).isBookmarked = true
          ;(item as OutlineNode).bookmarkId = bookmark.id
          unmatchedBookmarkIds.delete(bookmark.id)
        }
      })

      // --- Ghost Reclamation (保守修复策略) ---
      // 尝试将无法匹配的幽灵书签（unmatchedBookmarkIds）自动“过继”给当前未收藏的新条目
      // 仅当满足 "Unique-to-Unique" 条件时执行：
      // 即：该文本在幽灵列表中只有 1 个，且在当前未收藏列表中也只有 1 个

      // 1. 收集候选者
      const ghostCandidates: Record<string, string[]> = {} // text -> [bookmarkId]
      const targetCandidates: Record<string, OutlineItem[]> = {} // text -> [Item]

      // 收集幽灵
      unmatchedBookmarkIds.forEach((bid) => {
        const bookmark = bookmarkById.get(bid)
        if (bookmark) {
          if (!ghostCandidates[bookmark.title]) ghostCandidates[bookmark.title] = []
          ghostCandidates[bookmark.title].push(bookmark.id)
        }
      })

      // 收集目标（未被收藏的条目）
      outlineData.forEach((item) => {
        if (!(item as OutlineNode).isBookmarked) {
          if (!targetCandidates[item.text]) targetCandidates[item.text] = []
          targetCandidates[item.text].push(item)
        }
      })

      // 2. 执行匹配与修复
      const store = useBookmarkStore.getState()

      Object.keys(ghostCandidates).forEach((text) => {
        const ghosts = ghostCandidates[text]
        const targets = targetCandidates[text]

        // 仅当 1 对 1 时才进行修复
        if (ghosts && targets && ghosts.length === 1 && targets.length === 1) {
          const bookmarkId = ghosts[0]
          const targetItem = targets[0]

          // 计算新的签名（这是它现在的“合法身份”）
          const newSignature = this.generateSignature(targetItem)

          // 更新数据库：把旧书签的签名改为新的
          // 注意：这里需要确保 updateBookmark 存在且支持只更新 signature
          // 假设 store.updateBookmark(id, { signature: ... })
          store.updateBookmark(bookmarkId, { signature: newSignature })

          // 标记当前条目为已收藏
          ;(targetItem as OutlineNode).isBookmarked = true
          ;(targetItem as OutlineNode).bookmarkId = bookmarkId

          // 从幽灵名单中剔除
          unmatchedBookmarkIds.delete(bookmarkId)
        }
      })
      // -----------------------------------
      this.ghostBookmarkIds = new Set(unmatchedBookmarkIds)

      // 2. Insert Ghost Nodes
      const ghosts: OutlineItem[] = []
      unmatchedBookmarkIds.forEach((bid) => {
        const bookmark = bookmarkById.get(bid)
        if (bookmark) {
          // 过滤：如果是 0 级节点（用户提问）且不展示用户提问，跳过
          if (bookmark.level === 0 && !this.settings.showUserQueries) {
            return
          }
          ghosts.push({
            level: bookmark.level,
            text: bookmark.title,
            element: null, // Ghost nodes have no element
            isUserQuery: bookmark.level === 0, // 0 级节点即用户提问
            // Custom props
            isBookmarked: true,
            isGhost: true,
            bookmarkId: bookmark.id,
            // Helper for sorting
            scrollTop: bookmark.scrollTop,
          } as ExtendedOutlineItem)
        }
      })

      if (ghosts.length > 0) {
        // Calculate offsets for real items to sort
        const getTop = (item: ExtendedOutlineItem) => {
          if (item.isGhost) return item.scrollTop
          if (item.element instanceof HTMLElement) return item.element.offsetTop
          return 0
        }

        // Merge and sort
        outlineData = [...outlineData, ...ghosts].sort((a, b) => getTop(a) - getTop(b))
      }
    }

    if (outlineData.length === 0) {
      if (this.tree.length > 0) {
        this.tree = []
        this.flatNodes = []
        this.scrollNodes = []
        this.scrollPositions = []
        this.scrollHeights = []
        this.scrollPositionsStale = true
        this.notify()
      } else if (sourcesChanged) {
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
    const showWordCountFlag = showWordCount ? "wc:1" : "wc:0"
    const sessionIdForKey = this.siteAdapter.getSessionId() || "no-session"
    const pathname = typeof window !== "undefined" ? window.location.pathname : ""
    const sessionScopeKey = `${this.siteAdapter.getSiteId()}:${sessionIdForKey}:${pathname}:${this.activeSourceId}`
    const mixer = createDjb2Mixer()
    mixer.mix(sessionScopeKey)
    mixer.mix("|")
    mixer.mix(showWordCountFlag)
    outlineData.forEach((i) => {
      mixer.mix("|")
      mixer.mix(i.text)
      mixer.mix(":")
      mixer.mix(String((i as ExtendedOutlineItem).isBookmarked))
    })
    const outlineKey = mixer.digest()
    const currentStateMap: Record<string, TreeState> = {}
    if (this.tree.length > 0) {
      this.captureTreeState(this.tree, currentStateMap)
    }

    // Always rebuild if overrideLevel is provided to ensure state is reset
    if (this.treeKey !== outlineKey || this.tree.length === 0 || overrideLevel !== undefined) {
      this.tree = this.buildTree(outlineData, this.minLevel)
      this.treeKey = outlineKey
      // 保存扁平化数据供 InlineBookmarkManager 使用
      this.flatItems = outlineData
      this.flatNodes = this.flattenTree(this.tree)
      this.updateScrollPositions()
    } else {
      const runtimeDataChanged = this.syncFlatNodeRuntimeData(outlineData)
      this.scrollPositionsStale = true
      if (runtimeDataChanged) {
        this.notify()
      } else if (sourcesChanged) {
        this.notify()
      }
      return
    }

    // Restore state
    const displayLevel = overrideLevel !== undefined ? overrideLevel : this.expandLevel ?? 6
    this.expandLevel = displayLevel

    const hasUserQueries =
      this.activeSourceId === "conversation" && outlineData.some((i) => i.isUserQuery)
    const minDisplayLevel = this.settings.showUserQueries && hasUserQueries ? 0 : 1
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

    // 收藏模式逻辑：如果当前处于收藏模式，需要确保树的折叠状态符合收藏模式的要求
    // 折叠所有非路径节点，展开收藏路径
    if (this.bookmarkMode) {
      // this.collapseAllExpandedState(this.tree)

      // 再展开收藏路径 (Re-apply traversal)
      this.expandBookmarkPaths(this.tree)
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
      // Inherit bookmark props from merged item
      const extItem = item as ExtendedOutlineItem
      if (extItem.isBookmarked) node.isBookmarked = true
      if (extItem.isGhost) node.isGhost = true
      if (extItem.bookmarkId) node.bookmarkId = extItem.bookmarkId

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

  private syncFlatNodeRuntimeData(outline: OutlineItem[]): boolean {
    let changed = this.flatItems.length !== outline.length
    this.flatItems = outline

    outline.forEach((item, index) => {
      const node = this.flatNodes[index]
      if (!node) {
        changed = true
        return
      }

      const extItem = item as ExtendedOutlineItem

      if (
        node.element !== item.element ||
        node.id !== item.id ||
        node.navigationId !== item.navigationId ||
        node.context !== item.context ||
        node.wordCount !== item.wordCount ||
        node.isTruncated !== item.isTruncated ||
        node.isUserQuery !== item.isUserQuery ||
        node.isBookmarked !== extItem.isBookmarked ||
        node.isGhost !== extItem.isGhost ||
        node.bookmarkId !== extItem.bookmarkId ||
        (extItem.scrollTop !== undefined && node.scrollTop !== extItem.scrollTop)
      ) {
        changed = true
      }

      node.element = item.element
      node.id = item.id
      node.navigationId = item.navigationId
      node.context = item.context
      node.wordCount = item.wordCount
      node.isTruncated = item.isTruncated
      node.isUserQuery = item.isUserQuery
      node.isBookmarked = extItem.isBookmarked
      node.isGhost = extItem.isGhost
      node.bookmarkId = extItem.bookmarkId

      if (extItem.scrollTop !== undefined) {
        node.scrollTop = extItem.scrollTop
      }
    })

    return changed
  }

  // Flatten tree in pre-order to match outline order
  private flattenTree(nodes: OutlineNode[]): OutlineNode[] {
    const res: OutlineNode[] = []
    const traverse = (list: OutlineNode[]) => {
      list.forEach((n) => {
        res.push(n)
        if (n.children.length > 0) {
          traverse(n.children)
        }
      })
    }
    traverse(nodes)
    return res
  }

  // Update cached scroll positions for fast highlight lookup
  updateScrollPositions() {
    this.scrollNodes = []
    this.scrollPositions = []
    this.scrollHeights = []

    const container = this.getScrollContainer()
    if (!container || this.flatNodes.length === 0) return

    const isDocumentContainer = this.isDocumentScrollContainer(container)
    const containerRect = isDocumentContainer ? null : container.getBoundingClientRect()
    const containerTop = containerRect?.top ?? 0
    const doc = container.ownerDocument
    const containerScrollTop = isDocumentContainer
      ? container.scrollTop ||
        doc.documentElement.scrollTop ||
        doc.body.scrollTop ||
        doc.defaultView?.scrollY ||
        0
      : container.scrollTop
    const entries: Array<{ node: OutlineNode; top: number; height: number; order: number }> = []
    const measuredElements = new WeakMap<Element, MeasuredOutlineElement | null>()
    let order = 0

    const pushCachedEntry = (node: OutlineNode): boolean => {
      const cachedTop = node.scrollTop
      if (typeof cachedTop !== "number" || Number.isNaN(cachedTop)) {
        return false
      }

      const cachedHeight =
        typeof node.scrollHeight === "number" && !Number.isNaN(node.scrollHeight)
          ? node.scrollHeight
          : 0

      entries.push({ node, top: cachedTop, height: cachedHeight, order })
      order += 1
      return true
    }

    const measureElement = (element: Element): MeasuredOutlineElement | null => {
      const cached = measuredElements.get(element)
      if (cached !== undefined) return cached

      const clientRects = element.getClientRects()
      if (clientRects.length === 0) {
        measuredElements.set(element, null)
        return null
      }

      let top = clientRects[0].top
      let bottom = clientRects[0].bottom
      for (let i = 1; i < clientRects.length; i += 1) {
        const rect = clientRects[i]
        top = Math.min(top, rect.top)
        bottom = Math.max(bottom, rect.bottom)
      }

      const measured = {
        top: top - containerTop + containerScrollTop,
        height: Math.max(0, bottom - top),
      }
      measuredElements.set(element, measured)
      return measured
    }

    this.flatNodes.forEach((node) => {
      if (node.isGhost) return

      // 虚拟列表卸载的节点保留坐标；新 DOM 引用由大纲刷新统一更新。
      // 在滚动热路径逐项重新查询整页，会把长历史放大成 O(n²) 的扫描。
      const element = node.element

      if (!element || !element.isConnected) {
        pushCachedEntry(node)
        return
      }

      const measured = measureElement(element)
      if (!measured) {
        pushCachedEntry(node)
        return
      }

      node.scrollTop = measured.top
      node.scrollHeight = measured.height

      entries.push({ node, top: measured.top, height: measured.height, order })
      order += 1
    })

    if (entries.length === 0) {
      this.scrollPositionsStale = false
      return
    }

    let isSorted = true
    for (let i = 1; i < entries.length; i += 1) {
      if (entries[i].top < entries[i - 1].top) {
        isSorted = false
        break
      }
    }

    if (!isSorted) {
      entries.sort((a, b) => {
        if (a.top === b.top) return a.order - b.order
        return a.top - b.top
      })
    }

    entries.forEach((entry) => {
      this.scrollNodes.push(entry.node)
      this.scrollPositions.push(entry.top)
      this.scrollHeights.push(entry.height)
    })

    this.scrollPositionsStale = false
  }

  // State Management
  private captureTreeState(nodes: OutlineNode[], stateMap: Record<string, TreeState>) {
    nodes.forEach((node) => {
      // 优先使用稳定 ID 避免同文本同级标题 key 碰撞
      const key = node.id ? `id:${node.id}` : `${node.level}_${node.text}`
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
      // 与 captureTreeState 保持相同的 key 生成逻辑
      const key = node.id ? `id:${node.id}` : `${node.level}_${node.text}`
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

  // 使用原始 level (H1-H6) 判断，而非 relativeLevel
  private initializeCollapsedState(nodes: OutlineNode[], displayLevel: number) {
    nodes.forEach((node) => {
      if (node.children && node.children.length > 0) {
        // 检查子节点层级是否超过当前显示层级
        const allChildrenHidden = node.children.every((child) => child.level > displayLevel)
        node.collapsed = allChildrenHidden
        this.initializeCollapsedState(node.children, displayLevel)
      } else {
        node.collapsed = false
      }
    })
  }

  // 使用原始 level (H1-H6) 判断，而非 relativeLevel
  private clearForceExpandedState(nodes: OutlineNode[], displayLevel: number) {
    nodes.forEach((node) => {
      node.forceExpanded = false
      if (node.children && node.children.length > 0) {
        // 检查子节点层级是否超过当前显示层级
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

  // 折叠全部
  collapseAll() {
    // 折叠到最小层级（如果显示用户提问则折叠到 0）
    const targetLevel = this.settings.showUserQueries ? 0 : this.minLevel || 1
    this.setLevel(targetLevel)
  }

  // 展开全部
  expandAll() {
    // 展开到当前存在的最大层级
    const maxActualLevel = Math.max(...Object.keys(this.levelCounts).map(Number), 1)
    this.setLevel(maxActualLevel)
  }

  // 设置展开层级
  setLevel(level: number) {
    // 收藏模式下禁用层级调整
    if (this.bookmarkMode) {
      showToast(t("bookmarkModeDisableLevel"))
      return
    }

    this.expandLevel = level

    // 重置并按层级更新折叠状态
    if (this.tree.length > 0) {
      this.clearForceExpandedState(this.tree, level)
    }

    // Update isAllExpanded based on level vs maxActualLevel
    const maxActualLevel = Math.max(...Object.keys(this.levelCounts).map(Number), 1)
    this.isAllExpanded = level >= maxActualLevel

    // 如果在搜索状态下调整了层级滑块，标记为手动层级
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

  // 展开并设置整条路径（包括目标和所有祖先）为 forceVisible
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
          // 根据当前层级设置决定是否折叠；
          // 与 initializeCollapsedState / clearForceExpandedState 保持一致，
          // 必须用原始 level 而非 relativeLevel 比较，
          // 否则标题从 H2/H3 起始的文档（minLevel > 1）恢复后会错误保持展开
          if (node.children && node.children.length > 0) {
            const allChildrenHidden = node.children.every((child) => child.level > this.expandLevel)
            node.collapsed = allChildrenHidden
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
      this.searchLevelManual = false // 重置手动层级标记
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

  findVisibleItemIndex(scrollTop: number, viewportHeight: number): number | null {
    return this.findVisibleItemNode(scrollTop, viewportHeight)?.index ?? null
  }

  private findVisibleItemNode(scrollTop: number, viewportHeight: number): OutlineNode | null {
    // Only active when followMode === "current"
    if (this.settings.followMode !== "current") return null

    if (this.scrollPositionsStale) {
      this.updateScrollPositions()
    }

    const count = this.scrollNodes.length
    if (count === 0) return null

    const top = scrollTop
    const bottom = scrollTop + viewportHeight

    // Binary search: last item with top <= viewportTop
    let lo = 0
    let hi = count - 1
    let idx = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this.scrollPositions[mid] <= top) {
        idx = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    if (idx >= 0) {
      const itemTop = this.scrollPositions[idx]
      const itemHeight = this.scrollHeights[idx] || 0
      if (itemTop < bottom && (itemHeight === 0 || itemTop + itemHeight > top)) {
        return this.scrollNodes[idx]
      }
      if (idx + 1 < count && this.scrollPositions[idx + 1] < bottom) {
        return this.scrollNodes[idx + 1]
      }
      if (this.shouldKeepPreviousVisibleItem()) {
        // DeepSeek / Z.ai often have long content gaps between headings.
        // In that gap, keep the nearest previous heading highlighted instead of dropping to null.
        return this.scrollNodes[idx]
      }
      return null
    }

    if (this.scrollPositions[0] < bottom) {
      return this.scrollNodes[0]
    }

    return null
  }

  findMountedActiveItemIndex(scrollContainer: HTMLElement): number | null {
    return this.findMountedActiveNode(scrollContainer)?.index ?? null
  }

  // 树里是否存在既未挂载又无缓存滚动位置的回填条目。仅限声明了
  // traits.virtualOutlineFill 的站点（DeepSeek、Claude）。未声明的缓存回填
  // 恒为 false，避免把跳转后的即时刷新扩到不需要它的站点。
  hasPositionlessOutlineNodes(): boolean {
    if (!this.usesVirtualOutlineFill()) return false
    return this.flatNodes.some(
      (node) => !node.isGhost && !node.element && typeof node.scrollTop !== "number",
    )
  }

  /**
   * 虚拟滚动站点没有可用的离屏坐标。当前视口量不到标题时保留上一次高亮，
   * 不能把缓存 scrollTop 投影回视口，否则卸载条目会和屏幕上的条目抢高亮。
   */
  holdsVirtualHighlight(): boolean {
    return this.usesVirtualOutlineFill()
  }

  /** 树重建后按对象身份或稳定 id 找回同一条，避免沿用已经错位的 index。 */
  findRetainedOutlineNode(previous: OutlineNode | null): OutlineNode | null {
    if (!previous) return null
    if (this.flatNodes.includes(previous)) return previous
    if (!previous.id) return null
    return this.flatNodes.find((node) => node.id === previous.id) ?? null
  }

  private usesVirtualOutlineFill(): boolean {
    return this.siteAdapter.usesVirtualOutlineFill?.() ?? false
  }

  /**
   * 只比较本帧仍挂在视口里的节点。API 回填条目和已卸载条目没有视觉坐标，
   * 不参与高亮；一个都没有时返回 null，由调用方保持上一次结果。
   */
  private findLiveVirtualActiveNode(scrollContainer: HTMLElement): OutlineNode | null {
    const viewportRect = this.getScrollViewportRect(scrollContainer)
    if (!viewportRect) return null

    const anchorY = viewportRect.top + Math.min(Math.max(viewportRect.height * 0.25, 48), 160)
    const live: MeasuredOutlineNode[] = []

    const measureElement = (element: Element): MeasuredOutlineElement | null => {
      const clientRects = element.getClientRects()
      if (clientRects.length === 0) return null

      let top = clientRects[0].top
      let bottom = clientRects[0].bottom
      for (let i = 1; i < clientRects.length; i += 1) {
        const rect = clientRects[i]
        top = Math.min(top, rect.top)
        bottom = Math.max(bottom, rect.bottom)
      }

      const height = Math.max(0, bottom - top)
      if (height <= 0) return null
      return { top, height }
    }

    for (const node of this.flatNodes) {
      if (node.isGhost) continue
      const element = node.element
      if (!element?.isConnected) continue

      const measured = measureElement(element)
      if (!measured) continue
      const bottom = measured.top + measured.height
      if (bottom <= viewportRect.top || measured.top >= viewportRect.bottom) continue
      live.push({ node, ...measured })
    }

    if (live.length === 0) {
      return this.findEstimatedVirtualActiveNode(scrollContainer, viewportRect, anchorY)
    }

    let activeUserQuery: MeasuredOutlineNode | null = null
    let latestUserQueryBeforeAnchor: MeasuredOutlineNode | null = null
    for (const query of live) {
      if (!query.node.isUserQuery) continue
      const bottom = query.top + query.height
      if (query.top <= anchorY && bottom > anchorY) {
        if (!activeUserQuery || query.top > activeUserQuery.top) {
          activeUserQuery = query
        }
      }
      if (
        query.top <= anchorY &&
        (!latestUserQueryBeforeAnchor || query.top > latestUserQueryBeforeAnchor.top)
      ) {
        latestUserQueryBeforeAnchor = query
      }
    }

    if (activeUserQuery) return activeUserQuery.node

    let activeHeading: MeasuredOutlineNode | null = null
    let nextVisibleHeading: MeasuredOutlineNode | null = null
    for (const heading of live) {
      if (heading.node.isUserQuery) continue
      const bottom = heading.top + heading.height
      if (heading.top <= anchorY) {
        if (!activeHeading || heading.top > activeHeading.top) {
          activeHeading = heading
        }
      } else if (heading.top < viewportRect.bottom && bottom > viewportRect.top) {
        if (!nextVisibleHeading || heading.top < nextVisibleHeading.top) {
          nextVisibleHeading = heading
        }
      }
    }

    if (
      latestUserQueryBeforeAnchor &&
      (!activeHeading || activeHeading.top < latestUserQueryBeforeAnchor.top)
    ) {
      const firstHeading = this.findFirstHeadingInUserQuerySection(latestUserQueryBeforeAnchor.node)
      const liveFirst = firstHeading
        ? live.find((item) => item.node === firstHeading && item.top <= anchorY)
        : undefined
      return liveFirst?.node ?? latestUserQueryBeforeAnchor.node
    }

    return activeHeading?.node ?? nextVisibleHeading?.node ?? null
  }

  /**
   * 视口内没有任何仍挂载的大纲节点时的兜底。自动更新关闭或跳转后尚未刷新的
   * 虚拟滚动站点（DeepSeek/Claude），大纲树冻结在旧挂载窗口，元素引用整体失效，
   * 不高亮重算就会一直停在旧位置。这里用适配器提供的挂载行锚点给每条大纲估
   * 一个单调的内容坐标，再按同一锚线选高亮；估算不可用返回 null，由调用方
   * 保持上一次结果。
   */
  private findEstimatedVirtualActiveNode(
    scrollContainer: HTMLElement,
    viewportRect: ScrollViewportRect,
    anchorY: number,
  ): OutlineNode | null {
    const snapshot = this.siteAdapter.getVirtualOutlinePositionSnapshot?.()
    if (!snapshot) return null

    const slots: VirtualOutlineSlot[] = []
    const slotNodes: OutlineNode[] = []
    const orderByRow = new Map<number, number>()
    for (const node of this.flatNodes) {
      if (node.isGhost) continue
      const rowIndex = this.siteAdapter.getVirtualOutlineRowIndex?.(node)
      if (rowIndex === null || rowIndex === undefined) continue
      const order = orderByRow.get(rowIndex) ?? 0
      orderByRow.set(rowIndex, order + 1)
      slots.push({ index: rowIndex, order })
      slotNodes.push(node)
    }
    if (slots.length === 0) return null

    const viewportScrollTop = this.getViewportScrollTop(scrollContainer, viewportRect)
    if (viewportScrollTop === null) return null

    const tops = estimateGroupedVirtualTops(slots, snapshot.anchors, snapshot.bounds)
    const anchorTop = viewportScrollTop + (anchorY - viewportRect.top)

    // 估算坐标随文档顺序单调不减：取锚线之前（含）的最后一条
    let active: OutlineNode | null = null
    for (let i = 0; i < tops.length; i += 1) {
      if (tops[i] <= anchorTop) {
        active = slotNodes[i]
      }
    }
    return active
  }

  findMountedActiveNode(scrollContainer: HTMLElement): OutlineNode | null {
    if (this.settings.followMode !== "current") return null
    if (this.flatNodes.length === 0) return null
    if (this.usesVirtualOutlineFill()) {
      return this.findLiveVirtualActiveNode(scrollContainer)
    }

    const nativeActiveNode = this.findNativeActiveOutlineNode()
    const nativeSectionEnd = nativeActiveNode
      ? this.findUserQuerySectionEndIndex(nativeActiveNode)
      : 0

    const viewportRect = this.getScrollViewportRect(scrollContainer)
    if (!viewportRect) return null

    const viewportScrollTop = this.getViewportScrollTop(scrollContainer, viewportRect)
    if (viewportScrollTop === null) return null

    if (this.scrollPositionsStale) {
      this.updateScrollPositions()
    }

    const anchorY = viewportRect.top + Math.min(Math.max(viewportRect.height * 0.25, 48), 160)
    const anchorScrollTop = viewportScrollTop + (anchorY - viewportRect.top)
    const latestCachedUserQuery = this.findLatestCachedUserQueryBefore(anchorScrollTop)
    const candidateNodes = this.collectActiveCandidateNodes(
      anchorScrollTop,
      viewportScrollTop,
      viewportRect.height,
      latestCachedUserQuery,
    )
    // 有原生导航激活项时，把它所在的整个问题区间加入候选：区间标题可能全部
    // 离屏且 scrollPositions 过期，仅靠锚点附近的窗口会漏掉它们
    if (nativeActiveNode) {
      const candidateSet = new Set(candidateNodes)
      for (let i = nativeActiveNode.index; i < nativeSectionEnd; i += 1) {
        const node = this.flatNodes[i]
        if (node && !node.isGhost && !candidateSet.has(node)) {
          candidateSet.add(node)
          candidateNodes.push(node)
        }
      }
    }
    const mountedHeadings: MeasuredOutlineNode[] = []
    const mountedUserQueries: MeasuredOutlineNode[] = []

    const measureElement = (element: Element): MeasuredOutlineElement | null => {
      const clientRects = element.getClientRects()
      if (clientRects.length === 0) return null

      let top = clientRects[0].top
      let bottom = clientRects[0].bottom
      for (let i = 1; i < clientRects.length; i += 1) {
        const rect = clientRects[i]
        top = Math.min(top, rect.top)
        bottom = Math.max(bottom, rect.bottom)
      }

      return { top, height: Math.max(0, bottom - top) }
    }

    const measureNode = (node: OutlineNode): MeasuredOutlineNode | null => {
      if (node.isGhost) return null

      const element = node.element
      if (element?.isConnected) {
        const measured = measureElement(element)
        if (measured) {
          node.scrollTop = viewportScrollTop + (measured.top - viewportRect.top)
          node.scrollHeight = measured.height
          return { node, ...measured }
        }
      }

      const cachedTop = node.scrollTop
      if (typeof cachedTop !== "number" || Number.isNaN(cachedTop)) return null

      const cachedHeight =
        typeof node.scrollHeight === "number" && !Number.isNaN(node.scrollHeight)
          ? node.scrollHeight
          : 0

      return {
        node,
        top: cachedTop - viewportScrollTop + viewportRect.top,
        height: cachedHeight,
      }
    }

    for (const node of candidateNodes) {
      const measured = measureNode(node)
      if (!measured) continue

      if (node.isUserQuery) {
        mountedUserQueries.push(measured)
      } else {
        mountedHeadings.push(measured)
      }
    }

    const cachedVisibleNode = this.findCachedActiveNode(scrollContainer, viewportRect)

    let latestUserQueryBeforeAnchor: MeasuredOutlineNode | null = null
    let activeUserQuery: MeasuredOutlineNode | null = null
    for (const query of mountedUserQueries) {
      const bottom = query.top + query.height
      if (query.top <= anchorY && bottom > anchorY) {
        if (!activeUserQuery || query.top > activeUserQuery.top) {
          activeUserQuery = query
        }
        latestUserQueryBeforeAnchor = query
      }
      if (
        query.top <= anchorY &&
        (!latestUserQueryBeforeAnchor || query.top > latestUserQueryBeforeAnchor.top)
      ) {
        latestUserQueryBeforeAnchor = query
      }
    }

    // 原生导航（如 ChatGPT 右侧 TOC）已给出当前问题：只用来锁定问题区间，
    // 区间内仍按滚动位置高亮锚线上方最深的标题，而不是直接高亮用户问题本身
    if (nativeActiveNode) {
      const sectionHeading = this.findActiveHeadingInUserQuerySection(
        nativeActiveNode,
        nativeSectionEnd,
        mountedHeadings,
        anchorY,
      )
      return sectionHeading ?? nativeActiveNode
    }

    if (activeUserQuery) {
      return activeUserQuery.node
    }

    let activeHeading: MeasuredOutlineNode | null = null
    let nextVisibleHeading: MeasuredOutlineNode | null = null
    for (const heading of mountedHeadings) {
      const bottom = heading.top + heading.height
      if (heading.top <= anchorY) {
        if (!activeHeading || heading.top > activeHeading.top) {
          activeHeading = heading
        }
      } else if (heading.top < viewportRect.bottom && bottom > viewportRect.top) {
        if (!nextVisibleHeading || heading.top < nextVisibleHeading.top) {
          nextVisibleHeading = heading
        }
      }
    }

    const crossedUserQueryBoundary =
      latestUserQueryBeforeAnchor &&
      (!activeHeading || activeHeading.top < latestUserQueryBeforeAnchor.top)
    if (crossedUserQueryBoundary) {
      return (
        this.findFirstHeadingInUserQuerySection(latestUserQueryBeforeAnchor.node) ??
        nextVisibleHeading?.node ??
        latestUserQueryBeforeAnchor.node
      )
    }

    if (activeHeading) {
      return activeHeading.node
    }

    return nextVisibleHeading?.node ?? cachedVisibleNode
  }

  /** 站点原生导航（如 ChatGPT 右侧 TOC）报出的当前激活大纲节点 */
  private findNativeActiveOutlineNode(): OutlineNode | null {
    const nativeActiveId = this.siteAdapter.findActiveOutlineItemId()
    if (!nativeActiveId) return null

    const nativeActiveNode = this.flatNodes.find((node) => {
      const nodeNavigationId = node.navigationId || node.id || ""
      return nodeNavigationId === nativeActiveId || nodeNavigationId.startsWith(nativeActiveId)
    })
    return nativeActiveNode && !nativeActiveNode.isGhost ? nativeActiveNode : null
  }

  // flatNodes 为先序遍历且 node.index 与扁平下标一致；
  // 用户问题区间 = 自身之后到下一个 level 0 节点（下一个用户问题）之前
  private findUserQuerySectionEndIndex(sectionNode: OutlineNode): number {
    for (let i = sectionNode.index + 1; i < this.flatNodes.length; i += 1) {
      if (this.flatNodes[i].relativeLevel === 0) return i
    }
    return this.flatNodes.length
  }

  /** 问题区间内位于锚线上方、最靠近锚线的标题（即当前阅读到的最深一级） */
  private findActiveHeadingInUserQuerySection(
    sectionNode: OutlineNode,
    sectionEnd: number,
    mountedHeadings: MeasuredOutlineNode[],
    anchorY: number,
  ): OutlineNode | null {
    let active: MeasuredOutlineNode | null = null
    for (const heading of mountedHeadings) {
      if (heading.node.index <= sectionNode.index || heading.node.index >= sectionEnd) continue
      if (heading.top > anchorY) continue
      if (!active || heading.top > active.top) active = heading
    }
    return active?.node ?? null
  }

  private collectActiveCandidateNodes(
    anchorScrollTop: number,
    viewportScrollTop: number,
    viewportHeight: number,
    latestUserQuery: OutlineNode | null,
  ): OutlineNode[] {
    const candidates = new Set<OutlineNode>()
    const addNode = (node: OutlineNode | null | undefined) => {
      if (node && !node.isGhost) {
        candidates.add(node)
      }
    }
    const addRange = (center: number, radius: number) => {
      if (center < 0) return

      const start = Math.max(0, center - radius)
      const end = Math.min(this.scrollNodes.length - 1, center + radius)
      for (let i = start; i <= end; i += 1) {
        addNode(this.scrollNodes[i])
      }
    }

    const anchorIndex = this.findScrollNodeIndexAtOrBefore(anchorScrollTop)
    addRange(anchorIndex, 12)
    addRange(this.findScrollNodeIndexAtOrBefore(viewportScrollTop), 6)
    addRange(this.findScrollNodeIndexAtOrBefore(viewportScrollTop + viewportHeight), 6)

    if (latestUserQuery) {
      addNode(latestUserQuery)
      addNode(this.findFirstHeadingInUserQuerySection(latestUserQuery))
    }

    return Array.from(candidates)
  }

  private findScrollNodeIndexAtOrBefore(scrollTop: number): number {
    let lo = 0
    let hi = this.scrollPositions.length - 1
    let idx = -1

    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this.scrollPositions[mid] <= scrollTop) {
        idx = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    return idx
  }

  private findLatestCachedUserQueryBefore(scrollTop: number): OutlineNode | null {
    const startIndex = this.findScrollNodeIndexAtOrBefore(scrollTop)
    for (let i = startIndex; i >= 0; i -= 1) {
      const node = this.scrollNodes[i]
      if (node?.isUserQuery) return node
    }

    return null
  }

  private findFirstHeadingInUserQuerySection(userQueryNode: OutlineNode): OutlineNode | null {
    const stack = [...userQueryNode.children]
    while (stack.length > 0) {
      const node = stack.shift()
      if (!node) continue
      if (!node.isGhost && !node.isUserQuery) return node
      stack.unshift(...node.children)
    }

    return null
  }

  private findCachedActiveNode(
    scrollContainer: HTMLElement,
    viewportRect: ScrollViewportRect,
  ): OutlineNode | null {
    if (!this.shouldKeepPreviousVisibleItem()) return null
    if (this.scrollPositionsStale) return null

    const viewportScrollTop = this.getViewportScrollTop(scrollContainer, viewportRect)
    if (viewportScrollTop === null) return null

    const cachedNode = this.findVisibleItemNode(viewportScrollTop, viewportRect.height)
    if (!cachedNode || cachedNode.isUserQuery) return null

    return cachedNode
  }

  private getViewportScrollTop(
    scrollContainer: HTMLElement,
    viewportRect: ScrollViewportRect,
  ): number | null {
    if (this.isDocumentScrollContainer(scrollContainer)) {
      const doc = scrollContainer.ownerDocument
      return (
        scrollContainer.scrollTop ||
        doc.documentElement.scrollTop ||
        doc.body.scrollTop ||
        doc.defaultView?.scrollY ||
        0
      )
    }

    const containerRect = scrollContainer.getBoundingClientRect()
    const visibleOffset = Math.max(0, viewportRect.top - containerRect.top)
    return scrollContainer.scrollTop + visibleOffset
  }

  private isDocumentScrollContainer(scrollContainer: HTMLElement): boolean {
    const doc = scrollContainer.ownerDocument
    return (
      scrollContainer === doc.scrollingElement ||
      scrollContainer === doc.documentElement ||
      scrollContainer === doc.body
    )
  }

  private getScrollViewportRect(scrollContainer: HTMLElement): ScrollViewportRect | null {
    const win = scrollContainer.ownerDocument.defaultView ?? window

    if (this.isDocumentScrollContainer(scrollContainer)) {
      const width = win.innerWidth
      const height = win.innerHeight
      if (width <= 2 || height <= 2) return null
      return { left: 0, top: 0, right: width, bottom: height, width, height }
    }

    const rect = scrollContainer.getBoundingClientRect()
    const left = Math.max(0, rect.left)
    const top = Math.max(0, rect.top)
    const right = Math.min(win.innerWidth, rect.right)
    const bottom = Math.min(win.innerHeight, rect.bottom)
    const width = right - left
    const height = bottom - top

    if (width <= 2 || height <= 2) return null
    return { left, top, right, bottom, width, height }
  }

  private shouldKeepPreviousVisibleItem(): boolean {
    const siteId = this.siteAdapter.getSiteId()
    return siteId === SITE_IDS.DEEPSEEK || siteId === SITE_IDS.ZAI
  }
}
