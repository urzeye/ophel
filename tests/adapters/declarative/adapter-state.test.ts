import { afterEach, describe, expect, it, vi } from "vitest"

import { DeclarativeAdapter } from "~adapters/declarative/adapter"
import type { SitePackManifest } from "~adapters/declarative/types"

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

interface FakeElementOptions {
  connected?: boolean
  display?: string
  visibility?: string
  opacity?: string
  width?: number
  height?: number
  insideOphel?: boolean
}

type StyledFakeElement = Element & {
  __computedStyle: Pick<CSSStyleDeclaration, "display" | "visibility" | "opacity">
}

const createManifest = (overrides: Partial<SitePackManifest> = {}): SitePackManifest => ({
  schemaVersion: 1,
  id: "state-pack",
  version: 1,
  minAppVersion: "1.1.8",
  name: "State Pack",
  matches: ["https://chat.example.test/*"],
  capabilities: ["outline"],
  selectors: {
    responseContainer: "main",
  },
  ...overrides,
})

const createFakeElement = (options: FakeElementOptions = {}): StyledFakeElement =>
  ({
    __computedStyle: {
      display: options.display ?? "block",
      visibility: options.visibility ?? "visible",
      opacity: options.opacity ?? "1",
    },
    isConnected: options.connected ?? true,
    closest: vi.fn(() => (options.insideOphel ? ({} as Element) : null)),
    getBoundingClientRect: vi.fn(() => ({
      width: options.width ?? 20,
      height: options.height ?? 20,
    })),
  }) as unknown as StyledFakeElement

