import { EVENT_CLEAR_ALL_DATA } from "~utils/messaging"

interface ClearAllDataEventDetail {
  waitUntil: (task: Promise<unknown>) => void
}

const getEventDetail = (event: Event): ClearAllDataEventDetail | null => {
  const detail = (event as CustomEvent<unknown>).detail
  if (
    typeof detail !== "object" ||
    detail === null ||
    !("waitUntil" in detail) ||
    typeof detail.waitUntil !== "function"
  ) {
    return null
  }
  return detail as ClearAllDataEventDetail
}

export function registerClearAllDataTask(event: Event, task: Promise<unknown>): void {
  const detail = getEventDetail(event)
  if (detail) {
    detail.waitUntil(task)
    return
  }

  void task.catch((error) => {
    console.error("[Ophel] Untracked clear-all task failed:", error)
  })
}

export async function dispatchClearAllDataEvent(): Promise<void> {
  const tasks: Promise<unknown>[] = []
  const detail: ClearAllDataEventDetail = {
    waitUntil: (task) => tasks.push(Promise.resolve(task)),
  }

  window.dispatchEvent(new CustomEvent(EVENT_CLEAR_ALL_DATA, { detail }))

  const results = await Promise.allSettled(tasks)
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  )
  if (failures.length > 0) {
    throw new AggregateError(failures, "Clear-all runtime preparation failed")
  }
}
