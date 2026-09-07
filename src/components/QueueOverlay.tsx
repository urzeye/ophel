/**
 * Queue Overlay - Ghost Overlay UI
 *
 * 悬浮在原生输入框上方的队列管理浮层。
 * 独立于平台 DOM 树，通过 position: fixed 定位。
 * 仅在 settings.features.prompts.promptQueue 为 true 时渲染。
 */

import React, { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import type { SiteAdapter } from "~adapters/base"
import { CleanupIcon, ImportIcon, PromptQueueIcon } from "~components/icons"
import { DialogOverlay, Tooltip } from "~components/ui"
import { extractVariables } from "~components/VariableInputDialog"
import { formatShortcut, normalizeShortcutBinding } from "~constants/shortcuts"
import type { QueueDispatcher } from "~core/queue-dispatcher"
import { appendQuickQuoteMarker, stripQuickQuoteMarkers } from "~core/quick-quote-marker"
import { usePromptsStore } from "~stores/prompts-store"
import { useSettingsStore } from "~stores/settings-store"
import type { QueueItem } from "~stores/queue-store"
import { useQueueItems, useQueueStore } from "~stores/queue-store"
import {
  attachEditableKeyboardFocusGuard,
  OPHEL_INTERACTION_LAYER_SELECTOR,
} from "~utils/dom-toolkit"
import { t } from "~utils/i18n"
import { createWeakModalRegistry, isViewportCovering } from "~utils/page-modal-policy"
import { parseQueueBatchInput, splitQueueLines, type QueueBatchSplitMode } from "~utils/queue-batch"
import { showToast } from "~utils/toast"

import "~styles/queue-overlay.css"

interface QueueOverlayProps {
  adapter: SiteAdapter
  dispatcher: QueueDispatcher
}

const BATCH_PREVIEW_LIMIT = 5
const INPUT_CONTAINER_GAP_PX = 6
type QueueBatchSource = "text" | "library"
type QueueLibraryMode = "single" | "line"

export const QueueOverlay: React.FC<QueueOverlayProps> = ({ adapter, dispatcher }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false)
  const [batchInputValue, setBatchInputValue] = useState("")
  const [batchSource, setBatchSource] = useState<QueueBatchSource>("library")
  const [batchSplitMode, setBatchSplitMode] = useState<QueueBatchSplitMode>("line")
  const [batchDelimiter, setBatchDelimiter] = useState("")
  const [librarySearchQuery, setLibrarySearchQuery] = useState("")
  const [libraryMode, setLibraryMode] = useState<QueueLibraryMode>("single")
  const [selectedPromptIds, setSelectedPromptIds] = useState<string[]>([])
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [position, setPosition] = useState<{
    bottom: number
    right: number
    width: number
  } | null>(null)

  const items = useQueueItems()
  const store = useQueueStore()
  const prompts = usePromptsStore((state) => state.prompts)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const batchTextareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const pendingCount = items.filter((i) => i.status === "pending").length
  const activeCount = items.filter((i) => i.status === "pending" || i.status === "sending").length
  const displayCount = items.filter((i) => i.status === "pending" || i.status === "sending").length

  const submitShortcut = useSettingsStore(
    (state) => state.settings.features?.prompts?.submitShortcut ?? "enter",
  )

  const shortcuts = useSettingsStore((state) => state.settings?.shortcuts)
  const queueBinding = shortcuts?.keybindings?.togglePromptQueue

  const submitKeyDisplay = React.useMemo(() => {
    if (submitShortcut === "ctrlEnter") {
      return "Ctrl+Enter"
    }
    return "Enter"
  }, [submitShortcut])

  const shortcutText = React.useMemo(() => {
    if (queueBinding === null) return ""
    const isMac = navigator.userAgent.toLowerCase().includes("mac")
    if (queueBinding) {
      const normalizedBinding = normalizeShortcutBinding(queueBinding)
      return normalizedBinding ? formatShortcut(normalizedBinding, isMac) : ""
    }
    return isMac ? "⌥J" : "Alt+J"
  }, [queueBinding])

  const filteredLibraryPrompts = React.useMemo(() => {
    const query = librarySearchQuery.trim().toLowerCase()
    const source = query
      ? prompts.filter(
          (prompt) =>
            prompt.title.toLowerCase().includes(query) ||
            prompt.content.toLowerCase().includes(query) ||
            prompt.category?.toLowerCase().includes(query),
        )
      : prompts

    return [...source].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return (b.lastUsedAt || 0) - (a.lastUsedAt || 0)
    })
  }, [librarySearchQuery, prompts])

  const selectedLibraryPrompts = React.useMemo(() => {
    const selectedIds = new Set(selectedPromptIds)
    return prompts.filter(
      (prompt) => selectedIds.has(prompt.id) && extractVariables(prompt.content).length === 0,
    )
  }, [prompts, selectedPromptIds])

  const libraryPreviewItems = React.useMemo(() => {
    return selectedLibraryPrompts.flatMap((prompt) =>
      libraryMode === "line"
        ? splitQueueLines(prompt.content)
        : [prompt.content.trim()].filter(Boolean),
    )
  }, [libraryMode, selectedLibraryPrompts])

  const textPreviewItems = React.useMemo(
    () => parseQueueBatchInput(batchInputValue, batchSplitMode, batchDelimiter),
    [batchDelimiter, batchInputValue, batchSplitMode],
  )

  const batchPreviewItems = batchSource === "library" ? libraryPreviewItems : textPreviewItems

  // ==================== 位置计算 ====================

  const findInputContainer = useCallback((textarea: HTMLElement): Element => {
    let inputContainer: Element = textarea
    let parent = textarea.parentElement

    for (let i = 0; i < 10 && parent && parent !== document.body; i++) {
      const style = window.getComputedStyle(parent)
      if (style.borderRadius && parseFloat(style.borderRadius) > 0) {
        inputContainer = parent
        break
      }
      parent = parent.parentElement
    }

    return inputContainer
  }, [])

  const updatePosition = useCallback(() => {
    const inputEl = adapter.getTextareaElement()

    if (!inputEl) {
      setPosition(null)
      return
    }

    const inputContainer = findInputContainer(inputEl)
    const rect = inputContainer.getBoundingClientRect()

    // 胶囊/面板中心对齐到输入框右缘内侧 20px 处
    // 因为悬浮层不是被挂载在 document.body，而是放在 App 的容器里
    // 导致 position: fixed 是相对于容器计算的（如果容器有 transform）。
    // 所以这里的 top/left 必须算上容器的自身坐标去抵消！

    // 我们将挂载到最外层具有样式隔离和主题变量的容器
    // 通常是 .ophel-container 或者是全局根节点

    // 如果找到了局部父容器，并且决定把 Portal 挂载到其内部（比如避免 Shadow DOM 被穿透），我们要计算其相对坐标。
    // 但是这里为了既享受 CSS 变量又绕开局部 overflow:hidden 限制，
    // 我们只要确保 Portal 挂在带有 .gh-root 的层级即可。
    // 如果它挂在 .gh-root，而 .gh-root 本身是 fixed 的（占满全屏），那么 bottom/right 的表现等同于 window 视口

    // 下面恢复基于窗口绝对视口的计算方式（最稳定）
    const bottomPos = window.innerHeight - rect.top + INPUT_CONTAINER_GAP_PX

    // 修复定位偏移 bug: 使用 left 定位，避免右侧滚动条出现/消失导致的 right 坐标跳动。
    const overlayWidth = Math.min(420, window.innerWidth - 40)
    let leftPos = rect.right - 20 - overlayWidth

    // 如果 left 溢出屏幕左侧，强制贴着左侧边缘
    if (leftPos < 20) leftPos = 20

    // 将稳定的 left 的坐标转换为相应的 right 属性，以满足接口定义
    const finalRight = window.innerWidth - (leftPos + overlayWidth)

    setPosition({
      bottom: bottomPos,
      right: finalRight,
      width: overlayWidth,
    })
  }, [adapter, findInputContainer])

  // ResizeObserver 精准监听输入框位置/大小变化
  useEffect(() => {
    updatePosition()

    let observer: ResizeObserver | null = null
    let targetEl: HTMLElement | null = null

    const initObserver = () => {
      targetEl = adapter.getTextareaElement()

      if (targetEl) {
        const inputContainer = findInputContainer(targetEl)
        observer = new ResizeObserver(() => {
          updatePosition()
        })
        observer.observe(targetEl)
        observer.observe(inputContainer)
        if (targetEl.parentElement) {
          observer.observe(targetEl.parentElement) // 监听父级尺寸变化
        }
      }
    }

    // 初次尝试初始化
    initObserver()

    // 兜底轮询（防止页面动态加载输入框）
    const intervalId = setInterval(() => {
      updatePosition()
      if (!observer && !targetEl) {
        initObserver()
      }
    }, 2000)

    window.addEventListener("resize", updatePosition)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener("resize", updatePosition)
      if (observer) {
        observer.disconnect()
      }
    }
  }, [updatePosition, adapter, findInputContainer])

  // ==================== 生成状态监控 ====================

  useEffect(() => {
    const intervalId = setInterval(() => {
      setIsGenerating(adapter.isGenerating())
    }, 1000)
    return () => clearInterval(intervalId)
  }, [adapter])

  // ==================== 自定义快捷键 ====================

  useEffect(() => {
    const handleToggle = () => {
      setIsExpanded((prev) => !prev)
    }

    window.addEventListener("ophel:togglePromptQueue", handleToggle)
    return () => window.removeEventListener("ophel:togglePromptQueue", handleToggle)
  }, [])

  // ==================== 原生弹窗避让 ====================

  // 胶囊/面板通过 portal 直接挂在页面 body 下,z-index(9998/9999)高于多数站点的
  // 弹窗层级,会遮挡站点自身的对话框。这里监听页面 DOM,检测到站点原生弹窗出现时
  // 临时隐藏队列悬浮层,弹窗关闭后自动恢复。
  const [isPageModalOpen, setIsPageModalOpen] = useState(false)
  // 隐藏前焦点是否在队列输入框内,供恢复显示时决定是否还回焦点
  const hadInputFocusRef = useRef(false)

  useEffect(() => {
    // :modal 低版本浏览器不支持,探测失败则弃用该选择器
    let modalDialogSupported = true
    try {
      document.querySelector("dialog:modal")
    } catch {
      modalDialogSupported = false
    }

    // 强信号仅 dialog:modal:showModal() 会让页面其余部分 inert,外部交互事件
    // 根本到不了 document,下方的宽恕机制不可能被误触发,可见即算页面弹窗。
    // aria-modal / role="alertdialog" 只是语义声明,站点可能误标在常驻容器上,
    // 一律走 weakModals 注册表;popover 在 top layer,天然绘制在 overlay 之上,
    // 不存在遮挡问题,不检测。
    const strongModalSelector = modalDialogSupported ? "dialog:modal" : ""
    const modalSelector = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]'

    // 扩展自身 UI(批量导入弹窗、提示词编辑器等也 portal 在 body 下)不算页面弹窗
    const ownUiSelector = `${OPHEL_INTERACTION_LAYER_SELECTOR}, .gh-queue-capsule, .gh-queue-panel`

    const weakModals = createWeakModalRegistry()

    const isBackdropLike = (el: HTMLElement): boolean => {
      // 已知盲区:站点主布局容器若为 absolute/fixed 且铺满视口,点在其空白处会
      // 被误认为点在遮罩上而不放行;此时任意一次按键仍会触发宽恕恢复 overlay,
      // 影响温和,暂不加更复杂的启发式
      const style = window.getComputedStyle(el)
      if (style.position !== "fixed" && style.position !== "absolute") return false
      return isViewportCovering(el.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    // 本地镜像 open 状态,用于识别跳变
    let modalOpen = false

    const checkPageModal = () => {
      let open = false
      const weakVisible: HTMLElement[] = []
      for (const el of document.querySelectorAll(modalSelector)) {
        if (!(el instanceof HTMLElement)) continue
        if (el.closest(ownUiSelector)) continue
        // display:none / 零面积的挂点容器(误标 aria-modal 等)不算可见
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        if (window.getComputedStyle(el).visibility === "hidden") continue
        if (strongModalSelector && el.matches(strongModalSelector)) {
          open = true
        } else {
          weakVisible.push(el)
        }
      }
      if (weakModals.update(weakVisible)) open = true
      if (open && !modalOpen) {
        // 此刻 portal 尚未卸载,可读到隐藏前的真实焦点;若站点弹窗已主动
        // focus() 把焦点抢进弹窗,则保守记为不在输入框——宁可不还原,也不抢页面焦点
        hadInputFocusRef.current = document.activeElement === inputRef.current
      }
      modalOpen = open
      setIsPageModalOpen((prev) => (prev === open ? prev : open))
    }

    // 聊天页流式输出会频繁触发 DOM 变化,合并为 150ms 一次检查
    let timer: number | null = null
    const scheduleCheck = () => {
      if (timer !== null) return
      timer = window.setTimeout(() => {
        timer = null
        checkPageModal()
      }, 150)
    }

    // 模态弹窗会阻断页面交互;用户在弱信号元素之外成功点击/按键,说明它
    // 不阻断页面,放行这些元素。点在全屏遮罩上除外——那通常是真实弹窗的 backdrop
    const handleInteraction = (e: Event) => {
      // Escape 的语义是关闭弹窗而非与页面交互;弹窗未聚焦时 target 落在 body 上,
      // 不能作为"弹窗不阻断页面"的证据
      if (e.type === "keydown" && (e as KeyboardEvent).key === "Escape") return
      const target = e.target
      const changed = weakModals.forgiveOnOutsideInteraction(
        target instanceof Element ? target : null,
        {
          onBackdrop:
            e.type === "pointerdown" && target instanceof HTMLElement && isBackdropLike(target),
        },
      )
      if (changed) scheduleCheck()
    }

    checkPageModal()
    const observer = new MutationObserver(scheduleCheck)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open", "hidden", "class", "style", "aria-hidden", "aria-modal"],
    })
    document.addEventListener("pointerdown", handleInteraction, true)
    document.addEventListener("keydown", handleInteraction, true)
    return () => {
      observer.disconnect()
      document.removeEventListener("pointerdown", handleInteraction, true)
      document.removeEventListener("keydown", handleInteraction, true)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])

  // 展开时聚焦输入框
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isExpanded])

  // 站点弹窗关闭后 portal 重新挂载,输入框是全新节点。仅当隐藏前焦点就在
  // 输入框内时才还回焦点,避免抢夺用户在页面上的焦点
  useEffect(() => {
    if (isPageModalOpen || !isExpanded || !hadInputFocusRef.current) return
    hadInputFocusRef.current = false
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [isExpanded, isPageModalOpen])

  useEffect(() => {
    if (!isBatchDialogOpen || batchSource !== "text") return
    const timeoutId = window.setTimeout(() => batchTextareaRef.current?.focus(), 60)
    return () => window.clearTimeout(timeoutId)
  }, [batchSource, isBatchDialogOpen, isPageModalOpen])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) {
      return
    }

    // 队列输入依赖本地 Enter / Escape 逻辑，改为冒泡阶段拦截以避免吞掉自身键盘处理。
    return attachEditableKeyboardFocusGuard(panel, { capture: false })
    // 依赖 isPageModalOpen:恢复显示时 panel 是全新节点,必须重新挂监听
  }, [isExpanded, isPageModalOpen, position])

  // 点击外部关闭
  useEffect(() => {
    if (!isExpanded || isBatchDialogOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const panel = panelRef.current
      if (!panel) return

      // Shadow DOM 内事件冒泡到 document 时会被 retarget 为 shadow host，
      // 必须通过 composedPath 穿透判断真实点击路径是否在面板内
      const path = typeof e.composedPath === "function" ? e.composedPath() : []
      if (path.length > 0) {
        const isInside = path.some((node) => {
          if (node === panel || (node instanceof Node && panel.contains(node))) {
            return true
          }
          if (
            node instanceof HTMLElement &&
            node.closest?.(".gh-dialog-overlay, .gh-queue-batch-dialog, .gh-queue-capsule")
          ) {
            return true
          }
          return false
        })
        if (!isInside) {
          setIsExpanded(false)
        }
        return
      }

      const target = e.target as Node | null
      if (target && !panel.contains(target)) {
        setIsExpanded(false)
      }
    }

    // 延迟注册以避免展开时的点击立即触发关闭
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isBatchDialogOpen, isExpanded])

  // ==================== 提交逻辑 ====================

  const handleSubmit = useCallback(async () => {
    const content = inputValue.trim()
    if (!content) return

    setInputValue("")

    if (isGenerating) {
      // AI 正在生成 -> 加入队列
      store.enqueue(content)
      // 确保调度器在运行
      if (!dispatcher.isRunning()) {
        dispatcher.start()
      }
    } else {
      // AI 空闲 -> 直接发送
      // 注意：不在失败时回退入队，因为 submitPrompt 返回 false
      // 可能只是确认超时（消息实际已发送），回退入队会导致重复发送
      await dispatcher.sendImmediately(content, submitShortcut)
    }
  }, [inputValue, isGenerating, store, dispatcher, submitShortcut])

  // 队列输入框键盘事件处理（使用捕获阶段，避免被 Guard 拦截）
  useEffect(() => {
    const textarea = inputRef.current
    if (!textarea || !isExpanded) return

    const handleKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        // 根据 submitShortcut 设置判断是否应该发送
        const needsModifier = submitShortcut === "ctrlEnter"
        const hasModifier = e.ctrlKey

        // submitShortcut 为 "enter" 时：仅 Enter 发送，Ctrl+Enter 换行
        // submitShortcut 为 "ctrlEnter" 时：仅 Ctrl+Enter 发送，Enter 换行
        const shouldSubmit = needsModifier ? hasModifier : !hasModifier

        if (shouldSubmit) {
          e.preventDefault()
          e.stopPropagation()
          handleSubmit()
        }
        // 如果不应该发送，让 Enter 正常换行（不 preventDefault）
      }
      if (e.key === "Escape") {
        e.stopPropagation()
        setIsExpanded(false)
      }
    }

    // 使用捕获阶段，在 Guard 之前处理
    textarea.addEventListener("keydown", handleKeyDownCapture, true)

    return () => {
      textarea.removeEventListener("keydown", handleKeyDownCapture, true)
    }
    // isPageModalOpen 恢复为 false 时 textarea 是全新节点,必须重新挂监听
  }, [isExpanded, isPageModalOpen, submitShortcut, handleSubmit])

  const handleRemoveItem = useCallback(
    (id: string) => {
      store.remove(id)
    },
    [store],
  )

  const handleForceSend = useCallback(
    async (item: QueueItem) => {
      // 允许强行发送（插队）
      store.remove(item.id)
      const success = await dispatcher.sendImmediately(item.content, submitShortcut, item.metadata)
      if (!success) {
        // 如果失败再放回去（虽然可能顺序变了，但算作 fallback）
        store.enqueue(item.content, item.metadata)
        if (!dispatcher.isRunning()) {
          dispatcher.start()
        }
      }
    },
    [store, dispatcher, submitShortcut],
  )

  const handleClearAll = useCallback(() => {
    store.clear()
  }, [store])

  const resetBatchImportState = useCallback(() => {
    setBatchInputValue("")
    setBatchSource("library")
    setBatchSplitMode("line")
    setBatchDelimiter("")
    setLibrarySearchQuery("")
    setLibraryMode("single")
    setSelectedPromptIds([])
    setIsBatchDialogOpen(false)
  }, [])

  const toggleLibraryPrompt = useCallback((promptId: string) => {
    setSelectedPromptIds((prev) =>
      prev.includes(promptId) ? prev.filter((id) => id !== promptId) : [...prev, promptId],
    )
  }, [])

  const handleBatchImportConfirm = useCallback(async () => {
    if (batchSource === "text" && batchSplitMode === "delimiter" && !batchDelimiter.trim()) {
      showToast(t("queueBatchDelimiterRequired"), 2500)
      return
    }

    if (batchPreviewItems.length === 0) {
      showToast(t("queueBatchImportEmpty"), 2500)
      return
    }

    const importedItems = store.enqueueMany(batchPreviewItems)
    if (importedItems.length === 0) {
      showToast(t("queueBatchImportEmpty"), 2500)
      return
    }

    if (!dispatcher.isRunning()) {
      dispatcher.start()
    }

    if (!adapter.isGenerating()) {
      await dispatcher.processNextNow()
    }

    showToast(t("queueBatchImportSuccess", { count: String(importedItems.length) }), 2500)
    resetBatchImportState()
  }, [
    adapter,
    batchDelimiter,
    batchPreviewItems,
    batchSource,
    batchSplitMode,
    dispatcher,
    resetBatchImportState,
    store,
  ])

  const handleEditClick = useCallback((id: string, content: string) => {
    setEditingItemId(id)
    setEditValue(stripQuickQuoteMarkers(content))
  }, [])

  const handleEditSave = useCallback(
    (id: string) => {
      if (editValue.trim()) {
        const item = store.items.find((item) => item.id === id)
        const markerKind = item?.metadata?.quoteMarkerKind
        store.updateContent(
          id,
          appendQuickQuoteMarker(
            editValue.trim(),
            item?.metadata?.quoteRef,
            markerKind ? { kind: markerKind } : undefined,
          ),
        )
      }
      setEditingItemId(null)
    },
    [editValue, store],
  )

  const handleEditCancel = useCallback(() => {
    setEditingItemId(null)
  }, [])

  // 自动调整输入框高度
  const adjustTextareaHeight = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "0px" // Reset first to allow shrinking
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px"
    }
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
    // isPageModalOpen 恢复为 false 时 textarea 是全新节点,内联高度丢失,需要重算
  }, [inputValue, isPageModalOpen, adjustTextareaHeight])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
  }, [])

  // ==================== 渲染 ====================

  if (!position || isPageModalOpen) return null

  // 挂载到 document.body，确保与 DialogOverlay 弹窗样式环境一致
  // （.gh-root 在 Shadow DOM 内，document.querySelector 取不到，历史上恒为 body）
  const targetContainer = document.body

  const capsuleStyle: React.CSSProperties = {
    bottom: position.bottom,
    right: position.right,
  }

  const panelStyle: React.CSSProperties = {
    bottom: position.bottom,
    right: position.right,
    width: position.width,
  }

  // 折叠态：胶囊
  if (!isExpanded) {
    return createPortal(
      <Tooltip content={shortcutText || t("queueQuickAsk")}>
        <div
          className="gh-queue-capsule gh-interactive"
          style={capsuleStyle}
          onClick={() => setIsExpanded(true)}>
          <span className="gh-queue-capsule-icon">
            <PromptQueueIcon size={18} color="currentColor" />
          </span>
          <span>
            {activeCount > 0
              ? t("queueInQueue", { count: String(activeCount) })
              : t("queueQuickAsk")}
          </span>
        </div>
      </Tooltip>,
      targetContainer,
    )
  }

  // 展开态：面板
  return (
    <>
      {createPortal(
        <div className="gh-queue-panel gh-interactive" style={panelStyle} ref={panelRef}>
          {/* 头部 */}
          <div className="gh-queue-header">
            <div className="gh-queue-header-title">
              <span>
                <PromptQueueIcon size={18} color="currentColor" />
              </span>
              <span>{t("queueTitle")}</span>
              {pendingCount > 0 && <span className="gh-queue-capsule-badge">{pendingCount}</span>}
            </div>
            <div className="gh-queue-header-actions">
              <Tooltip content={t("queueBatchImport")}>
                <button className="gh-queue-header-btn" onClick={() => setIsBatchDialogOpen(true)}>
                  <ImportIcon size={16} color="currentColor" />
                </button>
              </Tooltip>
              {displayCount > 0 && (
                <Tooltip content={t("queueClearAll")}>
                  <button className="gh-queue-header-btn" onClick={handleClearAll}>
                    <CleanupIcon size={16} color="currentColor" />
                  </button>
                </Tooltip>
              )}
              <Tooltip content={t("collapse")}>
                <button className="gh-queue-header-btn" onClick={() => setIsExpanded(false)}>
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </Tooltip>
            </div>
          </div>

          {/* 队列列表 */}
          <div className="gh-queue-list">
            {items.filter((i) => i.status === "pending" || i.status === "sending").length === 0 ? (
              <div className="gh-queue-empty">{t("queueEmpty", { key: submitKeyDisplay })}</div>
            ) : (
              items
                .filter((i) => i.status === "pending" || i.status === "sending")
                .map((item, index) => (
                  <div key={item.id} className="gh-queue-item" data-status={item.status}>
                    <span className="gh-queue-item-index">{index + 1}</span>
                    {editingItemId === item.id ? (
                      <div className="gh-queue-item-edit-area">
                        <textarea
                          className="gh-queue-item-edit-input"
                          value={editValue}
                          onChange={(e) => {
                            setEditValue(e.target.value)
                            const target = e.target as HTMLTextAreaElement
                            target.style.height = "0px"
                            target.style.height = Math.min(target.scrollHeight, 120) + "px"
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault()
                              handleEditSave(item.id)
                            }
                            if (e.key === "Escape") {
                              handleEditCancel()
                            }
                          }}
                          autoFocus
                        />
                        <div className="gh-queue-item-edit-actions-row">
                          <button
                            className="gh-queue-item-edit-btn-save"
                            onClick={() => handleEditSave(item.id)}
                            title={t("queueEditSave")}>
                            <svg
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          </button>
                          <button
                            className="gh-queue-item-edit-btn-cancel"
                            onClick={handleEditCancel}
                            title={t("queueEditCancel")}>
                            <svg
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="gh-queue-item-main">
                          {item.metadata?.chainTitle && (
                            <span className="gh-queue-item-chain">
                              {t("quickQuoteChainQueueSource", {
                                title: item.metadata.chainTitle,
                                index: String(item.metadata.stepIndex || index + 1),
                                total: String(item.metadata.stepTotal || 1),
                              })}
                            </span>
                          )}
                          <span className="gh-queue-item-content">
                            {stripQuickQuoteMarkers(item.content)}
                          </span>
                        </span>
                        <div className="gh-queue-item-actions">
                          {item.status === "pending" && (
                            <button
                              className="gh-queue-item-edit"
                              onClick={() => handleEditClick(item.id, item.content)}
                              title={t("queueEdit")}>
                              <svg
                                viewBox="0 0 24 24"
                                width="14"
                                height="14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                            </button>
                          )}
                          {item.status === "pending" && (
                            <button
                              className="gh-queue-item-force-send"
                              onClick={() => handleForceSend(item)}
                              title={t("queueForceSend")}>
                              <svg
                                viewBox="0 0 24 24"
                                width="14"
                                height="14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round">
                                <line x1="12" y1="19" x2="12" y2="5"></line>
                                <polyline points="5 12 12 5 19 12"></polyline>
                              </svg>
                            </button>
                          )}
                          <button
                            className="gh-queue-item-remove"
                            onClick={() => handleRemoveItem(item.id)}
                            title={t("queueRemove")}>
                            <svg
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
            )}
          </div>

          {/* 输入区 */}
          <div className="gh-queue-input-area">
            <div className="gh-queue-input-wrapper">
              <textarea
                ref={inputRef}
                className="gh-queue-input"
                value={inputValue}
                onChange={handleInputChange}
                placeholder={
                  isGenerating
                    ? t("queuePlaceholderBusy", { key: submitKeyDisplay })
                    : t("queuePlaceholderIdle", { key: submitKeyDisplay })
                }
                rows={1}
              />
              <button
                className="gh-queue-send-btn"
                onClick={handleSubmit}
                disabled={!inputValue.trim()}
                title={submitKeyDisplay}>
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"></line>
                  <polyline points="5 12 12 5 19 12"></polyline>
                </svg>
              </button>
            </div>
          </div>

          {/* 状态栏 */}
          <div className="gh-queue-status">
            <span
              className="gh-queue-status-dot"
              data-generating={isGenerating ? "true" : "false"}
            />
            <span>{isGenerating ? t("queueStatusBusy") : t("queueStatusIdle")}</span>
            <span className="gh-queue-disable-hint" title={t("queueSettingDesc")}>
              ({t("queueDisableHint")})
            </span>
            {shortcutText && <span className="gh-queue-shortcut-hint">{shortcutText}</span>}
          </div>
        </div>,
        targetContainer,
      )}

      {isBatchDialogOpen && (
        <DialogOverlay
          onClose={resetBatchImportState}
          closeOnOverlayClick={false}
          closeOnEscape={false}
          dialogClassName="gh-queue-batch-dialog"
          dialogStyle={{ maxWidth: 560, width: "min(560px, calc(100vw - 32px))" }}>
          <div className="gh-dialog-title">{t("queueBatchImportTitle")}</div>
          <div className="gh-dialog-message">{t("queueBatchImportDesc")}</div>

          <div className="gh-queue-batch-tabs">
            <button
              className="gh-queue-batch-tab"
              data-active={batchSource === "library"}
              onClick={() => setBatchSource("library")}>
              {t("queueBatchLibraryTab")}
            </button>
            <button
              className="gh-queue-batch-tab"
              data-active={batchSource === "text"}
              onClick={() => setBatchSource("text")}>
              {t("queueBatchTextTab")}
            </button>
          </div>

          {batchSource === "text" && (
            <>
              <div className="gh-queue-batch-section">
                <div className="gh-queue-batch-label">{t("queueBatchSplitModeLabel")}</div>
                <div className="gh-queue-batch-mode-group">
                  <button
                    className="gh-queue-batch-mode-btn"
                    data-active={batchSplitMode === "line"}
                    onClick={() => setBatchSplitMode("line")}>
                    {t("queueBatchSplitModeLine")}
                  </button>
                  <button
                    className="gh-queue-batch-mode-btn"
                    data-active={batchSplitMode === "delimiter"}
                    onClick={() => setBatchSplitMode("delimiter")}>
                    {t("queueBatchSplitModeDelimiter")}
                  </button>
                </div>
              </div>

              {batchSplitMode === "delimiter" && (
                <div className="gh-queue-batch-section">
                  <div className="gh-queue-batch-label">{t("queueBatchDelimiterLabel")}</div>
                  <input
                    className="gh-dialog-input gh-queue-batch-delimiter-input"
                    value={batchDelimiter}
                    onChange={(e) => setBatchDelimiter(e.target.value)}
                    placeholder={t("queueBatchDelimiterPlaceholder")}
                  />
                </div>
              )}

              <div className="gh-queue-batch-section">
                <div className="gh-queue-batch-label">{t("queueBatchInputLabel")}</div>
                <textarea
                  ref={batchTextareaRef}
                  className="gh-queue-batch-textarea"
                  value={batchInputValue}
                  onChange={(e) => setBatchInputValue(e.target.value)}
                  placeholder={t("queueBatchInputPlaceholder")}
                />
              </div>
            </>
          )}

          {batchSource === "library" && (
            <>
              <div className="gh-queue-batch-section">
                <div className="gh-queue-batch-label">{t("queueBatchLibraryModeLabel")}</div>
                <div className="gh-queue-batch-mode-group">
                  <button
                    className="gh-queue-batch-mode-btn"
                    data-active={libraryMode === "single"}
                    onClick={() => setLibraryMode("single")}>
                    {t("queueBatchLibraryModeSingle")}
                  </button>
                  <button
                    className="gh-queue-batch-mode-btn"
                    data-active={libraryMode === "line"}
                    onClick={() => setLibraryMode("line")}>
                    {t("queueBatchSplitModeLine")}
                  </button>
                </div>
              </div>

              <div className="gh-queue-batch-section">
                <div className="gh-queue-batch-label">{t("queueBatchLibrarySearchLabel")}</div>
                <input
                  className="gh-dialog-input gh-queue-batch-library-search"
                  value={librarySearchQuery}
                  onChange={(e) => setLibrarySearchQuery(e.target.value)}
                  placeholder={t("queueBatchLibrarySearchPlaceholder")}
                />
                <div className="gh-queue-batch-library-list">
                  {filteredLibraryPrompts.length === 0 ? (
                    <div className="gh-queue-batch-library-empty">
                      {t("queueBatchLibraryEmpty")}
                    </div>
                  ) : (
                    filteredLibraryPrompts.slice(0, 80).map((prompt) => {
                      const hasVariables = extractVariables(prompt.content).length > 0
                      return (
                        <label
                          key={prompt.id}
                          className="gh-queue-batch-library-item"
                          data-disabled={hasVariables ? "true" : "false"}
                          title={hasVariables ? t("queueBatchLibraryVariablePrompt") : undefined}>
                          <input
                            type="checkbox"
                            disabled={hasVariables}
                            checked={!hasVariables && selectedPromptIds.includes(prompt.id)}
                            onChange={() => {
                              if (!hasVariables) {
                                toggleLibraryPrompt(prompt.id)
                              }
                            }}
                          />
                          <span className="gh-queue-batch-library-main">
                            <span className="gh-queue-batch-library-title">{prompt.title}</span>
                            <span className="gh-queue-batch-library-content">
                              {hasVariables ? t("queueBatchLibraryVariablePrompt") : prompt.content}
                            </span>
                          </span>
                          <span className="gh-queue-batch-library-category">
                            {prompt.category || t("uncategorized")}
                          </span>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>
            </>
          )}

          <div className="gh-queue-batch-preview">
            <div className="gh-queue-batch-preview-header">
              <span>{t("queueBatchPreviewTitle")}</span>
              <span>
                {t("queueBatchPreviewCount", { count: String(batchPreviewItems.length) })}
              </span>
            </div>

            <div className="gh-queue-batch-preview-body">
              {batchPreviewItems.length === 0 ? (
                <div className="gh-queue-batch-preview-empty">{t("queueBatchPreviewEmpty")}</div>
              ) : (
                <>
                  <ol className="gh-queue-batch-preview-list">
                    {batchPreviewItems.slice(0, BATCH_PREVIEW_LIMIT).map((item, index) => (
                      <li
                        key={`${index}-${item.slice(0, 20)}`}
                        className="gh-queue-batch-preview-item">
                        {item}
                      </li>
                    ))}
                  </ol>
                  {batchPreviewItems.length > BATCH_PREVIEW_LIMIT && (
                    <div className="gh-queue-batch-preview-more">
                      {t("queueBatchPreviewMore", {
                        count: String(batchPreviewItems.length - BATCH_PREVIEW_LIMIT),
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="gh-dialog-buttons">
            <button
              className="gh-dialog-btn gh-dialog-btn-secondary"
              onClick={resetBatchImportState}>
              {t("cancel")}
            </button>
            <button
              className="gh-dialog-btn gh-dialog-btn-primary"
              onClick={() => void handleBatchImportConfirm()}
              disabled={
                batchPreviewItems.length === 0 ||
                (batchSource === "text" && batchSplitMode === "delimiter" && !batchDelimiter.trim())
              }>
              {t("queueBatchImportAction")}
            </button>
          </div>
        </DialogOverlay>
      )}
    </>
  )
}
