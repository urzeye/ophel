/**
 * 会话 Tab 组件
 * 从油猴脚本 geminiHelper.user.js 5874~6606 行原封不动移植
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type {
  Conversation,
  ConversationManager,
  ConversationSegmentedExportDraft,
  ConversationSegmentedExportMode,
  Folder,
  Tag,
} from "~core/conversation-manager"
import { SITE_IDS } from "~constants"
import { platform } from "~platform"
import { useConversationsStore } from "~stores/conversations-store"
import { useFoldersStore } from "~stores/folders-store"
import { useSettingsStore } from "~stores/settings-store"
import { useTagsStore } from "~stores/tags-store"
import { getCurrentLang, t } from "~utils/i18n"
import { showToast } from "~utils/toast"

import {
  ConfirmDialog,
  FolderDialog,
  FolderSelectDialog,
  RenameDialog,
  TagManagerDialog,
} from "./ConversationDialogs"
import { LoadingOverlay } from "./LoadingOverlay"
import { ConversationMenu, ExportMenu, FolderMenu, type MenuAnchorPoint } from "./ConversationMenus"
import { SegmentedExportDialog } from "./SegmentedExportDialog"

import "~styles/conversations.css"

// 渐进式加载：每次渲染的会话批次大小
const PROGRESSIVE_BATCH_SIZE = 30

import {
  BatchIcon,
  ClearIcon,
  CopyIcon,
  DeleteIcon,
  ExportIcon,
  FolderMoveIcon,
  FolderPlusIcon,
  HourglassIcon,
  LocateIcon,
  MoreHorizontalIcon,
  PinIcon,
  SearchIcon,
  SyncIcon,
  TagIcon,
} from "~components/icons"
import { SelectDropdown, Tooltip } from "~components/ui"

// ==================== 类型定义 ====================

interface ConversationsTabProps {
  manager: ConversationManager
  onInteractionStateChange?: (isActive: boolean) => void
}

interface SearchResult {
  folderMatches: Set<string>
  conversationMatches: Set<string>
  conversationFolderMap: Map<string, string>
  totalCount: number
}

type DialogType =
  | { type: "confirm"; title: string; message: string; onConfirm: () => void; danger?: boolean }
  | {
      type: "folder"
      folder?: Folder
      returnToSelect?: { conv?: Conversation; convIds?: string[] }
    }
  | { type: "rename"; conv: Conversation }
  | {
      type: "folderSelect"
      conv?: Conversation
      convIds?: string[]
      activeFolderId?: string
    }
  | { type: "tagManager"; conv?: Conversation }
  | null

type MenuType =
  | { type: "folder"; folder: Folder; anchorEl: HTMLElement }
  | {
      type: "conversation"
      conv: Conversation
      anchorEl: HTMLElement | null
      anchorPoint?: MenuAnchorPoint
    }
  | { type: "export"; anchorEl: HTMLElement }
  | {
      type: "export-conv"
      conv: Conversation
      anchorEl: HTMLElement | null
      anchorPoint?: MenuAnchorPoint
    }
  | null

const getInboxDisplayName = (): string => {
  const translated = t("conversationsInbox")
  return translated === "conversationsInbox" ? "Inbox" : translated
}

const getFolderDisplayName = (folder: Pick<Folder, "id" | "name" | "icon">): string => {
  if (folder.id === "inbox") {
    return getInboxDisplayName()
  }

  const trimmedName = (folder.name || "").trim()
  const trimmedIcon = (folder.icon || "").trim()

  if (!trimmedIcon) {
    return trimmedName
  }

  if (trimmedName.startsWith(trimmedIcon)) {
    return trimmedName.slice(trimmedIcon.length).trim()
  }

  return trimmedName
}

// 高亮文本
const highlightText = (text: string, query: string): React.ReactNode => {
  if (!query) return text
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <span key={i} className="conversations-highlight">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

const getSafeConversationOpenUrl = (conv: Conversation): string | null => {
  const rawUrl = (conv.url || "").trim()
  if (!rawUrl) return null

  try {
    const url = new URL(rawUrl, window.location.origin)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}

// ==================== 主组件 ====================

export const ConversationsTab: React.FC<ConversationsTabProps> = ({
  manager,
  onInteractionStateChange,
}) => {
  const unsupportedSiteLabels: Record<string, string> = {
    [SITE_IDS.CHATGLM]: "ChatGLM",
    [SITE_IDS.ZAI]: "Z.ai",
    [SITE_IDS.QIANWEN]: "Qianwen",
    [SITE_IDS.QWENAI]: "Qwen Studio",
    [SITE_IDS.IMA]: "ima",
  }

  // 设置 - 使用 Zustand store，确保设置变更实时生效
  const { settings } = useSettingsStore()
  const conversationsStoreSnapshot = useConversationsStore((state) => state.conversations)
  const lastUsedFolderIdStoreSnapshot = useConversationsStore((state) => state.lastUsedFolderId)
  const foldersStoreSnapshot = useFoldersStore((state) => state.folders)
  const tagsStoreSnapshot = useTagsStore((state) => state.tags)

  // 数据状态
  const [folders, setFolders] = useState<Folder[]>([])
  const [conversations, setConversations] = useState<Record<string, Conversation>>({})
  const [tags, setTags] = useState<Tag[]>([])
  const [lastUsedFolderId, setLastUsedFolderId] = useState("inbox")

  // UI 状态
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // 搜索状态
  const [searchQuery, setSearchQuery] = useState("")
  const [filterPinned, setFilterPinned] = useState(false)
  const [filterTagIds, setFilterTagIds] = useState<Set<string>>(new Set())
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [showTagFilterMenu, setShowTagFilterMenu] = useState(false)
  const [isFolderSelectOpen, setIsFolderSelectOpen] = useState(false)
  const [isNarrowLayout, setIsNarrowLayout] = useState(false)
  const currentLang = getCurrentLang()

  const siteId = manager.siteAdapter?.getSiteId?.()
  const isConversationUnsupported = !!(siteId && unsupportedSiteLabels[siteId])
  const unsupportedSiteLabel = siteId ? unsupportedSiteLabels[siteId] || siteId : ""
  const unsupportedTitle = t("conversationsUnsupportedTitle", { site: unsupportedSiteLabel })
  const unsupportedDesc = t("conversationsUnsupportedDesc")
  const unsupportedSync = t("conversationsUnsupportedSync", { site: unsupportedSiteLabel })

  const showUnsupportedMask = isConversationUnsupported

  // 对话框和菜单
  const [dialog, setDialog] = useState<DialogType>(null)
  const [menu, setMenu] = useState<MenuType>(null)
  const [segmentedExportDraft, setSegmentedExportDraft] =
    useState<ConversationSegmentedExportDraft | null>(null)
  const [isSegmentedExporting, setIsSegmentedExporting] = useState(false)

  // 文件夹拖拽排序
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

  // 会话拖拽移动
  const [draggedConvId, setDraggedConvId] = useState<string | null>(null)
  const [dragOverFolderForConvId, setDragOverFolderForConvId] = useState<string | null>(null)
  // Ref 跟踪实际拖拽悬停目标，避免浏览器 dragenter/dragleave 事件顺序不一致导致的高亮闪烁
  const dragOverConvTargetRef = useRef<string | null>(null)
  const dragOverFolderTargetRef = useRef<string | null>(null)

  // Refs
  const contentRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tagFilterMenuRef = useRef<HTMLDivElement>(null)
  const tagFilterBtnRef = useRef<HTMLButtonElement>(null)

  // 根据面板宽度切换紧凑布局，优先给标题与标签留空间
  useEffect(() => {
    const el = contentRef.current
    if (!el || typeof ResizeObserver === "undefined") return

    const updateLayout = () => {
      setIsNarrowLayout(el.clientWidth <= 340)
    }

    updateLayout()

    const observer = new ResizeObserver(updateLayout)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 加载数据（设置由 Zustand store 管理，无需手动加载）
  const loadData = useCallback(async () => {
    setFolders([...manager.getFolders()])
    setConversations({ ...manager.getAllConversations() })
    setTags([...manager.getTags()])
    setLastUsedFolderId(manager.getLastUsedFolderId())
  }, [manager])

  useEffect(() => {
    loadData()
  }, [
    loadData,
    conversationsStoreSnapshot,
    foldersStoreSnapshot,
    lastUsedFolderIdStoreSnapshot,
    tagsStoreSnapshot,
  ])

  // 订阅 ConversationManager 的数据变更事件
  useEffect(() => {
    const unsubscribe = manager.onDataChange(() => {
      loadData()
    })
    return () => unsubscribe()
  }, [manager, loadData])

  // 搜索处理
  const handleSearch = useCallback(
    (query: string) => {
      if (!query && !filterPinned && filterTagIds.size === 0) {
        setSearchResult(null)
        return
      }

      const folderMatches = new Set<string>()
      const conversationMatches = new Set<string>()
      const conversationFolderMap = new Map<string, string>()
      const lowerQuery = query.toLowerCase()

      folders.forEach((folder) => {
        if (query && getFolderDisplayName(folder).toLowerCase().includes(lowerQuery)) {
          folderMatches.add(folder.id)
        }
      })

      Object.values(conversations).forEach((conv) => {
        let matched = true
        if (query && !conv.title.toLowerCase().includes(lowerQuery)) matched = false
        if (filterPinned && !conv.pinned) matched = false
        if (filterTagIds.size > 0) {
          const hasTag = conv.tagIds?.some((tid) => filterTagIds.has(tid))
          if (!hasTag) matched = false
        }
        if (matched) {
          conversationMatches.add(conv.id)
          conversationFolderMap.set(conv.id, conv.folderId)
        }
      })

      setSearchResult({
        folderMatches,
        conversationMatches,
        conversationFolderMap,
        totalCount: conversationMatches.size,
      })
    },
    [folders, conversations, filterPinned, filterTagIds],
  )

  // 监听筛选条件变化，自动触发搜索
  useEffect(() => {
    handleSearch(searchQuery)
  }, [filterPinned, filterTagIds, handleSearch, searchQuery])

  // 监听标签筛选菜单外部点击
  useEffect(() => {
    if (!showTagFilterMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      // 使用 composedPath() 获取完整的事件路径（穿透 Shadow DOM）
      const path = e.composedPath()
      const clickedInMenu = tagFilterMenuRef.current && path.includes(tagFilterMenuRef.current)
      const clickedInBtn = tagFilterBtnRef.current && path.includes(tagFilterBtnRef.current)

      if (!clickedInMenu && !clickedInBtn) {
        setShowTagFilterMenu(false)
      }
    }

    // 延迟添加监听，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClickOutside, true) // 使用捕获阶段
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener("click", handleClickOutside, true)
    }
  }, [showTagFilterMenu])

  // 监听所有弹窗状态，向上汇报交互状态
  useEffect(() => {
    const isInteracting = !!(
      menu ||
      dialog ||
      segmentedExportDraft ||
      showTagFilterMenu ||
      isFolderSelectOpen ||
      isDeleting ||
      isSegmentedExporting
    )
    onInteractionStateChange?.(isInteracting)
  }, [
    menu,
    dialog,
    segmentedExportDraft,
    showTagFilterMenu,
    isFolderSelectOpen,
    isDeleting,
    isSegmentedExporting,
    onInteractionStateChange,
  ])

  // 防抖搜索
  const handleSearchInput = (value: string) => {
    setSearchQuery(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => handleSearch(value), 150)
  }

  const getCurrentExportConversationId = useCallback(
    (conv?: Conversation): string | null => {
      if (conv?.id) return conv.id
      if (selectedIds.size > 0) return Array.from(selectedIds)[0]
      return manager.siteAdapter.getSessionId() || null
    },
    [manager, selectedIds],
  )

  const openSegmentedExportDialog = useCallback(
    async (conv?: Conversation) => {
      const convId = getCurrentExportConversationId(conv)
      if (!convId) {
        showToast(t("exportNeedOpenFirst"))
        return
      }
      if (manager.siteAdapter.getSessionId() !== convId) {
        showToast(t("exportNeedOpenFirst"))
        return
      }

      setIsSegmentedExporting(true)
      try {
        const draft = await manager.prepareSegmentedConversationExport(convId)
        if (!draft || draft.segments.length === 0) {
          showToast(t("segmentedExportNoSegments"))
          return
        }

        setSegmentedExportDraft(draft)
      } finally {
        setIsSegmentedExporting(false)
      }
    },
    [getCurrentExportConversationId, manager],
  )

  const handleSegmentedExport = useCallback(
    async (segmentIds: string[], mode: ConversationSegmentedExportMode) => {
      if (!segmentedExportDraft) return

      setIsSegmentedExporting(true)
      try {
        const success = await manager.exportSegmentedConversation(
          segmentedExportDraft,
          segmentIds,
          mode,
        )
        if (success) {
          setSegmentedExportDraft(null)
        }
      } finally {
        setIsSegmentedExporting(false)
      }
    },
    [manager, segmentedExportDraft],
  )

  // Tag 查表 Map（O(1) 查找替代 tags.find()）
  const tagMap = useMemo(() => {
    const map = new Map<string, Tag>()
    tags.forEach((tag) => map.set(tag.id, tag))
    return map
  }, [tags])

  // 缓存每个文件夹的会话列表（过滤并排序），避免重复计算
  const folderConversationsMap = useMemo(() => {
    const sidebarOrder = manager.getSidebarConversationOrder()
    // 预处理为 Map<id, index>，排序比较时 O(1) 取位置
    const orderMap = new Map<string, number>()
    for (let i = 0; i < sidebarOrder.length; i++) {
      orderMap.set(sidebarOrder[i], i)
    }

    const byFolder = new Map<string, Conversation[]>()
    const allConvs = Object.values(conversations)

    // 按 folderId 分组
    for (const conv of allConvs) {
      let list = byFolder.get(conv.folderId)
      if (!list) {
        list = []
        byFolder.set(conv.folderId, list)
      }
      list.push(conv)
    }

    // 对每个文件夹的会话过滤 + 排序
    const result = new Map<string, Conversation[]>()
    for (const [folderId, convs] of byFolder) {
      let filtered = searchResult
        ? convs.filter((c) => searchResult.conversationMatches.has(c.id))
        : convs
      filtered.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        const indexA = orderMap.get(a.id) ?? -1
        const indexB = orderMap.get(b.id) ?? -1
        if (indexA === -1 && indexB === -1) return (b.updatedAt || 0) - (a.updatedAt || 0)
        if (indexA === -1) return 1
        if (indexB === -1) return -1
        return indexA - indexB
      })
      result.set(folderId, filtered)
    }
    return result
  }, [conversations, searchResult, manager])

  // 保持最新引用，供 IntersectionObserver 回调读取文件夹总数
  const folderConversationsMapRef = useRef(folderConversationsMap)
  folderConversationsMapRef.current = folderConversationsMap

  // 快捷获取方法（从缓存中读取）
  const getConversationsInFolder = (folderId: string): Conversation[] => {
    return folderConversationsMap.get(folderId) || []
  }

  // 获取文件夹计数
  const getFolderCount = (folderId: string): number => {
    return getConversationsInFolder(folderId).length
  }

  // 渐进式加载：记录每个文件夹已显示的会话数量
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({})
  const loadMoreSentinelRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())

  // 同步
  const handleSync = useCallback(async () => {
    if (isConversationUnsupported) {
      showToast(unsupportedSync)
      return
    }
    setSyncing(true)
    try {
      const loadResult = await manager.siteAdapter?.loadAllConversations?.()
      const canSyncDeleted = loadResult !== false
      const sidebarCount = manager.siteAdapter?.getConversationList?.()?.length || 0
      const { newCount, updatedCount, deletedCount } = await manager.syncConversations(
        lastUsedFolderId,
        false,
        { syncDeleted: canSyncDeleted },
      )
      loadData()
      if (sidebarCount === 0) {
        showToast(t("conversationsSyncNoSidebarItems"))
      } else {
        showToast(
          t("conversationsSyncResult")
            .replace("{scanned}", String(sidebarCount))
            .replace("{added}", String(newCount))
            .replace("{updated}", String(updatedCount))
            .replace("{deleted}", String(deletedCount)),
        )
      }
    } finally {
      setSyncing(false)
    }
  }, [isConversationUnsupported, unsupportedSync, manager, lastUsedFolderId, loadData])

  // 定位当前对话
  const handleLocate = useCallback(() => {
    // 分享页面或新对话页面不执行定位
    if (manager.siteAdapter?.isSharePage?.() || manager.siteAdapter?.isNewConversation?.()) {
      return
    }

    const sessionId = manager.siteAdapter?.getSessionId?.()
    if (!sessionId || sessionId === "default" || sessionId === "app") return

    const conv = manager.getConversation(sessionId)
    if (!conv) {
      handleSync()
      return
    }

    setExpandedFolderId(conv.folderId)

    // 渐进式加载：确保定位目标在已渲染范围内
    const folderConvs = folderConversationsMap.get(conv.folderId) || []
    const targetIndex = folderConvs.findIndex((c) => c.id === sessionId)
    if (targetIndex >= 0) {
      const needed = targetIndex + 1
      setVisibleCounts((prev) => ({
        ...prev,
        [conv.folderId]: Math.max(prev[conv.folderId] || PROGRESSIVE_BATCH_SIZE, needed),
      }))
    }

    setTimeout(() => {
      // 使用 contentRef 在组件内查找元素（Shadow DOM 内）
      const container = contentRef.current
      if (!container) return
      const item = container.querySelector(`.conversations-item[data-id="${sessionId}"]`)
      if (item) {
        item.scrollIntoView({ behavior: "smooth", block: "center" })
        item.classList.add("locate-highlight")
        setTimeout(() => item.classList.remove("locate-highlight"), 2000)
      }
    }, 100)
  }, [manager, handleSync, folderConversationsMap])

  // 监听快捷键触发的定位事件
  useEffect(() => {
    const handleLocateEvent = () => {
      // 清除全局标记
      ;(window as any).__ophelPendingLocateConversation = false
      handleLocate()
    }

    // 检查挂载时是否有待处理的定位请求
    if ((window as any).__ophelPendingLocateConversation) {
      // 延迟执行，确保组件完全渲染
      setTimeout(() => {
        handleLocateEvent()
      }, 100)
    }

    window.addEventListener("ophel:locateConversation", handleLocateEvent)
    return () => {
      window.removeEventListener("ophel:locateConversation", handleLocateEvent)
    }
  }, [handleLocate])

  // 监听快捷键触发的刷新事件
  useEffect(() => {
    const handleRefreshEvent = () => {
      handleSync()
    }

    window.addEventListener("ophel:refreshConversations", handleRefreshEvent)
    return () => {
      window.removeEventListener("ophel:refreshConversations", handleRefreshEvent)
    }
  }, [handleSync])

  // 批量模式
  const toggleBatchMode = () => {
    if (batchMode) {
      setSelectedIds(new Set())
    }
    setBatchMode(!batchMode)
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setBatchMode(false)
  }

  // 清除筛选
  const clearFilters = () => {
    setSearchQuery("")
    setFilterPinned(false)
    setFilterTagIds(new Set())
    setSearchResult(null)
  }

  const hasFilters = searchQuery || filterPinned || filterTagIds.size > 0

  // 文件夹展开/折叠时重置已显示数量
  const prevExpandedFolderId = useRef<string | null>(null)
  useEffect(() => {
    if (expandedFolderId !== prevExpandedFolderId.current) {
      prevExpandedFolderId.current = expandedFolderId
      if (expandedFolderId) {
        setVisibleCounts((prev) => ({
          ...prev,
          [expandedFolderId]: Math.max(prev[expandedFolderId] ?? 0, PROGRESSIVE_BATCH_SIZE),
        }))
      }
    }
  }, [expandedFolderId])

  // 搜索模式下展开多个文件夹时也初始化
  useEffect(() => {
    if (searchResult) {
      const folderIds = new Set(searchResult.conversationFolderMap.values())
      setVisibleCounts((prev) => {
        const next = { ...prev }
        for (const fid of folderIds) {
          if (!(fid in next)) next[fid] = PROGRESSIVE_BATCH_SIZE
        }
        return next
      })
    }
  }, [searchResult])

  // IntersectionObserver 持久化引用，避免每次 visibleCounts 变化时重建
  const observerRef = useRef<IntersectionObserver | null>(null)

  // 在 useEffect 中创建 observer，兼容 React 严格模式/并发渲染，并做特性检测
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const folderId = (entry.target as HTMLElement).dataset.folderId
            if (folderId) {
              const total = folderConversationsMapRef.current.get(folderId)?.length || 0
              setVisibleCounts((prev) => {
                const current = prev[folderId] || PROGRESSIVE_BATCH_SIZE
                const next = Math.min(current + PROGRESSIVE_BATCH_SIZE, total)
                if (next === current) return prev // 无变化，不触发更新
                return { ...prev, [folderId]: next }
              })
              // 已全部加载时提前 unobserve（哨兵将在下次渲染中因 hasMore=false 被移除）
              observer.unobserve(entry.target)
            }
          }
        }
      },
      { rootMargin: "100px" },
    )
    observerRef.current = observer

    // 对已挂载的哨兵元素补做 observe
    for (const [, el] of loadMoreSentinelRefs.current) {
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [])

  // 点击会话
  const handleConversationClick = useCallback(
    (conv: Conversation) => {
      if (batchMode) {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          if (next.has(conv.id)) next.delete(conv.id)
          else next.add(conv.id)
          return next
        })
        return
      }

      // 使用适配器的 navigateToConversation 方法（SPA 导航）
      manager.siteAdapter?.navigateToConversation(conv.id, conv.url)
    },
    [batchMode, manager],
  )

  const handleOpenConversationInNewTab = useCallback((conv: Conversation) => {
    const url = getSafeConversationOpenUrl(conv)
    if (!url) {
      showToast(t("operationFailed"))
      return
    }

    platform.openTab(url)
  }, [])

  // 文件夹展开/折叠（手风琴模式）
  const handleFolderClick = (folderId: string) => {
    setExpandedFolderId(expandedFolderId === folderId ? null : folderId)
  }

  // 文件夹全选
  const handleFolderSelectAll = (folderId: string, checked: boolean) => {
    const convs = getConversationsInFolder(folderId)
    const newSelected = new Set(selectedIds)
    if (checked) convs.forEach((c) => newSelected.add(c.id))
    else convs.forEach((c) => newSelected.delete(c.id))
    setSelectedIds(newSelected)
  }

  const isFolderAllSelected = (folderId: string): boolean => {
    const convs = getConversationsInFolder(folderId)
    return convs.length > 0 && convs.every((c) => selectedIds.has(c.id))
  }

  const isFolderPartialSelected = (folderId: string): boolean => {
    const convs = getConversationsInFolder(folderId)
    const selected = convs.filter((c) => selectedIds.has(c.id))
    return selected.length > 0 && selected.length < convs.length
  }

  // 判断文件夹是否应显示
  const shouldShowFolder = (folder: Folder): boolean => {
    if (!searchResult) return true
    const folderMatch = searchResult.folderMatches.has(folder.id)
    const hasChildren = Array.from(searchResult.conversationFolderMap.values()).includes(folder.id)
    return folderMatch || hasChildren
  }

  // 判断文件夹是否应展开
  const shouldExpandFolder = (folderId: string): boolean => {
    if (searchResult) {
      return Array.from(searchResult.conversationFolderMap.values()).includes(folderId)
    }
    return expandedFolderId === folderId
  }

  const folderSelectOptions = useMemo(() => {
    void currentLang
    return folders.map((folder) => {
      const folderName = getFolderDisplayName(folder)
      const optionLabel = `${folder.icon ? `${folder.icon} ` : ""}${folderName}`.trim()

      return {
        value: folder.id,
        title: optionLabel,
        label: (
          <>
            {folder.icon && <span className="conversations-folder-select-icon">{folder.icon}</span>}
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {folderName}
            </span>
          </>
        ),
      }
    })
  }, [folders, currentLang])

  // ==================== 渲染 ====================

  return (
    <>
      <LoadingOverlay isVisible={isDeleting} text={`${t("delete")}...`} />
      <div
        ref={contentRef}
        className={`conversations-content ${isNarrowLayout ? "is-narrow" : ""} ${draggedConvId || draggedFolderId ? "is-dragging-any" : ""}`}
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
          position: "relative",
        }}>
        {showUnsupportedMask && (
          <div className="conversations-unsupported-mask" aria-hidden="true">
            <div className="conversations-unsupported-card">
              <div className="conversations-unsupported-icon">!</div>
              <div className="conversations-unsupported-title">{unsupportedTitle}</div>
              <div className="conversations-unsupported-desc">{unsupportedDesc}</div>
            </div>
          </div>
        )}
        {/* 工具栏 */}
        <div className="conversations-toolbar gh-panel-toolbar">
          {/* 1. 同步目标选择 */}
          <Tooltip content={t("conversationsSelectFolder")} triggerStyle={{ flex: 1, minWidth: 0 }}>
            <SelectDropdown
              className="conversations-folder-select-dropdown"
              buttonClassName="conversations-folder-select"
              menuClassName="conversations-folder-select-menu"
              optionClassName="conversations-folder-select-option"
              options={folderSelectOptions}
              value={lastUsedFolderId}
              ariaLabel={t("conversationsSelectFolder")}
              onOpenChange={setIsFolderSelectOpen}
              onChange={(selectedFolderId) => {
                setLastUsedFolderId(selectedFolderId)
                manager.setLastUsedFolder(selectedFolderId)
              }}
            />
          </Tooltip>

          {/* 2. 同步按钮 */}
          <Tooltip content={t("conversationsSync")}>
            <button
              type="button"
              className="conversations-toolbar-btn gh-panel-icon-btn sync"
              disabled={syncing || isConversationUnsupported}
              aria-label={t("conversationsSync")}
              onClick={handleSync}>
              {syncing ? <HourglassIcon size={18} /> : <SyncIcon size={18} />}
            </button>
          </Tooltip>

          {/* 3. 定位按钮 */}
          <Tooltip content={t("conversationsLocate")}>
            <button
              type="button"
              className="conversations-toolbar-btn gh-panel-icon-btn locate"
              aria-label={t("conversationsLocate")}
              onClick={handleLocate}>
              <LocateIcon size={18} />
            </button>
          </Tooltip>

          {/* 4. 批量模式 */}
          <Tooltip content={t("conversationsBatchMode")}>
            <button
              type="button"
              className={`conversations-toolbar-btn gh-panel-icon-btn batch-mode ${batchMode ? "active" : ""}`}
              aria-label={t("conversationsBatchMode")}
              aria-pressed={batchMode}
              onClick={toggleBatchMode}>
              <BatchIcon size={18} />
            </button>
          </Tooltip>

          {/* 5. 新建文件夹 */}
          <Tooltip content={t("conversationsAddFolder")}>
            <button
              type="button"
              className="conversations-toolbar-btn gh-panel-icon-btn add-folder"
              aria-label={t("conversationsAddFolder")}
              onClick={() => {
                onInteractionStateChange?.(true)
                setDialog({ type: "folder" })
              }}>
              <FolderPlusIcon size={18} />
            </button>
          </Tooltip>
        </div>

        {/* 搜索栏 */}
        <div className="conversations-search-bar">
          <div className="conversations-search-wrapper gh-panel-search gh-panel-search--segmented">
            <span className="gh-panel-search-icon" aria-hidden="true">
              <SearchIcon size={15} />
            </span>
            <div className="conversations-search-input-group">
              <input
                ref={searchInputRef}
                type="text"
                className="conversations-search-input gh-panel-search-input"
                placeholder={t("conversationsSearchPlaceholder")}
                aria-label={t("conversationsSearchPlaceholder")}
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
              />
            </div>

            {/* 置顶筛选 */}
            <Tooltip content={t("conversationsFilterPinned")}>
              <button
                type="button"
                className={`conversations-pin-filter-btn gh-panel-search-action ${filterPinned ? "active" : ""}`}
                aria-label={t("conversationsFilterPinned")}
                aria-pressed={filterPinned}
                onClick={() => setFilterPinned(!filterPinned)}>
                <PinIcon size={16} />
              </button>
            </Tooltip>

            {/* 标签筛选 */}
            <Tooltip content={t("conversationsFilterByTags")}>
              <button
                type="button"
                ref={tagFilterBtnRef}
                className={`conversations-tag-search-btn gh-panel-search-action ${filterTagIds.size > 0 ? "active" : ""}`}
                aria-label={t("conversationsFilterByTags")}
                aria-pressed={filterTagIds.size > 0}
                onClick={() => {
                  const newState = !showTagFilterMenu
                  if (newState) onInteractionStateChange?.(true)
                  setShowTagFilterMenu(newState)
                }}>
                <TagIcon size={16} />
              </button>
            </Tooltip>

            {/* 标签筛选菜单 */}
            {showTagFilterMenu && (
              <div ref={tagFilterMenuRef} className="conversations-tag-filter-menu">
                <div
                  className="conversations-tag-filter-list"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                  {tags.length === 0 ? (
                    <div
                      className="conversations-tag-filter-item"
                      style={{ color: "var(--gh-text-tertiary, #9ca3af)", cursor: "default" }}>
                      {t("conversationsNoTags")}
                    </div>
                  ) : (
                    tags.map((tag) => (
                      <div
                        key={tag.id}
                        className={`conversations-tag-filter-item ${filterTagIds.has(tag.id) ? "selected" : ""}`}
                        onClick={() => {
                          const newTagIds = new Set(filterTagIds)
                          if (newTagIds.has(tag.id)) newTagIds.delete(tag.id)
                          else newTagIds.add(tag.id)
                          setFilterTagIds(newTagIds)
                        }}>
                        <span
                          className="conversations-tag-dot"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span>{tag.name}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="conversations-tag-filter-footer">
                  <div
                    className="conversations-tag-filter-item conversations-tag-filter-action"
                    onClick={() => {
                      setShowTagFilterMenu(false)
                      // 从筛选菜单打开标签管理对话框，作为纯管理模式（不绑定会话）
                      onInteractionStateChange?.(true)
                      setDialog({ type: "tagManager", conv: undefined })
                    }}>
                    {t("conversationsManageTags")}
                  </div>
                </div>
              </div>
            )}

            {/* 清除按钮 */}
            <Tooltip content={t("conversationsClearAll")}>
              <button
                type="button"
                className={`conversations-search-clear gh-panel-search-action ${!hasFilters ? "disabled" : ""}`}
                onClick={hasFilters ? clearFilters : undefined}
                disabled={!hasFilters}
                aria-label={t("conversationsClearAll")}>
                <ClearIcon size={14} />
              </button>
            </Tooltip>
          </div>

          {/* 搜索结果计数 */}
          {searchQuery && searchResult && (
            <div className="conversations-result-bar visible">
              {searchResult.totalCount} {t("conversationsSearchResult")}
            </div>
          )}
        </div>

        {/* 文件夹列表 */}
        <div className="conversations-folder-list">
          {folders.filter(shouldShowFolder).length === 0 ? (
            <div className="conversations-empty">
              {searchResult ? t("conversationsNoSearchResult") : t("conversationsEmpty")}
            </div>
          ) : (
            folders.filter(shouldShowFolder).map((folder, index) => {
              const isExpanded = shouldExpandFolder(folder.id)
              const count = getFolderCount(folder.id)
              const folderName = getFolderDisplayName(folder)

              // 彩虹色 - 根据设置决定是否启用
              // 非彩虹色模式：只有收件箱有背景色，其他文件夹透明
              // 彩虹色模式：所有文件夹都有彩色背景
              const useRainbow = settings?.features?.conversations?.folderRainbow ?? false
              let bgVar = "transparent"
              if (folder.isDefault) {
                bgVar = "var(--gh-folder-bg-default)"
              } else if (useRainbow) {
                bgVar = `var(--gh-folder-bg-${index % 8})`
              } else if (isExpanded) {
                // 展开状态下的背景色 (淡蓝色 / 暗黑模式适配)
                bgVar = "var(--gh-folder-bg-expanded, rgba(59, 130, 246, 0.08))"
              }

              return (
                <React.Fragment key={folder.id}>
                  {/* 文件夹项 */}
                  <div
                    className={[
                      "conversations-folder-item",
                      isExpanded ? "expanded" : "",
                      folder.isDefault ? "default" : "",
                      draggedFolderId === folder.id ? "is-dragging" : "",
                      dragOverFolderId === folder.id && draggedFolderId !== folder.id
                        ? "is-drag-over"
                        : "",
                      dragOverFolderForConvId === folder.id ? "is-drag-over-conv" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-folder-id={folder.id}
                    style={{ background: bgVar }}
                    draggable={!folder.isDefault}
                    onDragStart={(e) => {
                      if (folder.isDefault) {
                        e.preventDefault()
                        return
                      }

                      const target = e.target as HTMLElement
                      if (
                        target.closest(
                          'button, input, textarea, select, [role="button"], [data-no-row-drag="true"]',
                        )
                      ) {
                        e.preventDefault()
                        return
                      }

                      setDraggedFolderId(folder.id)
                      e.dataTransfer.effectAllowed = "move"
                      e.dataTransfer.setData("text/plain", folder.id)
                    }}
                    onDragEnd={() => {
                      setDraggedFolderId(null)
                      setDragOverFolderId(null)
                      dragOverFolderTargetRef.current = null
                    }}
                    onClick={() => handleFolderClick(folder.id)}
                    onDragEnter={(e) => {
                      if (draggedFolderId) {
                        if (folder.isDefault || folder.id === draggedFolderId) return
                        e.preventDefault()
                        dragOverFolderTargetRef.current = folder.id
                        setDragOverFolderId(folder.id)
                      } else if (draggedConvId) {
                        const conv = conversations[draggedConvId]
                        if (conv && conv.folderId !== folder.id) {
                          e.preventDefault()
                          dragOverConvTargetRef.current = folder.id
                          setDragOverFolderForConvId(folder.id)
                        }
                      }
                    }}
                    onDragOver={(e) => {
                      if (draggedFolderId) {
                        if (folder.isDefault || folder.id === draggedFolderId) return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = "move"
                        dragOverFolderTargetRef.current = folder.id
                        setDragOverFolderId(folder.id)
                      } else if (draggedConvId) {
                        const conv = conversations[draggedConvId]
                        if (conv && conv.folderId !== folder.id) {
                          e.preventDefault()
                          e.dataTransfer.dropEffect = "move"
                          dragOverConvTargetRef.current = folder.id
                          setDragOverFolderForConvId(folder.id)
                        }
                      }
                    }}
                    onDragLeave={(e) => {
                      // 只有当离开容器本身（而不是进入子元素）时才处理
                      const relatedTarget = e.relatedTarget as HTMLElement
                      if (relatedTarget && e.currentTarget.contains(relatedTarget)) return

                      // 使用 setTimeout 延迟清除，让目标元素的 dragenter 先更新 ref，
                      // 从而避免浏览器 dragenter/dragleave 事件顺序不一致导致的高亮闪烁
                      if (draggedFolderId) {
                        const leavingFolderId = folder.id
                        setTimeout(() => {
                          if (dragOverFolderTargetRef.current === leavingFolderId) {
                            setDragOverFolderId(null)
                          }
                        }, 0)
                      } else if (draggedConvId) {
                        const leavingFolderId = folder.id
                        setTimeout(() => {
                          if (dragOverConvTargetRef.current === leavingFolderId) {
                            setDragOverFolderForConvId(null)
                          }
                        }, 0)
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (draggedFolderId) {
                        if (folder.isDefault || folder.id === draggedFolderId) return
                        const displayedNonDefault = folders
                          .filter(shouldShowFolder)
                          .filter((f) => !f.isDefault)
                        const fromIdx = displayedNonDefault.findIndex(
                          (f) => f.id === draggedFolderId,
                        )
                        const toIdx = displayedNonDefault.findIndex((f) => f.id === folder.id)
                        if (fromIdx === -1 || toIdx === -1) return
                        const reordered = [...displayedNonDefault]
                        const [moved] = reordered.splice(fromIdx, 1)
                        reordered.splice(toIdx, 0, moved)
                        const notDisplayed = folders
                          .filter((f) => !f.isDefault)
                          .filter((f) => !reordered.some((r) => r.id === f.id))
                        manager.reorderFolders([...reordered, ...notDisplayed].map((f) => f.id))
                        loadData()
                        setDraggedFolderId(null)
                        setDragOverFolderId(null)
                        dragOverFolderTargetRef.current = null
                      } else if (draggedConvId) {
                        const conv = conversations[draggedConvId]
                        if (conv && conv.folderId !== folder.id) {
                          manager.moveConversation(draggedConvId, folder.id)
                          loadData()
                        }
                        setDraggedConvId(null)
                        setDragOverFolderForConvId(null)
                        dragOverConvTargetRef.current = null
                      }
                    }}>
                    <div className="conversations-folder-info">
                      {/* 批量模式复选框 */}
                      {batchMode && (
                        <input
                          type="checkbox"
                          className="conversations-folder-checkbox"
                          checked={isFolderAllSelected(folder.id)}
                          ref={(el) => {
                            if (el) el.indeterminate = isFolderPartialSelected(folder.id)
                          }}
                          onChange={(e) => handleFolderSelectAll(folder.id, e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}

                      <span className="conversations-folder-icon" style={{ userSelect: "none" }}>
                        {folder.icon}
                      </span>

                      <Tooltip content={folderName}>
                        <span className="conversations-folder-name">
                          {searchQuery && searchResult?.folderMatches.has(folder.id)
                            ? highlightText(folderName, searchQuery)
                            : folderName}
                        </span>
                      </Tooltip>
                    </div>

                    <div className="conversations-folder-controls">
                      <span className="conversations-folder-count">({count})</span>

                      <button
                        className="conversations-folder-menu-btn"
                        style={{
                          userSelect: "none",
                          visibility: folder.isDefault ? "hidden" : "visible",
                          pointerEvents: folder.isDefault ? "none" : "auto",
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onInteractionStateChange?.(true)
                          setMenu({ type: "folder", folder, anchorEl: e.currentTarget })
                        }}>
                        <MoreHorizontalIcon size={20} />
                      </button>
                    </div>
                  </div>

                  {/* 会话列表 */}
                  {isExpanded && (
                    <div className="conversations-list" data-folder-id={folder.id}>
                      {(() => {
                        const allConvs = getConversationsInFolder(folder.id)
                        if (allConvs.length === 0) {
                          return (
                            <div className="conversations-list-empty">
                              {t("conversationsEmpty")}
                            </div>
                          )
                        }

                        const visibleCount = visibleCounts[folder.id] || PROGRESSIVE_BATCH_SIZE
                        const visibleConvs = allConvs.slice(0, visibleCount)
                        const hasMore = allConvs.length > visibleCount

                        return (
                          <>
                            {visibleConvs.map((conv) => (
                              <ConversationItem
                                key={conv.id}
                                conv={conv}
                                batchMode={batchMode}
                                isSelected={selectedIds.has(conv.id)}
                                isNarrowLayout={isNarrowLayout}
                                searchQuery={searchQuery}
                                searchResult={searchResult}
                                tagMap={tagMap}
                                draggedConvId={draggedConvId}
                                onConversationClick={handleConversationClick}
                                onSelectionChange={setSelectedIds}
                                onInteractionStateChange={onInteractionStateChange}
                                onMenuChange={setMenu}
                                onDragStart={(convId: string) => {
                                  setDraggedConvId(convId)
                                  dragOverConvTargetRef.current = null
                                }}
                                onDragEnd={() => {
                                  setDraggedConvId(null)
                                  setDragOverFolderForConvId(null)
                                  dragOverConvTargetRef.current = null
                                }}
                              />
                            ))}
                            {hasMore && (
                              <div
                                className="conversations-load-more-sentinel"
                                data-folder-id={folder.id}
                                ref={(el) => {
                                  const prev = loadMoreSentinelRefs.current.get(folder.id)
                                  if (prev && prev !== el) {
                                    observerRef.current?.unobserve(prev)
                                  }
                                  if (el) {
                                    loadMoreSentinelRefs.current.set(folder.id, el)
                                    observerRef.current?.observe(el)
                                  } else {
                                    loadMoreSentinelRefs.current.delete(folder.id)
                                  }
                                }}
                                style={{
                                  height: "1px",
                                  margin: 0,
                                  padding: 0,
                                }}
                              />
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )}
                </React.Fragment>
              )
            })
          )}
        </div>

        {/* 批量操作栏 */}
        {batchMode && selectedIds.size > 0 && (
          <div className="conversations-batch-bar">
            <span className="conversations-batch-info">
              {t("batchSelected").replace("{n}", String(selectedIds.size))}
            </span>
            <div className="conversations-batch-btns">
              <Tooltip content={t("exportToClipboard")}>
                <button
                  className="conversations-batch-btn"
                  style={{ padding: "4px 6px", minWidth: "auto", marginLeft: "4px" }}
                  onClick={async () => {
                    const convId = Array.from(selectedIds)[0]
                    await manager.exportConversation(convId, "clipboard")
                  }}>
                  <CopyIcon size={16} />
                </button>
              </Tooltip>
              <Tooltip content={t("batchExport")}>
                <button
                  className="conversations-batch-btn"
                  style={{ padding: "4px 6px", minWidth: "auto", marginLeft: "4px" }}
                  onClick={(e) => {
                    onInteractionStateChange?.(true)
                    setMenu({ type: "export", anchorEl: e.currentTarget })
                  }}>
                  <ExportIcon size={16} />
                </button>
              </Tooltip>
              <Tooltip content={t("batchMove")}>
                <button
                  className="conversations-batch-btn"
                  style={{ padding: "4px 6px", minWidth: "auto", marginLeft: "4px" }}
                  onClick={() => {
                    onInteractionStateChange?.(true)
                    setDialog({ type: "folderSelect", convIds: Array.from(selectedIds) })
                  }}>
                  <FolderMoveIcon size={16} />
                </button>
              </Tooltip>
              <Tooltip content={t("batchDelete")}>
                <button
                  className="conversations-batch-btn danger"
                  style={{ padding: "4px 6px", minWidth: "auto", marginLeft: "4px" }}
                  onClick={() => {
                    onInteractionStateChange?.(true)
                    setDialog({
                      type: "confirm",
                      title: t("batchDelete"),
                      message: t("confirmDeleteSelectedConvs", { count: String(selectedIds.size) }),
                      danger: true,
                      onConfirm: async () => {
                        if (isDeleting) return
                        setDialog(null)
                        setIsDeleting(true)
                        await new Promise((resolve) => setTimeout(resolve, 0))
                        try {
                          const result = await manager.deleteConversations(Array.from(selectedIds))
                          if (result.localDeletedCount === 0) {
                            showToast(t("deleteError"))
                            return
                          }
                          if (result.remoteAttemptedCount > 0 && result.remoteFailedCount > 0) {
                            showToast(
                              `已删除 ${result.localDeletedCount} 个，本地成功，云端失败 ${result.remoteFailedCount} 个`,
                            )
                          }
                          clearSelection()
                          await loadData()
                        } finally {
                          setIsDeleting(false)
                        }
                      },
                    })
                  }}>
                  <DeleteIcon size={16} />
                </button>
              </Tooltip>
              <Tooltip content={t("batchExit")}>
                <button
                  className="conversations-batch-btn cancel"
                  style={{ padding: "4px 6px", minWidth: "auto", marginLeft: "4px" }}
                  onClick={clearSelection}>
                  <ClearIcon size={16} />
                </button>
              </Tooltip>
            </div>
          </div>
        )}
      </div>

      {/* 对话框渲染 */}
      {dialog?.type === "confirm" && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          danger={dialog.danger}
          onConfirm={dialog.onConfirm}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === "folder" && (
        <FolderDialog
          folder={dialog.folder}
          onConfirm={async (name, icon) => {
            let newFolderId: string | null = null
            if (dialog.folder) {
              // 更新
              await manager.updateFolder(dialog.folder.id, { name, icon })
            } else {
              // 新建，假设 createFolder 返回新文件夹的 ID (需要确认 manager 实现，如果是 void 则需要其他方式)
              // 暂时假设 createFolder 返回 void，我们需要通过名字查找或者 manager 修改
              // 实际上 manager.createFolder 是 async 的，我们可以稍微修改 manager 使其返回 ID
              // 但为了保险，这里先不依赖返回值，而是通过逻辑判断
              const folder = await manager.createFolder(name, icon)
              if (folder) newFolderId = folder.id
            }
            loadData()

            // 如果是从"移动到..."跳转来的，则重新打开选择对话框
            if (dialog.returnToSelect) {
              setDialog({
                type: "folderSelect",
                conv: dialog.returnToSelect.conv,
                convIds: dialog.returnToSelect.convIds,
                activeFolderId: newFolderId || undefined,
              })
            } else {
              setDialog(null)
            }
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === "rename" && (
        <RenameDialog
          title={t("conversationsRename")}
          currentValue={dialog.conv.title}
          onConfirm={async (newTitle) => {
            await manager.renameConversation(dialog.conv.id, newTitle)
            loadData()
            setDialog(null)
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === "folderSelect" && (
        <FolderSelectDialog
          folders={folders}
          excludeFolderId={dialog.conv?.folderId}
          activeFolderId={dialog.activeFolderId}
          onSelect={async (folderId) => {
            if (dialog.conv) {
              await manager.moveConversation(dialog.conv.id, folderId)
            } else if (dialog.convIds) {
              for (const id of dialog.convIds) {
                await manager.moveConversation(id, folderId)
              }
              clearSelection()
            }
            loadData()
            setDialog(null)
          }}
          onCancel={() => setDialog(null)}
          onCreateFolder={() =>
            setDialog({
              type: "folder",
              returnToSelect: { conv: dialog.conv, convIds: dialog.convIds },
            })
          }
        />
      )}
      {dialog?.type === "tagManager" && (
        <TagManagerDialog
          tags={tags}
          conv={dialog.conv}
          onCancel={() => setDialog(null)}
          onCreateTag={async (name, color) => manager.createTag(name, color)}
          onUpdateTag={async (tagId, name, color) => manager.updateTag(tagId, name, color)}
          onDeleteTag={async (tagId) => manager.deleteTag(tagId)}
          onSetConversationTags={async (convId, tagIds) =>
            manager.setConversationTags(convId, tagIds)
          }
          onRefresh={() => loadData()}
        />
      )}

      {/* 菜单渲染 */}
      {menu?.type === "folder" && (
        <FolderMenu
          folder={menu.folder}
          anchorEl={menu.anchorEl}
          onClose={() => setMenu(null)}
          onRename={() => {
            setMenu(null)
            setDialog({ type: "folder", folder: menu.folder })
          }}
          onDelete={() => {
            setMenu(null)
            const folderName = getFolderDisplayName(menu.folder)
            const inboxName = getInboxDisplayName()
            const deleteMessage = t("conversationsDeleteConfirm", {
              folder: folderName,
              inbox: inboxName,
            })
            setDialog({
              type: "confirm",
              title: t("conversationsDelete"),
              message:
                deleteMessage === "conversationsDeleteConfirm"
                  ? `Delete folder "${folderName}"? Conversations will be moved to ${inboxName}.`
                  : deleteMessage,
              danger: true,
              onConfirm: async () => {
                await manager.deleteFolder(menu.folder.id)
                loadData()
                setDialog(null)
              },
            })
          }}
        />
      )}
      {menu?.type === "conversation" && (
        <ConversationMenu
          conversation={menu.conv}
          anchorEl={menu.anchorEl}
          anchorPoint={menu.anchorPoint}
          onClose={() => setMenu(null)}
          onOpenInNewTab={() => handleOpenConversationInNewTab(menu.conv)}
          onRename={() => {
            setMenu(null)
            setDialog({ type: "rename", conv: menu.conv })
          }}
          onTogglePin={async () => {
            setMenu(null)
            await manager.togglePin(menu.conv.id)
            loadData()
          }}
          onSetTags={() => {
            setMenu(null)
            setDialog({ type: "tagManager", conv: menu.conv })
          }}
          onMoveTo={() => {
            setMenu(null)
            setDialog({ type: "folderSelect", conv: menu.conv })
          }}
          onExport={() => {
            const conv = menu.conv
            const anchorEl = menu.anchorEl
            const anchorPoint = menu.anchorPoint
            setMenu({ type: "export-conv", conv, anchorEl, anchorPoint })
          }}
          onDelete={() => {
            setMenu(null)
            setDialog({
              type: "confirm",
              title: t("conversationsDelete"),
              message: t("conversationsDeleteConvMsg", { title: menu.conv.title }),
              danger: true,
              onConfirm: async () => {
                if (isDeleting) return
                setDialog(null)
                setIsDeleting(true)
                await new Promise((resolve) => setTimeout(resolve, 0))
                try {
                  const result = await manager.deleteConversation(menu.conv.id)
                  if (!result.localDeleted) {
                    showToast(t("deleteError"))
                    return
                  }
                  if (result.remoteAttempted && !result.remoteSuccess) {
                    showToast(t("deleteConvRemoteError"))
                  }
                  await loadData()
                } finally {
                  setIsDeleting(false)
                }
              },
            })
          }}
        />
      )}
      {menu?.type === "export" && (
        <ExportMenu
          anchorEl={menu.anchorEl}
          onClose={() => setMenu(null)}
          onExportMarkdown={async () => {
            setMenu(null)
            const convId =
              selectedIds.size > 0 ? Array.from(selectedIds)[0] : manager.siteAdapter.getSessionId()
            await manager.exportConversation(convId, "markdown")
          }}
          onExportJSON={async () => {
            setMenu(null)
            const convId =
              selectedIds.size > 0 ? Array.from(selectedIds)[0] : manager.siteAdapter.getSessionId()
            await manager.exportConversation(convId, "json")
          }}
          onExportTXT={async () => {
            setMenu(null)
            const convId =
              selectedIds.size > 0 ? Array.from(selectedIds)[0] : manager.siteAdapter.getSessionId()
            await manager.exportConversation(convId, "txt")
          }}
          onSegmentedExport={() => {
            void openSegmentedExportDialog()
          }}
        />
      )}
      {menu?.type === "export-conv" && (
        <ExportMenu
          anchorEl={menu.anchorEl}
          anchorPoint={menu.anchorPoint}
          onClose={() => setMenu(null)}
          onExportMarkdown={async () => {
            setMenu(null)
            await manager.exportConversation(menu.conv.id, "markdown")
          }}
          onExportJSON={async () => {
            setMenu(null)
            await manager.exportConversation(menu.conv.id, "json")
          }}
          onExportTXT={async () => {
            setMenu(null)
            await manager.exportConversation(menu.conv.id, "txt")
          }}
          onSegmentedExport={() => {
            void openSegmentedExportDialog(menu.conv)
          }}
        />
      )}
      {segmentedExportDraft && (
        <SegmentedExportDialog
          draft={segmentedExportDraft}
          isExporting={isSegmentedExporting}
          onCancel={() => {
            if (!isSegmentedExporting) {
              setSegmentedExportDraft(null)
            }
          }}
          onExport={handleSegmentedExport}
        />
      )}
    </>
  )
}

// ==================== 会话项子组件（React.memo 防止不必要的重渲染）====================

interface ConversationItemProps {
  conv: Conversation
  batchMode: boolean
  isSelected: boolean
  isNarrowLayout: boolean
  searchQuery: string
  searchResult: SearchResult | null
  tagMap: Map<string, Tag>
  draggedConvId: string | null
  onConversationClick: (conv: Conversation) => void
  onSelectionChange: React.Dispatch<React.SetStateAction<Set<string>>>
  onInteractionStateChange?: (isActive: boolean) => void
  onMenuChange: React.Dispatch<React.SetStateAction<MenuType>>
  onDragStart: (convId: string) => void
  onDragEnd: () => void
}

const ConversationItem = React.memo<ConversationItemProps>(
  ({
    conv,
    batchMode,
    isSelected,
    isNarrowLayout,
    searchQuery,
    searchResult,
    tagMap,
    draggedConvId,
    onConversationClick,
    onSelectionChange,
    onInteractionStateChange,
    onMenuChange,
    onDragStart,
    onDragEnd,
  }) => {
    const tagIds = conv.tagIds || []
    const maxVisibleTags = isNarrowLayout ? 1 : 2
    const resolvedTags = tagIds.map((tagId) => tagMap.get(tagId)).filter((tag): tag is Tag => !!tag)
    const visibleTags = resolvedTags.slice(0, maxVisibleTags)
    const hiddenTags = resolvedTags.slice(maxVisibleTags)
    const hiddenTagCount = hiddenTags.length

    return (
      <div
        className={`conversations-item ${draggedConvId === conv.id ? "is-dragging" : ""}`}
        data-id={conv.id}
        draggable
        onDragStart={(e) => {
          onDragStart(conv.id)
          e.dataTransfer.effectAllowed = "move"
          e.dataTransfer.setData("text/plain", conv.id)
        }}
        onDragEnd={onDragEnd}
        onClick={() => onConversationClick(conv)}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onInteractionStateChange?.(true)
          onMenuChange({
            type: "conversation",
            conv,
            anchorEl: null,
            anchorPoint: { left: e.clientX, top: e.clientY },
          })
        }}>
        {batchMode && (
          <input
            type="checkbox"
            className="conversations-item-checkbox"
            checked={isSelected}
            onChange={() => {}}
            onClick={(e) => {
              e.stopPropagation()
              onSelectionChange((prev) => {
                const next = new Set(prev)
                if (next.has(conv.id)) next.delete(conv.id)
                else next.add(conv.id)
                return next
              })
            }}
          />
        )}

        <div className="conversations-item-main">
          <div className="conversations-item-headline">
            <Tooltip
              content={conv.title}
              triggerStyle={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                display: "block",
              }}>
              <span className="conversations-item-title" style={{ userSelect: "none" }}>
                {conv.pinned && (
                  <PinIcon
                    size={12}
                    color="var(--gh-primary, #3b82f6)"
                    style={{
                      display: "inline-block",
                      marginRight: "4px",
                      verticalAlign: "middle",
                    }}
                  />
                )}
                {searchQuery && searchResult?.conversationMatches.has(conv.id)
                  ? highlightText(conv.title || "无标题", searchQuery)
                  : conv.title || "无标题"}
              </span>
            </Tooltip>

            {tagIds.length > 0 && (
              <div className="conversations-tag-list">
                {visibleTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="conversations-tag"
                    style={{ backgroundColor: tag.color }}>
                    {tag.name}
                  </span>
                ))}
                {hiddenTagCount > 0 && (
                  <Tooltip
                    content={
                      <div className="conversations-hidden-tags-tooltip">
                        {resolvedTags.map((tag) => (
                          <div key={tag.id} className="conversations-hidden-tag-item">
                            <span
                              className="conversations-hidden-tag-dot"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span>{tag.name}</span>
                          </div>
                        ))}
                      </div>
                    }
                    delay={120}
                    triggerStyle={{ display: "inline-flex" }}>
                    <span className="conversations-tag conversations-tag-more">
                      +{hiddenTagCount}
                    </span>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="conversations-item-meta">
          <button
            className="conversations-item-menu-btn"
            title={t("more")}
            onClick={(e) => {
              e.stopPropagation()
              onInteractionStateChange?.(true)
              onMenuChange({ type: "conversation", conv, anchorEl: e.currentTarget })
            }}>
            <MoreHorizontalIcon size={20} />
          </button>
        </div>
      </div>
    )
  },
)
