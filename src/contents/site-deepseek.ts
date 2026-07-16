import type { PlasmoCSConfig } from "plasmo"

import { DeepSeekAdapter } from "~adapters/deepseek"
import { setAdapterRuntime } from "~core/adapter-runtime"

export const config: PlasmoCSConfig = {
  matches: ["https://chat.deepseek.com/*"],
  run_at: "document_start",
}

setAdapterRuntime(new DeepSeekAdapter())
