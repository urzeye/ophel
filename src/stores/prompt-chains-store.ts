import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type { PromptChain } from "~core/prompt-action-types"
import { DEFAULT_PROMPT_CHAINS_VERSION, getDefaultPromptChains } from "~constants"
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

export const usePromptChainsStore = create<PromptChainsState>()(
  persist(
    (set, get) => (
      (_completeHydration = () => set({ _hasHydrated: true })),
      {
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
        const persistedChains = persisted?.chains
        const chains = Array.isArray(persistedChains)
          ? persistedChains.map(normalizeChain)
          : currentState.chains
        const shouldInstallDefaults =
          !persisted || persisted.defaultChainsVersion !== DEFAULT_PROMPT_CHAINS_VERSION

        return {
          ...currentState,
          chains: shouldInstallDefaults ? mergeDefaultChains(chains, true) : chains,
          defaultChainsVersion: DEFAULT_PROMPT_CHAINS_VERSION,
        }
      },
      onRehydrateStorage: () => () => {
        _completeHydration?.()
      },
    },
  ),
)

export const usePromptChains = () => usePromptChainsStore((state) => state.chains)
export const usePromptChainsHydrated = () => usePromptChainsStore((state) => state._hasHydrated)
export const getPromptChainsState = () => usePromptChainsStore.getState().chains
export const getPromptChainsStore = () => usePromptChainsStore.getState()
