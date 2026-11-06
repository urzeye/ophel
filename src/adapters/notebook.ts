import { SITE_IDS } from "~constants/defaults"
import { scrollElementInContainer } from "~core/outline/dom-outline"
import { notebookNativeThemeCss } from "~styles/native-theme-adapters/notebook"
import { t } from "~utils/i18n"
import { hashTextForCache } from "~utils/text-hash"

import {
  SiteAdapter,
  type OutlineItem,
  type OutlineNavigationContext,
  type OutlineSource,
  type PanelAvoidanceConfig,
} from "./base"
import type { BuiltinSiteConfig } from "./declarative"
import {
  NOTEBOOK_CONFIG,
  NOTEBOOK_CONFIG_VERSION,
  type NotebookSiteConfig,
} from "./notebook-config"

const normalizeText = (element: Element): string =>
  (element.textContent ?? "").replace(/\s+/g, " ").trim()

export class NotebookAdapter extends SiteAdapter {
  protected config: NotebookSiteConfig = NOTEBOOK_CONFIG
  private rootIds = new WeakMap<Element, number>()
  private nextRootId = 0

  match(): boolean {
    return location.hostname === "notebook.google.com"
  }

  getSiteId(): string {
    return SITE_IDS.NOTEBOOK
  }

  getName(): string {
    return "Gemini Notebook"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { ...this.config.theme! }
  }

  getBuiltinConfig(): NotebookSiteConfig {
    return NOTEBOOK_CONFIG
  }

  getBuiltinConfigVersion(): number {
    return NOTEBOOK_CONFIG_VERSION
  }

  applyMergedConfig(config: BuiltinSiteConfig): void {
    this.config = config as NotebookSiteConfig
  }

  getSessionId(): string {
    return location.pathname.match(/^\/notebook\/([^/]+)/)?.[1] ?? ""
  }

  getSessionName(): string | null {
    return document.querySelector<HTMLInputElement>("notebook input.title-input")?.value || null
  }

  getConversationTitle(): string | null {
    return this.getSessionName()
  }

  supportsPromptSubmit(): boolean {
    return false
  }

  isNewConversation(): boolean {
    return !this.getSessionId()
  }

  supportsTabRename(): boolean {
    return false
  }

  getTextareaSelectors(): string[] {
    return [...(this.config.selectors.textarea ?? [])]
  }

