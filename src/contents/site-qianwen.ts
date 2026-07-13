import type { PlasmoCSConfig } from "plasmo"

import { QianwenAdapter } from "~adapters/qianwen"
import { setAdapterRuntime } from "~core/adapter-runtime"

export const config: PlasmoCSConfig = {
  matches: ["https://www.qianwen.com/*", "https://qianwen.com/*"],
  run_at: "document_start",
}

setAdapterRuntime(new QianwenAdapter())
