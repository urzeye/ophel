import { describe, expect, it } from "vitest"

import { EVENT_CLEAR_ALL_DATA } from "~utils/messaging"
import { dispatchClearAllDataEvent, registerClearAllDataTask } from "~utils/clear-all-event"

describe("clear-all runtime event", () => {
  it("waits for every synchronously registered realm task", async () => {
    const calls: string[] = []
    let release = () => undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const listener = (event: Event) => {
      registerClearAllDataTask(
        event,
        pending.then(() => {
          calls.push("drained")
        }),
      )
    }
    window.addEventListener(EVENT_CLEAR_ALL_DATA, listener)

    let completed = false
    const dispatch = dispatchClearAllDataEvent().then(() => {
      completed = true
    })
    await Promise.resolve()
    expect(completed).toBe(false)

    release()
    await dispatch
    expect(calls).toEqual(["drained"])
    window.removeEventListener(EVENT_CLEAR_ALL_DATA, listener)
  })

  it("rejects when any registered realm cannot drain", async () => {
    const failure = new Error("UI writer failed")
    const listener = (event: Event) => {
      registerClearAllDataTask(event, Promise.reject(failure))
    }
    window.addEventListener(EVENT_CLEAR_ALL_DATA, listener)

    await expect(dispatchClearAllDataEvent()).rejects.toThrow(
      "Clear-all runtime preparation failed",
    )
    window.removeEventListener(EVENT_CLEAR_ALL_DATA, listener)
  })
})
