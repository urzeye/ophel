import { describe, expect, it } from "vitest"

import { matchGlobalSearchSyntaxFilters, parseGlobalSearchQuery } from "./syntax"

describe("global search syntax", () => {
  it("parses quoted filters while preserving the plain query", () => {
    const parsed = parseGlobalSearchQuery(
      'release notes type:settings folder:"Product Research" tag:important date:30d',
    )

    expect(parsed.plainQuery).toBe("release notes")
    expect(parsed.filters.map(({ key, value }) => ({ key, value }))).toEqual([
      { key: "type", value: "settings" },
      { key: "folder", value: "Product Research" },
      { key: "tag", value: "important" },
      { key: "date", value: "30d" },
    ])
    expect(parsed.diagnostics).toEqual([])
  })

  it("reports invalid and conflicting filters without hiding the plain query", () => {
    const parsed = parseGlobalSearchQuery(
      "roadmap typo:settings type:prompts type:settings level:9",
    )

    expect(parsed.plainQuery).toBe("roadmap typo:settings")
    expect(parsed.filters).toHaveLength(1)
    expect(parsed.filters[0]).toMatchObject({ key: "type", normalizedValue: "prompts" })
    expect(parsed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "unknownOperator",
      "conflict",
      "invalidValue",
    ])
  })

  it("matches category-specific metadata filters", () => {
    const outlineFilters = parseGlobalSearchQuery(
      'folder:"Product Research" tag:important is:pinned level:2',
    ).filters

    expect(
      matchGlobalSearchSyntaxFilters(
        {
          category: "outline",
          folderName: "Product Research",
          tagNames: ["Important"],
          isPinned: true,
          outlineTarget: { level: 2 },
        },
        outlineFilters,
      ),
    ).toBe(true)

    const conversationFilters = parseGlobalSearchQuery("date:7d").filters
    expect(
      matchGlobalSearchSyntaxFilters(
        {
          category: "conversations",
          searchTimestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
        },
        conversationFilters,
      ),
    ).toBe(true)
  })
})
