import { getQueueStore } from "~stores/queue-store"
import { useSettingsStore } from "~stores/settings-store"
import { splitQueueLines } from "~utils/queue-batch"

export const QUEUE_ITEMS_ADDED_EVENT = "ophel:queueItemsAdded"

export type InjectContentToQueueResult =
  | { ok: true; count: number }
  | { ok: false; reason: "disabled" | "empty" }

export function injectContentToQueue(
  content: string,
  options: { splitByLine: boolean },
): InjectContentToQueueResult {
  const promptQueueEnabled =
    useSettingsStore.getState().settings.features?.prompts?.promptQueue ?? false

  if (!promptQueueEnabled) {
    return { ok: false, reason: "disabled" }
  }

  const store = getQueueStore()
  const items = options.splitByLine
    ? store.enqueueMany(splitQueueLines(content))
    : (() => {
        const trimmed = content.trim()
        if (!trimmed) return []
        return [store.enqueue(trimmed)]
      })()

  if (items.length === 0) {
    return { ok: false, reason: "empty" }
  }

  window.dispatchEvent(new CustomEvent(QUEUE_ITEMS_ADDED_EVENT))
  return { ok: true, count: items.length }
}
