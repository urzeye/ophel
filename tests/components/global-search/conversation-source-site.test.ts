import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { resolveConversationSourceSite } from "~components/global-search/conversation-source-site"
import type { Conversation } from "~core/conversation-manager"
import { createSiteInstanceKey } from "~utils/site-identity"

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8")

const compact = (source: string): string => source.replace(/\s+/g, " ")

const createConversation = (
  overrides: Partial<Conversation> & Pick<Conversation, "id" | "siteId">,
): Conversation => ({
  title: overrides.id,
  url: overrides.url ?? "https://gemini.google.com/app/1",
  siteInstanceKey: overrides.siteInstanceKey ?? overrides.siteId,
  folderId: "inbox",
  createdAt: 1,
  updatedAt: 1,
  pinned: false,
  ...overrides,
})

const platformBySiteId = new Map([
  ["gemini", { name: "Gemini", icon: "🌟", faviconUrl: "https://gemini.google.com/favicon.ico" }],
  ["chatgpt", { name: "ChatGPT", icon: "💬", faviconUrl: "https://chatgpt.com/favicon.ico" }],
])

describe("resolveConversationSourceSite", () => {
  it("marks current-site conversations onsite and still returns catalog icon data", () => {
    const sourceSite = resolveConversationSourceSite({
      conversation: createConversation({ id: "local-1", siteId: "gemini" }),
      currentSiteInstanceKey: "gemini",
      platformBySiteId,
    })

    expect(sourceSite).toEqual({
      name: "Gemini",
      icon: "🌟",
      faviconUrl: "https://gemini.google.com/favicon.ico",
      isOffsite: false,
    })
  })

  it("marks other-site conversations offsite without dropping the same icon fields", () => {
    const sourceSite = resolveConversationSourceSite({
      conversation: createConversation({
        id: "remote-1",
        siteId: "chatgpt",
        url: "https://chatgpt.com/c/1",
        siteInstanceKey: "chatgpt",
      }),
      currentSiteInstanceKey: "gemini",
      platformBySiteId,
    })

    expect(sourceSite).toEqual({
      name: "ChatGPT",
      icon: "💬",
      faviconUrl: "https://chatgpt.com/favicon.ico",
      isOffsite: true,
    })
  })

  it("falls back to hostname and favicon when the site pack is missing from the catalog", () => {
    const siteId = "pack:missing"
    const origin = "https://chat.example.com"
    const sourceSite = resolveConversationSourceSite({
      conversation: createConversation({
        id: "pack-1",
        siteId,
        url: `${origin}/t/1`,
        siteInstanceKey: createSiteInstanceKey(siteId, origin),
      }),
      currentSiteInstanceKey: "gemini",
      platformBySiteId,
    })

    expect(sourceSite).toEqual({
      name: "chat.example.com",
      faviconUrl: "https://chat.example.com/favicon.ico",
      isOffsite: true,
    })
  })
})

describe("global search conversation title alignment", () => {
  it("gives every conversation result the same leading icon slot, and keeps the external badge off the title start", () => {
    const viewSource = compact(
      readSource("../../../src/components/global-search/GlobalSearchResultItemView.tsx"),
    )
    const dataSource = compact(
      readSource("../../../src/components/global-search/useGlobalSearchData.ts"),
    )
    const cssSource = compact(readSource("../../../src/styles/settings.css"))
    const appSource = compact(readSource("../../../src/components/App.tsx"))

    expect(dataSource).toContain("const sourceSite = resolveConversationSourceSite(")
    expect(dataSource).toContain("sourceSite,")
    expect(viewSource).toContain("isConversationItem && item.sourceSite")
    expect(viewSource).toContain('className="settings-search-conversation-head"')
    expect(viewSource).toContain('className="settings-search-conversation-site-icon"')
    expect(viewSource).toContain("item.sourceSite.isOffsite ? (")
    expect(viewSource).not.toContain("isConversationItem && item.offsiteSite")
    expect(cssSource).toContain(
      ".settings-search-conversation-site-icon { flex-shrink: 0; width: 14px; height: 14px; }",
    )
    expect(appSource).toContain("item.sourceSite?.isOffsite")
  })
})
