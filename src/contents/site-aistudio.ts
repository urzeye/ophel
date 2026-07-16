import type { PlasmoCSConfig } from "plasmo"

import { AIStudioAdapter } from "~adapters/aistudio"
import { setAdapterRuntime } from "~core/adapter-runtime"

export const config: PlasmoCSConfig = {
  matches: ["https://aistudio.google.com/*"],
  run_at: "document_start",
}

setAdapterRuntime(new AIStudioAdapter())
