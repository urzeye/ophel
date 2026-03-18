/**
 * Queue Dispatcher - 队列调度引擎
 *
 * 负责在 AI 空闲时自动从队列中取出提示词并发送。
 * 使用防抖机制：连续 2 秒检测到 isGenerating() === false 才触发发送。
 */

import type { SiteAdapter } from "~adapters/base"
import type { PromptManager } from "~core/prompt-manager"
import { useSettingsStore } from "~stores/settings-store"
import { useQueueStore } from "~stores/queue-store"

export class QueueDispatcher {
  private adapter: SiteAdapter
  private promptManager: PromptManager
  private intervalId: ReturnType<typeof setInterval> | null = null
  private idleCount = 0 // 连续空闲计数
  private readonly IDLE_THRESHOLD = 2 // 需要连续 N 次检测到空闲才发送
  private readonly POLL_INTERVAL = 1000 // 轮询间隔 (ms)

  constructor(adapter: SiteAdapter, promptManager: PromptManager) {
    this.adapter = adapter
    this.promptManager = promptManager
  }

  /**
   * 启动调度循环
   */
  start(): void {
    if (this.intervalId) return // 已在运行
    this.idleCount = 0
    this.intervalId = setInterval(() => this.tick(), this.POLL_INTERVAL)
  }

  /**
   * 停止调度循环
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.idleCount = 0
  }

  /**
   * 检查是否正在运行
   */
  isRunning(): boolean {
    return this.intervalId !== null
  }

  /**
   * 每秒执行的轮询逻辑
   */
  private async tick(): Promise<void> {
    const state = useQueueStore.getState()

    // 如果队列为空或已暂停，重置计数
    const pendingItems = state.items.filter((i) => i.status === "pending")
    if (pendingItems.length === 0 || state.isPaused) {
      this.idleCount = 0
      return
    }

    // 如果有正在发送的，等待它完成
    const sendingItems = state.items.filter((i) => i.status === "sending")
    if (sendingItems.length > 0) {
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
    const store = useQueueStore.getState()
    const item = store.dequeue()
    if (!item) return

    try {
      // 插入提示词到输入框
      const insertOk = await this.promptManager.insertPrompt(item.content)
      if (!insertOk) {
        store.updateStatus(item.id, "failed")
        return
      }

      // 获取当前用户的快捷键设置
      const submitShortcut =
        useSettingsStore.getState().settings.features?.prompts?.submitShortcut ?? "enter"

      // 提交发送
      const submitOk = await this.promptManager.submitPrompt(submitShortcut)
      if (!submitOk) {
        store.updateStatus(item.id, "failed")
        return
      }

      // 发送成功
      store.updateStatus(item.id, "sent")
    } catch (error) {
      console.error("[QueueDispatcher] 发送失败:", error)
      store.updateStatus(item.id, "failed")
    }
  }

  /**
   * 立即发送一条提示词（不入队，直接发送）
   * 用于 AI 空闲时的直接发送场景
   */
  async sendImmediately(content: string, submitShortcut?: "enter" | "ctrlEnter"): Promise<boolean> {
    try {
      const insertOk = await this.promptManager.insertPrompt(content)
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
    if (this.adapter.isGenerating()) return false

    const hasSending = state.items.some((item) => item.status === "sending")
    if (hasSending) return false

    const hasPending = state.items.some((item) => item.status === "pending")
    if (!hasPending) return false

    this.idleCount = 0
    await this.dispatchNext()
    return true
  }
}
