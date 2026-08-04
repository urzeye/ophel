import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { resources } from "~locales/resources"
import { darkPresets, lightPresets } from "~utils/themes"

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8")

const compact = (source: string): string => source.replace(/\s+/g, " ")

const mainPanelSource = readSource("../../src/components/MainPanel.tsx")
const quickButtonsSource = readSource("../../src/components/QuickButtons.tsx")
const conversationsSource = readSource("../../src/components/ConversationsTab.tsx")
const settingsModalSource = readSource("../../src/components/SettingsModal.tsx")
const modelLockSource = readSource("../../src/components/ModelLockSettingsContent.tsx")
const siteSettingsSource = readSource("../../src/tabs/options/pages/SiteSettingsPage.tsx")
const optionsPageSource = readSource("../../src/tabs/options.tsx")
const settingsCssSource = readSource("../../src/styles/settings.css")
const uiEntrySource = readSource("../../src/contents/ui-entry.tsx")
const optionsCssSource = readSource("../../src/tabs/options.css")

describe("feature capability panel boundaries", () => {
  it("gates community panel tabs and every hidden-tab navigation path", () => {
    const source = compact(mainPanelSource)

    expect(source).toContain(
      "const enforceFeatureCapabilities = Boolean(adapter && !isBuiltinSiteId(siteId))",
    )
    expect(source).toContain('[TAB_IDS.PROMPTS]: "prompt-insert"')
    expect(source).toContain('[TAB_IDS.CONVERSATIONS]: "conversation-list"')
    expect(source).toContain('[TAB_IDS.OUTLINE]: "outline"')
    expect(source).toContain(
      'const canOpenNewTab = !enforceFeatureCapabilities || featureCapabilities.has("new-chat")',
    )
    expect(source).toContain(
      'const canShowOutlineUserQueries = !enforceFeatureCapabilities || featureCapabilities.has("outline-user-queries")',
    )
    expect(source).toContain('setActiveTab(visibleTabs[0] ?? "")')
    expect(source).toContain("if (isInitialized && !visibleTabs.includes(activeTab))")
    expect(source).toContain("if (visibleTabs.includes(TAB_IDS.OUTLINE))")
    expect(source).toContain("if (visibleTabs.includes(TAB_IDS.CONVERSATIONS))")
    expect(source).toContain('if (typeof idx === "number" && visibleTabs[idx])')
    expect(source).toContain("const currentIndex = visibleTabs.indexOf(tab)")
    expect(source).toContain("{visibleTabs.map((tab) => {")
    expect(source).toContain("{visibleTabs.includes(activeTab) && (")
    expect(source).toContain("currentSettings.tab?.openInNewTab && canOpenNewTab")
    expect(source).toContain("showUserQueryToggle={canShowOutlineUserQueries}")
  })

  it("gates quick buttons and tools without changing generic controls", () => {
    const source = compact(quickButtonsSource)

    expect(source).toContain(
      "const enforceFeatureCapabilities = Boolean(adapter && !isBuiltinSiteId(siteId))",
    )
    expect(source).toContain('zenMode: "zen"')
    expect(source).toContain('[TOOLS_MENU_IDS.EXPORT]: "export-basic"')
    expect(source).toContain('[TOOLS_MENU_IDS.SEGMENTED_EXPORT]: "export-basic"')
    expect(source).toContain('[TOOLS_MENU_IDS.COPY_MARKDOWN]: "export-basic"')
    expect(source).toContain('[TOOLS_MENU_IDS.MOVE]: "conversation-list"')
    expect(source).toContain('[TOOLS_MENU_IDS.SET_TAG]: "conversation-list"')
    expect(source).toContain('[TOOLS_MENU_IDS.MODEL_LOCK]: "model-lock"')
    expect(source).toContain('[TOOLS_MENU_IDS.CLEANUP]: "outline"')
    expect(source).toContain("if (!isCollapsedButtonSupported(id)) return null")
    expect(source).toContain("if (!isToolsMenuItemSupported(item.id as ToolsMenuId)) continue")
    expect(source).toContain('if (!supportsCapability("zen")) return')
    expect(source).toContain('if (newZenEnabled && supportsCapability("clean"))')
  })

  it("derives the conversation unsupported state from the shared matrix", () => {
    expect(conversationsSource).not.toContain("unsupportedSiteLabels")
    expect(conversationsSource).toContain(
      'manager.siteAdapter.hasFeatureCapability("conversation-list")',
    )
    expect(conversationsSource).toContain(
      "manager.siteAdapter.getName() || manager.siteAdapter.getSiteId()",
    )
    expect(conversationsSource).toContain("if (isConversationUnsupported)")
    expect(conversationsSource).toContain("disabled={syncing || isConversationUnsupported}")
    expect(conversationsSource).toContain("{showUnsupportedMask && (")
  })
})

