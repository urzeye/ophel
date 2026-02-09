import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"

import type { SiteAdapter } from "~adapters/base"
import {
  AnchorIcon,
  ConversationIcon,
  MinimizeIcon,
  NewTabIcon,
  OutlineIcon,
  PromptIcon,
  RefreshIcon,
  ScrollBottomIcon,
  ScrollTopIcon,
  SettingsIcon,
  SparklesIcon,
  ThemeDarkIcon,
  ThemeLightIcon,
} from "~components/icons"
import { SITE_IDS, TAB_IDS } from "~constants"
import type { ConversationManager } from "~core/conversation-manager"
import type { OutlineManager } from "~core/outline-manager"
import type { PromptManager } from "~core/prompt-manager"
import { useDraggable } from "~hooks/useDraggable"
import { useSettingsStore } from "~stores/settings-store"
import { loadHistoryUntil } from "~utils/history-loader"
import { t } from "~utils/i18n"
import { getScrollInfo, smartScrollTo, smartScrollToBottom } from "~utils/scroll-helper"
import { DEFAULT_SETTINGS, type Prompt } from "~utils/storage"
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
  promptManager: PromptManager
  conversationManager: ConversationManager
  outlineManager: OutlineManager
  adapter?: SiteAdapter | null
  onThemeToggle?: () => void
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
  const { settings } = useSettingsStore()
  const currentSettings = settings || DEFAULT_SETTINGS
  const tabOrder = currentSettings.features?.order || DEFAULT_SETTINGS.features.order

  // 拖拽功能（高性能版本：直接 DOM 操作，不触发 React 渲染）
  const { panelRef, headerRef } = useDraggable({
    edgeSnapHide: currentSettings.panel?.edgeSnap,
    edgeSnapState, // 传递当前吸附状态
    snapThreshold: currentSettings.panel?.edgeSnapThreshold ?? 30,
    onEdgeSnap,
    onUnsnap,
  })

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

  // 防止 Grok 和 Claude 在 keydown 时抢占焦点
  // 只在 Grok 和 Claude 站点生效
  useEffect(() => {
    const siteId = adapter?.getSiteId()

    if (isOpen && (siteId === SITE_IDS.GROK || siteId === SITE_IDS.CLAUDE)) {
      const panel = panelRef.current
      if (!panel) {
        return
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement

        const isInputElement =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.getAttribute("contenteditable") === "true"

        if (!isInputElement) return

        // 阻止事件传播到 Grok 的监听器
        e.stopPropagation()
        e.stopImmediatePropagation()
      }

      // 直接在面板元素上监听，而不是 document
      // 这样可以在 Shadow DOM 内部捕获事件
      panel.addEventListener("keydown", handleKeyDown, true)
      panel.addEventListener("keypress", handleKeyDown, true)

      return () => {
        panel.removeEventListener("keydown", handleKeyDown, true)
        panel.removeEventListener("keypress", handleKeyDown, true)
      }
    }
  }, [isOpen, adapter, panelRef])

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
        className={`gh-main-panel gh-interactive ${edgeSnapState ? `edge-snapped-${edgeSnapState}` : ""} ${isEdgePeeking ? "edge-peek" : ""}`}
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
        {(() => {
          const siteId = adapter?.getSiteId() || "_default"
          const siteTheme =
            settings.theme?.sites?.[siteId as keyof typeof settings.theme.sites] ||
            settings.theme?.sites?._default
          const resolvedMode = themeMode || (siteTheme?.mode === "dark" ? "dark" : "light")
          const styleId =
            resolvedMode === "light" ? siteTheme?.lightStyleId : siteTheme?.darkStyleId

          // 在自定义样式中查找（确保 customStyles 是数组）
          const customStyles = settings.theme?.customStyles
          if (Array.isArray(customStyles)) {
            const customStyle = customStyles.find((s) => s.id === styleId)
            if (customStyle) {
              return <style>{customStyle.css}</style>
            }
          }
          return null
        })()}

        {/* Header - 拖拽区域 */}
        <div
          ref={headerRef}
          className="gh-panel-header"
          style={{
            padding: "12px 14px",
            borderRadius: "12px 12px 0 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            // cursor 由 CSS (.gh-panel-header) 统一控制为 pointer
            userSelect: "none",
          }}>
          {/* 左侧：图标 + 标题（双击切换隐私模式） */}
          <Tooltip content={t("aboutPageDesc")}>
            <div
              style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
              onDoubleClick={() => {
                // 发送隐私模式切换事件给 TabManager
                window.postMessage({ type: "GH_PRIVACY_TOGGLE" }, "*")
              }}>
              <SparklesIcon size={16} />
              <span style={{ fontSize: "15px", fontWeight: 600 }}>{t("panelTitle")}</span>
            </div>
          </Tooltip>

          {/* 右侧：按钮组 - 需要 gh-panel-controls 以排除拖拽 */}
          <div
            className="gh-panel-controls"
            style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            {/* 主题切换按钮 */}
            {onThemeToggle && (
              <Tooltip content={t("toggleTheme")}>
                <button
                  onClick={onThemeToggle}
                  style={{
                    background: "var(--gh-glass-bg, rgba(255,255,255,0.2))",
                    border: "none",
                    color: "var(--gh-glass-text, white)",
                    width: "24px",
                    height: "24px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "14px",
                    transition: "all 0.2s",
                  }}>
                  {getThemeIcon()}
                </button>
              </Tooltip>
            )}

            {/* 新标签页按钮 */}
            <Tooltip content={t("newTabTooltip") || "新标签页打开"}>
              <button
                onClick={() => window.open(window.location.origin, "_blank")}
                style={{
                  background: "var(--gh-glass-bg, rgba(255,255,255,0.2))",
                  border: "none",
                  color: "var(--gh-glass-text, white)",
                  width: "24px",
                  height: "24px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "16px",
                  transition: "all 0.2s",
                }}>
                <NewTabIcon size={14} />
              </button>
            </Tooltip>

            {/* 设置按钮 - 打开设置模态框 */}
            <Tooltip content={t("tabSettings")}>
              <button
                onClick={() => {
                  onOpenSettings?.()
                }}
                style={{
                  background: "var(--gh-glass-bg, rgba(255,255,255,0.2))",
                  border: "none",
                  color: "var(--gh-glass-text, white)",
                  width: "24px",
                  height: "24px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  transition: "all 0.2s",
                }}>
                <SettingsIcon size={14} />
              </button>
            </Tooltip>

            {/* 刷新按钮 - 根据当前 Tab 智能刷新 */}
            <Tooltip
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
                  // 根据当前 Tab 执行对应的刷新逻辑
                  if (activeTab === TAB_IDS.OUTLINE) {
                    outlineManager?.refresh()
                  } else if (activeTab === TAB_IDS.PROMPTS) {
                    // 提示词由 Zustand store 管理，自动响应数据变化，无需手动刷新
                    // 触发 UI 重新获取数据
                    promptManager?.init()
                  } else if (activeTab === TAB_IDS.CONVERSATIONS) {
                    // 触发数据变更通知，刷新 UI
                    conversationManager?.notifyDataChange()
                  }
                  // settings 不需要刷新
                }}
                style={{
                  background: "var(--gh-glass-bg, rgba(255,255,255,0.2))",
                  border: "none",
                  color: "var(--gh-glass-text, white)",
                  width: "24px",
                  height: "24px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  transition: "all 0.2s",
                }}>
                <RefreshIcon size={14} />
              </button>
            </Tooltip>

            {/* 折叠按钮（收起面板） */}
            <Tooltip content={t("collapse")}>
              <button
                onClick={onClose}
                style={{
                  background: "var(--gh-glass-bg, rgba(255,255,255,0.2))",
                  border: "none",
                  color: "var(--gh-glass-text, white)",
                  width: "24px",
                  height: "24px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  fontWeight: 600,
                  transition: "all 0.2s",
                }}>
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
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "10px 8px",
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
                  {IconComp && <IconComp size={16} />}
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
            padding: "10px 16px",
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
