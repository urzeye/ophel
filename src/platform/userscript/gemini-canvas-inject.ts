import {
  installGeminiCanvasCodeBridge,
  type GeminiCanvasCodeBridgeWindow,
} from "~core/gemini-canvas-code-bridge"

declare const unsafeWindow: GeminiCanvasCodeBridgeWindow | undefined

function getPageWindow(): GeminiCanvasCodeBridgeWindow {
  if (typeof unsafeWindow !== "undefined" && unsafeWindow !== window) {
    return unsafeWindow
  }

  return window as GeminiCanvasCodeBridgeWindow
}

export function injectGeminiCanvasCodeBridge(): void {
  if (location.hostname !== "gemini.google.com") return

  installGeminiCanvasCodeBridge(getPageWindow())
}
