import { describe, expect, it } from "vitest"

import { parseClaudeConversationPage } from "~adapters/claude-conversation-list"

const entry = {
  uuid: "11111111-1111-4111-8111-111111111111",
  name: "  Conversation title  ",
  is_starred: true,
}

describe("Claude conversation page", () => {
  it("parses the native v2 envelope and pinned metadata", () => {
    expect(parseClaudeConversationPage({ data: [entry], has_more: true })).toEqual({
      items: [
        {
          id: entry.uuid,
          title: "Conversation title",
          url: `/chat/${entry.uuid}`,
          isPinned: true,
        },
      ],
      hasMore: true,
    })
  })

  it("accepts an empty final page and untitled conversations", () => {
    expect(parseClaudeConversationPage({ data: [], has_more: false }).items).toEqual([])
    expect(
      parseClaudeConversationPage({
        data: [{ ...entry, name: "", is_starred: false }],
        has_more: false,
      }).items[0],
    ).toMatchObject({ title: "", isPinned: false })
  })

  it.each([
    null,
    [],
    { data: [], has_more: "false" },
    { data: [] },
    { has_more: false },
    { data: [null], has_more: false },
    { data: [{ ...entry, uuid: "not-a-conversation-id" }], has_more: false },
    { data: [{ ...entry, name: null }], has_more: false },
    { data: [{ ...entry, is_starred: undefined }], has_more: false },
  ])("rejects malformed responses instead of claiming sync completion: %j", (payload) => {
    expect(() => parseClaudeConversationPage(payload)).toThrow()
  })
})
