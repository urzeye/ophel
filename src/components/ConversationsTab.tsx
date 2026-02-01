/**
 * 会话 Tab 组件
 * 从油猴脚本 geminiHelper.user.js 5874~6606 行原封不动移植
 */

import React, { useCallback, useEffect, useRef, useState } from "react"

import type { Conversation, ConversationManager, Folder, Tag } from "~core/conversation-manager"
import { useSettingsStore } from "~stores/settings-store"
import { DOMToolkit } from "~utils/dom-toolkit"
import { t } from "~utils/i18n"
import { localStorage } from "~utils/storage"

import {
  ConfirmDialog,
  FolderDialog,
  FolderSelectDialog,
  RenameDialog,
  TagManagerDialog,
} from "./ConversationDialogs"
import { ConversationMenu, ExportMenu, FolderMenu } from "./ConversationMenus"

import "~styles/conversations.css"

import { BatchIcon, FolderPlusIcon, HourglassIcon, LocateIcon, SyncIcon } from "~components/icons"
import { Tooltip } from "~components/ui/Tooltip"

const LOCATE_PATH =
  "M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"

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
  | { type: "conversation"; conv: Conversation; anchorEl: HTMLElement }
  | { type: "export"; anchorEl: HTMLElement }
  | null

// ==================== 主组件 ====================

