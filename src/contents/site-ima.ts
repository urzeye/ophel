import type { PlasmoCSConfig } from "plasmo"

import { ImaAdapter } from "~adapters/ima"
import { setAdapterRuntime } from "~core/adapter-runtime"

export const config: PlasmoCSConfig = {
  matches: ["https://ima.qq.com/*"],
  run_at: "document_start",
}

setAdapterRuntime(new ImaAdapter())
