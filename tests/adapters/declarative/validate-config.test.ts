import safeRegex from "safe-regex2"
import { describe, expect, it } from "vitest"

import exampleManifest from "../../../registry/examples/site-pack.example.json"
import {
  type SitePackValidationErrorCode,
  type SitePackValidationResult,
  validateBuiltinSiteConfig,
  validateSiteConfigOverride,
  validateSiteConfigPatch,
} from "~adapters/declarative/validate"

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
] as const

const createBuiltinConfig = (): Record<string, unknown> => {
  const config = structuredClone(exampleManifest) as unknown as Record<string, unknown>
  for (const key of MANIFEST_ONLY_KEYS) {
    delete config[key]
  }
  return config
}

const createPatch = (config: Record<string, unknown> = { session: { newTabPath: "/new" } }) => ({
  targetSiteId: "test-site",
  patchSchemaVersion: 1,
  patchVersion: 2,
  baseConfigVersion: 3,
  minAppVersion: "1.1.8",
  maxAppVersion: "1.3.0",
  config,
})

const expectValid = <T>(result: SitePackValidationResult<T>): T => {
  expect(result.valid).toBe(true)
  if (!result.valid) {
    throw new Error("Expected validation to pass: " + JSON.stringify(result.errors))
  }
  return result.value
}

const expectInvalid = <T>(
  result: SitePackValidationResult<T>,
  path: string,
  code: SitePackValidationErrorCode,
): void => {
  expect(result.valid).toBe(false)
  if (result.valid) throw new Error("Expected validation to fail")
  expect(result.errors).toContainEqual(
    expect.objectContaining({
      path,
      code,
    }),
  )
}

describe("validateBuiltinSiteConfig", () => {
  it("accepts required capabilities and allowlisted private selectors", () => {
    const config = createBuiltinConfig()
    config.sitePrivateSelectors = {
      thought: "[data-thought]",
      attachments: ["[data-attachment]"],
    }

    expectValid(
      validateBuiltinSiteConfig(config, {
        allowedPrivateSelectorKeys: ["thought", "attachments"],
        requiredPrivateSelectorKeys: ["thought", "attachments"],
        requiredCapabilities: ["outline", "width"],
      }),
    )
  })

  it("rejects removal of a required built-in capability", () => {
    const config = createBuiltinConfig()
    config.capabilities = (config.capabilities as string[]).filter(
      (capability) => capability !== "width",
    )

    expectInvalid(
      validateBuiltinSiteConfig(config, {
        requiredCapabilities: ["outline", "width"],
      }),
      "$.capabilities",
      "capability_requirement",
    )
  })

  it("rejects private selector keys outside the site allowlist", () => {
    const config = createBuiltinConfig()
    config.sitePrivateSelectors = {
      unknown: "[data-unknown]",
    }

    expectInvalid(
      validateBuiltinSiteConfig(config, {
        allowedPrivateSelectorKeys: ["thought"],
      }),
      "$.sitePrivateSelectors.unknown",
      "unknown_key",
    )
  })

  it("rejects missing required private selector keys", () => {
    const config = createBuiltinConfig()
    config.sitePrivateSelectors = {}

    expectInvalid(
      validateBuiltinSiteConfig(config, {
        allowedPrivateSelectorKeys: ["thought"],
        requiredPrivateSelectorKeys: ["thought"],
      }),
      "$.sitePrivateSelectors.thought",
      "missing_required",
    )
  })
})

