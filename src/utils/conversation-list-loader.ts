import type { ConversationInfo, ConversationLoadOptions } from "~adapters/base"

export const CONVERSATION_LIST_READY_TIMEOUT_MS = 3200
// 首次全量同步的就绪等待：只需覆盖常见的侧栏慢渲染，
// 更晚就绪由 pending 重试机制接管，避免空账号/选择器失效时长时间空转
export const CONVERSATION_FULL_SYNC_READY_TIMEOUT_MS = 10000

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
  loadMore?: (container: Element) => void | Promise<void>
  isLoading?: () => boolean
  idleMs?: number
  idlePasses?: number
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
  idlePasses = 1,
  readyTimeoutMs = CONVERSATION_LIST_READY_TIMEOUT_MS,
  maxDurationMs = 90000,
  signal,
  onProgress,
}: ConversationListLoaderOptions): Promise<boolean> {
  signal?.throwIfAborted()
  const readyDeadline = Date.now() + readyTimeoutMs
  let container = getContainer()
  let initialItems = container ? readList() : []
  while ((!container || !initialItems.some((item) => item.id)) && Date.now() < readyDeadline) {
    await waitForConversationLoad(200, signal)
    container = getContainer()
    initialItems = container ? readList() : []
  }
  if (!container || !initialItems.some((item) => item.id)) return false

  const startedAt = Date.now()
  let idleCount = 0
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
    if (isLoading()) {
      await waitForConversationLoad(400, signal)
      collect()
      continue
    }

    await loadMore(container)
    let lastActivityAt = Date.now()
    let hasGrowth = false

    while (Date.now() - startedAt < maxDurationMs) {
      await waitForConversationLoad(400, signal)
      const currentContainer = getContainer()
      if (!currentContainer) return false
      if (collect()) {
        hasGrowth = true
        idleCount = 0
        lastActivityAt = Date.now()
      }
      if (currentContainer !== container) {
        idleCount = 0
        break
      }
      const loading = isLoading()
      if (loading) {
        lastActivityAt = Date.now()
      }
      if (hasGrowth && !loading) break

      if (Date.now() - lastActivityAt >= idleMs && !loading) {
        if (
          container.clientHeight > 0 &&
          container.scrollTop + container.clientHeight < container.scrollHeight - 1
        ) {
          idleCount = 0
          break
        }
        idleCount++
        if (idleCount < idlePasses) break
        onProgress?.(Array.from(seen.values()))
        return seen.size > 0
      }
    }
  }

  return false
}
