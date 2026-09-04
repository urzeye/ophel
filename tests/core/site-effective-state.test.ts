import { describe, expect, it } from "vitest"

import { createSupportedAiPlatform, SITE_IDS } from "~constants/defaults"
import { isQuickAccessTileDisabled, resolveSiteEffectiveState } from "~core/site-effective-state"

const createBuiltin = (id: string, host: string) =>
  createSupportedAiPlatform({
    id,
    name: id,
    matchPatterns: [`https://${host}/*`],
    entryUrls: [`https://${host}/`],
    icon: id,
  })

const createPack = (packId: string, host: string) =>
  createSupportedAiPlatform({
    id: `pack:${packId}`,
    name: packId,
    matchPatterns: [`https://${host}/*`],
    entryUrls: [`https://${host}/`],
    icon: packId,
  })

const doubao = createBuiltin(SITE_IDS.DOUBAO, "www.doubao.com")
const doubaoPack = createPack("doubao-lite", "www.doubao.com")
const DOUBAO_URL = "https://www.doubao.com/chat/123"

describe("resolveSiteEffectiveState", () => {
  it("returns supported for an enabled built-in site", () => {
    const state = resolveSiteEffectiveState([doubao], DOUBAO_URL, [])
    expect(state.status).toBe("supported")
    expect(state.platform?.id).toBe(SITE_IDS.DOUBAO)
    expect(state.builtinPlatform?.id).toBe(SITE_IDS.DOUBAO)
  })

  it("returns disabled for a disabled built-in site without a pack", () => {
    const state = resolveSiteEffectiveState([doubao], DOUBAO_URL, [SITE_IDS.DOUBAO])
    expect(state.status).toBe("disabled")
    expect(state.platform?.id).toBe(SITE_IDS.DOUBAO)
  })

  it("lets an installed pack take over a disabled built-in site", () => {
    const state = resolveSiteEffectiveState([doubao, doubaoPack], DOUBAO_URL, [SITE_IDS.DOUBAO])
    expect(state.status).toBe("via-pack")
    expect(state.platform?.id).toBe("pack:doubao-lite")
    expect(state.builtinPlatform?.id).toBe(SITE_IDS.DOUBAO)
  })

  it("prefers the built-in platform over a pack when the built-in is enabled", () => {
    const state = resolveSiteEffectiveState([doubaoPack, doubao], DOUBAO_URL, [])
    expect(state.status).toBe("supported")
    expect(state.platform?.id).toBe(SITE_IDS.DOUBAO)
  })

  it("returns supported for a pack-only site", () => {
    const pack = createPack("custom-ai", "custom.ai")
    const state = resolveSiteEffectiveState([pack], "https://custom.ai/chat", [])
    expect(state.status).toBe("supported")
    expect(state.platform?.id).toBe("pack:custom-ai")
    expect(state.builtinPlatform).toBeNull()
  })

  it("returns unsupported when nothing matches", () => {
    const state = resolveSiteEffectiveState([doubao], "https://example.com/", [])
    expect(state.status).toBe("unsupported")
    expect(state.platform).toBeNull()
    expect(state.builtinPlatform).toBeNull()
  })

  it("returns unsupported for an invalid url instead of throwing", () => {
    const state = resolveSiteEffectiveState([doubao], "not-a-url", [])
    expect(state.status).toBe("unsupported")
  })
})

describe("isQuickAccessTileDisabled", () => {
  it("marks disabled built-in tiles only", () => {
    expect(isQuickAccessTileDisabled(doubao, [SITE_IDS.DOUBAO])).toBe(true)
    expect(isQuickAccessTileDisabled(doubao, [])).toBe(false)
    expect(isQuickAccessTileDisabled(doubaoPack, [SITE_IDS.DOUBAO])).toBe(false)
  })
})
