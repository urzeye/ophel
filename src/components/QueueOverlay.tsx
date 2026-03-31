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
import { DialogOverlay } from "~components/ui"
import { formatShortcut, normalizeShortcutBinding } from "~constants/shortcuts"
import type { QueueDispatcher } from "~core/queue-dispatcher"
import { useSettingsStore } from "~stores/settings-store"
import { useQueueItems, useQueueStore } from "~stores/queue-store"
import { t } from "~utils/i18n"
import { showToast } from "~utils/toast"

import "~styles/queue-overlay.css"

interface QueueOverlayProps {
  adapter: SiteAdapter
  dispatcher: QueueDispatcher
}

type QueueBatchSplitMode = "line" | "delimiter"

const BATCH_PREVIEW_LIMIT = 5

const normalizeBatchInput = (input: string) => input.replace(/\r\n?/g, "\n")

const decodeQueueDelimiter = (delimiter: string) =>
  delimiter.replace(/\\(\\|n|r|t)/g, (_match, token: string) => {
    switch (token) {
      case "n":
        return "\n"
      case "r":
        return "\r"
      case "t":
        return "\t"
      case "\\":
        return "\\"
      default:
        return token
    }
  })

const parseQueueBatchInput = (
  input: string,
  splitMode: QueueBatchSplitMode,
  delimiter: string,
): string[] => {
  const normalizedInput = normalizeBatchInput(input)
  const normalizedDelimiter = normalizeBatchInput(decodeQueueDelimiter(delimiter))

  const segments =
    splitMode === "line"
      ? normalizedInput.split("\n")
      : normalizedDelimiter
        ? normalizedInput.split(normalizedDelimiter)
        : []

  return segments.map((item) => item.trim()).filter(Boolean)
}

