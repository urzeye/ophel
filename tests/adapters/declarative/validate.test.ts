import safeRegex from "safe-regex2"
import { describe, expect, it } from "vitest"

import exampleManifest from "../../../registry/examples/site-pack.example.json"
import {
  SITE_PACK_MAX_ARRAY_ITEMS,
  SITE_PACK_MAX_BYTES,
  SITE_PACK_MAX_EXTRA_CSS_LENGTH,
  SITE_PACK_MAX_MATCHES,
  SITE_PACK_MAX_REGEX_LENGTH,
  SITE_PACK_MAX_SELECTOR_LENGTH,
  type SitePackValidationErrorCode,
  type SitePackValidationResult,
  validateSitePackManifest,
} from "~adapters/declarative/validate"

const createMinimalManifest = (): Record<string, unknown> => ({
  schemaVersion: 1,
  id: "test-pack",
  version: 1,
  minAppVersion: "1.1.8",
  name: "Test Pack",
  matches: ["https://chat.example.com/*"],
  capabilities: ["outline"],
  selectors: {
    responseContainer: "main",
  },
})

const createFullManifest = (): Record<string, unknown> =>
  structuredClone(exampleManifest) as unknown as Record<string, unknown>

const createWidthManifest = (extraCss: string): Record<string, unknown> => ({
  ...createMinimalManifest(),
  capabilities: ["outline", "width"],
  widthSelectors: [
    {
      selector: "main",
      property: "max-width",
      extraCss,
    },
  ],
})

const createRegexManifest = (regex: string): Record<string, unknown> => ({
  ...createMinimalManifest(),
  conversation: {
    itemSelector: "[data-conversation]",
    idFrom: {
      regex,
    },
    urlTemplate: "/chat/{id}",
  },
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

describe("validateSitePackManifest structure and limits", () => {
  it("accepts a minimal valid SitePack", () => {
    const value = expectValid(validateSitePackManifest(createMinimalManifest()))

    expect(value.id).toBe("test-pack")
  })

  it("accepts the comprehensive registry example with regex safety enabled", () => {
    const value = expectValid(
      validateSitePackManifest(createFullManifest(), {
        regexSafetyCheck: safeRegex,
      }),
    )

    expect(value.capabilities).toHaveLength(15)
  })

  it("returns a structured error for unknown keys", () => {
    expectInvalid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        unexpected: true,
      }),
      "$.unexpected",
      "unknown_key",
    )
  })

  interface ShapeCase {
    name: string
    mutate: (manifest: Record<string, unknown>) => void
    path: string
    code: SitePackValidationErrorCode
  }

  it.each<ShapeCase>([
    {
      name: "missing required fields",
      mutate: (manifest) => {
        delete manifest.name
      },
      path: "$.name",
      code: "missing_required",
    },
    {
      name: "invalid field types",
      mutate: (manifest) => {
        manifest.selectors = []
      },
      path: "$.selectors",
      code: "invalid_type",
    },
    {
      name: "non-integer package versions",
      mutate: (manifest) => {
        manifest.version = 1.5
      },
      path: "$.version",
      code: "invalid_value",
    },
    {
      name: "unsupported schema versions",
      mutate: (manifest) => {
        manifest.schemaVersion = 2
      },
      path: "$.schemaVersion",
      code: "invalid_value",
    },
    {
      name: "invalid semantic versions",
      mutate: (manifest) => {
        manifest.minAppVersion = "1.1"
      },
      path: "$.minAppVersion",
      code: "invalid_pattern",
    },
  ])("rejects $name", ({ mutate, path, code }) => {
    const manifest = createMinimalManifest()
    mutate(manifest)

    expectInvalid(validateSitePackManifest(manifest), path, code)
  })

  it("accepts a manifest well below the serialized size limit", () => {
    expectValid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        description: "x".repeat(1024),
      }),
    )
  })

  it("rejects a manifest above the serialized size limit", () => {
    expectInvalid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        description: "x".repeat(SITE_PACK_MAX_BYTES),
      }),
      "$",
      "too_large",
    )
  })

  it("rejects values that are not JSON serializable", () => {
    const manifest = createMinimalManifest()
    manifest.description = manifest

    expectInvalid(validateSitePackManifest(manifest), "$", "invalid_value")
  })

  it("accepts arrays at the item limit", () => {
    expectValid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        selectors: {
          responseContainer: "main",
          textarea: Array.from({ length: SITE_PACK_MAX_ARRAY_ITEMS }, () => "textarea"),
        },
      }),
    )
  })

  it("rejects arrays above the item limit", () => {
    expectInvalid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        selectors: {
          responseContainer: "main",
          textarea: Array.from({ length: SITE_PACK_MAX_ARRAY_ITEMS + 1 }, () => "textarea"),
        },
      }),
      "$.selectors.textarea",
      "too_large",
    )
  })

  it("accepts selector strings at the length limit", () => {
    expectValid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        selectors: {
          responseContainer: "x".repeat(SITE_PACK_MAX_SELECTOR_LENGTH),
        },
      }),
    )
  })

  it("rejects selector strings above the length limit", () => {
    expectInvalid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        selectors: {
          responseContainer: "x".repeat(SITE_PACK_MAX_SELECTOR_LENGTH + 1),
        },
      }),
      "$.selectors.responseContainer",
      "too_large",
    )
  })
})

