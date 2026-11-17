import {
  SiteAdapter,
  type AssistantMermaidSupportMode,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type AutoHideInputConfig,
  type OutlineItem,
  type OutlineSource,
  type PanelAvoidanceConfig,
  type QuickQuoteSupportMode,
  type WidthSelectorConfig,
  type ZenModeConfig,
} from "../base"
import type { SitePackCapability } from "../feature-capabilities"
import {
  extractHeadingOutline,
  findHeadingByText,
  findScrollableAncestor,
  scrollElementInContainer,
} from "~core/outline/dom-outline"
import { getCurrentLang, t } from "~utils/i18n"

import { resolveSitePackName } from "./localization"
import { siteMatchPatternMatchesUrl, siteMatchPatternOrigin } from "./match-pattern"
import type {
  SitePackManifest,
  SitePackThemeSyncConfig,
  SitePackThemeSyncDomTarget,
  SiteTraits,
} from "./types"

const DEFAULT_THEME_COLORS = {
  primary: "#2563eb",
  secondary: "#1d4ed8",
}

const ZERO_WIDTH_EDITOR_MARKERS = /[\u200B\u200C\u200D\uFEFF]/g
const EDITOR_WHITESPACE = /\s+/g

// 框架编辑器（如 Lexical）收到输入事件后按自身模型异步调和 DOM，
// 同步校验会读到提交前的旧内容，需要短轮询等待提交完成再判定。
const EDITOR_UPDATE_POLL_INTERVAL_MS = 50
const EDITOR_UPDATE_POLL_TIMEOUT_MS = 500
// 模型驱动编辑器的内部选区靠 selectionchange 异步同步，select-all 后需要
// 让出事件循环再操作，否则操作只作用于过期选区。
const EDITOR_SELECTION_SYNC_MS = 50
const EDITOR_CLEAR_MAX_ROUNDS = 3

type TextControl = HTMLInputElement | HTMLTextAreaElement

type ConfiguredEditor =
  | { mode: "textarea"; editor: TextControl }
  | { mode: "contenteditable"; editor: HTMLElement }

interface OutlineCandidate {
  element: Element
  level: number
  text: string
  isUserQuery: boolean
}

export interface DeclarativeAdapterOptions {
  explicitOrigin?: string
  installSource?: "registry" | "local"
}

export interface DeclarativeAdapterPackageMetadata {
  id: string
  version: number
  source?: "registry" | "local"
}

const isTextControl = (element: HTMLElement): element is TextControl =>
  element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement

/**
 * 按点分隔路径写入嵌套对象的值；中间层缺失或被占用时重建为对象。
 * valuePath 已经过 manifest 校验（不含 __proto__ 等危险段），这里仍按段防御一次。
 */
const setNestedThemeValue = (
  target: Record<string, unknown>,
  path: string,
  value: string | number,
): void => {
  const segments = path.split(".")
  let current: Record<string, unknown> = target
  for (const segment of segments.slice(0, -1)) {
    if (segment === "__proto__" || segment === "prototype" || segment === "constructor") return
    const next: unknown = current[segment]
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      current[segment] = {}
    }
    current = current[segment] as Record<string, unknown>
  }
  const last = segments[segments.length - 1]
  if (last === "__proto__" || last === "prototype" || last === "constructor") return
  current[last] = value
}

/** 按点分隔路径读取嵌套对象的值；路径非法或类型不符时返回 undefined。 */
const getNestedThemeValue = (source: Record<string, unknown>, path: string): unknown => {
  let current: unknown = source
  for (const segment of path.split(".")) {
    if (segment === "__proto__" || segment === "prototype" || segment === "constructor") {
      return undefined
    }
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

// 模型驱动编辑器（Slate/Lexical/ProseMirror/Draft.js）按自身数据模型渲染；Chrome 已不再为
// execCommand 派发 beforeinput，其直接 DOM 修改不会进入模型，表现为文本可见但站点状态
// 为空；Draft.js 上更会撞毁 React 节点映射（removeChild 崩溃、编辑器被销毁）。这类编辑器
// 必须改走各自监听的合成事件管线（paste/beforeinput/keydown），禁止 DOM 级强写。
// Slate 的占位提示是编辑器内的真实 DOM 节点（data-slate-placeholder），会被
// textContent/innerText 一并读出：空编辑器被读为非空、插入内容被占位文本截断，
// 插入/清空校验都会误判。读数时统一排除占位子树。
const SLATE_PLACEHOLDER_SELECTOR = "[data-slate-placeholder]"

const getEditorText = (editor: HTMLElement): string => {
  if (isTextControl(editor)) return editor.value
  if (!editor.querySelector(SLATE_PLACEHOLDER_SELECTOR)) return editor.textContent ?? ""
  let text = ""
  const walker = editor.ownerDocument.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest(SLATE_PLACEHOLDER_SELECTOR)) {
      text += node.nodeValue ?? ""
    }
  }
  return text
}

// innerText 反映渲染后的换行结构（段落、<br>）；textContent 会把多段落拼成
// 无换行的串，无法区分"按段落正确拆分"和"换行被吃掉"。
const getEditorRenderedText = (editor: HTMLElement): string => {
  if (isTextControl(editor)) return editor.value
  const placeholders = Array.from(editor.querySelectorAll<HTMLElement>(SLATE_PLACEHOLDER_SELECTOR))
  if (placeholders.length === 0) return editor.innerText
  // innerText 只反映渲染树：临时隐藏占位节点即可排除其文本，读取后立即还原。
  const previousDisplays = placeholders.map((element) => element.style.display)
  placeholders.forEach((element) => {
    element.style.display = "none"
  })
  try {
    return editor.innerText
  } finally {
    placeholders.forEach((element, index) => {
      element.style.display = previousDisplays[index]
    })
  }
}

// contenteditable DOM（如 ProseMirror 多段落）的 textContent 不保留换行与原始空白，
// 校验插入结果时移除两侧全部空白字符，避免多行内容已插入却被误判为失败。
const normalizeEditorText = (text: string): string =>
  text.replace(ZERO_WIDTH_EDITOR_MARKERS, "").replace(EDITOR_WHITESPACE, "")

