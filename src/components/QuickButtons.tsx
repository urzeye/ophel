/**
 * 快捷按钮组
 * 面板折叠时显示的浮动工具条
 */

import React, { useCallback, useState } from "react"

import { useStorage } from "@plasmohq/storage/hook"

import { t } from "~utils/i18n"
import { DEFAULT_SETTINGS, STORAGE_KEYS, type Settings } from "~utils/storage"

interface QuickButtonsProps {
  isPanelOpen: boolean
  onPanelToggle: () => void
  onThemeToggle?: () => void
  themeMode?: "light" | "dark"
}

export const QuickButtons: React.FC<QuickButtonsProps> = ({
  isPanelOpen,
  onPanelToggle,
  onThemeToggle,
  themeMode = "light",
}) => {
  const [settings] = useStorage<Settings>(STORAGE_KEYS.SETTINGS)
  const currentSettings = settings || DEFAULT_SETTINGS
  const { collapsedButtonsOrder } = currentSettings

  // === 锚点状态（双向跳转） ===
  const [previousAnchor, setPreviousAnchor] = useState<number | null>(null)
  const [showAnchorGroup, setShowAnchorGroup] = useState(false)

  // 检查是否有锚点
  const hasAnchor = previousAnchor !== null

  // 获取滚动容器
  const getScrollContainer = useCallback(() => {
    const selectors = [
      "infinite-scroller.chat-history",
      ".chat-history",
      ".chat-mode-scroller",
      "main",
      '[role="main"]',
    ]
    for (const selector of selectors) {
      const el = document.querySelector(selector) as HTMLElement
      if (el && el.scrollHeight > el.clientHeight) {
        return el
      }
    }
    return document.documentElement
  }, [])

  // 滚动到顶部（自动记录当前位置为锚点）
  const scrollToTop = useCallback(() => {
    const container = getScrollContainer()
    // 点击去顶部时，自动记录当前位置为锚点
    setPreviousAnchor(container.scrollTop)
    container.scrollTo({ top: 0, behavior: "smooth" })
  }, [getScrollContainer])

  // 滚动到底部（自动记录当前位置为锚点）
  const scrollToBottom = useCallback(() => {
    const container = getScrollContainer()
    // 点击去底部时，自动记录当前位置为锚点
    setPreviousAnchor(container.scrollTop)
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" })
  }, [getScrollContainer])

  // 设置锚点
  const setAnchor = useCallback(() => {
    const container = getScrollContainer()
    setPreviousAnchor(container.scrollTop)
    setShowAnchorGroup(false)
  }, [getScrollContainer])

  // 跳转到锚点（实现位置交换，支持来回跳转）
  const goToAnchor = useCallback(() => {
    if (previousAnchor === null) return

    const container = getScrollContainer()
    // 1. 保存当前位置
    const currentPos = container.scrollTop

    // 2. 跳转到锚点
    container.scrollTo({ top: previousAnchor, behavior: "instant" })

    // 3. 交换位置实现来回跳转
    setPreviousAnchor(currentPos)
    setShowAnchorGroup(false)
  }, [previousAnchor, getScrollContainer])

  // 清除锚点
  const clearAnchor = useCallback(() => {
    setPreviousAnchor(null)
    setShowAnchorGroup(false)
  }, [])

  // 获取主题图标
  const getThemeIcon = () => {
    if (themeMode === "dark") {
      return "☀️" // 深色模式时显示太阳（切换到浅色）
    }
    return "🌙" // 浅色模式时显示月亮（切换到深色）
  }

  // 按钮样式
  const buttonStyle: React.CSSProperties = {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: "none",
    background: "linear-gradient(135deg, #4285f4 0%, #34a853 100%)",
    color: "white",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    transition: "transform 0.2s, box-shadow 0.2s",
  }

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    right: "16px",
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    zIndex: 9998,
  }

  // 锚点子菜单样式
  const anchorGroupStyle: React.CSSProperties = {
    position: "absolute",
    right: "44px",
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    flexDirection: "row",
    gap: "4px",
    background: "var(--gh-bg-color, white)",
    padding: "4px 8px",
    borderRadius: "20px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
  }

  const smallButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    width: "28px",
    height: "28px",
    fontSize: "12px",
  }

  // 渲染按钮
  const renderButton = (id: string) => {
    switch (id) {
      case "scrollTop":
        return (
          <button
            key={id}
            className="gh-interactive"
            style={buttonStyle}
            onClick={scrollToTop}
            title={t("scrollTop")}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
            ⬆️
          </button>
        )
      case "panel":
        if (isPanelOpen) return null
        return (
          <button
            key={id}
            className="gh-interactive"
            style={{ ...buttonStyle, background: "#4285f4", color: "white" }}
            onClick={onPanelToggle}
            title={t("panelTitle")}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
            ✨
          </button>
        )
      case "theme":
        if (!onThemeToggle) return null
        return (
          <button
            key={id}
            className="gh-interactive"
            style={buttonStyle}
            onClick={onThemeToggle}
            title={t("toggleTheme")}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
            {getThemeIcon()}
          </button>
        )
      case "anchor":
        // 旧版锚点按钮，现在通常使用 manualAnchor，或者如果需要兼容
        // 这里的逻辑可以保留为空，或者根据需求实现
        return null
      case "manualAnchor":
        return (
          <div key={id} style={{ position: "relative" }}>
            <button
              className="gh-interactive"
              style={{
                ...buttonStyle,
                background: hasAnchor ? "#34a853" : buttonStyle.background,
                color: "white",
              }}
              onClick={() => setShowAnchorGroup(!showAnchorGroup)}
              title={hasAnchor ? t("jumpToAnchor") || "返回锚点" : "暂无锚点"}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
              📍
            </button>

            {/* 锚点子菜单 */}
            {showAnchorGroup && (
              <div style={anchorGroupStyle}>
                <button
                  className="gh-interactive"
                  style={smallButtonStyle}
                  onClick={setAnchor}
                  title={t("setAnchor") || "设置锚点"}>
                  ⚓
                </button>
                {hasAnchor && (
                  <>
                    <button
                      className="gh-interactive"
                      style={smallButtonStyle}
                      onClick={goToAnchor}
                      title={t("goToAnchor") || "返回锚点"}>
                      ↩️
                    </button>
                    <button
                      className="gh-interactive"
                      style={smallButtonStyle}
                      onClick={clearAnchor}
                      title={t("clearAnchor") || "清除锚点"}>
                      ❌
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )
      case "scrollBottom":
        return (
          <button
            key={id}
            className="gh-interactive"
            style={buttonStyle}
            onClick={scrollToBottom}
            title={t("scrollBottom")}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
            ⬇️
          </button>
        )
      default:
        return null
    }
  }

  return (
    <div className="gh-quick-buttons" style={containerStyle}>
      {collapsedButtonsOrder.map((btn) => {
        if (!btn.enabled) return null
        return renderButton(btn.id)
      })}
    </div>
  )
}
