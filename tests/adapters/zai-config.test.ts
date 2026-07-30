import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_IDS } from "~constants/defaults"
import { resolveBuiltinConfig } from "~core/builtin-config-registry"

import { resolveSiteConfig } from "~adapters/declarative/merge"
import type { SiteConfigPatch } from "~adapters/declarative/types"
import { ZaiAdapter } from "~adapters/zai"
import { ZAI_CONFIG, ZAI_CONFIG_VERSION } from "~adapters/zai-config"

vi.mock("~utils/export-assets", () => ({
  createExportAssetCollector: vi.fn(() => ({ assets: [], usedPaths: new Set() })),
  formatExportFileAttachments: vi.fn(() => ""),
  formatExportImageAttachments: vi.fn(() => ""),
  isDownloadableExportAssetUrl: vi.fn(() => false),
  normalizeExportAssetUrl: vi.fn(() => null),
}))

vi.mock("~utils/exporter", () => ({
  htmlToMarkdown: vi.fn(() => ""),
}))

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

vi.mock("~utils/i18n", () => ({
  t: (key: string) => key,
}))

const stubNewConversationWindow = (): void => {
  vi.stubGlobal("window", { location: new URL("https://chat.z.ai/") })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("Z.ai built-in config", () => {
  it("uses the shared descriptor and maps the default config to public behavior", () => {
    stubNewConversationWindow()
    const adapter = new ZaiAdapter()
    const descriptor = resolveBuiltinConfig(SITE_IDS.ZAI)

    expect(descriptor).toEqual({
      siteId: SITE_IDS.ZAI,
      configVersion: ZAI_CONFIG_VERSION,
      baseConfig: ZAI_CONFIG,
    })
    expect(adapter.getBuiltinConfig()).toBe(ZAI_CONFIG)
    expect(adapter.getBuiltinConfigVersion()).toBe(ZAI_CONFIG_VERSION)
    expect(adapter.getTextareaSelectors()).toEqual(ZAI_CONFIG.selectors.textarea)
    expect(adapter.getResponseContainerSelector()).toBe(ZAI_CONFIG.selectors.responseContainer)
    expect(adapter.getChatContentSelectors()).toEqual(ZAI_CONFIG.selectors.chatContent)
    expect(adapter.getUserQuerySelector()).toBe(ZAI_CONFIG.selectors.userQuery)
    expect(adapter.getNewChatButtonSelectors()).toEqual(ZAI_CONFIG.selectors.newChatButton)
    expect(adapter.getStopButtonSelectors()).toEqual(ZAI_CONFIG.selectors.stopButton)
    expect(adapter.getSubmitButtonSelectors()).toEqual([
      `${ZAI_CONFIG.sitePrivateSelectors.submitButton}:not([disabled])`,
    ])
    expect(adapter.getSubmitKeyConfig()).toEqual({ key: ZAI_CONFIG.input.submitKey })
    expect(adapter.getExportConfig()).toEqual(ZAI_CONFIG.export)
    expect(adapter.getModelSwitcherConfig("target-model")).toEqual({
      ...ZAI_CONFIG.modelSwitcher,
      targetModelKeyword: "target-model",
    })
    expect(adapter.getWidthSelectors()).toEqual(ZAI_CONFIG.widthSelectors)
    expect(adapter.getZenModeConfig()).toEqual(ZAI_CONFIG.zenMode)
    expect(adapter.getUserQueryWidthSelectors()).toEqual([
      {
        selector: ZAI_CONFIG.sitePrivateSelectors.userQueryWidth,
        property: "max-width",
        noCenter: true,
      },
    ])
    expect(adapter.getPanelAvoidanceConfig()).toMatchObject({
      scopeSelector: ZAI_CONFIG.sitePrivateSelectors.chatContainer,
      widthSelectors: [
        { selector: ZAI_CONFIG.sitePrivateSelectors.chatMessageWidth, property: "max-width" },
      ],
      insetSelectors: [
        { selector: ZAI_CONFIG.sitePrivateSelectors.chatMessagesContainer },
        { selector: ZAI_CONFIG.sitePrivateSelectors.chatInputSafeArea },
        { selector: ZAI_CONFIG.sitePrivateSelectors.newChatContentSafeArea },
      ],
    })
    expect(adapter.getFeatureCapabilities()).toEqual(new Set(ZAI_CONFIG.capabilities))
  })

  it("returns defensive copies from mutable public config getters", () => {
    stubNewConversationWindow()
    const adapter = new ZaiAdapter()

    adapter.getTextareaSelectors().push("textarea[data-mutated]")
    adapter.getChatContentSelectors().push("article[data-mutated]")
    adapter.getNewChatButtonSelectors().push("button[data-mutated]")
    adapter.getStopButtonSelectors().push("button[data-mutated]")
    adapter.getWidthSelectors()[0].selector = "main[data-mutated]"
    adapter.getZenModeConfig().hide?.push("aside[data-mutated]")
    adapter.getModelSwitcherConfig("target")!.selectorButtonSelectors.push("button[data-mutated]")
    adapter.getPanelAvoidanceConfig().widthSelectors[0].selector = "main[data-mutated]"
    adapter.getUserQueryWidthSelectors()[0].selector = "article[data-mutated]"

    expect(adapter.getTextareaSelectors()).toEqual(ZAI_CONFIG.selectors.textarea)
    expect(adapter.getChatContentSelectors()).toEqual(ZAI_CONFIG.selectors.chatContent)
    expect(adapter.getNewChatButtonSelectors()).toEqual(ZAI_CONFIG.selectors.newChatButton)
    expect(adapter.getStopButtonSelectors()).toEqual(ZAI_CONFIG.selectors.stopButton)
    expect(adapter.getWidthSelectors()).toEqual(ZAI_CONFIG.widthSelectors)
    expect(adapter.getZenModeConfig()).toEqual(ZAI_CONFIG.zenMode)
    expect(adapter.getModelSwitcherConfig("target")?.selectorButtonSelectors).toEqual(
      ZAI_CONFIG.modelSwitcher.selectorButtonSelectors,
    )
    expect(adapter.getPanelAvoidanceConfig().widthSelectors[0].selector).toBe(
      ZAI_CONFIG.sitePrivateSelectors.chatMessageWidth,
    )
    expect(adapter.getUserQueryWidthSelectors()[0].selector).toBe(
      ZAI_CONFIG.sitePrivateSelectors.userQueryWidth,
    )
  })

  it("applies a validated hotfix to an existing adapter without cached derived selectors", () => {
    stubNewConversationWindow()
    const generatingElement = { offsetParent: {} } as HTMLElement
    const querySelector = vi.fn((selector: string) =>
      selector === "button[data-generating]" ? generatingElement : null,
    )
    vi.stubGlobal("document", { querySelector })

    const patch: SiteConfigPatch = {
      targetSiteId: SITE_IDS.ZAI,
      patchSchemaVersion: 1,
      patchVersion: 2,
      baseConfigVersion: ZAI_CONFIG_VERSION,
      minAppVersion: "1.1.8",
      config: {
        selectors: {
          textarea: ["textarea[data-hotfix]"],
          responseContainer: "main[data-hotfix]",
          chatContent: ["article[data-hotfix]"],
          userQuery: "article[data-role='user']",
          newChatButton: ["button[data-new-chat]"],
          stopButton: ["button[data-stop]"],
        },
        input: { submitKey: "Ctrl+Enter" },
        generating: { existsSelectors: ["button[data-generating]"] },
        modelSwitcher: {
          selectorButtonSelectors: ["button[data-model]"],
          menuItemSelector: "button[data-model-item]",
          checkInterval: 25,
          maxAttempts: 3,
          menuRenderDelay: 10,
        },
        export: {
          userQuerySelector: "article[data-export-user]",
          assistantResponseSelector: "article[data-export-assistant]",
        },
        zenMode: { hide: ["aside[data-hotfix]"] },
        widthSelectors: [{ selector: "main[data-width]", property: "max-width" }],
        sitePrivateSelectors: {
          submitButton: "button[data-submit]",
          chatContainer: "main[data-chat]",
          chatMessagesContainer: "section[data-messages]",
          chatMessageWidth: "article[data-message-width]",
          chatInputSafeArea: "footer[data-input-safe]",
          newChatContentSafeArea: "section[data-new-chat-safe]",
          userQueryWidth: "article[data-user-width]",
        },
      },
    }
    const resolved = resolveSiteConfig({
      siteId: SITE_IDS.ZAI,
      appVersion: "1.1.8",
      configVersion: ZAI_CONFIG_VERSION,
      baseConfig: ZAI_CONFIG,
      remotePatch: patch,
    })
    const adapter = new ZaiAdapter()

    expect(resolved.remotePatch).toEqual({ status: "applied", patchVersion: 2 })
    adapter.applyMergedConfig(resolved.config)

    expect(adapter.getTextareaSelectors()).toEqual(["textarea[data-hotfix]"])
    expect(adapter.getResponseContainerSelector()).toBe("main[data-hotfix]")
    expect(adapter.getChatContentSelectors()).toEqual(["article[data-hotfix]"])
    expect(adapter.getUserQuerySelector()).toBe("article[data-role='user']")
    expect(adapter.getNewChatButtonSelectors()).toEqual(["button[data-new-chat]"])
    expect(adapter.getStopButtonSelectors()).toEqual(["button[data-stop]"])
    expect(adapter.getSubmitButtonSelectors()).toEqual(["button[data-submit]:not([disabled])"])
    expect(adapter.getSubmitKeyConfig()).toEqual({ key: "Ctrl+Enter" })
    expect(adapter.isGenerating()).toBe(true)
    expect(querySelector).toHaveBeenCalledWith("button[data-generating]")
    expect(adapter.getModelSwitcherConfig("patched-model")).toMatchObject({
      targetModelKeyword: "patched-model",
      selectorButtonSelectors: ["button[data-model]"],
      menuItemSelector: "button[data-model-item]",
      checkInterval: 25,
      maxAttempts: 3,
      menuRenderDelay: 10,
    })
    expect(adapter.getExportConfig()).toMatchObject({
      userQuerySelector: "article[data-export-user]",
      assistantResponseSelector: "article[data-export-assistant]",
    })
    expect(adapter.getWidthSelectors()).toEqual([
      { selector: "main[data-width]", property: "max-width" },
    ])
    expect(adapter.getZenModeConfig()).toEqual({ hide: ["aside[data-hotfix]"] })
    expect(adapter.getPanelAvoidanceConfig()).toMatchObject({
      scopeSelector: "main[data-chat]",
      widthSelectors: [{ selector: "article[data-message-width]" }],
      insetSelectors: [
        { selector: "section[data-messages]" },
        { selector: "footer[data-input-safe]" },
        { selector: "section[data-new-chat-safe]" },
      ],
    })
    expect(adapter.getUserQueryWidthSelectors()).toEqual([
      { selector: "article[data-user-width]", property: "max-width", noCenter: true },
    ])
  })

  it("keeps every private selector allowlist key connected to a runtime consumer", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../src/adapters/zai.ts", import.meta.url)),
      "utf8",
    )

    for (const key of Object.keys(ZAI_CONFIG.sitePrivateSelectors)) {
      expect(source, `Missing runtime consumer for sitePrivateSelectors.${key}`).toContain(
        `this.config.sitePrivateSelectors.${key}`,
      )
    }
  })
})
