/**
 * Conversations Store - Zustand 状态管理
 *
 * 管理会话元数据（不包含会话内容，只有标题、文件夹、标签等元信息）
 */

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type { Conversation } from "~core/conversation/types"

import { chromeStorageAdapter } from "./chrome-adapter"

// ==================== Store 类型定义 ====================

interface ConversationsState {
  // 状态
  conversations: Record<string, Conversation>
  lastUsedFolderId: string
  _hasHydrated: boolean

  // Actions
  addConversation: (conv: Conversation) => void
  updateConversation: (id: string, updates: Partial<Conversation>) => void
  deleteConversation: (id: string) => void
  moveToFolder: (id: string, folderId: string) => void
  togglePin: (id: string) => boolean
  setConversationTags: (id: string, tagIds: string[]) => void
  removeTagFromAll: (tagId: string) => void
  moveConversationsToInbox: (folderId: string) => void
  setLastUsedFolderId: (folderId: string) => void
  setHasHydrated: (state: boolean) => void
}

// ==================== Store 创建 ====================

// Captured set for safe hydration (avoids referencing store variable before assignment in sync hydration)
let _completeHydration: (() => void) | null = null

export const useConversationsStore = create<ConversationsState>()(
  persist(
    (set, get) => (
      (_completeHydration = () => set({ _hasHydrated: true })),
      {
        conversations: {},
        lastUsedFolderId: "inbox",
        _hasHydrated: false,

        addConversation: (conv) =>
          set((state) => ({
            conversations: { ...state.conversations, [conv.id]: conv },
          })),

        updateConversation: (id, updates) =>
          set((state) => {
            if (!state.conversations[id]) return state
            return {
              conversations: {
                ...state.conversations,
                [id]: { ...state.conversations[id], ...updates, updatedAt: Date.now() },
              },
            }
          }),

        deleteConversation: (id) =>
          set((state) => {
            const { [id]: _, ...rest } = state.conversations
            return { conversations: rest }
          }),

        moveToFolder: (id, folderId) =>
          set((state) => {
            if (!state.conversations[id]) return state
            return {
              conversations: {
                ...state.conversations,
                [id]: { ...state.conversations[id], folderId, updatedAt: Date.now() },
              },
            }
          }),

        togglePin: (id) => {
          const state = get()
          if (!state.conversations[id]) return false
          const newPinned = !state.conversations[id].pinned
          set((s) => ({
            conversations: {
              ...s.conversations,
              [id]: { ...s.conversations[id], pinned: newPinned, updatedAt: Date.now() },
            },
          }))
          return newPinned
        },

        setConversationTags: (id, tagIds) =>
          set((state) => {
            if (!state.conversations[id]) return state
            const conv = { ...state.conversations[id] }
            if (tagIds.length > 0) {
              conv.tagIds = tagIds
            } else {
              delete conv.tagIds
            }
            return {
              conversations: { ...state.conversations, [id]: conv },
            }
          }),

        removeTagFromAll: (tagId) =>
          set((state) => {
            const updated: Record<string, Conversation> = {}
            let changed = false
            for (const [id, conv] of Object.entries(state.conversations)) {
              if (conv.tagIds?.includes(tagId)) {
                const newTagIds = conv.tagIds.filter((t) => t !== tagId)
                updated[id] = {
                  ...conv,
                  tagIds: newTagIds.length > 0 ? newTagIds : undefined,
                }
                changed = true
              } else {
                updated[id] = conv
              }
            }
            return changed ? { conversations: updated } : state
          }),

        moveConversationsToInbox: (folderId) =>
          set((state) => {
            const updated: Record<string, Conversation> = {}
            let changed = false
            for (const [id, conv] of Object.entries(state.conversations)) {
              if (conv.folderId === folderId) {
                updated[id] = { ...conv, folderId: "inbox" }
                changed = true
              } else {
                updated[id] = conv
              }
            }
            return changed ? { conversations: updated } : state
          }),

        setLastUsedFolderId: (folderId) => set({ lastUsedFolderId: folderId }),

        setHasHydrated: (state) => set({ _hasHydrated: state }),
      }
    ),
    {
      name: "conversations", // chrome.storage key
      storage: createJSONStorage(() => chromeStorageAdapter),
      partialize: (state) => ({
        conversations: state.conversations,
        lastUsedFolderId: state.lastUsedFolderId,
      }),
      onRehydrateStorage: () => () => {
        _completeHydration?.()
      },
    },
  ),
)

// ==================== 便捷 Hooks ====================

export const useConversationsHydrated = () => useConversationsStore((state) => state._hasHydrated)
export const useConversations = () => useConversationsStore((state) => state.conversations)
export const useLastUsedFolderId = () => useConversationsStore((state) => state.lastUsedFolderId)

// ==================== 非 React 环境使用 ====================

export const getConversationsState = () => useConversationsStore.getState().conversations
export const getConversationsStore = () => useConversationsStore.getState()
