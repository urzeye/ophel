import { describe, expect, it, vi } from "vitest"

import type { PlatformStorage } from "~platform/types"

vi.mock("~utils/config", () => ({
  APP_VERSION: "1.1.8",
  IS_DEVELOPMENT_BUILD: false,
}))

import { resolveRuntimeRemoteConfigSources } from "~core/remote-config-runtime"
import { DEFAULT_REMOTE_CONFIG_SOURCES } from "~core/remote-config-types"

class MemoryStorage implements PlatformStorage {
  private value: unknown
  getCalls = 0

  async get<T>(_key: string): Promise<T | undefined> {
    this.getCalls += 1
    return this.value as T | undefined
  }

  setStoredValue(value: unknown): void {
    this.value = value
  }

  async set<T>(_key: string, _value: T): Promise<void> {}

  async remove(_key: string): Promise<void> {}

  watch<T>(
    _key: string,
    _callback: (newValue: T | undefined, oldValue: T | undefined) => void,
  ): () => void {
    return () => undefined
  }
}

describe("runtime remote config sources", () => {
  it("ignores persisted overrides when the build does not allow them", async () => {
    const storage = new MemoryStorage()

    await expect(resolveRuntimeRemoteConfigSources(storage, false)).resolves.toEqual(
      DEFAULT_REMOTE_CONFIG_SOURCES,
    )
    expect(storage.getCalls).toBe(0)
  })

  it("uses only the persisted source when development overrides are enabled", async () => {
    const storage = new MemoryStorage()
    storage.setStoredValue({
      state: {
        settings: {
          remoteConfig: {
            autoUpdate: true,
            registrySourceUrl: "https://staging.example.com/index.json",
          },
        },
      },
    })

    await expect(resolveRuntimeRemoteConfigSources(storage, true)).resolves.toEqual([
      "https://staging.example.com/index.json",
    ])
  })
})
