import type { PlasmoCSConfig } from "plasmo"

import { initDoubaoMessageRelationsBridge } from "~core/doubao-message-relations-bridge"

export const config: PlasmoCSConfig = {
  matches: ["https://www.doubao.com/*"],
  world: "MAIN",
  run_at: "document_start",
}

initDoubaoMessageRelationsBridge()
