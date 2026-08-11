import { describe, expect, it } from "vitest"

import {
  canonicalizeSitePackBindingOrigin,
  createSitePackOriginBindingsState,
} from "~core/site-pack-origin-bindings"

describe("canonicalizeSitePackBindingOrigin", () => {
  it("accepts exact HTTPS origins", () => {
    expect(canonicalizeSitePackBindingOrigin("https://Chat.Example.com/")).toBe(
      "https://chat.example.com",
    )
  })

  it("accepts exact HTTP origins for local debugging", () => {
    expect(canonicalizeSitePackBindingOrigin("http://127.0.0.1:3080")).toBe("http://127.0.0.1:3080")
  })

  it("rejects paths and wildcards", () => {
    expect(() => canonicalizeSitePackBindingOrigin("https://chat.example.com/app")).toThrow(
      /http\(s\) scheme and exact authority/,
    )
    expect(() => canonicalizeSitePackBindingOrigin("https://*.example.com")).toThrow(/wildcard/)
  })
})

describe("createSitePackOriginBindingsState", () => {
  it("keeps HTTP binding origins", () => {
    const state = createSitePackOriginBindingsState({
      "http://127.0.0.1:3080": { mode: "explicit", packId: "local-chat" },
    })
    expect(state.bindings["http://127.0.0.1:3080"]).toEqual({
      mode: "explicit",
      packId: "local-chat",
    })
  })
})
