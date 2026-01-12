/**
 * Claude.ai 适配器
 */
import { DOMToolkit } from "~utils/dom-toolkit"

import {
  SiteAdapter,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
} from "./base"

export class ClaudeAdapter extends SiteAdapter {
  match(): boolean {
    return (
      window.location.hostname.includes("claude.ai") ||
      window.location.hostname.includes("claude.com")
    )
  }

  getSiteId(): string {
    return "claude"
  }

  getName(): string {
    return "Claude"
  }

  getThemeColors(): { primary: string; secondary: string } {
    // Claude 品牌色 (Terracotta/Orange)
    return { primary: "#d97757", secondary: "#c66045" }
  }

  getNewTabUrl(): string {
    return "https://claude.ai/new"
  }

  isNewConversation(): boolean {
    return window.location.pathname === "/new" || window.location.pathname === "/"
  }

  isSharePage(): boolean {
    // Claude 分享链接示例：https://claude.ai/public/artifacts/xxx
    return window.location.pathname.startsWith("/public/")
  }

  // ==================== 会话管理 ====================

  getConversationList(): ConversationInfo[] {
    // 侧边栏会话列表
    // Selector: a[data-dd-action-name="sidebar-chat-item"]
    const items = document.querySelectorAll('a[data-dd-action-name="sidebar-chat-item"]')

    return Array.from(items)
      .map((el) => {
        const href = el.getAttribute("href") || ""
        // href 格式: /chat/c44e44c0-913a-4fbe-b4f8-d346fd0b7eff
        const idMatch = href.match(/\/chat\/([a-f0-9-]+)/)
        const id = idMatch ? idMatch[1] : ""

        // 标题在 span 中
        const titleSpan = el.querySelector("span.truncate")
        const title = titleSpan?.textContent?.trim() || ""

        // 激活状态: 检查是否有激活样式或aria-current (需验证，暂时简单判断URL)
        const isActive = window.location.href.includes(id)

        return {
          id,
          title,
          url: href.startsWith("http") ? href : `https://claude.ai${href}`,
          isActive,
        }
      })
      .filter((c) => c.id)
  }

  getSidebarScrollContainer(): Element | null {
    // 侧边栏导航容器
    const nav = document.querySelector("nav")
    if (nav) {
      // 侧边栏通常在 nav 内的某个可滚动 div 中
      // 根据 structure: nav > div > div > div[class*="overflow-y-auto"]
      const scrollable = nav.querySelector("div.overflow-y-auto")
      return scrollable || nav
    }
    return null
  }

  // ==================== 输入框操作 ====================

  getTextareaSelectors(): string[] {
    return ['[contenteditable="true"]', ".ProseMirror", 'div[role="textbox"]']
  }

  getSubmitButtonSelectors(): string[] {
    return [
      'button[aria-label="Send Message"]',
      'button[data-testid="send-button"]',
      'button[aria-label="Send"]',
    ]
  }

  insertPrompt(content: string): boolean {
    const editor = this.getTextareaElement()
    if (!editor) return false

    editor.focus()

    // Claude 使用 ProseMirror/ContentEditable，execCommand 通常是最稳妥的
    try {
      // 选中已有内容
      document.execCommand("selectAll", false, undefined)
      // 插入新内容
      if (!document.execCommand("insertText", false, content)) {
        throw new Error("execCommand failed")
      }
    } catch (e) {
      // 降级: 直接 DOM 操作
      editor.textContent = content
      editor.dispatchEvent(new Event("input", { bubbles: true }))
    }
    return true
  }

  clearTextarea(): void {
    const editor = this.getTextareaElement()
    if (!editor) return

    editor.focus()
    // 尝试清空
    try {
      document.execCommand("selectAll", false, undefined)
      document.execCommand("delete", false, undefined)
    } catch (e) {
      editor.textContent = ""
    }
    // 触发 input 事件通知 React/框架
    editor.dispatchEvent(new Event("input", { bubbles: true }))
  }

  getConversationTitle(): string | null {
    // 尝试获取侧边栏激活项的标题
    // Selector: a[data-dd-action-name="sidebar-chat-item"] active??
    // 暂时通过 URL 匹配来找 active
    const currentId = this.getSessionId()
    if (currentId && currentId !== "default") {
      const activeItem = document.querySelector(`a[href*="${currentId}"]`)
      if (activeItem) {
        return activeItem.querySelector("span.truncate")?.textContent?.trim() || null
      }
    }
    return null
  }

  getScrollContainer(): HTMLElement | null {
    // 聊天内容滚动容器
    // 根据 MHTML: #main-content > div ...
    // 通常是 flex-1 h-full overflow-y-scroll
    const mainContent = document.getElementById("main-content")
    if (mainContent) {
      const scrollable = mainContent.querySelector(".overflow-y-scroll")
      if (scrollable) return scrollable as HTMLElement
    }
    return super.getScrollContainer()
  }

