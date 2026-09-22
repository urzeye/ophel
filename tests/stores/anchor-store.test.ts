import { describe, expect, it } from "vitest"

import { withAnchorOp } from "~stores/anchor-store"

/** 可被 signal 中断的慢操作，模拟去顶部的历史懒加载 */
const interruptibleOp = (name: string, log: string[], delayMs = 20) =>
  withAnchorOp(async (signal) => {
    log.push(`${name}:start`)
    await new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve()
        return
      }
      const timer = setTimeout(resolve, delayMs)
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
    })
    log.push(`${name}:end:${signal.aborted ? "aborted" : "finished"}`)
    return name
  })

describe("withAnchorOp", () => {
  it("runs a single operation and returns its result", async () => {
    await expect(withAnchorOp(async () => 42)).resolves.toBe(42)
  })

  it("serializes fast operations in click order without dropping them", async () => {
    const order: string[] = []
    await Promise.all([
      withAnchorOp(async () => {
        order.push("a")
      }),
      withAnchorOp(async () => {
        order.push("b")
      }),
      withAnchorOp(async () => {
        order.push("c")
      }),
    ])
    expect(order).toEqual(["a", "b", "c"])
  })

  it("preempts a slow in-flight operation instead of ignoring the new click", async () => {
    const log: string[] = []
    const slow = interruptibleOp("slow", log, 5000)
    const fast = withAnchorOp(async () => {
      log.push("fast:start")
      return "fast"
    })

    await expect(fast).resolves.toBe("fast")
    await expect(slow).resolves.toBe("slow")
    expect(log).toEqual(["slow:start", "slow:end:aborted", "fast:start"])
  })

  it("keeps read-scroll-write sequences non-overlapping under rapid clicks", async () => {
    // #848 场景：读位置 -> 异步滚动 -> 写锚点，两个操作不得交错
    const log: string[] = []
    await Promise.all([interruptibleOp("a", log), interruptibleOp("b", log)])
    expect(log).toEqual(["a:start", "a:end:aborted", "b:start", "b:end:finished"])
  })

  it("gives each operation a fresh, non-aborted signal", async () => {
    const first = withAnchorOp(async () => "first")
    const second = withAnchorOp(async (signal) => {
      expect(signal.aborted).toBe(false)
      return "second"
    })
    await expect(first).resolves.toBe("first")
    await expect(second).resolves.toBe("second")
  })

  it("releases the lock when an operation throws", async () => {
    await expect(
      withAnchorOp(async () => {
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
    await expect(withAnchorOp(async () => "recovered")).resolves.toBe("recovered")
  })
})
