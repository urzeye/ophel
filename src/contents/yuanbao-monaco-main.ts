import { installYuanbaoMonacoWrap } from "~core/yuanbao-monaco-wrap"
import type { MainWorldCSConfig } from "~types/plasmo-content-script"

export const config: MainWorldCSConfig = {
  matches: ["https://yuanbao.tencent.com/*"],
  world: "MAIN",
  run_at: "document_start",
  persist_across_sessions: false,
}

installYuanbaoMonacoWrap(window)