describe("feature capability settings boundaries", () => {
  it("filters community settings, normalizes hidden tabs, and keeps Options unchanged", () => {
    const source = compact(siteSettingsSource)

    expect(source).toContain(
      "const isCommunitySitePack = Boolean(adapter && !isBuiltinSiteId(siteId))",
    )
    expect(source).toContain(
      'const hasModelLockContent = Boolean(modelLockContent) && supportsFeature("model-lock")',
    )
    expect(source).toContain('const supportsPageWidth = supportsFeature("width")')
    expect(source).toContain('(isCommunitySitePack && supportsFeature("panel-avoidance"))')
    expect(source).toContain(
      "(supportsPageWidth && (adapter?.getUserQueryWidthSelectors().length ?? 0) > 0)",
    )
    expect(source).toContain('const supportsZenMode = supportsFeature("zen")')
    expect(source).toContain('const supportsCleanMode = supportsFeature("clean")')
    expect(source).toContain("normalizeSiteSettingsTab(initialTab, availableTabs)")
    expect(source).toContain("{supportsPageWidth && (")
    expect(source).toContain("{supportsUserQueryWidth && (")
    expect(source).toContain("{supportsZenMode && (")
    expect(source).toContain("{supportsCleanMode && (")
    expect(source).toContain("{isCommunitySitePack && (")
    expect(source).toContain('t("communitySitePackBadge")')
    expect(source).toContain('t("communitySitePackDesc")')
    expect(source).toContain('rel="noreferrer"')
    expect(compact(optionsPageSource)).toContain(
      "<SiteSettingsPage siteId={siteId} initialTab={initialSubTab} />",
    )
  })

  it("threads the active instance into settings and renders one community model-lock row", () => {
    const modalSource = compact(settingsModalSource)
    const rowSource = compact(modelLockSource)

    expect(modalSource).toContain(
      "<SiteSettingsPage siteId={siteId} siteInstanceKey={siteInstanceKey} adapter={adapter}",
    )
    expect(modalSource).toContain(
      "<ModelLockSettingsContent siteId={siteInstanceKey} siteName={adapter.getName()} />",
    )
    expect(rowSource).toContain("if (siteId && !isBuiltinSiteId(siteId))")
    expect(rowSource).toContain("label={siteName || siteId}")
    expect(rowSource).toContain("siteKey={siteId}")
    expect(rowSource).toContain('settingId="model-lock-community-site-pack"')
  })
})

describe("feature capability localization and style delivery", () => {
  it("keeps the community notice complete in all 11 application locales", () => {
    expect(Object.keys(resources).sort()).toEqual(
      ["zh-CN", "zh-TW", "en", "ja", "ko", "it", "fr", "de", "ru", "es", "pt"].sort(),
    )

    for (const [locale, messages] of Object.entries(resources)) {
      for (const key of ["communitySitePackBadge", "communitySitePackDesc", "learnMore"] as const) {
        expect(messages[key], `${locale}.${key}`).toEqual(expect.any(String))
        expect(messages[key].trim(), `${locale}.${key}`).not.toBe("")
      }
    }
  })

  it("uses variables supplied by all 24 themes and reaches both style entry points", () => {
    const presets = [...lightPresets, ...darkPresets]

    expect(lightPresets).toHaveLength(12)
    expect(darkPresets).toHaveLength(12)
    expect(presets).toHaveLength(24)
    for (const preset of presets) {
      expect(preset.variables, preset.id).toHaveProperty("--gh-primary")
      expect(preset.variables, preset.id).toHaveProperty("--gh-card-bg")
      expect(preset.variables, preset.id).toHaveProperty("--gh-text-secondary")
    }

    expect(settingsCssSource).toContain(".settings-site-pack-notice")
    expect(settingsCssSource).toContain("var(--gh-primary, #4285f4)")
    expect(settingsCssSource).toContain("var(--gh-card-bg, #ffffff)")
    expect(settingsCssSource).toContain("var(--gh-text-secondary, #6b7280)")
    expect(uiEntrySource).toContain('import settingsCssText from "data-text:~styles/settings.css"')
    expect(uiEntrySource).toContain("settingsCssText +")
    expect(optionsCssSource).toContain('@import url("../styles/settings.css");')
  })
})
