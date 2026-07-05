import { installYuanbaoMonacoWrap, type YuanbaoMonacoWrapWindow } from "~core/yuanbao-monaco-wrap"

declare const unsafeWindow: YuanbaoMonacoWrapWindow | undefined

function getPageWindow(): YuanbaoMonacoWrapWindow {
  if (typeof unsafeWindow !== "undefined" && unsafeWindow !== window) {
    return unsafeWindow
  }

  return window as YuanbaoMonacoWrapWindow
}

export function injectYuanbaoMonacoWrap(): void {
  installYuanbaoMonacoWrap(getPageWindow())
}
