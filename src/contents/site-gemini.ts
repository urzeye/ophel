import type { PlasmoCSConfig } from "plasmo"

import { GeminiAdapter } from "~adapters/gemini"
import { setAdapterRuntime } from "~core/adapter-runtime"

export const config: PlasmoCSConfig = {
  matches: ["https://gemini.google.com/*"],
  run_at: "document_start",
}

setAdapterRuntime(new GeminiAdapter())
