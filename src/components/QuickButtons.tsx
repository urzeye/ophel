import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"

import { getAdapter } from "~adapters/index"
import { ThemeDarkIcon, ThemeLightIcon } from "~components/icons"
import { LoadingOverlay } from "~components/LoadingOverlay"
import { Tooltip } from "~components/ui/Tooltip"
import { COLLAPSED_BUTTON_DEFS, TOOLS_MENU_IDS, TOOLS_MENU_ITEMS } from "~constants"
import { anchorStore } from "~stores/anchor-store"
import { useSettingsStore } from "~stores/settings-store"
import { loadHistoryUntil } from "~utils/history-loader"
import { t } from "~utils/i18n"
import {
  getScrollInfo,
  isFlutterProxy,
  smartScrollTo,
  smartScrollToBottom,
} from "~utils/scroll-helper"
import { DEFAULT_SETTINGS } from "~utils/storage"
import { showToast } from "~utils/toast"

interface QuickButtonsProps {
  isPanelOpen: boolean
  onPanelToggle: () => void
  onThemeToggle?: () => void
  themeMode?: "light" | "dark"
  // 工具栏功能
  onExport?: () => void
  onMove?: () => void
  onSetTag?: () => void
  onScrollLock?: (locked: boolean) => void
  onSettings?: () => void
  onCleanup?: () => void
  scrollLocked?: boolean
  // 新增功能
  onCopyMarkdown?: () => void
  onModelLockToggle?: () => void
  isModelLocked?: boolean
}

