/**
 * ChatGLM 适配器（chatglm.cn）
 *
 * 选择器策略：
 * - 优先使用语义化 class（如 .conversation-list、.conversation-item、.answer-content-wrap）
 * - 避免依赖 data-v-* 等构建时生成属性
 */
import { SITE_IDS } from "~constants"
import { htmlToMarkdown } from "~utils/exporter"

import {
  SiteAdapter,
  type ExportConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
  type ZenModeRule,
} from "./base"

const CHATGLM_HOSTS = new Set(["chatglm.cn"])
const SESSION_ID_PARAM = "cid"
const NEW_TAB_PATH = "/main/alltoolsdetail?lang=zh"
const MAX_OUTLINE_TEXT_LENGTH = 80

const RESPONSE_CONTAINER_SELECTOR = ".conversation-list"
const CONVERSATION_ITEM_SELECTOR = ".conversation-item"
const USER_QUERY_SELECTOR = ".conversation.question"
const USER_TEXT_SELECTOR = ".question-txt"
const ASSISTANT_MARKDOWN_SELECTOR = ".answer-content-wrap .markdown-body"

const TEXTAREA_SELECTORS = [
  "#search-input-box textarea",
  ".main-chat-search #search-input-box textarea",
  ".main-chat-search textarea",
]

const SUBMIT_BUTTON_SELECTOR = ".enter-icon-container"

export class ChatGLMAdapter extends SiteAdapter {
  match(): boolean {
    return CHATGLM_HOSTS.has(window.location.hostname)
  }

  getSiteId(): string {
    return SITE_IDS.CHATGLM
  }

  getName(): string {
    return "智谱清言"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#2454FF", secondary: "#1F46D6" }
  }

  getTextareaSelectors(): string[] {
    return TEXTAREA_SELECTORS
  }

