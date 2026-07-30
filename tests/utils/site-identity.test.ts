import { describe, expect, it } from "vitest"

import {
  createSiteInstanceKey,
  createSiteScopedStorageKey,
  normalizeSiteOrigin,
  resolvePersistedSiteInstanceKey,
  tryNormalizeSiteOrigin,
} from "~utils/site-identity"

describe("site instance identity", () => {
  it("canonicalizes supported origins and rejects invalid schemes", () => {
    expect(normalizeSiteOrigin("HTTPS://Chat.Example.com:443/thread?id=1")).toBe(
      "https://chat.example.com",
    )
    expect(normalizeSiteOrigin("http://Chat.Example.com:8080/path")).toBe(
      "http://chat.example.com:8080",
    )
    expect(tryNormalizeSiteOrigin("not a URL")).toBeNull()
    expect(() => normalizeSiteOrigin("ftp://chat.example.com/thread")).toThrow(
      "Unsupported site origin",
    )
  })

  it("preserves built-in IDs and requires an origin for SitePacks", () => {
    expect(createSiteInstanceKey("chatgpt")).toBe("chatgpt")
    expect(createSiteInstanceKey("pack:shared-chat", "https://One.Example/path")).toBe(
      "pack:shared-chat@https://one.example",
    )
    expect(() => createSiteInstanceKey("pack:shared-chat")).toThrow(
      "SitePack instance pack:shared-chat requires a runtime origin",
    )
  })

  it("encodes scoped-key segments without ambiguous separator collisions", () => {
    const first = createSiteScopedStorageKey(
      "pack:shared@https://one.example",
      "conversation:thread",
    )
    const second = createSiteScopedStorageKey(
      "pack:shared@https://one.example:conversation",
      "thread",
    )

    expect(first).not.toBe(second)
    expect(first).toBe("v1:pack%3Ashared%40https%3A%2F%2Fone.example:conversation%3Athread")
  })

  it("resolves persisted built-in, explicit instance, and legacy dynamic identities", () => {
    expect(resolvePersistedSiteInstanceKey({ siteId: "chatgpt" })).toBe("chatgpt")
    expect(
      resolvePersistedSiteInstanceKey({
        siteId: "pack:shared-chat",
        siteInstanceKey: "  pack:shared-chat@https://stored.example  ",
        url: "https://ignored.example/thread/1",
      }),
    ).toBe("pack:shared-chat@https://stored.example")
    expect(
      resolvePersistedSiteInstanceKey({
        siteId: "pack:shared-chat",
        url: "https://Legacy.Example:443/thread/1",
      }),
    ).toBe("pack:shared-chat@https://legacy.example")
    expect(
      resolvePersistedSiteInstanceKey({
        siteId: "pack:shared-chat",
        url: "invalid",
      }),
    ).toBeNull()
    expect(resolvePersistedSiteInstanceKey({})).toBeNull()
  })
})
