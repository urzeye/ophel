/**
 * Claude SessionKeys Store - Zustand 状态管理
 *
 * 管理Claude SessionKey列表和当前使用的Token
 */

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type { ClaudeSessionKey, ClaudeSessionKeysState } from "~utils/storage"

import { chromeStorageAdapter } from "./chrome-adapter"

// ==================== Store 类型定义 ====================

interface SessionKeysStore extends ClaudeSessionKeysState {
  _hasHydrated: boolean

  // Actions
  addKey: (data: Omit<ClaudeSessionKey, "id" | "createdAt">) => ClaudeSessionKey
  updateKey: (id: string, data: Partial<Omit<ClaudeSessionKey, "id">>) => void
  deleteKey: (id: string) => void
  setCurrentKey: (id: string) => void
  testKey: (id: string, result: { isValid: boolean; accountType?: string }) => void
  setKeys: (keys: ClaudeSessionKey[]) => void // 批量设置(用于导入)
  setHasHydrated: (state: boolean) => void
}

// ==================== Store 创建 ====================

export const useClaudeSessionKeysStore = create<SessionKeysStore>()(
  persist(
    (set, _get) => ({
      keys: [],
      currentKeyId: "", // 空字符串表示使用浏览器默认cookie
      _hasHydrated: false,

      addKey: (data) => {
        const newKey: ClaudeSessionKey = {
          id: crypto.randomUUID(),
          ...data,
          createdAt: Date.now(),
        }
        set((state) => ({
          keys: [...state.keys, newKey],
        }))
        return newKey
      },

      updateKey: (id, data) =>
        set((state) => ({
          keys: state.keys.map((k) => (k.id === id ? { ...k, ...data } : k)),
        })),

      deleteKey: (id) =>
        set((state) => ({
          keys: state.keys.filter((k) => k.id !== id),
          // 如果删除的是当前使用的key,重置为默认
          currentKeyId: state.currentKeyId === id ? "" : state.currentKeyId,
        })),

      setCurrentKey: (id) => set({ currentKeyId: id }),

      testKey: (id, result) =>
        set((state) => ({
          keys: state.keys.map((k) =>
            k.id === id
              ? {
                  ...k,
                  isValid: result.isValid,
                  accountType: result.accountType as ClaudeSessionKey["accountType"],
                  testedAt: Date.now(),
                }
              : k,
          ),
        })),

      setKeys: (keys) => set({ keys }),

      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: "claudeSessionKeys", // chrome.storage key
      storage: createJSONStorage(() => chromeStorageAdapter),
      partialize: (state) => ({
        keys: state.keys,
        currentKeyId: state.currentKeyId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)

// ==================== 便捷 Hooks ====================

export const useSessionKeysHydrated = () => useClaudeSessionKeysStore((state) => state._hasHydrated)
export const useSessionKeys = () => useClaudeSessionKeysStore((state) => state.keys)
export const useCurrentKeyId = () => useClaudeSessionKeysStore((state) => state.currentKeyId)

// ==================== 非 React 环境使用 ====================

export const getSessionKeysState = () => useClaudeSessionKeysStore.getState()
export const getCurrentKey = (): ClaudeSessionKey | null => {
  const { keys, currentKeyId } = getSessionKeysState()
  if (!currentKeyId) return null
  return keys.find((k) => k.id === currentKeyId) || null
}
