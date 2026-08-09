import { describe, expect, it } from "vitest"

import type { SiteAdapter } from "~adapters/base"
import { buildAdapterDiagnostics, formatAdapterDiagnosticsText } from "~core/adapter-diagnostics"

class FakeElement {
  constructor(
    readonly selectorTags: string[],
    readonly textContent = "",
  ) {}
}

class FakeRoot {
  constructor(private readonly elements: FakeElement[]) {}

  querySelectorAll(selector: string): FakeElement[] {
    return this.elements.filter((element) => element.selectorTags.includes(selector))
  }
}

const createAdapter = (): SiteAdapter =>
  ({
    getSiteId: () => "ima",
    getName: () => "Ima",
    getTextareaSelectors: () => ["textarea[data-test='input']", ""],
    getSubmitButtonSelectors: () => ["button[type='submit']"],
    getResponseContainerSelector: () => "main[data-chat]",
    getChatContentSelectors: () => ["article.message"],
    getUserQuerySelector: () => "[data-role='user']",
    getExportConfig: () => ({
      userQuerySelector: "[data-role='user']",
      assistantResponseSelector: "[data-role='assistant']",
      turnSelector: null,
      useShadowDOM: false,
    }),
    getNewChatButtonSelectors: () => ["button.new-chat"],
    getStopButtonSelectors: () => [],
    getFeatureCapabilities: () => new Set(["outline", "export-basic"]),
  }) as unknown as SiteAdapter

describe("adapter diagnostics", () => {
  it("counts selector hits and formats a copyable summary", () => {
    const root = new FakeRoot([
      new FakeElement(["textarea[data-test='input']"], "hello"),
      new FakeElement(["button[type='submit']"], "Send"),
      new FakeElement(["main[data-chat]"], "chat"),
      new FakeElement(["article.message"], "message"),
      new FakeElement(["[data-role='user']"], "Question"),
      new FakeElement(["[data-role='assistant']"], "Answer"),
    ])

    const report = buildAdapterDiagnostics(createAdapter(), {
      root: root as unknown as ParentNode,
      href: "https://ima.qq.com/chat",
      now: 1_800_000_000_000,
      configContext: {
        kind: "builtin",
        siteId: "ima",
        siteName: "Ima",
        siteInstanceKey: "ima",
        origin: "https://ima.qq.com",
        signature: "builtin:ima",
        canCheckUpdates: true,
        baseConfigVersion: 1,
        patchVersion: 2,
        patchSource: "local",
        updateAvailable: false,
      },
    })

    expect(report.summaryLine).toContain("builtin:ima")
    expect(report.summaryLine).toContain("patch=v2(local)")
    expect(report.selectors.find((item) => item.id === "textarea")?.matchCount).toBe(1)
    expect(report.selectors.find((item) => item.id === "assistantResponse")?.matchCount).toBe(1)
    expect(report.selectors.find((item) => item.id === "stopButton")).toMatchObject({
      matchCount: 0,
      error: "no-selector",
    })

    const text = formatAdapterDiagnosticsText(report)
    expect(text).toContain("patchSource: local")
    expect(text).toContain("textarea: count=1")
    expect(text).not.toContain("private conversation")
  })
})
