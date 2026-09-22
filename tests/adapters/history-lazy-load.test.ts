import { describe, expect, it, vi } from "vitest"

// 适配器模块加载期可能读取全局 DOM；node 环境提供最小 stub
vi.hoisted(() => {
  const globalRef = globalThis as Record<string, unknown>
  globalRef.document ??= { documentElement: {}, body: {} }
  globalRef.HTMLElement ??= class HTMLElement {}
  globalRef.Element ??= class Element {}
})

import { AIStudioAdapter } from "~adapters/aistudio"
import { ChatGPTAdapter } from "~adapters/chatgpt"
import { ChatGLMAdapter } from "~adapters/chatglm"
import { ClaudeAdapter } from "~adapters/claude"
import { DeepSeekAdapter } from "~adapters/deepseek"
import { DoubaoAdapter } from "~adapters/doubao"
import { GeminiAdapter } from "~adapters/gemini"
import { GeminiEnterpriseAdapter } from "~adapters/gemini-enterprise"
import { GrokAdapter } from "~adapters/grok"
import { ImaAdapter } from "~adapters/ima"
import { KimiAdapter } from "~adapters/kimi"
import { QianwenAdapter } from "~adapters/qianwen"
import { QwenAiAdapter } from "~adapters/qwen-studio"
import { YuanbaoAdapter } from "~adapters/yuanbao"
import { ZaiAdapter } from "~adapters/zai"

describe("needsHistoryLazyLoad", () => {
  it("stays enabled for sites that lazy-load history from the server", () => {
    expect(new GeminiAdapter().needsHistoryLazyLoad()).toBe(true)
    expect(new GeminiEnterpriseAdapter().needsHistoryLazyLoad()).toBe(true)
    expect(new QianwenAdapter().needsHistoryLazyLoad()).toBe(true)
    expect(new QwenAiAdapter().needsHistoryLazyLoad()).toBe(true)
    // ChatGPT 长对话的早期轮次随向上滚动分页加载（conversation-turn-N > 1）
    expect(new ChatGPTAdapter().needsHistoryLazyLoad()).toBe(true)
  })

  it("is disabled for full-render or client-virtualized sites", () => {
    expect(new ClaudeAdapter().needsHistoryLazyLoad()).toBe(false)
    expect(new DeepSeekAdapter().needsHistoryLazyLoad()).toBe(false)
    expect(new DoubaoAdapter().needsHistoryLazyLoad()).toBe(false)
    expect(new KimiAdapter().needsHistoryLazyLoad()).toBe(false)
    expect(new GrokAdapter().needsHistoryLazyLoad()).toBe(false)
    expect(new ChatGLMAdapter().needsHistoryLazyLoad()).toBe(false)
    expect(new ImaAdapter().needsHistoryLazyLoad()).toBe(false)
    expect(new YuanbaoAdapter().needsHistoryLazyLoad()).toBe(false)
    expect(new ZaiAdapter().needsHistoryLazyLoad()).toBe(false)
    expect(new AIStudioAdapter().needsHistoryLazyLoad()).toBe(false)
  })
})
