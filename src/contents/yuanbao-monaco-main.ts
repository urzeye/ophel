import type { PlasmoCSConfig } from "plasmo"

import { installYuanbaoMonacoWrap } from "~core/yuanbao-monaco-wrap"

export const config: PlasmoCSConfig = {
  matches: ["https://yuanbao.tencent.com/*"],
  world: "MAIN",
  run_at: "document_start",
}

installYuanbaoMonacoWrap(window)
