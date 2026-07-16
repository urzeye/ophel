import type { PlasmoCSConfig } from "plasmo"

import { GeminiEnterpriseAdapter } from "~adapters/gemini-enterprise"
import { setAdapterRuntime } from "~core/adapter-runtime"

export const config: PlasmoCSConfig = {
  matches: ["https://business.gemini.google/*"],
  run_at: "document_start",
}

setAdapterRuntime(new GeminiEnterpriseAdapter())