export const QueueOverlay: React.FC<QueueOverlayProps> = ({ adapter, dispatcher }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false)
  const [batchInputValue, setBatchInputValue] = useState("")
  const [batchSplitMode, setBatchSplitMode] = useState<QueueBatchSplitMode>("line")
  const [batchDelimiter, setBatchDelimiter] = useState("")
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [position, setPosition] = useState<{
    bottom: number
    right: number
    width: number
  } | null>(null)

  const items = useQueueItems()
  const store = useQueueStore()
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

  const shortcutText = React.useMemo(() => {
    if (queueBinding === null) return ""
    const isMac = navigator.userAgent.toLowerCase().includes("mac")
    if (queueBinding) {
      const normalizedBinding = normalizeShortcutBinding(queueBinding)
      return normalizedBinding ? formatShortcut(normalizedBinding, isMac) : ""
    }
    return isMac ? "⌥J" : "Alt+J"
  }, [queueBinding])

  const batchPreviewItems = React.useMemo(
    () => parseQueueBatchInput(batchInputValue, batchSplitMode, batchDelimiter),
    [batchDelimiter, batchInputValue, batchSplitMode],
  )

  // ==================== 位置计算 ====================

  const updatePosition = useCallback(() => {
    const inputEl = adapter.getTextareaElement()

    if (!inputEl) {
      setPosition(null)
      return
    }

    const rect = inputEl.getBoundingClientRect()

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
    const bottomPos = window.innerHeight - rect.top + 12

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
  }, [adapter])

  // ResizeObserver 精准监听输入框位置/大小变化
  useEffect(() => {
    updatePosition()

    let observer: ResizeObserver | null = null
    let targetEl: Element | null = null

    const initObserver = () => {
      targetEl = adapter.getTextareaElement()

      if (targetEl) {
        observer = new ResizeObserver(() => {
          updatePosition()
        })
        observer.observe(targetEl)
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
  }, [updatePosition, adapter])

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

  // 展开时聚焦输入框
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isExpanded])

  useEffect(() => {
    if (!isBatchDialogOpen) return
    const timeoutId = window.setTimeout(() => batchTextareaRef.current?.focus(), 60)
    return () => window.clearTimeout(timeoutId)
  }, [isBatchDialogOpen])

  // 点击外部关闭
  useEffect(() => {
    if (!isExpanded || isBatchDialogOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        handleSubmit()
      }
      if (e.key === "Escape") {
        e.stopPropagation()
        setIsExpanded(false)
      }
    },
    [handleSubmit],
  )

  const handleRemoveItem = useCallback(
    (id: string) => {
      store.remove(id)
    },
    [store],
  )

  const handleForceSend = useCallback(
    async (id: string, content: string) => {
      // 允许强行发送（插队）
      store.remove(id)
      const success = await dispatcher.sendImmediately(content, submitShortcut)
      if (!success) {
        // 如果失败再放回去（虽然可能顺序变了，但算作 fallback）
        store.enqueue(content)
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
    setBatchSplitMode("line")
    setBatchDelimiter("")
    setIsBatchDialogOpen(false)
  }, [])

  const handleBatchImportConfirm = useCallback(async () => {
    if (batchSplitMode === "delimiter" && !batchDelimiter.trim()) {
      showToast(t("queueBatchDelimiterRequired") || "请输入分隔符", 2500)
      return
    }

    if (batchPreviewItems.length === 0) {
      showToast(t("queueBatchImportEmpty") || "没有可导入的提示词", 2500)
      return
    }

    const importedItems = store.enqueueMany(batchPreviewItems)
    if (importedItems.length === 0) {
      showToast(t("queueBatchImportEmpty") || "没有可导入的提示词", 2500)
      return
    }

    if (!dispatcher.isRunning()) {
      dispatcher.start()
    }

    if (!adapter.isGenerating()) {
      await dispatcher.processNextNow()
    }

    showToast(
      t("queueBatchImportSuccess", { count: String(importedItems.length) }) ||
        `已导入 ${importedItems.length} 条提示词`,
      2500,
    )
    resetBatchImportState()
  }, [
    adapter,
    batchDelimiter,
    batchPreviewItems,
    batchSplitMode,
    dispatcher,
    resetBatchImportState,
    store,
  ])

  const handleEditClick = useCallback((id: string, content: string) => {
    setEditingItemId(id)
    setEditValue(content)
  }, [])

  const handleEditSave = useCallback(
    (id: string) => {
      if (editValue.trim()) {
        store.updateContent(id, editValue.trim())
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
  }, [inputValue, adjustTextareaHeight])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
  }, [])

  // ==================== 渲染 ====================

  if (!position) return null

  // 因为定位点(top, left)标志着组件要显示的右下角（紧贴输入框上方右侧）
  // 所以需要用 translate(-100%, -100%) 把组件从锚定点推上去靠左
  // 为了保证能读取到 CSS 主题变量，我们需要找到含有主题类名的容器
  // App 组件渲染内容在 .gh-root 下
  const targetContainer = document.querySelector(".gh-root") || document.body

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
      <div
        className="gh-queue-capsule"
        style={capsuleStyle}
        onClick={() => setIsExpanded(true)}
        title={shortcutText}>
        <span className="gh-queue-capsule-icon">
          <PromptQueueIcon size={15} color="currentColor" />
        </span>
        <span>
          {activeCount > 0 ? t("queueInQueue", { count: String(activeCount) }) : t("queueQuickAsk")}
        </span>
        {activeCount > 0 && <span className="gh-queue-capsule-badge">{activeCount}</span>}
      </div>,
      targetContainer,
    )
  }

  // 展开态：面板
  return (
    <>
      {createPortal(
        <div className="gh-queue-panel" style={panelStyle} ref={panelRef}>
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
              <button
                className="gh-queue-header-btn"
                onClick={() => setIsBatchDialogOpen(true)}
                title={t("queueBatchImport") || "批量导入"}>
                <ImportIcon size={16} color="currentColor" />
              </button>
              {displayCount > 0 && (
                <button
                  className="gh-queue-header-btn"
                  onClick={handleClearAll}
                  title={t("queueClearAll")}>
                  <CleanupIcon size={16} color="currentColor" />
                </button>
              )}
              <button
                className="gh-queue-header-btn"
                onClick={() => setIsExpanded(false)}
                title="Esc">
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
            </div>
          </div>

          {/* 队列列表 */}
          <div className="gh-queue-list">
            {items.filter((i) => i.status === "pending" || i.status === "sending").length === 0 ? (
              <div className="gh-queue-empty">{t("queueEmpty")}</div>
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
                            title={t("queueEditSave") || "保存"}>
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
                            title={t("queueEditCancel") || "取消"}>
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
                        <span className="gh-queue-item-content">{item.content}</span>
                        <div className="gh-queue-item-actions">
                          {item.status === "pending" && (
                            <button
                              className="gh-queue-item-edit"
                              onClick={() => handleEditClick(item.id, item.content)}
                              title={t("queueEdit") || "编辑"}>
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
                              onClick={() => handleForceSend(item.id, item.content)}
                              title={t("queueForceSend") || "Force Send"}>
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
                onKeyDown={handleKeyDown}
                placeholder={isGenerating ? t("queuePlaceholderBusy") : t("queuePlaceholderIdle")}
                rows={1}
              />
              <button
                className="gh-queue-send-btn"
                onClick={handleSubmit}
                disabled={!inputValue.trim()}
                title="Enter">
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
          <div className="gh-dialog-title">{t("queueBatchImportTitle") || "批量导入提示词"}</div>
          <div className="gh-dialog-message">
            {t("queueBatchImportDesc") || "粘贴多条提示词后，按所选规则拆分并加入队列。"}
          </div>

          <div className="gh-queue-batch-section">
            <div className="gh-queue-batch-label">
              {t("queueBatchSplitModeLabel") || "拆分方式"}
            </div>
            <div className="gh-queue-batch-mode-group">
              <button
                className="gh-queue-batch-mode-btn"
                data-active={batchSplitMode === "line"}
                onClick={() => setBatchSplitMode("line")}>
                {t("queueBatchSplitModeLine") || "按行拆分"}
              </button>
              <button
                className="gh-queue-batch-mode-btn"
                data-active={batchSplitMode === "delimiter"}
                onClick={() => setBatchSplitMode("delimiter")}>
                {t("queueBatchSplitModeDelimiter") || "自定义分隔符"}
              </button>
            </div>
          </div>

          {batchSplitMode === "delimiter" && (
            <div className="gh-queue-batch-section">
              <div className="gh-queue-batch-label">
                {t("queueBatchDelimiterLabel") || "分隔符"}
              </div>
              <input
                className="gh-dialog-input gh-queue-batch-delimiter-input"
                value={batchDelimiter}
                onChange={(e) => setBatchDelimiter(e.target.value)}
                placeholder={t("queueBatchDelimiterPlaceholder") || "例如：\\n、---"}
              />
            </div>
          )}

          <div className="gh-queue-batch-section">
            <div className="gh-queue-batch-label">{t("queueBatchInputLabel") || "批量内容"}</div>
            <textarea
              ref={batchTextareaRef}
              className="gh-queue-batch-textarea"
              value={batchInputValue}
              onChange={(e) => setBatchInputValue(e.target.value)}
              placeholder={
                t("queueBatchInputPlaceholder") || "粘贴多条提示词，每条按规则拆分后入队"
              }
            />
          </div>

          <div className="gh-queue-batch-preview">
            <div className="gh-queue-batch-preview-header">
              <span>{t("queueBatchPreviewTitle") || "预览"}</span>
              <span>
                {t("queueBatchPreviewCount", { count: String(batchPreviewItems.length) }) ||
                  `将导入 ${batchPreviewItems.length} 条`}
              </span>
            </div>

            <div className="gh-queue-batch-preview-body">
              {batchPreviewItems.length === 0 ? (
                <div className="gh-queue-batch-preview-empty">
                  {t("queueBatchPreviewEmpty") || "暂无可导入内容"}
                </div>
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
                      }) || `还有 ${batchPreviewItems.length - BATCH_PREVIEW_LIMIT} 条未展示`}
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
              {t("cancel") || "取消"}
            </button>
            <button
              className="gh-dialog-btn gh-dialog-btn-primary"
              onClick={() => void handleBatchImportConfirm()}
              disabled={
                batchPreviewItems.length === 0 ||
                (batchSplitMode === "delimiter" && !batchDelimiter.trim())
              }>
              {t("queueBatchImportAction") || "导入队列"}
            </button>
          </div>
        </DialogOverlay>
      )}
    </>
  )
}
