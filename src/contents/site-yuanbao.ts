import type { PlasmoCSConfig } from "plasmo"

import { YuanbaoAdapter } from "~adapters/yuanbao"
import { setAdapterRuntime } from "~core/adapter-runtime"

export const config: PlasmoCSConfig = {
  matches: ["https://yuanbao.tencent.com/*"],
  run_at: "document_start",
}

setAdapterRuntime(new YuanbaoAdapter())
