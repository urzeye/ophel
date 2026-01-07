import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { getAdapter } from "~adapters/index"
import { ConversationManager } from "~core/conversation-manager"
import { OutlineManager } from "~core/outline-manager"
import { PromptManager } from "~core/prompt-manager"
import { ThemeManager } from "~core/theme-manager"
import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import { DEFAULT_SETTINGS, type Prompt } from "~utils/storage"

import { MainPanel } from "./MainPanel"
import { QuickButtons } from "./QuickButtons"
import { SelectedPromptBar } from "./SelectedPromptBar"
import { SettingsModal } from "./SettingsModal"

export const App = () => {
  // 读取设置 - 使用 Zustand Store
  const { settings, setSettings, updateNestedSetting, updateDeepSetting } = useSettingsStore()
  const isSettingsHydrated = useSettingsHydrated()

  // ⭐ 订阅 _syncVersion 以在跨上下文同步时强制触发重渲染
  // 当 Options 页面更新设置时，_syncVersion 递增，这会使整个组件重渲染
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _syncVersion = useSettingsStore((s) => s._syncVersion)

  // 面板状态 - 初始值来自设置
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const hasInitializedPanel = useRef(false)

  // 主题状态 - 与 settings 同步
  // ⭐ 初始值使用 "light" 作为默认值，待 settings 加载后由 useEffect 同步
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light")
  const hasInitializedTheme = useRef(false)

  // ⭐ 使用 ref 保持 settings 的最新引用，避免闭包捕获过期值
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  // 当设置加载完成后，同步面板初始状态（只执行一次）
  useEffect(() => {
    // 只有当 Zustand hydration 完成且尚未初始化时才执行
    if (isSettingsHydrated && settings && !hasInitializedPanel.current) {
      hasInitializedPanel.current = true
      // 如果 defaultPanelOpen 为 true，打开面板
      if (settings.panel?.defaultOpen) {
        setIsPanelOpen(true)
      }
    }
  }, [isSettingsHydrated, settings])

  // 选中的提示词状态
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)

  // ⭐ 设置模态框状态
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // 边缘吸附状态
  const [edgeSnapState, setEdgeSnapState] = useState<"left" | "right" | null>(null)
  // 临时显示状态（当鼠标悬停在面板上时）
  const [isEdgePeeking, setIsEdgePeeking] = useState(false)
  // 是否有活跃的交互（如打开了菜单/对话框），此时即使鼠标移出也不隐藏面板
  // 使用 useRef 避免闭包陷阱和不必要的重渲染
  const isInteractionActiveRef = useRef(false)
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handleInteractionChange = useCallback((isActive: boolean) => {
    isInteractionActiveRef.current = isActive
  }, [])

  // 当设置中的语言变化时，同步更新 i18n
  useEffect(() => {
    if (isSettingsHydrated && settings?.language) {
      // 这里的 setLanguage 是从 utils/i18n 导入的全局函数
      const { setLanguage } = require("~utils/i18n")
      setLanguage(settings.language)
    }
  }, [settings?.language, isSettingsHydrated])

  // 当设置中的主题变化时，同步更新本地状态
  // ⭐ 重要：确保首次加载和后续变化都能正确同步 themeMode
  useEffect(() => {
    if (!isSettingsHydrated) return // 等待 settings 加载完成

    // ⭐ 使用当前站点的配置而非 _default
    const currentAdapter = getAdapter()
    const siteId = currentAdapter?.getSiteId() || "_default"
    const siteTheme =
      settings?.theme?.sites?.[siteId as keyof typeof settings.theme.sites] ||
      settings?.theme?.sites?._default
    const savedMode = siteTheme?.mode

    // 首次加载时，从 settings 同步主题模式
    if (!hasInitializedTheme.current && savedMode) {
      hasInitializedTheme.current = true
      if (savedMode !== themeMode) {
        setThemeMode(savedMode)
      }
      return
    }

    // 后续更新时，仅当 mode 真的变化时同步
    if (savedMode && savedMode !== themeMode) {
      setThemeMode(savedMode)
    }
  }, [isSettingsHydrated, settings?.theme?.sites])

  const panelRef = useRef<HTMLDivElement>(null)

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

    // ⭐ 使用 Zustand 的 updateDeepSetting
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

  // ⭐ 单独用 useEffect 同步 settings 变化到 manager
  useEffect(() => {
    if (outlineManager && settings) {
      outlineManager.updateSettings(settings.features?.outline)
    }
  }, [outlineManager, settings])

  // ⭐ 从 window 获取 main.ts 创建的全局 ThemeManager 实例
  // 这样只有一个 ThemeManager 实例，避免竞争条件
  const themeManager = useMemo(() => {
    const globalTM = window.__ophelThemeManager
    if (globalTM) {
      return globalTM
    }
    // 降级：如果 main.ts 还没创建，则临时创建一个（不应该发生）
    console.warn("[App] Global ThemeManager not found, creating fallback instance")
    // ⭐ 使用当前站点的配置
    const currentAdapter = getAdapter()
    const siteId = currentAdapter?.getSiteId() || "_default"
    const fallbackTheme =
      settings?.theme?.sites?.[siteId as keyof typeof settings.theme.sites] ||
      settings?.theme?.sites?._default
    return new ThemeManager(
      themeMode,
      undefined,
      adapter,
      fallbackTheme?.lightStyleId || "google-gradient",
      fallbackTheme?.darkStyleId || "classic-dark",
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在初始化时获取
  }, [])

  // ⭐ 动态注册主题变化回调，当页面主题变化时同步更新 React 状态
  useEffect(() => {
    const handleThemeModeChange = (mode: "light" | "dark") => {
      setThemeMode(mode)
      // ⭐ 使用 ref 获取最新 settings，避免闭包捕获过期值
      const currentSettings = settingsRef.current
      const sites = currentSettings?.theme?.sites || {}

      // ⭐ 获取当前站点 ID
      const currentAdapter = getAdapter()
      const siteId = currentAdapter?.getSiteId() || "_default"

      // ⭐ 确保站点配置有完整的默认值，但优先使用已有配置
      const existingSite = sites[siteId as keyof typeof sites] || sites._default
      const siteConfig = {
        lightStyleId: "google-gradient",
        darkStyleId: "classic-dark",
        mode: "light" as const,
        ...existingSite, // 已有配置覆盖默认值
      }

      // ⭐ 只更新 mode 字段，保留用户已有的主题配置
      setSettings({
        theme: {
          ...currentSettings?.theme,
          sites: {
            ...sites,
            [siteId]: {
              ...siteConfig,
              mode, // 最后更新 mode，确保生效
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
  }, [themeManager, setSettings]) // ⭐ 移除 settings?.theme 依赖，通过 ref 访问最新值

  // 监听主题预置变化，动态更新 ThemeManager
  // Zustand 不存在 Plasmo useStorage 的缓存问题，无需启动保护期
  useEffect(() => {
    if (!isSettingsHydrated) return // 等待 hydration 完成

    // ⭐ 使用当前站点的配置而非 _default
    const currentAdapter = getAdapter()
    const siteId = currentAdapter?.getSiteId() || "_default"
    const siteTheme =
      settings?.theme?.sites?.[siteId as keyof typeof settings.theme.sites] ||
      settings?.theme?.sites?._default
    const lightId = siteTheme?.lightStyleId
    const darkId = siteTheme?.darkStyleId

    if (lightId && darkId) {
      themeManager.setPresets(lightId, darkId)
    }
  }, [settings?.theme?.sites, themeManager, isSettingsHydrated])

  // 主题切换（异步处理，支持 View Transitions API 动画）
  // ⭐ 不在这里更新 React 状态，由 ThemeManager 的 onModeChange 回调在动画完成后统一处理
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
    // ⭐ 不再调用 updateMode，由 main.ts 负责初始应用
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

  // 使用 MutationObserver 监听 Portal 元素（菜单/对话框）的存在
  // 当 Portal 元素存在时，强制设置 isEdgePeeking 为 true，防止 CSS :hover 失效导致面板隐藏
  useEffect(() => {
    if (!edgeSnapState || !settings?.panel?.edgeSnap) return

    const portalSelector =
      ".conversations-dialog-overlay, .conversations-folder-menu, .conversations-tag-filter-menu, .prompt-modal"

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

  // 自动隐藏面板 - 点击外部关闭
  useEffect(() => {
    if (!settings?.panel?.autoHide || !isPanelOpen) return

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
        // 检查是否是 Portal 元素（菜单、对话框）
        if (el.closest?.(".conversations-dialog-overlay")) return true
        if (el.closest?.(".conversations-folder-menu")) return true
        if (el.closest?.(".conversations-tag-filter-menu")) return true
        if (el.closest?.(".prompt-modal")) return true
        return false
      })

      if (!isInsidePanelOrPortal) {
        setIsPanelOpen(false)
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
  }, [settings?.panel?.autoHide, isPanelOpen])

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
      // 仅处理 Enter 键（不带 Shift 修饰符，避免干扰换行操作）
      if (e.key !== "Enter" || e.shiftKey) return

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
        onOpenSettings={() => setIsSettingsOpen(true)}
        onMouseEnter={() => {
          if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current)
            hideTimerRef.current = null
          }
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
            // 检查是否有任何菜单/对话框/弹窗处于打开状态
            const interactionActive = isInteractionActiveRef.current
            const portalElements = document.body.querySelectorAll(
              ".conversations-dialog-overlay, .conversations-folder-menu, .conversations-tag-filter-menu, .prompt-modal",
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
        onClose={() => setIsSettingsOpen(false)}
        siteId={adapter.getSiteId()}
      />
    </div>
  )
}
