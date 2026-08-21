import { describe, expect, it, vi } from "vitest"

import { SITE_IDS, type BuiltinSiteId } from "~constants/defaults"
import { resolveBuiltinConfig } from "~core/builtin-config-registry"

import { SiteAdapter } from "~adapters/base"
import {
  BUILTIN_FEATURE_CAPABILITIES,
  SITE_PACK_CAPABILITIES,
  createFeatureCapabilitiesFromSignature,
  getBuiltinFeatureCapabilities,
  getFeatureCapabilitiesSignature,
  type SitePackCapability,
} from "~adapters/feature-capabilities"

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

// panel-avoidance 对所有内置站点统一省略：内置站点的避让能力由适配器代码中的
// getPanelAvoidanceConfig 与 SiteSettingsPage 白名单表达，不经过能力矩阵；
// 该能力只为社区 SitePack 的声明式门控服务。
const DOCUMENTED_OMISSIONS = {
  [SITE_IDS.AISTUDIO]: ["panel-avoidance", "document-outline"],
  [SITE_IDS.CHATGLM]: ["conversation-list", "panel-avoidance", "document-outline"],
  [SITE_IDS.CHATGPT]: ["panel-avoidance", "document-outline"],
  [SITE_IDS.CLAUDE]: ["panel-avoidance"],
  [SITE_IDS.DEEPSEEK]: ["model-lock", "panel-avoidance", "document-outline"],
  [SITE_IDS.DOUBAO]: ["panel-avoidance", "document-outline"],
  [SITE_IDS.GEMINI]: ["panel-avoidance"],
  [SITE_IDS.GEMINI_ENTERPRISE]: ["panel-avoidance"],
  [SITE_IDS.GROK]: ["clean", "panel-avoidance", "document-outline"],
  [SITE_IDS.IMA]: ["conversation-list", "panel-avoidance", "document-outline"],
  [SITE_IDS.KIMI]: ["panel-avoidance", "document-outline"],
  [SITE_IDS.QIANWEN]: ["conversation-list", "panel-avoidance", "document-outline"],
  [SITE_IDS.QWENAI]: ["conversation-list", "panel-avoidance", "document-outline"],
  [SITE_IDS.YUANBAO]: ["panel-avoidance", "document-outline"],
  [SITE_IDS.ZAI]: ["conversation-list", "clean", "panel-avoidance", "document-outline"],
} as const satisfies Record<BuiltinSiteId, readonly SitePackCapability[]>

class FixtureAdapter extends SiteAdapter {
  constructor(private readonly siteId: string) {
    super()
  }

  match(): boolean {
    return true
  }

  getSiteId(): string {
    return this.siteId
  }

  getName(): string {
    return "Fixture"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#000000", secondary: "#ffffff" }
  }

  getTextareaSelectors(): string[] {
    return []
  }

  insertPrompt(): boolean {
    return false
  }

  getConversationTitle(): string | null {
    return null
  }
}

describe("feature capability contract", () => {
  it("keeps one unique 15-entry vocabulary and stable signatures", () => {
    expect(SITE_PACK_CAPABILITIES).toHaveLength(15)
    expect(new Set(SITE_PACK_CAPABILITIES)).toHaveLength(15)

    const signature = getFeatureCapabilitiesSignature(["zen", "outline", "clean"])

    expect(signature).toBe("clean\u0000outline\u0000zen")
    expect(createFeatureCapabilitiesFromSignature(signature)).toEqual(
      new Set<SitePackCapability>(["clean", "outline", "zen"]),
    )
    expect(getFeatureCapabilitiesSignature(createFeatureCapabilitiesFromSignature(signature))).toBe(
      signature,
    )
    expect(createFeatureCapabilitiesFromSignature("")).toEqual(new Set())
  })

  it("describes all 15 built-in sites explicitly with only documented omissions", () => {
    const siteIds = Object.values(SITE_IDS)

    expect(siteIds).toHaveLength(15)
    expect(Object.keys(BUILTIN_FEATURE_CAPABILITIES).sort()).toEqual([...siteIds].sort())

    for (const siteId of siteIds) {
      const omitted = new Set<SitePackCapability>(DOCUMENTED_OMISSIONS[siteId])
      const expected = SITE_PACK_CAPABILITIES.filter((capability) => !omitted.has(capability))

      expect(BUILTIN_FEATURE_CAPABILITIES[siteId], siteId).toEqual(expected)
    }
  })

  it("returns defensive built-in sets and keeps unknown adapters closed", () => {
    const first = getBuiltinFeatureCapabilities(SITE_IDS.CHATGPT)
    first.clear()

    expect(getBuiltinFeatureCapabilities(SITE_IDS.CHATGPT)).toEqual(
      new Set(BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.CHATGPT]),
    )
    expect(getBuiltinFeatureCapabilities("pack:fixture-chat")).toEqual(new Set())
  })

  it("keeps feature capabilities independent from layout capabilities", () => {
    const builtIn = new FixtureAdapter(SITE_IDS.DEEPSEEK)
    const community = new FixtureAdapter("pack:fixture-chat")

    expect(builtIn.getCapabilities()).toEqual({})
    expect(builtIn.getFeatureCapabilities()).toEqual(
      new Set(BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.DEEPSEEK]),
    )
    expect(builtIn.hasFeatureCapability("model-lock")).toBe(false)
    expect(builtIn.hasFeatureCapability("outline")).toBe(true)
    expect(community.getFeatureCapabilities()).toEqual(new Set())
    expect(community.hasFeatureCapability("outline")).toBe(false)
  })

  it("keeps every built-in config descriptor on the shared matrix", async () => {
    for (const siteId of Object.values(SITE_IDS)) {
      const descriptor = await resolveBuiltinConfig(siteId)

      expect(descriptor, siteId).not.toBeNull()
      expect(descriptor?.baseConfig.capabilities, siteId).toEqual([
        ...BUILTIN_FEATURE_CAPABILITIES[siteId],
      ])
    }
  })
})
