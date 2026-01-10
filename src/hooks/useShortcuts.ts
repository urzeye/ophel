/**
 * 快捷键 Hook
 *
 * 在 App 组件中使用，注册和管理所有快捷键处理器
 */

import { useCallback, useEffect, useMemo, useRef } from "react"

import type { SiteAdapter } from "~adapters/base"
import { SHORTCUT_ACTIONS, type ShortcutActionId } from "~constants/shortcuts"
import type { ConversationManager } from "~core/conversation-manager"
import type { OutlineManager } from "~core/outline-manager"
import { getShortcutManager } from "~core/shortcut-manager"
import { loadHistoryUntil } from "~utils/history-loader"
import { t } from "~utils/i18n"
import {
  getScrollInfo,
  smartScrollTo,
  smartScrollToBottom,
  smartScrollToTop,
} from "~utils/scroll-helper"
import type { Settings } from "~utils/storage"
import { showToast } from "~utils/toast"

interface UseShortcutsOptions {
  settings: Settings | undefined
  adapter: SiteAdapter | null
  outlineManager: OutlineManager | null
  conversationManager: ConversationManager | null
  onPanelToggle: () => void
  onThemeToggle: () => void
  onOpenSettings: () => void
  isPanelVisible?: boolean
  isSnapped?: boolean // 面板是否处于吸附状态
  onShowSnappedPanel?: () => void // 强制显示吸附的面板
  onToggleScrollLock?: () => void // 切换滚动锁定
}

