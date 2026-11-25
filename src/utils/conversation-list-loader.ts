import type { ConversationInfo, ConversationLoadOptions } from "~adapters/base"

export const CONVERSATION_LIST_READY_TIMEOUT_MS = 90000

export function waitForConversationLoad(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason)

  return new Promise((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      resolve()
    }
    const abort = () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      reject(signal?.reason)
    }
    const timer = setTimeout(finish, ms)
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) abort()
  })
}

interface ConversationListLoaderOptions extends ConversationLoadOptions {
  getContainer: () => Element | null
  readList: () => ConversationInfo[]
  loadMore?: (container: Element) => void
  isLoading?: () => boolean
  idleMs?: number
  maxDurationMs?: number
}

export async function loadConversationList({
  getContainer,
  readList,
  loadMore = (container) => {
    container.scrollTop = container.scrollHeight
    container.dispatchEvent(new Event("scroll", { bubbles: true }))
  },
  isLoading = () => false,
  idleMs = 3200,
  maxDurationMs = 90000,
  signal,
  onProgress,
}: ConversationListLoaderOptions): Promise<boolean> {
  signal?.throwIfAborted()
  const readyDeadline = Date.now() + CONVERSATION_LIST_READY_TIMEOUT_MS
  let container = getContainer()
  let initialItems = container ? readList() : []
  while ((!container || !initialItems.some((item) => item.id)) && Date.now() < readyDeadline) {
    await waitForConversationLoad(200, signal)
    container = getContainer()
    initialItems = container ? readList() : []
  }
  if (!container || !initialItems.some((item) => item.id)) return false

  const startedAt = Date.now()
  const seen = new Map<string, ConversationInfo>()
  const collect = () => {
    const previousCount = seen.size
    const items = readList()
    items.forEach((item) => {
      if (item.id) seen.set(item.id, item)
    })
    if (seen.size > previousCount) onProgress?.(Array.from(seen.values()))
    return seen.size > previousCount
  }

  if (!collect()) onProgress?.([])
  while (Date.now() - startedAt < maxDurationMs) {
    signal?.throwIfAborted()
    container = getContainer()
    if (!container) return false

    loadMore(container)
    const requestedAt = Date.now()
    let hasGrowth = false

    while (Date.now() - startedAt < maxDurationMs) {
      await waitForConversationLoad(400, signal)
      if (!getContainer()) return false
      if (collect()) {
        hasGrowth = true
      }
      if (hasGrowth && !isLoading()) break

      const waitingMs = Date.now() - requestedAt
      if (waitingMs >= idleMs && !isLoading()) {
        onProgress?.(Array.from(seen.values()))
        return seen.size > 0
      }
      if (waitingMs >= Math.max(idleMs, 10000)) return false
    }

    if (!hasGrowth) return false
  }

  return false
}
