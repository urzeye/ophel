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

const CID = "aaaaaaaa-1111-4000-8000-000000000001"

const createAdapterAt = (pathname: string): ChatGPTAdapter => {
  vi.stubGlobal("window", { location: { pathname } })
  return new ChatGPTAdapter()
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("ChatGPT isUserConversationPage", () => {
  it.each([
    [`/c/${CID}`, true],
    [`/c/${CID}/`, true],
    [`/g/g-abcDEF123/c/${CID}`, true],
    [`/g/g-p-project123/c/${CID}`, true],
    [`/share/e/${CID}`, false],
    ["/", false],
    ["/g/g-abcDEF123", false],
    ["/library", false],
  ])("pathname %s => %s", (pathname, expected) => {
    expect(createAdapterAt(pathname).isUserConversationPage()).toBe(expected)
  })

  it("GPTs 会话页可跳过 DOM 历史预加载（走接口导出）", () => {
    expect(createAdapterAt(`/g/g-abcDEF123/c/${CID}`).canSkipExportHistoryPreload()).toBe(true)
  })

  it("GPTs 会话页 getSessionId 取出会话 cid 而非 gizmo id", () => {
    expect(createAdapterAt(`/g/g-abcDEF123/c/${CID}`).getSessionId()).toBe(CID)
  })

  it("首页不跳过 DOM 历史预加载", () => {
    expect(createAdapterAt("/").canSkipExportHistoryPreload()).toBe(false)
  })
})
