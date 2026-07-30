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

import { matchesPromptPlatform } from "~stores/prompts-store"

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
