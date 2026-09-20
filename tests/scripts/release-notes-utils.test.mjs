import { describe, expect, it } from "vitest"

import { extractChangelogSection } from "../../scripts/release-notes-utils.mjs"

const CHANGELOG = `# Changelog

## [Unreleased]

- upcoming entry

## [1.2.7][1.2.7] - 2026-09-13

### Bug Fixes

- fixed something

---

## [1.2.6] - 2026-08-28

- older plain-format entry

[1.2.7]: https://example.com/releases/tag/v1.2.7
[1.2.6]: https://example.com/releases/tag/v1.2.6
`

describe("extractChangelogSection", () => {
  it("extracts a section with a link-reference heading", () => {
    const section = extractChangelogSection(CHANGELOG, "1.2.7", "CHANGELOG.md")

    expect(section.date).toBe("2026-09-13")
    expect(section.body).toContain("### Bug Fixes")
    expect(section.body).toContain("fixed something")
  })

  it("still supports the plain heading format", () => {
    const section = extractChangelogSection(CHANGELOG, "1.2.6", "CHANGELOG.md")

    expect(section.date).toBe("2026-08-28")
    expect(section.body).toContain("older plain-format entry")
  })

  it("stops the body at the next version heading regardless of format", () => {
    const section = extractChangelogSection(CHANGELOG, "1.2.7", "CHANGELOG.md")

    expect(section.body).not.toContain("older plain-format entry")
    expect(section.body).not.toContain("[1.2.6]")
  })

  it("accepts a link-reference heading without a date", () => {
    const content = `## [2.0.0][2.0.0]\n\n- entry\n`
    const section = extractChangelogSection(content, "2.0.0", "CHANGELOG.md")

    expect(section.date).toBeUndefined()
    expect(section.body).toBe("- entry")
  })

  it("throws when the section is missing", () => {
    expect(() => extractChangelogSection(CHANGELOG, "9.9.9", "CHANGELOG.md")).toThrow(
      "missing changelog section for 9.9.9",
    )
  })

  it("rejects extracting [Unreleased]", () => {
    expect(() => extractChangelogSection(CHANGELOG, "Unreleased", "CHANGELOG.md")).toThrow(
      "[Unreleased] is not a released version",
    )
  })
})