  insertPrompt(content: string): boolean {
    const el = this.getTextareaElement() as HTMLTextAreaElement | null
    if (!el || !el.isConnected) return false

    el.focus()

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
    if (setter) {
      setter.call(el, content)
    } else {
      el.value = content
    }

    el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: content }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    el.setSelectionRange(content.length, content.length)
    return true
  }

  clearTextarea(): void {
    const el = this.getTextareaElement() as HTMLTextAreaElement | null
    if (!el || !el.isConnected) return

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
    if (setter) {
      setter.call(el, "")
    } else {
      el.value = ""
    }

    el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: "" }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    el.setSelectionRange(0, 0)
  }

  getSessionId(): string {
    const params = new URLSearchParams(window.location.search)
    const cid = params.get(SESSION_ID_PARAM)
    return cid ? cid.trim() : ""
  }

  isNewConversation(): boolean {
    return !this.getSessionId()
  }

  getNewTabUrl(): string {
    return new URL(NEW_TAB_PATH, window.location.origin).toString()
  }

  getSessionName(): string | null {
    const conversationTitle = this.getConversationTitle()
    if (conversationTitle) return conversationTitle

    const title = document.title.trim()
    if (!title) return null

    const normalized = title.replace(/\s*[-|]\s*(智谱清言|ChatGLM(?:\s*\d+)?)\s*$/i, "").trim()

    if (!normalized || normalized === "智谱清言" || normalized.toLowerCase() === "chatglm") {
      return null
    }

    return normalized
  }

  getConversationTitle(): string | null {
    return null
  }

  getSubmitButtonSelectors(): string[] {
    return [`${SUBMIT_BUTTON_SELECTOR}:not(.empty)`]
  }

  findSubmitButton(): HTMLElement | null {
    const button = document.querySelector(SUBMIT_BUTTON_SELECTOR) as HTMLElement | null
    if (!button || button.classList.contains("empty")) return null
    if (button.offsetParent === null) return null
    return button
  }

  getScrollContainer(): HTMLElement | null {
    const list = document.querySelector(RESPONSE_CONTAINER_SELECTOR) as HTMLElement | null
    if (list && list.scrollHeight > list.clientHeight) {
      return list
    }

    const chatScroll = document.querySelector(".chatScrollContainer") as HTMLElement | null
    if (chatScroll && chatScroll.scrollHeight > chatScroll.clientHeight) {
      return chatScroll
    }

    return super.getScrollContainer()
  }

  getResponseContainerSelector(): string {
    return RESPONSE_CONTAINER_SELECTOR
  }

  getChatContentSelectors(): string[] {
    return [ASSISTANT_MARKDOWN_SELECTOR, USER_TEXT_SELECTOR]
  }

  getUserQuerySelector(): string {
    return USER_QUERY_SELECTOR
  }

  extractUserQueryText(element: Element): string {
    const content = element.querySelector(USER_TEXT_SELECTOR) || element
    return this.extractTextWithLineBreaks(content).trim()
  }

  extractUserQueryMarkdown(element: Element): string {
    return this.extractUserQueryText(element)
  }

  extractAssistantResponseText(element: Element): string {
    const markdown = element.matches(".markdown-body")
      ? element
      : element.querySelector(".markdown-body")
    if (!markdown) return ""

    const content = htmlToMarkdown(markdown).trim()
    if (content) return content

    return this.extractTextWithLineBreaks(markdown).trim()
  }

  getLatestReplyText(): string | null {
    const replies = document.querySelectorAll(ASSISTANT_MARKDOWN_SELECTOR)
    if (replies.length === 0) return null

    const last = replies[replies.length - 1]
    const markdown = last.matches(".markdown-body") ? last : last.querySelector(".markdown-body")
    if (!markdown) return null

    return this.extractTextWithLineBreaks(markdown).trim()
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const container = document.querySelector(RESPONSE_CONTAINER_SELECTOR)
    if (!container) return []

    const outline: OutlineItem[] = []
    const items = Array.from(container.querySelectorAll(CONVERSATION_ITEM_SELECTOR))

    const findNextAssistantMarkdown = (startIndex: number): Element | null => {
      for (let i = startIndex + 1; i < items.length; i++) {
        const candidate = items[i].querySelector(ASSISTANT_MARKDOWN_SELECTOR)
        if (candidate) return candidate
      }
      return null
    }

    items.forEach((item, itemIndex) => {
      const userRoot = item.querySelector(USER_QUERY_SELECTOR)
      if (userRoot) {
        if (includeUserQueries) {
          const text = this.extractUserQueryMarkdown(userRoot)
          if (text) {
            let wordCount: number | undefined
            if (showWordCount) {
              const nextAssistant = findNextAssistantMarkdown(itemIndex)
              wordCount = nextAssistant?.textContent?.trim().length || 0
            }

            outline.push({
              level: 0,
              text:
                text.length > MAX_OUTLINE_TEXT_LENGTH
                  ? `${text.slice(0, MAX_OUTLINE_TEXT_LENGTH)}...`
                  : text,
              element: userRoot,
              isUserQuery: true,
              isTruncated: text.length > MAX_OUTLINE_TEXT_LENGTH,
              wordCount,
            })
          }
        }
      }

      const markdownBlocks = item.querySelectorAll(ASSISTANT_MARKDOWN_SELECTOR)
      if (!markdownBlocks.length) return

      markdownBlocks.forEach((markdown) => {
        const headings = Array.from(markdown.querySelectorAll("h1, h2, h3, h4, h5, h6"))
        headings.forEach((heading, headingIndex) => {
          if (this.isInRenderedMarkdownContainer(heading)) return

          const level = Number.parseInt(heading.tagName.slice(1), 10)
          if (Number.isNaN(level) || level > maxLevel) return

          const text = heading.textContent?.trim() || ""
          if (!text) return

          let wordCount: number | undefined
          if (showWordCount) {
            let nextBoundary: Element | null = null
            for (let i = headingIndex + 1; i < headings.length; i++) {
              const candidate = headings[i]
              const candidateLevel = Number.parseInt(candidate.tagName.slice(1), 10)
              if (!Number.isNaN(candidateLevel) && candidateLevel <= level) {
                nextBoundary = candidate
                break
              }
            }
            wordCount = this.calculateRangeWordCount(heading, nextBoundary, markdown)
          }

          outline.push({
            level,
            text,
            element: heading,
            wordCount,
          })
        })
      })
    })

    return outline
  }

  getExportConfig(): ExportConfig {
    return {
      userQuerySelector: USER_QUERY_SELECTOR,
      assistantResponseSelector: ASSISTANT_MARKDOWN_SELECTOR,
      turnSelector: null,
      useShadowDOM: false,
    }
  }

  isGenerating(): boolean {
    const selectors = [
      ".stop-generate",
      ".stop-answer-default",
      ".stop-stream-tip",
      ".answer-content-wrap .generating-icon",
      ".enter-icon-container.stop",
    ]

    for (const selector of selectors) {
      const el = document.querySelector(selector) as HTMLElement | null
      if (el && el.offsetParent !== null) return true
    }

    return false
  }

  getModelName(): string | null {
    const selectors = [
      ".selected-model-info .model-select-name",
      ".model-select-container .model-select-name",
      ".model-select-list .model-select-item.selected .model-select-name",
      ".model-select-name",
    ]

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector)
      for (const element of Array.from(elements)) {
        const text = element.textContent?.trim()
        if (!text) continue

        const el = element as HTMLElement
        if (el.offsetParent !== null) {
          return text.split("\n")[0].trim()
        }
      }
    }

    // 兜底：寻找第一个非空模型名
    for (const selector of selectors) {
      const element = document.querySelector(selector)
      const text = element?.textContent?.trim()
      if (text) return text.split("\n")[0].trim()
    }

    return null
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: [
        ".model-select-icon-container",
        ".selected-model-info",
        ".model-select-container",
      ],
      menuItemSelector: ".model-select-list .model-select-item",
      menuRenderDelay: 150,
      checkInterval: 1000,
      maxAttempts: 10,
    }
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig {
    return {
      urlPatterns: ["chat/completion", "/api/chat"],
      silenceThreshold: 2000,
    }
  }

  getWidthSelectors() {
    return [
      { selector: ".conversation-container", property: "max-width" },
      { selector: ".conversation-inner", property: "max-width" },
      { selector: ".conversation-list", property: "max-width" },
      { selector: ".conversation-list", property: "width", value: "100%" },
    ]
  }

  getZenModeSelectors(): ZenModeRule[] {
    return [
      { selector: ".footer", action: "hide" },
      { selector: ".policy-wrap", action: "hide" },
    ]
  }
}