  insertPrompt(content: string): boolean {
    const editor = this.getTextareaElement()
    if (!(editor instanceof HTMLTextAreaElement) || editor.disabled || editor.readOnly) return false

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
    if (!setter) return false
    editor.focus()
    setter.call(editor, content)
    editor.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: content }),
    )
    editor.setSelectionRange(content.length, content.length)
    return editor.value === content
  }

  getScrollContainer(): HTMLElement | null {
    return document.querySelector(this.config.selectors.scrollContainer![0])
  }

  getObserveTarget(): HTMLElement | null {
    return document.querySelector(this.config.sitePrivateSelectors.workspace)
  }

  getUserQuerySelector(): string {
    return this.config.selectors.userQuery!
  }

  getChatContentSelectors(): string[] {
    return [...(this.config.selectors.chatContent ?? [])]
  }

  private getOutlineRoot(sourceId: string): HTMLElement | null {
    if (sourceId === "conversation") return this.getScrollContainer()
    if (sourceId === "source")
      return document.querySelector(this.config.sitePrivateSelectors.sourceRoot)
    if (sourceId === "studio")
      return document.querySelector(this.config.sitePrivateSelectors.studioRoot)
    return null
  }

  getOutlineSources(): OutlineSource[] {
    return [
      { id: "source", kind: "document", label: t("outlineSourceSources"), available: true },
      {
        id: "conversation",
        kind: "conversation",
        label: t("outlineSourceConversation"),
        available: true,
      },
      { id: "studio", kind: "document", label: t("outlineSourceStudio"), available: true },
    ]
  }

  supportsDynamicOutlineSources(): boolean {
    return true
  }

  getOutlineContentId(sourceId: string): string {
    if (sourceId === "conversation") return sourceId
    const root = this.getOutlineRoot(sourceId)
    // 保存的 DOM 没有来源/作品 ID，使用正文指纹，避免重名文档共享书签。
    return root ? `${sourceId}:${hashTextForCache(normalizeText(root))}` : `${sourceId}:closed`
  }

  getOutlineSourcesSignature(): string {
    return this.getOutlineSources()
      .map(({ id }) => this.getOutlineNavigationContext(id).key)
      .join("|")
  }

  getOutlineNavigationContext(sourceId = "conversation"): OutlineNavigationContext {
    const root = this.getOutlineRoot(sourceId)
    if (root && !this.rootIds.has(root)) this.rootIds.set(root, ++this.nextRootId)
    return {
      key: `${this.getSiteInstanceKey()}:${this.getSessionId()}:${this.getOutlineContentId(sourceId)}:${root ? this.rootIds.get(root) : "closed"}`,
      container: root ? this.getOutlineScrollContainer(sourceId) : null,
    }
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    return this.extractOutlineForSource("conversation", maxLevel, includeUserQueries, showWordCount)
  }

  extractOutlineForSource(
    sourceId: string,
    maxLevel = 6,
    includeUserQueries = false,
    showWordCount = false,
  ): OutlineItem[] {
    const root = this.getOutlineRoot(sourceId)
    if (!root) return []
    const headings = this.config.sitePrivateSelectors.headings
    const candidates =
      sourceId === "conversation"
        ? root.querySelectorAll(
            `${this.getUserQuerySelector()}, ${this.config.selectors.assistantResponse} :is(${headings})`,
          )
        : root.querySelectorAll(headings)
    const items: OutlineItem[] = []
    for (const [index, element] of Array.from(candidates).entries()) {
      const isUserQuery =
        sourceId === "conversation" && element.matches(this.getUserQuerySelector())
      const level = isUserQuery
        ? 0
        : Number(element.getAttribute("aria-level") ?? element.tagName.slice(1))
      if (
        isUserQuery
          ? !includeUserQueries
          : !Number.isInteger(level) || level < 1 || level > Math.min(maxLevel, 6)
      )
        continue
      const text = normalizeText(element)
      if (!text) continue
      items.push({
        level,
        text,
        element,
        isUserQuery,
        id: `${sourceId}:${isUserQuery ? "query" : element.getAttribute("data-start-index") ?? "heading"}:${index}:${hashTextForCache(text)}`,
      })
    }
    if (showWordCount) {
      items.forEach((item, index) => {
        if (item.isUserQuery) {
          item.wordCount = item.text.length
          return
        }
        const scope =
          sourceId === "conversation"
            ? item.element!.closest(this.config.selectors.assistantResponse!) ?? root
            : root
        const next = items
          .slice(index + 1)
          .find(
            (candidate) =>
              !candidate.isUserQuery &&
              candidate.level <= item.level &&
              scope.contains(candidate.element),
          )
        item.wordCount = this.calculateRangeWordCount(item.element!, next?.element ?? null, scope)
      })
    }
    return items
  }

  getOutlineScrollContainer(sourceId = "conversation"): HTMLElement | null {
    if (sourceId === "conversation") return this.getScrollContainer()
    if (sourceId === "source")
      return document.querySelector(this.config.sitePrivateSelectors.sourceScroll)
    if (sourceId === "studio")
      return document.querySelector(this.config.sitePrivateSelectors.studioScroll)
    return null
  }

  async resolveOutlineTarget(
    item: Pick<OutlineItem, "level" | "text" | "isUserQuery" | "id">,
    queryIndex?: number,
    sourceId = "conversation",
  ): Promise<Element | null> {
    const items = this.extractOutlineForSource(sourceId, 6, true)
    const match = item.id ? items.find((candidate) => candidate.id === item.id) : null
    if (match?.element) return match.element
    if (item.isUserQuery && queryIndex !== undefined) {
      const query = items.filter((candidate) => candidate.isUserQuery)[queryIndex - 1]
      if (query?.text === item.text) return query.element ?? null
    }
    return (
      items.find((candidate) => candidate.level === item.level && candidate.text === item.text)
        ?.element ?? null
    )
  }

  scrollToOutlineSourceTarget(element: HTMLElement, sourceId = "conversation"): void {
    scrollElementInContainer(element, this.getOutlineScrollContainer(sourceId))
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig | null {
    return this.config.panelAvoidance ?? null
  }

  supportsHostThemeSync(): boolean {
    return true
  }

  getNativeThemeCss(): string {
    return notebookNativeThemeCss
  }

  acceptsSystemThemePreference(): boolean {
    return true
  }

  detectHostThemePreference(): "light" | "dark" | "system" | null {
    const preference = localStorage.getItem("bcsp")
    return preference === "light" || preference === "dark" || preference === "system"
      ? preference
      : null
  }

  detectHostThemeMode(): "light" | "dark" | null {
    const preference = this.detectHostThemePreference()
    return preference === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference
  }

  async toggleTheme(preference: "light" | "dark" | "system"): Promise<boolean> {
    const oldValue = localStorage.getItem("bcsp")
    localStorage.setItem("bcsp", preference)
    const resolved =
      preference === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : preference
    // Notebook 的原生色板使用 light-dark()，color-scheme 同时驱动正文与弹层。
    document.documentElement.style.colorScheme = resolved
    document.body.style.colorScheme = resolved
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "bcsp",
        oldValue,
        newValue: preference,
        storageArea: localStorage,
      }),
    )
    return true
  }
}
