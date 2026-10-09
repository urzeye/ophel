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
  getScrollContainer(): HTMLElement | null
  getAccessTokenCacheExpiresAt(token: string, now: number): number
}

type FakeSurface = HTMLElement & {
  __display: string
  scrollHeight: number
  clientHeight: number
}

const createSurface = (
  display = "block",
  hiddenByAncestor = false,
  rect: { width: number; height: number } = { width: 900, height: 1000 },
  scroll: { scrollHeight: number; clientHeight: number } = { scrollHeight: 0, clientHeight: 0 },
): FakeSurface => {
  const HTMLElementCtor = (globalThis as Record<string, unknown>)
    .HTMLElement as new () => FakeSurface
  const el = new HTMLElementCtor()
  el.__display = display
  el.closest = () => (hiddenByAncestor ? ({} as Element) : null)
  el.getBoundingClientRect = () => ({ width: rect.width, height: rect.height }) as DOMRect
  el.scrollHeight = scroll.scrollHeight
  el.clientHeight = scroll.clientHeight
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

  // 实测：切换对话后旧 surface 以 0x0 零尺寸占位保留，display 仍为 flex
  it("skips zero-size kept-alive surfaces from previous conversations", () => {
    const stale = createSurface("flex", false, { width: 0, height: 0 })
    const current = createSurface("flex", false, { width: 917, height: 1039 })
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

  // 旧对话 surface 是 0x0 零尺寸，但其滚动容器 scrollHeight 仍大于 clientHeight，
  // 且在 DOM 序上先于当前对话；不过滤可见性会选中旧对话的滚动容器
  it("resolves the scroll container from the visible conversation surface", () => {
    const stale = createSurface(
      "flex",
      false,
      { width: 0, height: 0 },
      {
        scrollHeight: 500,
        clientHeight: 0,
      },
    )
    const current = createSurface(
      "flex",
      false,
      { width: 917, height: 1039 },
      {
        scrollHeight: 2000,
        clientHeight: 1000,
      },
    )
    stubDom([stale, current])

    const adapter = new ChatGPTAdapter() as unknown as ContainerInternals
    expect(adapter.getScrollContainer()).toBe(current)
  })

  it("ignores zero-size kept-alive scroll containers in the fallback scan", () => {
    const stale = createSurface(
      "flex",
      false,
      { width: 0, height: 0 },
      {
        scrollHeight: 500,
        clientHeight: 0,
      },
    )
    stubDom([stale])

    const adapter = new ChatGPTAdapter() as unknown as ContainerInternals
    expect(adapter.getScrollContainer()).toBeNull()
  })
})

describe("ChatGPT session access token caching", () => {
  const encodeJwt = (payload: Record<string, unknown>): string => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
    return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(payload)}.sig`
  }

  // token 有效期实测约 10 天：按 JWT exp 缓存（预留 5 分钟），而不是写死 5 分钟
  it("caches the token until its JWT exp minus margin", () => {
    const now = 1_791_550_000_000
    const expSeconds = Math.floor(now / 1000) + 10 * 24 * 60 * 60
    const token = encodeJwt({ exp: expSeconds })

    const adapter = new ChatGPTAdapter() as unknown as ContainerInternals
    expect(adapter.getAccessTokenCacheExpiresAt(token, now)).toBe(expSeconds * 1000 - 5 * 60 * 1000)
  })

  it("falls back to a short cache for non-JWT tokens", () => {
    const now = 1_791_550_000_000

    const adapter = new ChatGPTAdapter() as unknown as ContainerInternals
    expect(adapter.getAccessTokenCacheExpiresAt("opaque-token", now)).toBe(now + 5 * 60 * 1000)
    expect(adapter.getAccessTokenCacheExpiresAt("a.b.c", now)).toBe(now + 5 * 60 * 1000)
  })
})
