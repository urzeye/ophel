import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

import { getAdapter } from "~adapters/index"
import { ThemeDarkIcon, ThemeLightIcon, EyeClosedIcon } from "~components/icons"
import { LoadingOverlay } from "~components/LoadingOverlay"
import { Tooltip } from "~components/ui/Tooltip"
import { COLLAPSED_BUTTON_DEFS, TOOLS_MENU_IDS, TOOLS_MENU_ITEMS } from "~constants"
import type { ThemeTransitionOrigin } from "~core/theme-manager"
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
import { DEFAULT_SETTINGS, getSiteTheme, type QuickButtonsPosition } from "~utils/storage"
import { showToast } from "~utils/toast"

interface QuickButtonsProps {
  isPanelOpen: boolean
  onPanelToggle: () => void
  onThemeToggle?: (event?: ThemeTransitionOrigin) => void
  themeMode?: "light" | "dark"
  // 工具栏功能
  onExport?: () => void
  onMove?: () => void
  onSetTag?: () => void
  onScrollLock?: (locked: boolean) => void
  onSettings?: () => void
  onCleanup?: () => void
  onGlobalSearch?: () => void
  scrollLocked?: boolean
  // 新增功能
  onCopyMarkdown?: () => void
  onModelLockToggle?: () => void
  isModelLocked?: boolean
  onOpenSettings?: () => void
  isScrolling?: boolean
}

type ViewportSize = {
  width: number
  height: number
}

type GroupPosition = QuickButtonsPosition
type GroupMetrics = {
  width: number
  height: number
}

const readViewportSize = (): ViewportSize => ({
  width: window.visualViewport?.width ?? window.innerWidth,
  height: window.visualViewport?.height ?? window.innerHeight,
})

const areGroupPositionsEqual = (
  left: GroupPosition | null | undefined,
  right: GroupPosition | null | undefined,
): boolean => {
  if (!left || !right) return left === right
  return left.xRatio === right.xRatio && left.yRatio === right.yRatio
}

