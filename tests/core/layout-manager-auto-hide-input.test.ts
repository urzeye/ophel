import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AutoHideInputConfig, SiteAdapter } from "~adapters/base"
import { LayoutManager } from "~core/layout-manager"

vi.mock("~stores/settings-store", () => ({ useSettingsStore: { getState: vi.fn() } }))
vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: { query: vi.fn(() => []), walkShadowRoots: vi.fn() },
}))
vi.mock("~utils/font", () => ({
  INTER_LOCAL_FONT_FACE: "",
  getPlatformFontFamily: () => "sans-serif",
}))
vi.mock("~utils/i18n", () => ({ t: (key: string) => key }))

class MockClassList {
  private classes = new Set<string>()

  add(...names: string[]) {
    names.forEach((name) => this.classes.add(name))
  }

  remove(...names: string[]) {
    names.forEach((name) => this.classes.delete(name))
  }

  toggle(name: string, force?: boolean) {
    const next = force ?? !this.classes.has(name)
    if (next) this.classes.add(name)
    else this.classes.delete(name)
    return next
  }

  contains(name: string) {
    return this.classes.has(name)
  }
}

const AUTO_HIDE_CONFIG: AutoHideInputConfig = {
  container: ".composer",
  scrollContainer: ".chat-scroll",
  styles: [{ selector: ".conversation-container", property: "min-height", value: "0" }],
}

let rootClassList: MockClassList
let rootStyle: { setProperty: ReturnType<typeof vi.fn>; removeProperty: ReturnType<typeof vi.fn> }
let styleEl: {
  id: string
  textContent: string
  remove: ReturnType<typeof vi.fn>
}
let container: {
  isConnected: boolean
  parentElement: null
  getBoundingClientRect: ReturnType<typeof vi.fn>
  matches: ReturnType<typeof vi.fn>
  contains: ReturnType<typeof vi.fn>
  querySelector: ReturnType<typeof vi.fn>
  offsetHeight: number
}
let adapter: SiteAdapter
let manager: LayoutManager
let documentListeners: Map<string, (event: unknown) => void>
let windowListeners: Map<string, (event: unknown) => void>
let resizeObserverInstances: {
  callback: () => void
  observe: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}[]
let mutationObserverInstances: {
  callback: (mutations: { target: unknown; addedNodes: unknown[] }[]) => void
  observe: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}[]

// document 级监听对 shadow 内事件的 target 会被重定向为宿主元素；
// 用 closest 行为区分"Ophel 自身 UI"与页面元素
const ophelUiTarget = { closest: () => ophelUiTarget, matches: () => true }
const pageTarget = { closest: () => null, matches: () => false }

