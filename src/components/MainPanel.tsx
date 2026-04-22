import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

import type { SiteAdapter } from "~adapters/base"
import {
  AnchorIcon,
  ConversationIcon,
  FloatingModeIcon,
  MinimizeIcon,
  NewTabIcon,
  OutlineIcon,
  PromptIcon,
  // RefreshIcon, (刷新按钮已注释掉)
  ScrollBottomIcon,
  ScrollTopIcon,
  SettingsIcon,
  SnapToEdgeIcon,
  ThemeDarkIcon,
  ThemeLightIcon,
} from "~components/icons"
import { SparkleIcon } from "~components/icons/SparkleIcon"
import { TAB_IDS } from "~constants"
import { DEFAULT_KEYBINDINGS, formatShortcut, isMacOS } from "~constants/shortcuts"
import type { ConversationManager } from "~core/conversation-manager"
import type { OutlineManager } from "~core/outline-manager"
import type { PromptManager } from "~core/prompt-manager"
import type { ThemeTransitionOrigin } from "~core/theme-manager"
import { useDraggable } from "~hooks/useDraggable"
import { useSettingsStore } from "~stores/settings-store"
import { attachEditableKeyboardFocusGuard } from "~utils/dom-toolkit"
import { loadHistoryUntil } from "~utils/history-loader"
import { t } from "~utils/i18n"
import { getScrollInfo, smartScrollTo, smartScrollToBottom } from "~utils/scroll-helper"
import { DEFAULT_SETTINGS, getSiteTheme, type Prompt } from "~utils/storage"
import { showToast } from "~utils/toast"
import { anchorStore } from "~stores/anchor-store"

import { ConversationsTab } from "./ConversationsTab"
import { LoadingOverlay } from "./LoadingOverlay"
import { OutlineTab } from "./OutlineTab"
import { PromptsTab } from "./PromptsTab"
import { Tooltip } from "~components/ui/Tooltip"

interface MainPanelProps {
  onClose: () => void
  isOpen: boolean
  isScrolling?: boolean
  promptManager: PromptManager
  conversationManager: ConversationManager
  outlineManager: OutlineManager
  adapter?: SiteAdapter | null
  onThemeToggle?: (event?: ThemeTransitionOrigin) => void
  themeMode?: "light" | "dark"
  selectedPromptId?: string | null
  onPromptSelect?: (prompt: Prompt | null) => void
  edgeSnapState?: "left" | "right" | null
  isEdgePeeking?: boolean
  onEdgeSnap?: (side: "left" | "right") => void
  onUnsnap?: () => void
  onInteractionStateChange?: (isActive: boolean) => void
  onOpenSettings?: () => void
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>
}

