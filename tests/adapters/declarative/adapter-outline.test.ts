import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DeclarativeAdapter } from "~adapters/declarative/adapter"
import type { SitePackManifest } from "~adapters/declarative/types"

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

const USER_QUERY_SELECTOR = ".user-query"

type TestOutlineElement = Element & {
  testId: string
  order: number
  isUserQuery: boolean
}

type TestOutlineContainer = HTMLElement & {
  testId: string
  queryOrder: TestOutlineElement[]
  queriedSelectors: string[]
}

interface ElementOptions {
  tagName?: string
  text?: string
  userQuery?: boolean
  classes?: string[]
  parent?: Element
  connected?: boolean
}

const createContainer = (): TestOutlineContainer => {
  const container = {
    testId: "response-container",
    queryOrder: [] as TestOutlineElement[],
    queriedSelectors: [] as string[],
    tagName: "MAIN",
    textContent: "",
    isConnected: true,
    classList: [],
    parentElement: null,
    matches: () => false,
    compareDocumentPosition: () => 0,
    querySelectorAll(selector: string) {
      this.queriedSelectors.push(selector)
      const requested = new Set(selector.split(",").map((value) => value.trim().toLowerCase()))
      return this.queryOrder.filter((element) =>
        element.isUserQuery
          ? requested.has(USER_QUERY_SELECTOR)
          : requested.has(element.tagName.toLowerCase()),
      )
    },
  }
  return container as unknown as TestOutlineContainer
}

const createAncestor = (parent: Element, classes: string[]): Element =>
  ({
    classList: classes,
    parentElement: parent,
  }) as unknown as Element

const createElement = (
  container: TestOutlineContainer,
  testId: string,
  order: number,
  options: ElementOptions = {},
): TestOutlineElement => {
  const isUserQuery = options.userQuery ?? false
  return {
    testId,
    order,
    isUserQuery,
    tagName: options.tagName ?? (isUserQuery ? "DIV" : "H1"),
    textContent: options.text ?? testId,
    isConnected: options.connected ?? true,
    classList: options.classes ?? [],
    parentElement: options.parent ?? container,
    matches: (selector: string) => isUserQuery && selector === USER_QUERY_SELECTOR,
    compareDocumentPosition: (other: Node) => {
      const otherOrder = (other as TestOutlineElement).order
      if (order < otherOrder) return Node.DOCUMENT_POSITION_FOLLOWING
      if (order > otherOrder) return Node.DOCUMENT_POSITION_PRECEDING
      return 0
    },
  } as unknown as TestOutlineElement
}

const createManifest = (
  selectors: SitePackManifest["selectors"] = {
    responseContainer: "#response",
    userQuery: USER_QUERY_SELECTOR,
  },
): SitePackManifest => ({
  schemaVersion: 1,
  id: "outline-pack",
  version: 1,
  minAppVersion: "1.1.8",
  name: "Outline Pack",
  matches: ["https://outline.example.test/*"],
  capabilities: ["outline", "outline-user-queries"],
  selectors,
})

interface WordCountCall {
  startId: string
  endId: string | null
  fallbackId: string | null
}

class OutlineTestAdapter extends DeclarativeAdapter {
  readonly lookupCalls: string[][] = []
  readonly userQueryCalls: string[] = []
  readonly wordCountCalls: WordCountCall[] = []

  constructor(
    manifest: SitePackManifest,
    private readonly testContainer: TestOutlineContainer | null,
  ) {
    super(manifest)
  }

  override findElementBySelectors(selectors: string[]): HTMLElement | null {
    this.lookupCalls.push([...selectors])
    return this.testContainer
  }

  override extractUserQueryText(element: Element): string {
    this.userQueryCalls.push((element as TestOutlineElement).testId)
    return element.textContent?.trim() ?? ""
  }

  protected override calculateRangeWordCount(
    startEl: Element,
    endEl: Element | null,
    fallbackContainer?: Element | null,
  ): number {
    this.wordCountCalls.push({
      startId: (startEl as TestOutlineElement).testId,
      endId: endEl ? (endEl as TestOutlineElement).testId : null,
      fallbackId: fallbackContainer ? (fallbackContainer as TestOutlineContainer).testId : null,
    })
    return this.wordCountCalls.length * 10
  }

  resetWordCountCalls(): void {
    this.wordCountCalls.length = 0
  }
}

