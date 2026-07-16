/**
 * Userscript 滚动锁桥接。
 *
 * 油猴没有 Plasmo MAIN world，通过 unsafeWindow 把共享运行时安装到页面上下文。
 */

import { installScrollLockRuntime } from "~core/scroll-lock-runtime"

declare const unsafeWindow: Window & typeof globalThis

function getPageWindow(): Window & typeof globalThis {
  if (typeof unsafeWindow !== "undefined" && unsafeWindow !== window) {
    return unsafeWindow
  }
  return window
}

export function injectScrollLock(): void {
  installScrollLockRuntime(getPageWindow())
}
