import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest"

import type { SiteAdapter } from "~adapters/base"
import { AssistantMermaidRenderer } from "~core/assistant-mermaid-renderer"
import { DOMToolkit } from "~utils/dom-toolkit"
import { MutationElement, mutationRecord } from "../helpers/mutation-dom"

vi.mock("~adapters/base", () => ({
  normalizeAssistantMermaidSource: (source: string) => source.trim(),
}))
vi.mock("~utils/dom-toolkit", () => ({ DOMToolkit: { query: vi.fn(), each: vi.fn() } }))
vi.mock("~utils/i18n", () => ({ t: (key: string) => key }))
vi.mock("~utils/toast", () => ({ showToast: vi.fn() }))

type MermaidInternals = {
  injectStyles(): void
  initClickHandler(): void
  initMessageHandler(): void
  initFullscreenChangeHandler(): void
  cleanupInjectedPanels(): void
  processResponseElement(element: Element): void
  processMermaidBlock(element: HTMLElement, source: string, response: Element): Promise<void>
  getMermaidTheme(): "default" | "dark"
  ensurePanel(element: HTMLElement): HTMLElement
  ensurePreviewId(element: HTMLElement): string
  ensureRuntime(): Promise<void>
  requestRender(): Promise<void>
  cleanupPanel(element: HTMLElement): void
  applyRenderFallback(block: HTMLElement, panel: HTMLElement, source: string): void
}

let responses: MutationElement[]
let observers: Array<{ callback: MutationCallback; disconnect: ReturnType<typeof vi.fn> }>
let processResponse: MockInstance<MermaidInternals["processResponseElement"]>
let adapter: SiteAdapter
let renderer: AssistantMermaidRenderer | undefined

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  responses = [new MutationElement(".response"), new MutationElement(".response")]
  observers = []
  vi.stubGlobal("Element", MutationElement)
  vi.stubGlobal("document", {
    body: new MutationElement("body"),
    documentElement: new MutationElement("html"),
    hidden: false,
    hasFocus: () => true,
  })
  vi.stubGlobal("window", {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  })
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(callback: MutationCallback) {
        observers.push({ callback, disconnect: this.disconnect })
      }
    },
  )
  vi.mocked(DOMToolkit.query).mockImplementation(() => responses as unknown as Element[])
  vi.mocked(DOMToolkit.each).mockImplementation((_selector, callback) => {
    responses.forEach((response) => callback(response as unknown as Element, false))
    return vi.fn()
  })
  const prototype = AssistantMermaidRenderer.prototype as unknown as MermaidInternals
  for (const method of [
    "injectStyles",
    "initClickHandler",
    "initMessageHandler",
    "initFullscreenChangeHandler",
    "cleanupInjectedPanels",
  ] as const) {
    vi.spyOn(prototype, method).mockImplementation(() => {})
  }
  vi.spyOn(prototype, "getMermaidTheme").mockReturnValue("default")
  processResponse = vi.spyOn(prototype, "processResponseElement").mockImplementation(() => {})
  adapter = {
    getAssistantMermaidSupportMode: () => "fallback",
    getExportConfig: () => ({ assistantResponseSelector: ".response" }),
    usesShadowDOM: () => false,
  } as unknown as SiteAdapter
})

