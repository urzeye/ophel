import { describe, expect, it } from "vitest"

import { SUPPORTED_SITES } from "~constants/supported-sites"
import { resolveAdapterModuleKey } from "~adapters/index"

describe("resolveAdapterModuleKey", () => {
  const supportedHosts = SUPPORTED_SITES.flatMap((site) =>
    site.matches.map((match) => [new URL(match.replace(/\*$/, "")).hostname, site.module] as const),
  )

  it.each(supportedHosts)("routes %s to %s", (hostname, moduleKey) => {
    expect(resolveAdapterModuleKey(hostname)).toBe(moduleKey)
  })

  it.each(["example.com", "chat.openai.com", "claude.com", "qianwen.com"])(
    "does not load an adapter for unsupported or redirect-only hostname %s",
    (hostname) => {
      expect(resolveAdapterModuleKey(hostname)).toBeNull()
    },
  )
})