export function useShortcuts({
  settings,
  adapter,
  outlineManager,
  conversationManager,
  onPanelToggle,
  onThemeToggle,
  onOpenSettings,
  isPanelVisible,
  isSnapped,
  onShowSnappedPanel,
  onToggleScrollLock,
}: UseShortcutsOptions) {
  const shortcutManager = useMemo(() => getShortcutManager(), [])

  // 锚点状态（用于返回锚点功能）
  const anchorPositionRef = useRef<number | null>(null)

  // 去顶部
  const scrollToTop = useCallback(async () => {
    if (!adapter) return

    // 保存锚点
    const scrollInfo = await getScrollInfo(adapter)
    anchorPositionRef.current = scrollInfo.scrollTop

    // 通知 MainPanel 更新锚点状态
    window.dispatchEvent(
      new CustomEvent("ophel:anchorSet", { detail: { position: scrollInfo.scrollTop } }),
    )

    await loadHistoryUntil({
      adapter,
      loadAll: true,
      allowShortCircuit: true,
    })
    await smartScrollToTop(adapter)

    showToast(t("scrolledToTop") || "已滚动到顶部")
  }, [adapter])

  // 去底部
  const scrollToBottom = useCallback(async () => {
    if (!adapter) return

    // 保存锚点
    const scrollInfo = await getScrollInfo(adapter)
    anchorPositionRef.current = scrollInfo.scrollTop

    // 通知 MainPanel 更新锚点状态
    window.dispatchEvent(
      new CustomEvent("ophel:anchorSet", { detail: { position: scrollInfo.scrollTop } }),
    )

    await smartScrollToBottom(adapter)
    showToast(t("scrolledToBottom") || "已滚动到底部")
  }, [adapter])

  // 返回锚点
  const goToAnchor = useCallback(async () => {
    if (!adapter) return
    if (anchorPositionRef.current === null) {
      showToast(t("noAnchor") || "无可用锚点")
      return
    }

    // 获取当前位置
    const scrollInfo = await getScrollInfo(adapter)
    const currentPos = scrollInfo.scrollTop

    // 跳转到锚点
    await smartScrollTo(adapter, anchorPositionRef.current)

    // 交换位置（双向跳转）
    anchorPositionRef.current = currentPos
  }, [adapter])

  // 刷新大纲
  const refreshOutline = useCallback(() => {
    if (!outlineManager) return
    outlineManager.refresh()
    showToast(t("outlineRefreshed") || "大纲已刷新")
  }, [outlineManager])

  // 展开/折叠大纲
  const toggleOutlineExpand = useCallback(() => {
    if (!outlineManager) return
    const state = outlineManager.getState()
    if (state.isAllExpanded) {
      outlineManager.collapseAll()
    } else {
      outlineManager.expandAll()
    }
  }, [outlineManager])

  // 展开到指定层级
  const expandToLevel = useCallback(
    (level: number) => {
      outlineManager?.setLevel(level)
    },
    [outlineManager],
  )

  // 切换显示用户问题
  const toggleUserQueries = useCallback(() => {
    outlineManager?.toggleGroupMode()
  }, [outlineManager])

  // 上一个/下一个标题
  const navigateHeading = useCallback(
    (direction: "prev" | "next") => {
      if (!outlineManager) return

      // 获取大纲状态
      const state = outlineManager.getState()
      const tree = state.tree
      if (!tree || tree.length === 0) return

      // 扁平化树结构获取所有可见项
      const flattenTree = (nodes: typeof tree): typeof tree => {
        const result: typeof tree = []
        for (const node of nodes) {
          result.push(node)
          if (node.children && node.children.length > 0 && !node.collapsed) {
            result.push(...flattenTree(node.children))
          }
        }
        return result
      }
      const flatItems = flattenTree(tree)
      if (flatItems.length === 0) return

      // 尝试找到当前可见项的索引
      let currentFlatIndex = -1
      const scrollContainer = outlineManager.getScrollContainer()

      if (scrollContainer) {
        const rect = scrollContainer.getBoundingClientRect()
        // 使用 OutlineManager 的逻辑查找当前可见项
        const visibleItemIndex = outlineManager.findVisibleItemIndex(rect.top, rect.bottom)

        if (visibleItemIndex !== null) {
          // 在扁平列表中找到对应项
          currentFlatIndex = flatItems.findIndex((item) => item.index === visibleItemIndex)
        }
      }

      // 计算目标索引
      let targetFlatIndex: number
      if (currentFlatIndex === -1) {
        // 如果没有找到可见项，默认从头或尾开始
        targetFlatIndex = direction === "prev" ? flatItems.length - 1 : 0
      } else {
        if (direction === "prev") {
          targetFlatIndex = Math.max(0, currentFlatIndex - 1)
        } else {
          targetFlatIndex = Math.min(flatItems.length - 1, currentFlatIndex + 1)
        }
      }

      const targetItem = flatItems[targetFlatIndex]
      if (targetItem) {
        // 1. 在大纲中揭示并高亮
        outlineManager.revealNode(targetItem.index)

        // 2. 页面滚动到目标位置
        let element = targetItem.element
        // 如果元素丢失重新查找（复用 OutlineTab 的逻辑）
        if (!element || !element.isConnected) {
          if (targetItem.isUserQuery && targetItem.level === 0) {
            element = outlineManager.findUserQueryElement(
              targetItem.queryIndex!,
              targetItem.text,
            ) as HTMLElement
          } else {
            element = outlineManager.findElementByHeading(
              targetItem.level,
              targetItem.text,
            ) as HTMLElement
          }
          if (element) {
            targetItem.element = element
          }
        }

        if (element && element.isConnected) {
          element.scrollIntoView({ behavior: "smooth", block: "start" })
          showToast(targetItem.text, 1000) // 显示跳转提示
        }
      }
    },
    [outlineManager],
  )

  const prevHeading = useCallback(() => navigateHeading("prev"), [navigateHeading])
  const nextHeading = useCallback(() => navigateHeading("next"), [navigateHeading])

  // 刷新会话列表
  const refreshConversations = useCallback(() => {
    showToast(t("syncingConversations") || "正在同步会话列表...")
    // 触发事件，ConversationsTab 会监听并执行同步
    window.dispatchEvent(new CustomEvent("ophel:refreshConversations"))
  }, [])

  // 打开设置（Alt+,）
  const openSettings = useCallback(() => {
    onOpenSettings()
    // 如果面板未打开，自动打开
    if (!isPanelVisible) {
      onPanelToggle()
    }
  }, [onOpenSettings, isPanelVisible, onPanelToggle])

  // 切换 Tab 辅助函数
  const switchTab = useCallback(
    (index: 0 | 1 | 2) => {
      // 1. 如果面板未打开，打开面板
      if (!isPanelVisible) {
        onPanelToggle()
      } else if (isSnapped && onShowSnappedPanel) {
        onShowSnappedPanel()
      }

      // 2. 发送切换事件，由 MainPanel 处理具体的 Tab ID
      window.dispatchEvent(
        new CustomEvent("ophel:switchTab", {
          detail: { index },
        }),
      )
    },
    [isPanelVisible, onPanelToggle, isSnapped, onShowSnappedPanel],
  )

  const switchTab1 = useCallback(() => switchTab(0), [switchTab])
  const switchTab2 = useCallback(() => switchTab(1), [switchTab])
  const switchTab3 = useCallback(() => switchTab(2), [switchTab])

  // 定位大纲（Alt+L）
  const locateOutline = useCallback(() => {
    // 检查大纲功能是否启用
    if (!settings?.features?.outline?.enabled) {
      showToast(t("outlineDisabled") || "大纲功能已禁用")
      return
    }

    // 如果面板未打开，先打开面板
    const needOpenPanel = !isPanelVisible
    if (needOpenPanel) {
      onPanelToggle()
    } else if (isSnapped && onShowSnappedPanel) {
      // 如果面板已打开但处于吸附状态，强制显示
      onShowSnappedPanel()
    }

    // 设置全局标记，OutlineTab 挂载时会检查这个标记
    // 同时触发事件，如果组件已挂载则立即处理
    ;(window as any).__ophelPendingLocateOutline = true
    window.dispatchEvent(new CustomEvent("ophel:locateOutline"))

    showToast(t("locatingOutline") || "正在定位大纲位置...")
  }, [settings, isPanelVisible, isSnapped, onPanelToggle, onShowSnappedPanel])

  // 搜索大纲（Alt+F）
  const searchOutline = useCallback(() => {
    // 检查大纲功能是否启用
    if (!settings?.features?.outline?.enabled) {
      showToast(t("outlineDisabled") || "大纲功能已禁用")
      return
    }

    // 如果面板未打开，先打开面板
    const needOpenPanel = !isPanelVisible
    if (needOpenPanel) {
      onPanelToggle()
    } else if (isSnapped && onShowSnappedPanel) {
      // 如果面板已打开但处于吸附状态，强制显示
      onShowSnappedPanel()
    }

    // 设置全局标记，确保 OutlineTab 挂载后能检测到
    ;(window as any).__ophelPendingSearchOutline = true

    // 触发事件通知 MainPanel 切换 Tab，以及 OutlineTab 聚焦输入框
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("ophel:searchOutline"))
    }, 50)
  }, [settings, isPanelVisible, isSnapped, onPanelToggle, onShowSnappedPanel])

  // 定位当前会话（Alt+Shift+L）
  const locateConversation = useCallback(() => {
    // 检查会话功能是否启用
    if (!settings?.features?.conversations?.enabled) {
      showToast(t("conversationsDisabled") || "会话功能已禁用")
      return
    }

    // 如果面板未打开，先打开面板
    const needOpenPanel = !isPanelVisible
    if (needOpenPanel) {
      onPanelToggle()
    } else if (isSnapped && onShowSnappedPanel) {
      // 如果面板已打开但处于吸附状态，强制显示
      onShowSnappedPanel()
    }

    // 设置全局标记，ConversationsTab 挂载时会检查这个标记
    ;(window as any).__ophelPendingLocateConversation = true
    window.dispatchEvent(new CustomEvent("ophel:locateConversation"))

    showToast(t("locatingConversation") || "正在定位当前会话...")
  }, [settings, isPanelVisible, isSnapped, onPanelToggle, onShowSnappedPanel])

  // 新会话（触发 Ctrl+Shift+O）
  const newConversation = useCallback(() => {
    // 模拟 Ctrl+Shift+O 快捷键
    const event = new KeyboardEvent("keydown", {
      key: "o",
      code: "KeyO",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
    })
    document.dispatchEvent(event)
  }, [])

  // 导出对话
  const exportConversation = useCallback(async () => {
    if (!conversationManager || !adapter) return

    const sessionId = adapter.getSessionId()
    if (!sessionId) {
      showToast(t("exportNeedOpenFirst") || "请先打开要导出的会话")
      return
    }

    showToast(t("exportStarted") || "开始导出对话...")
    try {
      // 默认导出为 Markdown 文件
      await conversationManager.exportConversation(sessionId, "markdown")
      showToast(t("exportSuccess") || "导出成功")
    } catch (e) {
      console.error("Export failed:", e)
      showToast(t("exportFailed") || "导出失败")
    }
  }, [conversationManager, adapter])

  // 复制最新回复
  const copyLatestReply = useCallback(async () => {
    if (!adapter) return

    const text = adapter.getLatestReplyText()
    if (!text) {
      showToast(t("noReplyToCopy") || "无可复制内容")
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      showToast(t("replyCopied") || "已复制最新回复")
    } catch (e) {
      showToast(t("copyFailed") || "复制失败")
    }
  }, [adapter])

  // 锁定滚动
  const toggleScrollLock = useCallback(() => {
    if (onToggleScrollLock) {
      onToggleScrollLock()
    } else {
      // Fallback 仅提示
      showToast(t("scrollLockToggled") || "滚动锁定已切换")
    }
  }, [onToggleScrollLock])

  // 更新设置
  useEffect(() => {
    shortcutManager.updateSettings(settings?.shortcuts)
  }, [shortcutManager, settings?.shortcuts])

  // 注册处理器
  useEffect(() => {
    const handlers: Partial<Record<ShortcutActionId, () => void>> = {
      [SHORTCUT_ACTIONS.SCROLL_TOP]: scrollToTop,
      [SHORTCUT_ACTIONS.SCROLL_BOTTOM]: scrollToBottom,
      [SHORTCUT_ACTIONS.GO_TO_ANCHOR]: goToAnchor,
      [SHORTCUT_ACTIONS.TOGGLE_PANEL]: onPanelToggle,
      [SHORTCUT_ACTIONS.TOGGLE_THEME]: onThemeToggle,
      [SHORTCUT_ACTIONS.OPEN_SETTINGS]: openSettings,
      [SHORTCUT_ACTIONS.SWITCH_TAB_1]: switchTab1,
      [SHORTCUT_ACTIONS.SWITCH_TAB_2]: switchTab2,
      [SHORTCUT_ACTIONS.SWITCH_TAB_3]: switchTab3,
      [SHORTCUT_ACTIONS.REFRESH_OUTLINE]: refreshOutline,
      [SHORTCUT_ACTIONS.TOGGLE_OUTLINE_EXPAND]: toggleOutlineExpand,
      [SHORTCUT_ACTIONS.EXPAND_LEVEL_1]: () => expandToLevel(1),
      [SHORTCUT_ACTIONS.EXPAND_LEVEL_2]: () => expandToLevel(2),
      [SHORTCUT_ACTIONS.EXPAND_LEVEL_3]: () => expandToLevel(3),
      [SHORTCUT_ACTIONS.TOGGLE_USER_QUERIES]: toggleUserQueries,
      [SHORTCUT_ACTIONS.PREV_HEADING]: prevHeading,
      [SHORTCUT_ACTIONS.NEXT_HEADING]: nextHeading,
      [SHORTCUT_ACTIONS.LOCATE_OUTLINE]: locateOutline,
      [SHORTCUT_ACTIONS.SEARCH_OUTLINE]: searchOutline,
      [SHORTCUT_ACTIONS.NEW_CONVERSATION]: newConversation,
      [SHORTCUT_ACTIONS.REFRESH_CONVERSATIONS]: refreshConversations,
      [SHORTCUT_ACTIONS.LOCATE_CONVERSATION]: locateConversation,
      [SHORTCUT_ACTIONS.EXPORT_CONVERSATION]: exportConversation,
      [SHORTCUT_ACTIONS.COPY_LATEST_REPLY]: copyLatestReply,
      [SHORTCUT_ACTIONS.TOGGLE_SCROLL_LOCK]: toggleScrollLock,
    }

    shortcutManager.registerAll(handlers)
    shortcutManager.startListening()

    return () => {
      shortcutManager.stopListening()
      shortcutManager.clearAll()
    }
  }, [
    shortcutManager,
    scrollToTop,
    scrollToBottom,
    goToAnchor,
    onPanelToggle,
    onThemeToggle,
    openSettings,
    switchTab1,
    switchTab2,
    switchTab3,
    refreshOutline,
    toggleOutlineExpand,
    expandToLevel,
    toggleUserQueries,
    prevHeading,
    nextHeading,
    locateOutline,
    newConversation,
    refreshConversations,
    locateConversation,
    exportConversation,
    copyLatestReply,
    toggleScrollLock,
  ])

  return shortcutManager
}