  getChatContentSelectors(): string[] {
    return ['div[data-testid="user-message"]', "div.font-claude-response"]
  }

  // ==================== 模型管理 ====================

  getModelName(): string | null {
    // 尝试从模型选择器获取
    const selectorBtn = document.querySelector('button[data-testid="model-selector-dropdown"]')
    if (selectorBtn && selectorBtn.textContent) {
      return selectorBtn.textContent.trim()
    }
    return null
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig {
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: ['button[data-testid="model-selector-dropdown"]'],
      menuItemSelector: 'div[role="menuitem"]',
      checkInterval: 1000,
      maxAttempts: 20,
    }
  }

  /**
   * Claude 使用 Radix UI，可能需要模拟 PointerEvent
   */
  protected simulateClick(element: HTMLElement): void {
    // 尝试标准点击，如果不行再切 PointerEvent (参考 ChatGPT 实现)
    // 目前先用标准点击，若有问题需参考 ChatGPTAdapter 的 simulateClick
    const eventTypes = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]
    for (const type of eventTypes) {
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId: 1,
        }),
      )
    }
  }

  /**
   * 覆盖模型锁定方法以支持 Claude 的多级菜单结构
   * Claude 模型菜单可能有 "More models" (更多模型) 子菜单
   */
  lockModel(keyword: string, onSuccess?: () => void): void {
    const config = this.getModelSwitcherConfig(keyword)
    if (!config) return

    const {
      targetModelKeyword,
      selectorButtonSelectors,
      menuItemSelector,
      checkInterval = 1000,
      maxAttempts = 15,
      menuRenderDelay = 500,
    } = config

    let attempts = 0
    let isSelecting = false
    const normalize = (str: string) => (str || "").toLowerCase().trim()
    const target = normalize(targetModelKeyword)

    const timer = setInterval(() => {
      attempts++
      if (attempts > maxAttempts) {
        console.warn(`Ophel: Model lock timed out for "${targetModelKeyword}"`)
        clearInterval(timer)
        return
      }

      if (isSelecting) return

      const selectorBtn = this.findElementBySelectors(selectorButtonSelectors)
      if (!selectorBtn) return

      const currentText = selectorBtn.textContent || selectorBtn.innerText || ""
      if (normalize(currentText).includes(target)) {
        clearInterval(timer)
        if (onSuccess) onSuccess()
        return
      }

      isSelecting = true
      this.simulateClick(selectorBtn)

      setTimeout(() => {
        const menuItems = this.findAllElementsBySelector(menuItemSelector)

        if (menuItems.length > 0) {
          let found = false

          // 1. 尝试直接查找目标
          for (const item of menuItems) {
            const itemText = item.textContent || (item as HTMLElement).innerText || ""
            if (normalize(itemText).includes(target)) {
              this.simulateClick(item as HTMLElement)
              found = true
              clearInterval(timer)
              setTimeout(() => {
                document.body.click() // 关闭菜单
                if (onSuccess) onSuccess()
              }, 100)
              return
            }
          }

          // 2. 如果没找到，查找 "More models" / "更多模型"
          if (!found) {
            const moreModelsItem = menuItems.find((item) => {
              const t = normalize(item.textContent || "")
              return t.includes("more models") || t.includes("更多模型")
            })

            if (moreModelsItem) {
              // 点击展开更多模型
              this.simulateClick(moreModelsItem as HTMLElement)

              // 等待子菜单渲染
              setTimeout(() => {
                const subItems = this.findAllElementsBySelector(menuItemSelector)
                for (const item of subItems) {
                  const itemText = item.textContent || (item as HTMLElement).innerText || ""
                  if (normalize(itemText).includes(target)) {
                    this.simulateClick(item as HTMLElement)
                    found = true
                    clearInterval(timer)
                    setTimeout(() => {
                      document.body.click()
                      if (onSuccess) onSuccess()
                    }, 100)
                    return
                  }
                }

                // 仍未找到
                console.warn(`Ophel: Model "${target}" not found in sub-menu.`)
                clearInterval(timer)
                document.body.click()
                isSelecting = false
              }, menuRenderDelay)
            } else {
              // 没有更多模型选项
              console.warn(`Ophel: Model "${target}" not found and no 'More models' option.`)
              clearInterval(timer)
              document.body.click()
              isSelecting = false
            }
          }
        } else {
          isSelecting = false
          document.body.click()
        }
      }, menuRenderDelay)
    }, checkInterval)
  }

  // ==================== 杂项 ====================

  getNewChatButtonSelectors(): string[] {
    return ['a[data-dd-action-name="sidebar-new-item"]', 'a[href="/new"]']
  }
}
