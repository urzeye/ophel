import { describe, expect, it, vi } from "vitest"

import { runClearAllTransaction } from "~utils/clear-all-transaction"

describe("runClearAllTransaction", () => {
  it("runs prepare, clear, and commit in order", async () => {
    const calls: string[] = []

    await runClearAllTransaction({
      prepare: () => {
        calls.push("prepare")
      },
      clear: () => {
        calls.push("clear")
      },
      commit: () => {
        calls.push("commit")
      },
      abort: () => {
        calls.push("abort")
      },
    })

    expect(calls).toEqual(["prepare", "clear", "commit"])
  })

  it.each(["prepare", "clear", "commit"] as const)(
    "runs abort and preserves the original error when %s fails",
    async (failedStep) => {
      const calls: string[] = []
      const failure = new Error(`${failedStep} failed`)
      const step = (name: "prepare" | "clear" | "commit") => () => {
        calls.push(name)
        if (name === failedStep) throw failure
      }

      await expect(
        runClearAllTransaction({
          prepare: step("prepare"),
          clear: step("clear"),
          commit: step("commit"),
          abort: () => {
            calls.push("abort")
          },
        }),
      ).rejects.toBe(failure)

      expect(calls.at(-1)).toBe("abort")
    },
  )

  it("reports an abort failure without replacing the transaction error", async () => {
    const failure = new Error("clear failed")
    const abortFailure = new Error("resume failed")
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(
      runClearAllTransaction({
        prepare: () => undefined,
        clear: () => {
          throw failure
        },
        commit: () => undefined,
        abort: () => {
          throw abortFailure
        },
      }),
    ).rejects.toBe(failure)

    expect(consoleError).toHaveBeenCalledWith(
      "[Ophel] Failed to resume runtimes after clear-all failure:",
      abortFailure,
    )
  })
})