describe("validateSitePackManifest matches", () => {
  it("accepts HTTPS subdomain wildcard matches", () => {
    expectValid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        matches: ["https://*.example.com/*"],
      }),
    )
  })

  it("accepts exactly the maximum number of unique matches", () => {
    expectValid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        matches: Array.from(
          { length: SITE_PACK_MAX_MATCHES },
          (_, index) => "https://chat" + index + ".example.com/*",
        ),
      }),
    )
  })

  it("accepts empty matches for binding-only packs", () => {
    expectValid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        matches: [],
      }),
    )
  })

  it.each([
    ["non-HTTPS matches", "http://chat.example.com/*"],
    ["the all-URLs token", "<all_urls>"],
    ["a top-level wildcard", "https://*/*"],
    ["an HTTP top-level wildcard", "http://*/*"],
    ["a malformed wildcard", "https://foo.*.example.com/*"],
  ])("rejects %s", (_name, matchPattern) => {
    expectInvalid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        matches: [matchPattern],
      }),
      "$.matches[0]",
      "invalid_pattern",
    )
  })

  it("accepts HTTP matches when allowHttpMatches is enabled", () => {
    expectValid(
      validateSitePackManifest(
        {
          ...createMinimalManifest(),
          matches: ["http://127.0.0.1:3080/*"],
        },
        { allowHttpMatches: true },
      ),
    )
  })

  it("rejects more than the maximum number of matches", () => {
    expectInvalid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        matches: Array.from(
          { length: SITE_PACK_MAX_MATCHES + 1 },
          (_, index) => "https://chat" + index + ".example.com/*",
        ),
      }),
      "$.matches",
      "too_large",
    )
  })

  it("rejects duplicate match patterns", () => {
    expectInvalid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        matches: ["https://chat.example.com/*", "https://chat.example.com/*"],
      }),
      "$.matches[1]",
      "duplicate_value",
    )
  })
})

describe("validateSitePackManifest logoUrl", () => {
  it("accepts an https logoUrl", () => {
    const value = expectValid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        logoUrl: "https://chat.example.com/assets/logo.svg",
      }),
    )

    expect(value.logoUrl).toBe("https://chat.example.com/assets/logo.svg")
  })

  it.each(["http://chat.example.com/logo.png", "not-a-url", "javascript:alert(1)"])(
    "rejects logoUrl %s for registry packs",
    (logoUrl) => {
      expectInvalid(
        validateSitePackManifest({
          ...createMinimalManifest(),
          logoUrl,
        }),
        "$.logoUrl",
        "invalid_value",
      )
    },
  )

  it("allows http logoUrl for local imports", () => {
    expectValid(
      validateSitePackManifest(
        {
          ...createMinimalManifest(),
          logoUrl: "http://chat.example.com/logo.png",
        },
        { allowHttpMatches: true },
      ),
    )
  })
})

describe("validateSitePackManifest identity, colors, and same-origin paths", () => {
  it.each(["ab", "pack-1", "a".repeat(40)])("accepts valid SitePack id %s", (id) => {
    expectValid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        id,
      }),
    )
  })

  it.each(["a", "UPPERCASE", "bad_id", "a".repeat(41)])("rejects invalid SitePack id %s", (id) => {
    expectInvalid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        id,
      }),
      "$.id",
      "invalid_pattern",
    )
  })

  it("accepts hexadecimal theme colors", () => {
    expectValid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        theme: {
          primary: "#abc",
          secondary: "#12345678",
        },
      }),
    )
  })

  it.each([
    ["primary", "red"],
    ["secondary", "rgb(0 0 0)"],
  ])("rejects non-hexadecimal %s colors", (field, value) => {
    expectInvalid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        theme: {
          primary: field === "primary" ? value : "#fff",
          secondary: field === "secondary" ? value : "#000",
        },
      }),
      "$.theme." + field,
      "invalid_pattern",
    )
  })

  it("accepts same-origin conversation and session paths", () => {
    expectValid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        conversation: {
          itemSelector: "[data-conversation]",
          idFrom: { regex: "^/chat/([^/]+)$" },
          urlTemplate: "/chat/{id}",
        },
        session: {
          newTabPath: "/new",
        },
      }),
    )
  })

  it("rejects protocol-relative conversation URL templates", () => {
    expectInvalid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        conversation: {
          itemSelector: "[data-conversation]",
          idFrom: { regex: "^/chat/([^/]+)$" },
          urlTemplate: "//evil.example/chat/{id}",
        },
      }),
      "$.conversation.urlTemplate",
      "invalid_pattern",
    )
  })

  it("rejects absolute new-tab URLs", () => {
    expectInvalid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        session: {
          newTabPath: "https://evil.example/new",
        },
      }),
      "$.session.newTabPath",
      "invalid_pattern",
    )
  })
})

