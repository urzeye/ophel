import { beforeAll, describe, expect, it, vi } from "vitest"

// dom-toolkit 模块顶层会实例化 DOMToolkit 单例并读取 document，Node 环境下先打桩再动态导入
let hasOphelEdgePeekOverlay: typeof import("~utils/dom-toolkit").hasOphelEdgePeekOverlay
let hasOphelInteractionLayer: typeof import("~utils/dom-toolkit").hasOphelInteractionLayer

beforeAll(async () => {
  vi.stubGlobal("document", { body: null })
  ;({ hasOphelEdgePeekOverlay, hasOphelInteractionLayer } = await import("~utils/dom-toolkit"))
})

type FakeElement = { classes: string[]; attrs: Record<string, string> }

// 支持本仓库交互层选择器用到的三种片段：.class、[attr="value"] 及 :not(.class) 后缀
const matchesEntry = (element: FakeElement, entry: string): boolean => {
  const [base, notPart] = entry.split(":not(")
  if (notPart) {
    const excluded = notPart.replace(")", "")
    if (excluded.startsWith(".") && element.classes.includes(excluded.slice(1))) return false
  }
  if (base.startsWith(".")) return element.classes.includes(base.slice(1))
  const attrMatch = /^\[(.+?)="(.+)"\]$/.exec(base)
  if (attrMatch) return element.attrs[attrMatch[1]] === attrMatch[2]
  return false
}

const fakeRoot = (elements: FakeElement[]) =>
  ({
    querySelector: (selector: string) =>
      elements.find((element) =>
        selector.split(", ").some((entry) => matchesEntry(element, entry)),
      ) ?? null,
  }) as unknown as Element

// QuickButtons 工具箱菜单实际渲染时同时带 class 与两个 data 属性
const toolsMenuPopover: FakeElement = {
  classes: ["quick-menu-popover", "side-left"],
  attrs: {
    "data-ophel-interaction-layer": "true",
    "data-ophel-hover-width-retain-layer": "true",
  },
}

const panelDialog: FakeElement = { classes: ["gh-dialog-overlay"], attrs: {} }

const panelDropdown: FakeElement = {
  classes: ["select-dropdown-menu"],
  attrs: { "data-ophel-interaction-layer": "true" },
}

describe("edge peek overlay detection", () => {
  it("ignores the toolbar-owned tools menu popover", () => {
    const root = fakeRoot([toolsMenuPopover])
    expect(hasOphelEdgePeekOverlay([root])).toBe(false)
  })

  it("keeps the tools menu popover as a generic interaction layer", () => {
    const root = fakeRoot([toolsMenuPopover])
    expect(hasOphelInteractionLayer([root])).toBe(true)
  })

  it("still reacts to panel-internal dialogs and dropdowns", () => {
    expect(hasOphelEdgePeekOverlay([fakeRoot([panelDialog])])).toBe(true)
    expect(hasOphelEdgePeekOverlay([fakeRoot([panelDropdown])])).toBe(true)
  })

  it("reacts when a panel dialog coexists with the tools menu popover", () => {
    const root = fakeRoot([toolsMenuPopover, panelDialog])
    expect(hasOphelEdgePeekOverlay([root])).toBe(true)
  })
})
