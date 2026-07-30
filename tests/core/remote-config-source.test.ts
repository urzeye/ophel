import { describe, expect, it } from "vitest"

import { normalizeRemoteConfigSourceUrl } from "~core/remote-config-source"

describe("remote config source URLs", () => {
  it("normalizes HTTPS sources and allows local HTTP development sources", () => {
    expect(normalizeRemoteConfigSourceUrl(" https://staging.example.com/index.json ")).toBe(
      "https://staging.example.com/index.json",
    )
    expect(normalizeRemoteConfigSourceUrl("http://localhost:8123/index.json")).toBe(
      "http://localhost:8123/index.json",
    )
    expect(normalizeRemoteConfigSourceUrl("http://127.0.0.1:8123/index.json")).toBe(
      "http://127.0.0.1:8123/index.json",
    )
  })

  it("rejects empty, invalid, and non-HTTPS remote sources", () => {
    expect(() => normalizeRemoteConfigSourceUrl("")).toThrow("must not be empty")
    expect(() => normalizeRemoteConfigSourceUrl("not a URL")).toThrow("Invalid registry source URL")
    expect(() => normalizeRemoteConfigSourceUrl("http://staging.example.com/index.json")).toThrow(
      "must use HTTPS",
    )
    expect(() => normalizeRemoteConfigSourceUrl("ftp://staging.example.com/index.json")).toThrow(
      "must use HTTPS",
    )
  })
})
