import type { ConversationInfo } from "./base"

export const GROK_CONVERSATIONS_PATH = "/rest/app-chat/conversations"

export interface GrokConversationPage {
  items: ConversationInfo[]
  nextPageToken: string | null
}

export function parseGrokConversationPage(payload: unknown): GrokConversationPage {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid Grok conversation page")
  }
  const page = payload as Record<string, unknown>
  if (!Array.isArray(page.conversations)) {
    throw new Error("Missing Grok conversation list")
  }
  if (page.nextPageToken != null && typeof page.nextPageToken !== "string") {
    throw new Error("Invalid Grok conversation page token")
  }

  const items = page.conversations.map((value: unknown): ConversationInfo => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid Grok conversation entry")
    }
    const entry = value as Record<string, unknown>
    if (
      typeof entry.conversationId !== "string" ||
      !entry.conversationId.trim() ||
      typeof entry.title !== "string" ||
      typeof entry.starred !== "boolean"
    ) {
      throw new Error("Invalid Grok conversation metadata")
    }
    return {
      id: entry.conversationId,
      title: entry.title.trim(),
      url: `/c/${encodeURIComponent(entry.conversationId)}`,
      isPinned: entry.starred,
    }
  })

  return {
    items,
    nextPageToken:
      typeof page.nextPageToken === "string" && page.nextPageToken.trim()
        ? page.nextPageToken
        : null,
  }
}
