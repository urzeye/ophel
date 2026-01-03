import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useStorage } from "@plasmohq/storage/hook"

import { getAdapter } from "~adapters/index"
import { ConversationManager } from "~core/conversation-manager"
import { OutlineManager } from "~core/outline-manager"
import { PromptManager } from "~core/prompt-manager"
import { ThemeManager } from "~core/theme-manager"
import { Exporter } from "~utils/exporter"
import { DEFAULT_SETTINGS, STORAGE_KEYS, type Prompt, type Settings } from "~utils/storage"

import { MainPanel } from "./MainPanel"
import { QuickButtons } from "./QuickButtons"
import { SelectedPromptBar } from "./SelectedPromptBar"

export const App = () => {
  // 读取设置 - useStorage 返回 [value, setter, { isLoading }]
  const [settings, setSettings, { isLoading: isSettingsLoading }] = useStorage<Settings>(
    STORAGE_KEYS.SETTINGS,
    (saved) => (saved === undefined ? DEFAULT_SETTINGS : { ...DEFAULT_SETTINGS, ...saved }),
  )

  // 面板状态 - 初始值来自设置
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const hasInitializedPanel = useRef(false)

  // 主题状态 - 与 settings 同步 (不再支持 auto)
  // 如果旧数据中有 auto，将其视为 light 处理，或者在初始化 ThemeManager 时会被强制转换
  const [themeMode, setThemeMode] = useState<"light" | "dark">(
    settings?.themeMode === "dark" ? "dark" : "light",
  )

  // 当设置加载完成后，同步面板初始状态（只执行一次）
  useEffect(() => {
    // 只有当 storage 真正加载完成（isLoading = false）且尚未初始化时才执行
    if (!isSettingsLoading && settings && !hasInitializedPanel.current) {
      hasInitializedPanel.current = true
      // 如果 defaultPanelOpen 为 true，打开面板
      if (settings.defaultPanelOpen) {
        setIsPanelOpen(true)
      }
    }
  }, [isSettingsLoading, settings])

  // 选中的提示词状态
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)

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
    if (!isSettingsLoading && settings?.language) {
      // 这里的 setLanguage 是从 utils/i18n 导入的全局函数
      const { setLanguage } = require("~utils/i18n")
      setLanguage(settings.language)
    }
  }, [settings?.language, isSettingsLoading])

  // 当设置中的主题变化时，同步更新本地状态
  useEffect(() => {
    if (settings?.themeMode && settings.themeMode !== themeMode) {
      setThemeMode(settings.themeMode)
    }
  }, [settings?.themeMode])

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

    // ⭐ 使用函数式更新来避免闭包陷阱
    const handleExpandLevelChange = (level: number) => {
      setSettings((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          outline: { ...prev.outline, expandLevel: level },
        }
      })
    }

    const handleShowUserQueriesChange = (show: boolean) => {
      setSettings((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          outline: { ...prev.outline, showUserQueries: show },
        }
      })
    }

    return new OutlineManager(
      adapter,
      settings?.outline ?? DEFAULT_SETTINGS.outline,
      handleExpandLevelChange,
      handleShowUserQueriesChange,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在 adapter 变化时重新创建
  }, [adapter, setSettings])

  // ⭐ 单独用 useEffect 同步 settings 变化到 manager
  useEffect(() => {
    if (outlineManager && settings) {
      outlineManager.updateSettings(settings.outline)
    }
  }, [outlineManager, settings])

  const exporter = useMemo(() => {
    return adapter ? new Exporter(adapter) : null
  }, [adapter])

  // ⭐ 从 window 获取 main.ts 创建的全局 ThemeManager 实例
  // 这样只有一个 ThemeManager 实例，避免竞争条件
  const themeManager = useMemo(() => {
    const globalTM = (window as any).__ghThemeManager as ThemeManager | undefined
    if (globalTM) {
      return globalTM
    }
    // 降级：如果 main.ts 还没创建，则临时创建一个（不应该发生）
    console.warn("[App] Global ThemeManager not found, creating fallback instance")
    return new ThemeManager(
      themeMode,
      undefined,
      adapter,
      settings?.themePresets?.lightPresetId || "google-gradient",
      settings?.themePresets?.darkPresetId || "classic-dark",
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在初始化时获取
  }, [])

  // ⭐ 动态注册主题变化回调，当页面主题变化时同步更新 React 状态
  useEffect(() => {
    const handleThemeModeChange = (mode: "light" | "dark") => {
      setThemeMode(mode)
      // 同时保存到 storage
      setSettings((prev) => (prev ? { ...prev, themeMode: mode } : prev))
    }
    themeManager.setOnModeChange(handleThemeModeChange)

    // 清理时移除回调
    return () => {
      themeManager.setOnModeChange(undefined)
    }
  }, [themeManager, setSettings])

  // 监听主题预置变化，动态更新 ThemeManager
  useEffect(() => {
    if (settings?.themePresets) {
      themeManager.setPresets(
        settings.themePresets.lightPresetId || "google-gradient",
        settings.themePresets.darkPresetId || "classic-dark",
      )
    }
  }, [settings?.themePresets?.lightPresetId, settings?.themePresets?.darkPresetId, themeManager])

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
    if (!edgeSnapState || !settings?.edgeSnapHide) return

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
  }, [edgeSnapState, settings?.edgeSnapHide])

  // 自动隐藏面板 - 点击外部关闭
  useEffect(() => {
    if (!settings?.autoHidePanel || !isPanelOpen) return

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
  }, [settings?.autoHidePanel, isPanelOpen])

  // 发送消息后自动清除选中的提示词悬浮条（及可选的清空输入框修复中文输入）
  useEffect(() => {
    if (!adapter) return
    // 只有选中提示词时才需要清除悬浮条，但修复中文输入功能可能需要一直监听
    const shouldClearTextarea = settings?.clearTextareaOnSend ?? false
    if (!selectedPrompt && !shouldClearTextarea) return

    // 发送后执行清理
    const handleSend = () => {
      // 清除悬浮条
      if (selectedPrompt) {
        setSelectedPrompt(null)
      }
      // Gemini Enterprise 专属：修复中文输入（插入零宽字符）
      if (shouldClearTextarea) {
        setTimeout(() => {
          adapter.clearTextarea()
        }, 200)
      }
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
      const isFromTextarea = path.some(
        (element) => element instanceof Element && adapter.isValidTextarea(element as HTMLElement),
      )

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
  }, [adapter, selectedPrompt, settings?.clearTextareaOnSend])

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
        exporter={exporter}
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
        onMouseEnter={() => {
          if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current)
            hideTimerRef.current = null
          }
          // 当处于吸附状态时，鼠标进入面板应设置 isEdgePeeking = true
          // 这样 onMouseLeave 时才能正确隐藏
          if (edgeSnapState && settings?.edgeSnapHide && !isEdgePeeking) {
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
            if (edgeSnapState && settings?.edgeSnapHide && isEdgePeeking) {
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
            if (edgeSnapState && settings?.edgeSnapHide) {
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
    </div>
  )
}
