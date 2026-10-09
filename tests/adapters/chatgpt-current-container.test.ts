import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("~utils/export-assets", () => ({
  createExportAssetCollector: vi.fn(() => ({ assets: [], usedPaths: new Set() })),
  escapeMarkdownLinkText: vi.fn((value: string) => value),
  formatExportFileAttachments: vi.fn(() => ""),
  formatExportImageMarkdown: vi.fn(() => ""),
  isDownloadableExportAssetUrl: vi.fn(() => false),
  normalizeExportAssetUrl: vi.fn(() => null),
}))

vi.mock("~utils/exporter", () => ({
  htmlToMarkdown: vi.fn(() => ""),
}))

vi.mock("~stores/settings-store", () => ({ useSettingsStore: { getState: vi.fn() } }))
vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: { query: vi.fn(() => []), walkShadowRoots: vi.fn() },
}))
vi.mock("~utils/font", () => ({
  INTER_LOCAL_FONT_FACE: "",
  getPlatformFontFamily: () => "sans-serif",
}))
vi.mock("~utils/i18n", () => ({ t: (key: string) => key }))

// node 环境提供最小 DOM 全局，chatgpt.ts 模块加载与 instanceof 判断依赖它们
vi.hoisted(() => {
  const globalRef = globalThis as Record<string, unknown>
  globalRef.document ??= { documentElement: {}, body: {} }
  globalRef.HTMLElement ??= class HTMLElement {}
  globalRef.Element ??= class Element {}
})

import { ChatGPTAdapter } from "~adapters/chatgpt"

interface ContainerInternals {
  findCurrentResponseContainer(): HTMLElement | null
  getObserveTarget(): Element | null
}

type FakeSurface = HTMLElement & { __display: string }

const createSurface = (display = "block", hiddenByAncestor = false): FakeSurface => {
  const HTMLElementCtor = (globalThis as Record<string, unknown>)
    .HTMLElement as new () => FakeSurface
  const el = new HTMLElementCtor()
  el.__display = display
  el.closest = () => (hiddenByAncestor ? ({} as Element) : null)
  return el
}

const stubDom = (surfaces: FakeSurface[]) => {
  const documentBody = {}
  vi.stubGlobal("document", {
    body: documentBody,
    querySelectorAll: vi.fn(() => surfaces),
  })
  vi.stubGlobal("window", {
    getComputedStyle: (el: FakeSurface) => ({ display: el.__display, visibility: "visible" }),
  })
  return documentBody
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("ChatGPT current conversation container resolution", () => {
  // 回归：新版 App-Shell 切换对话后把上一个对话的 surface 隐藏保留在 DOM 里，
  // 取首个匹配会让大纲/导出永远停在第一个对话
  it("picks the first visible surface when a hidden kept-alive surface precedes it", () => {
    const stale = createSurface("none")
    const current = createSurface("block")
    stubDom([stale, current])

    const adapter = new ChatGPTAdapter() as unknown as ContainerInternals
    expect(adapter.findCurrentResponseContainer()).toBe(current)
  })

  it("skips surfaces hidden by an ancestor (hidden / aria-hidden / inert)", () => {
    const stale = createSurface("block", true)
    const current = createSurface("block")
    stubDom([stale, current])

    const adapter = new ChatGPTAdapter() as unknown as ContainerInternals
    expect(adapter.findCurrentResponseContainer()).toBe(current)
  })

  it("falls back to the first match when every surface is hidden", () => {
    const first = createSurface("none")
    const second = createSurface("none")
    stubDom([first, second])

    const adapter = new ChatGPTAdapter() as unknown as ContainerInternals
    expect(adapter.findCurrentResponseContainer()).toBe(first)
  })

  it("returns null when no container matches", () => {
    stubDom([])

    const adapter = new ChatGPTAdapter() as unknown as ContainerInternals
    expect(adapter.findCurrentResponseContainer()).toBeNull()
  })

  // 切换对话会隐藏/替换整个 main surface，观察固定容器会在切换后失效
  it("observes document.body so surface replacement cannot kill outline updates", () => {
    const documentBody = stubDom([createSurface()])

    const adapter = new ChatGPTAdapter() as unknown as ContainerInternals
    expect(adapter.getObserveTarget()).toBe(documentBody)
  })
})