afterEach(() => {
  renderer?.stop()
  renderer = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("AssistantMermaidRenderer incremental work", () => {
  it("does not poll unchanged history on ordinary DOM sites", () => {
    renderer = new AssistantMermaidRenderer(adapter, true)
    vi.advanceTimersByTime(6000)
    expect(processResponse).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("batches streamed text changes and scans only the affected response", () => {
    renderer = new AssistantMermaidRenderer(adapter, true)
    vi.advanceTimersByTime(1500)
    processResponse.mockClear()
    expect(observers.length).toBe(1)
    for (let index = 0; index < 20; index++) {
      observers[0].callback(
        [mutationRecord({ parentElement: responses[1] }, { type: "characterData" })],
        {} as MutationObserver,
      )
    }
    vi.advanceTimersByTime(300)
    expect(processResponse).toHaveBeenCalledTimes(1)
    expect(processResponse.mock.calls[0][0] === (responses[1] as unknown as Element)).toBe(true)
  })

  it("does not schedule another pass for the renderer's own panels", () => {
    renderer = new AssistantMermaidRenderer(adapter, true)
    vi.advanceTimersByTime(1500)
    processResponse.mockClear()
    expect(observers.length).toBe(1)
    observers[0].callback(
      [mutationRecord(responses[0], { added: [new MutationElement(".gh-assistant-mermaid")] })],
      {} as MutationObserver,
    )
    vi.advanceTimersByTime(300)
    expect(processResponse).not.toHaveBeenCalled()
  })

  it("cancels initial and pending work on stop and can be re-enabled", () => {
    renderer = new AssistantMermaidRenderer(adapter, true)
    renderer.stop()
    processResponse.mockClear()
    vi.advanceTimersByTime(5000)
    expect(processResponse).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    renderer.updateSettings(true)
    vi.advanceTimersByTime(1500)
    expect(processResponse).toHaveBeenCalledTimes(2)
  })

  it("yields between batches instead of scanning all historical responses in one task", () => {
    responses = Array.from({ length: 80 }, () => new MutationElement(".response"))
    renderer = new AssistantMermaidRenderer(adapter, true)
    expect(processResponse).not.toHaveBeenCalled()
    vi.advanceTimersToNextTimer()
    expect(processResponse.mock.calls.length).toBeGreaterThan(0)
    expect(processResponse.mock.calls.length).toBeLessThanOrEqual(16)
    vi.runAllTimers()
    expect(processResponse).toHaveBeenCalledTimes(80)
  })

  it("updates diagram themes without restoring history polling", () => {
    renderer = new AssistantMermaidRenderer(adapter, true)
    vi.advanceTimersByTime(1500)
    processResponse.mockClear()
    vi.spyOn(renderer as unknown as MermaidInternals, "getMermaidTheme").mockReturnValue("dark")
    observers[0].callback(
      [mutationRecord(document.documentElement, { type: "attributes" })],
      {} as MutationObserver,
    )
    vi.advanceTimersByTime(300)
    expect(processResponse.mock.calls.length).toBe(2)
    processResponse.mockClear()
    observers[0].callback(
      [mutationRecord(document.body, { type: "attributes" })],
      {} as MutationObserver,
    )
    vi.advanceTimersByTime(300)
    expect(processResponse.mock.calls.length).toBe(0)
  })

  it("keeps the explicit Shadow DOM discovery fallback", () => {
    vi.spyOn(adapter, "usesShadowDOM").mockReturnValue(true)
    renderer = new AssistantMermaidRenderer(adapter, true)
    vi.advanceTimersByTime(4500)
    expect(processResponse.mock.calls.length).toBeGreaterThan(2)
    renderer.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("AssistantMermaidRenderer in-flight work", () => {
  function prepareBlock() {
    vi.stubGlobal("ShadowRoot", class {})
    const attributes = new Map<string, string>()
    const preview = {
      isConnected: true,
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      getAttribute: (name: string) => attributes.get(name),
    } as unknown as HTMLElement
    const panel = {
      isConnected: true,
      dataset: {},
      querySelector: () => preview,
    } as unknown as HTMLElement
    const block = { isConnected: true, getRootNode: () => document } as unknown as HTMLElement
    renderer = new AssistantMermaidRenderer(adapter, true)
    const internals = renderer as unknown as MermaidInternals
    vi.spyOn(internals, "getMermaidTheme").mockReturnValue("default")
    vi.spyOn(internals, "ensurePanel").mockReturnValue(panel)
    vi.spyOn(internals, "ensurePreviewId").mockReturnValue("preview-test")
    return { internals, block }
  }

  it("does not request the same diagram again while its first render is pending", async () => {
    const { internals, block } = prepareBlock()
    let finishRender!: () => void
    vi.spyOn(internals, "ensureRuntime").mockResolvedValue()
    const request = vi.spyOn(internals, "requestRender").mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRender = resolve
        }),
    )
    const first = internals.processMermaidBlock(block, "graph TD; A-->B", block)
    await Promise.resolve()
    const second = internals.processMermaidBlock(block, "graph TD; A-->B", block)
    await Promise.resolve()
    expect(request.mock.calls.length).toBe(1)
    renderer?.stop()
    finishRender()
    await Promise.all([first, second])
  })

  it("retries transient failures only for the affected response and with a finite budget", async () => {
    const { internals, block } = prepareBlock()
    vi.advanceTimersByTime(1500)
    processResponse.mockClear()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(internals, "cleanupPanel").mockImplementation(() => {})
    const fallback = vi.spyOn(internals, "applyRenderFallback").mockImplementation(() => {})
    vi.spyOn(internals, "ensureRuntime").mockRejectedValue(new Error("runtime is unavailable"))
    await internals.processMermaidBlock(block, "graph TD; A-->B", block)
    vi.advanceTimersByTime(2500)
    expect(processResponse.mock.calls.length).toBe(1)
    expect(processResponse.mock.calls[0][0] === block).toBe(true)
    await internals.processMermaidBlock(block, "graph TD; A-->B", block)
    await internals.processMermaidBlock(block, "graph TD; A-->B", block)
    expect(fallback.mock.calls.length).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not dispatch a render after being stopped while the runtime was loading", async () => {
    const { internals, block } = prepareBlock()
    let finishLoad!: () => void
    vi.spyOn(internals, "ensureRuntime").mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishLoad = resolve
        }),
    )
    const request = vi.spyOn(internals, "requestRender").mockResolvedValue()
    const render = internals.processMermaidBlock(block, "graph TD; A-->B", block)
    renderer?.stop()
    finishLoad()
    await render
    expect(request.mock.calls.length).toBe(0)
  })
})
