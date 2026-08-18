import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

import { GeminiAdapter } from "~adapters/gemini"

describe("GeminiAdapter image export full size resolution", () => {
  const originalDocument = globalThis.document
  const originalWindow = globalThis.window

  beforeEach(() => {
    const listeners: Record<string, ((event: unknown) => void)[]> = {}

    globalThis.window = {
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        listeners[type] = listeners[type] || []
        listeners[type].push(listener)
      },
      removeEventListener: (type: string, listener: (event: unknown) => void) => {
        if (!listeners[type]) return
        listeners[type] = listeners[type].filter((l) => l !== listener)
      },
      postMessage: (data: unknown) => {
        const messageEvent = { source: globalThis.window, data }
        ;(listeners["message"] || []).forEach((l) => l(messageEvent))
      },
      setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms) as unknown as number,
      clearTimeout: (id: number) => clearTimeout(id),
    } as unknown as Window & typeof globalThis
    ;(globalThis as Record<string, unknown>).__testListeners = listeners
  })

  afterEach(() => {
    globalThis.document = originalDocument
    globalThis.window = originalWindow
  })

  it("finds download button in parent container for generated image", () => {
    const adapter = new GeminiAdapter()
    const mockButton = {
      click: () => {},
    }
    const mockContainer = {
      matches: () => false,
      querySelector: (selector: string) => {
        if (
          selector.includes("download-generated-image-button") ||
          selector.includes("下载完整尺寸")
        ) {
          return mockButton
        }
        return null
      },
      parentElement: null,
    }
    const mockImage = {
      parentElement: mockContainer,
    } as unknown as HTMLImageElement

    const adapterInternal = adapter as unknown as {
      findDownloadButtonForGeneratedImage: (image: HTMLImageElement) => HTMLElement | null
    }
    const found = adapterInternal.findDownloadButtonForGeneratedImage(mockImage)
    expect(found).toBe(mockButton)
  })

  it("finds download button by traversing ancestors when nested in single-image", () => {
    const adapter = new GeminiAdapter()
    const mockButton = { click: () => {} }

    const grandParentContainer = {
      matches: () => false,
      querySelector: (selector: string) => {
        if (selector.includes("download-generated-image-button")) {
          return mockButton
        }
        return null
      },
      parentElement: null,
    }

    const parentSingleImage = {
      matches: () => false,
      querySelector: () => null, // single-image does not have the button
      parentElement: grandParentContainer, // generated-image parent has the button
    }

    const mockImage = {
      parentElement: parentSingleImage,
    } as unknown as HTMLImageElement

    const adapterInternal = adapter as unknown as {
      findDownloadButtonForGeneratedImage: (image: HTMLImageElement) => HTMLElement | null
    }
    const found = adapterInternal.findDownloadButtonForGeneratedImage(mockImage)
    expect(found).toBe(mockButton)
  })
})
