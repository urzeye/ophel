import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { findMatchingImageInDocument } from "~utils/exporter"

type TestImage = {
  getAttribute: (name: string) => string | null
  src: string
  currentSrc: string
  complete: boolean
  naturalWidth: number
  naturalHeight: number
  width: number
  height: number
}

function createImage(options: {
  src?: string
  currentSrc?: string
  attrs?: Record<string, string>
  complete?: boolean
  naturalWidth?: number
  naturalHeight?: number
  width?: number
  height?: number
}): TestImage {
  const src = options.src ?? ""
  const attrs = { ...(options.attrs ?? {}) }
  if (src && attrs.src === undefined) attrs.src = src

  return {
    getAttribute: (name: string) => attrs[name] ?? null,
    src,
    currentSrc: options.currentSrc ?? "",
    complete: options.complete ?? true,
    naturalWidth: options.naturalWidth ?? 0,
    naturalHeight: options.naturalHeight ?? options.naturalWidth ?? 0,
    width: options.width ?? options.naturalWidth ?? 0,
    height: options.height ?? options.naturalHeight ?? options.naturalWidth ?? 0,
  }
}

describe("exporter findMatchingImageInDocument", () => {
  const originalDocument = globalThis.document

  beforeEach(() => {
    const imageStore: TestImage[] = []

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

  function images(): TestImage[] {
    return (globalThis as Record<string, unknown>).__testImages as TestImage[]
  }

  it("returns null when no matching image in document", () => {
    images().push(
      createImage({
        src: "https://example.com/other.png",
        naturalWidth: 100,
      }),
    )

    expect(findMatchingImageInDocument("https://example.com/target.png")).toBeNull()
  })

  it("finds image matching src attribute", () => {
    const targetImage = createImage({
      src: "https://example.com/target.png",
      naturalWidth: 100,
    })
    images().push(targetImage)

    expect(findMatchingImageInDocument("https://example.com/target.png")).toBe(targetImage)
  })

  it("finds image matching currentSrc", () => {
    const targetImage = createImage({
      src: "https://example.com/preview.png",
      currentSrc: "https://example.com/target.png",
      naturalWidth: 120,
    })
    images().push(targetImage)

    expect(findMatchingImageInDocument("https://example.com/target.png")).toBe(targetImage)
  })

  it("finds image matching data-ophel-wm-source", () => {
    const targetImage = createImage({
      src: "data:image/png;base64,123",
      attrs: { "data-ophel-wm-source": "https://lh3.googleusercontent.com/target" },
      naturalWidth: 200,
    })
    images().push(targetImage)

    expect(findMatchingImageInDocument("https://lh3.googleusercontent.com/target")).toBe(
      targetImage,
    )
  })

  it("finds image matching data-ophel-export-image-src", () => {
    const targetImage = createImage({
      src: "data:image/png;base64,456",
      attrs: { "data-ophel-export-image-src": "https://lh3.googleusercontent.com/target2" },
      naturalWidth: 200,
    })
    images().push(targetImage)

    expect(findMatchingImageInDocument("https://lh3.googleusercontent.com/target2")).toBe(
      targetImage,
    )
  })

  it("does not treat the unused data-ophel-export-img-src typo as a source", () => {
    images().push(
      createImage({
        src: "https://example.com/other.png",
        attrs: { "data-ophel-export-img-src": "https://lh3.googleusercontent.com/target" },
        naturalWidth: 200,
      }),
    )

    expect(findMatchingImageInDocument("https://lh3.googleusercontent.com/target")).toBeNull()
  })

  it("matches googleusercontent display size suffixes to export URLs", () => {
    const targetImage = createImage({
      src: "https://lh3.googleusercontent.com/abc123=w400-h300",
      naturalWidth: 400,
      naturalHeight: 300,
    })
    images().push(targetImage)

    expect(findMatchingImageInDocument("https://lh3.googleusercontent.com/abc123=s0")).toBe(
      targetImage,
    )
  })

  it("still returns an image that has not finished loading", () => {
    const targetImage = createImage({
      src: "https://lh3.googleusercontent.com/loading=s0",
      complete: false,
      naturalWidth: 0,
      naturalHeight: 0,
      width: 0,
      height: 0,
    })
    images().push(targetImage)

    expect(findMatchingImageInDocument("https://lh3.googleusercontent.com/loading=s0")).toBe(
      targetImage,
    )
  })

  it("picks the largest matching image when several match", () => {
    const smallImage = createImage({
      src: "https://lh3.googleusercontent.com/abc123=w100-h80",
      naturalWidth: 100,
      naturalHeight: 80,
    })
    const largeImage = createImage({
      src: "data:image/png;base64,789",
      attrs: { "data-ophel-export-image-src": "https://lh3.googleusercontent.com/abc123=s0" },
      naturalWidth: 1024,
      naturalHeight: 768,
    })
    images().push(smallImage, largeImage)

    expect(findMatchingImageInDocument("https://lh3.googleusercontent.com/abc123=s0")).toBe(
      largeImage,
    )
  })
})
