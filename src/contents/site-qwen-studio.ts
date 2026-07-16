import type { PlasmoCSConfig } from "plasmo"

import { QwenAiAdapter } from "~adapters/qwen-studio"
import { setAdapterRuntime } from "~core/adapter-runtime"

export const config: PlasmoCSConfig = {
  matches: ["https://chat.qwen.ai/*"],
  run_at: "document_start",
}

setAdapterRuntime(new QwenAiAdapter())