const stubWindow = (url: string): void => {
  vi.stubGlobal("window", {
    location: new URL(url),
    getComputedStyle: (element: StyledFakeElement) => element.__computedStyle,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("DeclarativeAdapter generation state", () => {
  it("reflects confirmed network generation without DOM selectors", () => {
    const adapter = new DeclarativeAdapter(
      createManifest({
        capabilities: ["generation-detect"],
        selectors: {},
        networkMonitor: {
          urlPatterns: ["/api/chat"],
          silenceThreshold: 1000,
        },
      }),
    )

    adapter.setNetworkGenerationState(true)
    expect(adapter.isGenerating()).toBe(true)

    adapter.setNetworkGenerationState(false)
    expect(adapter.isGenerating()).toBe(false)
  })

  it("returns idle when generation config is absent or selectors have no matches", () => {
    const withoutConfig = new DeclarativeAdapter(createManifest())
    const withoutConfigLookup = vi.spyOn(withoutConfig, "findAllElementsBySelector")
    expect(withoutConfig.isGenerating()).toBe(false)
    expect(withoutConfigLookup).not.toHaveBeenCalled()

    const withSelectors = new DeclarativeAdapter(
      createManifest({
        generating: { existsSelectors: ["button[data-stop]", "[data-streaming]"] },
      }),
    )
    const lookup = vi.spyOn(withSelectors, "findAllElementsBySelector").mockReturnValue([])
    expect(withSelectors.isGenerating()).toBe(false)
    expect(lookup.mock.calls).toEqual([["button[data-stop]"], ["[data-streaming]"]])
  })

  it("returns generating when a later selector contains a visible candidate", () => {
    stubWindow("https://chat.example.test/chat/123")
    const hidden = createFakeElement({ display: "none" })
    const visible = createFakeElement()
    const adapter = new DeclarativeAdapter(
      createManifest({
        generating: { existsSelectors: ["button[data-stop]", "[data-streaming]"] },
      }),
    )
    const lookup = vi
      .spyOn(adapter, "findAllElementsBySelector")
      .mockImplementation((selector) => (selector === "button[data-stop]" ? [hidden] : [visible]))

    expect(adapter.isGenerating()).toBe(true)
    expect(lookup.mock.calls).toEqual([["button[data-stop]"], ["[data-streaming]"]])
  })

  interface HiddenCase {
    name: string
    options: FakeElementOptions
  }

  it.each<HiddenCase>([
    { name: "display none", options: { display: "none" } },
    { name: "hidden visibility", options: { visibility: "hidden" } },
    { name: "zero opacity", options: { opacity: "0" } },
    { name: "a disconnected element", options: { connected: false } },
    { name: "zero width", options: { width: 0 } },
    { name: "zero height", options: { height: 0 } },
    { name: "an Ophel panel descendant", options: { insideOphel: true } },
  ])("ignores $name", ({ options }) => {
    stubWindow("https://chat.example.test/chat/123")
    const adapter = new DeclarativeAdapter(
      createManifest({ generating: { existsSelectors: ["[data-streaming]"] } }),
    )
    vi.spyOn(adapter, "findAllElementsBySelector").mockReturnValue([createFakeElement(options)])

    expect(adapter.isGenerating()).toBe(false)
  })
})

describe("DeclarativeAdapter session and navigation state", () => {
  it("uses the base session ID fallback when no regex is configured", () => {
    stubWindow("https://chat.example.test/chat/base-session?mode=full")
    const adapter = new DeclarativeAdapter(createManifest())

    expect(adapter.getSessionId()).toBe("base-session")
  })

  it("uses the configured session capture and returns empty for mismatch or empty captures", () => {
    const captured = new DeclarativeAdapter(
      createManifest({ session: { idFromPathRegex: "^/chat/([^/?#]+)$" } }),
    )
    stubWindow("https://chat.example.test/chat/configured-session")
    expect(captured.getSessionId()).toBe("configured-session")
    stubWindow("https://chat.example.test/settings")
    expect(captured.getSessionId()).toBe("")

    const emptyCapture = new DeclarativeAdapter(
      createManifest({ session: { idFromPathRegex: "^/chat/(.*)$" } }),
    )
    stubWindow("https://chat.example.test/chat/")
    expect(emptyCapture.getSessionId()).toBe("")
  })

  it("distinguishes omitted, empty, matching, and non-matching new-conversation patterns", () => {
    stubWindow("https://chat.example.test/new")
    expect(new DeclarativeAdapter(createManifest()).isNewConversation()).toBe(false)
    expect(
      new DeclarativeAdapter(
        createManifest({ session: { newConversationPathPatterns: [] } }),
      ).isNewConversation(),
    ).toBe(false)

    const configured = new DeclarativeAdapter(
      createManifest({
        session: { newConversationPathPatterns: ["^/$", "^/new$"] },
      }),
    )
    expect(configured.isNewConversation()).toBe(true)
    stubWindow("https://chat.example.test/chat/123")
    expect(configured.isNewConversation()).toBe(false)
  })

  it("uses the default or configured share path prefix authoritatively", () => {
    const defaultAdapter = new DeclarativeAdapter(createManifest())
    stubWindow("https://chat.example.test/share/abc")
    expect(defaultAdapter.isSharePage()).toBe(true)
    stubWindow("https://chat.example.test/public/abc")
    expect(defaultAdapter.isSharePage()).toBe(false)

    const configured = new DeclarativeAdapter(
      createManifest({ session: { sharePathPrefix: "/public/" } }),
    )
    expect(configured.isSharePage()).toBe(true)
    stubWindow("https://chat.example.test/share/abc")
    expect(configured.isSharePage()).toBe(false)
  })

  it("resolves default and configured new-tab URLs while rejecting cross-origin values", () => {
    stubWindow("https://chat.example.test:8443/chat/123")
    expect(new DeclarativeAdapter(createManifest()).getNewTabUrl()).toBe(
      "https://chat.example.test:8443",
    )

    const configured = new DeclarativeAdapter(
      createManifest({ session: { newTabPath: "/new?draft=1#composer" } }),
    )
    expect(configured.getNewTabUrl()).toBe("https://chat.example.test:8443/new?draft=1#composer")

    const crossOrigin = new DeclarativeAdapter(
      createManifest({ session: { newTabPath: "https://evil.example/new" } }),
    )
    expect(() => crossOrigin.getNewTabUrl()).toThrow(
      "Declarative SitePack newTabPath must remain on the current origin",
    )
  })
})
