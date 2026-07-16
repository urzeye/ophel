import type { PlasmoCSConfig } from "plasmo"

import { KimiAdapter } from "~adapters/kimi"
import { setAdapterRuntime } from "~core/adapter-runtime"

export const config: PlasmoCSConfig = {
  matches: ["https://www.kimi.com/*"],
  run_at: "document_start",
}

setAdapterRuntime(new KimiAdapter())
