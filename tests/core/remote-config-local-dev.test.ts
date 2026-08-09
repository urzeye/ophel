import { describe, expect, it } from "vitest"

import {
  getLocalDevRegistryIndexUrl,
  isLoopbackRegistrySourceUrl,
  shouldAllowRegistryRevisionReset,
  shouldRelaxRegistryRevisionGuards,
} from "~core/remote-config-local-dev"

describe("local dev registry helpers", () => {
  it("detects loopback registry URLs", () => {
    expect(isLoopbackRegistrySourceUrl(getLocalDevRegistryIndexUrl())).toBe(true)
    expect(isLoopbackRegistrySourceUrl("http://localhost:8787/index.json")).toBe(true)
    expect(
      isLoopbackRegistrySourceUrl(
        "https://cdn.jsdelivr.net/gh/urzeye/ophel@registry-dist/index.json",
      ),
    ).toBe(false)
  })

  it("only allows revision reset across local/production boundaries", () => {
    const local = getLocalDevRegistryIndexUrl()
    const production = "https://cdn.jsdelivr.net/gh/urzeye/ophel@registry-dist/index.json"
    const productionRaw = "https://raw.githubusercontent.com/urzeye/ophel/registry-dist/index.json"

    expect(shouldAllowRegistryRevisionReset(local, production)).toBe(true)
    expect(shouldAllowRegistryRevisionReset(production, local)).toBe(true)
    expect(shouldAllowRegistryRevisionReset(production, productionRaw)).toBe(false)
    expect(shouldAllowRegistryRevisionReset(undefined, local)).toBe(false)
    expect(shouldAllowRegistryRevisionReset(local, local)).toBe(false)
  })

  it("relaxes guards for any loopback check and for local/production switches", () => {
    const local = getLocalDevRegistryIndexUrl()
    const production = "https://cdn.jsdelivr.net/gh/urzeye/ophel@registry-dist/index.json"
    const productionRaw = "https://raw.githubusercontent.com/urzeye/ophel/registry-dist/index.json"

    expect(shouldRelaxRegistryRevisionGuards(local, local)).toBe(true)
    expect(shouldRelaxRegistryRevisionGuards(production, local)).toBe(true)
    expect(shouldRelaxRegistryRevisionGuards(local, production)).toBe(true)
    expect(shouldRelaxRegistryRevisionGuards(production, productionRaw)).toBe(false)
    expect(shouldRelaxRegistryRevisionGuards(undefined, production)).toBe(false)
  })
})
