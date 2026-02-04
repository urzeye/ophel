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
import { anchorStore } from "~stores/anchor-store"
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

/**
 * 辅助函数：导航到上/下一个会话
 */
function navigateConversation(
  conversationManager: ConversationManager,
  adapter: SiteAdapter | null,
  direction: "prev" | "next",
) {
  if (!adapter) return

  // 获取当前会话 ID 和会话列表
  const currentSessionId = adapter.getSessionId()
  const conversations = conversationManager.getConversations()

  if (conversations.length === 0) {
    showToast(t("noConversations") || "暂无会话")
    return
  }

  // 按更新时间排序
  const sorted = [...conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

  // 找到当前会话的位置
  const currentIndex = sorted.findIndex((c) => c.id === currentSessionId)

  let targetIndex: number
  if (currentIndex === -1) {
    // 当前会话不在列表中，跳转到第一个
    targetIndex = 0
  } else if (direction === "prev") {
    targetIndex = currentIndex > 0 ? currentIndex - 1 : sorted.length - 1
  } else {
    targetIndex = currentIndex < sorted.length - 1 ? currentIndex + 1 : 0
  }

  const target = sorted[targetIndex]
  if (target) {
    adapter.navigateToConversation(target.id, target.url)
    showToast(target.title || t("untitledConversation") || "未命名会话")
  }
}

interface UseShortcutsOptions {
  settings: Settings | undefined
  adapter: SiteAdapter | null
  outlineManager: OutlineManager | null
  conversationManager: ConversationManager | null
  onPanelToggle: () => void
  onThemeToggle: () => void
  onOpenSettings: () => void
  onShowShortcuts?: () => void // 显示快捷键一览
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
  onShowShortcuts,
  isPanelVisible,
  isSnapped,
  onShowSnappedPanel,
  onToggleScrollLock,
}: UseShortcutsOptions) {
  const shortcutManager = useMemo(() => getShortcutManager(), [])

  // 去顶部
  const scrollToTop = useCallback(async () => {
    if (!adapter) return

    // 保存锚点到全局存储
    const scrollInfo = await getScrollInfo(adapter)
    anchorStore.set(scrollInfo.scrollTop)

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

    // 保存锚点到全局存储
    const scrollInfo = await getScrollInfo(adapter)
    anchorStore.set(scrollInfo.scrollTop)

    await smartScrollToBottom(adapter)

    showToast(t("scrolledToBottom") || "已滚动到底部")
  }, [adapter])

  // 返回锚点
  const goToAnchor = useCallback(async () => {
    if (!adapter) return
    const savedAnchor = anchorStore.get()
    if (savedAnchor === null) {
      showToast(t("noAnchor") || "无可用锚点")
      return
    }

    // 获取当前位置
    const scrollInfo = await getScrollInfo(adapter)
    const currentPos = scrollInfo.scrollTop

    // 跳转到锚点
    await smartScrollTo(adapter, savedAnchor)

    // 交换位置（双向跳转）
    anchorStore.set(currentPos)
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

  // 切换显示用户收藏
  const toggleBookmarks = useCallback(() => {
    outlineManager?.toggleBookmarkMode()
  }, [outlineManager])

  // 只显示用户问题
  const onlyUserQueries = useCallback(() => {
    outlineManager?.setShowUserQueries(true)
    outlineManager?.setLevel(0)
  }, [outlineManager])

  // 上一个/下一个标题
  // 追踪上次导航的目标索引，避免重复依赖视口判定
  const lastNavigatedIndexRef = useRef<number | null>(null)
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

      // 确定当前起始位置：
      // 1. 优先使用上次导航的目标（如果它还在视口附近）
      // 2. 如果上次目标不存在或离视口太远，从视口判断
      let currentFlatIndex = -1

      // 尝试使用上次导航的目标
      if (lastNavigatedIndexRef.current !== null) {
        const idx = flatItems.findIndex((item) => item.index === lastNavigatedIndexRef.current)
        if (idx !== -1) {
          // 检查该项的元素是否在视口附近（±2屏以内）
          const targetItem = flatItems[idx]
          let element = targetItem.element
          if (!element || !element.isConnected) {
            // 尝试重新查找元素
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
          }
          if (element && element.isConnected) {
            const rect = element.getBoundingClientRect()
            const viewportHeight = window.innerHeight
            // 如果距离视口中心超过 2 屏，认为用户手动滚动了
            if (Math.abs(rect.top - viewportHeight / 2) < viewportHeight * 2) {
              currentFlatIndex = idx
            }
          }
        }
      }

      // 回退到视口判断
      if (currentFlatIndex === -1) {
        const scrollContainer = outlineManager.getScrollContainer()
        if (scrollContainer) {
          const visibleItemIndex = outlineManager.findVisibleItemIndex(
            scrollContainer.scrollTop,
            scrollContainer.clientHeight,
          )
          if (visibleItemIndex !== null) {
            currentFlatIndex = flatItems.findIndex((item) => item.index === visibleItemIndex)
          }
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
        // 更新追踪的索引
        lastNavigatedIndexRef.current = targetItem.index

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

    // 分享页面或新对话页面不执行定位
    if (adapter?.isSharePage() || adapter?.isNewConversation()) {
      showToast(t("noConversationToLocate") || "当前无会话可定位")
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
  }, [adapter, settings, isPanelVisible, isSnapped, onPanelToggle, onShowSnappedPanel])

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
    } catch (error) {
      console.error("Export failed:", error)
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
    } catch {
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

  // 聚焦输入框 (Alt+I)
  const focusInput = useCallback(() => {
    if (!adapter) return
    const textarea = adapter.findTextarea()
    if (textarea) {
      textarea.focus()
      showToast(t("inputFocused") || "已聚焦输入框")
    } else {
      showToast(t("noTextarea") || "未找到输入框")
    }
  }, [adapter])

  // 停止生成 (Alt+K)
  const stopGeneration = useCallback(() => {
    if (!adapter) return
    // 查找停止按钮并点击
    const stopSelectors = [
      '[data-testid="stop-button"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="停止"]',
      ".stop-button",
      'md-icon-button[aria-label*="Stop"]',
    ]
    for (const selector of stopSelectors) {
      const btn = document.querySelector(selector) as HTMLElement
      if (btn && btn.offsetParent !== null) {
        btn.click()
        showToast(t("generationStopped") || "已停止生成")
        return
      }
    }
    showToast(t("notGenerating") || "当前未在生成")
  }, [adapter])

  // 上一个会话 (Alt+[)
  const prevConversation = useCallback(() => {
    if (!conversationManager) return
    navigateConversation(conversationManager, adapter, "prev")
  }, [conversationManager, adapter])

  // 下一个会话 (Alt+])
  const nextConversation = useCallback(() => {
    if (!conversationManager) return
    navigateConversation(conversationManager, adapter, "next")
  }, [conversationManager, adapter])

  // 复制最后代码块 (Alt+;)
  const copyLastCodeBlock = useCallback(async () => {
    // 查找页面中所有代码块
    const codeBlocks = document.querySelectorAll("pre code, pre.code-block, .code-block code")
    if (codeBlocks.length === 0) {
      showToast(t("noCodeBlock") || "未找到代码块")
      return
    }
    const lastCodeBlock = codeBlocks[codeBlocks.length - 1]
    const code = lastCodeBlock.textContent || ""
    if (!code.trim()) {
      showToast(t("noCodeBlock") || "未找到代码块")
      return
    }
    try {
      await navigator.clipboard.writeText(code)
      showToast(t("codeBlockCopied") || "代码块已复制")
    } catch {
      showToast(t("copyFailed") || "复制失败")
    }
  }, [])

  // 快捷键一览 (Alt+\)
  const showShortcuts = useCallback(() => {
    if (onShowShortcuts) {
      onShowShortcuts()
    } else {
      // 打开设置面板并导航到键位设置页
      openSettings()
      // 延迟发送导航事件，确保设置面板已打开
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("ophel:navigateSettingsPage", { detail: { page: "shortcuts" } }),
        )
      }, 100)
    }
  }, [onShowShortcuts, openSettings])

  // 显示模型选择菜单 (Alt+/)
  const showModelSelector = useCallback(() => {
    if (!adapter) return
    // 使用适配器的 clickModelSelector 方法，确保使用正确的点击模拟
    const success = adapter.clickModelSelector()
    if (!success) {
      showToast(t("modelSelectorNotFound") || "未找到模型选择器")
    }
  }, [adapter])

  // 导航到设置页面的通用函数
  // 导航到设置页面的通用函数
  const navigateToSettings = useCallback(
    (page: string, subTab?: string) => {
      // 1. 打开设置面板
      openSettings()

      // 2. 延迟发送导航事件
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("ophel:navigateSettingsPage", {
            detail: { page, subTab },
          }),
        )
      }, 100)
    },
    [openSettings],
  )

  const openClaudeSettings = useCallback(
    () => navigateToSettings("siteSettings", "claude"),
    [navigateToSettings],
  )
  const openGeminiSettings = useCallback(
    () => navigateToSettings("siteSettings", "gemini"),
    [navigateToSettings],
  )
  const openThemeSettings = useCallback(
    () => navigateToSettings("appearance"),
    [navigateToSettings],
  )
  const openModelLockSettings = useCallback(
    () => navigateToSettings("siteSettings", "modelLock"),
    [navigateToSettings],
  )

  // 一键切换 Claude Key
  const switchClaudeKey = useCallback(async () => {
    // 仅在 Claude 站点生效 (简单判断)
    // 仅在 Claude 站点生效
    if (!location.hostname.includes("claude.ai") && !location.hostname.includes("claude.com")) {
      showToast(t("claudeShortcutOnlyOnSite") || "快捷键仅在 Claude 站点可用", 2000)
      return
    }

    try {
      // 使用平台抽象层，支持扩展版和油猴脚本版
      const { platform } = await import("~platform")

      const result = await platform.switchNextClaudeKey()

      if (result.success) {
        showToast((t("claudeKeySwitched") || "Session Key 已切换") + `: ${result.keyName}`, 2000)
      } else {
        if (result.error === "claudeOnlyOneKey") {
          showToast(t("claudeOnlyOneKeyTip") || "当前只有一个可用 Key，且正在使用中", 2000)
        } else if (result.error === "noClaudeKeys") {
          showToast(t("noClaudeKeys") || "未配置任何 Session Key", 2000)
        } else {
          // 尝试翻译错误信息，如果没有翻译则显示原始错误
          const translatedError = t(result.error as any)
          showToast(
            translatedError !== result.error
              ? translatedError
              : result.error || t("operationFailed"),
            2000,
          )
        }
      }
    } catch (error) {
      showToast("切换失败: " + (error as Error).message, 2000)
    }
  }, [])

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
      [SHORTCUT_ACTIONS.EXPAND_LEVEL_4]: () => expandToLevel(4),
      [SHORTCUT_ACTIONS.EXPAND_LEVEL_5]: () => expandToLevel(5),
      [SHORTCUT_ACTIONS.EXPAND_LEVEL_6]: () => expandToLevel(6),
      [SHORTCUT_ACTIONS.TOGGLE_USER_QUERIES]: toggleUserQueries,
      [SHORTCUT_ACTIONS.TOGGLE_BOOKMARKS]: toggleBookmarks,
      [SHORTCUT_ACTIONS.ONLY_USER_QUERIES]: onlyUserQueries,
      [SHORTCUT_ACTIONS.PREV_HEADING]: prevHeading,
      [SHORTCUT_ACTIONS.NEXT_HEADING]: nextHeading,
      [SHORTCUT_ACTIONS.LOCATE_OUTLINE]: locateOutline,
      [SHORTCUT_ACTIONS.SEARCH_OUTLINE]: searchOutline,
      [SHORTCUT_ACTIONS.NEW_CONVERSATION]: newConversation,
      [SHORTCUT_ACTIONS.REFRESH_CONVERSATIONS]: refreshConversations,
      [SHORTCUT_ACTIONS.LOCATE_CONVERSATION]: locateConversation,
      [SHORTCUT_ACTIONS.PREV_CONVERSATION]: prevConversation,
      [SHORTCUT_ACTIONS.NEXT_CONVERSATION]: nextConversation,
      [SHORTCUT_ACTIONS.EXPORT_CONVERSATION]: exportConversation,
      [SHORTCUT_ACTIONS.COPY_LATEST_REPLY]: copyLatestReply,
      [SHORTCUT_ACTIONS.COPY_LAST_CODE_BLOCK]: copyLastCodeBlock,
      [SHORTCUT_ACTIONS.TOGGLE_SCROLL_LOCK]: toggleScrollLock,
      [SHORTCUT_ACTIONS.FOCUS_INPUT]: focusInput,
      [SHORTCUT_ACTIONS.STOP_GENERATION]: stopGeneration,
      [SHORTCUT_ACTIONS.SHOW_SHORTCUTS]: showShortcuts,
      [SHORTCUT_ACTIONS.SHOW_MODEL_SELECTOR]: showModelSelector,

      // 新增处理器
      [SHORTCUT_ACTIONS.OPEN_CLAUDE_SETTINGS]: openClaudeSettings,
      [SHORTCUT_ACTIONS.SWITCH_CLAUDE_KEY]: switchClaudeKey,
      [SHORTCUT_ACTIONS.OPEN_GEMINI_SETTINGS]: openGeminiSettings,
      [SHORTCUT_ACTIONS.OPEN_THEME_SETTINGS]: openThemeSettings,
      [SHORTCUT_ACTIONS.OPEN_MODEL_LOCK_SETTINGS]: openModelLockSettings,
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
    toggleBookmarks,
    onlyUserQueries,
    prevHeading,
    nextHeading,
    locateOutline,
    searchOutline,
    newConversation,
    refreshConversations,
    locateConversation,
    prevConversation,
    nextConversation,
    exportConversation,
    copyLatestReply,
    copyLastCodeBlock,
    toggleScrollLock,
    focusInput,
    stopGeneration,
    showShortcuts,
    openClaudeSettings,
    showModelSelector,
    switchClaudeKey,
    openGeminiSettings,
    openThemeSettings,
    openModelLockSettings,
  ])

  return shortcutManager
}