describe("validateSitePackManifest CSS safety", () => {
  it("accepts safe CSS at the configured length limit", () => {
    expectValid(
      validateSitePackManifest(createWidthManifest("x".repeat(SITE_PACK_MAX_EXTRA_CSS_LENGTH))),
    )
  })

  it.each([
    ["url()", "background: url(https://evil.example/pixel)"],
    ["@import", "@import 'https://evil.example/style.css';"],
    ["expression()", "width: expression(alert(1))"],
    ["javascript:", "background: javascript:alert(1)"],
    ["CSS escape decoding", "background: \\75 rl(https://evil.example/pixel)"],
    ["comment removal", "@im/**/port 'https://evil.example/style.css';"],
  ])("rejects blocked CSS after %s normalization", (_name, extraCss) => {
    expectInvalid(
      validateSitePackManifest(createWidthManifest(extraCss)),
      "$.widthSelectors[0].extraCss",
      "unsafe_css",
    )
  })

  it("rejects CSS above the configured length limit", () => {
    expectInvalid(
      validateSitePackManifest(createWidthManifest("x".repeat(SITE_PACK_MAX_EXTRA_CSS_LENGTH + 1))),
      "$.widthSelectors[0].extraCss",
      "too_large",
    )
  })
})

describe("validateSitePackManifest regular expression safety", () => {
  it("accepts a safe regular expression at the length limit", () => {
    expectValid(
      validateSitePackManifest(createRegexManifest("a".repeat(SITE_PACK_MAX_REGEX_LENGTH)), {
        regexSafetyCheck: safeRegex,
      }),
    )
  })

  it("rejects regular expressions above the length limit", () => {
    expectInvalid(
      validateSitePackManifest(createRegexManifest("a".repeat(SITE_PACK_MAX_REGEX_LENGTH + 1)), {
        regexSafetyCheck: safeRegex,
      }),
      "$.conversation.idFrom.regex",
      "too_large",
    )
  })

  it("rejects regular expressions that cannot compile", () => {
    expectInvalid(
      validateSitePackManifest(createRegexManifest("("), {
        regexSafetyCheck: safeRegex,
      }),
      "$.conversation.idFrom.regex",
      "invalid_pattern",
    )
  })

  it("rejects regular expressions flagged for excessive backtracking", () => {
    expectInvalid(
      validateSitePackManifest(createRegexManifest("(a+)+$"), {
        regexSafetyCheck: safeRegex,
      }),
      "$.conversation.idFrom.regex",
      "unsafe_regex",
    )
  })
})

describe("validateSitePackManifest capability contracts", () => {
  it("rejects unknown capabilities", () => {
    expectInvalid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        capabilities: ["outline", "unknown-capability"],
      }),
      "$.capabilities[1]",
      "invalid_value",
    )
  })

  it("rejects duplicate capabilities", () => {
    expectInvalid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        capabilities: ["outline", "outline"],
      }),
      "$.capabilities[1]",
      "duplicate_value",
    )
  })

  interface CapabilityRequirementCase {
    capability: string
    paths: string[]
  }

  it.each<CapabilityRequirementCase>([
    { capability: "outline", paths: ["$.selectors.responseContainer"] },
    { capability: "conversation-list", paths: ["$.conversation"] },
    { capability: "export-basic", paths: ["$.export"] },
    { capability: "model-lock", paths: ["$.modelSwitcher"] },
    { capability: "generation-detect", paths: ["$.generating"] },
    { capability: "new-chat", paths: ["$.selectors.newChatButton"] },
    { capability: "stop-generation", paths: ["$.selectors.stopButton"] },
    { capability: "width", paths: ["$.widthSelectors"] },
    { capability: "panel-avoidance", paths: ["$.panelAvoidance"] },
    { capability: "zen", paths: ["$.zenMode"] },
    { capability: "clean", paths: ["$.cleanMode"] },
    {
      capability: "prompt-insert",
      paths: ["$.selectors.textarea", "$.input"],
    },
    { capability: "reading-history", paths: ["$.selectors.chatContent"] },
    {
      capability: "outline-user-queries",
      paths: ["$.selectors.userQuery", "$.capabilities"],
    },
    { capability: "document-outline", paths: ["$.documentOutline.container"] },
  ])("requires fields declared by $capability", ({ capability, paths }) => {
    const result = validateSitePackManifest({
      ...createMinimalManifest(),
      capabilities: [capability],
      selectors: {},
    })

    for (const path of paths) {
      expectInvalid(result, path, "capability_requirement")
    }
  })

  it("accepts network monitoring as generation detection", () => {
    expectValid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        capabilities: ["generation-detect"],
        selectors: {},
        networkMonitor: {
          urlPatterns: ["/api/chat"],
          silenceThreshold: 1000,
        },
      }),
    )
  })
})

