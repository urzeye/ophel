import type { PlasmoCSConfig } from "plasmo"

import { DoubaoAdapter } from "~adapters/doubao"
import { setAdapterRuntime } from "~core/adapter-runtime"

export const config: PlasmoCSConfig = {
  matches: ["https://www.doubao.com/*"],
  run_at: "document_start",
}

setAdapterRuntime(new DoubaoAdapter())
