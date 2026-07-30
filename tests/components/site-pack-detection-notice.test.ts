import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { SitePackDetectionState } from "~adapters/site-pack-detection"

import { SitePackDetectionNotice } from "~components/SitePackDetectionNotice"

vi.mock("~utils/i18n", () => ({
  t: (key: string, params?: Record<string, string>) =>
    params?.name ? `${key}:${params.name}` : key,
}))

vi.mock("~utils/dom-toolkit", () => ({
  attachEditableKeyboardFocusGuard: vi.fn(() => () => undefined),
  OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS: {},
  OPHEL_INTERACTION_LAYER_PROPS: {},
}))

const createDetectionState = (
  candidates: SitePackDetectionState["candidates"],
): SitePackDetectionState => ({
  origin: "https://chat.example",
  status: "matched",
  activePackId: candidates[0]?.packId ?? null,
  candidates,
  attempts: 2,
  elapsedMs: 15,
  issues: [],
})

const renderNotice = (detection: SitePackDetectionState | null): string =>
  renderToStaticMarkup(
    createElement(SitePackDetectionNotice, {
      detection,
      onSwitch: vi.fn(async () => undefined),
    }),
  )

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8")

const compact = (source: string): string => source.replace(/\s+/g, " ")

describe("SitePackDetectionNotice", () => {
  it("renders nothing without multiple active candidates", () => {
    expect(renderNotice(null)).toBe("")
    expect(renderNotice(createDetectionState([]))).toBe("")
    expect(
      renderNotice(
        createDetectionState([{ packId: "only-pack", name: "Only Pack", installedAt: 1 }]),
      ),
    ).toBe("")
  })

  it("renders the active candidate and keeps the initial switch action disabled", () => {
    const markup = renderNotice(
      createDetectionState([
        { packId: "active-pack", name: "Active Pack", installedAt: 1 },
        { packId: "alternate-pack", name: "Alternate Pack", installedAt: 2 },
      ]),
    )
    const selectButton = markup.match(
      /<button[^>]*class="gh-site-pack-detect-select-button"[^>]*>/,
    )?.[0]
    const switchButton = markup.match(/<button[^>]*class="gh-site-pack-detect-switch"[^>]*>/)?.[0]

    expect(markup).toContain('class="gh-site-pack-detect-notice gh-interactive"')
    expect(markup).toContain("sitePackDetectMultipleTitle")
    expect(markup).toContain("sitePackDetectMultipleDesc:Active Pack")
    expect(markup).toContain('aria-label="sitePackDetectSelectLabel"')
    expect(markup).toContain('title="active-pack"')
    expect(markup).toContain("sitePackDetectSwitch")
    expect(selectButton).toBeDefined()
    expect(selectButton).not.toContain("disabled")
    expect(switchButton).toContain('disabled=""')
  })

  it("keeps theme states, Shadow DOM delivery, and awaited reload wiring intact", () => {
    const styleSource = readSource("../../src/style.css")
    const uiEntrySource = readSource("../../src/contents/ui-entry.tsx")
    const appSource = compact(readSource("../../src/components/App.tsx"))
    const reducedMotionIndex = styleSource.lastIndexOf("@media (prefers-reduced-motion: reduce)")
    const reducedMotionSource = styleSource.slice(reducedMotionIndex)

    expect(styleSource).toContain('@import "./styles/theme-variables.css";')
    expect(styleSource).toContain(".gh-site-pack-detect-notice")
    expect(styleSource).toContain("var(--gh-primary")
    expect(styleSource).toContain("var(--gh-bg")
    expect(styleSource).toContain("var(--gh-text-secondary")
    expect(styleSource).toContain(".gh-site-pack-detect-select-button:hover:not(:disabled)")
    expect(styleSource).toContain(".gh-site-pack-detect-select-button:focus-visible")
    expect(styleSource).toContain(".gh-site-pack-detect-select-button:disabled")
    expect(styleSource).toContain(".gh-site-pack-detect-switch:active:not(:disabled)")
    expect(styleSource).toContain(".gh-site-pack-detect-switch:focus-visible")
    expect(styleSource).toContain(".gh-site-pack-detect-error")
    expect(reducedMotionIndex).toBeGreaterThanOrEqual(0)
    expect(reducedMotionSource).toContain(".gh-site-pack-detect-notice")
    expect(uiEntrySource).toContain('import cssText from "data-text:~style.css"')
    expect(compact(uiEntrySource)).toContain('cssText + "\\n" + conversationsCssText')
    expect(appSource).toContain(
      "const handleSwitchDetectedSitePack = useCallback(async (packId: string) => { await selectDetectedSitePack(packId) window.location.reload() }, [])",
    )
    expect(appSource).toContain("onSwitchDetectedSitePack={handleSwitchDetectedSitePack}")
  })
})
