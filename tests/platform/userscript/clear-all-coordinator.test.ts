import { describe, expect, it, vi } from "vitest"

import { CLEAR_ALL_PREPARE_KEY } from "~utils/storage"

import {
  USERSCRIPT_RUNTIME_HEARTBEAT_PREFIX,
  UserscriptClearAllCoordinator,
  type UserscriptValueApi,
} from "~platform/userscript/clear-all-coordinator"

type Listener = Parameters<UserscriptValueApi["addValueChangeListener"]>[1]

const createSharedValueApis = () => {
  const values = new Map<string, unknown>()
  const listeners = new Map<number, { clientId: string; key: string; callback: Listener }>()
  let nextListenerId = 1

  const createApi = (clientId: string): UserscriptValueApi => ({
    getValue: (key) => values.get(key) as never,
    setValue: (key, value) => {
      const oldValue = values.get(key)
      values.set(key, value)
      for (const listener of listeners.values()) {
        if (listener.key === key) {
          listener.callback(key, oldValue, value, listener.clientId !== clientId)
        }
      }
    },
    deleteValue: (key) => {
      const oldValue = values.get(key)
      values.delete(key)
      for (const listener of listeners.values()) {
        if (listener.key === key) {
          listener.callback(key, oldValue, undefined, listener.clientId !== clientId)
        }
      }
    },
    listValues: () => [...values.keys()],
    addValueChangeListener: (key, callback) => {
      const listenerId = nextListenerId++
      listeners.set(listenerId, { clientId, key, callback })
      return listenerId
    },
    removeValueChangeListener: (listenerId) => {
      listeners.delete(listenerId)
    },
  })

  return { values, createApi }
}

const noHeartbeatTimer = {
  setInterval: () => 1 as unknown as ReturnType<typeof setInterval>,
  clearInterval: () => undefined,
}

describe("UserscriptClearAllCoordinator", () => {
  it("waits for every active remote runtime acknowledgement", async () => {
    const shared = createSharedValueApis()
    const prepareA = vi.fn().mockResolvedValue(undefined)
    const prepareB = vi.fn().mockResolvedValue(undefined)
    const coordinatorA = new UserscriptClearAllCoordinator(
      shared.createApi("a"),
      { prepareCurrentRuntime: prepareA, reloadCurrentRuntime: vi.fn() },
      { ...noHeartbeatTimer, instanceId: "a", sleep: async () => Promise.resolve() },
    )
    const coordinatorB = new UserscriptClearAllCoordinator(
      shared.createApi("b"),
      { prepareCurrentRuntime: prepareB, reloadCurrentRuntime: vi.fn() },
      { ...noHeartbeatTimer, instanceId: "b" },
    )
    coordinatorA.start()
    coordinatorB.start()

    await coordinatorA.prepareRemoteRuntimes()

    expect(prepareA).not.toHaveBeenCalled()
    expect(prepareB).toHaveBeenCalledOnce()
    coordinatorA.complete()
    expect(shared.values.has(CLEAR_ALL_PREPARE_KEY)).toBe(false)
    coordinatorA.stop()
    coordinatorB.stop()
  })

  it("rejects when a remote runtime reports a preparation failure", async () => {
    const shared = createSharedValueApis()
    const coordinatorA = new UserscriptClearAllCoordinator(
      shared.createApi("a"),
      { prepareCurrentRuntime: vi.fn(), reloadCurrentRuntime: vi.fn() },
      { ...noHeartbeatTimer, instanceId: "a", sleep: async () => Promise.resolve() },
    )
    const coordinatorB = new UserscriptClearAllCoordinator(
      shared.createApi("b"),
      {
        prepareCurrentRuntime: vi.fn().mockRejectedValue(new Error("runtime cleanup failed")),
        reloadCurrentRuntime: vi.fn(),
      },
      { ...noHeartbeatTimer, instanceId: "b" },
    )
    coordinatorA.start()
    coordinatorB.start()

    await expect(coordinatorA.prepareRemoteRuntimes()).rejects.toThrow("runtime cleanup failed")
    coordinatorA.abort()
    coordinatorA.stop()
    coordinatorB.stop()
  })

  it("times out instead of clearing while an active runtime is unresponsive", async () => {
    const shared = createSharedValueApis()
    let now = 100
    shared.values.set(`${USERSCRIPT_RUNTIME_HEARTBEAT_PREFIX}missing`, { updatedAt: now })
    const coordinator = new UserscriptClearAllCoordinator(
      shared.createApi("a"),
      { prepareCurrentRuntime: vi.fn(), reloadCurrentRuntime: vi.fn() },
      {
        ...noHeartbeatTimer,
        instanceId: "a",
        now: () => now,
        ackTimeoutMs: 20,
        ackPollIntervalMs: 10,
        sleep: async (delay) => {
          now += delay
        },
      },
    )
    coordinator.start()

    await expect(coordinator.prepareRemoteRuntimes()).rejects.toThrow(
      "Timed out waiting for 1 userscript runtime(s)",
    )
    coordinator.abort()
    coordinator.stop()
  })

  it("blocks startup for a live prepare signal and discards a stale signal", async () => {
    const shared = createSharedValueApis()
    const prepareCurrentRuntime = vi.fn().mockResolvedValue(undefined)
    const reloadCurrentRuntime = vi.fn()
    shared.values.set(CLEAR_ALL_PREPARE_KEY, {
      transactionId: "live",
      requestedAt: 900,
    })
    const liveCoordinator = new UserscriptClearAllCoordinator(
      shared.createApi("live"),
      { prepareCurrentRuntime, reloadCurrentRuntime },
      { ...noHeartbeatTimer, instanceId: "live", now: () => 1000 },
    )

    expect(liveCoordinator.start()).toEqual({ clearPending: true })
    await Promise.resolve()
    expect(prepareCurrentRuntime).toHaveBeenCalledOnce()
    shared.createApi("coordinator").deleteValue(CLEAR_ALL_PREPARE_KEY)
    expect(reloadCurrentRuntime).toHaveBeenCalledOnce()
    liveCoordinator.stop()

    shared.values.set(CLEAR_ALL_PREPARE_KEY, {
      transactionId: "stale",
      requestedAt: 1,
    })
    const staleCoordinator = new UserscriptClearAllCoordinator(
      shared.createApi("stale"),
      { prepareCurrentRuntime: vi.fn(), reloadCurrentRuntime: vi.fn() },
      {
        ...noHeartbeatTimer,
        instanceId: "stale",
        now: () => 100000,
        prepareSignalTtlMs: 1000,
      },
    )

    expect(staleCoordinator.start()).toEqual({ clearPending: false })
    expect(shared.values.has(CLEAR_ALL_PREPARE_KEY)).toBe(false)
    staleCoordinator.stop()
  })
})
