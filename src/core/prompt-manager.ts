/**
 * Prompt Manager
 *
 * 提供 DOM 相关操作（插入提示词到输入框）
 * 数据存储已迁移到 prompts-store.ts
 */

import type { SiteAdapter } from "~adapters/base"
import { VIRTUAL_CATEGORY } from "~constants"
import { DOMToolkit } from "~utils/dom-toolkit"
import {
  filterPrompts,
  getCategories,
  getPromptsStore,
  usePromptsStore,
} from "~stores/prompts-store"
import type { Prompt } from "~utils/storage"

export class PromptManager {
  private adapter: SiteAdapter

  constructor(adapter: SiteAdapter) {
    this.adapter = adapter
  }

  /**
   * 初始化 - 等待 Zustand hydration 完成
   */
  async init() {
    // 等待 hydration 完成
    if (!usePromptsStore.getState()._hasHydrated) {
      await new Promise<void>((resolve) => {
        const unsubscribe = usePromptsStore.subscribe((state) => {
          if (state._hasHydrated) {
            unsubscribe()
            resolve()
          }
        })
      })
    }
  }

  // ==================== 数据访问（委托给 store）====================

  getPrompts(): Prompt[] {
    return getPromptsStore().prompts
  }

  addPrompt(data: Omit<Prompt, "id">): Prompt {
    return getPromptsStore().addPrompt(data)
  }

  updatePrompt(id: string, data: Partial<Omit<Prompt, "id">>) {
    getPromptsStore().updatePrompt(id, data)
  }

  deletePrompt(id: string) {
    getPromptsStore().deletePrompt(id)
  }

  getCategories(): string[] {
    return getCategories()
  }

  renameCategory(oldName: string, newName: string) {
    getPromptsStore().renameCategory(oldName, newName)
  }

  deleteCategory(name: string, defaultCategoryName: string = "未分类") {
    getPromptsStore().deleteCategory(name, defaultCategoryName)
  }

  updateOrder(newOrderIds: string[]) {
    getPromptsStore().updateOrder(newOrderIds)
  }

  filterPrompts(filter: string = "", category: string = VIRTUAL_CATEGORY.ALL): Prompt[] {
    return filterPrompts(filter, category)
  }

  // 切换置顶状态
  togglePin(id: string) {
    getPromptsStore().togglePin(id)
  }

  // 更新最近使用时间
  updateLastUsed(id: string) {
    getPromptsStore().updateLastUsed(id)
  }

  // 批量设置提示词（用于导入）
  setPrompts(prompts: Prompt[]) {
    getPromptsStore().setPrompts(prompts)
  }

  /**
   * 插入提示词到输入框
   */
  async insertPrompt(content: string): Promise<boolean> {
    let result = this.adapter.insertPrompt(content)

    if (!result) {
      this.adapter.findTextarea()
      await new Promise((resolve) => setTimeout(resolve, 100))
      result = this.adapter.insertPrompt(content)
    }

    return result
  }

  private getEditorContent(editor: HTMLElement | null): string {
    if (!editor) return ""

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      return editor.value || ""
    }

