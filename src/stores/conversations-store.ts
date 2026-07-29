/**
 * Conversations Store - Zustand 状态管理
 *
 * 管理会话元数据（不包含会话内容，只有标题、文件夹、标签等元信息）
 */

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type { Conversation } from "~core/conversation/types"
import { createSiteScopedStorageKey, resolvePersistedSiteInstanceKey } from "~utils/site-identity"

import { chromeStorageAdapter } from "./chrome-adapter"

// ==================== Store 类型定义 ====================

interface ConversationUpdateEntry {
  id: string
  updates: Partial<Conversation>
}

interface ConversationBatchChanges {
  upserts?: Conversation[]
  updates?: ConversationUpdateEntry[]
  deleteIds?: string[]
  lastUsedFolderId?: string
}

interface PersistedConversationsState {
  conversations?: Record<string, unknown>
  lastUsedFolderId?: unknown
}

export interface ConversationsMigrationResult {
  state: PersistedConversationsState
  warnings: string[]
}

interface ConversationsState {
  // 状态
  conversations: Record<string, Conversation>
  lastUsedFolderId: string
  _hasHydrated: boolean

  // Actions
  addConversation: (conv: Conversation) => void
  updateConversation: (id: string, updates: Partial<Conversation>) => void
  deleteConversation: (id: string) => void
  applyConversationChanges: (changes: ConversationBatchChanges) => void
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
export const CONVERSATIONS_STORAGE_SCHEMA_VERSION = 1

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const getConversationUpdatedAt = (value: unknown): number => {
  if (!isRecord(value)) return 0
  return typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
    ? value.updatedAt
    : 0
}

const getConversationStorageKey = (conversation: Conversation): string => {
  const siteInstanceKey = resolvePersistedSiteInstanceKey(conversation)
  if (!siteInstanceKey) {
    throw new Error(`Conversation ${conversation.id} is missing a resolvable site instance key`)
  }
  return createSiteScopedStorageKey(siteInstanceKey, conversation.id)
}

export const migrateConversationsStorageState = (
  persistedState: unknown,
): ConversationsMigrationResult => {
  if (!isRecord(persistedState)) {
    return { state: {}, warnings: [] }
  }

  const source = persistedState as PersistedConversationsState
  if (!isRecord(source.conversations)) {
    return { state: source, warnings: [] }
  }

  const conversations: Record<string, unknown> = {}
  const warnings: string[] = []

  Object.entries(source.conversations).forEach(([legacyStorageKey, value]) => {
    if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0) {
      conversations[legacyStorageKey] = value
      warnings.push(`Preserved invalid conversation record at ${legacyStorageKey}`)
      return
    }

    const siteInstanceKey = resolvePersistedSiteInstanceKey({
      siteId: typeof value.siteId === "string" ? value.siteId : null,
      siteInstanceKey: typeof value.siteInstanceKey === "string" ? value.siteInstanceKey : null,
      url: typeof value.url === "string" ? value.url : null,
    })

    if (!siteInstanceKey) {
      conversations[legacyStorageKey] = value
      warnings.push(`Preserved unresolved conversation record at ${legacyStorageKey}`)
      return
    }

    const nextConversation = { ...value, siteInstanceKey }
    const storageKey = createSiteScopedStorageKey(siteInstanceKey, value.id)
    const existing = conversations[storageKey]

    if (
      !existing ||
      getConversationUpdatedAt(nextConversation) >= getConversationUpdatedAt(existing)
    ) {
      conversations[storageKey] = nextConversation
    }
    if (existing) {
      warnings.push(`Resolved duplicate conversation storage key ${storageKey}`)
    }
  })

  return {
    state: {
      ...source,
      conversations,
    },
    warnings,
  }
}

export const getConversationsForSiteInstance = (
  conversations: Record<string, Conversation>,
  siteInstanceKey: string,
): Record<string, Conversation> => {
  const result: Record<string, Conversation> = {}

  Object.values(conversations).forEach((conversation) => {
    if (resolvePersistedSiteInstanceKey(conversation) !== siteInstanceKey) return

    const existing = result[conversation.id]
    if (!existing || (conversation.updatedAt || 0) >= (existing.updatedAt || 0)) {
      result[conversation.id] = conversation
    }
  })

  return result
}

export const useConversationsStore = create<ConversationsState>()(
  persist(
    (set, get) => (
      (_completeHydration = () => set({ _hasHydrated: true })),
      {
        conversations: {},
        lastUsedFolderId: "inbox",
        _hasHydrated: false,

        addConversation: (conv) =>
          set((state) => {
            const storageKey = getConversationStorageKey(conv)
            return {
              conversations: { ...state.conversations, [storageKey]: conv },
            }
          }),

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

        applyConversationChanges: ({ upserts, updates, deleteIds, lastUsedFolderId }) =>
          set((state) => {
            let conversations = state.conversations
            let changed = false
            const updatedAt = Date.now()

            const ensureWritableConversations = () => {
              if (conversations === state.conversations) {
                conversations = { ...state.conversations }
              }
              return conversations
            }

            deleteIds?.forEach((id) => {
              if (!conversations[id]) return
              const nextConversations = ensureWritableConversations()
              delete nextConversations[id]
              changed = true
            })

            updates?.forEach(({ id, updates: conversationUpdates }) => {
              const existing = conversations[id]
              if (!existing) return
              const nextConversations = ensureWritableConversations()
              nextConversations[id] = { ...existing, ...conversationUpdates, updatedAt }
              changed = true
            })

            upserts?.forEach((conversation) => {
              const nextConversations = ensureWritableConversations()
              nextConversations[getConversationStorageKey(conversation)] = conversation
              changed = true
            })

            const nextState: Partial<ConversationsState> = {}
            if (changed) {
              nextState.conversations = conversations
            }
            if (lastUsedFolderId && lastUsedFolderId !== state.lastUsedFolderId) {
              nextState.lastUsedFolderId = lastUsedFolderId
            }

            return Object.keys(nextState).length > 0 ? nextState : state
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
      version: CONVERSATIONS_STORAGE_SCHEMA_VERSION,
      migrate: (persistedState, version) => {
        if (version > CONVERSATIONS_STORAGE_SCHEMA_VERSION) {
          throw new Error(`Unsupported conversations storage schema: ${version}`)
        }

        const migration = migrateConversationsStorageState(persistedState)
        migration.warnings.forEach((warning) => {
          console.warn(`[Ophel] ${warning}`)
        })
        return migration.state as ConversationsState
      },
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
