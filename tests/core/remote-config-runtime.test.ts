import { describe, expect, it, vi } from "vitest"

import type { PlatformStorage } from "~platform/types"

vi.mock("~utils/config", () => ({
  APP_VERSION: "1.1.8",
  IS_DEVELOPMENT_BUILD: false,
}))

import {
  resolveRuntimeRemoteConfigSources,
  resolveRuntimeTrustedRegistrySigningKeys,
} from "~core/remote-config-runtime"
import { LOCAL_DEV_REGISTRY_SIGNING_KEY_ID } from "~core/remote-config-local-dev"
import { TRUSTED_REGISTRY_SIGNING_KEYS } from "~core/remote-config-signature"
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

describe("runtime remote config signing keys", () => {
  it("keeps production trust list unchanged by default", () => {
    expect(resolveRuntimeTrustedRegistrySigningKeys(false)).toEqual(TRUSTED_REGISTRY_SIGNING_KEYS)
  })

  it("adds the fixed local-dev key only when explicitly enabled", () => {
    const keys = resolveRuntimeTrustedRegistrySigningKeys(true)
    expect(keys.map((key) => key.keyId)).toContain(LOCAL_DEV_REGISTRY_SIGNING_KEY_ID)
    expect(keys).toHaveLength(TRUSTED_REGISTRY_SIGNING_KEYS.length + 1)
  })
})
