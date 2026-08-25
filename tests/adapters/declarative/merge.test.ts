import { describe, expect, it, vi } from "vitest"

import exampleManifest from "../../../registry/examples/site-pack.example.json"
import {
  applyMergedConfig,
  deepMergeSiteConfig,
  resolveSiteConfig,
  SiteConfigResolutionError,
  supportsBuiltinSiteConfig,
  supportsMergedConfig,
  type ResolveSiteConfigOptions,
  type SiteConfigLayerOutcome,
  type SiteConfigPatchSkipReason,
} from "~adapters/declarative/merge"
import type { BuiltinSiteConfig } from "~adapters/declarative/types"

const MANIFEST_ONLY_KEYS = [
  "schemaVersion",
  "id",
  "version",
  "minAppVersion",
  "name",
  "nameI18n",
  "description",
  "descriptionI18n",
  "matches",
  "logoUrl",
] as const

const createBaseConfig = (): BuiltinSiteConfig => {
  const config = structuredClone(exampleManifest) as unknown as Record<string, unknown>
  for (const key of MANIFEST_ONLY_KEYS) {
    delete config[key]
  }
  return config as unknown as BuiltinSiteConfig
}

const createPatch = (
  config: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  targetSiteId: "test-site",
  patchSchemaVersion: 1,
  patchVersion: 2,
  baseConfigVersion: 3,
  minAppVersion: "1.1.8",
  maxAppVersion: "1.3.0",
  ...overrides,
  config,
})

const createResolutionOptions = (
  overrides: Partial<ResolveSiteConfigOptions<BuiltinSiteConfig>> = {},
): ResolveSiteConfigOptions<BuiltinSiteConfig> => ({
  siteId: "test-site",
  appVersion: "1.2.0",
  configVersion: 3,
  baseConfig: createBaseConfig(),
  ...overrides,
})

const expectLayerError = (
  outcome: SiteConfigLayerOutcome,
  path: string,
  stage: "validation" | "merged-config",
): void => {
  expect(outcome).toMatchObject({
    status: "rejected",
    stage,
  })
  expect(outcome.errors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path,
      }),
    ]),
  )
}

describe("deepMergeSiteConfig", () => {
  it("recursively merges nested objects without mutating the base config", () => {
    const baseConfig = createBaseConfig()
    baseConfig.session = {
      ...baseConfig.session,
      newTabPath: "/base",
      sharePathPrefix: "/share/",
    }

    const merged = deepMergeSiteConfig(baseConfig, {
      session: {
        newTabPath: "/override",
      },
    })

    expect(merged).not.toBe(baseConfig)
    expect(merged.session).not.toBe(baseConfig.session)
    expect(merged.session).toMatchObject({
      idFromPathRegex: "^/chat/([^/?#]+)$",
      newTabPath: "/override",
      sharePathPrefix: "/share/",
    })
    expect(baseConfig.session?.newTabPath).toBe("/base")
  })

  it("replaces arrays atomically and clones their values", () => {
    const baseConfig = createBaseConfig()
    const replacement = ["article[data-override]"]

    const merged = deepMergeSiteConfig(baseConfig, {
      selectors: {
        chatContent: replacement,
      },
    })

    expect(merged.selectors.chatContent).toEqual(replacement)
    expect(merged.selectors.chatContent).not.toBe(replacement)
    expect(merged.selectors.chatContent).not.toBe(baseConfig.selectors.chatContent)
    expect(baseConfig.selectors.chatContent).toEqual(["article[data-message]"])
  })

  it("deletes keys when the override value is null", () => {
    const baseConfig = createBaseConfig()
    baseConfig.quickQuote = "enabled"

    const merged = deepMergeSiteConfig(baseConfig, {
      quickQuote: null,
    })

    expect(Object.hasOwn(merged, "quickQuote")).toBe(false)
    expect(baseConfig.quickQuote).toBe("enabled")
  })
})

