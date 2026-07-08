/**
 * Queue Dispatcher - 队列调度引擎
 *
 * 负责在 AI 空闲时自动从队列中取出提示词并发送。
 * 使用防抖机制：连续 2 秒检测到 isGenerating() === false 才触发发送。
 */

import type { SiteAdapter } from "~adapters/base"
import { PollingTaskRegistry } from "~core/polling-task-registry"
import type { PromptManager } from "~core/prompt-manager"
import {
  appendQuickQuoteMarker,
  rememberQuickQuoteReferenceForContent,
  stripQuickQuoteMarkers,
} from "~core/quick-quote-marker"
import { useSettingsStore } from "~stores/settings-store"
import type { QueueItem } from "~stores/queue-store"
import { useQueueStore } from "~stores/queue-store"

export class QueueDispatcher {
  private adapter: SiteAdapter
  private promptManager: PromptManager
  private readonly pollingTasks = new PollingTaskRegistry()
  private idleCount = 0 // 连续空闲计数
  private isDispatching = false
  private postSubmitWaitPromise: Promise<void> | null = null
  private readonly IDLE_THRESHOLD = 2 // 需要连续 N 次检测到空闲才发送
  private readonly POLL_TASK_NAME = "queue-dispatcher"
  private readonly POLL_INTERVAL = 1000 // 轮询间隔 (ms)
  private readonly POST_SUBMIT_MIN_WAIT_MS = 2500
  private readonly POST_SUBMIT_QUIET_MS = 2500
  private readonly GENERATION_START_GRACE_MS = 8000
  private readonly POST_SUBMIT_MAX_WAIT_MS = 10 * 60 * 1000

  constructor(adapter: SiteAdapter, promptManager: PromptManager) {
    this.adapter = adapter
    this.promptManager = promptManager
  }

  /**
   * 启动调度循环
   */
  start(): void {
    if (this.isRunning()) return // 已在运行
    this.idleCount = 0
    this.pollingTasks.start({
      name: this.POLL_TASK_NAME,
      intervalMs: this.POLL_INTERVAL,
      runWhenHidden: true,
      run: () => this.tick(),
    })
  }

  /**
   * 停止调度循环
   */
  stop(): void {
    this.pollingTasks.stop(this.POLL_TASK_NAME)
    this.idleCount = 0
  }

  /**
   * 检查是否正在运行
   */
  isRunning(): boolean {
    return this.pollingTasks.isRunning(this.POLL_TASK_NAME)
  }

  /**
   * 每秒执行的轮询逻辑
   */
  private async tick(): Promise<void> {
    if (this.isDispatching) return
    if (this.postSubmitWaitPromise) return

    const state = useQueueStore.getState()

    if (state.isPaused) {
      this.idleCount = 0
      return
    }

    // 如果有正在发送的，优先恢复这条，不允许继续消费后续步骤。
    const sendingItems = state.items.filter((i) => i.status === "sending")
    if (sendingItems.length > 0) {
      await this.recoverSendingItem(sendingItems[0])
      return
    }

    // 如果队列为空，重置计数
    const pendingItems = state.items.filter((i) => i.status === "pending")
    if (pendingItems.length === 0) {
      this.idleCount = 0
      return
    }

    // 输入框已有内容时不从队列取下一条，避免覆盖用户输入或上一条未成功发送的内容。
    if (this.promptManager.hasEditorContent()) {
      this.idleCount = 0
      return
    }

    // 检测 AI 是否正在生成
    const isGenerating = this.adapter.isGenerating()

    if (isGenerating) {
      // AI 正在生成，重置空闲计数
      this.idleCount = 0
      return
    }

    // AI 空闲，增加空闲计数
    this.idleCount++

    // 防抖：连续 N 次检测到空闲才发送
    if (this.idleCount >= this.IDLE_THRESHOLD) {
      this.idleCount = 0
      await this.dispatchNext()
    }
  }