    return editor.textContent || ""
  }

  private isElementDisabled(element: HTMLElement | null): boolean {
    if (!element) return true

    if (element instanceof HTMLButtonElement && element.disabled) return true
    if (element.hasAttribute("disabled")) return true

    const ariaDisabled = element.getAttribute("aria-disabled")
    if (ariaDisabled === "true") return true

    return element.getAttribute("data-disabled") === "true"
  }

  private isElementVisible(element: HTMLElement | null): boolean {
    if (!element || !element.isConnected) return false
    if (element.closest(".gh-main-panel")) return false

    const style = window.getComputedStyle(element)
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      parseFloat(style.opacity || "1") === 0
    ) {
      return false
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  private collectSubmitButtons(submitSelectors: string[]): HTMLElement[] {
    const result: HTMLElement[] = []
    const seen = new Set<HTMLElement>()

    for (const selector of submitSelectors) {
      const matched = DOMToolkit.query(selector, { all: true, shadow: true }) as Element[] | null
      if (!matched || !Array.isArray(matched)) continue

      for (const element of matched) {
        if (element instanceof HTMLElement && !seen.has(element)) {
          seen.add(element)
          result.push(element)
        }
      }
    }

    return result
  }

  private getRectDistance(a: DOMRect, b: DOMRect): number {
    const dx = Math.max(a.left - b.right, b.left - a.right, 0)
    const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0)
    return Math.sqrt(dx * dx + dy * dy)
  }

  private findBestSubmitButton(
    submitSelectors: string[],
    editor: HTMLElement | null,
  ): HTMLElement | null {
    const candidates = this.collectSubmitButtons(submitSelectors).filter((button) =>
      this.isElementVisible(button),
    )

    if (candidates.length === 0) return null
    if (!editor || !editor.isConnected) return candidates[0]

    const editorForm = editor.closest("form")
    if (editorForm) {
      const sameFormCandidates = candidates.filter(
        (button) => button.closest("form") === editorForm,
      )
      if (sameFormCandidates.length > 0) {
        const enabledSameForm = sameFormCandidates.find((button) => !this.isElementDisabled(button))
        return enabledSameForm || sameFormCandidates[0]
      }
    }

    const editorRect = editor.getBoundingClientRect()
    let bestButton = candidates[0]
    let bestDistance = Number.POSITIVE_INFINITY

    for (const button of candidates) {
      const distance = this.getRectDistance(editorRect, button.getBoundingClientRect())
      if (distance < bestDistance) {
        bestDistance = distance
        bestButton = button
      }
    }

    return bestButton
  }

  private async waitForEnabledSubmitButton(
    submitSelectors: string[],
    editor: HTMLElement | null,
    timeoutMs: number = 500,
  ): Promise<HTMLElement | null> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const submitButton = this.findBestSubmitButton(submitSelectors, editor)
      if (submitButton && !this.isElementDisabled(submitButton)) {
        return submitButton
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    return null
  }

  private async waitForSubmitConfirmation(
    initialContent: string,
    submitSelectors: string[],
    buttonState: { button: HTMLElement | null; clicked: boolean; wasDisabled: boolean },
  ): Promise<boolean> {
    const deadline = Date.now() + 1500
    const hadContent = initialContent.trim().length > 0

    while (Date.now() < deadline) {
      const currentEditor = this.adapter.getTextareaElement() || this.adapter.findTextarea()
      const currentContent = this.getEditorContent(currentEditor)

      if (hadContent && currentContent.trim().length === 0) {
        return true
      }

      if (buttonState.clicked && submitSelectors.length > 0) {
        const currentButton = this.findBestSubmitButton(submitSelectors, currentEditor)

        if (!currentButton && buttonState.button && !buttonState.button.isConnected) {
          return true
        }

        if (currentButton && !buttonState.wasDisabled && this.isElementDisabled(currentButton)) {
          return true
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 60))
    }

    return false
  }

  async submitPrompt(): Promise<boolean> {
    const submitSelectors = this.adapter.getSubmitButtonSelectors()
    const editor = this.adapter.getTextareaElement() || this.adapter.findTextarea()
    const initialContent = this.getEditorContent(editor)

    let triggered = false
    let clickedButton: HTMLElement | null = null
    let initialButton: HTMLElement | null = null
    let initialButtonWasDisabled = true

    if (submitSelectors.length > 0) {
      initialButton = this.findBestSubmitButton(submitSelectors, editor)
      initialButtonWasDisabled = this.isElementDisabled(initialButton)

      let submitButton = initialButton
      if (initialButtonWasDisabled) {
        const enabledButton = await this.waitForEnabledSubmitButton(submitSelectors, editor)
        if (enabledButton) {
          submitButton = enabledButton
          initialButton = enabledButton
          initialButtonWasDisabled = false
        }
      }

      if (submitButton && !this.isElementDisabled(submitButton)) {
        submitButton.click()
        clickedButton = submitButton
        triggered = true
      }
    }

    if (!triggered) {
      const activeEditor =
        editor || this.adapter.getTextareaElement() || this.adapter.findTextarea()
      if (!activeEditor) return false

      activeEditor.focus()
      const keyConfig = this.adapter.getSubmitKeyConfig()
      const needModifier = keyConfig.key === "Ctrl+Enter"
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
      const eventInit: KeyboardEventInit = {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
        composed: true,
        ctrlKey: needModifier && !isMac,
        metaKey: needModifier && isMac,
        shiftKey: false,
      }

      activeEditor.dispatchEvent(new KeyboardEvent("keydown", eventInit))
      activeEditor.dispatchEvent(new KeyboardEvent("keypress", eventInit))
      activeEditor.dispatchEvent(new KeyboardEvent("keyup", eventInit))
      triggered = true
    }

    if (!triggered) return false

    return this.waitForSubmitConfirmation(initialContent, submitSelectors, {
      button: clickedButton || initialButton,
      clicked: !!clickedButton,
      wasDisabled: initialButtonWasDisabled,
    })
  }
}
