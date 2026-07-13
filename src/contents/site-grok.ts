import type { PlasmoCSConfig } from "plasmo"

import { GrokAdapter } from "~adapters/grok"
import { setAdapterRuntime } from "~core/adapter-runtime"

export const config: PlasmoCSConfig = {
  matches: ["https://grok.com/*"],
  run_at: "document_start",
}

setAdapterRuntime(new GrokAdapter())