export const ConversationsTab: React.FC<ConversationsTabProps> = ({
  manager,
  onInteractionStateChange,
}) => {
  // 设置 - 使用 Zustand store，确保设置变更实时生效
  const { settings } = useSettingsStore()

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

  // 搜索状态
  const [searchQuery, setSearchQuery] = useState("")
  const [filterPinned, setFilterPinned] = useState(false)
  const [filterTagIds, setFilterTagIds] = useState<Set<string>>(new Set())
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [showTagFilterMenu, setShowTagFilterMenu] = useState(false)

  // 对话框和菜单
  const [dialog, setDialog] = useState<DialogType>(null)
  const [menu, setMenu] = useState<MenuType>(null)

  // Refs
  const contentRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const tagFilterMenuRef = useRef<HTMLDivElement>(null)
  const tagFilterBtnRef = useRef<HTMLDivElement>(null)

  // 加载数据（设置由 Zustand store 管理，无需手动加载）
  const loadData = useCallback(async () => {
    setFolders([...manager.getFolders()])
    setConversations({ ...manager.getAllConversations() })
    setTags([...manager.getTags()])
    setLastUsedFolderId(manager.getLastUsedFolderId())
  }, [manager])

  useEffect(() => {
    loadData()
  }, [loadData])

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
        if (query && folder.name.toLowerCase().includes(lowerQuery)) {
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
    const isInteracting = !!(menu || dialog || showTagFilterMenu || batchMode)
    onInteractionStateChange?.(isInteracting)
  }, [menu, dialog, showTagFilterMenu, batchMode, onInteractionStateChange])

  // 防抖搜索
  const handleSearchInput = (value: string) => {
    setSearchQuery(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => handleSearch(value), 150)
  }

  // 同步
  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      await manager.siteAdapter?.loadAllConversations?.()
      await manager.syncConversations(lastUsedFolderId, false)
      loadData()
    } finally {
      setSyncing(false)
    }
  }, [manager, lastUsedFolderId, loadData])

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
  }, [manager, handleSync])

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

  // 获取文件夹下的会话（过滤并排序）
  const getConversationsInFolder = (folderId: string): Conversation[] => {
    let convs = Object.values(conversations).filter((c) => c.folderId === folderId)
    if (searchResult) {
      convs = convs.filter((c) => searchResult.conversationMatches.has(c.id))
    }
    const sidebarOrder = manager.getSidebarConversationOrder()
    convs.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      const indexA = sidebarOrder.indexOf(a.id)
      const indexB = sidebarOrder.indexOf(b.id)
      if (indexA === -1 && indexB === -1) return (b.updatedAt || 0) - (a.updatedAt || 0)
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })
    return convs
  }

  // 获取文件夹计数
  const getFolderCount = (folderId: string): number => {
    if (searchResult) {
      return Object.values(conversations).filter(
        (c) => c.folderId === folderId && searchResult.conversationMatches.has(c.id),
      ).length
    }
    return Object.values(conversations).filter((c) => c.folderId === folderId).length
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

  // 点击会话
  const handleConversationClick = (conv: Conversation) => {
    if (batchMode) {
      const newSelected = new Set(selectedIds)
      if (newSelected.has(conv.id)) newSelected.delete(conv.id)
      else newSelected.add(conv.id)
      setSelectedIds(newSelected)
      return
    }

    // 使用适配器的 navigateToConversation 方法（SPA 导航）
    manager.siteAdapter?.navigateToConversation(conv.id, conv.url)
  }

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

  // ==================== 渲染 ====================

  return (
    <>
      <div
        ref={contentRef}
        className="conversations-content"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
        }}>
        {/* 工具栏 */}
        <div className="conversations-toolbar">
          {/* 1. 同步目标选择 */}
          <Tooltip
            content={t("conversationsSelectFolder") || "选择文件夹"}
            triggerStyle={{ flex: 1, minWidth: 0 }}>
            <select
              className="conversations-folder-select"
              value={lastUsedFolderId}
              onChange={(e) => {
                setLastUsedFolderId(e.target.value)
                manager.setLastUsedFolder(e.target.value)
              }}>
              {folders.map((folder) => {
                const truncatedName =
                  folder.name.length > 20 ? folder.name.slice(0, 20) + "..." : folder.name
                return (
                  <option key={folder.id} value={folder.id} title={folder.name}>
                    {truncatedName}
                  </option>
                )
              })}
            </select>
          </Tooltip>

          {/* 2. 同步按钮 */}
          <Tooltip content={t("conversationsSync") || "同步"}>
            <button
              className="conversations-toolbar-btn sync"
              disabled={syncing}
              onClick={handleSync}>
              {syncing ? <HourglassIcon size={18} /> : <SyncIcon size={18} />}
            </button>
          </Tooltip>

          {/* 3. 定位按钮 */}
          <Tooltip content={t("conversationsLocate") || "定位当前对话"}>
            <button className="conversations-toolbar-btn locate" onClick={handleLocate}>
              <LocateIcon size={18} />
            </button>
          </Tooltip>

          {/* 4. 批量模式 */}
          <Tooltip content={t("conversationsBatchMode") || "批量操作"}>
            <button
              className={`conversations-toolbar-btn batch-mode ${batchMode ? "active" : ""}`}
              onClick={toggleBatchMode}>
              <BatchIcon size={18} />
            </button>
          </Tooltip>

          {/* 5. 新建文件夹 */}
          <Tooltip content={t("conversationsAddFolder") || "新建文件夹"}>
            <button
              className="conversations-toolbar-btn add-folder"
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
          <div className="conversations-search-wrapper" style={{ position: "relative" }}>
            <div className="conversations-search-input-group">
              <input
                ref={searchInputRef}
                type="text"
                className="conversations-search-input"
                placeholder={t("conversationsSearchPlaceholder") || "搜索会话..."}
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
              />
            </div>

            {/* 置顶筛选 */}
            <Tooltip content={t("conversationsFilterPinned") || "筛选置顶"}>
              <div
                className={`conversations-pin-filter-btn ${filterPinned ? "active" : ""}`}
                style={{ userSelect: "none" }}
                onClick={() => setFilterPinned(!filterPinned)}>
                📌
              </div>
            </Tooltip>

            {/* 标签筛选 */}
            <Tooltip content={t("conversationsFilterByTags") || "按标签筛选"}>
              <div
                ref={tagFilterBtnRef}
                className={`conversations-tag-search-btn ${filterTagIds.size > 0 ? "active" : ""}`}
                style={{ userSelect: "none" }}
                onClick={() => {
                  const newState = !showTagFilterMenu
                  if (newState) onInteractionStateChange?.(true)
                  setShowTagFilterMenu(newState)
                }}>
                🏷️
              </div>
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
                      {t("conversationsNoTags") || "暂无标签"}
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
                    {t("conversationsManageTags") || "管理标签"}
                  </div>
                </div>
              </div>
            )}

            {/* 清除按钮 */}
            <Tooltip content={t("conversationsClearAll") || "清除所有筛选"}>
              <div
                className={`conversations-search-clear ${!hasFilters ? "disabled" : ""}`}
                onClick={hasFilters ? clearFilters : undefined}>
                ×
              </div>
            </Tooltip>
          </div>

          {/* 搜索结果计数 */}
          {searchQuery && searchResult && (
            <div className="conversations-result-bar visible">
              {searchResult.totalCount} {t("conversationsSearchResult") || "个结果"}
            </div>
          )}
        </div>

        {/* 文件夹列表 */}
        <div className="conversations-folder-list">
          {folders.filter(shouldShowFolder).length === 0 ? (
            <div className="conversations-empty">
              {searchResult
                ? t("conversationsNoSearchResult") || "未找到匹配结果"
                : t("conversationsEmpty") || "暂无会话"}
            </div>
          ) : (
            folders.filter(shouldShowFolder).map((folder, index) => {
              const isExpanded = shouldExpandFolder(folder.id)
              const count = getFolderCount(folder.id)
              const folderName = folder.name.replace(folder.icon, "").trim()

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
                    className={`conversations-folder-item ${isExpanded ? "expanded" : ""} ${folder.isDefault ? "default" : ""}`}
                    data-folder-id={folder.id}
                    style={{ background: bgVar }}
                    onClick={() => handleFolderClick(folder.id)}>
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

                      {/* 排序按钮 */}
                      {!folder.isDefault && (
                        <div
                          className="conversations-folder-order-btns"
                          style={{ userSelect: "none" }}>
                          <button
                            className="conversations-folder-order-btn"
                            title={t("moveUp") || "上移"}
                            disabled={index <= 1}
                            onClick={(e) => {
                              manager.moveFolder(folder.id, "up")
                              loadData()
                            }}>
                            ↑
                          </button>
                          <button
                            className="conversations-folder-order-btn"
                            title={t("moveDown") || "下移"}
                            disabled={index >= folders.length - 1}
                            onClick={(e) => {
                              manager.moveFolder(folder.id, "down")
                              loadData()
                            }}>
                            ↓
                          </button>
                        </div>
                      )}
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
                        ⋯
                      </button>
                    </div>
                  </div>

                  {/* 会话列表 */}
                  {isExpanded && (
                    <div className="conversations-list" data-folder-id={folder.id}>
                      {getConversationsInFolder(folder.id).length === 0 ? (
                        <div className="conversations-list-empty">
                          {t("conversationsEmpty") || "暂无会话"}
                        </div>
                      ) : (
                        getConversationsInFolder(folder.id).map((conv) => (
                          <div
                            key={conv.id}
                            className="conversations-item"
                            data-id={conv.id}
                            onClick={() => handleConversationClick(conv)}>
                            {batchMode && (
                              <input
                                type="checkbox"
                                className="conversations-item-checkbox"
                                checked={selectedIds.has(conv.id)}
                                onChange={() => {}}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  // 切换选中状态
                                  const newSelected = new Set(selectedIds)
                                  if (newSelected.has(conv.id)) {
                                    newSelected.delete(conv.id)
                                  } else {
                                    newSelected.add(conv.id)
                                  }
                                  setSelectedIds(newSelected)
                                }}
                              />
                            )}
                            <Tooltip
                              content={conv.title}
                              triggerStyle={{
                                flex: 1,
                                minWidth: 0,
                                overflow: "hidden",
                                display: "block",
                              }}>
                              <span
                                className="conversations-item-title"
                                style={{ userSelect: "none" }}>
                                {conv.pinned && "📌 "}
                                {searchQuery && searchResult?.conversationMatches.has(conv.id)
                                  ? highlightText(conv.title || "无标题", searchQuery)
                                  : conv.title || "无标题"}
                              </span>
                            </Tooltip>

                            {/* 标签 */}
                            {conv.tagIds && conv.tagIds.length > 0 && (
                              <div className="conversations-tag-list">
                                {conv.tagIds.map((tagId) => {
                                  const tag = tags.find((t) => t.id === tagId)
                                  return tag ? (
                                    <span
                                      key={tagId}
                                      className="conversations-tag"
                                      style={{ backgroundColor: tag.color }}>
                                      {tag.name}
                                    </span>
                                  ) : null
                                })}
                              </div>
                            )}

                            <div className="conversations-item-meta">
                              <span className="conversations-item-time">
                                {manager.formatTime(conv.updatedAt)}
                              </span>
                              <button
                                className="conversations-item-menu-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onInteractionStateChange?.(true)
                                  setMenu({ type: "conversation", conv, anchorEl: e.currentTarget })
                                }}>
                                ⋯
                              </button>
                            </div>
                          </div>
                        ))
                      )}
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
              {(t("batchSelected") || "已选 {n} 个").replace("{n}", String(selectedIds.size))}
            </span>
            <div className="conversations-batch-btns">
              <Tooltip content={t("exportToClipboard") || "复制 Markdown"}>
                <button
                  className="conversations-batch-btn"
                  style={{ padding: "4px 6px", minWidth: "auto", marginLeft: "4px" }}
                  onClick={async () => {
                    const convId = Array.from(selectedIds)[0]
                    await manager.exportConversation(convId, "clipboard")
                  }}>
                  📋
                </button>
              </Tooltip>
              <Tooltip content={t("batchExport") || "导出"}>
                <button
                  className="conversations-batch-btn"
                  style={{ padding: "4px 6px", minWidth: "auto", marginLeft: "4px" }}
                  onClick={(e) => {
                    onInteractionStateChange?.(true)
                    setMenu({ type: "export", anchorEl: e.currentTarget })
                  }}>
                  📤
                </button>
              </Tooltip>
              <Tooltip content={t("batchMove") || "移动"}>
                <button
                  className="conversations-batch-btn"
                  style={{ padding: "4px 6px", minWidth: "auto", marginLeft: "4px" }}
                  onClick={() => {
                    onInteractionStateChange?.(true)
                    setDialog({ type: "folderSelect", convIds: Array.from(selectedIds) })
                  }}>
                  📂
                </button>
              </Tooltip>
              <Tooltip content={t("batchDelete") || "删除"}>
                <button
                  className="conversations-batch-btn danger"
                  style={{ padding: "4px 6px", minWidth: "auto", marginLeft: "4px" }}
                  onClick={() => {
                    onInteractionStateChange?.(true)
                    setDialog({
                      type: "confirm",
                      title: t("batchDelete") || "批量删除",
                      message: `确定删除选中的 ${selectedIds.size} 个会话吗？`,
                      danger: true,
                      onConfirm: async () => {
                        for (const id of selectedIds) {
                          await manager.deleteConversation(id)
                        }
                        clearSelection()
                        loadData()
                        setDialog(null)
                      },
                    })
                  }}>
                  🗑️
                </button>
              </Tooltip>
              <Tooltip content={t("batchExit") || "退出"}>
                <button
                  className="conversations-batch-btn cancel"
                  style={{ padding: "4px 6px", minWidth: "auto", marginLeft: "4px" }}
                  onClick={clearSelection}>
                  ❌
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
              await manager.updateFolder(dialog.folder.id, { name: `${icon} ${name}`, icon })
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
          title={t("conversationsRename") || "重命名"}
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
            setDialog({
              type: "confirm",
              title: t("conversationsDelete") || "删除",
              message: `确定删除文件夹 "${menu.folder.name}" 吗？其中的会话将移至收件箱。`,
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
          onClose={() => setMenu(null)}
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
          onDelete={() => {
            setMenu(null)
            setDialog({
              type: "confirm",
              title: t("conversationsDelete") || "删除",
              message: `确定删除会话 "${menu.conv.title}" 吗？`,
              danger: true,
              onConfirm: async () => {
                await manager.deleteConversation(menu.conv.id)
                loadData()
                setDialog(null)
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
        />
      )}
    </>
  )
}
