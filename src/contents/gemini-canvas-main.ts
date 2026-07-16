import { installGeminiCanvasCodeBridge } from "~core/gemini-canvas-code-bridge"
import type { MainWorldCSConfig } from "~types/plasmo-content-script"

export const config: MainWorldCSConfig = {
  matches: ["https://gemini.google.com/*"],
  world: "MAIN",
  run_at: "document_start",
  persist_across_sessions: false,
}

installGeminiCanvasCodeBridge(window)
