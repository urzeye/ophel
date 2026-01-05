import React, { useCallback, useEffect, useRef, useState } from "react"

import type { SiteAdapter } from "~adapters/base"
import { TAB_IDS, type TabId } from "~constants"
import type { ConversationManager } from "~core/conversation-manager"
import type { OutlineManager } from "~core/outline-manager"
import type { PromptManager } from "~core/prompt-manager"
import { useDraggable } from "~hooks/useDraggable"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import {
  getScrollInfo,
  smartScrollTo,
  smartScrollToBottom,
  smartScrollToTop,
} from "~utils/scroll-helper"
import { DEFAULT_SETTINGS, type Prompt } from "~utils/storage"

import { ConversationsTab } from "./ConversationsTab"
import { OutlineTab } from "./OutlineTab"
import { PromptsTab } from "./PromptsTab"
import { SettingsTab } from "./SettingsTab"

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
    onEdgeSnap,
    onUnsnap,
  })

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
  }, [tabOrder, isInitialized])

  // === 锚点状态（双向跳转） ===
  // previousAnchor: 上一个位置（跳转前）
  // 实现类似 git switch - 的双位置交换
  const [previousAnchor, setPreviousAnchor] = useState<number | null>(null)
  const [currentAnchor, setCurrentAnchor] = useState<number | null>(null)

  // 检查是否有锚点
  const hasAnchor = previousAnchor !== null

  // 设置锚点（跳转前调用，保存当前位置）
  const setAnchor = useCallback(async () => {
    const scrollInfo = await getScrollInfo(adapter || null)
    setPreviousAnchor(scrollInfo.scrollTop)
  }, [adapter])

  // 滚动到顶部（自动记录当前位置为锚点）
  const scrollToTop = useCallback(async () => {
    const { previousScrollTop } = await smartScrollToTop(adapter || null)
    setPreviousAnchor(previousScrollTop)
  }, [adapter])

  // 滚动到底部（自动记录当前位置为锚点）
  const scrollToBottom = useCallback(async () => {
    const { previousScrollTop } = await smartScrollToBottom(adapter || null)
    setPreviousAnchor(previousScrollTop)
  }, [adapter])

  // 跳转到锚点（实现位置交换，支持来回跳转）
  const goToAnchor = useCallback(async () => {
    if (previousAnchor === null) return

    // 获取当前位置
    const scrollInfo = await getScrollInfo(adapter || null)
    const currentPos = scrollInfo.scrollTop

    // 跳转到 previousAnchor
    await smartScrollTo(adapter || null, previousAnchor)

    // 交换位置
    setCurrentAnchor(previousAnchor)
    setPreviousAnchor(currentPos)
  }, [previousAnchor, adapter])

  // 记录锚点位置（每次跳转大纲时调用）
  const saveAnchor = useCallback(async () => {
    const scrollInfo = await getScrollInfo(adapter || null)
    setPreviousAnchor(scrollInfo.scrollTop)
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

  // Tab 图标定义
  const tabIcons: Record<string, string> = {
    [TAB_IDS.OUTLINE]: "📑",
    [TAB_IDS.CONVERSATIONS]: "💬",
    [TAB_IDS.PROMPTS]: "✏️",
  }

  // 获取主题图标
  const getThemeIcon = () => {
    if (themeMode === "dark") {
      // 深色模式时显示太阳图标（点击切换到浅色）
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          height="20px"
          viewBox="0 -960 960 960"
          width="20px"
          fill="currentColor">
          <path d="M480-280q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280ZM200-440H40v-80h160v80Zm720 0H760v-80h160v80ZM440-760v-160h80v160h-80Zm0 720v-160h80v160h-80ZM256-650l-101-97 57-59 96 100-52 56Zm492 496-97-101 53-55 101 97-57 59Zm-98-550 97-101 59 57-100 96-56-52ZM154-212l101-97 55 53-97 101-59-57Z" />
        </svg>
      )
    }
    // 浅色模式时显示月亮图标（点击切换到深色）
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        height="20px"
        viewBox="0 -960 960 960"
        width="20px"
        fill="currentColor">
        <path d="M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Z" />
      </svg>
    )
  }

  return (
    <div
      ref={panelRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`gh-main-panel gh-interactive ${edgeSnapState ? `edge-snapped-${edgeSnapState}` : ""} ${isEdgePeeking ? "edge-peek" : ""}`}
      style={{
        position: "fixed",
        top: "50%",
        right: "20px",
        transform: "translateY(-50%)",
        width: "320px",
        height: "80vh",
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
        // ⭐ 位置现在由 useDraggable 通过直接 DOM 操作控制，不再通过 React state
      }}>
      {/* 自定义 CSS 注入 */}
      {settings.theme?.customStyles && <style>{settings.theme?.customStyles}</style>}

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
          // ⭐ cursor 由 CSS (.gh-panel-header) 统一控制为 pointer
          userSelect: "none",
        }}>
        {/* 左侧：图标 + 标题（双击切换隐私模式） */}
        <div
          style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
          onDoubleClick={() => {
            // 发送隐私模式切换事件给 TabManager
            window.postMessage({ type: "GH_PRIVACY_TOGGLE" }, "*")
          }}
          title={t("privacyModeDesc") || "双击切换隐私模式"}>
          <span style={{ fontSize: "16px" }}>✨</span>
          <span style={{ fontSize: "15px", fontWeight: 600 }}>{t("panelTitle")}</span>
        </div>

        {/* 右侧：按钮组 - 需要 gh-panel-controls 以排除拖拽 */}
        <div
          className="gh-panel-controls"
          style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          {/* 主题切换按钮 */}
          {onThemeToggle && (
            <button
              onClick={onThemeToggle}
              title={t("toggleTheme")}
              style={{
                background: "var(--gh-glass-bg, rgba(255,255,255,0.2))",
                border: "none",
                color: "var(--gh-glass-text, white)",
                width: "28px",
                height: "28px",
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
          )}

          {/* 新标签页按钮 */}
          <button
            onClick={() => window.open(window.location.origin, "_blank")}
            title={t("newTabTooltip") || "新标签页打开"}
            style={{
              background: "var(--gh-glass-bg, rgba(255,255,255,0.2))",
              border: "none",
              color: "var(--gh-glass-text, white)",
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
              transition: "all 0.2s",
            }}>
            +
          </button>

          {/* 设置按钮 */}
          <button
            onClick={() =>
              setActiveTab(activeTab === TAB_IDS.SETTINGS ? TAB_IDS.PROMPTS : TAB_IDS.SETTINGS)
            }
            title={t("tabSettings")}
            style={{
              background:
                activeTab === "settings"
                  ? "var(--gh-glass-bg-hover, rgba(255,255,255,0.4))"
                  : "var(--gh-glass-bg, rgba(255,255,255,0.2))",
              border: "none",
              color: "var(--gh-glass-text, white)",
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
              transition: "all 0.2s",
            }}>
            ⚙
          </button>

          {/* 刷新按钮 - 根据当前 Tab 智能刷新 */}
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
            title={
              activeTab === TAB_IDS.OUTLINE
                ? t("refreshOutline")
                : activeTab === TAB_IDS.PROMPTS
                  ? t("refreshPrompts")
                  : activeTab === TAB_IDS.CONVERSATIONS
                    ? t("refreshConversations")
                    : activeTab === TAB_IDS.SETTINGS
                      ? t("refreshSettings")
                      : t("refresh")
            }
            style={{
              background: "var(--gh-glass-bg, rgba(255,255,255,0.2))",
              border: "none",
              color: "var(--gh-glass-text, white)",
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
              transition: "all 0.2s",
            }}>
            ⟳
          </button>

          {/* 折叠按钮（收起面板） */}
          <button
            onClick={onClose}
            title={t("collapse")}
            style={{
              background: "var(--gh-glass-bg, rgba(255,255,255,0.2))",
              border: "none",
              color: "var(--gh-glass-text, white)",
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              fontWeight: 600,
              transition: "all 0.2s",
            }}>
            −
          </button>
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
        {visibleTabs.map((tab) => (
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
            <span>{tabIcons[tab] || ""}</span>
            <span>{t(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}</span>
          </button>
        ))}
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
        {activeTab === TAB_IDS.SETTINGS && (
          <div style={{ padding: "0" }}>
            <SettingsTab />
          </div>
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
        <button
          className="gh-interactive scroll-nav-btn"
          onClick={scrollToTop}
          title={t("scrollTop")}
          style={{
            flex: 1,
            maxWidth: "120px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            background: "var(--gh-header-bg)",
            color: "var(--gh-text-on-primary, white)",
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
          <span>↑</span>
          <span>{t("scrollTop")}</span>
        </button>

        {/* 锚点按钮（返回之前位置，双向跳转） */}
        <button
          className="gh-interactive scroll-nav-btn anchor-btn"
          onClick={goToAnchor}
          title={hasAnchor ? t("jumpToAnchor") : "暂无锚点"}
          disabled={!hasAnchor}
          style={{
            flex: "0 0 32px",
            width: "32px",
            height: "32px",
            background: "var(--gh-header-bg)",
            color: "var(--gh-text-on-primary, white)",
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
              const span = e.currentTarget.querySelector("span")
              if (span) span.style.transform = "rotate(360deg)"
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)"
            e.currentTarget.style.boxShadow = hasAnchor ? "var(--gh-btn-shadow)" : "none"
            // 恢复旋转
            const span = e.currentTarget.querySelector("span")
            if (span) span.style.transform = "rotate(0deg)"
          }}>
          <span
            style={{
              display: "inline-block",
              transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}>
            ⚓
          </span>
        </button>

        {/* 底部按钮 */}
        <button
          className="gh-interactive scroll-nav-btn"
          onClick={scrollToBottom}
          title={t("scrollBottom")}
          style={{
            flex: 1,
            maxWidth: "120px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            background: "var(--gh-header-bg)",
            color: "var(--gh-text-on-primary, white)",
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
          <span>↓</span>
          <span>{t("scrollBottom")}</span>
        </button>
      </div>
    </div>
  )
}
