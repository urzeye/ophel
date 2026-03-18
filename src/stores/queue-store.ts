/**
 * Queue Store - Zustand 状态管理
 *
 * 管理提示词队列状态（纯内存，不持久化）
 * 预留 type 字段以支持未来扩展（收藏夹、快捷操作等）
 */

import { create } from "zustand"

// ==================== 类型定义 ====================

export interface QueueItem {
  id: string
  content: string
  createdAt: number
  status: "pending" | "sending" | "sent" | "failed"
  /** 预留扩展：队列项类型，默认 'prompt' */
  type?: "prompt" | "bookmark" | "shortcut"
}

interface QueueState {
  // 状态
  items: QueueItem[]
  isProcessing: boolean
  isPaused: boolean

  // Actions
  enqueue: (content: string) => QueueItem
  enqueueMany: (contents: string[]) => QueueItem[]
  dequeue: () => QueueItem | null
  remove: (id: string) => void
  updateContent: (id: string, content: string) => void
  updateStatus: (id: string, status: QueueItem["status"]) => void
  clear: () => void
  pause: () => void
  resume: () => void
}

// ==================== Store 创建 ====================

const createQueueItem = (content: string): QueueItem => ({
  id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  content,
  createdAt: Date.now(),
  status: "pending",
  type: "prompt",
})

export const useQueueStore = create<QueueState>()((set, get) => ({
  items: [],
  isProcessing: false,
  isPaused: false,

  enqueue: (content) => {
    const item = createQueueItem(content)
    set((state) => ({
      items: [...state.items, item],
    }))
    return item
  },

  enqueueMany: (contents) => {
    const items = contents
      .map((content) => content.trim())
      .filter(Boolean)
      .map((content) => createQueueItem(content))

    if (items.length === 0) return []

    set((state) => ({
      items: [...state.items, ...items],
    }))

    return items
  },

  dequeue: () => {
    const { items } = get()
    const next = items.find((item) => item.status === "pending")
    if (!next) return null
    set((state) => ({
      items: state.items.map((item) =>
        item.id === next.id ? { ...item, status: "sending" as const } : item,
      ),
      isProcessing: true,
    }))
    return next
  },

  remove: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),

  updateContent: (id, content) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, content } : item)),
    })),

  updateStatus: (id, status) =>
    set((state) => {
      const newItems = state.items.map((item) => (item.id === id ? { ...item, status } : item))
      // 如果没有 pending 或 sending 的了，标记为非处理中
      const hasActive = newItems.some(
        (item) => item.status === "pending" || item.status === "sending",
      )
      return { items: newItems, isProcessing: hasActive }
    }),

  clear: () => set({ items: [], isProcessing: false }),

  pause: () => set({ isPaused: true }),

  resume: () => set({ isPaused: false }),
}))

// ==================== 便捷 Hooks ====================

export const useQueueItems = () => useQueueStore((state) => state.items)
export const usePendingCount = () =>
  useQueueStore((state) => state.items.filter((i) => i.status === "pending").length)
export const useQueueProcessing = () => useQueueStore((state) => state.isProcessing)

// ==================== 非 React 环境使用 ====================

export const getQueueState = () => useQueueStore.getState()
export const getQueueStore = () => useQueueStore.getState()
