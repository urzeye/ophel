import { describe, expect, it } from "vitest"

import {
  classifyGeminiAssetUrl,
  isGeminiGeneratedImageUrl,
  normalizeGeminiImageUrl,
  normalizeGoogleusercontentImageUrl,
} from "~core/watermark/gemini-asset-url"

describe("gemini-asset-url", () => {
  describe("classifyGeminiAssetUrl & isGeminiGeneratedImageUrl", () => {
    it("recognizes generated image URLs", () => {
      const url = "https://lh3.googleusercontent.com/gg/sample-image-id=w456-h630"
      expect(isGeminiGeneratedImageUrl(url)).toBe(true)
      expect(classifyGeminiAssetUrl(url)).toEqual({
        family: "gg",
        variant: "",
        isPreview: true,
        isDownload: false,
      })
    })

    it("returns false for non-gemini googleusercontent URLs", () => {
      const url = "https://lh3.googleusercontent.com/a/ACg8ocLsample=w456-h630"
      expect(isGeminiGeneratedImageUrl(url)).toBe(false)
      expect(classifyGeminiAssetUrl(url)).toBeNull()
    })
  })

  describe("normalizeGeminiImageUrl", () => {
    it("converts dimension parameters to s0 for generated images", () => {
      const url = "https://lh3.googleusercontent.com/gg/abc=w456-h630"
      expect(normalizeGeminiImageUrl(url)).toBe("https://lh3.googleusercontent.com/gg/abc=s0")
    })
  })

  describe("normalizeGoogleusercontentImageUrl", () => {
    it("converts dimension parameters to s0 for user uploaded googleusercontent images", () => {
      const url = "https://lh3.googleusercontent.com/a/ACg8ocLsample=w456-h630"
      expect(normalizeGoogleusercontentImageUrl(url)).toBe(
        "https://lh3.googleusercontent.com/a/ACg8ocLsample=s0",
      )
    })

    it("converts size parameters to s0 for user uploaded googleusercontent images", () => {
      const url = "https://lh3.googleusercontent.com/drive-storage/xyz=s512"
      expect(normalizeGoogleusercontentImageUrl(url)).toBe(
        "https://lh3.googleusercontent.com/drive-storage/xyz=s0",
      )
    })

    it("preserves download tokens with s0", () => {
      const url = "https://lh3.googleusercontent.com/gg/abc=d"
      expect(normalizeGoogleusercontentImageUrl(url)).toBe(
        "https://lh3.googleusercontent.com/gg/abc=s0-d",
      )
    })

    it("ignores non-googleusercontent URLs", () => {
      const url = "https://example.com/image.png?w=456&h=630"
      expect(normalizeGoogleusercontentImageUrl(url)).toBe(url)
    })
  })
})
