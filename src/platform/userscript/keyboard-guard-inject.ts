/**
 * 油猴脚本版键盘屏障注入
 *
 * 等效于 src/contents/keyboard-guard-main.ts 的功能（逻辑保持一致），
 * 通过 unsafeWindow 直接劫持页面主世界的 EventTarget 原型。
 * 注意要用页面世界的 EventTarget，不能用沙箱自身的原型（两者隔离）。
 */

declare const unsafeWindow: Window & typeof globalThis

const GUARDED_KEYBOARD_EVENTS = new Set(["keydown", "keypress", "keyup"])

function getPageWindow(): any {
  if (typeof unsafeWindow !== "undefined" && unsafeWindow !== window) {
    return unsafeWindow
  }
  return window
}

export function injectKeyboardGuard(): void {
  const pageWin = getPageWindow()

  // 防止重复初始化（与扩展版共享同一标志）
  if (pageWin.__ophelKeyboardShieldInitialized) return
  pageWin.__ophelKeyboardShieldInitialized = true

  const PageEventTarget = pageWin.EventTarget
  const originalAdd = PageEventTarget.prototype.addEventListener
  const originalRemove = PageEventTarget.prototype.removeEventListener

  const wrappedRegistry = new WeakMap<object, Map<string, EventListener>>()

  const resolveCapture = (options?: boolean | AddEventListenerOptions): boolean =>
    typeof options === "boolean" ? options : Boolean(options?.capture)

  const isShieldActive = (): boolean =>
    pageWin.document.documentElement.dataset.ophelKeyboardShield === "1"

  PageEventTarget.prototype.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (!listener || !GUARDED_KEYBOARD_EVENTS.has(type)) {
      return originalAdd.call(this, type, listener, options)
    }

    const registryKey = `${type}|${resolveCapture(options) ? 1 : 0}`
    let perListener = wrappedRegistry.get(listener as object)
    if (!perListener) {
      perListener = new Map()
      wrappedRegistry.set(listener as object, perListener)
    }

    let wrapped = perListener.get(registryKey)
    if (!wrapped) {
      // 必须用普通函数：站点 handler 内的 this 应为事件目标本身
      wrapped = function (this: EventTarget, event: Event) {
        if (isShieldActive()) return
        if (typeof listener === "function") {
          ;(listener as EventListener).call(this, event)
        } else {
          ;(listener as EventListenerObject).handleEvent(event)
        }
      }
      perListener.set(registryKey, wrapped)
    }

    return originalAdd.call(this, type, wrapped, options)
  }

  PageEventTarget.prototype.removeEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    if (!listener || !GUARDED_KEYBOARD_EVENTS.has(type)) {
      return originalRemove.call(this, type, listener, options)
    }

    const registryKey = `${type}|${resolveCapture(options) ? 1 : 0}`
    const perListener = wrappedRegistry.get(listener as object)
    const wrapped = perListener?.get(registryKey)
    if (!wrapped) {
      return originalRemove.call(this, type, listener, options)
    }

    perListener?.delete(registryKey)
    return originalRemove.call(this, type, wrapped, options)
  }
}