  /**
   * 从队列头部取出一条提示词并发送
   */
  private async dispatchNext(): Promise<void> {
    if (this.isDispatching) return

    const store = useQueueStore.getState()
    const item = store.dequeue()
    if (!item) return

    this.isDispatching = true
    try {
      // 二次确认：插入前再次检查 AI 是否真的空闲
      // 防止从 tick() 到这里的时间差内 AI 开始生成
      if (this.adapter.isGenerating()) {
        // AI 已经在生成了，把项目放回队列
        store.updateStatus(item.id, "pending")
        this.idleCount = 0
        return
      }

      // 发送内容必须携带 quick quote marker，刷新后才能从站点消息自身恢复锚点。
      // 同时登记纯正文，作为 AI Studio 等站点发送后改写/移除 marker 的当前页 fallback。
      const visibleContent = stripQuickQuoteMarkers(item.content)
      rememberQuickQuoteReferenceForContent(visibleContent, item.metadata?.quoteRef)
      const markerKind = item.metadata?.quoteMarkerKind
      const contentToSend = appendQuickQuoteMarker(
        item.content,
        item.metadata?.quoteRef,
        markerKind ? { kind: markerKind } : undefined,
      )
      const insertOk = await this.promptManager.insertPrompt(contentToSend)
      if (!insertOk) {
        store.updateStatus(item.id, "failed")
        return
      }

      // 检查 runMode
      const runMode = item.metadata?.runMode ?? "enqueue"

      // "insert" 模式：只插入不发送
      if (runMode === "insert") {
        this.completeItem(item.id)
        return
      }

      // "enqueue" 或 "send-or-queue" 模式：插入后自动发送
      // 获取当前用户的快捷键设置
      const submitShortcut =
        useSettingsStore.getState().settings.features?.prompts?.submitShortcut ?? "enter"

      // 提交发送
      const submitOk = await this.promptManager.submitPrompt(submitShortcut)
      if (!submitOk) {
        // 插入后确认超时分两类：内容仍在编辑器中才保留 sending 等待重试；
        // 编辑器已清空通常表示站点已接收，只是确认窗口太短。
        if (this.isItemContentInEditor(item)) {
          store.updateStatus(item.id, "sending")
        } else {
          this.completeItem(item.id)
          this.startPostSubmitWait()
        }
        this.idleCount = 0
        return
      }

      // 发送已经确认，先从队列 UI 中移除；调度器内部继续等待回复结束后再释放下一条。
      this.completeItem(item.id)
      this.startPostSubmitWait()
    } catch (error) {
      console.error("[QueueDispatcher] 发送失败:", error)
      store.updateStatus(item.id, this.isItemContentInEditor(item) ? "sending" : "pending")
      this.idleCount = 0
    } finally {
      this.isDispatching = false
    }
  }

  private normalizeContent(content: string): string {
    return content
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  }

  private isItemContentInEditor(item: QueueItem): boolean {
    const editorContent = this.normalizeContent(this.promptManager.getCurrentEditorContent())
    if (!editorContent) return false

    const itemContent = this.normalizeContent(item.content)
    const visibleItemContent = this.normalizeContent(stripQuickQuoteMarkers(item.content))

    return [itemContent, visibleItemContent].some(
      (content) =>
        content &&
        (editorContent === content ||
          editorContent.includes(content) ||
          content.includes(editorContent)),
    )
  }

  private completeItem(itemId: string): void {
    const store = useQueueStore.getState()
    store.updateStatus(itemId, "sent")
    store.remove(itemId)
  }

  private async recoverSendingItem(item: QueueItem): Promise<void> {
    if (this.adapter.isGenerating()) {
      this.idleCount = 0
      return
    }

    if (!this.isItemContentInEditor(item)) {
      // 输入框已清空或内容已被用户处理，避免永久卡在 sending。
      this.completeItem(item.id)
      this.idleCount = 0
      return
    }

    this.idleCount++
    if (this.idleCount < this.IDLE_THRESHOLD) return

    this.idleCount = 0
    this.isDispatching = true
    try {
      const submitShortcut =
        useSettingsStore.getState().settings.features?.prompts?.submitShortcut ?? "enter"
      const rawEditorContent = this.promptManager.getCurrentEditorContent()
      const markerKind = item.metadata?.quoteMarkerKind
      const editorContent = appendQuickQuoteMarker(
        rawEditorContent,
        item.metadata?.quoteRef,
        markerKind ? { kind: markerKind } : undefined,
      )
      rememberQuickQuoteReferenceForContent(
        stripQuickQuoteMarkers(editorContent),
        item.metadata?.quoteRef,
      )

      if (editorContent && editorContent !== rawEditorContent.trim()) {
        await this.promptManager.insertPrompt(editorContent)
      }

      const submitOk = await this.promptManager.submitPrompt(submitShortcut)

      if (!submitOk) return

      this.completeItem(item.id)
      this.startPostSubmitWait()
    } catch (error) {
      console.error("[QueueDispatcher] 重试发送失败:", error)
    } finally {
      this.isDispatching = false
    }
  }

