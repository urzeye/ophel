/**
 * Z.ai 适配器（chat.z.ai）
 *
 * 选择器策略：
 * - 优先使用 ID / aria-label 等稳定属性
 * - 会话列表缺少稳定 ID，列表解析为 best-effort
 */
import { SITE_IDS } from "~constants"

import {
  SiteAdapter,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ModelSwitcherConfig,
} from "./base"

const HOSTNAME = "chat.z.ai"
const CHAT_PATH_PATTERN = /\/c\/([a-z0-9-]+)(?:\/|$)/i
const TEXTAREA_SELECTORS = ["#chat-input", "textarea#chat-input"]
const SUBMIT_BUTTON_SELECTOR = "#send-message-button"
const NEW_CHAT_BUTTON_SELECTORS = ["#sidebar-new-chat-button", "#new-chat-button"]
const MODEL_SELECTOR_BUTTON_SELECTORS = [
  "#model-selector-glm-5-button",
  'button[aria-label="选择一个模型"]',
  'button[aria-label*="模型"]',
  'button[aria-label*="model"]',
]
const MODEL_MENU_ITEM_SELECTOR =
  'button[aria-label="model-item"], button[data-melt-collapsible-trigger]'
const MODEL_SUB_MENU_SELECTOR = "button[data-melt-collapsible-trigger]"
const SIDEBAR_ITEM_SELECTOR = "#sidebar .w-full.mb-1.relative.group"
const SIDEBAR_TITLE_SELECTOR = 'div[dir="auto"]'
const CID_STORAGE_KEY = "_arms_uid"
const MODEL_STORAGE_KEY = "selectedModels"
const THEME_STORAGE_KEY = "theme"
const META_THEME_SELECTOR = 'meta[name="theme-color"]'
const THEME_COLORS = {
  light: "#F4F6F8",
  dark: "#141618",
}
const CONVERSATION_ID_PATTERN = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i

export class ZaiAdapter extends SiteAdapter {
  match(): boolean {
    return window.location.hostname === HOSTNAME
  }

  getSiteId(): string {
    return SITE_IDS.ZAI
  }

  getName(): string {
    return "Z.ai"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#0881F0", secondary: "#0B6ED8" }
  }

  getTextareaSelectors(): string[] {
    return [...TEXTAREA_SELECTORS]
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

  getSubmitButtonSelectors(): string[] {
    return [`${SUBMIT_BUTTON_SELECTOR}:not([disabled])`]
  }

  findSubmitButton(): HTMLElement | null {
    const button = document.querySelector(SUBMIT_BUTTON_SELECTOR) as HTMLElement | null
    if (!button || button.hasAttribute("disabled")) return null
    if (button.offsetParent === null) return null
    return button
  }

  getNewChatButtonSelectors(): string[] {
    return [...NEW_CHAT_BUTTON_SELECTORS]
  }

  getNewTabUrl(): string {
    return "https://chat.z.ai/"
  }

  getSessionId(): string {
    const match = window.location.pathname.match(CHAT_PATH_PATTERN)
    return match?.[1] || ""
  }

  isNewConversation(): boolean {
    const path = window.location.pathname
    return path === "/" || path === "" || !CHAT_PATH_PATTERN.test(path)
  }

  getCurrentCid(): string | null {
    try {
      const raw = localStorage.getItem(CID_STORAGE_KEY)
      if (!raw) return null
      const trimmed = raw.trim()
      if (!trimmed) return null
      if (trimmed.startsWith('"')) {
        const parsed = JSON.parse(trimmed)
        return typeof parsed === "string" ? parsed : null
      }
      return trimmed
    } catch {
      return null
    }
  }

  getConversationTitle(): string | null {
    const sessionId = this.getSessionId()
    if (!sessionId) return null
    const list = this.getConversationList()
    const matched = list.find((item) => item.id === sessionId)
    return matched?.title || null
  }

  getConversationList(): ConversationInfo[] {
    const nodes = document.querySelectorAll(SIDEBAR_ITEM_SELECTOR)
    if (!nodes.length) return []
    const cid = this.getCurrentCid() || undefined
    const list: ConversationInfo[] = []

    nodes.forEach((node) => {
      const id = this.extractConversationId(node)
      if (!id) return
      const title = this.extractConversationTitle(node)
      if (!title) return
      list.push({
        id,
        cid,
        title,
        url: `https://chat.z.ai/c/${id}`,
        isActive: id === this.getSessionId(),
      })
    })

    return list
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    return {
      selector: SIDEBAR_ITEM_SELECTOR,
      shadow: false,
      extractInfo: (el) => {
        const id = this.extractConversationId(el)
        if (!id) return null
        const title = this.extractConversationTitle(el)
        if (!title) return null
        return {
          id,
          title,
          url: `https://chat.z.ai/c/${id}`,
          cid: this.getCurrentCid() || undefined,
          isActive: id === this.getSessionId(),
        }
      },
      getTitleElement: (el) => el.querySelector(SIDEBAR_TITLE_SELECTOR) || el,
    }
  }

  getSidebarScrollContainer(): Element | null {
    return document.querySelector("#sidebar .overflow-y-auto")
  }

  navigateToConversation(id: string, url?: string): boolean {
    const nodes = document.querySelectorAll(SIDEBAR_ITEM_SELECTOR)
    for (const node of Array.from(nodes)) {
      if (this.extractConversationId(node) !== id) continue
      const button = node.querySelector("button") as HTMLElement | null
      if (button) {
        button.click()
        return true
      }
    }
    return super.navigateToConversation(id, url || `https://chat.z.ai/c/${id}`)
  }

  getModelName(): string | null {
    const stored = this.getSelectedModelFromStorage()
    if (stored) return stored

    const button = this.findElementBySelectors(MODEL_SELECTOR_BUTTON_SELECTORS)
    const text = button?.textContent?.trim()
    return text || null
  }

  lockModel(keyword: string, onSuccess?: () => void): void {
    if (!this.isNewConversation()) return
    super.lockModel(keyword, onSuccess)
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    if (!this.isNewConversation()) return null
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: [...MODEL_SELECTOR_BUTTON_SELECTORS],
      menuItemSelector: MODEL_MENU_ITEM_SELECTOR,
      checkInterval: 1000,
      maxAttempts: 12,
      menuRenderDelay: 400,
      subMenuSelector: MODEL_SUB_MENU_SELECTOR,
      subMenuTriggers: ["更多模型", "more"],
    }
  }