export const MainPanel: React.FC<MainPanelProps> = ({
  onClose,
  isOpen,
  isScrolling,
  promptManager,
  conversationManager,
  outlineManager,
  adapter,
  onThemeToggle,
  themeMode,
  selectedPromptId,
  onPromptSelect,
  edgeSnapState,
  isEdgePeeking = false,
  onEdgeSnap,
  onUnsnap,
  onInteractionStateChange,
  onOpenSettings,
  onMouseEnter,
  onMouseLeave,
}) => {
  const getButtonCenter = useCallback((button: HTMLButtonElement): ThemeTransitionOrigin => {
    const rect = button.getBoundingClientRect()
    return {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }
  }, [])

  const { settings, updateNestedSetting } = useSettingsStore()
  const currentSettings = settings || DEFAULT_SETTINGS
  const tabOrder = currentSettings.features?.order || DEFAULT_SETTINGS.features.order
  const siteId = adapter?.getSiteId() || "_default"
  const siteTheme = getSiteTheme(currentSettings, siteId)
  const resolvedThemeMode = themeMode || (siteTheme.mode === "dark" ? "dark" : "light")
  const currentThemeStyleId =
    resolvedThemeMode === "light"
      ? siteTheme.lightStyleId || "google-gradient"
      : siteTheme.darkStyleId || "classic-dark"
  // 浅色模式：所有彩色 header 背景 → currentColor（白色），永远可见
  // 深色模式：深色纯色 header → 品牌渐变，美观且对比鲜明
  const panelSparkleColor = resolvedThemeMode === "dark" ? "brand" : "currentColor"
  const currentCustomStyle = Array.isArray(currentSettings.theme?.customStyles)
    ? currentSettings.theme.customStyles.find((style) => style.id === currentThemeStyleId)
    : null

  // 拖拽功能（高性能版本：直接 DOM 操作，不触发 React 渲染）
  const { panelRef, headerRef } = useDraggable({
    edgeSnapHide: currentSettings.panel?.panelMode === "edge-snap",
    edgeSnapState, // 传递当前吸附状态
    snapThreshold: currentSettings.panel?.edgeSnapThreshold ?? 30,
    onEdgeSnap,
    onUnsnap,
  })

  // 模式切换时重置面板 DOM 位置
  // useDraggable 通过直接 DOM 操作设置了 left/top/right/transform，React 无法感知这些变化，
  // 所以需要在模式切换时手动重置
  const prevPanelModeRef = useRef(currentSettings.panel?.panelMode)
  // 保存面板当前位置，用于 header 按钮触发的"原地固定"
  const savedPeekingRectRef = useRef<DOMRect | null>(null)
  // 标题 tooltip 随机 tips（动态读取实际快捷键配置 + 平台检测）
  const isMac = useMemo(() => isMacOS(), [])
  const keybindings = currentSettings.shortcuts?.keybindings ?? DEFAULT_KEYBINDINGS
  const getTips = useCallback(() => {
    const fmt = (id: string) => {
      const shortcut = keybindings[id] ?? DEFAULT_KEYBINDINGS[id]
      return shortcut ? formatShortcut(shortcut, isMac) : ""
    }
    return [
      t("tip1", { modifier: isMac ? "⌘" : "Ctrl" }),
      t("tip2"),
      t("tip3", { shortcut: fmt("showShortcuts") }),
      t("tip4", { shortcut: fmt("openGlobalSearch") }),
      t("tip5", { shortcut: fmt("copyLatestReply") }),
      t("tip6", {
        shortcut: fmt("prevHeading") + "/" + fmt("nextHeading"),
      }),
    ]
  }, [keybindings, isMac])
  const [currentTip, setCurrentTip] = useState(() => {
    const kb = currentSettings.shortcuts?.keybindings ?? DEFAULT_KEYBINDINGS
    const fmt = (id: string) => {
      const shortcut = kb[id] ?? DEFAULT_KEYBINDINGS[id]
      return shortcut ? formatShortcut(shortcut, isMacOS()) : ""
    }
    const tips = [
      t("tip1", { modifier: isMacOS() ? "⌘" : "Ctrl" }),
      t("tip2"),
      t("tip3", { shortcut: fmt("showShortcuts") }),
      t("tip4", { shortcut: fmt("openGlobalSearch") }),
      t("tip5", { shortcut: fmt("copyLatestReply") }),
      t("tip6", { shortcut: fmt("prevHeading") + "/" + fmt("nextHeading") }),
    ]
    return tips[Math.floor(Math.random() * tips.length)]
  })
  const pointerEventsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 使用 useLayoutEffect 保证在浏览器绘制前完成定位，避免模式切换时闪烁
  useLayoutEffect(() => {
    const currentMode = currentSettings.panel?.panelMode
    const prevMode = prevPanelModeRef.current
    prevPanelModeRef.current = currentMode

    if (prevMode === currentMode || !panelRef.current) return

    const panel = panelRef.current
    panel.classList.remove("dragging")

    if (prevMode === "edge-snap" && currentMode === "floating") {
      // 恢复 pointer-events：floating→edge-snap 会临时禁用，
      // 若快速切回 floating，cleanup 已取消恢复定时器，需在此处手动恢复
      panel.style.pointerEvents = ""

      const savedRect = savedPeekingRectRef.current
      savedPeekingRectRef.current = null

      // 优先使用 header 按钮保存的 peeking 位置，否则用面板当前 rect 原地固定
      const fixRect = savedRect ?? panel.getBoundingClientRect()

      // 判断面板是否处于 peeking 展开态（至少 50% 宽度在视口内），排除吸附收缩（胶囊条）
      const visibleWidth = fixRect
        ? Math.min(fixRect.right, window.innerWidth) - Math.max(fixRect.left, 0)
        : 0
      const isVisible = fixRect.width > 0 && visibleWidth >= fixRect.width * 0.5

      if (isVisible) {
        // 面板可见（peeking 展开）：原地固定，无论切换来源
        panel.style.left = `${fixRect.left}px`
        panel.style.top = `${fixRect.top}px`
        panel.style.right = "auto"
        panel.style.transform = "none"
      } else {
        // 面板不可见（吸附收缩态）：使用默认边距贴边展开，保留垂直位置（兜底）
        const pos = currentSettings.panel?.defaultPosition ?? "right"
        const edgeDist = currentSettings.panel?.defaultEdgeDistance ?? 0
        const currentTop = fixRect ? fixRect.top : null

        if (currentTop !== null && currentTop >= 0 && currentTop < window.innerHeight) {
          panel.style.top = `${currentTop}px`
          panel.style.transform = "none"
        } else {
          panel.style.top = "50%"
          panel.style.transform = "translateY(-50%)"
        }
        if (pos === "left") {
          panel.style.left = `${edgeDist}px`
          panel.style.right = "auto"
        } else {
          panel.style.right = `${edgeDist}px`
          panel.style.left = "auto"
        }
      }
    } else if (prevMode === "floating" && currentMode === "edge-snap") {
      // 悬浮 → 吸附：先添加 CSS 吸附类，确保 !important 定位在清除 inline style 前生效
      const pos = currentSettings.panel?.defaultPosition ?? "right"
      panel.classList.add(`edge-snapped-${pos}`)
      panel.style.top = "50%"
      panel.style.transform = "translateY(-50%)"
      panel.style.left = ""
      panel.style.right = ""
      // 临时禁用 pointer-events，防止 CSS :hover 在鼠标仍在面板区域时阻止收缩动画
      panel.style.pointerEvents = "none"
      if (pointerEventsTimerRef.current) clearTimeout(pointerEventsTimerRef.current)
      pointerEventsTimerRef.current = setTimeout(() => {
        panel.style.pointerEvents = ""
        pointerEventsTimerRef.current = null
      }, 400)
    }

    return () => {
      if (pointerEventsTimerRef.current) {
        clearTimeout(pointerEventsTimerRef.current)
        pointerEventsTimerRef.current = null
      }
    }
  }, [
    currentSettings.panel?.panelMode,
    currentSettings.panel?.defaultEdgeDistance,
    currentSettings.panel?.defaultPosition,
    panelRef,
  ])

  // 计算默认位置样式
  const defaultPosition = currentSettings.panel?.defaultPosition ?? "right"
  const defaultEdgeDistance = currentSettings.panel?.defaultEdgeDistance ?? 40

  // 获取排序后的首个 tab
  // tabOrder 是 string[]，数组顺序就是显示顺序
  const getFirstTab = (order: string[]): string => {
    if (order && order.length > 0) {
      return order[0]
    }
    return TAB_IDS.PROMPTS
  }

  // 初始化 activeTab（先用默认值，等 settings 加载后更新）
  const [activeTab, setActiveTab] = useState<string>(TAB_IDS.PROMPTS)
  const [isInitialized, setIsInitialized] = useState(false)

  // settings 加载完成后，设置为用户设置的首个 tab
  useEffect(() => {
    if (settings && !isInitialized) {
      setActiveTab(getFirstTab(settings.features?.order))
      setIsInitialized(true)
    }
  }, [settings, isInitialized])

  // 当 tabOrder 变化时，如果当前 activeTab 不在列表中，则切换到首个 tab
  useEffect(() => {
    if (isInitialized && tabOrder && tabOrder.length > 0) {
      if (!tabOrder.includes(activeTab)) {
        setActiveTab(getFirstTab(tabOrder))
      }
    }
  }, [tabOrder, isInitialized, activeTab])

  // 监听快捷键触发的 tab 切换事件
  useEffect(() => {
    const handleSwitchToOutline = () => {
      setActiveTab(TAB_IDS.OUTLINE)
    }
    const handleSwitchToConversations = () => {
      setActiveTab(TAB_IDS.CONVERSATIONS)
    }

    const handleSwitchTab = (e: CustomEvent<{ index: number }>) => {
      const idx = e.detail?.index
      if (typeof idx === "number" && tabOrder[idx]) {
        setActiveTab(tabOrder[idx])
      }
    }

    window.addEventListener("ophel:locateOutline", handleSwitchToOutline)
    window.addEventListener("ophel:searchOutline", handleSwitchToOutline)
    window.addEventListener("ophel:locateConversation", handleSwitchToConversations)
    window.addEventListener("ophel:switchTab", handleSwitchTab as EventListener)

    return () => {
      window.removeEventListener("ophel:locateOutline", handleSwitchToOutline)
      window.removeEventListener("ophel:searchOutline", handleSwitchToOutline)
      window.removeEventListener("ophel:locateConversation", handleSwitchToConversations)
      window.removeEventListener("ophel:switchTab", handleSwitchTab as EventListener)
    }
  }, [tabOrder])

  // 防止原生站点在面板输入时抢占焦点或吞掉按键
  useEffect(() => {
    if (!isOpen) {
      return
    }

    const panel = panelRef.current
    if (!panel) {
      return
    }

    // 直接在面板元素上监听，覆盖 Shadow DOM 内部的输入控件
    return attachEditableKeyboardFocusGuard(panel)
  }, [isOpen, panelRef])

  // === 锚点状态（使用全局存储） ===
  const anchorPosition = useSyncExternalStore(anchorStore.subscribe, anchorStore.getSnapshot)
  const hasAnchor = anchorPosition !== null

  // === 加载状态（遮罩） ===
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [loadingText, setLoadingText] = useState("")
  const abortLoadingRef = useRef(false)

  // 滚动到顶部（自动记录当前位置为锚点，使用 HistoryLoader 加载全部历史）
  const scrollToTop = useCallback(async () => {
    // 遮罩延迟显示
    const OVERLAY_DELAY_MS = 1600
    abortLoadingRef.current = false

    // 创建 AbortController 用于中断
    const abortController = new AbortController()
    const checkAbort = () => {
      if (abortLoadingRef.current) {
        abortController.abort()
      }
    }
    const abortCheckInterval = setInterval(checkAbort, 100)

    // 延迟显示遮罩的定时器
    let overlayTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (!abortLoadingRef.current) {
        setIsLoadingHistory(true)
        setLoadingText(t("loadingHistory"))
      }
    }, OVERLAY_DELAY_MS)

    try {
      const result = await loadHistoryUntil({
        adapter: adapter || null,
        loadAll: true,
        signal: abortController.signal,
        allowShortCircuit: true, // 用户主动点击，启用短对话短路
        onProgress: (msg) => {
          setLoadingText(`${t("loadingHistory")} ${msg}`)
        },
      })
      anchorStore.set(result.previousScrollTop)

      // 清理遮罩
      if (overlayTimer) {
        clearTimeout(overlayTimer)
        overlayTimer = null
      }
      setIsLoadingHistory(false)
      setLoadingText("")

      // 显示完成提示（静默模式不显示）
      if (result.success && !result.silent) {
        showToast(t("historyLoaded"), 2000)
      }
    } finally {
      clearInterval(abortCheckInterval)
      if (overlayTimer) {
        clearTimeout(overlayTimer)
      }
    }
  }, [adapter])

  // 停止加载
  const stopLoading = useCallback(() => {
    abortLoadingRef.current = true
  }, [])

  // 滚动到底部（自动记录当前位置为锚点）
  const scrollToBottom = useCallback(async () => {
    const { previousScrollTop } = await smartScrollToBottom(adapter || null)
    anchorStore.set(previousScrollTop)
  }, [adapter])

  // 跳转到锚点（实现位置交换，支持来回跳转）
  const goToAnchor = useCallback(async () => {
    const savedAnchor = anchorStore.get()
    if (savedAnchor === null) return

    // 获取当前位置
    const scrollInfo = await getScrollInfo(adapter || null)
    const currentPos = scrollInfo.scrollTop

    // 跳转到锚点
    await smartScrollTo(adapter || null, savedAnchor)

    // 交换位置
    anchorStore.set(currentPos)
  }, [adapter])

  // 记录锚点位置（每次跳转大纲时调用）
  const saveAnchor = useCallback(async () => {
    const scrollInfo = await getScrollInfo(adapter || null)
    anchorStore.set(scrollInfo.scrollTop)
  }, [adapter])

  if (!isOpen) return null

  // 过滤出启用的 Tab（设置页通过 header 按钮进入，不在 tab 栏显示）
  const visibleTabs = tabOrder.filter((tabId) => {
    if (tabId === TAB_IDS.SETTINGS) return false // 设置在 header 中
    // 检查每个 Tab 的 enabled 状态
    if (tabId === TAB_IDS.PROMPTS && currentSettings.features?.prompts?.enabled === false)
      return false
    if (
      tabId === TAB_IDS.CONVERSATIONS &&
      currentSettings.features?.conversations?.enabled === false
    )
      return false
    if (tabId === TAB_IDS.OUTLINE && currentSettings.features?.outline?.enabled === false)
      return false
    return true
  })

  // 获取主题图标
  const getThemeIcon = () => {
    if (themeMode === "dark") {
      // 深色模式时显示太阳图标（点击切换到浅色）
      return <ThemeLightIcon size={14} />
    }
    // 浅色模式时显示月亮图标（点击切换到深色）
    return <ThemeDarkIcon size={14} />
  }

  return (
    <>
      {/* 加载历史遮罩 */}
      <LoadingOverlay isVisible={isLoadingHistory} text={loadingText} onStop={stopLoading} />
      <div
        ref={panelRef}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={`gh-main-panel gh-interactive ${edgeSnapState ? `edge-snapped-${edgeSnapState}` : ""} ${isEdgePeeking ? "edge-peek" : ""} ${isScrolling ? "scroll-hidden" : ""}`}
        style={{
          position: "fixed",
          top: "50%",
          // 根据默认位置设置 left 或 right
          ...(defaultPosition === "left"
            ? { left: `${defaultEdgeDistance}px`, right: "auto" }
            : { right: `${defaultEdgeDistance}px`, left: "auto" }),
          transform: "translateY(-50%)",
          width: `${currentSettings.panel?.width ?? 320}px`,
          height: `${currentSettings.panel?.height ?? 85}vh`,
          // @ts-ignore - 注入 CSS 变量供吸附计算使用
          "--panel-width": `${currentSettings.panel?.width ?? 320}px`,
          minHeight: "500px",
          backgroundColor: "var(--gh-bg, #ffffff)",
          backgroundImage: "var(--gh-bg-image, none)",
          backgroundBlendMode: "overlay",
          animation: "var(--gh-bg-animation, none)",
          borderRadius: "12px",
          boxShadow: "var(--gh-shadow, 0 10px 40px rgba(0,0,0,0.15))",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid var(--gh-border, #e5e7eb)",
          zIndex: 9999,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          // 位置现在由 useDraggable 通过直接 DOM 操作控制，不再通过 React state
        }}>
        {/* 自定义 CSS 注入：根据当前站点的样式 ID 查找自定义样式 */}
        {currentCustomStyle ? <style>{currentCustomStyle.css}</style> : null}

        {/* Header - 拖拽区域 */}
        <div
          ref={headerRef}
          className="gh-panel-header"
          style={{
            padding: "10px 14px",
            borderRadius: "12px 12px 0 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            // cursor 由 CSS (.gh-panel-header) 统一控制为 pointer
            userSelect: "none",
          }}>
          {/* 左侧：图标 + 标题（双击切换隐私模式） */}
          <Tooltip content={currentTip} triggerStyle={{ flex: 1, minWidth: 0 }}>
            <div
              style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
              onMouseEnter={() => {
                const tips = getTips()
                setCurrentTip(tips[Math.floor(Math.random() * tips.length)])
              }}
              onDoubleClick={() => {
                // 发送隐私模式切换事件给 TabManager
                window.postMessage({ type: "GH_PRIVACY_TOGGLE" }, "*")
              }}>
              <SparkleIcon size={18} color={panelSparkleColor} />
              <span data-tip-target="header-title" style={{ fontSize: "18px", fontWeight: 600 }}>
                {t("panelTitle")}
              </span>
            </div>
          </Tooltip>

          {/* 右侧：按钮组 - 需要 gh-panel-controls 以排除拖拽 */}
          <div
            className="gh-panel-controls"
            style={{ display: "flex", gap: "1px", alignItems: "center" }}>
            {/* 面板模式切换按钮 */}
            <Tooltip
              content={
                (currentSettings.panel?.panelMode ?? "edge-snap") === "edge-snap"
                  ? t("pinPanel")
                  : t("snapToEdge")
              }>
              <button
                type="button"
                aria-label={
                  (currentSettings.panel?.panelMode ?? "edge-snap") === "edge-snap"
                    ? t("pinPanel")
                    : t("snapToEdge")
                }
                onClick={() => {
                  const current = currentSettings.panel?.panelMode ?? "edge-snap"
                  // 从吸附切换到悬浮时，保存当前面板位置用于"原地固定"
                  if (current === "edge-snap" && panelRef.current) {
                    savedPeekingRectRef.current = panelRef.current.getBoundingClientRect()
                  }
                  updateNestedSetting(
                    "panel",
                    "panelMode",
                    current === "edge-snap" ? "floating" : "edge-snap",
                  )
                }}
                className="gh-header-icon-btn">
                {(currentSettings.panel?.panelMode ?? "edge-snap") === "edge-snap" ? (
                  <FloatingModeIcon size={14} />
                ) : (
                  <SnapToEdgeIcon size={14} />
                )}
              </button>
            </Tooltip>

            {/* 主题切换按钮 */}
            {onThemeToggle && (
              <Tooltip content={t("toggleTheme")}>
                <button
                  onClick={(event) => {
                    onThemeToggle?.(getButtonCenter(event.currentTarget))
                  }}
                  className="gh-header-icon-btn">
                  {getThemeIcon()}
                </button>
              </Tooltip>
            )}

            {/* 新标签页按钮 - 受 openInNewTab 设置控制 */}
            {currentSettings.tab?.openInNewTab && (
              <Tooltip content={t("newTabTooltip") || "新标签页打开"}>
                <button
                  onClick={() => window.open(window.location.origin, "_blank")}
                  className="gh-header-icon-btn">
                  <NewTabIcon size={14} />
                </button>
              </Tooltip>
            )}

            {/* 设置按钮 - 打开设置模态框 */}
            <Tooltip content={t("tabSettings")}>
              <button
                data-tip-target="settings-btn"
                onClick={() => {
                  onOpenSettings?.()
                }}
                className="gh-header-icon-btn">
                <SettingsIcon size={14} />
              </button>
            </Tooltip>

            {/* 刷新按钮 - 暂时隐藏，数据已是响应式自动更新 */}
            {/* <Tooltip
              content={
                activeTab === TAB_IDS.OUTLINE
                  ? t("refreshOutline")
                  : activeTab === TAB_IDS.PROMPTS
                    ? t("refreshPrompts")
                    : activeTab === TAB_IDS.CONVERSATIONS
                      ? t("refreshConversations")
                      : t("refresh")
              }>
              <button
                onClick={() => {
                  if (activeTab === TAB_IDS.OUTLINE) {
                    outlineManager?.refresh()
                  } else if (activeTab === TAB_IDS.PROMPTS) {
                    promptManager?.init()
                  } else if (activeTab === TAB_IDS.CONVERSATIONS) {
                    conversationManager?.notifyDataChange()
                  }
                }}
                className="gh-header-icon-btn">
                <RefreshIcon size={14} />
              </button>
            </Tooltip> */}

            {/* 折叠按钮（收起面板） */}
            <Tooltip content={t("collapse")}>
              <button onClick={onClose} aria-label={t("collapse")} className="gh-header-icon-btn">
                <MinimizeIcon size={14} />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Tabs - 标签栏 */}
        <div
          className="gh-panel-tabs"
          style={{
            display: "flex",
            borderBottom: "1px solid var(--gh-border, #e5e7eb)",
            padding: "0",
            background: "var(--gh-bg-secondary, #f9fafb)",
          }}>
          {visibleTabs.map((tab) => {
            let IconComp: React.FC<{ size?: number }> | null = null
            if (tab === TAB_IDS.OUTLINE) IconComp = OutlineIcon
            else if (tab === TAB_IDS.PROMPTS) IconComp = PromptIcon
            else if (tab === TAB_IDS.CONVERSATIONS) IconComp = ConversationIcon

            return (
              <button
                key={tab}
                data-tip-target={
                  tab === TAB_IDS.OUTLINE
                    ? "outline-tab"
                    : tab === TAB_IDS.CONVERSATIONS
                      ? "conversations-tab"
                      : tab === TAB_IDS.PROMPTS
                        ? "prompts-tab"
                        : undefined
                }
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "7px 8px",
                  border: "none",
                  background: "transparent",
                  borderBottom:
                    activeTab === tab
                      ? "3px solid var(--gh-primary, #4285f4)"
                      : "3px solid transparent",
                  color:
                    activeTab === tab
                      ? "var(--gh-primary, #4285f4)"
                      : "var(--gh-text-secondary, #6b7280)",
                  fontWeight: activeTab === tab ? 600 : 400,
                  cursor: "pointer",
                  fontSize: "13px",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                  transition: "all 0.2s",
                }}>
                <span style={{ display: "flex", alignItems: "center" }}>
                  {IconComp && <IconComp size={14} />}
                </span>
                <span>{t(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}</span>
              </button>
            )
          })}
        </div>

        {/* Content - 内容区 */}
        <div
          className="gh-panel-content"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0",
            scrollbarWidth: "none", // Firefox
            msOverflowStyle: "none", // IE/Edge
          }}>
          {activeTab === TAB_IDS.PROMPTS && (
            <PromptsTab
              manager={promptManager}
              selectedPromptId={selectedPromptId}
              onPromptSelect={onPromptSelect}
            />
          )}
          {activeTab === TAB_IDS.CONVERSATIONS && (
            <ConversationsTab
              manager={conversationManager}
              onInteractionStateChange={onInteractionStateChange}
            />
          )}
          {activeTab === TAB_IDS.OUTLINE && (
            <OutlineTab manager={outlineManager} onJumpBefore={saveAnchor} />
          )}
        </div>

        {/* Footer - 底部固定按钮 */}
        <div
          className="gh-panel-footer"
          style={{
            display: "flex",
            justifyContent: "space-around",
            alignItems: "center",
            padding: "8px 16px",
            borderTop: "1px solid var(--gh-border, #e5e7eb)",
            background: "var(--gh-bg-secondary, #f9fafb)",
          }}>
          {/* 顶部按钮 */}
          <Tooltip content={t("scrollTop")} triggerStyle={{ flex: 1, maxWidth: "120px" }}>
            <button
              className="gh-interactive scroll-nav-btn"
              onClick={scrollToTop}
              style={{
                width: "100%",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                background: "var(--gh-header-bg)",
                color: "var(--gh-footer-text, var(--gh-text-on-primary, white))",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "14px",
                transition: "transform 0.2s, box-shadow 0.2s",
                boxShadow: "var(--gh-btn-shadow)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)"
                e.currentTarget.style.boxShadow = "var(--gh-btn-shadow-hover)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)"
                e.currentTarget.style.boxShadow = "var(--gh-btn-shadow)"
              }}>
              <ScrollTopIcon size={14} />
              <span>{t("scrollTop")}</span>
            </button>
          </Tooltip>

          {/* 锚点按钮（返回之前位置，双向跳转） */}
          <Tooltip
            content={hasAnchor ? t("jumpToAnchor") : "暂无锚点"}
            triggerStyle={{ flex: "0 0 32px" }}>
            <button
              className="gh-interactive scroll-nav-btn anchor-btn"
              onClick={goToAnchor}
              disabled={!hasAnchor}
              style={{
                width: "32px",
                height: "32px",
                background: "var(--gh-header-bg)",
                color: "var(--gh-footer-text, var(--gh-text-on-primary, white))",
                border: "none",
                borderRadius: "50%",
                padding: 0,
                cursor: hasAnchor ? "pointer" : "default",
                fontSize: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "transform 0.2s, box-shadow 0.2s",
                boxShadow: "var(--gh-btn-shadow)",
                opacity: hasAnchor ? 1 : 0.4,
              }}
              onMouseEnter={(e) => {
                if (hasAnchor) {
                  e.currentTarget.style.transform = "scale(1.1)"
                  e.currentTarget.style.boxShadow = "var(--gh-btn-shadow-hover)"
                  // 旋转特效
                  const div = e.currentTarget.querySelector("div")
                  if (div) div.style.transform = "rotate(360deg)"
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)"
                e.currentTarget.style.boxShadow = hasAnchor ? "var(--gh-btn-shadow)" : "none"
                // 恢复旋转
                const div = e.currentTarget.querySelector("div")
                if (div) div.style.transform = "rotate(0deg)"
              }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}>
                <AnchorIcon size={14} />
              </div>
            </button>
          </Tooltip>

          {/* 底部按钮 */}
          <Tooltip content={t("scrollBottom")} triggerStyle={{ flex: 1, maxWidth: "120px" }}>
            <button
              className="gh-interactive scroll-nav-btn"
              onClick={scrollToBottom}
              style={{
                width: "100%",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                background: "var(--gh-header-bg)",
                color: "var(--gh-footer-text, var(--gh-text-on-primary, white))",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "14px",
                transition: "transform 0.2s, box-shadow 0.2s",
                boxShadow: "var(--gh-btn-shadow)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)"
                e.currentTarget.style.boxShadow = "var(--gh-btn-shadow-hover)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)"
                e.currentTarget.style.boxShadow = "var(--gh-btn-shadow)"
              }}>
              <ScrollBottomIcon size={14} />
              <span>{t("scrollBottom")}</span>
            </button>
          </Tooltip>
        </div>
      </div>
    </>
  )
}
