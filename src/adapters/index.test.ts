import { describe, expect, it } from "vitest"

import { resolveAdapterModuleKey } from "./index"

describe("resolveAdapterModuleKey", () => {
  it.each([
    ["business.gemini.google", "gemini-enterprise"],
    ["gemini.google.com", "gemini"],
    ["aistudio.google.com", "aistudio"],
    ["chatgpt.com", "chatgpt"],
    ["claude.ai", "claude"],
    ["chat.deepseek.com", "deepseek"],
    ["www.doubao.com", "doubao"],
    ["chat.qwen.ai", "qwen-studio"],
    ["qianwen.com", "qianwen"],
    ["chat.z.ai", "zai"],
  ] as const)("routes %s to %s", (hostname, moduleKey) => {
    expect(resolveAdapterModuleKey(hostname)).toBe(moduleKey)
  })

  it("does not load an adapter for an unsupported or legacy hostname", () => {
    expect(resolveAdapterModuleKey("example.com")).toBeNull()
    expect(resolveAdapterModuleKey("chat.openai.com")).toBeNull()
  })
})
