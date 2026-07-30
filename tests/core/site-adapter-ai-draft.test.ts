import { describe, expect, it } from "vitest"

import { SITE_PACK_MAX_SELECTOR_LENGTH } from "~adapters/declarative/validate"

import {
  SiteAdapterAiDraftResponseError,
  buildSiteAdapterAiDraftPrompt,
  parseSiteAdapterAiDraftResponse,
  type SiteAdapterAiDomSnapshot,
} from "~core/site-adapter-ai-draft"

const SNAPSHOT: SiteAdapterAiDomSnapshot = {
  schemaVersion: 1,
  origin: "https://chat.example.com",
  scannedElements: 42,
  includedCandidates: 4,
  truncated: false,
  candidates: [
    {
      tag: "textarea",
      attributes: { "aria-label": "Message" },
      classes: ["composer-input"],
      ancestorPath: ["main[role=main]", "form.chat-composer"],
      inShadowRoot: false,
      occurrences: 1,
    },
    {
      tag: "article",
      attributes: { "data-author": "user" },
      classes: ["chat-message"],
      ancestorPath: ["main[role=main]", "section.chat-thread"],
      inShadowRoot: false,
      occurrences: 3,
    },
  ],
}

const expectResponseError = (
  action: () => unknown,
  code: SiteAdapterAiDraftResponseError["code"],
): void => {
  try {
    action()
    throw new Error("Expected SiteAdapterAiDraftResponseError")
  } catch (error) {
    expect(error).toBeInstanceOf(SiteAdapterAiDraftResponseError)
    expect((error as SiteAdapterAiDraftResponseError).code).toBe(code)
  }
}

describe("Site Adapter AI draft response parsing", () => {
  it("accepts a direct partial selector response", () => {
    const result = parseSiteAdapterAiDraftResponse(
      JSON.stringify({
        schemaVersion: 1,
        selectors: {
          textarea: ' textarea[aria-label="Message"] ',
          submitButton: 'button[data-testid="send"]',
        },
      }),
    )

    expect(result).toEqual({
      textarea: 'textarea[aria-label="Message"]',
      submitButton: 'button[data-testid="send"]',
    })
  })

  it("accepts a sole fenced JSON block and omits null selectors", () => {
    const result = parseSiteAdapterAiDraftResponse(`\`\`\`json
{
  "schemaVersion": 1,
  "selectors": {
    "responseContainer": "main[role=main]",
    "conversationItem": null,
    "newChatButton": null
  }
}
\`\`\``)

    expect(result).toEqual({ responseContainer: "main[role=main]" })
  })

  it("rejects prose around a fenced response", () => {
    expectResponseError(
      () =>
        parseSiteAdapterAiDraftResponse(`Here is the draft:
\`\`\`json
{"schemaVersion":1,"selectors":{"textarea":"textarea"}}
\`\`\``),
      "invalid-json",
    )
  })

  it("rejects an unsupported schema version", () => {
    expectResponseError(
      () =>
        parseSiteAdapterAiDraftResponse(
          JSON.stringify({ schemaVersion: 2, selectors: { textarea: "textarea" } }),
        ),
      "unsupported-schema",
    )
  })

  it("rejects unknown root keys", () => {
    expectResponseError(
      () =>
        parseSiteAdapterAiDraftResponse(
          JSON.stringify({
            schemaVersion: 1,
            selectors: { textarea: "textarea" },
            explanation: "trust me",
          }),
        ),
      "unknown-key",
    )
  })

  it("rejects unknown selector keys", () => {
    expectResponseError(
      () =>
        parseSiteAdapterAiDraftResponse(
          JSON.stringify({
            schemaVersion: 1,
            selectors: { textarea: "textarea", deleteAccountButton: "button.danger" },
          }),
        ),
      "unknown-selector",
    )
  })

  it("rejects selector values that are not strings or null", () => {
    expectResponseError(
      () =>
        parseSiteAdapterAiDraftResponse(
          JSON.stringify({ schemaVersion: 1, selectors: { textarea: ["textarea"] } }),
        ),
      "invalid-selector",
    )
  })

  it("rejects an empty selector result", () => {
    expectResponseError(
      () =>
        parseSiteAdapterAiDraftResponse(
          JSON.stringify({
            schemaVersion: 1,
            selectors: { textarea: null, newChatButton: null },
          }),
        ),
      "no-selectors",
    )
  })

  it("rejects selectors over the SitePack limit", () => {
    expectResponseError(
      () =>
        parseSiteAdapterAiDraftResponse(
          JSON.stringify({
            schemaVersion: 1,
            selectors: { textarea: `textarea.${"a".repeat(SITE_PACK_MAX_SELECTOR_LENGTH)}` },
          }),
        ),
      "selector-too-long",
    )
  })

  it("rejects oversized response text before parsing", () => {
    expectResponseError(
      () => parseSiteAdapterAiDraftResponse(" ".repeat(24_001)),
      "response-too-large",
    )
  })
})

describe("Site Adapter AI draft prompt framing", () => {
  it("states the output, privacy, stability, cardinality, and review contracts", () => {
    const prompt = buildSiteAdapterAiDraftPrompt({
      snapshot: SNAPSHOT,
      existingSelectors: { textarea: 'textarea[aria-label="Message"]' },
    })

    expect(prompt).toContain("Nothing is uploaded automatically")
    expect(prompt).toContain("Return only one JSON object")
    expect(prompt).toContain('"schemaVersion": 1')
    expect(prompt).toContain('"assistantResponse"')
    expect(prompt).toContain(
      "textarea, submitButton, responseContainer, and newChatButton must be unique",
    )
    expect(prompt).toContain(
      "userQuery, assistantResponse, and conversationItem may match repeated elements",
    )
    expect(prompt).toContain("Do not use XPath")
    expect(prompt).toContain("Avoid :nth-child")
    expect(prompt).toContain("Ophel will validate every selector against the live page")
    expect(prompt).toContain("https://chat.example.com")
    expect(prompt).toContain('"existingSelectors"')
    expect(prompt).toContain('"composer-input"')
  })
})
