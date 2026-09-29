import { describe, expect, it, vi } from "vitest"

import type { Prompt } from "~utils/storage"

vi.mock("~constants", () => ({
  getDefaultPrompts: () => [],
  VIRTUAL_CATEGORY: { ALL: "all", RECENT: "recent" },
}))

vi.mock("~stores/chrome-adapter", () => ({
  chromeStorageAdapter: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
}))

import { matchesPromptPlatform, usePromptsStore } from "~stores/prompts-store"

const createPrompt = (platforms?: string[]): Prompt => ({
  id: "prompt-1",
  title: "Prompt",
  content: "Content",
  category: "General",
  ...(platforms ? { platforms } : {}),
})

describe("matchesPromptPlatform", () => {
  it("accepts exact dynamic IDs without narrowing them to built-in platforms", () => {
    expect(matchesPromptPlatform(createPrompt(), ["pack:fixture-chat"])).toBe(true)
    expect(matchesPromptPlatform(createPrompt(["pack:fixture-chat"]), [])).toBe(true)
    expect(matchesPromptPlatform(createPrompt(["pack:fixture-chat"]), ["pack:fixture-chat"])).toBe(
      true,
    )
    expect(matchesPromptPlatform(createPrompt(["pack:fixture-chat"]), ["chatgpt"])).toBe(false)
    expect(matchesPromptPlatform(createPrompt(["pack:fixture-chat"]), ["pack:other-chat"])).toBe(
      false,
    )
  })
})

describe("persist migrate", () => {
  const migrate = usePromptsStore.persist.getOptions().migrate as (
    state: unknown,
    version: number,
  ) => { prompts: Prompt[] }

  it("normalizes legacy localized uncategorized names to empty string", () => {
    const result = migrate(
      {
        prompts: [
          { id: "1", title: "a", content: "", category: "未分类" },
          { id: "2", title: "b", content: "", category: "Uncategorized" },
          { id: "3", title: "c", content: "", category: "미분류" },
          { id: "4", title: "d", content: "", category: "General" },
          { id: "5", title: "e", content: "", category: "" },
        ],
      },
      0,
    )
    expect(result.prompts.map((p) => p.category)).toEqual(["", "", "", "General", ""])
  })

  it("leaves already-migrated state untouched", () => {
    const state = { prompts: [{ id: "1", title: "a", content: "", category: "未分类" }] }
    expect(migrate(state, 1)).toBe(state)
  })
})
