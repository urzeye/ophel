import type { Conversation } from "~core/conversation/types"

export const getSafeConversationOpenUrl = (conv: Conversation): string | null => {
  const rawUrl = (conv.url || "").trim()
  if (!rawUrl) return null

  try {
    const url = new URL(rawUrl, window.location.origin)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}
