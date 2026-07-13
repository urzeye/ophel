import type { PlasmoCSConfig } from "plasmo"

import { ChatGLMAdapter } from "~adapters/chatglm"
import { setAdapterRuntime } from "~core/adapter-runtime"

export const config: PlasmoCSConfig = {
  matches: ["https://chatglm.cn/*"],
  run_at: "document_start",
}

setAdapterRuntime(new ChatGLMAdapter())
