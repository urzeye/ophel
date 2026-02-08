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

  private async waitForSubmitConfirmation(
    initialContent: string,
    submitSelectors: string[],
    initialButton: HTMLElement | null,
  ): Promise<boolean> {
    const deadline = Date.now() + 1500
    const hadContent = initialContent.trim().length > 0

    while (Date.now() < deadline) {
      const currentEditor = this.adapter.getTextareaElement() || this.adapter.findTextarea()
      const currentContent = this.getEditorContent(currentEditor)

      if (hadContent && currentContent.trim().length === 0) {
        return true
      }

      if (submitSelectors.length > 0) {
        const currentButton = DOMToolkit.query(submitSelectors, {
          shadow: true,
        }) as HTMLElement | null
        if (currentButton && this.isElementDisabled(currentButton)) {
          return true
        }
        if (!currentButton && initialButton && !initialButton.isConnected) {
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

    if (submitSelectors.length > 0) {
      const submitButton = DOMToolkit.query(submitSelectors, { shadow: true }) as HTMLElement | null
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
      const eventInit: KeyboardEventInit = {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
        composed: true,
        ctrlKey: needModifier,
        metaKey: needModifier,
        shiftKey: false,
      }

      activeEditor.dispatchEvent(new KeyboardEvent("keydown", eventInit))
      activeEditor.dispatchEvent(new KeyboardEvent("keypress", eventInit))
      activeEditor.dispatchEvent(new KeyboardEvent("keyup", eventInit))
      triggered = true
    }

    if (!triggered) return false

    return this.waitForSubmitConfirmation(initialContent, submitSelectors, clickedButton)
  }
}
