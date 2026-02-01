import React, { useCallback, useEffect, useRef, useState } from "react"

import { getAdapter } from "~adapters/index"
import { ClearIcon, ReturnIcon, ThemeDarkIcon, ThemeLightIcon } from "~components/icons"
import { LoadingOverlay } from "~components/LoadingOverlay"
import { Tooltip } from "~components/ui/Tooltip"
import { COLLAPSED_BUTTON_DEFS } from "~constants"
import { useSettingsStore } from "~stores/settings-store"
import { loadHistoryUntil } from "~utils/history-loader"
import { t } from "~utils/i18n"
import {
  getScrollInfo,
  isFlutterProxy,
  smartScrollTo,
  smartScrollToBottom,
  smartScrollToTop,
} from "~utils/scroll-helper"
import { DEFAULT_SETTINGS, type Settings } from "~utils/storage"
import { showToast } from "~utils/toast"

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
  const { settings } = useSettingsStore()
  const currentSettings = settings || DEFAULT_SETTINGS
  const collapsedButtonsOrder = currentSettings.collapsedButtons || []

  // 锚点状态
  const [hasAnchor, setHasAnchor] = useState(false)
  const [savedAnchorTop, setSavedAnchorTop] = useState<number | null>(null)

  // 监听快捷键触发的锚点设置事件
  useEffect(() => {
    const handleAnchorSet = (e: Event) => {
      const customEvent = e as CustomEvent<{ position: number }>
      setSavedAnchorTop(customEvent.detail.position)
      setHasAnchor(true)
    }

    window.addEventListener("ophel:anchorSet", handleAnchorSet)
    return () => {
      window.removeEventListener("ophel:anchorSet", handleAnchorSet)
    }
  }, [])

  // 悬浮隐藏状态
  const [isHovered, setIsHovered] = useState(false)
  const groupRef = useRef<HTMLDivElement>(null)

  // 获取适配器
  const adapter = getAdapter()

  // 跟踪是否处于 Flutter 模式（图文并茂）
  const [isFlutterMode, setIsFlutterMode] = useState(false)

  // 加载状态
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [loadingText, setLoadingText] = useState("")
  const abortLoadingRef = useRef(false)

  // 滚动到顶部（支持图文并茂模式）
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
      // 使用公共 HistoryLoader
      const result = await loadHistoryUntil({
        adapter,
        loadAll: true,
        signal: abortController.signal,
        allowShortCircuit: true, // 用户主动点击，启用短对话短路
        onProgress: (msg) => {
          setLoadingText(`${t("loadingHistory")} ${msg}`)
        },
      })

      // 保存锚点
      setSavedAnchorTop(result.previousScrollTop)
      setHasAnchor(true)
      setIsFlutterMode(result.isFlutterMode)

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

  // 滚动到底部（支持图文并茂模式）
  const scrollToBottom = useCallback(async () => {
    const { previousScrollTop, container } = await smartScrollToBottom(adapter)

    // 保存当前位置作为锚点
    setSavedAnchorTop(previousScrollTop)
    setHasAnchor(true)

    // 检测是否处于 Flutter 模式
    setIsFlutterMode(isFlutterProxy(container))
  }, [adapter])

  // 锚点跳转（双向，支持图文并茂模式）
  const handleAnchorClick = useCallback(async () => {
    if (savedAnchorTop === null) return

    // 获取当前位置
    const scrollInfo = await getScrollInfo(adapter)
    const currentPos = scrollInfo.scrollTop

    // 跳转到锚点
    await smartScrollTo(adapter, savedAnchorTop)

    // 交换位置
    setSavedAnchorTop(currentPos)
  }, [savedAnchorTop, adapter])

  // 手动锚点：设置（支持图文并茂模式）
  const setAnchorManually = useCallback(async () => {
    const scrollInfo = await getScrollInfo(adapter)
    setSavedAnchorTop(scrollInfo.scrollTop)
    setHasAnchor(true)
    setIsFlutterMode(scrollInfo.isFlutterMode)
  }, [adapter])

  // 手动锚点：返回（支持图文并茂模式）
  const backToManualAnchor = useCallback(async () => {
    if (savedAnchorTop === null) return

    const scrollInfo = await getScrollInfo(adapter)
    const currentPos = scrollInfo.scrollTop

    await smartScrollTo(adapter, savedAnchorTop)
    setSavedAnchorTop(currentPos)
  }, [savedAnchorTop, adapter])

  // 手动锚点：清除
  const clearAnchorManually = useCallback(() => {
    setSavedAnchorTop(null)
    setHasAnchor(false)
  }, [])

  // 获取主题图标
  const getThemeIcon = () => {
    const isDark = themeMode === "dark"
    // 深色模式显示太阳（点击切换到浅色），浅色模式显示月亮（点击切换到深色）
    return isDark ? <ThemeLightIcon size={20} /> : <ThemeDarkIcon size={20} />
  }

  // 按钮点击处理器
  const buttonActions: Record<string, (e?: React.MouseEvent) => void> = {
    scrollTop: scrollToTop,
    scrollBottom: scrollToBottom,
    panel: onPanelToggle,
    anchor: handleAnchorClick,
    theme: (e) => {
      e?.stopPropagation()
      onThemeToggle?.()
    },
  }

  // 渲染单个按钮
  const renderButton = (
    id: string,
    def: (typeof COLLAPSED_BUTTON_DEFS)[string],
    enabled: boolean,
  ) => {
    const isPanelOnly = def.isPanelOnly
    const isDisabled = !enabled

    // panel-only 按钮：面板展开时隐藏
    // 禁用的按钮：永远隐藏
    const shouldHide = isDisabled || (isPanelOnly && isPanelOpen)
    if (shouldHide) return null

    // 优先使用 IconComponent，否则用 emoji
    let icon: React.ReactNode
    if (id === "theme") {
      icon = getThemeIcon()
    } else if (def.IconComponent) {
      const IconComp = def.IconComponent
      icon = <IconComp size={18} />
    } else {
      icon = def.icon
    }

    const isAnchorBtn = id === "anchor"
    const anchorDisabled = isAnchorBtn && !hasAnchor

    return (
      <Tooltip key={id} content={t(def.labelKey) || def.labelKey}>
        <button
          className={`quick-prompt-btn gh-interactive ${isPanelOnly ? "panel-only" : ""}`}
          onClick={(e) => buttonActions[id]?.(e)}
          style={{
            opacity: anchorDisabled ? 0.4 : 1,
            cursor: anchorDisabled ? "default" : "pointer",
          }}
          disabled={anchorDisabled}>
          {icon}
        </button>
      </Tooltip>
    )
  }

  // 渲染手动锚点组
  const renderManualAnchorGroup = (enabled: boolean) => {
    if (!enabled) return null

    const hasManualAnchor = savedAnchorTop !== null
    const anchorDef = COLLAPSED_BUTTON_DEFS.manualAnchor
    const AnchorIcon = anchorDef?.IconComponent

    return (
      <React.Fragment key="manualAnchor">
        {/* 设置锚点 */}
        <Tooltip content={t("setAnchor") || "设置锚点"}>
          <button
            className="quick-prompt-btn manual-anchor-btn set-btn gh-interactive"
            onClick={setAnchorManually}>
            {AnchorIcon ? <AnchorIcon size={18} /> : "📍"}
          </button>
        </Tooltip>
        {/* 返回锚点 */}
        <Tooltip
          content={hasManualAnchor ? t("goToAnchor") || "返回锚点" : t("noAnchor") || "暂无锚点"}>
          <button
            className={`quick-prompt-btn manual-anchor-btn back-btn gh-interactive ${hasManualAnchor ? "has-anchor" : ""}`}
            onClick={backToManualAnchor}
            style={{
              opacity: hasManualAnchor ? 1 : 0.4,
              cursor: hasManualAnchor ? "pointer" : "default",
            }}
            disabled={!hasManualAnchor}>
            <ReturnIcon size={18} />
          </button>
        </Tooltip>
        {/* 清除锚点 */}
        <Tooltip content={t("clearAnchor") || "清除锚点"}>
          <button
            className="quick-prompt-btn manual-anchor-btn clear-btn gh-interactive"
            onClick={clearAnchorManually}
            style={{
              opacity: hasManualAnchor ? 1 : 0.4,
              cursor: hasManualAnchor ? "pointer" : "default",
            }}
            disabled={!hasManualAnchor}>
            <ClearIcon size={18} />
          </button>
        </Tooltip>
      </React.Fragment>
    )
  }

  // 渲染分隔线
  const renderDivider = (isPanelOnly: boolean, key: string) => {
    // panel-only 分隔线：面板展开时隐藏
    if (isPanelOnly && isPanelOpen) return null
    return <div key={key} className={`divider ${isPanelOnly ? "panel-only" : ""}`} />
  }

  // 构建按钮列表（包含智能分隔线逻辑）
  const renderButtonGroup = () => {
    const elements: React.ReactNode[] = []
    let prevRenderedType: "panelOnly" | "always" | null = null
    let prevRenderedId: string | null = null
    let isFirstRendered = true

    collapsedButtonsOrder.forEach((btnConfig, index) => {
      const def = COLLAPSED_BUTTON_DEFS[btnConfig.id]
      if (!def) return

      const isEnabled = def.canToggle ? btnConfig.enabled : true
      const currentType = def.isPanelOnly ? "panelOnly" : "always"

      // 禁用的按钮跳过（不渲染，不更新状态）
      if (!isEnabled) return

      // panel-only 按钮在面板展开时也跳过
      if (def.isPanelOnly && isPanelOpen) return

      // === 智能分隔线插入 ===
      if (!isFirstRendered && prevRenderedType !== null) {
        // manualAnchor 上方需要分隔线
        if (btnConfig.id === "manualAnchor") {
          elements.push(renderDivider(false, `divider-before-${btnConfig.id}`))
        }
        // 上一个是 manualAnchor，需要分隔线
        else if (prevRenderedId === "manualAnchor") {
          elements.push(
            renderDivider(currentType === "panelOnly", `divider-after-manualAnchor-${index}`),
          )
        }
        // 类型切换时插入分隔线
        else if (prevRenderedType !== currentType) {
          elements.push(renderDivider(currentType === "panelOnly", `divider-type-switch-${index}`))
        }
      }

      // === 创建按钮 ===
      if (btnConfig.id === "manualAnchor") {
        elements.push(renderManualAnchorGroup(isEnabled))
      } else {
        elements.push(renderButton(btnConfig.id, def, isEnabled))
      }

      // 更新状态
      prevRenderedType = currentType
      prevRenderedId = btnConfig.id
      isFirstRendered = false
    })

    return elements
  }

  // 悬浮隐藏：鼠标离开后延迟隐藏
  useEffect(() => {
    if (!groupRef.current) return

    let hideTimer: number | null = null

    const handleMouseEnter = () => {
      if (hideTimer) {
        clearTimeout(hideTimer)
        hideTimer = null
      }
      setIsHovered(true)
    }

    const handleMouseLeave = () => {
      hideTimer = window.setTimeout(() => {
        setIsHovered(false)
      }, 300)
    }

    const el = groupRef.current
    el.addEventListener("mouseenter", handleMouseEnter)
    el.addEventListener("mouseleave", handleMouseLeave)

    return () => {
      el.removeEventListener("mouseenter", handleMouseEnter)
      el.removeEventListener("mouseleave", handleMouseLeave)
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [])

  return (
    <>
      {/* 加载历史遮罩 */}
      <LoadingOverlay isVisible={isLoadingHistory} text={loadingText} onStop={stopLoading} />
      <div
        ref={groupRef}
        className={`quick-btn-group gh-interactive ${!isPanelOpen ? "collapsed" : ""}`}
        style={{
          position: "fixed",
          right: "16px",
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          zIndex: 9998,
          transition: "opacity 0.3s",
        }}>
        {renderButtonGroup()}
      </div>
    </>
  )
}
