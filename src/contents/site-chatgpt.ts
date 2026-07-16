import type { PlasmoCSConfig } from "plasmo"

import { ChatGPTAdapter } from "~adapters/chatgpt"
import { setAdapterRuntime } from "~core/adapter-runtime"

export const config: PlasmoCSConfig = {
  matches: ["https://chatgpt.com/*"],
  run_at: "document_start",
}

setAdapterRuntime(new ChatGPTAdapter())
