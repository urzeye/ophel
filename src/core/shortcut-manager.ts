/**
 * 快捷键管理器
 *
 * 负责监听键盘事件并触发对应的快捷键动作
 */

import {
  DEFAULT_KEYBINDINGS,
  isMacOS,
  type ShortcutActionId,
  type ShortcutBinding,
  type ShortcutsSettings,
} from "~constants/shortcuts"

export type ShortcutHandler = () => void

export class ShortcutManager {
  private handlers: Map<ShortcutActionId, ShortcutHandler> = new Map()
  private settings: ShortcutsSettings | null = null
  private isMac: boolean = isMacOS()
  private isListening: boolean = false

  /**
   * 更新快捷键设置
   */
  updateSettings(settings: ShortcutsSettings | undefined) {
    this.settings = settings || null
  }

  /**
   * 注册快捷键处理器
   */
  register(actionId: ShortcutActionId, handler: ShortcutHandler) {
    this.handlers.set(actionId, handler)
  }

  /**
   * 批量注册快捷键处理器
   */
  registerAll(handlers: Partial<Record<ShortcutActionId, ShortcutHandler>>) {
    for (const [actionId, handler] of Object.entries(handlers)) {
      if (handler) {
        this.handlers.set(actionId as ShortcutActionId, handler)
      }
    }
  }

  /**
   * 取消注册快捷键处理器
   */
  unregister(actionId: ShortcutActionId) {
    this.handlers.delete(actionId)
  }

  /**
   * 清除所有处理器
   */
  clearAll() {
    this.handlers.clear()
  }

  /**
   * 启动键盘事件监听
   */
  startListening() {
    if (this.isListening) return

    document.addEventListener("keydown", this.handleKeyDown, true)
    this.isListening = true
  }

  /**
   * 停止键盘事件监听
   */
  stopListening() {
    if (!this.isListening) return

    document.removeEventListener("keydown", this.handleKeyDown, true)
    this.isListening = false
  }

  /**
   * 检查是否应该忽略快捷键（如在输入框中）
   */
  private shouldIgnoreEvent(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement
    if (!target) return false

    // 在输入框、文本区域、可编辑元素中时忽略快捷键
    // 但允许带有 Ctrl/Cmd/Alt 修饰键的组合
    const isEditable =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable ||
      target.getAttribute("contenteditable") === "true" ||
      target.classList.contains("ProseMirror")

    if (isEditable) {
      // 如果没有修饰键，则忽略
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        return true
      }
    }

    return false
  }

  /**
   * 检查按键是否匹配快捷键绑定
   */
  private matchesBinding(e: KeyboardEvent, binding: ShortcutBinding): boolean {
    // 检查主键
    const eventKey = e.key.toLowerCase()
    const bindingKey = binding.key.toLowerCase()

    // 特殊键映射
    let keyMatches =
      eventKey === bindingKey ||
      (bindingKey === "arrowup" && eventKey === "arrowup") ||
      (bindingKey === "arrowdown" && eventKey === "arrowdown") ||
      (bindingKey === "arrowleft" && eventKey === "arrowleft") ||
      (bindingKey === "arrowright" && eventKey === "arrowright")

    // 修复 Shift + 数字键无法触发的问题
    // 当绑定包含 Shift 且键是数字时，e.key 会变成符号（如 !），导致不匹配
    // 使用 e.code (Digit0-Digit9) 进行辅助判断
    if (!keyMatches && binding.shift && /^[0-9]$/.test(bindingKey)) {
      if (e.code === `Digit${bindingKey}`) {
        keyMatches = true
      }
    }

    if (!keyMatches) return false

    // 检查修饰键
    // Mac 上 alt 对应 Option，meta 对应 Cmd
    // Windows 上 ctrl 对应 Ctrl，alt 对应 Alt
    const altMatches = !!binding.alt === e.altKey
    const shiftMatches = !!binding.shift === e.shiftKey

    // ctrl 和 meta 的处理
    // Mac: binding.ctrl/meta 都映射到 metaKey
    // Windows: binding.ctrl 映射到 ctrlKey，binding.meta 忽略
    let ctrlMetaMatches: boolean
    if (this.isMac) {
      // Mac 上 Ctrl 和 Meta 都使用 Cmd
      const expectedMeta = !!binding.ctrl || !!binding.meta
      ctrlMetaMatches = expectedMeta === e.metaKey && !e.ctrlKey
    } else {
      // Windows 上 Ctrl 使用 ctrlKey
      ctrlMetaMatches = !!binding.ctrl === e.ctrlKey
    }

    return altMatches && shiftMatches && ctrlMetaMatches
  }

  /**
   * 键盘事件处理器
   */
  private handleKeyDown = (e: KeyboardEvent) => {
    // 检查快捷键是否启用
    if (!this.settings?.enabled) return

    // 检查是否应该忽略
    if (this.shouldIgnoreEvent(e)) return

    // 合并默认设置和用户设置，确保新添加的快捷键也能生效
    const keybindings = { ...DEFAULT_KEYBINDINGS, ...this.settings.keybindings }

    // 遍历所有快捷键绑定，查找匹配项
    for (const [actionId, binding] of Object.entries(keybindings)) {
      // 跳过已移除的快捷键（null 值）
      if (binding === null) continue

      if (this.matchesBinding(e, binding)) {
        const handler = this.handlers.get(actionId as ShortcutActionId)
        if (handler) {
          e.preventDefault()
          e.stopPropagation()
          handler()
          return
        }
      }
    }
  }

  /**
   * 手动触发快捷键动作
   */
  trigger(actionId: ShortcutActionId) {
    const handler = this.handlers.get(actionId)
    if (handler) {
      handler()
    }
  }

  /**
   * 销毁管理器
   */
  destroy() {
    this.stopListening()
    this.clearAll()
  }
}

// 单例实例
let shortcutManagerInstance: ShortcutManager | null = null

/**
 * 获取 ShortcutManager 单例
 */
export function getShortcutManager(): ShortcutManager {
  if (!shortcutManagerInstance) {
    shortcutManagerInstance = new ShortcutManager()
  }
  return shortcutManagerInstance
}
