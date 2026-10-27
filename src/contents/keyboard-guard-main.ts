/**
 * 键盘屏障 - 主世界脚本
 *
 * 问题：设置弹窗在 Shadow DOM 内，站点若把快捷键监听挂在 window/document 的捕获阶段，
 * 事件到达 shadow 之前站点就已响应（例如录制快捷键时按下 Ctrl+K 触发 DeepSeek 搜索）。
 * 事件层面无法"拦站点不拦自己"（捕获阶段 stopImmediatePropagation 会杀死整个事件，
 * shadow 内的 handler 同样收不到），只能在主世界劫持 addEventListener，
 * 把站点注册的键盘监听器包一层开关。
 *
 * 开关通过 DOM 属性同步传递（与 scroll-lock-main.ts 同一范式，避免跨世界消息竞态）：
 * 设置弹窗打开时 isolated world 置 document.documentElement.dataset.ophelKeyboardShield = "1"。
 *
 * isolated world（扩展 content script / 油猴沙箱）有独立原型链，本次劫持只影响站点脚本，
 * 弹窗自身的键盘交互不受影响。
 */

import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: [
    "https://gemini.google.com/*",
    "https://business.gemini.google/*",
    "https://aistudio.google.com/*",
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://grok.com/*",
    "https://claude.ai/*",
    "https://www.doubao.com/*",
    "https://ima.qq.com/*",
    "https://chat.deepseek.com/*",
    "https://www.kimi.com/*",
    "https://www.kimi.ai/*",
    "https://chatglm.cn/*",
    "https://chat.qwen.ai/*",
    "https://www.qianwen.com/*",
    "https://qianwen.com/*",
    "https://yuanbao.tencent.com/*",
    "https://chat.z.ai/*",
    "https://zchat.z.ai/*",
    "https://www.zchat.z.ai/*",
  ],
  world: "MAIN",
  run_at: "document_start", // 必须先于站点脚本注册监听前完成劫持
}

const GUARDED_KEYBOARD_EVENTS = new Set(["keydown", "keypress", "keyup"])

// document_start 注册时 DOM 未必就绪，但此处只在按键事件触发时读取，届时 documentElement 已存在
const isKeyboardShieldActive = (): boolean =>
  document.documentElement.dataset.ophelKeyboardShield === "1"

// 防止重复初始化
if (!window.__ophelKeyboardShieldInitialized) {
  window.__ophelKeyboardShieldInitialized = true

  const originalAdd = EventTarget.prototype.addEventListener
  const originalRemove = EventTarget.prototype.removeEventListener

  // 原始监听器 -> (事件类型|捕获标志 -> 包装监听器)，保证 removeEventListener 语义不变
  const wrappedRegistry = new WeakMap<
    EventListenerOrEventListenerObject,
    Map<string, EventListener>
  >()

  const resolveCapture = (options?: boolean | AddEventListenerOptions): boolean =>
    typeof options === "boolean" ? options : Boolean(options?.capture)

  EventTarget.prototype.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (!listener || !GUARDED_KEYBOARD_EVENTS.has(type)) {
      return originalAdd.call(this, type, listener, options)
    }

    const registryKey = `${type}|${resolveCapture(options) ? 1 : 0}`
    let perListener = wrappedRegistry.get(listener)
    if (!perListener) {
      perListener = new Map()
      wrappedRegistry.set(listener, perListener)
    }

    let wrapped = perListener.get(registryKey)
    if (!wrapped) {
      // 必须用普通函数：站点 handler 内的 this 应为事件目标本身
      wrapped = function (this: EventTarget, event: Event) {
        if (isKeyboardShieldActive()) return
        if (typeof listener === "function") {
          listener.call(this, event)
        } else {
          listener.handleEvent(event)
        }
      }
      perListener.set(registryKey, wrapped)
    }

    return originalAdd.call(this, type, wrapped, options)
  }

  EventTarget.prototype.removeEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    if (!listener || !GUARDED_KEYBOARD_EVENTS.has(type)) {
      return originalRemove.call(this, type, listener, options)
    }

    const registryKey = `${type}|${resolveCapture(options) ? 1 : 0}`
    const wrapped = wrappedRegistry.get(listener)?.get(registryKey)
    if (!wrapped) {
      return originalRemove.call(this, type, listener, options)
    }

    wrappedRegistry.get(listener)?.delete(registryKey)
    return originalRemove.call(this, type, wrapped, options)
  }
}
