import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { HealthCheckSnapshot, HealthCheckUpdateResult } from "~core/health-check-manager"
import type { ActiveAdapterConfigContext } from "~core/site-adapter-config-runtime"

import { SiteAdapterHealthNotice } from "./SiteAdapterHealthNotice"

vi.mock("~utils/i18n", () => ({
  t: (key: string) => key,
}))

vi.mock("~utils/toast", () => ({
  showToast: vi.fn(),
}))

const createContext = (
  source: "registry" | "local",
  overrides: Partial<ActiveAdapterConfigContext> = {},
): ActiveAdapterConfigContext => ({
  kind: "site-pack",
  siteId: "test-pack",
  siteName: "Test Pack",
  siteInstanceKey: "pack:test-pack@https://chat.example.com",
  origin: "https://chat.example.com",
  signature: "site-pack:test-pack:1",
  canCheckUpdates: source === "registry",
  packId: "test-pack",
  activeVersion: 1,
  source,
  updateAvailable: false,
  ...overrides,
})

const createSnapshot = (
  context: ActiveAdapterConfigContext,
  overrides: Partial<HealthCheckSnapshot> = {},
): HealthCheckSnapshot => ({
  phase: "warning",
  context,
  failedSelectors: [{ key: "textarea", selectors: ["textarea[data-chat-input]"] }],
  consecutiveFailures: 2,
  warningReason:
    context.kind === "site-pack" && context.updateAvailable
      ? "site-pack-update"
      : context.source === "local"
        ? "local-site-pack"
        : "site-changed",
  checkedAt: 1_800_000_000_000,
  isCheckingUpdates: false,
  error: null,
  updateError: null,
  ...overrides,
})

const renderNotice = (snapshot: HealthCheckSnapshot): string =>
  renderToStaticMarkup(
    createElement(SiteAdapterHealthNotice, {
      snapshot,
      onCheckUpdates: async (): Promise<HealthCheckUpdateResult> => ({
        remoteStatus: "up-to-date",
        recovered: false,
        snapshot,
      }),
      onReportIssue: vi.fn(),
    }),
  )

describe("SiteAdapterHealthNotice", () => {
  it("shows update and report actions for an updateable registry pack", () => {
    const context = createContext("registry", {
      registryVersion: 2,
      updateAvailable: true,
    })
    const markup = renderNotice(createSnapshot(context))

    expect(markup).toContain("gh-site-adapter-health-notice")
    expect(markup).toContain("healthCheckCheckUpdates")
    expect(markup).toContain("healthCheckReportIssue")
  })

  it("hides the update action for a local pack and keeps reporting available", () => {
    const markup = renderNotice(createSnapshot(createContext("local")))

    expect(markup).not.toContain("healthCheckCheckUpdates")
    expect(markup).toContain("healthCheckReportIssue")
  })

  it("renders nothing before a warning is confirmed", () => {
    const snapshot = createSnapshot(createContext("registry"), {
      phase: "pending",
      warningReason: null,
      consecutiveFailures: 1,
    })

    expect(renderNotice(snapshot)).toBe("")
  })

  it("keeps the notice in the existing Shadow DOM theme injection path", () => {
    const styleSource = readFileSync(
      fileURLToPath(new URL("../style.css", import.meta.url)),
      "utf8",
    )
    const uiEntrySource = readFileSync(
      fileURLToPath(new URL("../contents/ui-entry.tsx", import.meta.url)),
      "utf8",
    )

    expect(styleSource).toContain(".gh-site-adapter-health-notice")
    expect(styleSource).toContain("var(--gh-text-warning")
    expect(styleSource).toContain(".gh-site-adapter-health-button:focus-visible")
    expect(styleSource).toContain(".gh-site-adapter-health-button:disabled")
    expect(uiEntrySource).toContain('import cssText from "data-text:~style.css"')
  })
})