const internals = () =>
  manager as unknown as {
    updateAutoHideVisibility(event?: { clientY: number }): void
  }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()

  documentListeners = new Map()
  windowListeners = new Map()
  resizeObserverInstances = []
  mutationObserverInstances = []
  rootClassList = new MockClassList()
  rootStyle = { setProperty: vi.fn(), removeProperty: vi.fn() }
  styleEl = { id: "", textContent: "", remove: vi.fn() }
  container = {
    isConnected: true,
    parentElement: null,
    getBoundingClientRect: vi.fn(() => ({
      top: 800,
      left: 100,
      width: 600,
      height: 80,
      bottom: 880,
    })),
    matches: vi.fn(() => true),
    contains: vi.fn(() => false),
    querySelector: vi.fn(() => null),
    offsetHeight: 80,
  }
  vi.stubGlobal("document", {
    documentElement: { classList: rootClassList, style: rootStyle },
    head: { appendChild: vi.fn((el: unknown) => el) },
    body: {},
    activeElement: null,
    hasFocus: vi.fn(() => true),
    querySelector: vi.fn((selector: string) =>
      selector === AUTO_HIDE_CONFIG.container ? container : null,
    ),
    querySelectorAll: vi.fn(() => []),
    getElementById: vi.fn(() => null),
    createElement: vi.fn((tag: string) =>
      tag === "style"
        ? styleEl
        : {
            id: "",
            textContent: "",
            style: {},
            setAttribute: vi.fn(),
            remove: vi.fn(),
          },
    ),
    addEventListener: vi.fn((name: string, fn: (event: unknown) => void) => {
      documentListeners.set(name, fn)
    }),
    removeEventListener: vi.fn(),
  })
  vi.stubGlobal("window", {
    innerHeight: 900,
    matchMedia: vi.fn(() => ({ matches: false })),
    addEventListener: vi.fn((name: string, fn: (event: unknown) => void) => {
      windowListeners.set(name, fn)
    }),
    removeEventListener: vi.fn(),
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
  })
  vi.stubGlobal(
    "getComputedStyle",
    vi.fn(() => ({ backgroundColor: "rgba(0, 0, 0, 0)" })),
  )
  vi.stubGlobal(
    "ResizeObserver",
    class {
      callback: () => void
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(callback: () => void) {
        this.callback = callback
        resizeObserverInstances.push(this)
      }
    },
  )
  vi.stubGlobal(
    "MutationObserver",
    class {
      callback: (mutations: { target: unknown; addedNodes: unknown[] }[]) => void
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(callback: (mutations: { target: unknown; addedNodes: unknown[] }[]) => void) {
        this.callback = callback
        mutationObserverInstances.push(this)
      }
    },
  )
  // 测试环境无 DOM 类型全局，代码中的 instanceof 守卫需要它们存在
  vi.stubGlobal("HTMLTextAreaElement", class {})
  vi.stubGlobal("HTMLInputElement", class {})
  vi.stubGlobal("Element", class {})

  adapter = {
    getCapabilities: () => ({}),
    getPanelAvoidanceConfig: () => null,
    getAutoHideInputConfig: () => AUTO_HIDE_CONFIG,
    hasInputDraft: () => false,
    getChatContentSelectors: () => [],
    getUserQuerySelector: () => null,
  } as unknown as SiteAdapter

  manager = new LayoutManager(adapter, { enabled: false, value: "80", unit: "%" })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("LayoutManager auto-hide input", () => {
  it("injects floating css, floats the measured container and reserves a scroll spacer", () => {
    manager.updateAutoHideInput(true)

    expect(styleEl.textContent).toContain("position: fixed")
    expect(styleEl.textContent).toContain(AUTO_HIDE_CONFIG.container)
    expect(styleEl.textContent).toContain("translateY(calc(100% + 28px))")
    // 聚焦唤出走 JS 手势门控，CSS 层不得保留无门槛的 :focus-within 强制显示
    expect(styleEl.textContent).not.toContain("focus-within")
    expect(styleEl.textContent).toContain("min-height: 0 !important")
    // 滚动末尾占位用 ::after 伪元素，不往站点滚动容器注入真实 DOM 节点
    expect(styleEl.textContent).toContain(".chat-scroll::after")

    // 启用后可见态保持纯自然文档流：不挂浮层类、不做测量
    expect(rootClassList.contains("gh-ahi-float")).toBe(false)

    // 闲置稳定窗口后进入隐藏：此时才测量、浮层化并滑出
    vi.advanceTimersByTime(250)
    expect(rootClassList.contains("gh-ahi-float")).toBe(true)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(true)
    expect(rootStyle.setProperty).toHaveBeenCalledWith("--gh-ahi-top", "800px")
    expect(rootStyle.setProperty).toHaveBeenCalledWith("--gh-ahi-width", "600px")
    expect(rootStyle.setProperty).toHaveBeenCalledWith("--gh-ahi-footer", "20px")
  })

  it("hides when idle and reveals when the pointer approaches the viewport bottom", () => {
    manager.updateAutoHideInput(true)
    // 闲置隐藏有 200ms 稳定窗口，避免事件抖动造成闪现
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)
    vi.advanceTimersByTime(250)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(true)

    internals().updateAutoHideVisibility({ clientY: 750 })
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)

    // 显示过渡结束后落回自然文档流：可见态零干预
    expect(rootClassList.contains("gh-ahi-float")).toBe(true)
    vi.advanceTimersByTime(400)
    expect(rootClassList.contains("gh-ahi-float")).toBe(false)

    internals().updateAutoHideVisibility({ clientY: 200 })
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)
    vi.advanceTimersByTime(250)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(true)
  })

  it("collapses contradictory evaluation bursts into one stable state (no flicker)", () => {
    manager.updateAutoHideInput(true)
    vi.advanceTimersByTime(250)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(true)

    // 显示后立即收到相反结论（指针远离）→ 只是调度隐藏，不立即翻转
    internals().updateAutoHideVisibility({ clientY: 880 })
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)
    internals().updateAutoHideVisibility({ clientY: 100 })
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)
    // 稳定窗口内出现迟滞带/显示结论 → 取消待隐藏，全程零翻转
    internals().updateAutoHideVisibility({ clientY: 600 })
    vi.advanceTimersByTime(500)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)

    // 隐藏条件持续稳定后才真正隐藏
    internals().updateAutoHideVisibility({ clientY: 100 })
    vi.advanceTimersByTime(250)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(true)
  })

  it("never hides on coarse-pointer devices", () => {
    vi.stubGlobal("window", {
      ...window,
      matchMedia: vi.fn(() => ({ matches: true })),
    })
    manager.updateAutoHideInput(true)

    vi.advanceTimersByTime(500)
    // 触屏永不隐藏：始终保持自然文档流，不浮层化
    expect(rootClassList.contains("gh-ahi-float")).toBe(false)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)
  })

  it("does nothing when the adapter has no auto-hide config", () => {
    ;(adapter as { getAutoHideInputConfig: () => null }).getAutoHideInputConfig = () => null
    manager.updateAutoHideInput(true)

    expect(rootClassList.contains("gh-ahi-float")).toBe(false)
    expect(styleEl.textContent).toBe("")
  })

  it("is idempotent: repeated enable with the same value does not re-apply", () => {
    const getConfig = vi.fn(() => AUTO_HIDE_CONFIG)
    adapter.getAutoHideInputConfig = getConfig

    manager.updateAutoHideInput(true)
    manager.updateAutoHideInput(true)

    expect(getConfig).toHaveBeenCalledTimes(1)
  })

  it("does not re-observe the same container after a resize notification (no self-excited loop)", () => {
    manager.updateAutoHideInput(true)
    // 闲置隐藏后才浮层化并开始观察容器
    vi.advanceTimersByTime(250)

    expect(resizeObserverInstances).toHaveLength(1)
    const observer = resizeObserverInstances[0]
    expect(observer.observe).toHaveBeenCalledTimes(1)

    // 模拟 ResizeObserver 的初次通知：回调只应调度一次重同步，
    // 重同步后同一容器不得再次 observe，否则通知会无穷再生
    observer.callback()
    vi.advanceTimersByTime(1000)

    expect(observer.observe).toHaveBeenCalledTimes(1)
    // 重同步收敛后不应再有 pending 的重同步定时器
    expect(vi.getTimerCount()).toBe(0)
  })

  it("cleans up classes, css vars and styles when disabled", () => {
    manager.updateAutoHideInput(true)
    vi.advanceTimersByTime(250)
    manager.updateAutoHideInput(false)

    expect(rootClassList.contains("gh-ahi-float")).toBe(false)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)
    expect(rootStyle.removeProperty).toHaveBeenCalledWith("--gh-ahi-top")
    expect(styleEl.remove).toHaveBeenCalled()
  })

  it("freezes visibility while the pointer is over Ophel UI and resumes on page pointer", () => {
    manager.updateAutoHideInput(true)
    vi.advanceTimersByTime(250)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(true)

    // 指针移到页面底部 → 显示
    documentListeners.get("pointermove")?.({ target: pageTarget, clientY: 880 })
    vi.advanceTimersByTime(60)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)

    // 指针移入 Ophel 面板 → 冻结保持显示，而不是按"离开页面"隐藏
    documentListeners.get("pointermove")?.({ target: ophelUiTarget, clientY: 880 })
    vi.advanceTimersByTime(500)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)

    // 面板内的 input 事件（变量填写逐键触发）不改变显隐状态
    documentListeners.get("input")?.({ target: ophelUiTarget })
    vi.advanceTimersByTime(500)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)

    // 指针回到页面顶部 → 解除冻结，按迟滞规则隐藏（同样走稳定窗口）
    documentListeners.get("pointermove")?.({ target: pageTarget, clientY: 100 })
    vi.advanceTimersByTime(60)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)
    vi.advanceTimersByTime(250)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(true)
  })

  it("freezes visibility while focus is inside Ophel UI (settings modal / variable dialog)", () => {
    manager.updateAutoHideInput(true)
    vi.advanceTimersByTime(250)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(true)

    // 指针停在页面底部，输入框处于显示状态
    documentListeners.get("pointermove")?.({ target: pageTarget, clientY: 880 })
    vi.advanceTimersByTime(60)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)

    // 焦点进入 Ophel 面板（如变量对话框）→ 冻结保持显示
    ;(document as unknown as { activeElement: unknown }).activeElement = ophelUiTarget
    documentListeners.get("focusin")?.({ target: ophelUiTarget })
    vi.advanceTimersByTime(500)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)

    // 页面编辑器 blur 后焦点落入面板：focusout 的延迟判定同样冻结
    documentListeners.get("focusout")?.({ target: pageTarget })
    vi.advanceTimersByTime(10)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)
  })

  it("does not reveal on programmatic focus without a page gesture", () => {
    manager.updateAutoHideInput(true)
    vi.advanceTimersByTime(250)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(true)

    const editor = { matches: () => false }
    container.contains = vi.fn((el: unknown) => el === editor)
    ;(document as unknown as { activeElement: unknown }).activeElement = editor

    // 程序化聚焦（如切回标签页后站点自动 focus、失焦后重聚焦）：不唤出
    documentListeners.get("focusin")?.({ target: editor })
    vi.advanceTimersByTime(500)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(true)

    // Ophel 面板内的按键不算页面手势
    documentListeners.get("keydown")?.({ target: ophelUiTarget, key: "i" })
    documentListeners.get("focusin")?.({ target: editor })
    vi.advanceTimersByTime(500)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(true)

    // 真实页面手势（点击输入框 / Alt+I 按键）后的聚焦：唤出
    documentListeners.get("pointerdown")?.({ target: editor, clientY: 880 })
    documentListeners.get("focusin")?.({ target: editor })
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)
  })

  it("keeps visibility stable across window blur/focus instead of flashing", () => {
    manager.updateAutoHideInput(true)
    vi.advanceTimersByTime(250)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(true)

    const editor = { matches: () => false }
    container.contains = vi.fn((el: unknown) => el === editor)
    ;(document as unknown as { activeElement: unknown }).activeElement = editor
    const hasFocus = document.hasFocus as ReturnType<typeof vi.fn>

    // 手势聚焦 → 显示
    documentListeners.get("pointerdown")?.({ target: editor, clientY: 880 })
    documentListeners.get("focusin")?.({ target: editor })
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)

    // 窗口失焦（切标签页/切窗口）：冻结显隐、保留门闩，保持显示不滑走
    hasFocus.mockReturnValue(false)
    windowListeners.get("blur")?.({})
    documentListeners.get("focusout")?.({ target: editor })
    vi.advanceTimersByTime(500)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)

    // 切回窗口：Chrome 对保留焦点的编辑器重发 focusin（程序化、手势时间窗已过期）；
    // 门闩在失焦期间被保留，直接恢复原显隐，全程零翻转
    vi.advanceTimersByTime(600)
    hasFocus.mockReturnValue(true)
    documentListeners.get("focusin")?.({ target: editor })
    vi.advanceTimersByTime(500)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)
  })

  it("reveals immediately when a draft appears even while frozen over Ophel UI", () => {
    manager.updateAutoHideInput(true)
    vi.advanceTimersByTime(250)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(true)

    // 指针悬停在 Ophel 面板内（点击无变量提示词的场景），显隐冻结
    documentListeners.get("pointermove")?.({ target: ophelUiTarget, clientY: 300 })
    vi.advanceTimersByTime(60)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(true)

    // insertPrompt 写入编辑器触发 input 事件：草稿出现 → 压倒冻结立即唤出，
    // 不等用户移动鼠标
    adapter.hasInputDraft = () => true
    documentListeners.get("input")?.({ target: pageTarget })
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)
  })

  it("skips :has() revalidation for mutations outside the container subtree", () => {
    manager.updateAutoHideInput(true)
    vi.advanceTimersByTime(250)
    expect(mutationObserverInstances).toHaveLength(1)
    const observer = mutationObserverInstances[0]
    container.matches.mockClear()

    // 流式输出等无关区域的结构变化：不触发 :has() 选择器匹配
    observer.callback([{ target: { unrelated: true }, addedNodes: [{}] }])
    expect(container.matches).not.toHaveBeenCalled()

    // 容器自身/子树的结构变化：重校验选择器（仍匹配则不重同步）
    observer.callback([{ target: container, addedNodes: [] }])
    expect(container.matches).toHaveBeenCalled()

    // 容器断连且本批次有新节点：调度重同步重新解析容器
    container.isConnected = false
    observer.callback([{ target: { unrelated: true }, addedNodes: [] }])
    expect(vi.getTimerCount()).toBe(0)
    observer.callback([{ target: { unrelated: true }, addedNodes: [{}] }])
    expect(vi.getTimerCount()).toBeGreaterThan(0)
  })
})
