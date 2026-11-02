/**
 * Prompts Store - Zustand 状态管理
 *
 * 管理提示词列表
 */

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { getDefaultPrompts, VIRTUAL_CATEGORY } from "~constants"
import { getAllLocalizedTexts, initI18n } from "~utils/i18n"
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

// Captured set for safe hydration (avoids referencing store variable before assignment in sync hydration)
let _completeHydration: (() => void) | null = null

// 历史版本会把保存时的界面语言「未分类」文案写进 category（如"未分类"/"Uncategorized"），
// 切换语言后同一批提示词被拆进不同分组；统一归一为空串（未分类），展示层按当前语言渲染
const normalizeLegacyUncategorized = (prompts: Prompt[]): Prompt[] => {
  const legacyNames = new Set(getAllLocalizedTexts("uncategorized"))
  return prompts.map((p) =>
    p.category && legacyNames.has(p.category) ? { ...p, category: "" } : p,
  )
}

// 记录本次水合是否命中持久化数据：全新安装（无历史数据）需要在
// i18n 资源就绪后按当前语言补种默认提示词
let didRehydrateFromStorage = false

export const usePromptsStore = create<PromptsState>()(
  persist(
    (set, _get) => (
      (_completeHydration = () => set({ _hasHydrated: true })),
      {
        // 初始为兜底语言（en）的默认提示词（模块加载时语言资源可能尚未就绪）；
        // 全新安装会在水合完成后按当前语言重新播种，见 onRehydrateStorage
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

        // 默认回退为空串（未分类），展示层用 t("uncategorized") 按当前语言渲染；
        // 不能写入中文常量，否则非中文用户的数据里会混入中文字符串
        deleteCategory: (name, defaultCategory = "") =>
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
      }
    ),
    {
      name: "prompts", // chrome.storage key
      storage: createJSONStorage(() => chromeStorageAdapter),
      partialize: (state) => ({ prompts: state.prompts }),
      version: 1,
      migrate: (persistedState) => {
        // 旧版本（<1）数据原样保留；按语言归一「未分类」统一推迟到
        // i18n 资源就绪后处理（见 onRehydrateStorage），避免水合早于
        // 语言资源加载时漏掉非英文的历史文案
        return persistedState as { prompts?: Prompt[] } | undefined
      },
      merge: (persistedState, currentState) => {
        // zustand persist 无存储数据时也会调用 merge（persistedState 为 undefined），
        // 只有 persistedState 非空才算命中历史数据
        didRehydrateFromStorage = persistedState != null
        return {
          ...currentState,
          ...(persistedState as Partial<PromptsState> | undefined),
        }
      },
      onRehydrateStorage: () => () => {
        // 默认提示词播种与「未分类」归一都依赖完整语言资源
        // （getDefaultPrompts / getAllLocalizedTexts），等语言资源就绪后执行
        void initI18n().then(() => {
          const state = usePromptsStore.getState()
          const next = normalizeLegacyUncategorized(
            didRehydrateFromStorage ? state.prompts : getDefaultPrompts(),
          )
          // 内容未变化时不写回：zustand persist 对任何 setState 都会落盘，
          // 无条件写回会让每个页面加载都多一次无意义的存储写
          const unchanged =
            next.length === state.prompts.length &&
            next.every((prompt, index) => prompt === state.prompts[index])
          if (!unchanged) {
            usePromptsStore.setState({ prompts: next })
          }
          _completeHydration?.()
        })
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

/**
 * 判断提示词是否适用于给定的平台筛选集合
 * - 筛选集合为空：不过滤，全部通过
 * - 提示词未设置 platforms（通用）：始终通过
 * - 否则：只要命中任一被选平台即通过
 */
export const matchesPromptPlatform = (prompt: Prompt, selectedPlatforms: string[]): boolean => {
  if (selectedPlatforms.length === 0) return true
  if (!prompt.platforms?.length) return true
  return prompt.platforms.some((id) => selectedPlatforms.includes(id))
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