describe("validateSiteConfigOverride", () => {
  it("accepts partial fields and null deletion for allowlisted selectors", () => {
    expectValid(
      validateSiteConfigOverride(
        {
          theme: {
            primary: "#fff",
          },
          session: null,
          sitePrivateSelectors: {
            thought: null,
          },
        },
        {
          allowedPrivateSelectorKeys: ["thought"],
        },
      ),
    )
  })

  it("rejects unknown top-level override fields", () => {
    expectInvalid(
      validateSiteConfigOverride({
        unexpected: true,
      }),
      "$.unexpected",
      "unknown_key",
    )
  })

  it("rejects unknown private selector overrides", () => {
    expectInvalid(
      validateSiteConfigOverride(
        {
          sitePrivateSelectors: {
            unknown: "[data-unknown]",
          },
        },
        {
          allowedPrivateSelectorKeys: ["thought"],
        },
      ),
      "$.sitePrivateSelectors.unknown",
      "unknown_key",
    )
  })

  it("rejects empty private selector arrays", () => {
    expectInvalid(
      validateSiteConfigOverride(
        {
          sitePrivateSelectors: {
            thought: [],
          },
        },
        {
          allowedPrivateSelectorKeys: ["thought"],
        },
      ),
      "$.sitePrivateSelectors.thought",
      "out_of_range",
    )
  })
})

describe("validateSiteConfigPatch", () => {
  it("accepts a compatible partial patch", () => {
    expectValid(
      validateSiteConfigPatch(
        createPatch({
          selectors: {
            responseContainer: "main[data-chat]",
          },
          session: null,
          sitePrivateSelectors: {
            thought: "[data-thought]",
          },
        }),
        {
          allowedPrivateSelectorKeys: ["thought"],
          regexSafetyCheck: safeRegex,
        },
      ),
    )
  })

  it("accepts an app-version range with equal bounds", () => {
    expectValid(
      validateSiteConfigPatch({
        ...createPatch(),
        minAppVersion: "1.2.0",
        maxAppVersion: "1.2.0",
      }),
    )
  })

  it("rejects maxAppVersion below minAppVersion", () => {
    expectInvalid(
      validateSiteConfigPatch({
        ...createPatch(),
        minAppVersion: "2.0.0",
        maxAppVersion: "1.9.9",
      }),
      "$.maxAppVersion",
      "out_of_range",
    )
  })

  it("rejects unsupported patch schema versions", () => {
    expectInvalid(
      validateSiteConfigPatch({
        ...createPatch(),
        patchSchemaVersion: 2,
      }),
      "$.patchSchemaVersion",
      "invalid_value",
    )
  })

  it("rejects invalid target site IDs", () => {
    expectInvalid(
      validateSiteConfigPatch({
        ...createPatch(),
        targetSiteId: "Invalid_Site",
      }),
      "$.targetSiteId",
      "invalid_pattern",
    )
  })

  it("rejects unknown config keys through the shared config validator", () => {
    expectInvalid(
      validateSiteConfigPatch(
        createPatch({
          unexpected: true,
        }),
      ),
      "$.config.unexpected",
      "unknown_key",
    )
  })

  it("rejects unsafe CSS through the shared config validator", () => {
    expectInvalid(
      validateSiteConfigPatch(
        createPatch({
          widthSelectors: [
            {
              selector: "main",
              property: "max-width",
              extraCss: "background: \\75 rl(https://evil.example/pixel)",
            },
          ],
        }),
      ),
      "$.config.widthSelectors[0].extraCss",
      "unsafe_css",
    )
  })

  it("rejects unsafe regular expressions through the shared config validator", () => {
    expectInvalid(
      validateSiteConfigPatch(
        createPatch({
          session: {
            idFromPathRegex: "(a+)+$",
          },
        }),
        {
          regexSafetyCheck: safeRegex,
        },
      ),
      "$.config.session.idFromPathRegex",
      "unsafe_regex",
    )
  })

  it("rejects private selector keys outside the site allowlist", () => {
    expectInvalid(
      validateSiteConfigPatch(
        createPatch({
          sitePrivateSelectors: {
            unknown: "[data-unknown]",
          },
        }),
        {
          allowedPrivateSelectorKeys: ["thought"],
        },
      ),
      "$.config.sitePrivateSelectors.unknown",
      "unknown_key",
    )
  })
})
