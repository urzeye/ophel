import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type { PromptQuoteReference } from "~core/prompt-action-types"

import { chromeStorageAdapter } from "./chrome-adapter"

const MAX_QUOTE_REFERENCES = 300

interface QuickQuotesState {
  references: PromptQuoteReference[]
  addReference: (reference: PromptQuoteReference) => void
  removeReference: (id: string) => void
  clearSessionReferences: (sessionId: string) => void
  clearAllReferences: () => void
}

const compactReferences = (references: PromptQuoteReference[]): PromptQuoteReference[] =>
  references
    .filter((reference) => reference.id && reference.selectedText && reference.anchor)
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-MAX_QUOTE_REFERENCES)

export const useQuickQuotesStore = create<QuickQuotesState>()(
  persist(
    (set) => ({
      references: [],

      addReference: (reference) =>
        set((state) => ({
          references: compactReferences([
            ...state.references.filter((item) => item.id !== reference.id),
            reference,
          ]),
        })),

      removeReference: (id) =>
        set((state) => ({
          references: state.references.filter((reference) => reference.id !== id),
        })),

      clearSessionReferences: (sessionId) =>
        set((state) => ({
          references: state.references.filter(
            (reference) => reference.anchor.sessionId !== sessionId,
          ),
        })),

      clearAllReferences: () => set({ references: [] }),
    }),
    {
      name: "quickQuoteReferences",
      storage: createJSONStorage(() => chromeStorageAdapter),
      partialize: (state) => ({ references: compactReferences(state.references) }),
      merge: (persistedState, currentState) => {
        const references = (persistedState as { references?: PromptQuoteReference[] } | undefined)
          ?.references
        return {
          ...currentState,
          references: Array.isArray(references) ? compactReferences(references) : [],
        }
      },
    },
  ),
)

export const useQuickQuoteReferences = () => useQuickQuotesStore((state) => state.references)
export const getQuickQuotesStore = () => useQuickQuotesStore.getState()