beforeEach(() => {
  vi.stubGlobal("Node", {
    DOCUMENT_POSITION_PRECEDING: 2,
    DOCUMENT_POSITION_FOLLOWING: 4,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("DeclarativeAdapter outline candidates", () => {
  it("returns an empty outline when the response selector or mounted container is missing", () => {
    const container = createContainer()
    const withoutSelector = new OutlineTestAdapter(
      createManifest({ userQuery: USER_QUERY_SELECTOR }),
      container,
    )
    expect(withoutSelector.extractOutline()).toEqual([])
    expect(withoutSelector.lookupCalls).toEqual([])

    const withoutContainer = new OutlineTestAdapter(createManifest(), null)
    expect(withoutContainer.extractOutline()).toEqual([])
    expect(withoutContainer.lookupCalls).toEqual([["#response"]])
  })

  it("sorts candidates, clamps levels, skips empty headings, and excludes Ophel-owned DOM", () => {
    const container = createContainer()
    const ghAncestor = createAncestor(container, ["gh-outline-helper"])
    const userOne = createElement(container, "user-one", 0, {
      userQuery: true,
      text: "Question one",
    })
    const intro = createElement(container, "intro", 1, { tagName: "H1", text: "Intro" })
    const deep = createElement(container, "deep", 2, { tagName: "H3", text: "Deep" })
    const emptyHeading = createElement(container, "empty-heading", 3, {
      tagName: "H2",
      text: "   ",
    })
    const selfOwned = createElement(container, "self-owned", 4, {
      tagName: "H2",
      classes: ["gh-bookmark"],
    })
    const ancestorOwned = createElement(container, "ancestor-owned", 5, {
      tagName: "H2",
      parent: ghAncestor,
    })
    const details = createElement(container, "details", 6, {
      tagName: "H2",
      text: "Details",
    })
    const emptyUser = createElement(container, "empty-user", 7, {
      userQuery: true,
      text: "   ",
    })
    const next = createElement(container, "next", 8, { tagName: "H1", text: "Next" })
    container.queryOrder = [
      next,
      emptyUser,
      details,
      ancestorOwned,
      selfOwned,
      emptyHeading,
      deep,
      intro,
      userOne,
    ]
    const adapter = new OutlineTestAdapter(createManifest(), container)

    const levelTwo = adapter.extractOutline(2, true, false)
    expect(container.queriedSelectors.at(-1)).toBe("h1, h2, .user-query")
    expect(levelTwo.map((item) => (item.element as TestOutlineElement).testId)).toEqual([
      "user-one",
      "intro",
      "details",
      "next",
    ])
    expect(
      levelTwo.map(({ level, text, isUserQuery, wordCount }) => ({
        level,
        text,
        isUserQuery,
        wordCount,
      })),
    ).toEqual([
      { level: 0, text: "Question one", isUserQuery: true, wordCount: undefined },
      { level: 1, text: "Intro", isUserQuery: undefined, wordCount: undefined },
      { level: 2, text: "Details", isUserQuery: undefined, wordCount: undefined },
      { level: 1, text: "Next", isUserQuery: undefined, wordCount: undefined },
    ])
    expect(adapter.userQueryCalls).toEqual(["empty-user", "user-one"])

    const clampedLow = adapter.extractOutline(0, false, false)
    expect(container.queriedSelectors.at(-1)).toBe("h1, .user-query")
    expect(clampedLow.map((item) => (item.element as TestOutlineElement).testId)).toEqual([
      "intro",
      "next",
    ])

    const clampedHigh = adapter.extractOutline(99, false, false)
    expect(container.queriedSelectors.at(-1)).toBe("h1, h2, h3, h4, h5, h6, .user-query")
    expect(clampedHigh.map((item) => (item.element as TestOutlineElement).testId)).toEqual([
      "intro",
      "deep",
      "details",
      "next",
    ])
  })
})

describe("DeclarativeAdapter outline boundaries", () => {
  it("uses user turns and heading hierarchy as shared word-count boundaries", () => {
    const container = createContainer()
    const userOne = createElement(container, "user-one", 0, { userQuery: true })
    const headingOne = createElement(container, "heading-one", 1, { tagName: "H1" })
    const nestedTwo = createElement(container, "nested-two", 2, { tagName: "H2" })
    const nestedThree = createElement(container, "nested-three", 3, { tagName: "H3" })
    const peerTwo = createElement(container, "peer-two", 4, { tagName: "H2" })
    const userTwo = createElement(container, "user-two", 5, { userQuery: true })
    const finalHeading = createElement(container, "final-heading", 6, { tagName: "H1" })
    container.queryOrder = [
      peerTwo,
      userTwo,
      nestedThree,
      finalHeading,
      userOne,
      nestedTwo,
      headingOne,
    ]
    const adapter = new OutlineTestAdapter(createManifest(), container)

    const outline = adapter.extractOutline(6, true, true)
    expect(outline.map((item) => item.wordCount)).toEqual([10, 20, 30, 40, 50, 60, 70])
    expect(adapter.wordCountCalls).toEqual([
      { startId: "user-one", endId: "user-two", fallbackId: "response-container" },
      { startId: "heading-one", endId: "user-two", fallbackId: "response-container" },
      { startId: "nested-two", endId: "peer-two", fallbackId: "response-container" },
      { startId: "nested-three", endId: "peer-two", fallbackId: "response-container" },
      { startId: "peer-two", endId: "user-two", fallbackId: "response-container" },
      { startId: "user-two", endId: null, fallbackId: "response-container" },
      { startId: "final-heading", endId: null, fallbackId: "response-container" },
    ])

    adapter.resetWordCountCalls()
    const headingsOnly = adapter.extractOutline(6, false, true)
    expect(headingsOnly.map((item) => (item.element as TestOutlineElement).testId)).toEqual([
      "heading-one",
      "nested-two",
      "nested-three",
      "peer-two",
      "final-heading",
    ])
    expect(adapter.wordCountCalls).toEqual([
      { startId: "heading-one", endId: "user-two", fallbackId: "response-container" },
      { startId: "nested-two", endId: "peer-two", fallbackId: "response-container" },
      { startId: "nested-three", endId: "peer-two", fallbackId: "response-container" },
      { startId: "peer-two", endId: "user-two", fallbackId: "response-container" },
      { startId: "final-heading", endId: null, fallbackId: "response-container" },
    ])
  })

  it("reuses the outline for inline bookmarks and filters disconnected candidates", () => {
    const container = createContainer()
    const user = createElement(container, "user", 0, { userQuery: true })
    const disconnected = createElement(container, "disconnected", 1, {
      tagName: "H1",
      connected: false,
    })
    const connected = createElement(container, "connected", 2, { tagName: "H2" })
    container.queryOrder = [connected, disconnected, user]
    const adapter = new OutlineTestAdapter(createManifest(), container)

    expect(
      adapter.getInlineBookmarkItems().map((item) => (item.element as TestOutlineElement).testId),
    ).toEqual(["user", "connected"])
  })
})