describe("resolveSiteConfig layer precedence", () => {
  it("applies the remote patch before the user override", () => {
    const baseConfig = createBaseConfig()
    const result = resolveSiteConfig(
      createResolutionOptions({
        baseConfig,
        remotePatch: createPatch({
          selectors: {
            responseContainer: "main[data-remote]",
          },
          session: {
            newTabPath: "/remote",
          },
        }),
        userOverride: {
          selectors: {
            responseContainer: "main[data-user]",
          },
          session: {
            sharePathPrefix: "/user-share/",
          },
        },
      }),
    )

    expect(result.remotePatch).toEqual({
      status: "applied",
      patchVersion: 2,
    })
    expect(result.userOverride).toEqual({
      status: "applied",
    })
    expect(result.config.selectors.responseContainer).toBe("main[data-user]")
    expect(result.config.session).toMatchObject({
      newTabPath: "/remote",
      sharePathPrefix: "/user-share/",
    })
    expect(baseConfig.selectors.responseContainer).toBe("main[data-example-chat]")
  })

  it("reports absent layers and still returns an isolated config clone", () => {
    const baseConfig = createBaseConfig()
    const result = resolveSiteConfig(createResolutionOptions({ baseConfig }))

    expect(result.remotePatch).toEqual({ status: "absent" })
    expect(result.userOverride).toEqual({ status: "absent" })
    expect(result.config).toEqual(baseConfig)
    expect(result.config).not.toBe(baseConfig)
    expect(result.config.selectors).not.toBe(baseConfig.selectors)
  })

  interface SkipCase {
    name: string
    patchOverrides: Record<string, unknown>
    appVersion?: string
    reason: SiteConfigPatchSkipReason
  }

  it.each<SkipCase>([
    {
      name: "target site mismatch",
      patchOverrides: { targetSiteId: "other-site" },
      reason: "target-site-mismatch",
    },
    {
      name: "base config version mismatch",
      patchOverrides: { baseConfigVersion: 4 },
      reason: "base-config-version-mismatch",
    },
    {
      name: "app version below the patch minimum",
      patchOverrides: { minAppVersion: "1.3.0", maxAppVersion: "2.0.0" },
      reason: "below-min-app-version",
    },
    {
      name: "app version above the patch maximum",
      patchOverrides: { minAppVersion: "1.0.0", maxAppVersion: "1.1.9" },
      reason: "above-max-app-version",
    },
  ])("skips a patch on $name", ({ patchOverrides, appVersion, reason }) => {
    const baseConfig = createBaseConfig()
    const result = resolveSiteConfig(
      createResolutionOptions({
        appVersion: appVersion ?? "1.2.0",
        baseConfig,
        remotePatch: createPatch(
          {
            selectors: {
              responseContainer: "main[data-remote]",
            },
          },
          patchOverrides,
        ),
      }),
    )

    expect(result.remotePatch).toEqual({
      status: "skipped",
      reason,
      patchVersion: 2,
    })
    expect(result.config).toEqual(baseConfig)
  })
})

