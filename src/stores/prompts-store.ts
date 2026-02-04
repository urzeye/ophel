/**
 * Prompts Store - Zustand 状态管理
 *
 * 管理提示词列表
 */

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { getDefaultPrompts, VIRTUAL_CATEGORY } from "~constants"
import type { Prompt } from "~utils/storage"

import { chromeStorageAdapter } from "./chrome-adapter"

// ==================== Store 类型定义 ====================

interface PromptsState {
  // 状态
  prompts: Prompt[]
  _hasHydrated: boolean

  // Actions
  addPrompt: (data: Omit<Prompt, "id">) => Prompt
  updatePrompt: (id: string, data: Partial<Omit<Prompt, "id">>) => void
  deletePrompt: (id: string) => void
  renameCategory: (oldName: string, newName: string) => void
  deleteCategory: (name: string, defaultCategory?: string) => void
  updateOrder: (newOrderIds: string[]) => void
  togglePin: (id: string) => void // 新增：切换置顶状态
  updateLastUsed: (id: string) => void // 新增：更新最近使用时间
  setPrompts: (prompts: Prompt[]) => void // 新增：批量设置提示词（用于导入）
  setHasHydrated: (state: boolean) => void
}

// ==================== Store 创建 ====================

export const usePromptsStore = create<PromptsState>()(
  persist(
    (set, _get) => ({
      prompts: getDefaultPrompts(), // 使用国际化后的默认提示词
      _hasHydrated: false,

      addPrompt: (data) => {
        const newPrompt: Prompt = {
          id: "custom_" + Date.now(),
          ...data,
        }
        set((state) => ({
          prompts: [...state.prompts, newPrompt],
        }))
        return newPrompt
      },

      updatePrompt: (id, data) =>
        set((state) => ({
          prompts: state.prompts.map((p) => (p.id === id ? { ...p, ...data } : p)),
        })),

      deletePrompt: (id) =>
        set((state) => ({
          prompts: state.prompts.filter((p) => p.id !== id),
        })),

      renameCategory: (oldName, newName) =>
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.category === oldName ? { ...p, category: newName } : p,
          ),
        })),

      deleteCategory: (name, defaultCategory = "未分类") =>
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.category === name ? { ...p, category: defaultCategory } : p,
          ),
        })),

      updateOrder: (newOrderIds) =>
        set((state) => {
          const ordered: Prompt[] = []
          newOrderIds.forEach((id) => {
            const p = state.prompts.find((x) => x.id === id)
            if (p) ordered.push(p)
          })
          // 追加任何遗漏的项
          state.prompts.forEach((p) => {
            if (!ordered.find((x) => x.id === p.id)) ordered.push(p)
          })
          return { prompts: ordered }
        }),

      setHasHydrated: (state) => set({ _hasHydrated: state }),

      // 切换置顶状态
      togglePin: (id) =>
        set((state) => ({
          prompts: state.prompts.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p)),
        })),

      // 更新最近使用时间
      updateLastUsed: (id) =>
        set((state) => ({
          prompts: state.prompts.map((p) => (p.id === id ? { ...p, lastUsedAt: Date.now() } : p)),
        })),

      // 批量设置提示词（用于导入）
      setPrompts: (prompts) => set({ prompts }),
    }),
    {
      name: "prompts", // chrome.storage key
      storage: createJSONStorage(() => chromeStorageAdapter),
      partialize: (state) => ({ prompts: state.prompts }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)

// ==================== 便捷 Hooks ====================

export const usePromptsHydrated = () => usePromptsStore((state) => state._hasHydrated)
export const usePrompts = () => usePromptsStore((state) => state.prompts)

// ==================== 非 React 环境使用 ====================

export const getPromptsState = () => usePromptsStore.getState().prompts
export const getPromptsStore = () => usePromptsStore.getState()

// ==================== 辅助函数 ====================

export const getCategories = (): string[] => {
  const prompts = getPromptsState()
  const categories = new Set<string>()
  prompts.forEach((p) => {
    if (p.category) categories.add(p.category)
  })
  return Array.from(categories)
}

export const filterPrompts = (
  filter: string = "",
  category: string = VIRTUAL_CATEGORY.ALL,
): Prompt[] => {
  let filtered = getPromptsState()
  // 只在选择了真实分类时过滤
  if (category !== VIRTUAL_CATEGORY.ALL && category !== VIRTUAL_CATEGORY.RECENT) {
    filtered = filtered.filter((p) => p.category === category)
  }
  if (filter) {
    const lowerFilter = filter.toLowerCase()
    filtered = filtered.filter(
      (p) =>
        p.title.toLowerCase().includes(lowerFilter) ||
        p.content.toLowerCase().includes(lowerFilter),
    )
  }
  return filtered
}
