import type { PlasmoCSConfig } from "plasmo"

import { ClaudeAdapter } from "~adapters/claude"
import { setAdapterRuntime } from "~core/adapter-runtime"

export const config: PlasmoCSConfig = {
  matches: ["https://claude.ai/*"],
  run_at: "document_start",
}

setAdapterRuntime(new ClaudeAdapter())
