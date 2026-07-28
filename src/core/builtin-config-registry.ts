import { ZAI_CONFIG, ZAI_CONFIG_VERSION } from "~adapters/zai-config"
import { SITE_IDS } from "~constants/defaults"

import type { BuiltinConfigDescriptor, ResolveBuiltinConfig } from "./remote-config-types"

const BUILTIN_CONFIG_DESCRIPTORS = new Map<string, BuiltinConfigDescriptor>([
  [
    SITE_IDS.ZAI,
    {
      siteId: SITE_IDS.ZAI,
      configVersion: ZAI_CONFIG_VERSION,
      baseConfig: ZAI_CONFIG,
    },
  ],
])

/** 内置配置化适配器的单一描述符入口，供运行时更新与 registry 校验共用。 */
export const resolveBuiltinConfig: ResolveBuiltinConfig = (siteId) =>
  BUILTIN_CONFIG_DESCRIPTORS.get(siteId) ?? null
