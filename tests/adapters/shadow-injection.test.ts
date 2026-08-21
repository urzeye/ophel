import { describe, expect, it, vi } from "vitest"

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

import { SiteAdapter } from "~adapters/base"
import { GeminiEnterpriseAdapter } from "~adapters/gemini-enterprise"

class DummyAdapter extends SiteAdapter {
  getSiteId(): string {
    return "dummy"
  }
  match(): boolean {
    return true
  }
}

describe("shouldInjectIntoShadow", () => {
  it("rejects Ophel UI containers in base SiteAdapter", () => {
    const adapter = new DummyAdapter()

    const normalHost = {
      tagName: "DIV",
      id: "chat-host",
      classList: { contains: () => false },
      closest: () => null,
    } as unknown as Element
    expect(adapter.shouldInjectIntoShadow(normalHost)).toBe(true)

    const plasmoHost = {
      tagName: "PLASMO-CSUI",
      id: "plasmo-1",
      classList: { contains: () => false },
      closest: () => null,
    } as unknown as Element
    expect(adapter.shouldInjectIntoShadow(plasmoHost)).toBe(false)

    const userscriptHost = {
      tagName: "DIV",
      id: "ophel-userscript-root",
      classList: { contains: () => false },
      closest: () => null,
    } as unknown as Element
    expect(adapter.shouldInjectIntoShadow(userscriptHost)).toBe(false)

    const classHost = {
      tagName: "DIV",
      id: "some-id",
      classList: { contains: (cls: string) => cls === "plasmo-csui-container" },
      closest: () => null,
    } as unknown as Element
    expect(adapter.shouldInjectIntoShadow(classHost)).toBe(false)

    const nestedChild = {
      tagName: "DIV",
      id: "nested-inside-plasmo",
      classList: { contains: () => false },
      closest: (sel: string) => (sel.includes("plasmo-csui") ? plasmoHost : null),
    } as unknown as Element
    expect(adapter.shouldInjectIntoShadow(nestedChild)).toBe(false)
  })

  it("rejects Ophel UI containers and sidebar exclusion in GeminiEnterpriseAdapter", () => {
    const adapter = new GeminiEnterpriseAdapter()

    const normalHost = {
      tagName: "DIV",
      id: "chat-host",
      classList: { contains: () => false },
      closest: () => null,
    } as unknown as Element
    expect(adapter.shouldInjectIntoShadow(normalHost)).toBe(true)

    const plasmoHost = {
      tagName: "PLASMO-CSUI",
      id: "plasmo-1",
      classList: { contains: () => false },
      closest: () => null,
    } as unknown as Element
    expect(adapter.shouldInjectIntoShadow(plasmoHost)).toBe(false)

    const userscriptHost = {
      tagName: "DIV",
      id: "ophel-userscript-root",
      classList: { contains: () => false },
      closest: () => null,
    } as unknown as Element
    expect(adapter.shouldInjectIntoShadow(userscriptHost)).toBe(false)
  })
})