describe("validateSitePackManifest document outline", () => {
  it("accepts a valid document outline configuration", () => {
    expectValid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        capabilities: ["outline", "document-outline"],
        documentOutline: {
          container: "aside.artifact-root",
          scrollContainer: "aside.artifact-root .scroll-body",
          exclude: [".ignore-heading"],
          label: "Document",
          labelI18n: {
            "zh-CN": "文档",
            en: "Document",
          },
        },
      }),
    )
  })

  it("rejects unknown keys and invalid selector types", () => {
    expectInvalid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        capabilities: ["outline", "document-outline"],
        documentOutline: {
          container: "aside.artifact-root",
          unexpectedKey: true,
        },
      }),
      "$.documentOutline.unexpectedKey",
      "unknown_key",
    )

    expectInvalid(
      validateSitePackManifest({
        ...createMinimalManifest(),
        capabilities: ["outline", "document-outline"],
        documentOutline: {
          container: 123,
        },
      }),
      "$.documentOutline.container",
      "invalid_type",
    )
  })
})

describe("validateSitePackManifest panel avoidance", () => {
  const createAvoidanceManifest = (
    panelAvoidance: Record<string, unknown>,
  ): Record<string, unknown> => ({
    ...createMinimalManifest(),
    capabilities: ["outline", "panel-avoidance"],
    panelAvoidance,
  })

  const minimalAvoidance = (): Record<string, unknown> => ({
    widthSelectors: [{ selector: "main", property: "max-width" }],
  })

  it("accepts a minimal and a fully populated panelAvoidance config", () => {
    expectValid(validateSitePackManifest(createAvoidanceManifest(minimalAvoidance())))

    expectValid(
      validateSitePackManifest(
        createAvoidanceManifest({
          scopeSelector: "main",
          obstacleSelectors: ["aside.settings"],
          widthSelectors: [
            {
              selector: "main",
              property: "max-width",
              extraCss: "width: 100% !important;",
            },
          ],
          insetSelectors: [
            {
              selector: "main",
              scopeSelector: "main",
              obstacleSelectors: [],
              applySide: "right",
              insetMode: "edge",
              leftProperty: "padding-left",
              rightProperty: "padding-right",
              extraCss: "box-sizing: border-box !important;",
            },
          ],
          defaultWidth: "72rem",
          gap: 16,
          minVisiblePanelWidth: 48,
          minSafeWidth: 320,
          minViewportWidth: 768,
        }),
      ),
    )
  })

  it("requires widthSelectors inside panelAvoidance", () => {
    expectInvalid(
      validateSitePackManifest(createAvoidanceManifest({ gap: 16 })),
      "$.panelAvoidance.widthSelectors",
      "missing_required",
    )
  })

  it("rejects unknown keys and invalid enum values", () => {
    expectInvalid(
      validateSitePackManifest(createAvoidanceManifest({ ...minimalAvoidance(), padding: 8 })),
      "$.panelAvoidance.padding",
      "unknown_key",
    )

    expectInvalid(
      validateSitePackManifest(
        createAvoidanceManifest({
          ...minimalAvoidance(),
          insetSelectors: [{ selector: "main", applySide: "top" }],
        }),
      ),
      "$.panelAvoidance.insetSelectors[0].applySide",
      "invalid_value",
    )
  })

  it("rejects unsafe CSS and negative thresholds", () => {
    expectInvalid(
      validateSitePackManifest(
        createAvoidanceManifest({
          widthSelectors: [
            {
              selector: "main",
              property: "max-width",
              extraCss: "background: url(https://evil.example/x.png)",
            },
          ],
        }),
      ),
      "$.panelAvoidance.widthSelectors[0].extraCss",
      "unsafe_css",
    )

    expectInvalid(
      validateSitePackManifest(createAvoidanceManifest({ ...minimalAvoidance(), gap: -1 })),
      "$.panelAvoidance.gap",
      "out_of_range",
    )
  })
})
