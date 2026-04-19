/**
 * Tags Store - Zustand 状态管理
 *
 * 管理会话标签列表
 */

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type { Tag } from "~utils/storage"

import { chromeStorageAdapter } from "./chrome-adapter"

// ==================== Store 类型定义 ====================

interface TagsState {
  // 状态
  tags: Tag[]
  _hasHydrated: boolean

  // Actions
  addTag: (name: string, color: string) => Tag | null
  updateTag: (tagId: string, name: string, color: string) => Tag | null
  deleteTag: (tagId: string) => void
  setHasHydrated: (state: boolean) => void
}

// ==================== Store 创建 ====================

// Captured set for safe hydration (avoids referencing store variable before assignment in sync hydration)
let _completeHydration: (() => void) | null = null

export const useTagsStore = create<TagsState>()(
  persist(
    (set, get) => (
      (_completeHydration = () => set({ _hasHydrated: true })),
      {
        tags: [],
        _hasHydrated: false,

        addTag: (name, color) => {
          const state = get()
          // 检查重复
          const exists = state.tags.some((t) => t.name.toLowerCase() === name.toLowerCase())
          if (exists) return null

          const newTag: Tag = {
            id: "tag_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
            name,
            color,
          }
          set((s) => ({
            tags: [...s.tags, newTag],
          }))
          return newTag
        },

        updateTag: (tagId, name, color) => {
          const state = get()
          // 检查重复（排除自己）
          const exists = state.tags.some(
            (t) => t.id !== tagId && t.name.toLowerCase() === name.toLowerCase(),
          )
          if (exists) return null

          let updatedTag: Tag | null = null
          set((s) => ({
            tags: s.tags.map((t) => {
              if (t.id === tagId) {
                updatedTag = { ...t, name, color }
                return updatedTag
              }
              return t
            }),
          }))
          return updatedTag
        },

        deleteTag: (tagId) =>
          set((state) => ({
            tags: state.tags.filter((t) => t.id !== tagId),
          })),

        setHasHydrated: (state) => set({ _hasHydrated: state }),
      }
    ),
    {
      name: "tags", // chrome.storage key
      storage: createJSONStorage(() => chromeStorageAdapter),
      partialize: (state) => ({ tags: state.tags }),
      onRehydrateStorage: () => () => {
        _completeHydration?.()
      },
    },
  ),
)

// ==================== 便捷 Hooks ====================

export const useTagsHydrated = () => useTagsStore((state) => state._hasHydrated)
export const useTags = () => useTagsStore((state) => state.tags)

// ==================== 非 React 环境使用 ====================

export const getTagsState = () => useTagsStore.getState().tags
export const getTagsStore = () => useTagsStore.getState()
