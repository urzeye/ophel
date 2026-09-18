import { describe, expect, it, vi } from "vitest"

// DOMToolkit 在模块加载时读取全局 document；node 环境提供最小 stub
vi.hoisted(() => {
  const globalRef = globalThis as Record<string, unknown>
  globalRef.document ??= { documentElement: {}, body: {} }
  // chatgpt.ts 内部有 instanceof HTMLElement / Element 判断
  globalRef.HTMLElement ??= class HTMLElement {}
  globalRef.Element ??= class Element {}
})

import { ChatGPTAdapter } from "~adapters/chatgpt"

interface TocCacheInternals {
  cacheNativeTocTexts(buttons: HTMLElement[], texts: string[]): void
  hasUsableNativeTocTextCache(buttons: HTMLElement[]): boolean
  getNativeTocButtonSignature(buttons: HTMLElement[]): string
  getNativeTocTexts(buttons: HTMLElement[]): string[]
}

const createButton = (index: number): HTMLElement => {
  const attrs: Record<string, string> = {
    "data-toc-item-index": String(index),
    "aria-label": `Prompt ${index + 1}`,
  }
  const button = new HTMLElement() as HTMLElement
  button.getAttribute = (name: string) => attrs[name] ?? null
  // 不挂到任何 rail / 祖先上，hover 目标与文本层查询自然落空
  button.closest = () => null
  return button
}

const createButtons = (count: number): HTMLElement[] =>
  Array.from({ length: count }, (_, index) => createButton(index))

const createTexts = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `question ${index + 1}`)

const createAdapter = (): TocCacheInternals => new ChatGPTAdapter() as unknown as TocCacheInternals

describe("ChatGPTAdapter native TOC text cache", () => {
  // 回归：缓存曾绑定按钮元素身份，ChatGPT 重渲染 TOC 栏重建按钮后文本缓存失效，
  // 大纲从 10 轮掉回只剩 DOM 挂载的几轮
  it("keeps texts usable when TOC button elements are recreated with the same indexes", () => {
    const adapter = createAdapter()
    adapter.cacheNativeTocTexts(createButtons(10), createTexts(10))

    const recreatedButtons = createButtons(10)
    expect(adapter.hasUsableNativeTocTextCache(recreatedButtons)).toBe(true)
  })

  it("invalidates cached texts when the button count changes", () => {
    const adapter = createAdapter()
    adapter.cacheNativeTocTexts(createButtons(10), createTexts(10))

    expect(adapter.hasUsableNativeTocTextCache(createButtons(11))).toBe(false)
  })

  it("builds the signature from data-toc-item-index order", () => {
    const adapter = createAdapter()
    expect(adapter.getNativeTocButtonSignature(createButtons(3))).toBe("0|1|2")
  })

  // 端到端：按钮重建后 aria-label 仍是占位符，完整读取管线也必须返回已缓存文本，
  // 否则 getNativeTocEntries 落空，大纲会从 10 轮掉回只剩挂载中的几轮
  it("serves cached texts through the full read pipeline after button recreation", () => {
    const adapter = createAdapter()
    const texts = createTexts(10)
    adapter.cacheNativeTocTexts(createButtons(10), texts)

    const recreatedButtons = createButtons(10)
    expect(adapter.getNativeTocTexts(recreatedButtons)).toEqual(texts)
  })
})
