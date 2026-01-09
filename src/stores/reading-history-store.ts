/**
 * Reading History Store - Zustand 状态管理
 *
 * 管理阅读历史（滚动位置记录）
 */

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { chromeStorageAdapter } from "./chrome-adapter"

// ==================== 类型定义 ====================

export interface ReadingPosition {
  top: number
  ts: number
  type?: "selector" | "index"
  selector?: string
  textSignature?: string
  index?: number
  offset?: number
  scrollHeight?: number // 保存时的容器高度
}

// ==================== Store 类型定义 ====================

interface ReadingHistoryState {
  // 状态
  history: Record<string, ReadingPosition>
  lastCleanupRun: number
  _hasHydrated: boolean

  // Actions
  savePosition: (key: string, position: ReadingPosition) => void
  getPosition: (key: string) => ReadingPosition | undefined
  cleanup: (days: number) => void
  setHasHydrated: (state: boolean) => void
}

// ==================== Store 创建 ====================

export const useReadingHistoryStore = create<ReadingHistoryState>()(
  persist(
    (set, get) => ({
      history: {},
      lastCleanupRun: 0,
      _hasHydrated: false,

      savePosition: (key, position) =>
        set((state) => ({
          history: { ...state.history, [key]: position },
        })),

      getPosition: (key) => {
        return get().history[key]
      },

      cleanup: (days) => {
        if (days === -1) return // 禁用清理

        const now = Date.now()
        const state = get()

        // 每天最多清理一次
        if (now - state.lastCleanupRun < 24 * 60 * 60 * 1000) return

        const expireTime = days * 24 * 60 * 60 * 1000
        const newHistory: Record<string, ReadingPosition> = {}
        let changed = false

        for (const [key, pos] of Object.entries(state.history)) {
          if (now - pos.ts <= expireTime) {
            newHistory[key] = pos
          } else {
            changed = true
          }
        }

        if (changed) {
          set({ history: newHistory, lastCleanupRun: now })
        } else {
          set({ lastCleanupRun: now })
        }
      },

      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: "readingHistory", // chrome.storage key
      storage: createJSONStorage(() => chromeStorageAdapter),
      partialize: (state) => ({
        history: state.history,
        lastCleanupRun: state.lastCleanupRun,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)

// ==================== 便捷 Hooks ====================

export const useReadingHistoryHydrated = () => useReadingHistoryStore((state) => state._hasHydrated)

// ==================== 非 React 环境使用 ====================

export const getReadingHistoryStore = () => useReadingHistoryStore.getState()