  async toggleTheme(targetMode: "light" | "dark" | "system"): Promise<boolean> {
    try {
      const prefersDark =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      const resolvedMode = targetMode === "system" ? (prefersDark ? "dark" : "light") : targetMode

      localStorage.setItem(THEME_STORAGE_KEY, targetMode)

      document.documentElement.classList.remove("light", "dark")
      document.documentElement.classList.add(resolvedMode)
      document.documentElement.style.colorScheme = resolvedMode
      document.body.style.colorScheme = resolvedMode

      const meta = document.querySelector(META_THEME_SELECTOR)
      if (meta) {
        meta.setAttribute("content", THEME_COLORS[resolvedMode])
      }

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: THEME_STORAGE_KEY,
          newValue: targetMode,
          storageArea: localStorage,
        }),
      )

      return true
    } catch (error) {
      console.error("[ZaiAdapter] toggleTheme error:", error)
      return false
    }
  }

  private extractConversationTitle(node: Element): string {
    const titleEl = node.querySelector(SIDEBAR_TITLE_SELECTOR)
    return titleEl?.textContent?.trim() || ""
  }

  private extractConversationId(node: Element): string {
    const attrKeys = [
      "data-conversation-id",
      "data-chat-id",
      "data-session-id",
      "data-cid",
      "data-id",
    ]

    for (const key of attrKeys) {
      const direct = this.matchConversationId(node.getAttribute(key))
      if (direct) return direct
      const child = node.querySelector(`[${key}]`)
      const childValue = this.matchConversationId(child?.getAttribute(key))
      if (childValue) return childValue
    }

    const ariaControls = node.getAttribute("aria-controls")
    const ariaMatch = this.matchConversationId(ariaControls)
    if (ariaMatch) return ariaMatch

    return ""
  }

  private matchConversationId(value: string | null | undefined): string {
    if (!value) return ""
    const match = value.match(CONVERSATION_ID_PATTERN)
    return match?.[0] || ""
  }

  private getSelectedModelFromStorage(): string | null {
    try {
      const raw = localStorage.getItem(MODEL_STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && typeof parsed[0] === "string") {
        return parsed[0]
      }
      return typeof parsed === "string" ? parsed : null
    } catch {
      return null
    }
  }
}
