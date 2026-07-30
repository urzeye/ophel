import { describe, expect, it } from "vitest"

import { getRemoteConfigRegistrySourceUrl, PersistedSettingsError } from "~utils/persisted-settings"

describe("persisted remote config source settings", () => {
  it("reads the source from Zustand and legacy settings shapes", () => {
    expect(
      getRemoteConfigRegistrySourceUrl({
        state: {
          settings: {
            remoteConfig: {
              autoUpdate: true,
              registrySourceUrl: " https://staging.example.com/index.json ",
            },
          },
        },
      }),
    ).toBe("https://staging.example.com/index.json")

    expect(
      getRemoteConfigRegistrySourceUrl({
        remoteConfig: { autoUpdate: true, registrySourceUrl: "http://localhost:8123/index.json" },
      }),
    ).toBe("http://localhost:8123/index.json")
  })

  it("treats an empty source as the default-source selection", () => {
    expect(getRemoteConfigRegistrySourceUrl(undefined)).toBeUndefined()
    expect(
      getRemoteConfigRegistrySourceUrl({
        remoteConfig: { autoUpdate: true, registrySourceUrl: "" },
      }),
    ).toBeUndefined()
  })

  it("rejects malformed persisted source values", () => {
    expect(() =>
      getRemoteConfigRegistrySourceUrl({
        remoteConfig: { autoUpdate: true, registrySourceUrl: 42 },
      }),
    ).toThrow(PersistedSettingsError)

    expect(() =>
      getRemoteConfigRegistrySourceUrl({
        remoteConfig: {
          autoUpdate: true,
          registrySourceUrl: "http://staging.example.com/index.json",
        },
      }),
    ).toThrow("must use HTTPS")
  })
})
