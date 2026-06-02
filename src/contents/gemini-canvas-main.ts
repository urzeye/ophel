import type { PlasmoCSConfig } from "plasmo"

import { installGeminiCanvasCodeBridge } from "~core/gemini-canvas-code-bridge"

export const config: PlasmoCSConfig = {
  matches: ["https://gemini.google.com/*"],
  world: "MAIN",
  run_at: "document_start",
}

installGeminiCanvasCodeBridge(window)
