import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

import { getAdapter } from "~adapters/index"
import { ConversationManager } from "~core/conversation-manager"
import { InlineBookmarkManager } from "~core/inline-bookmark-manager"
import { OutlineManager } from "~core/outline-manager"
import { PromptManager } from "~core/prompt-manager"
import { ThemeManager } from "~core/theme-manager"
import { useShortcuts } from "~hooks/useShortcuts"
import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import { DEFAULT_SETTINGS, type Prompt, type Settings } from "~utils/storage"
import { MSG_CLEAR_ALL_DATA } from "~utils/messaging"
import { showToast } from "~utils/toast"
import { t } from "~utils/i18n"

import { ConfirmDialog, FolderSelectDialog, TagManagerDialog } from "./ConversationDialogs"
import { DisclaimerModal } from "./DisclaimerModal"
import { MainPanel } from "./MainPanel"
import { QuickButtons } from "./QuickButtons"
import { SelectedPromptBar } from "./SelectedPromptBar"
import { SettingsModal } from "./SettingsModal"
import { useTagsStore } from "~stores/tags-store"

export const App = () => {
  // 读取设置 - 使用 Zustand Store
  const { settings, setSettings, updateDeepSetting } = useSettingsStore()
  const isSettingsHydrated = useSettingsHydrated()

  // 订阅 _syncVersion 以在跨上下文同步时强制触发重渲染
  // 当 Options 页面更新设置时，_syncVersion 递增，这会使整个组件重渲染
  const _syncVersion = useSettingsStore((s) => s._syncVersion)

  // 面板状态 - 初始值来自设置
  const [isPanelOpen, setIsPanelOpen] = useState(false)

  // 使用 ref 保持 settings 的最新引用，避免闭包捕获过期值
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  // 初始化面板状态
  useEffect(() => {
    // 确保仅在 hydration 完成且 settings 加载后执行一次初始化
    if (isSettingsHydrated && settings && !isInitializedRef.current) {
      isInitializedRef.current = true
      // 如果 defaultPanelOpen 为 true，打开面板
      if (settings.panel?.defaultOpen) {
        // 如果开启了边缘吸附，且初始边距小于吸附阈值，则直接初始化为吸附状态
        const {
          edgeSnap,
          defaultEdgeDistance = 25,
          edgeSnapThreshold = 18,
          defaultPosition = "right",
        } = settings.panel
        if (edgeSnap && defaultEdgeDistance <= edgeSnapThreshold) {
          setEdgeSnapState(defaultPosition)
        }
        setIsPanelOpen(true)
      }
    }
  }, [isSettingsHydrated, settings])

  useEffect(() => {
    if (!isSettingsHydrated || !settings) return

    let needsUpdate = false
    const nextSettings: Partial<Settings> = {}
    const buttons = settings.collapsedButtons || []

    if (!buttons.some((btn) => btn.id === "floatingToolbar")) {
      const nextButtons = [...buttons]
      const panelIndex = nextButtons.findIndex((btn) => btn.id === "panel")
      const insertIndex = panelIndex >= 0 ? panelIndex + 1 : nextButtons.length
      nextButtons.splice(insertIndex, 0, { id: "floatingToolbar", enabled: true })
      nextSettings.collapsedButtons = nextButtons
      needsUpdate = true
    }

    if (!settings.floatingToolbar) {
      nextSettings.floatingToolbar = { open: true }
      needsUpdate = true
    }

    if (needsUpdate) {
      setSettings(nextSettings)
    }
  }, [isSettingsHydrated, settings, setSettings])

  // 选中的提示词状态
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)

  // 设置模态框状态
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // 浮动工具栏

  const [floatingToolbarMoveState, setFloatingToolbarMoveState] = useState<{
    convId: string
    activeFolderId?: string
  } | null>(null)
  const [isFloatingToolbarClearOpen, setIsFloatingToolbarClearOpen] = useState(false)

  // 边缘吸附状态
  const [edgeSnapState, setEdgeSnapState] = useState<"left" | "right" | null>(null)
  // 临时显示状态（当鼠标悬停在面板上时）
  const [isEdgePeeking, setIsEdgePeeking] = useState(false)
  // 是否有活跃的交互（如打开了菜单/对话框），此时即使鼠标移出也不隐藏面板
  // 使用 useRef 避免闭包陷阱和不必要的重渲染
  const isInteractionActiveRef = useRef(false)
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null)
  // 快捷键触发的面板显示延迟缩回计时器
  const shortcutPeekTimerRef = useRef<NodeJS.Timeout | null>(null)
  // 使用 ref 跟踪设置模态框状态，避免闭包捕获过期值
  const isSettingsOpenRef = useRef(false)
  // 追踪面板内输入框是否聚焦（解决 IME 输入法弹出时 CSS :hover 失效的问题）
  const isInputFocusedRef = useRef(false)
  // 追踪是否已完成初始化，防止重复执行
  const isInitializedRef = useRef(false)

  // 取消快捷键触发的延迟缩回计时器
  const cancelShortcutPeekTimer = useCallback(() => {
    if (shortcutPeekTimerRef.current) {
      clearTimeout(shortcutPeekTimerRef.current)
      shortcutPeekTimerRef.current = null
    }
  }, [])

  const handleInteractionChange = useCallback((isActive: boolean) => {
    isInteractionActiveRef.current = isActive
  }, [])

  // 当设置中的语言变化时，同步更新 i18n
  useEffect(() => {
    if (isSettingsHydrated && settings?.language) {
      // 使用动态 import 加载 i18n 模块
      import("~utils/i18n")
        .then(({ setLanguage }) => {
          setLanguage(settings.language)
        })
        .catch(() => {
          // ignore
        })
    }
  }, [settings?.language, isSettingsHydrated])

  // 单例实例
  const adapter = useMemo(() => getAdapter(), [])

  // 处理提示词选中
  const handlePromptSelect = useCallback((prompt: Prompt | null) => {
    setSelectedPrompt(prompt)
  }, [])

  // 清除选中的提示词
  const handleClearSelectedPrompt = useCallback(() => {
    setSelectedPrompt(null)
    // 同时清空输入框（可选）
    if (adapter) {
      adapter.clearTextarea()
    }
  }, [adapter])

  const promptManager = useMemo(() => {
    return adapter ? new PromptManager(adapter) : null
  }, [adapter])

  const conversationManager = useMemo(() => {
    return adapter ? new ConversationManager(adapter) : null
  }, [adapter])

  const outlineManager = useMemo(() => {
    if (!adapter) return null

    // 使用 Zustand 的 updateDeepSetting
    const handleExpandLevelChange = (level: number) => {
      updateDeepSetting("features", "outline", "expandLevel", level)
    }

    const handleShowUserQueriesChange = (show: boolean) => {
      updateDeepSetting("features", "outline", "showUserQueries", show)
    }

    return new OutlineManager(
      adapter,
      settings?.features?.outline ?? DEFAULT_SETTINGS.features.outline,
      handleExpandLevelChange,
      handleShowUserQueriesChange,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在 adapter 变化时重新创建
  }, [adapter, updateDeepSetting])

  // 单独用 useEffect 同步 settings 变化到 manager
  useEffect(() => {
    if (outlineManager && settings) {
      outlineManager.updateSettings(settings.features?.outline)
    }
  }, [outlineManager, settings])

  // 同步 ConversationManager 设置
  useEffect(() => {
    if (conversationManager && settings) {
      conversationManager.updateSettings({
        syncUnpin: settings.features?.conversations?.syncUnpin ?? false,
      })
    }
  }, [conversationManager, settings])

  // 从 window 获取 main.ts 创建的全局 ThemeManager 实例
  // 这样只有一个 ThemeManager 实例，避免竞争条件
  const themeManager = useMemo(() => {
    const globalTM = window.__ophelThemeManager
    if (globalTM) {
      return globalTM
    }
    // 降级：如果 main.ts 还没创建，则临时创建一个（不应该发生）
    console.warn("[App] Global ThemeManager not found, creating fallback instance")
    // 使用当前站点的配置
    const currentAdapter = getAdapter()
    const siteId = currentAdapter?.getSiteId() || "_default"
    const fallbackTheme =
      settings?.theme?.sites?.[siteId as keyof typeof settings.theme.sites] ||
      settings?.theme?.sites?._default
    return new ThemeManager(
      fallbackTheme?.mode || "light", // 使用 settings 中的 mode，而非本地状态
      undefined,
      adapter,
      fallbackTheme?.lightStyleId || "google-gradient",
      fallbackTheme?.darkStyleId || "classic-dark",
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在初始化时获取
  }, [])

  // 使用 useSyncExternalStore 订阅 ThemeManager 的主题模式
  // 这让 ThemeManager 成为唯一的主题状态源，避免双重状态导致的同步问题
  const themeMode = useSyncExternalStore(themeManager.subscribe, themeManager.getSnapshot)

  // 动态注册主题变化回调，当页面主题变化时同步更新 settings
  // 注意：themeMode 由 useSyncExternalStore 自动订阅更新，不需要手动 setThemeMode
  useEffect(() => {
    const handleThemeModeChange = (
      mode: "light" | "dark",
      preference?: "light" | "dark" | "system",
    ) => {
      const nextPreference = preference || mode
      // 使用 ref 获取最新 settings，避免闭包捕获过期值
      const currentSettings = settingsRef.current
      const sites = currentSettings?.theme?.sites || {}

      // 获取当前站点 ID
      const currentAdapter = getAdapter()
      const siteId = currentAdapter?.getSiteId() || "_default"

      // 确保站点配置有完整的默认值，但优先使用已有配置
      const existingSite = sites[siteId as keyof typeof sites] || sites._default
      const siteConfig = {
        lightStyleId: "google-gradient",
        darkStyleId: "classic-dark",
        mode: "light" as const,
        ...existingSite, // 已有配置覆盖默认值
      }

      // 只更新 mode 字段，保留用户已有的主题配置
      setSettings({
        theme: {
          ...currentSettings?.theme,
          sites: {
            ...sites,
            [siteId]: {
              ...siteConfig,
              mode: nextPreference, // 最后更新 mode，确保生效
            },
          },
        },
      })
    }
    themeManager.setOnModeChange(handleThemeModeChange)

    // 清理时移除回调
    return () => {
      themeManager.setOnModeChange(undefined)
    }
  }, [themeManager, setSettings]) // 移除 settings?.theme 依赖，通过 ref 访问最新值

  const themeSites = settings?.theme?.sites
  const syncUnpin = settings?.features?.conversations?.syncUnpin
  const inlineBookmarkMode = settings?.features?.outline?.inlineBookmarkMode
  const hasSettings = Boolean(settings)
  const collapsedButtons = settings?.collapsedButtons || DEFAULT_SETTINGS.collapsedButtons
  const floatingToolbarEnabled =
    collapsedButtons.find((btn) => btn.id === "floatingToolbar")?.enabled ?? true
  const floatingToolbarOpen = settings?.floatingToolbar?.open ?? true
  const isScrollLockActive = settings?.panel?.preventAutoScroll ?? false
  const ghostBookmarkCount = outlineManager?.getGhostBookmarkIds().length ?? 0

  useEffect(() => {
    if (!floatingToolbarEnabled || !floatingToolbarOpen) {
      setFloatingToolbarMoveState(null)
      setIsFloatingToolbarClearOpen(false)
    }
  }, [floatingToolbarEnabled, floatingToolbarOpen])

  // 监听主题预置变化，动态更新 ThemeManager
  // Zustand 不存在 Plasmo useStorage 的缓存问题，无需启动保护期
  useEffect(() => {
    if (!isSettingsHydrated) return // 等待 hydration 完成

    // 使用当前站点的配置而非 _default
    const currentAdapter = getAdapter()
    const siteId = currentAdapter?.getSiteId() || "_default"
    const siteTheme = themeSites?.[siteId as keyof typeof themeSites] || themeSites?._default
    const lightId = siteTheme?.lightStyleId
    const darkId = siteTheme?.darkStyleId

    if (lightId && darkId) {
      themeManager.setPresets(lightId, darkId)
    }
  }, [themeSites, themeManager, isSettingsHydrated])

  // 监听自定义样式变化，同步到 ThemeManager
  useEffect(() => {
    if (!isSettingsHydrated) return
    themeManager.setCustomStyles(settings?.theme?.customStyles || [])
  }, [settings?.theme?.customStyles, themeManager, isSettingsHydrated])

  // 主题切换（异步处理，支持 View Transitions API 动画）
  // 不在这里更新 React 状态，由 ThemeManager 的 onModeChange 回调在动画完成后统一处理
  const handleThemeToggle = useCallback(
    async (event?: MouseEvent) => {
      await themeManager.toggle(event)
      // 状态更新由 onModeChange 回调处理，不在这里直接更新
      // 这避免了动画完成前触发 React 重渲染导致的闪烁
    },
    [themeManager],
  )

  // 启动主题监听器
  useEffect(() => {
    // 不再调用 updateMode，由 main.ts 负责初始应用
    // 只启动监听器，监听页面主题变化（浏览器自动切换等场景）
    themeManager.monitorTheme()

    return () => {
      // 清理监听器
      themeManager.stopMonitoring()
    }
  }, [themeManager])

  // 初始化
  useEffect(() => {
    if (promptManager) {
      promptManager.init()
    }
    if (conversationManager) {
      conversationManager.init()
    }
    if (outlineManager) {
      outlineManager.refresh()
      const refreshInterval = setInterval(() => {
        outlineManager.refresh()
      }, 2000)
      return () => {
        clearInterval(refreshInterval)
        conversationManager?.destroy()
      }
    }
  }, [promptManager, conversationManager, outlineManager])

  useEffect(() => {
    if (!conversationManager || typeof chrome === "undefined") return

    const handler = (message: any, _sender: any, sendResponse: any) => {
      if (message?.type === MSG_CLEAR_ALL_DATA) {
        conversationManager.destroy()
        sendResponse({ success: true })
        return true
      }
      return false
    }

    chrome.runtime.onMessage.addListener(handler)
    return () => {
      chrome.runtime.onMessage.removeListener(handler)
    }
  }, [conversationManager])

  useEffect(() => {
    if (!conversationManager) return
    conversationManager.updateSettings({
      syncUnpin: syncUnpin ?? false,
    })
  }, [conversationManager, syncUnpin])

  // 初始化页面内收藏图标
  useEffect(() => {
    if (!outlineManager || !adapter || !hasSettings) return

    const mode = inlineBookmarkMode || "always"
    const inlineBookmarkManager = new InlineBookmarkManager(outlineManager, adapter, mode)

    return () => {
      inlineBookmarkManager.cleanup()
    }
  }, [outlineManager, adapter, inlineBookmarkMode, hasSettings])

  // 滚动锁定切换
  const handleToggleScrollLock = useCallback(() => {
    const current = settingsRef.current
    if (!current) return
    const newState = !current.panel?.preventAutoScroll

    setSettings({
      panel: {
        ...current.panel,
        preventAutoScroll: newState,
      },
    })

    // 简单的提示，实际文案建议放在 useShortcuts或统一管理
    // 这里暂时使用硬编码中文，后续可优化
    showToast(newState ? t("preventAutoScrollEnabled") : t("preventAutoScrollDisabled"))
  }, [setSettings])

  const handleFloatingToolbarExport = useCallback(async () => {
    if (!conversationManager || !adapter) return
    const sessionId = adapter.getSessionId()
    if (!sessionId) {
      showToast(t("exportNeedOpenFirst") || "请先打开要导出的会话")
      return
    }
    showToast(t("exportStarted") || "开始导出...")
    const success = await conversationManager.exportConversation(sessionId, "markdown")
    if (!success) {
      showToast(t("exportFailed") || "导出失败")
    }
  }, [conversationManager, adapter])

  const handleFloatingToolbarMoveToFolder = useCallback(() => {
    if (!conversationManager || !adapter) return
    const sessionId = adapter.getSessionId()
    if (!sessionId) {
      showToast(t("noConversationToLocate") || "未找到会话")
      return
    }
    const conv = conversationManager.getConversation(sessionId)
    setFloatingToolbarMoveState({
      convId: sessionId,
      activeFolderId: conv?.folderId,
    })
  }, [conversationManager, adapter])

  const handleFloatingToolbarClearGhost = useCallback(() => {
    if (!outlineManager) return
    const cleared = outlineManager.clearGhostBookmarks()
    if (cleared === 0) {
      showToast(t("floatingToolbarClearGhostEmpty") || "没有需要清理的无效收藏")
      return
    }
    showToast(`${t("cleared") || "已清理"} (${cleared})`)
  }, [outlineManager])

  // 复制为 Markdown 处理器
  const handleCopyMarkdown = useCallback(async () => {
    if (!conversationManager || !adapter) return
    const sessionId = adapter.getSessionId()
    if (!sessionId) {
      showToast(t("exportNeedOpenFirst") || "请先打开要导出的会话")
      return
    }
    showToast(t("exportLoading") || "正在加载...")
    const success = await conversationManager.exportConversation(sessionId, "clipboard")
    if (!success) {
      showToast(t("exportFailed") || "导出失败")
    }
  }, [conversationManager, adapter])

  // 模型锁定切换处理器 (按站点)
  const handleModelLockToggle = useCallback(() => {
    if (!adapter) return
    const siteId = adapter.getSiteId()
    const current = settingsRef.current
    if (!current) return

    const modelLockConfig = current.modelLock?.[siteId] || { enabled: false, keyword: "" }

    // 如果没有配置关键词
    if (!modelLockConfig.keyword) {
      if (modelLockConfig.enabled) {
        // 用户意图是关闭 → 直接关闭，不跳转设置
        setSettings({
          modelLock: {
            ...current.modelLock,
            [siteId]: {
              ...modelLockConfig,
              enabled: false,
            },
          },
        })
        showToast(t("modelLockDisabled") || "模型锁定已关闭")
      } else {
        // 用户意图是开启 → 自动开启开关 + 跳转设置让用户配置
        showToast(t("modelLockNoKeyword") || "请先在设置中配置模型关键词")
        setSettings({
          modelLock: {
            ...current.modelLock,
            [siteId]: {
              ...modelLockConfig,
              enabled: true,
            },
          },
        })
        setIsSettingsOpen(true)
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("ophel:navigateSettingsPage", {
              detail: { page: "siteSettings", subTab: "modelLock" },
            }),
          )
        }, 100)
      }
      return
    }

    const newEnabled = !modelLockConfig.enabled

    setSettings({
      modelLock: {
        ...current.modelLock,
        [siteId]: {
          ...modelLockConfig,
          enabled: newEnabled,
        },
      },
    })

    showToast(
      newEnabled
        ? t("modelLockEnabled") || "模型锁定已开启"
        : t("modelLockDisabled") || "模型锁定已关闭",
    )
  }, [adapter, setSettings])

  // 获取当前站点的模型锁定状态
  const isModelLocked = useMemo(() => {
    if (!adapter || !settings) return false
    const siteId = adapter.getSiteId()
    return settings.modelLock?.[siteId]?.enabled || false
  }, [adapter, settings])

  // 快捷键管理
  useShortcuts({
    settings,
    adapter,
    outlineManager,
    conversationManager,
    onPanelToggle: () => setIsPanelOpen((prev) => !prev),
    onThemeToggle: handleThemeToggle,
    onOpenSettings: () => setIsSettingsOpen(true),
    isPanelVisible: isPanelOpen,
    isSnapped: !!edgeSnapState && !isEdgePeeking, // 吸附且未显示
    onShowSnappedPanel: () => {
      // 强制显示吸附的面板
      setIsEdgePeeking(true)
      // 启动 3 秒延迟缩回计时器
      cancelShortcutPeekTimer()
      shortcutPeekTimerRef.current = setTimeout(() => {
        setIsEdgePeeking(false)
        shortcutPeekTimerRef.current = null
      }, 3000)
    },
    onToggleScrollLock: handleToggleScrollLock,
  })

  // 当自动吸附设置变化时的处理：关闭自动吸附时立即重置吸附状态
  // 开启自动吸附的处理在 SettingsModal onClose 回调中
  useEffect(() => {
    if (edgeSnapState && !settings?.panel?.edgeSnap) {
      setEdgeSnapState(null)
      setIsEdgePeeking(false)
    }
  }, [settings?.panel?.edgeSnap, edgeSnapState])

  // 监听默认位置变化，重置吸附状态
  // 当用户切换默认位置（如从左到右）时，如果是吸附状态，需要重置以便面板能跳转到新位置
  const prevDefaultPosition = useRef(settings?.panel?.defaultPosition)
  useEffect(() => {
    const currentPos = settings?.panel?.defaultPosition
    // 初始化 ref
    if (prevDefaultPosition.current === undefined && currentPos) {
      prevDefaultPosition.current = currentPos
      return
    }

    if (currentPos && prevDefaultPosition.current !== currentPos) {
      prevDefaultPosition.current = currentPos
      // 只有在当前有吸附状态时才需要重置
      if (edgeSnapState) {
        // 保持吸附状态，但切换方向
        setEdgeSnapState(currentPos)
        setIsEdgePeeking(false)
      }
    }
  }, [settings?.panel?.defaultPosition, edgeSnapState])

  // 使用 MutationObserver 监听 Portal 元素（菜单/对话框/设置模态框）的存在
  // 当 Portal 元素存在时，强制设置 isEdgePeeking 为 true，防止 CSS :hover 失效导致面板隐藏
  useEffect(() => {
    if (!edgeSnapState || !settings?.panel?.edgeSnap) return

    const portalSelector =
      ".conversations-dialog-overlay, .conversations-folder-menu, .conversations-tag-filter-menu, .prompt-modal, .settings-modal-overlay"

    // 检查当前是否有 Portal 元素存在
    const checkPortalExists = () => {
      const portals = document.body.querySelectorAll(portalSelector)
      return portals.length > 0
    }

    // 追踪之前的 Portal 状态，用于检测 Portal 关闭
    let prevHasPortal = checkPortalExists()

    // 创建 MutationObserver 监听 document.body 的子元素变化
    const observer = new MutationObserver(() => {
      const hasPortal = checkPortalExists()

      if (hasPortal && !prevHasPortal) {
        // Portal 元素刚出现，强制保持面板显示
        // 因为 Portal 覆盖层会导致 CSS :hover 失效
        setIsEdgePeeking(true)

        // 清除隐藏定时器
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current)
          hideTimerRef.current = null
        }
      } else if (!hasPortal && prevHasPortal) {
        // Portal 元素刚消失，延迟后检查是否需要隐藏
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
        hideTimerRef.current = setTimeout(() => {
          // 500ms 后检查：如果没有新的 Portal，且没有活跃交互，则隐藏
          if (!checkPortalExists() && !isInteractionActiveRef.current) {
            setIsEdgePeeking(false)
          }
        }, 500)
      }

      prevHasPortal = hasPortal
    })

    // 开始观察 document.body 的直接子元素变化
    observer.observe(document.body, {
      childList: true,
      subtree: false,
    })

    // 初始检查
    if (checkPortalExists()) {
      setIsEdgePeeking(true)
    }

    return () => {
      observer.disconnect()
    }
  }, [edgeSnapState, settings?.panel?.edgeSnap])

  // 监听面板内输入框的聚焦状态
  // 解决问题：当用户在输入框中打字时，IME 输入法弹出会导致浏览器丢失 CSS :hover 状态
  // 方案：在输入框聚焦时主动设置 isEdgePeeking = true，不依赖纯 CSS :hover
  useEffect(() => {
    if (!edgeSnapState || !settings?.panel?.edgeSnap) return

    // 获取 Shadow DOM 根节点
    const shadowHost = document.querySelector("plasmo-csui, #ophel-userscript-root")
    const shadowRoot = shadowHost?.shadowRoot
    if (!shadowRoot) return

    const handleFocusIn = (e: Event) => {
      const target = e.target as HTMLElement
      // 检查是否是输入元素（input、textarea 或可编辑区域）
      const isInputElement =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.getAttribute("contenteditable") === "true"

      if (isInputElement) {
        // 排除设置模态框内的输入框
        // 设置模态框有自己的状态管理（isSettingsOpenRef），不需要在这里处理
        if (target.closest(".settings-modal-overlay, .settings-modal")) {
          return
        }

        isInputFocusedRef.current = true
        // 确保面板保持显示状态
        setIsEdgePeeking(true)
        // 清除任何隐藏计时器
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current)
          hideTimerRef.current = null
        }
      }
    }

    const handleFocusOut = (e: Event) => {
      const target = e.target as HTMLElement
      const isInputElement =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.getAttribute("contenteditable") === "true"

      if (isInputElement) {
        // 排除设置模态框内的输入框
        if (target.closest(".settings-modal-overlay, .settings-modal")) {
          return
        }

        isInputFocusedRef.current = false
        // 延迟检查是否需要隐藏
        // 给用户一点时间可能重新聚焦到其他输入框
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
        hideTimerRef.current = setTimeout(() => {
          // 如果没有其他保持显示的条件，则隐藏
          if (
            !isInputFocusedRef.current &&
            !isSettingsOpenRef.current &&
            !isInteractionActiveRef.current
          ) {
            const portalElements = document.body.querySelectorAll(
              ".conversations-dialog-overlay, .conversations-folder-menu, .conversations-tag-filter-menu, .prompt-modal, .settings-modal-overlay",
            )
            if (portalElements.length === 0) {
              setIsEdgePeeking(false)
            }
          }
        }, 300)
      }
    }

    // 监听 Shadow DOM 内的焦点事件
    shadowRoot.addEventListener("focusin", handleFocusIn, true)
    shadowRoot.addEventListener("focusout", handleFocusOut, true)

    return () => {
      shadowRoot.removeEventListener("focusin", handleFocusIn, true)
      shadowRoot.removeEventListener("focusout", handleFocusOut, true)
    }
  }, [edgeSnapState, settings?.panel?.edgeSnap])

  useEffect(() => {
    // 只有在开启自动隐藏时，才监听点击外部
    // 如果没有开启自动隐藏，无论是否吸附，点击外部都不应有反应
    const shouldHandle = settings?.panel?.autoHide
    if (!shouldHandle || !isPanelOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      // 使用 composedPath() 支持 Shadow DOM
      const path = e.composedPath()

      // 检查点击路径中是否包含面板、快捷按钮或 Portal 元素（菜单/对话框）
      const isInsidePanelOrPortal = path.some((el) => {
        if (!(el instanceof Element)) return false
        // 检查是否是面板内部
        if (el.closest?.(".gh-main-panel")) return true
        // 检查是否是快捷按钮
        if (el.closest?.(".gh-quick-buttons")) return true
        // 检查是否是 Portal 元素（菜单、对话框、设置模态框）
        if (el.closest?.(".conversations-dialog-overlay")) return true
        if (el.closest?.(".conversations-folder-menu")) return true
        if (el.closest?.(".conversations-tag-filter-menu")) return true
        if (el.closest?.(".prompt-modal")) return true
        if (el.closest?.(".settings-modal-overlay")) return true
        return false
      })

      if (!isInsidePanelOrPortal) {
        // 如果开启了边缘吸附，点击外部应触发吸附（缩回边缘），而不是完全关闭
        if (settings?.panel?.edgeSnap) {
          if (!edgeSnapState) {
            setEdgeSnapState(settings.panel.defaultPosition || "right")
            setIsEdgePeeking(false)
          }
          // 如果已经是吸附状态，点击外部不做处理（保持吸附）
        } else {
          // 普通模式：点击外部关闭面板
          setIsPanelOpen(false)
        }
      }
    }

    // 延迟添加监听，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClickOutside, true)
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener("click", handleClickOutside, true)
    }
  }, [
    settings?.panel?.autoHide,
    settings?.panel?.edgeSnap,
    isPanelOpen,
    edgeSnapState,
    settings?.panel?.defaultPosition,
  ])

  // 发送消息后自动清除选中的提示词悬浮条
  useEffect(() => {
    if (!adapter || !selectedPrompt) return

    // 发送后执行清理
    const handleSend = () => {
      setSelectedPrompt(null)
    }

    // 点击发送按钮时
    const handleClick = (e: MouseEvent) => {
      const selectors = adapter.getSubmitButtonSelectors()
      if (selectors.length === 0) return

      // 使用 composedPath 检查（兼容 Shadow DOM）
      const path = e.composedPath()
      for (const target of path) {
        if (target === document || target === window) break
        for (const selector of selectors) {
          try {
            if ((target as Element).matches?.(selector)) {
              // 延迟清除，确保消息已发送
              setTimeout(handleSend, 100)
              return
            }
          } catch {
            // 忽略无效选择器
          }
        }
      }
    }

    // Enter 键发送时
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return

      // 获取当前适配器的发送键配置
      const keyConfig = adapter.getSubmitKeyConfig()

      // 根据配置判断是否为发送按键
      // Mac 兼容：同时检测 Ctrl 和 Cmd (metaKey)
      let isSubmitKey = false
      if (keyConfig.key === "Ctrl+Enter") {
        // Ctrl+Enter 模式：需要 Ctrl 或 Cmd 键，不能有 Shift 键
        const hasModifier = e.ctrlKey || e.metaKey
        isSubmitKey = hasModifier && !e.shiftKey
      } else {
        // Enter 模式：不能有 Ctrl、Cmd 或 Shift 键
        isSubmitKey = !e.ctrlKey && !e.metaKey && !e.shiftKey
      }

      if (!isSubmitKey) return

      // 使用 composedPath 检查事件源是否来自输入框（兼容 Shadow DOM）
      const path = e.composedPath()
      const isFromTextarea = path.some((element) => {
        if (!(element instanceof HTMLElement)) return false
        // 优先使用 adapter 的验证方法
        if (adapter.isValidTextarea(element)) return true
        // 备用检测：针对 Shadow DOM 场景，直接检查元素特征
        const isContentEditable = element.getAttribute("contenteditable") === "true"
        const isProseMirror = element.classList.contains("ProseMirror")
        const isTextarea = element.tagName === "TEXTAREA"
        return isContentEditable || isProseMirror || isTextarea
      })

      if (!isFromTextarea) return

      // 延迟清除，确保消息已发送
      setTimeout(handleSend, 100)
    }

    document.addEventListener("click", handleClick, true)
    document.addEventListener("keydown", handleKeydown, true)

    return () => {
      document.removeEventListener("click", handleClick, true)
      document.removeEventListener("keydown", handleKeydown, true)
    }
  }, [adapter, selectedPrompt])

  // 切换会话时自动清空选中的提示词悬浮条及输入框
  useEffect(() => {
    if (!selectedPrompt || !adapter) return

    // 记录当前 URL
    let currentUrl = window.location.href

    // 清空悬浮条和输入框
    const clearPromptAndTextarea = () => {
      setSelectedPrompt(null)
      // 同时清空输入框（adapter.clearTextarea 内部有校验，不会误选全页面）
      adapter.clearTextarea()
    }

    // 使用 popstate 监听浏览器前进/后退
    const handlePopState = () => {
      if (window.location.href !== currentUrl) {
        clearPromptAndTextarea()
      }
    }

    // 使用定时器检测 URL 变化（SPA 路由）
    // 因为 pushState/replaceState 不会触发 popstate
    const checkUrlChange = () => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href
        clearPromptAndTextarea()
      }
    }

    // 每 500ms 检查一次 URL 变化
    const intervalId = setInterval(checkUrlChange, 500)
    window.addEventListener("popstate", handlePopState)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener("popstate", handlePopState)
    }
  }, [selectedPrompt, adapter])

  // 浮动工具栏设置标签状态
  const [floatingToolbarTagState, setFloatingToolbarTagState] = useState<{
    convId: string
  } | null>(null)

  const handleFloatingToolbarSetTag = useCallback(() => {
    if (!conversationManager || !adapter) return
    const sessionId = adapter.getSessionId()
    if (!sessionId) {
      showToast(t("noConversationToLocate") || "未找到当前会话")
      return
    }
    setFloatingToolbarTagState({
      convId: sessionId,
    })
  }, [conversationManager, adapter])

  const { tags, addTag, updateTag, deleteTag } = useTagsStore()

  if (!adapter || !promptManager || !conversationManager || !outlineManager) {
    return null
  }

  return (
    <div className="gh-root">
      <MainPanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        promptManager={promptManager}
        conversationManager={conversationManager}
        outlineManager={outlineManager}
        adapter={adapter}
        onThemeToggle={handleThemeToggle}
        themeMode={themeMode}
        selectedPromptId={selectedPrompt?.id}
        onPromptSelect={handlePromptSelect}
        edgeSnapState={edgeSnapState}
        isEdgePeeking={isEdgePeeking}
        onEdgeSnap={(side) => setEdgeSnapState(side)}
        onUnsnap={() => {
          setEdgeSnapState(null)
          setIsEdgePeeking(false)
        }}
        onInteractionStateChange={handleInteractionChange}
        onOpenSettings={() => {
          // 打开设置模态框时，立即更新 ref 并锁定 peeking 状态
          // 使用 ref 确保 onMouseLeave 回调能立即读取到最新状态
          isSettingsOpenRef.current = true
          if (edgeSnapState && settings?.panel?.edgeSnap) {
            setIsEdgePeeking(true)
          }
          setIsSettingsOpen(true)
        }}
        onMouseEnter={() => {
          if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current)
            hideTimerRef.current = null
          }
          // 取消快捷键触发的延迟缩回计时器
          cancelShortcutPeekTimer()
          // 当处于吸附状态时，鼠标进入面板应设置 isEdgePeeking = true
          // 这样 onMouseLeave 时才能正确隐藏
          if (edgeSnapState && settings?.panel?.edgeSnap && !isEdgePeeking) {
            setIsEdgePeeking(true)
          }
        }}
        onMouseLeave={() => {
          // 边缘吸附恢复逻辑：鼠标移出面板时结束 peek 状态
          // 增加 200ms 缓冲，防止移动到外部菜单（Portal）时瞬间隐藏
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current)

          hideTimerRef.current = setTimeout(() => {
            // 优先检查设置模态框状态（使用 ref 确保读取到最新的值）
            if (isSettingsOpenRef.current) return

            // 检查是否有输入框正在聚焦（防止 IME 输入法弹出时隐藏）
            if (isInputFocusedRef.current) return

            // 检查是否有任何菜单/对话框/弹窗处于打开状态
            const interactionActive = isInteractionActiveRef.current
            const portalElements = document.body.querySelectorAll(
              ".conversations-dialog-overlay, .conversations-folder-menu, .conversations-tag-filter-menu, .prompt-modal, .settings-modal-overlay",
            )
            const hasPortal = portalElements.length > 0

            // 如果有活跃交互或 Portal 元素，不隐藏面板
            if (interactionActive || hasPortal) return

            // 安全检查后隐藏面板
            if (edgeSnapState && settings?.panel?.edgeSnap && isEdgePeeking) {
              setIsEdgePeeking(false)
            }
          }, 200)
        }}
      />

      <QuickButtons
        isPanelOpen={isPanelOpen}
        onPanelToggle={() => {
          if (!isPanelOpen) {
            // 展开面板：如果处于吸附状态，进入 peek 模式
            if (edgeSnapState && settings?.panel?.edgeSnap) {
              setIsEdgePeeking(true)
            }
          } else {
            // 关闭面板：重置 peek 状态
            setIsEdgePeeking(false)
          }
          setIsPanelOpen(!isPanelOpen)
        }}
        onThemeToggle={handleThemeToggle}
        themeMode={themeMode}
        onExport={handleFloatingToolbarExport}
        onMove={handleFloatingToolbarMoveToFolder}
        onSetTag={handleFloatingToolbarSetTag}
        onScrollLock={() => handleToggleScrollLock()}
        onSettings={() => {
          // 打开 SettingsModal 并跳转到工具箱设置 Tab
          isSettingsOpenRef.current = true
          setIsSettingsOpen(true)
          // 延迟发送导航事件，确保 Modal 已挂载
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("ophel:navigateSettingsPage", {
                detail: { page: "general", subTab: "toolsMenu" },
              }),
            )
          }, 50)
        }}
        scrollLocked={isScrollLockActive}
        onCleanup={() => {
          if (ghostBookmarkCount === 0) {
            showToast(t("floatingToolbarClearGhostEmpty") || "没有需要清理的无效收藏")
            return
          }
          setIsFloatingToolbarClearOpen(true)
        }}
        onCopyMarkdown={handleCopyMarkdown}
        onModelLockToggle={handleModelLockToggle}
        isModelLocked={isModelLocked}
      />
      {/* 选中提示词悬浮条 */}
      {selectedPrompt && (
        <SelectedPromptBar
          title={selectedPrompt.title}
          onClear={handleClearSelectedPrompt}
          adapter={adapter}
        />
      )}
      {/* 设置模态框 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          isSettingsOpenRef.current = false
          setIsSettingsOpen(false)

          // 关闭设置模态框后，检测面板位置，如果在边缘且自动吸附已开启则自动吸附
          // 使用 settingsRef 确保读取到最新的设置值
          const currentSettings = settingsRef.current
          if (!currentSettings?.panel?.edgeSnap) return

          // 查询面板元素（在 Plasmo Shadow DOM 内部）
          // 先尝试在 Shadow DOM 内查找，再尝试普通 DOM
          let panel: HTMLElement | null = null
          const shadowHost = document.querySelector("plasmo-csui, #ophel-userscript-root")
          if (shadowHost?.shadowRoot) {
            panel = shadowHost.shadowRoot.querySelector(".gh-main-panel") as HTMLElement
          }
          if (!panel) {
            panel = document.querySelector(".gh-main-panel") as HTMLElement
          }

          if (!panel) return

          // 通过检查类名判断当前是否已吸附（避免闭包捕获问题）
          const isAlreadySnapped =
            panel.classList.contains("edge-snapped-left") ||
            panel.classList.contains("edge-snapped-right")

          if (isAlreadySnapped) return

          // 检测面板位置
          const rect = panel.getBoundingClientRect()
          const snapThreshold = currentSettings?.panel?.edgeSnapThreshold ?? 30

          if (rect.left < snapThreshold) {
            setEdgeSnapState("left")
          } else if (window.innerWidth - rect.right < snapThreshold) {
            setEdgeSnapState("right")
          }
        }}
        siteId={adapter.getSiteId()}
      />
      {floatingToolbarMoveState && (
        <FolderSelectDialog
          folders={conversationManager.getFolders()}
          excludeFolderId={
            conversationManager.getConversation(floatingToolbarMoveState.convId)?.folderId
          }
          activeFolderId={floatingToolbarMoveState.activeFolderId}
          onSelect={async (folderId) => {
            await conversationManager.moveConversation(floatingToolbarMoveState.convId, folderId)
            setFloatingToolbarMoveState(null)
          }}
          onCancel={() => setFloatingToolbarMoveState(null)}
        />
      )}
      {floatingToolbarTagState && (
        <TagManagerDialog
          tags={tags}
          conv={conversationManager.getConversation(floatingToolbarTagState.convId)}
          onCancel={() => setFloatingToolbarTagState(null)}
          onCreateTag={async (name, color) => {
            return addTag(name, color)
          }}
          onUpdateTag={async (tagId, name, color) => {
            return updateTag(tagId, name, color)
          }}
          onDeleteTag={async (tagId) => {
            deleteTag(tagId)
          }}
          onSetConversationTags={async (convId, tagIds) => {
            await conversationManager.updateConversation(convId, { tagIds })
          }}
          onRefresh={() => {
            // 强制刷新会话列表 ? conversationManager 会触发 onChange
          }}
        />
      )}
      {isFloatingToolbarClearOpen && (
        <ConfirmDialog
          title={t("floatingToolbarClearGhost") || "清除无效收藏"}
          message={(
            t("floatingToolbarClearGhostConfirm") || "是否清除本会话中的 {count} 个无效收藏？"
          ).replace("{count}", String(ghostBookmarkCount))}
          danger
          onConfirm={() => {
            setIsFloatingToolbarClearOpen(false)
            handleFloatingToolbarClearGhost()
          }}
          onCancel={() => setIsFloatingToolbarClearOpen(false)}
        />
      )}
      <DisclaimerModal />
    </div>
  )
}
