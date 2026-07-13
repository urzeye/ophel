import type { PlasmoCSConfig } from "plasmo"

import { ZaiAdapter } from "~adapters/zai"
import { setAdapterRuntime } from "~core/adapter-runtime"

export const config: PlasmoCSConfig = {
  matches: ["https://chat.z.ai/*"],
  run_at: "document_start",
}

setAdapterRuntime(new ZaiAdapter())