export const QuickButtons: React.FC<QuickButtonsProps> = ({
  isPanelOpen,
  onPanelToggle,
  onThemeToggle,
  themeMode,
  onExport,
  onMove,
  onSetTag,
  onScrollLock,
  onSettings,
  onCleanup,
  scrollLocked,
  onCopyMarkdown,
  onModelLockToggle,
  isModelLocked,
}) => {
  const { settings } = useSettingsStore()
  const currentSettings = settings || DEFAULT_SETTINGS
  const collapsedButtonsOrder = currentSettings.collapsedButtons || []
  const quickButtonsSide = currentSettings.panel?.defaultPosition ?? "right"
  const quickButtonsPositionStyle =
    quickButtonsSide === "left" ? { left: "16px", right: "auto" } : { right: "16px", left: "auto" }
  const quickButtonsOpacity = Math.min(Math.max(currentSettings.quickButtonsOpacity ?? 1, 0.4), 1)

  const DRAG_LONG_PRESS_MS = 150
  const DRAG_THRESHOLD_PX = 6
  const DRAG_PADDING_PX = 8

  // 工具菜单状态
  const groupRef = useRef<HTMLDivElement>(null)
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false)

  // 点击外部关闭菜单
  useEffect(() => {
    if (!isToolsMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (groupRef.current && !groupRef.current.contains(target)) {
        setIsToolsMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isToolsMenuOpen])

  const [groupPosition, setGroupPosition] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isPressing, setIsPressing] = useState(false)

  const dragTimerRef = useRef<number | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const draggingRef = useRef(false)
  const pointerIdRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)

  // 锚点状态（使用全局存储）
  const anchorPosition = useSyncExternalStore(anchorStore.subscribe, anchorStore.getSnapshot)
  const hasAnchor = anchorPosition !== null

  // 悬浮隐藏状态
  const [_isHovered, setIsHovered] = useState(false)
  // groupRef moved to top

  // 获取适配器
  const adapter = getAdapter()

  // 跟踪是否处于 Flutter 模式（图文并茂）
  const [_isFlutterMode, setIsFlutterMode] = useState(false)

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
    let overlayTimer: ReturnType<typeof window.setTimeout> | null = setTimeout(() => {
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

      // 保存锚点到全局存储
      anchorStore.set(result.previousScrollTop)
      setIsFlutterMode(result.isFlutterMode)

      // 清理遮罩
      if (overlayTimer) {
        window.clearTimeout(overlayTimer)
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
        window.clearTimeout(overlayTimer)
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

    // 保存锚点到全局存储
    anchorStore.set(previousScrollTop)

    // 检测是否处于 Flutter 模式
    setIsFlutterMode(isFlutterProxy(container))
  }, [adapter])

  // 锚点跳转（双向，支持图文并茂模式）
  const handleAnchorClick = useCallback(async () => {
    const savedAnchor = anchorStore.get()
    if (savedAnchor === null) return

    // 获取当前位置
    const scrollInfo = await getScrollInfo(adapter)
    const currentPos = scrollInfo.scrollTop

    // 跳转到锚点
    await smartScrollTo(adapter, savedAnchor)

    // 交换位置
    anchorStore.set(currentPos)
  }, [adapter])

  // 手动锚点：设置（支持图文并茂模式）
  const setAnchorManually = useCallback(async () => {
    const scrollInfo = await getScrollInfo(adapter)
    anchorStore.set(scrollInfo.scrollTop)
    setIsFlutterMode(scrollInfo.isFlutterMode)
  }, [adapter])

  // 获取主题图标
  const getThemeIcon = () => {
    const isDark = themeMode === "dark"
    // 深色模式显示太阳（点击切换到浅色），浅色模式显示月亮（点击切换到深色）
    return isDark ? <ThemeLightIcon size={20} /> : <ThemeDarkIcon size={20} />
  }

  const clampGroupPosition = useCallback(
    (x: number, y: number) => {
      const rect = groupRef.current?.getBoundingClientRect()
      if (!rect) return { x, y }

      const maxX = Math.max(DRAG_PADDING_PX, window.innerWidth - rect.width - DRAG_PADDING_PX)
      const maxY = Math.max(DRAG_PADDING_PX, window.innerHeight - rect.height - DRAG_PADDING_PX)

      return {
        x: Math.min(Math.max(x, DRAG_PADDING_PX), maxX),
        y: Math.min(Math.max(y, DRAG_PADDING_PX), maxY),
      }
    },
    [DRAG_PADDING_PX],
  )

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
    floatingToolbar: (e) => {
      e?.stopPropagation()
      // Toggle local menu state instead of settings
      setIsToolsMenuOpen((prev) => !prev)
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
    const isFloatingToolbarBtn = id === "floatingToolbar"
    // Animation: Active state for floatingToolbar button is controlled by isToolsMenuOpen
    const isActive = isFloatingToolbarBtn ? isToolsMenuOpen : false

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

    const tooltipContent = isAnchorBtn
      ? hasAnchor
        ? t("goToAnchor") || "返回锚点"
        : t("noAnchor") || "暂无锚点"
      : t(def.labelKey) || def.labelKey

    return (
      <Tooltip key={id} content={tooltipContent}>
        <button
          className={`quick-prompt-btn gh-interactive ${isPanelOnly ? "panel-only" : ""} ${isActive ? "active" : ""} ${isFloatingToolbarBtn ? "tools-trigger-btn" : ""}`}
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

    const anchorDef = COLLAPSED_BUTTON_DEFS.manualAnchor
    const AnchorIcon = anchorDef?.IconComponent

    return (
      <React.Fragment key="manualAnchor">
        {/* 设置锚点（手动） */}
        <Tooltip content={t("setAnchor") || "设置锚点"}>
          <button
            className="quick-prompt-btn manual-anchor-btn set-btn gh-interactive"
            onClick={setAnchorManually}>
            {AnchorIcon ? <AnchorIcon size={18} /> : "📍"}
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
    const navigations = new Set(["scrollTop", "scrollBottom", "anchor", "manualAnchor"])

    const renderable = collapsedButtonsOrder
      .map((btnConfig) => {
        const def = COLLAPSED_BUTTON_DEFS[btnConfig.id]
        if (!def) return null

        const isEnabled = def.canToggle ? btnConfig.enabled : true
        if (!isEnabled) return null

        if (def.isPanelOnly && isPanelOpen) return null

        return {
          id: btnConfig.id,
          def,
          enabled: isEnabled,
          group: navigations.has(btnConfig.id) ? "navigation" : "tools",
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    let index = 0
    while (index < renderable.length) {
      const { group } = renderable[index]
      let nextIndex = index

      while (nextIndex < renderable.length && renderable[nextIndex].group === group) {
        const item = renderable[nextIndex]
        if (item.id === "manualAnchor") {
          elements.push(renderManualAnchorGroup(item.enabled))
        } else {
          elements.push(renderButton(item.id, item.def, item.enabled))
        }
        nextIndex++
      }

      const runLength = nextIndex - index
      if (runLength >= 2 && nextIndex < renderable.length) {
        elements.push(renderDivider(false, `divider-group-${index}`))
      }

      index = nextIndex
    }

    return elements
  }

  // 工具菜单按钮点击处理器映射
  const toolsMenuActions: Record<string, () => void> = {
    [TOOLS_MENU_IDS.EXPORT]: () => onExport?.(),
    [TOOLS_MENU_IDS.COPY_MARKDOWN]: () => onCopyMarkdown?.(),
    [TOOLS_MENU_IDS.MOVE]: () => onMove?.(),
    [TOOLS_MENU_IDS.SET_TAG]: () => onSetTag?.(),
    [TOOLS_MENU_IDS.SCROLL_LOCK]: () => onScrollLock?.(!scrollLocked),
    [TOOLS_MENU_IDS.MODEL_LOCK]: () => onModelLockToggle?.(),
    [TOOLS_MENU_IDS.CLEANUP]: () => onCleanup?.(),
    [TOOLS_MENU_IDS.SETTINGS]: () => onSettings?.(),
  }

  // 获取开关类按钮的激活状态
  const getToggleState = (id: string): boolean => {
    if (id === TOOLS_MENU_IDS.SCROLL_LOCK) return scrollLocked || false
    if (id === TOOLS_MENU_IDS.MODEL_LOCK) return isModelLocked || false
    return false
  }

  // 渲染工具菜单项
  const renderToolsMenuItems = () => {
    const elements: React.ReactNode[] = []
    let lastWasDanger = false
    let lastWasSystem = false

    // 从设置中获取启用的菜单项，如果没有则使用默认全部显示
    const enabledIds = currentSettings.toolsMenu ?? TOOLS_MENU_ITEMS.map((item) => item.id)
    const enabledSet = new Set(enabledIds)

    for (const item of TOOLS_MENU_ITEMS) {
      // Settings 按钮始终显示
      const isVisible = item.isSystem || enabledSet.has(item.id)
      if (!isVisible) continue

      // 分隔线逻辑：danger 区域前加分隔线
      if (item.isDanger && !lastWasDanger) {
        elements.push(<div key={`divider-before-${item.id}`} className="menu-divider" />)
        lastWasDanger = true
      }
      // system 区域前加分隔线
      if (item.isSystem && !lastWasSystem) {
        elements.push(<div key={`divider-before-${item.id}`} className="menu-divider" />)
        lastWasSystem = true
      }

      const IconComponent = item.IconComponent
      const isActive = item.isToggle ? getToggleState(item.id) : false
      const buttonClass = `quick-menu-btn ${isActive ? "active" : ""} ${item.isDanger ? "danger" : ""}`

      elements.push(
        <Tooltip key={item.id} content={t(item.labelKey) || item.defaultLabel}>
          <button
            className={buttonClass}
            onClick={() => {
              toolsMenuActions[item.id]?.()
              setIsToolsMenuOpen(false)
            }}>
            <IconComponent size={18} />
          </button>
        </Tooltip>,
      )
    }

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

  useEffect(() => {
    setGroupPosition(null)
  }, [quickButtonsSide])

  const clearDragTimer = () => {
    if (dragTimerRef.current) {
      window.clearTimeout(dragTimerRef.current)
      dragTimerRef.current = null
    }
  }

  const endDragging = () => {
    setIsPressing(false)
    clearDragTimer()
    dragStartRef.current = null
    dragOffsetRef.current = null

    if (draggingRef.current) {
      draggingRef.current = false
      setIsDragging(false)
    }

    if (groupRef.current && pointerIdRef.current !== null) {
      if (groupRef.current.hasPointerCapture(pointerIdRef.current)) {
        groupRef.current.releasePointerCapture(pointerIdRef.current)
      }
    }
    pointerIdRef.current = null
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if (!groupRef.current) return

    pointerIdRef.current = e.pointerId
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    suppressClickRef.current = false
    setIsPressing(true)

    const rect = groupRef.current.getBoundingClientRect()
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }

    clearDragTimer()
    dragTimerRef.current = window.setTimeout(() => {
      if (!groupRef.current || pointerIdRef.current === null) return

      groupRef.current.setPointerCapture(pointerIdRef.current)
      setIsPressing(false)
      draggingRef.current = true
      suppressClickRef.current = true
      setIsDragging(true)
    }, DRAG_LONG_PRESS_MS)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return

    if (!draggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        clearDragTimer()
        setIsPressing(false)
      }
      return
    }

    e.preventDefault()

    const offset = dragOffsetRef.current || { x: 0, y: 0 }
    const nextX = e.clientX - offset.x
    const nextY = e.clientY - offset.y
    setGroupPosition(clampGroupPosition(nextX, nextY))
  }

  const handlePointerUp = () => {
    endDragging()
  }

  const handlePointerLeave = () => {
    if (draggingRef.current) return
    clearDragTimer()
    setIsPressing(false)
    dragStartRef.current = null
    dragOffsetRef.current = null
    pointerIdRef.current = null
  }

  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return
    e.preventDefault()
    e.stopPropagation()
    suppressClickRef.current = false
  }

  return (
    <>
      {/* 加载历史遮罩 */}
      <LoadingOverlay isVisible={isLoadingHistory} text={loadingText} onStop={stopLoading} />
      <div
        ref={groupRef}
        className={`quick-btn-group gh-interactive ${!isPanelOpen ? "collapsed" : ""} ${isDragging ? "dragging" : ""} ${isPressing ? "pressing" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClickCapture={handleClickCapture}
        style={{
          position: "fixed",
          top: groupPosition ? `${groupPosition.y}px` : "50%",
          left: groupPosition ? `${groupPosition.x}px` : quickButtonsPositionStyle.left,
          right: groupPosition ? "auto" : quickButtonsPositionStyle.right,
          transform: groupPosition ? "none" : "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          zIndex: 9998,
          transition: "opacity 0.3s",
          opacity: quickButtonsOpacity,
        }}>
        <div
          className="quick-btn-drag-handle"
          style={{ "--quick-btn-press-duration": `${DRAG_LONG_PRESS_MS}ms` } as React.CSSProperties}
          aria-hidden="true"
        />
        {renderButtonGroup()}

        {/* 工具菜单 Popover */}
        {isToolsMenuOpen && (
          <div
            className={`quick-menu-popover ${quickButtonsSide === "left" ? "side-right" : "side-left"}`}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}>
            {renderToolsMenuItems()}
          </div>
        )}
      </div>
    </>
  )
}