describe("resolveSiteConfig validation boundaries", () => {
  it("rejects an invalid patch before merging", () => {
    const baseConfig = createBaseConfig()
    const result = resolveSiteConfig(
      createResolutionOptions({
        baseConfig,
        remotePatch: createPatch({
          unexpected: true,
        }),
      }),
    )

    expectLayerError(result.remotePatch, "$.config.unexpected", "validation")
    expect(result.config).toEqual(baseConfig)
  })

  it("rejects an invalid user override before merging", () => {
    const baseConfig = createBaseConfig()
    const result = resolveSiteConfig(
      createResolutionOptions({
        baseConfig,
        userOverride: {
          unexpected: true,
        },
      }),
    )

    expectLayerError(result.userOverride, "$.unexpected", "validation")
    expect(result.config).toEqual(baseConfig)
  })

  it("rejects a locally valid patch whose merged result removes a required field", () => {
    const baseConfig = createBaseConfig()
    const result = resolveSiteConfig(
      createResolutionOptions({
        baseConfig,
        remotePatch: createPatch({
          selectors: {
            responseContainer: null,
          },
        }),
      }),
    )

    expectLayerError(result.remotePatch, "$.selectors.responseContainer", "merged-config")
    expect(result.config).toEqual(baseConfig)
  })

  it("rejects a user override that removes built-in capabilities", () => {
    const baseConfig = createBaseConfig()
    const result = resolveSiteConfig(
      createResolutionOptions({
        baseConfig,
        userOverride: {
          capabilities: ["outline"],
        },
      }),
    )

    expectLayerError(result.userOverride, "$.capabilities", "merged-config")
    expect(result.config).toEqual(baseConfig)
  })

  it("rejects deletion of a required built-in private selector", () => {
    const baseConfig = createBaseConfig()
    baseConfig.sitePrivateSelectors = {
      thought: "[data-thought]",
    }

    const result = resolveSiteConfig(
      createResolutionOptions({
        baseConfig,
        remotePatch: createPatch({
          sitePrivateSelectors: {
            thought: null,
          },
        }),
      }),
    )

    expectLayerError(result.remotePatch, "$.sitePrivateSelectors.thought", "merged-config")
    expect(result.config).toEqual(baseConfig)
  })

  it("rejects changing a built-in private selector value type", () => {
    const baseConfig = createBaseConfig()
    baseConfig.sitePrivateSelectors = {
      stopButtonChildren: [":scope > div"],
    }

    const result = resolveSiteConfig(
      createResolutionOptions({
        baseConfig,
        remotePatch: createPatch({
          sitePrivateSelectors: {
            stopButtonChildren: ":scope > button",
          },
        }),
      }),
    )

    expectLayerError(
      result.remotePatch,
      "$.sitePrivateSelectors.stopButtonChildren",
      "merged-config",
    )
    expect(result.config).toEqual(baseConfig)
  })

  it("rejects removing a built-in config object used by the runtime", () => {
    const baseConfig = createBaseConfig()

    const result = resolveSiteConfig(
      createResolutionOptions({
        baseConfig,
        userOverride: {
          networkMonitor: null,
        },
      }),
    )

    expectLayerError(result.userOverride, "$.networkMonitor", "merged-config")
    expect(result.config).toEqual(baseConfig)
  })

  it("throws a structured error when the built-in config is invalid", () => {
    const baseConfig = createBaseConfig()
    delete baseConfig.selectors.responseContainer

    expect(() =>
      resolveSiteConfig(
        createResolutionOptions({
          baseConfig,
        }),
      ),
    ).toThrow(SiteConfigResolutionError)

    try {
      resolveSiteConfig(
        createResolutionOptions({
          baseConfig,
        }),
      )
    } catch (error) {
      expect(error).toBeInstanceOf(SiteConfigResolutionError)
      expect((error as SiteConfigResolutionError).errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "$.selectors.responseContainer",
          }),
        ]),
      )
    }
  })

  it("rejects invalid resolution metadata explicitly", () => {
    expect(() =>
      resolveSiteConfig(
        createResolutionOptions({
          appVersion: "invalid",
        }),
      ),
    ).toThrow(TypeError)

    expect(() =>
      resolveSiteConfig(
        createResolutionOptions({
          configVersion: 0,
        }),
      ),
    ).toThrow(TypeError)
  })
})

describe("merged config receiver contract", () => {
  it("detects configurable adapters and applies the merged config", () => {
    const baseConfig = createBaseConfig()
    const applyConfig = vi.fn()
    const receiver = {
      applyMergedConfig: applyConfig,
      getBuiltinConfig: () => baseConfig,
      getBuiltinConfigVersion: () => 3,
    }

    expect(supportsMergedConfig(receiver)).toBe(true)
    expect(supportsBuiltinSiteConfig(receiver)).toBe(true)
    expect(applyMergedConfig(receiver, baseConfig)).toBe(true)
    expect(applyConfig).toHaveBeenCalledOnce()
    expect(applyConfig).toHaveBeenCalledWith(baseConfig)
  })

  it("leaves unsupported adapters untouched", () => {
    const baseConfig = createBaseConfig()
    const unsupported = {
      getBuiltinConfig: () => baseConfig,
    }

    expect(supportsMergedConfig(unsupported)).toBe(false)
    expect(supportsBuiltinSiteConfig(unsupported)).toBe(false)
    expect(applyMergedConfig(unsupported, baseConfig)).toBe(false)
  })
})
