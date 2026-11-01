import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type { PromptChain } from "~core/prompt-action-types"
import { DEFAULT_PROMPT_CHAINS_VERSION, getDefaultPromptChains } from "~constants"
import { initI18n } from "~utils/i18n"
import { sanitizeSvgIcon } from "~utils/svg-sanitizer"

import { chromeStorageAdapter } from "./chrome-adapter"

interface PromptChainsState {
  chains: PromptChain[]
  defaultChainsVersion: number
  _hasHydrated: boolean
  addChain: (data: Omit<PromptChain, "id" | "createdAt" | "updatedAt">) => PromptChain
  updateChain: (id: string, data: Partial<Omit<PromptChain, "id" | "createdAt">>) => void
  deleteChain: (id: string) => void
  duplicateChain: (id: string) => PromptChain | null
  updateOrder: (newOrderIds: string[]) => void
  updateLastUsed: (id: string) => void
  setChains: (chains: PromptChain[]) => void
  setHasHydrated: (state: boolean) => void
}

const normalizeChain = (chain: PromptChain): PromptChain => {
  return {
    ...chain,
    iconSvg: chain.iconSvg ? sanitizeSvgIcon(chain.iconSvg) : "",
    showInSelectionPopover: chain.showInSelectionPopover !== false,
    steps: Array.isArray(chain.steps) ? chain.steps : [],
    createdAt: chain.createdAt || Date.now(),
    updatedAt: chain.updatedAt || Date.now(),
  }
}

const mergeDefaultChains = (chains: PromptChain[], refreshDefaults = false): PromptChain[] => {
  const defaultChains = getDefaultPromptChains().map(normalizeChain)
  const defaultIds = new Set(defaultChains.map((chain) => chain.id))
  const preservedChains = refreshDefaults
    ? chains.filter((chain) => !defaultIds.has(chain.id))
    : chains
  const existingIds = new Set(preservedChains.map((chain) => chain.id))
  const chainsToInstall = defaultChains.filter((chain) => !existingIds.has(chain.id))

  return [...chainsToInstall, ...preservedChains]
}

let _completeHydration: (() => void) | null = null

// 记录水合读到的持久化快照：默认 Chain 的安装/刷新依赖完整语言资源
// （getDefaultPromptChains -> t()），推迟到 initI18n 就绪后执行
let didRehydrateFromStorage = false
let rehydratedChainsSnapshot: {
  chains?: PromptChain[]
  defaultChainsVersion?: number
} | null = null

export const usePromptChainsStore = create<PromptChainsState>()(
  persist(
    (set, get) => (
      (_completeHydration = () => set({ _hasHydrated: true })),
      {
        // 初始为兜底语言（en）的默认 Chain（模块加载时语言资源可能尚未就绪）；
        // 需要本地化文案的安装/刷新在水合完成后执行，见 onRehydrateStorage
        chains: getDefaultPromptChains().map(normalizeChain),
        defaultChainsVersion: DEFAULT_PROMPT_CHAINS_VERSION,
        _hasHydrated: false,

        addChain: (data) => {
          const now = Date.now()
          const chain: PromptChain = normalizeChain({
            id: `chain_${now}_${Math.random().toString(36).slice(2, 8)}`,
            ...data,
            createdAt: now,
            updatedAt: now,
          })

          set((state) => ({ chains: [...state.chains, chain] }))
          return chain
        },

        updateChain: (id, data) =>
          set((state) => ({
            chains: state.chains.map((chain) =>
              chain.id === id
                ? normalizeChain({ ...chain, ...data, updatedAt: Date.now() })
                : chain,
            ),
          })),

        deleteChain: (id) =>
          set((state) => ({
            chains: state.chains.filter((chain) => chain.id !== id),
          })),

        duplicateChain: (id) => {
          const source = get().chains.find((chain) => chain.id === id)
          if (!source) return null

          const now = Date.now()
          const copy = normalizeChain({
            ...source,
            id: `chain_${now}_${Math.random().toString(36).slice(2, 8)}`,
            title: `${source.title} Copy`,
            createdAt: now,
            updatedAt: now,
            lastUsedAt: undefined,
          })

          set((state) => ({ chains: [...state.chains, copy] }))
          return copy
        },

        updateOrder: (newOrderIds) =>
          set((state) => {
            const ordered: PromptChain[] = []
            newOrderIds.forEach((id) => {
              const chain = state.chains.find((item) => item.id === id)
              if (chain) ordered.push(chain)
            })
            state.chains.forEach((chain) => {
              if (!ordered.some((item) => item.id === chain.id)) ordered.push(chain)
            })
            return { chains: ordered }
          }),

        updateLastUsed: (id) =>
          set((state) => ({
            chains: state.chains.map((chain) =>
              chain.id === id ? { ...chain, lastUsedAt: Date.now() } : chain,
            ),
          })),

        setChains: (chains) => set({ chains: chains.map(normalizeChain) }),

        setHasHydrated: (state) => set({ _hasHydrated: state }),
      }
    ),
    {
      name: "promptChains",
      storage: createJSONStorage(() => chromeStorageAdapter),
      partialize: (state) => ({
        chains: state.chains,
        defaultChainsVersion: state.defaultChainsVersion,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as
          | { chains?: PromptChain[]; defaultChainsVersion?: number }
          | undefined
        // zustand persist 无存储数据时也会调用 merge（persistedState 为 undefined），
        // 只有 persistedState 非空才算命中历史数据
        didRehydrateFromStorage = persistedState != null
        rehydratedChainsSnapshot = persisted ?? null
        const persistedChains = persisted?.chains
        const chains = Array.isArray(persistedChains)
          ? persistedChains.map(normalizeChain)
          : currentState.chains

        return {
          ...currentState,
          chains,
          defaultChainsVersion: persisted?.defaultChainsVersion ?? 0,
        }
      },
      onRehydrateStorage: () => () => {
        // 默认 Chain 的安装/版本刷新需要本地化文案，等语言资源就绪后执行，
        // 避免把英文兜底文案写进用户数据
        void initI18n().then(() => {
          const shouldInstallDefaults =
            !didRehydrateFromStorage ||
            rehydratedChainsSnapshot?.defaultChainsVersion !== DEFAULT_PROMPT_CHAINS_VERSION
          if (shouldInstallDefaults) {
            usePromptChainsStore.setState((state) => ({
              chains: mergeDefaultChains(state.chains, true),
              defaultChainsVersion: DEFAULT_PROMPT_CHAINS_VERSION,
            }))
          }
          _completeHydration?.()
        })
      },
    },
  ),
)

export const usePromptChains = () => usePromptChainsStore((state) => state.chains)
export const usePromptChainsHydrated = () => usePromptChainsStore((state) => state._hasHydrated)
export const getPromptChainsState = () => usePromptChainsStore.getState().chains
export const getPromptChainsStore = () => usePromptChainsStore.getState()
