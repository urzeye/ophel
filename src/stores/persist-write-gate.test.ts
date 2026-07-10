import { describe, expect, it } from "vitest"

import { PersistWriteGate } from "./persist-write-gate"

describe("PersistWriteGate", () => {
  it("suppresses only writes triggered by the external update stack", () => {
    const gate = new PersistWriteGate()
    const states: boolean[] = []

    gate.runWithoutPersist(() => {
      states.push(gate.shouldSkipWrite())
    })
    states.push(gate.shouldSkipWrite())

    expect(states).toEqual([true, false])
  })

  it("restores writes when an external update throws", () => {
    const gate = new PersistWriteGate()

    expect(() =>
      gate.runWithoutPersist(() => {
        throw new Error("failed update")
      }),
    ).toThrow("failed update")
    expect(gate.shouldSkipWrite()).toBe(false)
  })
})