// 交互常量（module-level 以避免 react-hooks/exhaustive-deps 噪音）
const DRAG_LONG_PRESS_MS = 150
const DRAG_THRESHOLD_PX = 6
const DRAG_PADDING_PX = 8
const POSITION_PERSIST_DEBOUNCE_MS = 220
const PROXIMITY_RADIUS_PX = 150
const PROXIMITY_RETAIN_MS = 3000
const ACTIVITY_PROTECT_MS = 4000
const LEAVE_WINDOW_RETAIN_MS = 1500

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
  onGlobalSearch,
  scrollLocked,
  onCopyMarkdown,
  onModelLockToggle,
  isModelLocked,
  onOpenSettings,
  isScrolling,
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
  const adapter = getAdapter()
  const quickButtonsSettings = currentSettings.quickButtons || DEFAULT_SETTINGS.quickButtons
  const collapsedButtonsOrder = quickButtonsSettings.collapsed || []
  const quickButtonsSide = currentSettings.panel?.defaultPosition ?? "right"
  const quickButtonsPositionStyle =
    quickButtonsSide === "left" ? { left: "16px", right: "auto" } : { right: "16px", left: "auto" }
  const quickButtonsOpacity = Math.min(Math.max(quickButtonsSettings.opacity ?? 1, 0.4), 1)
  const persistedGroupPosition = quickButtonsSettings.position ?? null
  const siteId = adapter?.getSiteId() || "_default"
  const siteTheme = getSiteTheme(currentSettings, siteId)
  const resolvedThemeMode = themeMode || (siteTheme.mode === "dark" ? "dark" : "light")
  const currentThemeStyleId =
    resolvedThemeMode === "light"
      ? siteTheme.lightStyleId || "google-gradient"
      : siteTheme.darkStyleId || "classic-dark"
  const panelSparkleColor = currentThemeStyleId === "google-gradient" ? "currentColor" : "brand"

  // 工具菜单状态
  const groupRef = useRef<HTMLDivElement>(null)
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false)
  const [viewportSize, setViewportSize] = useState<ViewportSize>(readViewportSize)
  const [groupMetrics, setGroupMetrics] = useState<GroupMetrics>({ width: 0, height: 0 })

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

  const [groupPosition, setGroupPosition] = useState<GroupPosition | null>(persistedGroupPosition)
  const [isDragging, setIsDragging] = useState(false)
  const [isPressing, setIsPressing] = useState(false)
  const groupPositionRef = useRef<GroupPosition | null>(persistedGroupPosition)
  const lastPersistedGroupPositionRef = useRef<GroupPosition | null>(persistedGroupPosition)
  const groupMetricsRef = useRef<GroupMetrics>({ width: 0, height: 0 })
  const [defaultTopPx, setDefaultTopPx] = useState<number | null>(null)
  const defaultTopPxRef = useRef<number | null>(null)

  const dragTimerRef = useRef<number | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const draggingRef = useRef(false)
  const pointerIdRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const positionPersistTimerRef = useRef<number | null>(null)

  // 锚点状态（使用全局存储）
  const anchorPosition = useSyncExternalStore(anchorStore.subscribe, anchorStore.getSnapshot)
  const hasAnchor = anchorPosition !== null

  // 悬浮隐藏状态
  const [_isHovered, setIsHovered] = useState(false)
  // groupRef moved to top

  // 局部失焦状态 (用于液态折叠)
  const [isProximate, setIsProximate] = useState(true)
  const activityTimerRef = useRef<number | null>(null)
  const isActiveRef = useRef(false)

  const retainActivity = useCallback((durationMs: number = PROXIMITY_RETAIN_MS) => {
    setIsProximate(true)
    if (activityTimerRef.current !== null) {
      window.clearTimeout(activityTimerRef.current)
    }
    activityTimerRef.current = window.setTimeout(() => {
      setIsProximate(false)
    }, durationMs)
  }, [])

  // 仅缩短已有的收缩倒计时，不唤醒已收缩态（避免 mouseleave / visibilitychange 产生闪烁）
  const shortenCountdown = useCallback((durationMs: number) => {
    if (activityTimerRef.current !== null) {
      window.clearTimeout(activityTimerRef.current)
      activityTimerRef.current = window.setTimeout(() => {
        setIsProximate(false)
      }, durationMs)
    }
  }, [])

  // 监听组件活跃状态：包括拖拽、按压、面板展开、工具菜单打开
  useEffect(() => {
    const isActive = isDragging || isPressing || isPanelOpen || isToolsMenuOpen
    isActiveRef.current = isActive
    if (isActive) {
      setIsProximate(true)
      if (activityTimerRef.current !== null) {
        window.clearTimeout(activityTimerRef.current)
        activityTimerRef.current = null
      }
    } else {
      // 从活跃变成不活跃时，给保护时间（尤其是刚拖拽完）
      retainActivity(ACTIVITY_PROTECT_MS)
    }
  }, [isDragging, isPressing, isPanelOpen, isToolsMenuOpen, retainActivity])

  useEffect(() => {
    let rafId: number | null = null

    const handleMouseMove = (e: MouseEvent) => {
      if (rafId !== null) return

      rafId = requestAnimationFrame(() => {
        rafId = null
        if (!groupRef.current || isActiveRef.current) return

        const rect = groupRef.current.getBoundingClientRect()
        // 计算鼠标到组件包围盒边界的最小距离
        const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right)
        const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom)
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance <= PROXIMITY_RADIUS_PX) {
          // 在引力场内：保持唤醒并重置收缩倒计时
          retainActivity(PROXIMITY_RETAIN_MS)
        }
      })
    }

    const handleMouseLeaveWindow = () => {
      // 鼠标离开窗口时，仅缩短已有倒计时，不唤醒已收缩态
      shortenCountdown(LEAVE_WINDOW_RETAIN_MS)
    }

    const handleVisibilityChange = () => {
      // 标签页切换或窗口最小化时，mouseleave 不触发，用 visibilitychange 兜底
      if (document.hidden) {
        shortenCountdown(LEAVE_WINDOW_RETAIN_MS)
      }
    }

    document.addEventListener("mousemove", handleMouseMove, { passive: true })
    document.addEventListener("mouseleave", handleMouseLeaveWindow, { passive: true })
    document.addEventListener("visibilitychange", handleVisibilityChange)

    // 初始化时维持展开
    retainActivity(PROXIMITY_RETAIN_MS)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseleave", handleMouseLeaveWindow)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (activityTimerRef.current !== null) {
        window.clearTimeout(activityTimerRef.current)
      }
    }
  }, [retainActivity, shortenCountdown])

  const isLiquidCollapsed =
    !isProximate && !_isHovered && !isToolsMenuOpen && !isPanelOpen && !isDragging && !isPressing

  // 用 ref 追踪 isLiquidCollapsed，避免 ResizeObserver 的 useLayoutEffect 因它变化而反复 teardown/recreate
  const isLiquidCollapsedRef = useRef(isLiquidCollapsed)
  isLiquidCollapsedRef.current = isLiquidCollapsed

  // 跟踪是否处于 Flutter 模式（图文并茂）
  const [_isFlutterMode, setIsFlutterMode] = useState(false)

  // 加载状态
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [loadingText, setLoadingText] = useState("")
  const abortLoadingRef = useRef(false)

  const clearPositionPersistTimer = useCallback(() => {
    if (positionPersistTimerRef.current !== null) {
      window.clearTimeout(positionPersistTimerRef.current)
      positionPersistTimerRef.current = null
    }
  }, [])

  const persistGroupPosition = useCallback(
    (position: GroupPosition | null | undefined) => {
      const nextPosition = position ?? null
      clearPositionPersistTimer()

      if (areGroupPositionsEqual(lastPersistedGroupPositionRef.current, nextPosition)) {
        return
      }

      lastPersistedGroupPositionRef.current = nextPosition
      updateNestedSetting("quickButtons", "position", nextPosition || undefined)
    },
    [clearPositionPersistTimer, updateNestedSetting],
  )

  const scheduleGroupPositionPersist = useCallback(
    (position: GroupPosition) => {
      if (areGroupPositionsEqual(lastPersistedGroupPositionRef.current, position)) {
        return
      }

      clearPositionPersistTimer()

      const queuedPosition = { ...position }
      positionPersistTimerRef.current = window.setTimeout(() => {
        positionPersistTimerRef.current = null

        if (areGroupPositionsEqual(lastPersistedGroupPositionRef.current, queuedPosition)) {
          return
        }

        lastPersistedGroupPositionRef.current = queuedPosition
        updateNestedSetting("quickButtons", "position", queuedPosition)
      }, POSITION_PERSIST_DEBOUNCE_MS)
    },
    [POSITION_PERSIST_DEBOUNCE_MS, clearPositionPersistTimer, updateNestedSetting],
  )

  useEffect(() => {
    const persistedChanged = !areGroupPositionsEqual(
      lastPersistedGroupPositionRef.current,
      persistedGroupPosition,
    )

    if (persistedChanged) {
      clearPositionPersistTimer()
    }

    lastPersistedGroupPositionRef.current = persistedGroupPosition

    if (!persistedChanged || draggingRef.current) return
    groupPositionRef.current = persistedGroupPosition
    setGroupPosition(persistedGroupPosition)
  }, [clearPositionPersistTimer, persistedGroupPosition])

  useEffect(() => {
    return () => {
      clearPositionPersistTimer()
    }
  }, [clearPositionPersistTimer])

  useEffect(() => {
    if (persistedGroupPosition) {
      defaultTopPxRef.current = null
      setDefaultTopPx(null)
    }
  }, [persistedGroupPosition])

  const getGroupBounds = useCallback(
    (viewport: ViewportSize, metrics: GroupMetrics = groupMetricsRef.current) => {
      const width = metrics.width
      const height = metrics.height
      const maxX = Math.max(DRAG_PADDING_PX, viewport.width - width - DRAG_PADDING_PX)
      const maxY = Math.max(DRAG_PADDING_PX, viewport.height - height - DRAG_PADDING_PX)

      return { width, height, maxX, maxY }
    },
    [DRAG_PADDING_PX],
  )

  const clampPixelGroupPosition = useCallback(
    (
      x: number,
      y: number,
      viewport: ViewportSize,
      metrics: GroupMetrics = groupMetricsRef.current,
    ) => {
      const { width, height, maxX, maxY } = getGroupBounds(viewport, metrics)

      return {
        x: Math.min(Math.max(x, DRAG_PADDING_PX), maxX),
        y: Math.min(Math.max(y, DRAG_PADDING_PX), maxY),
        width,
        height,
        maxX,
        maxY,
      }
    },
    [DRAG_PADDING_PX, getGroupBounds],
  )

  const toLogicalGroupPosition = useCallback(
    (
      x: number,
      y: number,
      viewport: ViewportSize,
      metrics: GroupMetrics = groupMetricsRef.current,
    ): GroupPosition => {
      const clamped = clampPixelGroupPosition(x, y, viewport, metrics)
      const usableWidth = Math.max(1, clamped.maxX - DRAG_PADDING_PX)
      const usableHeight = Math.max(1, clamped.maxY - DRAG_PADDING_PX)
      const xRatio = Math.min(1, Math.max(0, (clamped.x - DRAG_PADDING_PX) / usableWidth))
      const yRatio = Math.min(1, Math.max(0, (clamped.y - DRAG_PADDING_PX) / usableHeight))

      return { xRatio, yRatio }
    },
    [DRAG_PADDING_PX, clampPixelGroupPosition],
  )

  const resolveLogicalGroupPosition = useCallback(
    (
      position: GroupPosition | null,
      viewport: ViewportSize,
      metrics: GroupMetrics = groupMetricsRef.current,
    ) => {
      if (!position) return null

      const { maxX, maxY } = getGroupBounds(viewport, metrics)
      const usableWidth = Math.max(1, maxX - DRAG_PADDING_PX)
      const usableHeight = Math.max(1, maxY - DRAG_PADDING_PX)
      const rawX = DRAG_PADDING_PX + position.xRatio * usableWidth
      const rawY = DRAG_PADDING_PX + position.yRatio * usableHeight

      return {
        x: Math.min(Math.max(rawX, DRAG_PADDING_PX), maxX),
        y: Math.min(Math.max(rawY, DRAG_PADDING_PX), maxY),
      }
    },
    [DRAG_PADDING_PX, getGroupBounds],
  )

  useLayoutEffect(() => {
    const element = groupRef.current
    if (!element) return

    const syncGroupMetrics = () => {
      const rect = element.getBoundingClientRect()
      const nextMetrics = { width: rect.width, height: rect.height }
      const prevMetrics = groupMetricsRef.current
      const isInitialMetricsSync = prevMetrics.width === 0 && prevMetrics.height === 0
      const metricsChanged =
        prevMetrics.width !== nextMetrics.width || prevMetrics.height !== nextMetrics.height

      if (!metricsChanged) return

      groupMetricsRef.current = nextMetrics
      setGroupMetrics(nextMetrics)

      const viewport = readViewportSize()

      if (!groupPositionRef.current) {
        const fallbackTop = defaultTopPxRef.current ?? rect.top
        const nextDefaultTop = clampPixelGroupPosition(0, fallbackTop, viewport, nextMetrics).y

        if (defaultTopPxRef.current !== nextDefaultTop) {
          defaultTopPxRef.current = nextDefaultTop
          setDefaultTopPx(nextDefaultTop)
        }

        return
      }

      if (draggingRef.current || isInitialMetricsSync) {
        // 首次挂载时，持久化位置仍按 0x0 尺寸参与了首帧定位。
        // 这时如果直接用当前 rect 反推 ratio，会把这个“临时偏低”的像素位置写回，
        // 导致刷新一次就下移一点。先只更新 metrics，让下一帧用真实尺寸重算位置。
        return
      }

      const nextPosition = toLogicalGroupPosition(rect.left, rect.top, viewport, nextMetrics)
      const prevPosition = groupPositionRef.current

      if (
        prevPosition.xRatio !== nextPosition.xRatio ||
        prevPosition.yRatio !== nextPosition.yRatio
      ) {
        groupPositionRef.current = nextPosition
        setGroupPosition(nextPosition)

        if (isLiquidCollapsedRef.current) {
          // 水滴态和展开态使用的尺寸不同，但这里的 ratio 是按“当前尺寸”反推出来的。
          // 如果把水滴态 ratio 持久化，下一次刷新按展开态尺寸恢复时就会整体向上漂。
          // 因此液态收缩期间只修正当前会话位置，不写回持久化设置。
          return
        }

        // ResizeObserver 会在尺寸动画期间连续触发，这里只在尺寸稳定后回写一次。
        scheduleGroupPositionPersist(nextPosition)
      }
    }

    syncGroupMetrics()

    const resizeObserver = new ResizeObserver(() => {
      syncGroupMetrics()
    })

    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
    }
  }, [clampPixelGroupPosition, scheduleGroupPositionPersist, toLogicalGroupPosition])

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

  const resolvedGroupPosition = resolveLogicalGroupPosition(
    groupPosition,
    viewportSize,
    groupMetrics,
  )
  const groupBounds = getGroupBounds(viewportSize, groupMetrics)
  const toolsMenuSideClass =
    resolvedGroupPosition && groupBounds.width > 0
      ? resolvedGroupPosition.x + groupBounds.width / 2 <= viewportSize.width / 2
        ? "side-right"
        : "side-left"
      : quickButtonsSide === "left"
        ? "side-right"
        : "side-left"

  // 按钮点击处理器
  const buttonActions: Record<string, (e?: React.MouseEvent<HTMLButtonElement>) => void> = {
    scrollTop: scrollToTop,
    scrollBottom: scrollToBottom,
    panel: onPanelToggle,
    anchor: handleAnchorClick,
    theme: (e) => {
      e?.stopPropagation()
      const button = e?.currentTarget
      if (button) {
        onThemeToggle?.(getButtonCenter(button))
        return
      }
      onThemeToggle?.()
    },
    floatingToolbar: (e) => {
      e?.stopPropagation()
      // Toggle local menu state instead of settings
      setIsToolsMenuOpen((prev) => !prev)
    },
    globalSearch: (e) => {
      e?.stopPropagation()
      setIsToolsMenuOpen(false)
      onGlobalSearch?.()
    },
    zenMode: (e) => {
      e?.stopPropagation()
      const siteId = adapter?.getSiteId() || "_default"
      const currentZenMode = settings?.layout?.zenMode?.[siteId]?.enabled || false
      const newZenEnabled = !currentZenMode
      updateNestedSetting("layout", "zenMode", {
        [siteId]: { enabled: newZenEnabled },
      })
      // 开启禅模式时自动开启净化模式，关闭禅模式时不变净化模式
      if (newZenEnabled) {
        updateNestedSetting("layout", "cleanMode", {
          [siteId]: { enabled: true },
        })
      }
    },
    settings: (e) => {
      e?.stopPropagation()
      setIsToolsMenuOpen(false)
      onOpenSettings?.()
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
    const isZenModeBtn = id === "zenMode"
    // Check if Zen mode is active
    const isZenModeActive = isZenModeBtn && Boolean(settings?.layout?.zenMode?.[siteId]?.enabled)

    // Animation: Active state
    const isActive = isFloatingToolbarBtn ? isToolsMenuOpen : isZenModeActive

    // panel-only 按钮：面板展开时隐藏
    // hideWhenPanelOpen 按钮：仅在悬浮模式且面板展开时隐藏（edge-snap 模式下始终显示，因为面板收在边缘不便操作）
    // 禁用的按钮：永远隐藏
    const isFloatingOpen =
      isPanelOpen && (settings?.panel?.panelMode ?? "edge-snap") !== "edge-snap"
    const shouldHide =
      isDisabled || (isPanelOnly && isPanelOpen) || (def.hideWhenPanelOpen && isFloatingOpen)
    if (shouldHide) return null

    // 优先使用 IconComponent，否则用 emoji
    let icon: React.ReactNode
    if (id === "theme") {
      icon = getThemeIcon()
    } else if (isZenModeActive) {
      // 用闭眼表示开启禅模式
      icon = <EyeClosedIcon size={18} color="currentColor" />
    } else if (def.IconComponent) {
      const IconComp = def.IconComponent
      // 面板主按钮在默认 google-gradient 主题下跟随环境文字色，其余主题使用品牌渐变。
      const iconColor = id === "panel" ? panelSparkleColor : undefined
      icon = <IconComp size={id === "panel" ? 21 : 18} color={iconColor} />
    } else {
      icon = def.icon
    }

    const isAnchorBtn = id === "anchor"
    const isPanelBtn = id === "panel"
    const anchorDisabled = isAnchorBtn && !hasAnchor

    const tooltipContent = isAnchorBtn
      ? hasAnchor
        ? t("goToAnchor") || "返回锚点"
        : t("noAnchor") || "暂无锚点"
      : t(def.labelKey) || def.labelKey

    return (
      <Tooltip key={id} content={tooltipContent}>
        <button
          className={`quick-prompt-btn gh-interactive ${isPanelOnly ? "panel-only" : ""} ${isPanelBtn ? "panel-btn" : ""} ${isActive ? "active" : ""} ${isFloatingToolbarBtn ? "tools-trigger-btn" : ""} ${isZenModeBtn ? "zen-mode-btn" : ""}`}
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
    if (isLiquidCollapsed) {
      // 液态收缩态只显示固定品牌 Logo，避免受到按钮排序影响。
      return [renderButton("panel", COLLAPSED_BUTTON_DEFS.panel, true)]
    }

    const elements: React.ReactNode[] = []
    const navigations = new Set(["scrollTop", "scrollBottom", "anchor", "manualAnchor"])

    const renderable = collapsedButtonsOrder
      .map((btnConfig) => {
        // 暂时禁用“手动锚点”按钮，避免对用户造成困扰
        if (btnConfig.id === "manualAnchor") return null
        const def = COLLAPSED_BUTTON_DEFS[btnConfig.id]
        if (!def) return null

        const isEnabled = def.canToggle ? btnConfig.enabled : true
        if (!isEnabled) return null

        if (def.isPanelOnly && isPanelOpen) return null
        const isFloatingOpen =
          isPanelOpen && (settings?.panel?.panelMode ?? "edge-snap") !== "edge-snap"
        if (def.hideWhenPanelOpen && isFloatingOpen) return null

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
    const enabledIds = quickButtonsSettings.toolsMenu ?? TOOLS_MENU_ITEMS.map((item) => item.id)
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
  }, [clampPixelGroupPosition])

  useEffect(() => {
    let rafId: number | null = null
    let debounceId: number | null = null
    let needsFollowUp = false

    const syncViewport = () => {
      const next = readViewportSize()
      setViewportSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      )

      if (groupPositionRef.current || defaultTopPxRef.current === null) return

      const nextDefaultTop = clampPixelGroupPosition(
        0,
        defaultTopPxRef.current,
        next,
        groupMetricsRef.current,
      ).y

      if (defaultTopPxRef.current !== nextDefaultTop) {
        defaultTopPxRef.current = nextDefaultTop
        setDefaultTopPx(nextDefaultTop)
      }
    }

    const scheduleRaf = () => {
      if (rafId !== null) {
        needsFollowUp = true
        return
      }

      rafId = requestAnimationFrame(() => {
        rafId = null
        syncViewport()
        if (needsFollowUp) {
          needsFollowUp = false
          scheduleRaf()
        }
      })
    }

    const scheduleDebounce = () => {
      if (debounceId !== null) {
        window.clearTimeout(debounceId)
      }
      debounceId = window.setTimeout(() => {
        debounceId = null
        syncViewport()
      }, 120)
    }

    const handleResize = () => {
      scheduleRaf()
      scheduleDebounce()
    }

    window.addEventListener("resize", handleResize)
    window.visualViewport?.addEventListener("resize", handleResize)
    return () => {
      window.removeEventListener("resize", handleResize)
      window.visualViewport?.removeEventListener("resize", handleResize)
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (debounceId !== null) window.clearTimeout(debounceId)
    }
  }, [clampPixelGroupPosition])

  const clearDragTimer = () => {
    if (dragTimerRef.current) {
      window.clearTimeout(dragTimerRef.current)
      dragTimerRef.current = null
    }
  }

  const endDragging = () => {
    const shouldPersist = draggingRef.current
    setIsPressing(false)
    clearDragTimer()
    dragStartRef.current = null
    dragOffsetRef.current = null

    if (draggingRef.current) {
      clearPositionPersistTimer()
      draggingRef.current = false
      setIsDragging(false)
    }

    if (groupRef.current && pointerIdRef.current !== null) {
      if (groupRef.current.hasPointerCapture(pointerIdRef.current)) {
        groupRef.current.releasePointerCapture(pointerIdRef.current)
      }
    }
    pointerIdRef.current = null

    if (shouldPersist) {
      persistGroupPosition(groupPositionRef.current)
    }
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

      clearPositionPersistTimer()
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

    const currentViewport = readViewportSize()
    const offset = dragOffsetRef.current || { x: 0, y: 0 }
    const nextX = e.clientX - offset.x
    const nextY = e.clientY - offset.y
    const nextPosition = toLogicalGroupPosition(nextX, nextY, currentViewport)
    setViewportSize((prev) =>
      prev.width === currentViewport.width && prev.height === currentViewport.height
        ? prev
        : currentViewport,
    )
    groupPositionRef.current = nextPosition
    setGroupPosition(nextPosition)
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
        className={`quick-btn-group gh-interactive ${!isPanelOpen ? "collapsed" : ""} ${isDragging ? "dragging" : ""} ${isPressing ? "pressing" : ""} ${isScrolling ? "scroll-hidden" : ""} ${isLiquidCollapsed ? "liquid-collapsed" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClickCapture={handleClickCapture}
        style={{
          position: "fixed",
          top: resolvedGroupPosition
            ? `${resolvedGroupPosition.y}px`
            : defaultTopPx !== null
              ? `${defaultTopPx}px`
              : "50%",
          left: resolvedGroupPosition
            ? `${resolvedGroupPosition.x}px`
            : quickButtonsPositionStyle.left,
          right: resolvedGroupPosition ? "auto" : quickButtonsPositionStyle.right,
          transform: resolvedGroupPosition || defaultTopPx !== null ? "none" : "translateY(-50%)",
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
            className={`quick-menu-popover ${toolsMenuSideClass}`}
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
