/**
 * 元宝适配器（yuanbao.tencent.com）
 *
 * 选择器策略：
 * - 优先使用稳定的语义类名和 data 属性（如 data-desc / dt-cid / data-item-id）
 * - 避免依赖 CSS Modules 哈希类名
 * - 输入框基于 Quill 的 `.ql-editor[contenteditable="true"]`
 */
import { SITE_IDS } from "~constants"
import { htmlToMarkdown } from "~utils/exporter"

import {
  SiteAdapter,
  type ConversationDeleteTarget,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportLifecycleContext,
  type ExportConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
  type SiteDeleteConversationResult,
  type ZenModeRule,
} from "./base"

const HOSTNAME = "yuanbao.tencent.com"
const CHAT_PATH_PATTERN = /^\/chat\/([^/?#]+)(?:\/([^/?#]+))?/
const THEME_STORAGE_KEY = "yb_web_theme_mode"
const USER_ID_STORAGE_KEY = "yb_user_id"

const TEXTAREA_SELECTOR =
  '.agent-dialogue__content--common__input .ql-editor[contenteditable="true"], #search-bar .ql-editor[contenteditable="true"], .ql-editor[contenteditable="true"]'
const SUBMIT_BUTTON_SELECTOR = "#yuanbao-send-btn, a.style__send-btn___RwTm5"
const NEW_CHAT_BUTTON_SELECTOR = '.yb-common-nav__trigger[data-desc="new-chat"]'
const STOP_BUTTON_SELECTOR = "a.style__send-btn___RwTm5"

const SIDEBAR_SCROLL_SELECTOR = ".yb-nav__content"
const CONVERSATION_ITEM_SELECTOR = ".yb-recent-conv-list__item"
const ACTIVE_CONVERSATION_SELECTOR = ".yb-recent-conv-list__item.active"
const CONVERSATION_TITLE_SELECTOR =
  ".yb-recent-conv-list__item-name[data-item-name], .yb-recent-conv-list__item-name, [data-item-id][data-item-name]"
const CONVERSATION_PINNED_SELECTOR =
  ".yb-recent-conv-list__item-name.isTop, .yb-recent-conv-list__chat-top .icon-yb-ic_pin_16"

const RESPONSE_SCROLL_SELECTOR =
  "#chat-content .agent-chat__list__content-wrapper, .agent-chat__list__content-wrapper"
const RESPONSE_CONTAINER_SELECTOR =
  "#chat-content .agent-chat__list__content, .agent-chat__list__content"
const USER_MESSAGE_SELECTOR = ".agent-chat__list__item--human"
const ASSISTANT_MESSAGE_SELECTOR = ".agent-chat__list__item--ai"
const USER_TEXT_SELECTOR =
  ".agent-chat__bubble--human .hyc-content-text, .agent-chat__bubble--human .agent-chat__bubble__content"
const ASSISTANT_MARKDOWN_SELECTOR =
  ".agent-chat__list__item--ai .hyc-common-markdown-style, .agent-chat__list__item--ai .hyc-content-md-done"
const ASSISTANT_TOOLBAR_SELECTOR =
  ".agent-chat__toolbar, .agent-chat__toolbar_new, .agent-chat__question-toolbar, .hyc-common-markdown__code__hd__r"
const ASSISTANT_DECORATION_SELECTOR =
  ".hyc-card-box-process-list, .hyc-common-markdown__replace-appCard"
const MODEL_BUTTON_SELECTOR = ".ybc-model-select-button"
const MODEL_TEXT_SELECTOR = ".ybc-model-select-button .t-button__text"
const MODEL_MENU_ITEM_SELECTOR =
  ".ybc-model-select-dropdown-popup .t-dropdown__item, .ybc-model-select-dropdown .t-dropdown__item, .t-popup .t-dropdown__item"
const DISCLAIMER_SELECTOR = ".agent-dialogue__content-copyright"
const FOLD_BUTTON_SELECTOR = '.yb-common-nav__trigger[data-desc="fold"]'
const THOUGHT_MARKDOWN_SELECTOR = [
  ".hyc-component-reasoner__think-content .hyc-common-markdown-style",
  ".hyc-component-deepsearch-cot__think__content__item .hyc-common-markdown-style",
  ".hyc-common-markdown-style-cot",
].join(", ")
const THOUGHT_CONTAINER_SELECTOR = [
  ".hyc-component-reasoner__think",
  ".hyc-component-deepsearch-cot__think",
  ".hyc-common-markdown-style-cot",
].join(", ")
const ASSISTANT_REASONER_BODY_SELECTORS = [
  ".hyc-component-reasoner__text .hyc-common-markdown-style",
  ".hyc-component-reasoner__text .hyc-content-md-done",
  ".hyc-component-reasoner__text",
]
const DROPDOWN_MENU_SELECTOR = [
  ".t-dropdown__menu",
  ".t-dropdown__submenu",
  ".t-dropdown",
  ".t-popup",
  ".t-popup__content",
  ".t-popup__content__inner",
  '[role="menu"]',
  '[role="listbox"]',
].join(", ")
const DROPDOWN_ITEM_SELECTOR = [
  ".t-dropdown__item",
  ".yb-dropdown__item",
  '[role="menuitem"]',
  '[role="option"]',
].join(", ")
const CONVERSATION_MENU_TRIGGER_SELECTOR = [
  '[aria-haspopup="menu"]',
  '[aria-haspopup="listbox"]',
  ".icon-yb-ic_ellipsis",
  ".icon-yb-ic_more_vert",
  ".icon-yb-ic_more_vert_16",
  ".icon-yb-ic_delete",
  ".icon-yb-ic_delete_16",
  ".icon-yb-ic_delete_20",
  ".icon-more",
  ".icon-del",
  ".icon-delete",
  ".icon-menu",
  "button",
  '[role="button"]',
].join(", ")
const DIALOG_SELECTOR = '.t-dialog, [role="dialog"]'
const DIALOG_BUTTON_SELECTOR =
  '.t-dialog button, .t-dialog [role="button"], [role="dialog"] button, [role="dialog"] [role="button"]'
const YUANBAO_WIDTH_MAX_VAR = "--hunyuan-chat-list-max-width"
const YUANBAO_WIDTH_VAR = "--hunyuan-chat-list-width"

const DELETE_TEXT_PATTERN = /删除|delete/i
const CONFIRM_TEXT_PATTERN = /删除|确认|确定|delete|confirm/i
const CANCEL_TEXT_PATTERN = /取消|cancel/i

const YUANBAO_DELETE_REASON = {
  UI_FAILED: "ui_failed",
  UI_EXCEPTION: "ui_exception",
  BATCH_ABORTED_AFTER_UI_FAILURE: "batch_aborted_after_ui_failure",
} as const

const MAX_OUTLINE_TEXT_LENGTH = 80

export class YuanbaoAdapter extends SiteAdapter {
  private exportIncludeThoughtsOverride: boolean | null = null

  match(): boolean {
    return window.location.hostname === HOSTNAME
  }

  getSiteId(): string {
    return SITE_IDS.YUANBAO
  }

  getName(): string {
    return "元宝"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#1677ff", secondary: "#0b5bd3" }
  }

  getTextareaSelectors(): string[] {
    return [TEXTAREA_SELECTOR]
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (!super.isValidTextarea(element)) return false
    return (
      element.getAttribute("contenteditable") === "true" &&
      !!element.closest(".agent-dialogue__content--common__input")
    )
  }

  insertPrompt(content: string): boolean {
    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return false

    editor.focus()

    try {
      document.execCommand("selectAll", false)
      if (!document.execCommand("insertText", false, content)) {
        throw new Error("execCommand returned false")
      }
      editor.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          data: content,
          inputType: "insertText",
        }),
      )
      return true
    } catch {
      editor.textContent = content
      editor.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          data: content,
          inputType: "insertText",
        }),
      )
      editor.dispatchEvent(new Event("change", { bubbles: true }))
      return true
    }
  }

  clearTextarea(): void {
    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return

    editor.focus()

    try {
      document.execCommand("selectAll", false)
      document.execCommand("delete", false)
    } catch {
      editor.textContent = ""
    }

    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: "",
        inputType: "deleteContentBackward",
      }),
    )
    editor.dispatchEvent(new Event("change", { bubbles: true }))
  }

  protected simulateClick(element: HTMLElement): void {
    const rect = element.getBoundingClientRect()
    const clientX = rect.left + Math.max(1, Math.min(rect.width / 2, Math.max(rect.width - 1, 1)))
    const clientY = rect.top + Math.max(1, Math.min(rect.height / 2, Math.max(rect.height - 1, 1)))
    const commonInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX,
      clientY,
    }

    const dispatchPointer = (type: string) => {
      if (typeof PointerEvent !== "function") return false
      return element.dispatchEvent(
        new PointerEvent(type, {
          ...commonInit,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        }),
      )
    }

    dispatchPointer("pointerenter")
    dispatchPointer("pointerover")
    dispatchPointer("pointermove")
    element.dispatchEvent(new MouseEvent("mouseenter", commonInit))
    element.dispatchEvent(new MouseEvent("mouseover", commonInit))
    element.dispatchEvent(new MouseEvent("mousemove", commonInit))
    dispatchPointer("pointerdown")
    element.dispatchEvent(new MouseEvent("mousedown", commonInit))
    dispatchPointer("pointerup")
    element.dispatchEvent(new MouseEvent("mouseup", commonInit))
    element.dispatchEvent(new MouseEvent("click", commonInit))
  }

  getSubmitButtonSelectors(): string[] {
    return [SUBMIT_BUTTON_SELECTOR]
  }

  findSubmitButton(): HTMLElement | null {
    const primary = document.querySelector("#yuanbao-send-btn") as HTMLElement | null
    if (this.isVisibleElement(primary) && !this.isDisabledActionButton(primary)) {
      return primary
    }

    const candidates = Array.from(document.querySelectorAll(SUBMIT_BUTTON_SELECTOR))
    for (const candidate of candidates) {
      const button = candidate as HTMLElement
      if (!this.isVisibleElement(button)) continue
      if (this.isDisabledActionButton(button) || this.isStopLikeButton(button)) continue
      return button
    }

    return null
  }

  getSessionId(): string {
    const match = window.location.pathname.match(CHAT_PATH_PATTERN)
    return match?.[2] || ""
  }

  isNewConversation(): boolean {
    const path = window.location.pathname.replace(/\/+$/, "")
    const match = path.match(CHAT_PATH_PATTERN)
    if (match) {
      return !match[2]
    }
    return path === "" || path === "/"
  }

  getNewTabUrl(): string {
    const agentId = this.getAgentId()
    return agentId ? `https://${HOSTNAME}/chat/${agentId}` : `https://${HOSTNAME}/`
  }

  getSessionName(): string | null {
    const conversationTitle = this.getConversationTitle()
    if (conversationTitle) return conversationTitle

    const title = document.title.trim()
    if (!title) return null

    const cleaned = title.replace(/\s*[-|]\s*(腾讯元宝|元宝)$/i, "").trim()
    if (!cleaned || /^(腾讯元宝|元宝)$/i.test(cleaned)) {
      return null
    }

    return cleaned
  }

  getCurrentCid(): string | null {
    const raw = localStorage.getItem(USER_ID_STORAGE_KEY)
    if (!raw) return null

    try {
      const parsed = JSON.parse(raw) as unknown
      if (typeof parsed === "string" && parsed.trim()) return parsed.trim()
      if (parsed && typeof parsed === "object") {
        for (const key of ["uid", "id", "cid", "userId"]) {
          const value = (parsed as Record<string, unknown>)[key]
          if (typeof value === "string" && value.trim()) return value.trim()
        }
      }
    } catch {
      // 回退到原始值
    }

    return raw.trim() || null
  }

  getConversationTitle(): string | null {
    const active = document.querySelector(ACTIVE_CONVERSATION_SELECTOR)
    return active ? this.extractConversationTitle(active) : null
  }

  getCurrentConversationInfo(): ConversationInfo | null {
    const current = super.getCurrentConversationInfo()
    if (!current) return null

    const active = document.querySelector(ACTIVE_CONVERSATION_SELECTOR)
    const activeInfo = active
      ? this.extractConversationInfo(active, this.getCurrentCid() || undefined)
      : null

    if (!activeInfo || activeInfo.id !== current.id) {
      return current
    }

    return {
      ...current,
      title: activeInfo.title || current.title,
      url: activeInfo.url || current.url,
      cid: activeInfo.cid ?? current.cid,
      isActive: activeInfo.isActive ?? current.isActive,
      isPinned: activeInfo.isPinned ?? current.isPinned,
    }
  }

  getConversationList(): ConversationInfo[] {
    const cid = this.getCurrentCid() || undefined
    const items = document.querySelectorAll(CONVERSATION_ITEM_SELECTOR)
    const map = new Map<string, ConversationInfo>()

    items.forEach((item) => {
      const info = this.extractConversationInfo(item, cid)
      if (info) {
        map.set(info.id, info)
      }
    })

    return Array.from(map.values())
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    return {
      selector: CONVERSATION_ITEM_SELECTOR,
      shadow: false,
      extractInfo: (el) => this.extractConversationInfo(el, this.getCurrentCid() || undefined),
      getTitleElement: (el) => el.querySelector(CONVERSATION_TITLE_SELECTOR) || el,
    }
  }

  getSidebarScrollContainer(): Element | null {
    return document.querySelector(SIDEBAR_SCROLL_SELECTOR)
  }

  async loadAllConversations(): Promise<void> {
    const container = this.getSidebarScrollContainer()
    if (!(container instanceof HTMLElement)) return

    let lastCount = 0
    let stableRounds = 0
    const maxStableRounds = 4

    while (stableRounds < maxStableRounds) {
      container.scrollTop = container.scrollHeight
      container.dispatchEvent(new Event("scroll", { bubbles: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 500))

      const currentCount = document.querySelectorAll(CONVERSATION_ITEM_SELECTOR).length
      if (currentCount === lastCount) {
        stableRounds += 1
      } else {
        lastCount = currentCount
        stableRounds = 0
      }
    }
  }

  navigateToConversation(id: string, url?: string): boolean {
    const beforeState = this.captureConversationNavigationState()
    const row = this.findConversationRowById(id)

    if (row) {
      const titleElement = row.querySelector(CONVERSATION_TITLE_SELECTOR) as HTMLElement | null
      const clickable =
        this.resolveClickableTarget(titleElement) ||
        (row.querySelector("a[href]") as HTMLElement | null) ||
        this.resolveClickableTarget(row) ||
        row
      this.simulateClick(clickable)
      window.setTimeout(() => {
        if (!this.hasConversationNavigationChanged(beforeState)) {
          super.navigateToConversation(id, url || this.buildConversationUrl(id))
        }
      }, 800)
      return true
    }

    return super.navigateToConversation(id, url || this.buildConversationUrl(id))
  }

  async deleteConversationOnSite(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    try {
      const success = await this.deleteConversationViaUi(target.id)
      return {
        id: target.id,
        success,
        method: success ? "ui" : "none",
        reason: success ? undefined : YUANBAO_DELETE_REASON.UI_FAILED,
      }
    } catch (error) {
      console.error(`[YuanbaoAdapter] deleteConversationOnSite error for "${target.id}":`, error)
      return {
        id: target.id,
        success: false,
        method: "none",
        reason: YUANBAO_DELETE_REASON.UI_EXCEPTION,
      }
    }
  }

  async deleteConversationsOnSite(
    targets: ConversationDeleteTarget[],
  ): Promise<SiteDeleteConversationResult[]> {
    const results: SiteDeleteConversationResult[] = []

    for (let index = 0; index < targets.length; index += 1) {
      const result = await this.deleteConversationOnSite(targets[index])
      results.push(result)

      if (!result.success && result.reason === YUANBAO_DELETE_REASON.UI_FAILED) {
        for (let rest = index + 1; rest < targets.length; rest += 1) {
          results.push({
            id: targets[rest].id,
            success: false,
            method: "none",
            reason: YUANBAO_DELETE_REASON.BATCH_ABORTED_AFTER_UI_FAILURE,
          })
        }
        break
      }
    }

    return results
  }

  getScrollContainer(): HTMLElement | null {
    const candidates = [
      document.querySelector(RESPONSE_SCROLL_SELECTOR),
      document.querySelector(RESPONSE_CONTAINER_SELECTOR),
      document.querySelector("#chat-content"),
    ]

    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement)) continue

      if (candidate.scrollHeight > candidate.clientHeight) {
        return candidate
      }

      const scrollable = this.findScrollableParent(candidate)
      if (scrollable) return scrollable
    }

    return super.getScrollContainer()
  }

  getResponseContainerSelector(): string {
    return RESPONSE_CONTAINER_SELECTOR
  }

  getChatContentSelectors(): string[] {
    return [USER_MESSAGE_SELECTOR, ASSISTANT_MESSAGE_SELECTOR]
  }

  getUserQuerySelector(): string | null {
    return USER_MESSAGE_SELECTOR
  }

  extractUserQueryText(element: Element): string {
    const contentRoot = this.findUserContentRoot(element)
    if (!contentRoot) return ""

    const clone = contentRoot.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(".gh-user-query-markdown, button, [role='button'], svg, input, label")
      .forEach((node) => node.remove())

    return this.extractTextWithLineBreaks(clone).trim()
  }

  extractUserQueryMarkdown(element: Element): string {
    return this.extractUserQueryText(element)
  }

  replaceUserQueryContent(element: Element, html: string): boolean {
    const contentRoot = this.findUserContentRoot(element)
    if (!contentRoot) return false
    if (element.querySelector(".gh-user-query-markdown")) return false

    const rendered = document.createElement("div")
    rendered.className =
      `${contentRoot instanceof HTMLElement ? contentRoot.className : ""} gh-user-query-markdown gh-markdown-preview`.trim()
    rendered.innerHTML = html

    if (contentRoot instanceof HTMLElement) {
      const inlineStyle = contentRoot.getAttribute("style")
      if (inlineStyle) rendered.setAttribute("style", inlineStyle)
      contentRoot.style.display = "none"
    }

    contentRoot.after(rendered)
    return true
  }

  extractAssistantResponseText(element: Element): string {
    const includeThoughts = this.shouldIncludeThoughtsInExport()
    const clone = element.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(`${ASSISTANT_DECORATION_SELECTOR}, ${ASSISTANT_TOOLBAR_SELECTOR}`)
      .forEach((node) => node.remove())
    clone.querySelectorAll("button, [role='button'], svg").forEach((node) => node.remove())

    const thoughtBlocks = includeThoughts ? this.extractThoughtBlockquotes(clone) : []
    clone.querySelectorAll(THOUGHT_CONTAINER_SELECTOR).forEach((node) => node.remove())

    const bodyRoot = this.findAssistantBodyRoot(clone) || clone
    const markdown = htmlToMarkdown(bodyRoot).trim()
    const normalizedBody = markdown || this.extractTextWithLineBreaks(bodyRoot).trim()

    if (includeThoughts && thoughtBlocks.length > 0) {
      const thoughtSection = thoughtBlocks.join("\n\n")
      return normalizedBody ? `${thoughtSection}\n\n${normalizedBody}` : thoughtSection
    }

    return normalizedBody
  }

  getLatestReplyText(): string | null {
    const replies = document.querySelectorAll(ASSISTANT_MESSAGE_SELECTOR)
    const last = replies[replies.length - 1]
    return last ? this.extractAssistantResponseText(last) : null
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const container =
      document.querySelector(RESPONSE_CONTAINER_SELECTOR) || this.getScrollContainer() || document
    const blocks = Array.from(
      container.querySelectorAll(`${USER_MESSAGE_SELECTOR}, ${ASSISTANT_MESSAGE_SELECTOR}`),
    ).filter((element) => !element.closest(".gh-root"))

    const items: OutlineItem[] = []

    blocks.forEach((block, blockIndex) => {
      if (block.matches(USER_MESSAGE_SELECTOR)) {
        if (!includeUserQueries) return

        const text = this.extractUserQueryText(block)
        if (!text) return

        let wordCount: number | undefined
        if (showWordCount) {
          const nextAssistant = blocks
            .slice(blockIndex + 1)
            .find((element) => element.matches(ASSISTANT_MESSAGE_SELECTOR))
          wordCount = nextAssistant ? this.extractAssistantPlainText(nextAssistant).length : 0
        }

        items.push({
          level: 0,
          text: this.truncateText(text, MAX_OUTLINE_TEXT_LENGTH),
          element: block,
          isUserQuery: true,
          isTruncated: text.length > MAX_OUTLINE_TEXT_LENGTH,
          wordCount,
        })
        return
      }

      const markdownRoot = this.findAssistantMarkdownRoot(block)
      if (!markdownRoot) return

      const headings = Array.from(markdownRoot.querySelectorAll("h1, h2, h3, h4, h5, h6")).filter(
        (heading) => !this.isInRenderedMarkdownContainer(heading),
      )

      headings.forEach((heading, headingIndex) => {
        const level = Number.parseInt(heading.tagName.slice(1), 10)
        if (Number.isNaN(level) || level > maxLevel) return

        const text = this.extractHeadingText(heading)
        if (!text) return

        let wordCount: number | undefined
        if (showWordCount) {
          let nextBoundary: Element | null = null
          for (let index = headingIndex + 1; index < headings.length; index += 1) {
            const candidate = headings[index]
            const candidateLevel = Number.parseInt(candidate.tagName.slice(1), 10)
            if (!Number.isNaN(candidateLevel) && candidateLevel <= level) {
              nextBoundary = candidate
              break
            }
          }
          wordCount = this.calculateRangeWordCount(heading, nextBoundary, markdownRoot)
        }

        items.push({
          level,
          text,
          element: heading,
          wordCount,
        })
      })
    })

    return items
  }

  getExportConfig(): ExportConfig | null {
    return {
      userQuerySelector: USER_MESSAGE_SELECTOR,
      assistantResponseSelector: ASSISTANT_MESSAGE_SELECTOR,
      turnSelector: null,
      useShadowDOM: false,
    }
  }

  async prepareConversationExport(context: ExportLifecycleContext): Promise<unknown> {
    this.exportIncludeThoughtsOverride = context.includeThoughts
    return null
  }

  async restoreConversationAfterExport(
    _context: ExportLifecycleContext,
    _state: unknown,
  ): Promise<void> {
    this.exportIncludeThoughtsOverride = null
  }

  isGenerating(): boolean {
    return this.findStopButton() !== null
  }

  getStopButtonSelectors(): string[] {
    return [STOP_BUTTON_SELECTOR]
  }

  stopGeneration(): boolean {
    const button = this.findStopButton()
    if (!button) return false

    this.simulateClick(button)
    return true
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig {
    return {
      urlPatterns: ["/api/chat/"],
      silenceThreshold: 2000,
    }
  }

  getWidthSelectors() {
    return [
      {
        selector: ":root",
        property: YUANBAO_WIDTH_MAX_VAR,
        noCenter: true,
      },
      {
        selector: ":root",
        property: YUANBAO_WIDTH_VAR,
        value: `min(100%, var(${YUANBAO_WIDTH_MAX_VAR}))`,
        noCenter: true,
      },
    ]
  }

  async toggleTheme(targetMode: "light" | "dark"): Promise<boolean> {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, targetMode)

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: THEME_STORAGE_KEY,
          newValue: targetMode,
          storageArea: localStorage,
        }),
      )

      document.documentElement.style.colorScheme = targetMode
      return true
    } catch (error) {
      console.error("[YuanbaoAdapter] toggleTheme error:", error)
      return false
    }
  }

  getModelName(): string | null {
    const textNode = document.querySelector(MODEL_TEXT_SELECTOR)
    const text = textNode?.textContent?.trim() || ""
    return text || null
  }

  getModelLockCheckText(selectorBtn?: HTMLElement | null): string {
    return this.getModelName() || super.getModelLockCheckText(selectorBtn)
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: [MODEL_BUTTON_SELECTOR, MODEL_TEXT_SELECTOR],
      menuItemSelector: MODEL_MENU_ITEM_SELECTOR,
      checkInterval: 1000,
      maxAttempts: 10,
      menuRenderDelay: 200,
    }
  }

  getNewChatButtonSelectors(): string[] {
    return [NEW_CHAT_BUTTON_SELECTOR]
  }

  getZenModeSelectors(): ZenModeRule[] {
    return [
      { selector: FOLD_BUTTON_SELECTOR, action: "click" },
      { selector: DISCLAIMER_SELECTOR, action: "hide" },
    ]
  }

  private getAgentId(): string | null {
    const pathMatch = window.location.pathname.match(CHAT_PATH_PATTERN)
    if (pathMatch?.[1]) return pathMatch[1]

    const attrValue =
      document
        .querySelector(`${CONVERSATION_ITEM_SELECTOR}[dt-agent-id]`)
        ?.getAttribute("dt-agent-id") ||
      document.querySelector("[dt-agent-id]")?.getAttribute("dt-agent-id")

    return attrValue?.trim() || null
  }

  private buildConversationUrl(sessionId: string): string {
    const agentId = this.getAgentId()
    return agentId ? `https://${HOSTNAME}/chat/${agentId}/${sessionId}` : `https://${HOSTNAME}/`
  }

  private extractConversationInfo(el: Element, cid?: string): ConversationInfo | null {
    const container =
      (el.closest(CONVERSATION_ITEM_SELECTOR) as HTMLElement | null) ||
      (el.matches(CONVERSATION_ITEM_SELECTOR) ? (el as HTMLElement) : null)
    if (!container) return null

    const id =
      container.getAttribute("dt-cid") ||
      container.querySelector("[data-item-id]")?.getAttribute("data-item-id") ||
      ""
    if (!id) return null

    const title = this.extractConversationTitle(container)
    const url = this.buildConversationUrl(id)

    return {
      id,
      title,
      url,
      cid,
      isActive: container.classList.contains("active"),
      isPinned: this.isPinnedConversation(container),
    }
  }

  private extractConversationTitle(element: Element): string {
    const titleElement = element.querySelector(CONVERSATION_TITLE_SELECTOR) as HTMLElement | null
    const attrTitle =
      titleElement?.getAttribute("data-item-name") || titleElement?.dataset?.itemName
    const text = attrTitle || titleElement?.textContent || ""
    return text.trim()
  }

  private isPinnedConversation(element: Element): boolean {
    return element.querySelector(CONVERSATION_PINNED_SELECTOR) !== null
  }

  private findScrollableParent(element: Element | null): HTMLElement | null {
    let current = element?.parentElement || null

    while (current) {
      const style = window.getComputedStyle(current)
      const isScrollable = /(auto|scroll)/i.test(style.overflowY)
      if (isScrollable && current.scrollHeight > current.clientHeight) {
        return current
      }
      current = current.parentElement
    }

    return null
  }

  private findUserContentRoot(element: Element): HTMLElement | null {
    return (
      (element.querySelector(USER_TEXT_SELECTOR) as HTMLElement | null) ||
      (element.querySelector(".agent-chat__bubble__content") as HTMLElement | null) ||
      (element as HTMLElement)
    )
  }

  private findAssistantContentRoot(element: Element): HTMLElement | null {
    const bodyRoot = this.findAssistantBodyRoot(element)
    if (bodyRoot) return bodyRoot

    const markdownRoot = this.findAssistantMarkdownRoot(element)
    if (markdownRoot) return markdownRoot as HTMLElement

    return (
      (element.querySelector(".agent-chat__speech-text") as HTMLElement | null) ||
      (element.querySelector(".agent-chat__bubble__content") as HTMLElement | null) ||
      (element as HTMLElement)
    )
  }

  private findAssistantMarkdownRoot(element: Element): Element | null {
    const reasonerBody = this.findFirstAssistantNodeOutsideThoughts(
      element,
      ASSISTANT_REASONER_BODY_SELECTORS.slice(0, 2),
    )
    if (reasonerBody) return reasonerBody

    if (element.matches(ASSISTANT_MARKDOWN_SELECTOR) && !this.isThoughtElement(element)) {
      return element
    }

    const markdownRoots = Array.from(element.querySelectorAll(ASSISTANT_MARKDOWN_SELECTOR))
    return markdownRoots.find((node) => !this.isThoughtElement(node)) || markdownRoots[0] || null
  }

  private extractAssistantPlainText(element: Element): string {
    const contentRoot = this.findAssistantContentRoot(element)
    if (!contentRoot) return ""

    const clone = contentRoot.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(`${ASSISTANT_DECORATION_SELECTOR}, ${ASSISTANT_TOOLBAR_SELECTOR}`)
      .forEach((node) => node.remove())
    clone.querySelectorAll("button, [role='button'], svg").forEach((node) => node.remove())
    return this.extractTextWithLineBreaks(clone).trim()
  }

  private extractHeadingText(heading: Element): string {
    const clone = heading.cloneNode(true) as HTMLElement
    clone.querySelectorAll("button, [role='button'], svg").forEach((node) => node.remove())
    return this.extractTextWithLineBreaks(clone).trim()
  }

  private findAssistantBodyRoot(element: Element): HTMLElement | null {
    const reasonerBody = this.findFirstAssistantNodeOutsideThoughts(
      element,
      ASSISTANT_REASONER_BODY_SELECTORS,
    )
    if (reasonerBody) return reasonerBody

    const markdownRoot = this.findAssistantMarkdownRoot(element)
    if (markdownRoot instanceof HTMLElement) return markdownRoot

    const speechText = element.querySelector(".agent-chat__speech-text") as HTMLElement | null
    if (speechText && !this.isThoughtElement(speechText)) {
      return speechText
    }

    const bubbleContent = element.querySelector(
      ".agent-chat__bubble__content",
    ) as HTMLElement | null
    if (bubbleContent && !this.isThoughtElement(bubbleContent)) {
      return bubbleContent
    }

    return element instanceof HTMLElement ? element : null
  }

  private shouldIncludeThoughtsInExport(): boolean {
    if (typeof this.exportIncludeThoughtsOverride === "boolean") {
      return this.exportIncludeThoughtsOverride
    }

    return false
  }

  private extractThoughtBlockquotes(element: Element): string[] {
    const nodes = Array.from(element.querySelectorAll(THOUGHT_MARKDOWN_SELECTOR)).filter(
      (node) => !node.parentElement?.closest(THOUGHT_MARKDOWN_SELECTOR),
    )
    const blocks: string[] = []

    for (const node of nodes) {
      const clone = node.cloneNode(true) as HTMLElement
      clone
        .querySelectorAll(
          `${ASSISTANT_TOOLBAR_SELECTOR}, button, [role='button'], svg, [aria-hidden='true']`,
        )
        .forEach((child) => child.remove())

      const markdown = (htmlToMarkdown(clone) || this.extractTextWithLineBreaks(clone)).trim()
      if (!markdown) continue

      blocks.push(this.formatAsThoughtBlockquote(markdown))
    }

    return blocks
  }

  private formatAsThoughtBlockquote(markdown: string): string {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n")
    const quotedLines = lines.map((line) => (line.trim().length > 0 ? `> ${line}` : ">"))
    return ["> [Thoughts]", ...quotedLines].join("\n")
  }

  private findFirstAssistantNodeOutsideThoughts(
    element: Element,
    selectors: string[],
  ): HTMLElement | null {
    for (const selector of selectors) {
      if (element.matches(selector) && !this.isThoughtElement(element)) {
        return element as HTMLElement
      }

      const match = Array.from(element.querySelectorAll(selector)).find(
        (node): node is HTMLElement => node instanceof HTMLElement && !this.isThoughtElement(node),
      )
      if (match) return match
    }

    return null
  }

  private isThoughtElement(element: Element): boolean {
    return element.closest(THOUGHT_CONTAINER_SELECTOR) !== null
  }

  private findConversationRowById(id: string): HTMLElement | null {
    const direct = document.querySelector(
      `${CONVERSATION_ITEM_SELECTOR}[dt-cid="${id}"]`,
    ) as HTMLElement | null
    if (direct) return direct

    const items = Array.from(document.querySelectorAll(CONVERSATION_ITEM_SELECTOR))
    for (const item of items) {
      const info = this.extractConversationInfo(item, this.getCurrentCid() || undefined)
      if (info?.id === id) {
        return item as HTMLElement
      }
    }

    return null
  }

  private async deleteConversationViaUi(id: string): Promise<boolean> {
    let row = this.findConversationRowById(id)
    if (!row) {
      await this.loadAllConversations()
      row = this.findConversationRowById(id)
    }
    if (!row) return false

    const beforeState = this.captureConversationNavigationState()

    row.scrollIntoView({ block: "center", behavior: "auto" })
    this.revealConversationActions(row)

    let trigger = this.findConversationMenuTrigger(row)
    if (!trigger) return false

    const action = await this.openConversationAction(row, trigger)
    if (!action) return false

    let dialog: HTMLElement | null = action.kind === "dialog" ? action.dialog : null
    if (action.kind === "menu") {
      const deleteItem = await this.waitForDeleteMenuItem(action.menu, 2000)
      if (!deleteItem) {
        document.body.click()
        return false
      }

      this.simulateClick(deleteItem)
      dialog = await this.waitForDialogOpen(1200)
    }

    if (dialog) {
      const confirmButton = await this.waitForDeleteConfirmButton(dialog, 2000)
      if (!confirmButton) return false
      this.simulateClick(confirmButton)
    }

    const deleted = await this.waitForConversationDeleteResult(id, beforeState, 4500)
    if (deleted) return true

    if (dialog) {
      await this.waitForDialogClosed(1200)
      return this.waitForConversationDeleteResult(id, beforeState, 800)
    }

    return false
  }

  private revealConversationActions(row: HTMLElement): void {
    const title = row.querySelector(CONVERSATION_TITLE_SELECTOR) as HTMLElement | null
    const targets = [row, title].filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    )

    for (const target of targets) {
      const rect = target.getBoundingClientRect()
      const clientX = rect.left + Math.max(1, Math.min(rect.width / 2, Math.max(rect.width - 1, 1)))
      const clientY =
        rect.top + Math.max(1, Math.min(rect.height / 2, Math.max(rect.height - 1, 1)))
      const commonInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX,
        clientY,
      }

      if (typeof PointerEvent === "function") {
        for (const type of ["pointerenter", "pointerover", "pointermove"]) {
          target.dispatchEvent(
            new PointerEvent(type, {
              ...commonInit,
              pointerId: 1,
              pointerType: "mouse",
              isPrimary: true,
            }),
          )
        }
      }

      for (const type of ["mouseenter", "mouseover", "mousemove"]) {
        target.dispatchEvent(new MouseEvent(type, commonInit))
      }
    }
  }

  private findConversationMenuTrigger(row: HTMLElement): HTMLElement | null {
    return this.getConversationActionCandidates(row)[0] || null
  }

  private getConversationActionCandidates(
    row: HTMLElement,
    preferredTrigger?: HTMLElement | null,
  ): HTMLElement[] {
    const candidates = Array.from(row.querySelectorAll(CONVERSATION_MENU_TRIGGER_SELECTOR))
    const scoredCandidates: Array<{ element: HTMLElement; score: number }> = []
    const seen = new Set<HTMLElement>()

    const pushCandidate = (candidate: HTMLElement | null, bonus = 0) => {
      if (!(candidate instanceof HTMLElement) || seen.has(candidate)) return
      seen.add(candidate)

      const score = this.getConversationActionScore(candidate)
      if (!Number.isFinite(score)) return

      scoredCandidates.push({ element: candidate, score: score + bonus })
    }

    pushCandidate(preferredTrigger, 25)

    for (const candidate of candidates) {
      pushCandidate(candidate as HTMLElement)
    }

    scoredCandidates.sort((left, right) => right.score - left.score)
    return scoredCandidates.map(({ element }) => element)
  }

  private getConversationActionScore(candidate: HTMLElement): number {
    if (candidate.closest(CONVERSATION_TITLE_SELECTOR)) return Number.NEGATIVE_INFINITY
    if (candidate.closest(".t-checkbox, [role='checkbox']")) return Number.NEGATIVE_INFINITY
    if (candidate.matches("input, label")) return Number.NEGATIVE_INFINITY

    const signal = this.getConversationActionSignal(candidate)
    const style = window.getComputedStyle(candidate)
    let score = 0

    if (candidate.matches('[aria-haspopup="menu"], [aria-haspopup="listbox"]')) score += 120
    if (/(ellipsis|more[_-]?vert|icon-more|icon-menu|menu)/i.test(signal)) score += 70
    if (/(delete|删除)/i.test(signal)) score += 45
    if (/(action|operate|dropdown|popup)/i.test(signal)) score += 15
    if (candidate.matches("button, [role='button']")) score += 10
    if (candidate.querySelector(".iconfont-yb, .yb-icon, svg")) score += 5
    if (style.pointerEvents !== "none") score += 5
    if (this.isVisibleElement(candidate)) score += 30

    return score
  }

  private async openConversationAction(
    row: HTMLElement,
    initialTrigger: HTMLElement,
  ): Promise<{ kind: "menu"; menu: HTMLElement } | { kind: "dialog"; dialog: HTMLElement } | null> {
    let trigger: HTMLElement | null = initialTrigger

    for (let attempt = 0; attempt < 4; attempt += 1) {
      document.body.click()
      await this.sleep(80)

      this.revealConversationActions(row)
      const candidates = this.getConversationActionCandidates(row, trigger)
      if (candidates.length === 0) return null

      trigger = candidates[0] || null
      for (const candidate of candidates) {
        if (!candidate.isConnected) continue

        this.simulateClick(candidate)
        const opened = await this.waitForConversationActionOpen(candidate, 1000)
        if (opened) return opened
      }
    }

    return null
  }

  private async waitForConversationActionOpen(
    trigger: HTMLElement,
    timeout: number,
  ): Promise<{ kind: "menu"; menu: HTMLElement } | { kind: "dialog"; dialog: HTMLElement } | null> {
    const start = Date.now()

    while (Date.now() - start < timeout) {
      const dialog = this.findVisibleDialog()
      if (dialog) {
        return { kind: "dialog", dialog }
      }

      const menu = this.findVisibleMenu(trigger)
      if (menu) {
        return { kind: "menu", menu }
      }

      await this.sleep(80)
    }

    return null
  }

  private findVisibleMenu(trigger?: HTMLElement | null): HTMLElement | null {
    const controlledId =
      trigger?.getAttribute("aria-controls") || trigger?.getAttribute("aria-owns")
    if (controlledId) {
      const controlled = document.getElementById(controlledId)
      if (
        controlled instanceof HTMLElement &&
        this.isVisibleElement(controlled) &&
        this.isDropdownMenuContainer(controlled)
      ) {
        return controlled
      }
    }

    const menus = Array.from(document.querySelectorAll(DROPDOWN_MENU_SELECTOR)).filter(
      (menu): menu is HTMLElement =>
        menu instanceof HTMLElement &&
        this.isVisibleElement(menu) &&
        this.isDropdownMenuContainer(menu),
    )
    if (menus.length > 0) {
      return menus[menus.length - 1]
    }

    return null
  }

  private isDropdownMenuContainer(element: HTMLElement): boolean {
    if (element.matches(DROPDOWN_ITEM_SELECTOR)) return true
    return !!element.querySelector(DROPDOWN_ITEM_SELECTOR)
  }

  private async waitForDeleteMenuItem(
    menu: HTMLElement,
    timeout: number,
  ): Promise<HTMLElement | null> {
    const start = Date.now()

    while (Date.now() - start < timeout) {
      const items = Array.from(menu.querySelectorAll(DROPDOWN_ITEM_SELECTOR)).filter(
        (item): item is HTMLElement => item instanceof HTMLElement && this.isVisibleElement(item),
      )

      const themedDelete =
        items.find((item) => item.className.includes("theme-error")) ||
        items.find((item) => DELETE_TEXT_PATTERN.test(this.getElementText(item)))
      if (themedDelete) {
        return themedDelete
      }

      await this.sleep(80)
    }

    return null
  }

  private async waitForDialogOpen(timeout: number): Promise<HTMLElement | null> {
    const start = Date.now()

    while (Date.now() - start < timeout) {
      const dialog = this.findVisibleDialog()
      if (dialog) return dialog

      await this.sleep(80)
    }

    return null
  }

  private findVisibleDialog(): HTMLElement | null {
    return (
      Array.from(document.querySelectorAll(DIALOG_SELECTOR)).find(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && this.isVisibleElement(element),
      ) || null
    )
  }

  private async waitForDeleteConfirmButton(
    dialog: HTMLElement,
    timeout: number,
  ): Promise<HTMLElement | null> {
    const start = Date.now()

    while (Date.now() - start < timeout) {
      const buttons = Array.from(dialog.querySelectorAll(DIALOG_BUTTON_SELECTOR)).filter(
        (button): button is HTMLElement =>
          button instanceof HTMLElement && this.isVisibleElement(button),
      )

      const matched =
        buttons.find((button) => {
          const text = this.getElementText(button)
          return CONFIRM_TEXT_PATTERN.test(text) && !CANCEL_TEXT_PATTERN.test(text)
        }) || buttons.find((button) => /primary|danger/i.test(button.className))

      if (matched) return matched

      await this.sleep(80)
    }

    return null
  }

  private async waitForDialogClosed(timeout: number): Promise<boolean> {
    const start = Date.now()

    while (Date.now() - start < timeout) {
      const dialog = Array.from(document.querySelectorAll(DIALOG_SELECTOR)).find(
        (element) => element instanceof HTMLElement && this.isVisibleElement(element),
      )
      if (!dialog) return true

      await this.sleep(80)
    }

    return false
  }

  private async waitForConversationDeleteResult(
    id: string,
    beforeState: { href: string; sessionId: string; isNewConversation: boolean },
    timeout: number,
  ): Promise<boolean> {
    const start = Date.now()
    const deletingCurrentConversation = beforeState.sessionId === id

    while (Date.now() - start < timeout) {
      if (!this.findConversationRowById(id)) {
        return true
      }

      if (deletingCurrentConversation && this.hasConversationNavigationChanged(beforeState)) {
        return true
      }

      await this.sleep(100)
    }

    return false
  }

  private getElementText(element: Element): string {
    return (element.textContent || (element as HTMLElement).innerText || "").trim()
  }

  private getConversationActionSignal(element: HTMLElement): string {
    return [
      element.className || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.getAttribute("data-desc") || "",
      element.getAttribute("data-testid") || "",
      element.getAttribute("data-test-id") || "",
      element.textContent || "",
    ]
      .join(" ")
      .toLowerCase()
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  private findStopButton(): HTMLElement | null {
    const candidates = Array.from(document.querySelectorAll(STOP_BUTTON_SELECTOR))
    for (const candidate of candidates) {
      const button = candidate as HTMLElement
      if (!this.isVisibleElement(button)) continue
      if (this.isStopLikeButton(button)) return button
    }
    return null
  }

  private isDisabledActionButton(button: HTMLElement | null): boolean {
    if (!(button instanceof HTMLElement)) return true
    const className = typeof button.className === "string" ? button.className : ""
    return (
      button.hasAttribute("disabled") ||
      button.getAttribute("aria-disabled") === "true" ||
      /disabled/i.test(className)
    )
  }

  private isStopLikeButton(button: HTMLElement | null): boolean {
    if (!(button instanceof HTMLElement)) return false
    if (button.querySelector("span.icon-send, .icon-send")) return false
    if (button.querySelector("rect")) return true

    const text = button.innerText?.trim() || button.textContent?.trim() || ""
    return /停止|stop/i.test(text)
  }

  private isVisibleElement(element: HTMLElement | null): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false
    if (!element.isConnected) return false

    const style = window.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  private truncateText(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  }
}