// 结构敏感比对：折叠普通空白但保留换行，连续空行差异容忍；换行丢失会判失败。
const normalizeEditorRenderedText = (text: string): string =>
  text
    .replace(ZERO_WIDTH_EDITOR_MARKERS, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim()

type EditorInsertMethod = "beforeinput" | "paste" | "execCommand"
type EditorDeleteMethod = "beforeinput" | "keydownBackspace" | "execCommand"

interface EditorEventPipeline {
  insert: EditorInsertMethod[]
  delete: EditorDeleteMethod[]
}

/** 普通 contenteditable：可信 execCommand 优先；合成不可信事件不触发默认行为，仅作兜底。 */
const PLAIN_EDITOR_PIPELINE: EditorEventPipeline = {
  insert: ["execCommand", "beforeinput"],
  delete: ["execCommand", "beforeinput"],
}

// 按编辑器框架选择事件管线，每种方式之后都经内容校验再决定是否尝试下一种；
// 返回 null 表示非模型驱动编辑器（走 PLAIN_EDITOR_PIPELINE）：
// - Slate 的合成 beforeinput（insertText）能完整进入模型并保留多行（实测 slate-react 0.147）。
// - Lexical/ProseMirror 需要合成 paste 才能保留换行（#1022：其 insertText 管线会丢换行）；
//   删除分别走 beforeinput 删除（#1022 的 Lexical 模型级清空）和合成 keydown Backspace
//   （doubao 的 TipTap 生产路径）。
// - Draft.js 忽略合成 beforeinput（实测 no-op），仅接受合成 paste 与 keydown Backspace；
//   execCommand 对 Draft 是致命的（内容部分入模型后 React removeChild 崩溃），绝不使用。
// execCommand 对其余模型驱动编辑器只产生模型外的 DOM 污染，因此一律排在最后。
const getEditorEventPipeline = (editor: HTMLElement): EditorEventPipeline | null => {
  if (editor.matches(".public-DraftEditor-content")) {
    return { insert: ["paste"], delete: ["keydownBackspace"] }
  }
  if (editor.matches("[data-slate-editor]")) {
    return {
      insert: ["beforeinput", "paste", "execCommand"],
      delete: ["beforeinput", "execCommand"],
    }
  }
  if (editor.matches("[data-lexical-editor]")) {
    return {
      insert: ["paste", "beforeinput", "execCommand"],
      delete: ["beforeinput", "execCommand"],
    }
  }
  if (editor.matches(".ProseMirror")) {
    return {
      insert: ["paste", "beforeinput", "execCommand"],
      delete: ["keydownBackspace", "beforeinput", "execCommand"],
    }
  }
  return null
}

const compareDomOrder = (left: Element, right: Element): number => {
  if (left === right) return 0

  const position = left.compareDocumentPosition(right)
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
  return 0
}

const isInsideOphelContainer = (element: Element, boundary: Element): boolean => {
  let current: Element | null = element

  while (current) {
    if (Array.from(current.classList).some((className) => className.startsWith("gh-"))) {
      return true
    }
    if (current === boundary) break
    current = current.parentElement
  }

  return false
}

const cloneZenModeConfig = (config: ZenModeConfig): ZenModeConfig => {
  const { hide, preserveFlow, rootClass, styles } = config
  return {
    ...(hide ? { hide: [...hide] } : {}),
    ...(preserveFlow ? { preserveFlow: [...preserveFlow] } : {}),
    ...(rootClass ? { rootClass: { ...rootClass } } : {}),
    ...(styles ? { styles: styles.map((style) => ({ ...style })) } : {}),
  }
}

const cloneNetworkMonitorConfig = (config: NetworkMonitorConfig): NetworkMonitorConfig => ({
  urlPatterns: [...config.urlPatterns],
  silenceThreshold: config.silenceThreshold,
  ...(config.urlPathEndsWith ? { urlPathEndsWith: [...config.urlPathEndsWith] } : {}),
  ...(config.requestBodyRules
    ? {
        requestBodyRules: config.requestBodyRules.map((rule) => ({
          ...rule,
          metadata: { ...rule.metadata },
        })),
      }
    : {}),
})

const normalizeElementText = (element: Element | null): string | null => {
  const text = element?.textContent?.replace(/\s+/g, " ").trim()
  return text || null
}

/** 把已通过校验的 SitePack manifest 显式映射到现有 SiteAdapter API。 */
export class DeclarativeAdapter extends SiteAdapter {
  private manifest: SitePackManifest
  private conversationIdPattern: RegExp | null = null
  private sessionIdPattern: RegExp | null = null
  private newConversationPathPatterns: RegExp[] | null = null
  private featureCapabilities: ReadonlySet<SitePackCapability> = new Set()
  private readonly explicitOrigin?: string
  private readonly installSource?: "registry" | "local"

  constructor(manifest: SitePackManifest, options: DeclarativeAdapterOptions = {}) {
    super()
    this.explicitOrigin = options.explicitOrigin
    this.installSource = options.installSource
    this.manifest = structuredClone(manifest)
    this.rebuildManifestState()
  }

  private rebuildManifestState(): void {
    this.featureCapabilities = new Set(this.manifest.capabilities)
    this.conversationIdPattern = this.manifest.conversation
      ? new RegExp(this.manifest.conversation.idFrom.regex)
      : null
    this.sessionIdPattern = this.manifest.session?.idFromPathRegex
      ? new RegExp(this.manifest.session.idFromPathRegex)
      : null
    this.newConversationPathPatterns = this.manifest.session?.newConversationPathPatterns
      ? this.manifest.session.newConversationPathPatterns.map((pattern) => new RegExp(pattern))
      : null
    this.textarea = null
  }

  /** 站点包的结构特征声明来自 manifest，而非内置站点的 config 字段。 */
  protected getSiteTraits(): SiteTraits {
    return this.manifest.traits ?? {}
  }

  getSitePackMetadata(): DeclarativeAdapterPackageMetadata {
    return {
      id: this.manifest.id,
      version: this.manifest.version,
      ...(this.installSource ? { source: this.installSource } : {}),
    }
  }

  applySitePackManifest(manifest: SitePackManifest): boolean {
    if (manifest.id !== this.manifest.id) {
      throw new TypeError(
        `Cannot replace SitePack ${this.manifest.id} with a different package: ${manifest.id}`,
      )
    }
    if (manifest.version < this.manifest.version) {
      throw new TypeError(
        `Cannot roll back SitePack ${manifest.id}: ${manifest.version} < ${this.manifest.version}`,
      )
    }
    if (manifest.version === this.manifest.version) return false

    this.manifest = structuredClone(manifest)
    this.rebuildManifestState()
    return true
  }

  match(): boolean {
    const url = new URL(window.location.href)
    if (this.explicitOrigin !== undefined) return url.origin === this.explicitOrigin
    return this.manifest.matches.some((pattern) => siteMatchPatternMatchesUrl(url, pattern))
  }

  getSiteId(): string {
    return `pack:${this.manifest.id}`
  }

  canClaimLegacySiteData(): boolean {
    if (this.explicitOrigin !== undefined) return false
    if (
      this.manifest.matches.length === 0 ||
      this.manifest.matches.some((match) => /^https:\/\/\*\./i.test(match))
    ) {
      return false
    }

    const origins = new Set(this.manifest.matches.map(siteMatchPatternOrigin))
    return origins.size === 1 && origins.has(window.location.origin)
  }

  getName(): string {
    return resolveSitePackName(this.manifest, getCurrentLang())
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { ...(this.manifest.theme ?? DEFAULT_THEME_COLORS) }
  }

  getFeatureCapabilities(): Set<SitePackCapability> {
    return new Set(this.featureCapabilities)
  }

  getTextareaSelectors(): string[] {
    return [...(this.manifest.selectors.textarea ?? [])]
  }

  private getConfiguredEditor(): ConfiguredEditor | null {
    const mode = this.manifest.input?.mode
    if (!mode) return null

    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return null

    if (mode === "textarea") {
      return isTextControl(editor) ? { mode, editor } : null
    }

    return editor.isContentEditable ? { mode, editor } : null
  }

  private isEditorUpdateValid(
    editor: HTMLElement,
    content: string,
    requireSubmitButton: boolean,
  ): boolean {
    if (!editor.isConnected) return false

    const editorText = getEditorText(editor)
    const contentMatches =
      content.length > 0
        ? normalizeEditorRenderedText(getEditorRenderedText(editor)).includes(
            normalizeEditorRenderedText(content),
          )
        : editorText.replace(ZERO_WIDTH_EDITOR_MARKERS, "").length === 0

    return contentMatches && (!requireSubmitButton || this.hasReadySubmitButton())
  }

  /**
   * 校验插入/清空结果。先立即校验一次，普通 contenteditable 同步命中、
   * 不引入额外延迟；未命中再短轮询，覆盖框架编辑器的异步提交（如
   * Perplexity 的 Lexical 多行插入，提交晚于同步校验，曾误报插入失败）。
   */
  private async waitForEditorUpdate(
    editor: HTMLElement,
    content: string,
    requireSubmitButton: boolean,
  ): Promise<boolean> {
    const deadline = Date.now() + EDITOR_UPDATE_POLL_TIMEOUT_MS
    for (;;) {
      if (this.isEditorUpdateValid(editor, content, requireSubmitButton)) return true
      if (Date.now() >= deadline) return false
      await new Promise((resolve) => setTimeout(resolve, EDITOR_UPDATE_POLL_INTERVAL_MS))
    }
  }

  private isSubmitButtonDisabled(element: HTMLElement): boolean {
    const disableableElement = element as HTMLElement & { disabled?: boolean }
    return (
      disableableElement.disabled === true ||
      element.hasAttribute("disabled") ||
      element.getAttribute("aria-disabled") === "true" ||
      element.getAttribute("data-disabled") === "true"
    )
  }

  private isConfiguredElementVisible(element: Element): boolean {
    if (!element.isConnected) return false
    if (element.closest(".gh-main-panel, .gh-queue-panel")) return false

    const style = window.getComputedStyle(element)
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number.parseFloat(style.opacity || "1") === 0
    ) {
      return false
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  private hasReadySubmitButton(): boolean {
    return (this.manifest.selectors.submitButton ?? []).some((selector) =>
      this.findAllElementsBySelector(selector).some(
        (element) =>
          element instanceof HTMLElement &&
          this.isConfiguredElementVisible(element) &&
          !this.isSubmitButtonDisabled(element),
      ),
    )
  }

  private setTextControlValue(editor: TextControl, content: string): boolean {
    const prototype =
      editor instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set
    if (!setter) return false

    try {
      editor.focus()
      setter.call(editor, content)
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, composed: true, data: content }),
      )
      editor.dispatchEvent(new Event("change", { bubbles: true }))

      if (
        editor instanceof HTMLTextAreaElement ||
        ["text", "search", "tel", "url", "password"].includes(editor.type)
      ) {
        editor.setSelectionRange(content.length, content.length)
      }
    } catch {
      return false
    }

    return true
  }

  private selectAllEditorContent(editor: HTMLElement): boolean {
    try {
      editor.ownerDocument.execCommand("selectAll", false, undefined)
    } catch {
      // ignore
    }

    const selection = editor.ownerDocument.getSelection()
    if (!selection) return false

    try {
      selection.selectAllChildren(editor)
      return true
    } catch {
      // selectAllChildren 失败时选区停留在 execCommand 的整页范围，
      // 不能当作成功，否则后续 insertText/deletion 会作用于错误位置。
      return false
    }
  }

  private async replaceContentEditableContent(
    editor: HTMLElement,
    content: string,
    requireSubmitButton: boolean,
  ): Promise<boolean> {
    editor.focus()

    if (content === "") {
      // 模型驱动编辑器（Slate/Lexical 等）的内部选区靠 selectionchange 异步同步，
      // select-all 后必须让出事件循环再删除，否则删除只作用于过期选区
      // （Perplexity 上表现为只删掉光标前的一两个字符）；未清空就重选再删。
      // 删除方式按框架管线排序（见 getEditorEventPipeline）；普通 contenteditable
      // 合成事件不触发默认行为，仅作兜底。
      const detectedPipeline = getEditorEventPipeline(editor)
      const pipeline = detectedPipeline ?? PLAIN_EDITOR_PIPELINE
      const modelDriven = detectedPipeline !== null
      for (const method of pipeline.delete) {
        for (let round = 0; round < EDITOR_CLEAR_MAX_ROUNDS; round++) {
          if (!this.selectAllEditorContent(editor)) return false
          await new Promise((resolve) => setTimeout(resolve, EDITOR_SELECTION_SYNC_MS))
          try {
            if (method === "execCommand") {
              editor.ownerDocument.execCommand("delete", false, undefined)
            } else if (method === "keydownBackspace") {
              editor.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: "Backspace",
                  code: "Backspace",
                  keyCode: 8,
                  which: 8,
                  bubbles: true,
                  composed: true,
                }),
              )
            } else {
              editor.dispatchEvent(
                new InputEvent("beforeinput", {
                  bubbles: true,
                  cancelable: true,
                  composed: true,
                  inputType: "deleteContentBackward",
                }),
              )
            }
          } catch {
            // Unsupported event construction; validation below reports failure.
          }
          if (await this.waitForEditorUpdate(editor, "", requireSubmitButton)) return true
        }
      }

      // 模型驱动编辑器的 DOM 由模型渲染，强写 textContent 只会被重渲染还原甚至
      // 破坏 React 节点映射，到这里只能判定失败，不做 DOM 级强清。
      if (modelDriven) return false

      if (!this.selectAllEditorContent(editor)) return false

      try {
        editor.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Backspace",
            code: "Backspace",
            keyCode: 8,
            which: 8,
            bubbles: true,
            composed: true,
          }),
        )
      } catch {
        // Unsupported keydown construction continues.
      }

      try {
        editor.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            composed: true,
            inputType: "deleteContentBackward",
          }),
        )
      } catch {
        // Unsupported beforeinput construction continues to execCommand.
      }

      try {
        editor.ownerDocument.execCommand("delete", false, undefined)
      } catch {
        // Unsupported execCommand attempt continues.
      }

      try {
        editor.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            composed: true,
            inputType: "deleteContentBackward",
          }),
        )
      } catch {
        // Unsupported input construction continues.
      }

      try {
        editor.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: "Backspace",
            code: "Backspace",
            keyCode: 8,
            which: 8,
            bubbles: true,
            composed: true,
          }),
        )
      } catch {
        // Unsupported keyup construction continues.
      }

      if (editor.textContent && editor.textContent.length > 0) {
        try {
          editor.textContent = ""
        } catch {
          // ignore
        }
      }

      editor.dispatchEvent(new Event("input", { bubbles: true, composed: true }))
      editor.dispatchEvent(new Event("change", { bubbles: true }))

      return this.waitForEditorUpdate(editor, "", requireSubmitButton)
    }

    // 按编辑器框架管线排序尝试插入（见 getEditorEventPipeline），每种方式之后经
    // 内容校验再决定是否尝试下一种，避免 execCommand 在模型驱动编辑器上留下
    // 模型无法感知的 DOM 污染、进而打乱后续方式的选区映射。
    const originalText = getEditorText(editor)
    const attempts = (getEditorEventPipeline(editor) ?? PLAIN_EDITOR_PIPELINE).insert
    let attempted = false

    for (const attempt of attempts) {
      // 上次尝试写入了未通过校验的内容时必须先清场（模型编辑器走模型级清空），
      // 否则残留会与新内容叠加出错乱结果。
      if (attempted) {
        if (normalizeEditorText(getEditorText(editor)) !== normalizeEditorText(originalText)) {
          const cleared = await this.replaceContentEditableContent(editor, "", false)
          if (!cleared) return false
        }
      }

      if (!this.selectAllEditorContent(editor)) return false
      attempted = true

      try {
        if (attempt === "execCommand") {
          editor.ownerDocument.execCommand("insertText", false, content)
        } else {
          // 合成 beforeinput/paste 没有 getTargetRanges，模型编辑器只能按内部选区
          // 处理，先让出事件循环等选区同步完成。
          await new Promise((resolve) => setTimeout(resolve, EDITOR_SELECTION_SYNC_MS))
          if (attempt === "beforeinput") {
            editor.dispatchEvent(
              new InputEvent("beforeinput", {
                bubbles: true,
                cancelable: true,
                composed: true,
                data: content,
                inputType: "insertText",
              }),
            )
          } else {
            const dataTransfer = new DataTransfer()
            dataTransfer.setData("text/plain", content)
            editor.dispatchEvent(
              new ClipboardEvent("paste", {
                clipboardData: dataTransfer,
                bubbles: true,
                cancelable: true,
                composed: true,
              }),
            )
          }
        }
      } catch {
        // Unsupported event construction; validation below reports failure.
      }

      if (await this.waitForEditorUpdate(editor, content, requireSubmitButton)) return true
    }

    return false
  }

  async insertPrompt(content: string): Promise<boolean> {
    const configuredEditor = this.getConfiguredEditor()
    if (!configuredEditor) return false
    const requireSubmitButton = (this.manifest.selectors.submitButton?.length ?? 0) > 0

    if (configuredEditor.mode === "contenteditable") {
      return this.replaceContentEditableContent(
        configuredEditor.editor,
        content,
        requireSubmitButton,
      )
    }

    if (!this.setTextControlValue(configuredEditor.editor, content)) return false
    return this.isEditorUpdateValid(configuredEditor.editor, content, requireSubmitButton)
  }

  clearTextarea(): void {
    const configuredEditor = this.getConfiguredEditor()
    if (!configuredEditor) return

    if (configuredEditor.mode === "contenteditable") {
      void this.replaceContentEditableContent(configuredEditor.editor, "", false)
      return
    }

    if (!this.setTextControlValue(configuredEditor.editor, "")) return
    if (!this.isEditorUpdateValid(configuredEditor.editor, "", false)) return
  }

  private isInsideOutlineExclude(element: Element): boolean {
    const excludeSelectors = this.manifest.selectors.outlineExclude
    if (!excludeSelectors || excludeSelectors.length === 0) return false
    return excludeSelectors.some((selector) => element.closest(selector) !== null)
  }

  private getOutlineCandidates(
    maxLevel: number,
  ): { container: HTMLElement; candidates: OutlineCandidate[] } | null {
    const responseContainerSelector = this.manifest.selectors.responseContainer
    if (!responseContainerSelector) return null

    const container = this.findElementBySelectors([responseContainerSelector])
    if (!container) return null

    const normalizedMaxLevel = Math.min(Math.max(Math.floor(maxLevel), 1), 6)
    const selectors = Array.from({ length: normalizedMaxLevel }, (_, index) => `h${index + 1}`)
    const userQuerySelector = this.manifest.selectors.userQuery
    if (userQuerySelector) selectors.push(userQuerySelector)

    let candidates = Array.from(container.querySelectorAll(selectors.join(", ")))
      .filter((element) => !isInsideOphelContainer(element, container))
      .filter((element) => !this.isInsideOutlineExclude(element))
      .map((element): OutlineCandidate | null => {
        const isUserQuery = userQuerySelector ? element.matches(userQuerySelector) : false
        if (isUserQuery) {
          return {
            element,
            level: 0,
            text: this.extractUserQueryText(element),
            isUserQuery: true,
          }
        }

        const level = Number.parseInt(element.tagName.slice(1), 10)
        const text = element.textContent?.trim() || ""
        if (Number.isNaN(level) || !text) return null

        return { element, level, text, isUserQuery: false }
      })
      .filter((candidate): candidate is OutlineCandidate => candidate !== null)
      .sort((left, right) => compareDomOrder(left.element, right.element))

    // Sites whose message list uses flex-col-reverse render newest messages
    // first in the DOM. Reverse message-level group order (each group = one
    // chatContent element) so the outline follows visual order, while
    // preserving intra-message heading order.
    if (this.manifest.outlineReverse) {
      const chatContentSelectors = this.manifest.selectors.chatContent ?? []
      if (chatContentSelectors.length > 0) {
        const groupKey = (el: Element): Element | null => {
          for (const selector of chatContentSelectors) {
            const ancestor = el.closest(selector)
            if (ancestor) return ancestor
          }
          return null
        }
        const groups: OutlineCandidate[][] = []
        let currentKey: Element | null | undefined
        let currentGroup: OutlineCandidate[] = []
        for (const candidate of candidates) {
          const key = groupKey(candidate.element)
          if (key !== currentKey) {
            if (currentGroup.length > 0) groups.push(currentGroup)
            currentGroup = [candidate]
            currentKey = key
          } else {
            currentGroup.push(candidate)
          }
        }
        if (currentGroup.length > 0) groups.push(currentGroup)
        // Reverse message groups; ungrouped candidates (key='') keep position
        // relative to each other but move with their adjacent group.
        groups.reverse()
        candidates = groups.flat()
      } else {
        candidates.reverse()
      }
    }

    return { container, candidates }
  }

  private getNextOutlineBoundary(
    candidates: OutlineCandidate[],
    currentIndex: number,
  ): Element | null {
    const current = candidates[currentIndex]

    for (let index = currentIndex + 1; index < candidates.length; index += 1) {
      const candidate = candidates[index]
      if (candidate.isUserQuery) return candidate.element
      if (!current.isUserQuery && candidate.level <= current.level) return candidate.element
    }

    return null
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const context = this.getOutlineCandidates(maxLevel)
    if (!context) return []

    const { candidates, container } = context
    const outline: OutlineItem[] = []

    candidates.forEach((candidate, index) => {
      if (candidate.isUserQuery && (!includeUserQueries || !candidate.text)) return

      const item: OutlineItem = {
        level: candidate.level,
        text: candidate.text,
        element: candidate.element,
        ...(candidate.isUserQuery ? { isUserQuery: true } : {}),
      }

      if (showWordCount) {
        item.wordCount = this.calculateRangeWordCount(
          candidate.element,
          this.getNextOutlineBoundary(candidates, index),
          container,
        )
      }

      outline.push(item)
    })

    return outline
  }

  getOutlineSources(): OutlineSource[] {
    const sources: OutlineSource[] = [
      {
        id: "conversation",
        kind: "conversation",
        label: t("outlineSourceConversation"),
        available: true,
      },
    ]

    if (this.hasDocumentOutlineCapability()) {
      const documentOutline = this.extractDocumentOutline(6, false)
      if (documentOutline.length > 0) {
        sources.push({
          id: "document",
          kind: "document",
          label: this.getDocumentOutlineLabel(),
          available: true,
          count: documentOutline.length,
        })
      }
    }

    return sources
  }

  supportsDynamicOutlineSources(): boolean {
    return this.hasDocumentOutlineCapability()
  }

  extractOutlineForSource(
    sourceId: string,
    maxLevel = 6,
    includeUserQueries = false,
    showWordCount = false,
  ): OutlineItem[] {
    if (sourceId === "document" && this.hasDocumentOutlineCapability()) {
      return this.extractDocumentOutline(maxLevel, showWordCount)
    }

    return this.extractOutline(maxLevel, includeUserQueries, showWordCount)
  }

  getOutlineScrollContainer(sourceId = "conversation"): HTMLElement | null {
    if (sourceId === "document" && this.hasDocumentOutlineCapability()) {
      const scrollContainerSelector = this.manifest.documentOutline?.scrollContainer
      if (scrollContainerSelector) {
        const container = this.findElementBySelectors([scrollContainerSelector])
        if (container instanceof HTMLElement) return container
      }
      const root = this.getDocumentOutlineContainer()
      return findScrollableAncestor(root) || (root instanceof HTMLElement ? root : null)
    }

    return this.getScrollContainer()
  }

  async resolveOutlineTarget(
    item: Pick<OutlineItem, "level" | "text" | "isUserQuery" | "id" | "navigationId">,
    queryIndex?: number,
    sourceId = "conversation",
  ): Promise<Element | null> {
    if (sourceId === "document" && this.hasDocumentOutlineCapability()) {
      const root = this.getDocumentOutlineContainer()
      if (!root) return null
      return findHeadingByText(root, item.level, item.text, (heading) =>
        this.isInsideDocumentOutlineExclude(heading),
      )
    }

    return super.resolveOutlineTarget(item, queryIndex, sourceId)
  }

  scrollToOutlineSourceTarget(element: HTMLElement, sourceId = "conversation"): void {
    if (sourceId === "document" && this.hasDocumentOutlineCapability()) {
      const container = findScrollableAncestor(element) || this.getOutlineScrollContainer(sourceId)
      if (scrollElementInContainer(element, container)) {
        return
      }
    }

    this.scrollToOutlineTarget(element)
  }

  private hasDocumentOutlineCapability(): boolean {
    return (
      this.manifest.capabilities.includes("document-outline") &&
      Boolean(this.manifest.documentOutline?.container)
    )
  }

  private getDocumentOutlineContainer(): Element | null {
    const selector = this.manifest.documentOutline?.container
    if (!selector) return null
    return this.findElementBySelectors([selector])
  }

  private getDocumentOutlineLabel(): string {
    const config = this.manifest.documentOutline
    if (!config) return t("outlineSourceDocument")
    if (config.labelI18n) {
      const lang = getCurrentLang()
      const localized = config.labelI18n[lang]
      if (localized) return localized
    }
    return config.label || t("outlineSourceDocument")
  }

  private isInsideDocumentOutlineExclude(element: Element): boolean {
    const excludeSelectors = this.manifest.documentOutline?.exclude
    if (!excludeSelectors || excludeSelectors.length === 0) return false
    return excludeSelectors.some((selector) => element.closest(selector) !== null)
  }

  private extractDocumentOutline(maxLevel = 6, showWordCount = false): OutlineItem[] {
    const root = this.getDocumentOutlineContainer()
    if (!root) return []

    return extractHeadingOutline(root, {
      maxLevel,
      showWordCount,
      idPrefix: "declarative-document",
      shouldSkipHeading: (heading) => this.isInsideDocumentOutlineExclude(heading),
      calculateWordCount: (heading, nextBoundary, outlineRoot) => {
        return this.calculateRangeWordCount(heading, nextBoundary, outlineRoot)
      },
    })
  }

  getConversationTitle(): string | null {
    const { conversation } = this.manifest
    const activeMatch = conversation?.activeMatch
    if (activeMatch) {
      const activeItem = this.getConversationItems().find((item) => item.matches(activeMatch))
      if (activeItem) {
        const title = normalizeElementText(this.getConversationTitleElement(activeItem))
        if (title) return title
      }
    }

    const titleSelector = this.manifest.conversationTitleSelector
    if (titleSelector) {
      for (const element of document.querySelectorAll(titleSelector)) {
        const title = normalizeElementText(element)
        if (title) return title
      }
    }

    return this.getDocumentConversationTitle()
  }

  private getConversationItems(): Element[] {
    const { conversation } = this.manifest
    if (!conversation) return []

    return conversation.shadow
      ? this.findAllElementsBySelector(conversation.itemSelector)
      : Array.from(document.querySelectorAll(conversation.itemSelector))
  }

  private getConversationId(item: Element): string | null {
    const { conversation } = this.manifest
    if (!conversation || !this.conversationIdPattern) return null

    const source = item.getAttribute(conversation.idFrom.attr ?? "href")
    if (!source) return null

    const id = this.conversationIdPattern.exec(source)?.[1]?.trim()
    return id || null
  }

  private getConversationTitleElement(item: Element): Element | null {
    const titleSelector = this.manifest.conversation?.titleSelector
    if (!titleSelector) return item
    return item.matches(titleSelector) ? item : item.querySelector(titleSelector)
  }

  private buildConversationUrl(id: string): string | null {
    const { conversation } = this.manifest
    if (!conversation) return null

    const path = conversation.urlTemplate.split("{id}").join(encodeURIComponent(id))
    try {
      const url = new URL(path, window.location.origin)
      return url.origin === window.location.origin ? url.href : null
    } catch {
      return null
    }
  }

  private extractConversationInfo(item: Element): ConversationInfo | null {
    const { conversation } = this.manifest
    if (!conversation) return null

    const id = this.getConversationId(item)
    if (!id) return null

    const url = this.buildConversationUrl(id)
    if (!url) return null

    return {
      id,
      title: normalizeElementText(this.getConversationTitleElement(item)) ?? "",
      url,
      ...(conversation.activeMatch ? { isActive: item.matches(conversation.activeMatch) } : {}),
    }
  }

  getConversationList(): ConversationInfo[] {
    const conversations = new Map<string, ConversationInfo>()

    for (const item of this.getConversationItems()) {
      const info = this.extractConversationInfo(item)
      if (info && !conversations.has(info.id)) {
        conversations.set(info.id, info)
      }
    }

    return Array.from(conversations.values())
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    const { conversation } = this.manifest
    if (!conversation) return null

    return {
      selector: conversation.itemSelector,
      shadow: conversation.shadow ?? false,
      extractInfo: (item) => this.extractConversationInfo(item),
      getTitleElement: (item) => this.getConversationTitleElement(item),
    }
  }

  navigateToConversation(id: string, _url?: string): boolean {
    const { conversation } = this.manifest
    const normalizedId = id.trim()
    if (!conversation || !normalizedId) return false

    if ((conversation.navigationStrategy ?? "click-item") === "click-item") {
      const item = this.getConversationItems().find(
        (candidate) => this.getConversationId(candidate) === normalizedId,
      )
      if (item instanceof HTMLElement) {
        this.simulateClick(item)
        return true
      }
    }

    const targetUrl = this.buildConversationUrl(normalizedId)
    return targetUrl ? super.navigateToConversation(normalizedId, targetUrl) : false
  }

  isGenerating(): boolean {
    return (
      super.isGenerating() ||
      (this.manifest.generating?.existsSelectors ?? []).some((selector) =>
        this.findAllElementsBySelector(selector).some((element) =>
          this.isConfiguredElementVisible(element),
        ),
      )
    )
  }

  getSessionId(): string {
    if (!this.sessionIdPattern) return super.getSessionId()

    return this.sessionIdPattern.exec(window.location.pathname)?.[1]?.trim() ?? ""
  }

  isNewConversation(): boolean {
    if (!this.newConversationPathPatterns) return super.isNewConversation()

    return this.newConversationPathPatterns.some((pattern) =>
      pattern.test(window.location.pathname),
    )
  }

  isSharePage(): boolean {
    const sharePathPrefix = this.manifest.session?.sharePathPrefix
    return sharePathPrefix === undefined
      ? super.isSharePage()
      : window.location.pathname.startsWith(sharePathPrefix)
  }

  getNewTabUrl(): string {
    const newTabPath = this.manifest.session?.newTabPath
    if (newTabPath === undefined) return super.getNewTabUrl()

    const url = new URL(newTabPath, window.location.origin)
    if (url.origin !== window.location.origin) {
      throw new Error("Declarative SitePack newTabPath must remain on the current origin")
    }

    return url.href
  }

  getSubmitButtonSelectors(): string[] {
    return [...(this.manifest.selectors.submitButton ?? [])]
  }

  scrollToOutlineTarget(element: HTMLElement): void {
    super.scrollToOutlineTarget(element)
    if (this.manifest.scrollPinRelease) this.signalUserScrollIntent(element)
  }

  private outlineJumpSeq = 0
  private emittingPinReleaseWheel = false

  /**
   * 部分站点（如 LongCat）靠 wheel/touchmove 判断用户已接管滚动，判定前
   * 内容区的 MutationObserver 会反复把容器拉回底部，撤销大纲的程序化跳转。
   * 跳转后补发零增量 wheel 让站点停止自动吸底；若期间被拉回则重试跳转。
   * 仅对 manifest 声明 scrollPinRelease 的站点启用，避免影响其他适配包站点。
   */
  private signalUserScrollIntent(element: HTMLElement): void {
    const container = this.getScrollContainer()
    if (!container) return

    // 序号守卫：仅最后一次大纲跳转的重试生效，避免连点不同标题时旧重试把视图拽回。
    const seq = ++this.outlineJumpSeq
    const isCurrentJump = () => seq === this.outlineJumpSeq

    // 重试窗口内的真实用户滚动（排除补发的合成 wheel）视为用户已接管，放弃后续重试。
    const cancelOnUserScroll = () => {
      if (this.emittingPinReleaseWheel) return
      if (isCurrentJump()) this.outlineJumpSeq += 1
    }
    container.addEventListener("wheel", cancelOnUserScroll, { passive: true })
    container.addEventListener("touchmove", cancelOnUserScroll, { passive: true })
    setTimeout(() => {
      container.removeEventListener("wheel", cancelOnUserScroll)
      container.removeEventListener("touchmove", cancelOnUserScroll)
    }, 480)

    const attempt = () => {
      if (!isCurrentJump() || !element.isConnected) return
      super.scrollToOutlineTarget(element)
      requestAnimationFrame(() => {
        if (!isCurrentJump()) return
        this.emittingPinReleaseWheel = true
        try {
          container.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true }))
        } finally {
          this.emittingPinReleaseWheel = false
        }
      })
    }

    attempt()
    setTimeout(attempt, 120)
    setTimeout(attempt, 320)
  }

  getNewChatButtonSelectors(): string[] {
    return [...(this.manifest.selectors.newChatButton ?? [])]
  }

  getStopButtonSelectors(): string[] {
    return [...(this.manifest.selectors.stopButton ?? [])]
  }

  getResponseContainerSelector(): string {
    return this.manifest.selectors.responseContainer ?? ""
  }

  getChatContentSelectors(): string[] {
    return [...(this.manifest.selectors.chatContent ?? [])]
  }

  getUserQuerySelector(): string | null {
    return this.manifest.selectors.userQuery ?? null
  }

  getScrollContainer(): HTMLElement | null {
    const selectors = this.manifest.selectors.scrollContainer ?? []
    // 优先返回第一个实际可滚动的匹配；都不可滚动时退回首个匹配，
    // 保持与原先“取第一个命中”行为兼容。
    let firstMatch: HTMLElement | null = null
    for (const selector of selectors) {
      const el = this.findElementBySelectors([selector])
      if (!el) continue
      if (el.scrollHeight > el.clientHeight) return el
      firstMatch ??= el
    }
    return firstMatch
  }

  getSidebarScrollContainer(): Element | null {
    const selector = this.manifest.selectors.sidebarScrollContainer
    return selector ? this.findElementBySelectors([selector]) : null
  }

  getExportConfig(): ExportConfig | null {
    return this.manifest.export ? { ...this.manifest.export } : null
  }

  isExportReversed(): boolean {
    // DeclarativeAdapter 不经 base.config，从 manifest 读取同名字段。
    return this.manifest.outlineReverse ?? false
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig | null {
    return this.manifest.networkMonitor
      ? cloneNetworkMonitorConfig(this.manifest.networkMonitor)
      : null
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    const config = this.manifest.modelSwitcher
    if (!config) return null

    return {
      ...config,
      targetModelKeyword: keyword,
      selectorButtonSelectors: [...config.selectorButtonSelectors],
      subMenuTriggers: config.subMenuTriggers ? [...config.subMenuTriggers] : undefined,
    }
  }

  getWidthSelectors(): WidthSelectorConfig[] {
    return (this.manifest.widthSelectors ?? []).map((selector) => ({ ...selector }))
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig | null {
    return this.manifest.panelAvoidance ? structuredClone(this.manifest.panelAvoidance) : null
  }

  getZenModeConfig(): ZenModeConfig | null {
    return this.manifest.zenMode ? cloneZenModeConfig(this.manifest.zenMode) : null
  }

  getCleanModeConfig(): ZenModeConfig | null {
    return this.manifest.cleanMode ? cloneZenModeConfig(this.manifest.cleanMode) : null
  }

  getAutoHideInputConfig(): AutoHideInputConfig | null {
    const config = this.manifest.autoHideInput
    if (!config) return null
    // 顶层字段直接展开，新增标量配置项时无需同步此处；styles 需要逐条拷贝
    return {
      ...config,
      ...(config.styles ? { styles: config.styles.map((style) => ({ ...style })) } : {}),
    }
  }

  getSubmitKeyConfig(): { key: "Enter" | "Ctrl+Enter" } {
    return { key: this.manifest.input?.submitKey ?? "Enter" }
  }

  getQuickQuoteSupportMode(): QuickQuoteSupportMode {
    return this.manifest.quickQuote ?? "disabled"
  }

  getAssistantMermaidSupportMode(): AssistantMermaidSupportMode {
    return this.manifest.mermaidSupport ?? "native"
  }

  supportsHostThemeSync(): boolean {
    return this.manifest.supportsHostThemeSync ?? Boolean(this.manifest.themeSync)
  }

  /** 声明 themeSync 时，toggleTheme 支持 "system" 语义（含 cookie 删除）。 */
  acceptsSystemThemePreference(): boolean {
    return Boolean(this.manifest.themeSync)
  }

  /**
   * 按 themeSync 的写侧语义读回宿主页主题偏好。
   * 未声明 themeSync、值无法读取或无法被 values 识别时返回 null，
   * 由 ThemeManager 回退到通用 DOM 检测。
   */
  detectHostThemePreference(): "light" | "dark" | "system" | null {
    const config = this.manifest.themeSync
    if (!config) return null

    const stored = this.readThemeSyncValue(config)
    if (stored === null) {
      // cookie 模式下无记录 = 站点跟随系统（未声明独立 system 值时写侧即删除 cookie）
      return config.storageType === "cookie" && config.values.system === undefined ? "system" : null
    }
    if (config.values.system !== undefined && stored === config.values.system) return "system"
    if (stored === config.values.dark) return "dark"
    if (stored === config.values.light) return "light"
    return null
  }

  detectHostThemeMode(): "light" | "dark" | null {
    const preference = this.detectHostThemePreference()
    if (preference === null) return null
    if (preference !== "system") return preference
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }

  /**
   * 读取 themeSync 声明的宿主页主题原始值，与写入语义对应。
   * cookie 读取 document.cookie（无记录返回 null）；localStorage 处理扁平
   * raw/json 与 valuePath 嵌套。解析失败一律返回 null，不做静默兜底猜测。
   */
  private readThemeSyncValue(config: SitePackThemeSyncConfig): string | null {
    if (config.storageType === "cookie") {
      const prefix = `${config.storageKey}=`
      const entry = document.cookie.split("; ").find((part) => part.startsWith(prefix))
      if (!entry) return null
      try {
        return decodeURIComponent(entry.slice(prefix.length))
      } catch {
        return entry.slice(prefix.length)
      }
    }

    const raw = localStorage.getItem(config.storageKey)
    if (raw === null) return null

    if (config.valuePath) {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
        const value = getNestedThemeValue(parsed as Record<string, unknown>, config.valuePath)
        return typeof value === "string" ? value : null
      } catch {
        return null
      }
    }

    if (config.valueFormat === "json") {
      try {
        const parsed: unknown = JSON.parse(raw)
        return typeof parsed === "string" ? parsed : null
      } catch {
        return null
      }
    }

    return raw
  }

  /**
   * 基于 manifest.themeSync 的声明式宿主页主题切换。
   * 缺省为 localStorage + html class 机制；storageType 为 cookie 时写入/删除主题 Cookie，
   * 由站点自行监听应用。未声明 themeSync 时保持基类行为（返回 false）。
   */
  async toggleTheme(targetMode: "light" | "dark" | "system"): Promise<boolean> {
    const config = this.manifest.themeSync
    if (!config) return false

    try {
      if (config.storageType === "cookie") {
        const cookieValue =
          targetMode === "system" ? config.values.system : config.values[targetMode]
        if (cookieValue === undefined) {
          // system 未配置独立值 = 删除 Cookie，站点回退为跟随系统
          document.cookie = `${config.storageKey}=; path=/; max-age=0; SameSite=Lax`
        } else {
          document.cookie = `${config.storageKey}=${encodeURIComponent(cookieValue)}; path=/; max-age=31536000; SameSite=Lax`
        }
        return true
      }

      const resolvedMode: "light" | "dark" =
        targetMode === "system"
          ? window.matchMedia?.("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : targetMode

      // system 未配置独立值时退化为解析值，避免站点读到不认识的模式值
      const resolveStorageValue = (values: SitePackThemeSyncConfig["values"]): string =>
        targetMode === "system" ? values.system ?? values[resolvedMode] : values[targetMode]

      const previousValue = localStorage.getItem(config.storageKey)
      let nextValue: string
      if (config.valuePath) {
        // 嵌套存储：保留对象内其他偏好字段，读-改-写
        let stored: Record<string, unknown> = {}
        if (previousValue) {
          try {
            const parsed: unknown = JSON.parse(previousValue)
            if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
              stored = parsed as Record<string, unknown>
            }
          } catch {
            stored = {}
          }
        }
        // 先合并固定字段、再刷新时间戳，最后写主题值，保证主题值不被覆盖
        if (config.staticFields) {
          for (const [field, fieldValue] of Object.entries(config.staticFields)) {
            if (field === "__proto__" || field === "prototype" || field === "constructor") continue
            stored[field] = fieldValue
          }
        }
        if (config.timestampPath) {
          setNestedThemeValue(stored, config.timestampPath, Date.now())
        }
        setNestedThemeValue(stored, config.valuePath, resolveStorageValue(config.values))
        nextValue = JSON.stringify(stored)
      } else {
        const storageValue = resolveStorageValue(config.values)
        nextValue = config.valueFormat === "json" ? JSON.stringify(storageValue) : storageValue
      }
      localStorage.setItem(config.storageKey, nextValue)

      // 额外扁平键（如站点另存的布尔主题标记），逐个写入并记录待派发事件
      const writtenKeys: Array<{ key: string; oldValue: string | null; newValue: string }> = [
        { key: config.storageKey, oldValue: previousValue, newValue: nextValue },
      ]
      for (const extra of config.extraKeys ?? []) {
        const extraOldValue = localStorage.getItem(extra.storageKey)
        const extraValue = resolveStorageValue(extra.values)
        const extraNextValue =
          extra.valueFormat === "json" ? JSON.stringify(extraValue) : extraValue
        localStorage.setItem(extra.storageKey, extraNextValue)
        writtenKeys.push({
          key: extra.storageKey,
          oldValue: extraOldValue,
          newValue: extraNextValue,
        })
      }

      // 用 classList 精确替换，绝不像部分内置站点那样整体覆写 className
      // darkClass/lightClass 都缺省时不动 DOM 类，靠上面的 storage 事件让站点自行应用
      const html = document.documentElement
      if (resolvedMode === "dark") {
        if (config.lightClass) html.classList.remove(config.lightClass)
        if (config.darkClass) html.classList.add(config.darkClass)
      } else {
        if (config.darkClass) html.classList.remove(config.darkClass)
        if (config.lightClass) html.classList.add(config.lightClass)
      }
      html.style.colorScheme = resolvedMode
      this.applyThemeSyncDomTargets(config.domSync, resolvedMode)

      // 手动派发的 storage 事件同标签页监听者也能收到，next-themes 类实现靠它同步状态
      for (const written of writtenKeys) {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: written.key,
            oldValue: written.oldValue,
            newValue: written.newValue,
            storageArea: localStorage,
          }),
        )
      }

      return true
    } catch (error) {
      console.error(`[SitePackAdapter:${this.manifest.id}] toggleTheme error:`, error)
      return false
    }
  }

  /**
   * 按解析模式应用 themeSync.domSync 声明的 DOM 主题标记：
   * 类名模板添加当前模式解析值、移除相反模式解析值；
   * data-* 属性写入字符串（{mode} 占位解析）或按模式映射的值。
   */
  private applyThemeSyncDomTargets(
    targets: SitePackThemeSyncDomTarget[] | undefined,
    mode: "light" | "dark",
  ): void {
    if (!targets || targets.length === 0) return
    const oppositeMode = mode === "dark" ? "light" : "dark"

    for (const target of targets) {
      const elements = document.querySelectorAll(target.selector)
      for (const element of Array.from(elements)) {
        for (const template of target.classes ?? []) {
          const modeClass = template.replaceAll("{mode}", mode)
          const oppositeClass = template.replaceAll("{mode}", oppositeMode)
          if (oppositeClass && oppositeClass !== modeClass) {
            element.classList.remove(oppositeClass)
          }
          if (modeClass) {
            element.classList.add(modeClass)
          }
        }
        for (const [name, value] of Object.entries(target.attributes ?? {})) {
          const resolved =
            typeof value === "string" ? value.replaceAll("{mode}", mode) : value[mode]
          element.setAttribute(name, resolved)
        }
      }
    }
  }
}