  private getConversationActivitySignature(): string {
    const responseSelector = this.adapter.getResponseContainerSelector()
    let root: ParentNode | Element | null = this.adapter.getScrollContainer()

    if (!root && responseSelector) {
      try {
        root = document.querySelector(responseSelector)
      } catch {
        root = null
      }
    }

    const element = root instanceof Element ? root : document.body
    const text = element.textContent || ""
    return `${text.length}:${text.slice(Math.max(0, text.length - 400))}`
  }

  private async waitForConversationIdleAfterSubmit(): Promise<void> {
    const startedAt = Date.now()
    let lastActivityAt = startedAt
    let lastSignature = this.getConversationActivitySignature()
    let sawGenerating = this.adapter.isGenerating()

    while (Date.now() - startedAt < this.POST_SUBMIT_MAX_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, 500))

      const now = Date.now()
      const isGenerating = this.adapter.isGenerating()
      if (isGenerating) {
        sawGenerating = true
        lastActivityAt = now
      }

      const signature = this.getConversationActivitySignature()
      if (signature !== lastSignature) {
        lastSignature = signature
        lastActivityAt = now
      }

      const waited = now - startedAt
      const quietFor = now - lastActivityAt
      const generationWasObservable = sawGenerating || waited >= this.GENERATION_START_GRACE_MS

      if (
        waited >= this.POST_SUBMIT_MIN_WAIT_MS &&
        quietFor >= this.POST_SUBMIT_QUIET_MS &&
        !isGenerating &&
        generationWasObservable
      ) {
        return
      }
    }
  }

  private startPostSubmitWait(): void {
    if (this.postSubmitWaitPromise) return

    this.postSubmitWaitPromise = this.waitForConversationIdleAfterSubmit()
      .catch((error) => {
        console.error("[QueueDispatcher] 等待回复结束失败:", error)
      })
      .finally(() => {
        this.postSubmitWaitPromise = null
        this.idleCount = 0
      })
  }

  /**
   * 立即发送一条提示词（不入队，直接发送）
   * 用于 AI 空闲时的直接发送场景
   */
  async sendImmediately(
    content: string,
    submitShortcut?: "enter" | "ctrlEnter",
    metadata?: QueueItem["metadata"],
  ): Promise<boolean> {
    try {
      const visibleContent = stripQuickQuoteMarkers(content)
      rememberQuickQuoteReferenceForContent(visibleContent, metadata?.quoteRef)
      const markerKind = metadata?.quoteMarkerKind
      const contentToSend = appendQuickQuoteMarker(
        content,
        metadata?.quoteRef,
        markerKind ? { kind: markerKind } : undefined,
      )
      const insertOk = await this.promptManager.insertPrompt(contentToSend)
      if (!insertOk) return false

      const submitOk = await this.promptManager.submitPrompt(submitShortcut)
      return submitOk
    } catch (error) {
      console.error("[QueueDispatcher] 立即发送失败:", error)
      return false
    }
  }

  /**
   * 当 AI 当前空闲时，立即处理一条队列任务，不等待轮询防抖。
   */
  async processNextNow(): Promise<boolean> {
    const state = useQueueStore.getState()

    if (state.isPaused) return false
    if (this.isDispatching) return false
    if (this.postSubmitWaitPromise) return false
    if (this.adapter.isGenerating()) return false
    if (this.promptManager.hasEditorContent()) return false

    const hasSending = state.items.some((item) => item.status === "sending")
    if (hasSending) return false

    const hasPending = state.items.some((item) => item.status === "pending")
    if (!hasPending) return false

    this.idleCount = 0
    await this.dispatchNext()
    return true
  }
}
