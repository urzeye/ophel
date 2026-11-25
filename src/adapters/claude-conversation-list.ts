import type { ConversationInfo } from "./base"

export const CLAUDE_CONVERSATIONS_PATH_PATTERN =
  "^/api/organizations/([a-f0-9-]+)/chat_conversations_v2$"

export interface ClaudeConversationPage {
  items: ConversationInfo[]
  hasMore: boolean
}

export function parseClaudeConversationPage(payload: unknown): ClaudeConversationPage {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid Claude conversation page")
  }
  const page = payload as Record<string, unknown>
  if (!Array.isArray(page.data) || typeof page.has_more !== "boolean") {
    throw new Error("Invalid Claude conversation pagination")
  }

  const items = page.data.map((value: unknown): ConversationInfo => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid Claude conversation entry")
    }
    const entry = value as Record<string, unknown>
    if (
      typeof entry.uuid !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(entry.uuid) ||
      typeof entry.name !== "string" ||
      typeof entry.is_starred !== "boolean"
    ) {
      throw new Error("Invalid Claude conversation metadata")
    }
    return {
      id: entry.uuid,
      title: entry.name.trim(),
      url: `/chat/${encodeURIComponent(entry.uuid)}`,
      isPinned: entry.is_starred,
    }
  })

  return { items, hasMore: page.has_more }
}
