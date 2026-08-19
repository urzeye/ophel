import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { findMatchingImageInDocument } from "~utils/exporter"

describe("exporter findMatchingImageInDocument", () => {
  const originalDocument = globalThis.document

  beforeEach(() => {
    // 构造测试所需的最小 DOM stub
    const imageStore: Array<{
      getAttribute: (name: string) => string | null
      src?: string
      currentSrc?: string
      complete: boolean
      naturalWidth: number
      width: number
    }> = []

    globalThis.document = {
      querySelectorAll: (selector: string) => {
        if (selector === "img") {
          return imageStore as unknown as NodeListOf<HTMLImageElement>
        }
        return [] as unknown as NodeListOf<Element>
      },
    } as unknown as Document
    ;(globalThis as Record<string, unknown>).__testImages = imageStore
  })

  afterEach(() => {
    globalThis.document = originalDocument
    delete (globalThis as Record<string, unknown>).__testImages
  })

  it("returns null when no matching image in document", () => {
    const images = (globalThis as Record<string, unknown>).__testImages as Array<
      Record<string, unknown>
    >
    images.push({
      getAttribute: (name: string) => (name === "src" ? "https://example.com/other.png" : null),
      src: "https://example.com/other.png",
      complete: true,
      naturalWidth: 100,
      width: 100,
    })

    expect(findMatchingImageInDocument("https://example.com/target.png")).toBeNull()
  })

  it("finds image matching src attribute", () => {
    const images = (globalThis as Record<string, unknown>).__testImages as Array<
      Record<string, unknown>
    >
    const targetImage = {
      getAttribute: (name: string) => (name === "src" ? "https://example.com/target.png" : null),
      src: "https://example.com/target.png",
      complete: true,
      naturalWidth: 100,
      width: 100,
    }
    images.push(targetImage)

    const found = findMatchingImageInDocument("https://example.com/target.png")
    expect(found).toBe(targetImage)
  })

  it("finds image matching data-ophel-wm-source", () => {
    const images = (globalThis as Record<string, unknown>).__testImages as Array<
      Record<string, unknown>
    >
    const targetImage = {
      getAttribute: (name: string) =>
        name === "data-ophel-wm-source" ? "https://lh3.googleusercontent.com/target" : null,
      src: "data:image/png;base64,123",
      complete: true,
      naturalWidth: 200,
      width: 200,
    }
    images.push(targetImage)

    const found = findMatchingImageInDocument("https://lh3.googleusercontent.com/target")
    expect(found).toBe(targetImage)
  })

  it("finds image matching data-ophel-export-image-src", () => {
    const images = (globalThis as Record<string, unknown>).__testImages as Array<
      Record<string, unknown>
    >
    const targetImage = {
      getAttribute: (name: string) =>
        name === "data-ophel-export-image-src" ? "https://lh3.googleusercontent.com/target2" : null,
      src: "data:image/png;base64,456",
      complete: true,
      naturalWidth: 200,
      width: 200,
    }
    images.push(targetImage)

    const found = findMatchingImageInDocument("https://lh3.googleusercontent.com/target2")
    expect(found).toBe(targetImage)
  })
})
