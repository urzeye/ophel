import { AISTUDIO_CONFIG, AISTUDIO_CONFIG_VERSION } from "~adapters/aistudio-config"
import { CHATGLM_CONFIG, CHATGLM_CONFIG_VERSION } from "~adapters/chatglm-config"
import { CHATGPT_CONFIG, CHATGPT_CONFIG_VERSION } from "~adapters/chatgpt-config"
import { CLAUDE_CONFIG, CLAUDE_CONFIG_VERSION } from "~adapters/claude-config"
import { DEEPSEEK_CONFIG, DEEPSEEK_CONFIG_VERSION } from "~adapters/deepseek-config"
import { DOUBAO_CONFIG, DOUBAO_CONFIG_VERSION } from "~adapters/doubao-config"
import { GROK_CONFIG, GROK_CONFIG_VERSION } from "~adapters/grok-config"
import { GEMINI_CONFIG, GEMINI_CONFIG_VERSION } from "~adapters/gemini-config"
import {
  GEMINI_ENTERPRISE_CONFIG,
  GEMINI_ENTERPRISE_CONFIG_VERSION,
} from "~adapters/gemini-enterprise-config"
import { IMA_CONFIG, IMA_CONFIG_VERSION } from "~adapters/ima-config"
import { KIMI_CONFIG, KIMI_CONFIG_VERSION } from "~adapters/kimi-config"
import { QIANWEN_CONFIG, QIANWEN_CONFIG_VERSION } from "~adapters/qianwen-config"
import { QWEN_STUDIO_CONFIG, QWEN_STUDIO_CONFIG_VERSION } from "~adapters/qwen-studio-config"
import { YUANBAO_CONFIG, YUANBAO_CONFIG_VERSION } from "~adapters/yuanbao-config"
import { ZAI_CONFIG, ZAI_CONFIG_VERSION } from "~adapters/zai-config"
import { SITE_IDS } from "~constants/defaults"

import type { BuiltinConfigDescriptor, ResolveBuiltinConfig } from "./remote-config-types"

const BUILTIN_CONFIG_DESCRIPTORS = new Map<string, BuiltinConfigDescriptor>([
  [
    SITE_IDS.AISTUDIO,
    {
      siteId: SITE_IDS.AISTUDIO,
      configVersion: AISTUDIO_CONFIG_VERSION,
      baseConfig: AISTUDIO_CONFIG,
    },
  ],
  [
    SITE_IDS.CHATGLM,
    {
      siteId: SITE_IDS.CHATGLM,
      configVersion: CHATGLM_CONFIG_VERSION,
      baseConfig: CHATGLM_CONFIG,
    },
  ],
  [
    SITE_IDS.CHATGPT,
    {
      siteId: SITE_IDS.CHATGPT,
      configVersion: CHATGPT_CONFIG_VERSION,
      baseConfig: CHATGPT_CONFIG,
    },
  ],
  [
    SITE_IDS.CLAUDE,
    {
      siteId: SITE_IDS.CLAUDE,
      configVersion: CLAUDE_CONFIG_VERSION,
      baseConfig: CLAUDE_CONFIG,
    },
  ],
  [
    SITE_IDS.DEEPSEEK,
    {
      siteId: SITE_IDS.DEEPSEEK,
      configVersion: DEEPSEEK_CONFIG_VERSION,
      baseConfig: DEEPSEEK_CONFIG,
    },
  ],
  [
    SITE_IDS.DOUBAO,
    {
      siteId: SITE_IDS.DOUBAO,
      configVersion: DOUBAO_CONFIG_VERSION,
      baseConfig: DOUBAO_CONFIG,
    },
  ],
  [
    SITE_IDS.GROK,
    {
      siteId: SITE_IDS.GROK,
      configVersion: GROK_CONFIG_VERSION,
      baseConfig: GROK_CONFIG,
    },
  ],
  [
    SITE_IDS.GEMINI,
    {
      siteId: SITE_IDS.GEMINI,
      configVersion: GEMINI_CONFIG_VERSION,
      baseConfig: GEMINI_CONFIG,
    },
  ],
  [
    SITE_IDS.GEMINI_ENTERPRISE,
    {
      siteId: SITE_IDS.GEMINI_ENTERPRISE,
      configVersion: GEMINI_ENTERPRISE_CONFIG_VERSION,
      baseConfig: GEMINI_ENTERPRISE_CONFIG,
    },
  ],
  [
    SITE_IDS.IMA,
    {
      siteId: SITE_IDS.IMA,
      configVersion: IMA_CONFIG_VERSION,
      baseConfig: IMA_CONFIG,
    },
  ],
  [
    SITE_IDS.KIMI,
    {
      siteId: SITE_IDS.KIMI,
      configVersion: KIMI_CONFIG_VERSION,
      baseConfig: KIMI_CONFIG,
    },
  ],
  [
    SITE_IDS.QIANWEN,
    {
      siteId: SITE_IDS.QIANWEN,
      configVersion: QIANWEN_CONFIG_VERSION,
      baseConfig: QIANWEN_CONFIG,
    },
  ],
  [
    SITE_IDS.QWENAI,
    {
      siteId: SITE_IDS.QWENAI,
      configVersion: QWEN_STUDIO_CONFIG_VERSION,
      baseConfig: QWEN_STUDIO_CONFIG,
    },
  ],
  [
    SITE_IDS.YUANBAO,
    {
      siteId: SITE_IDS.YUANBAO,
      configVersion: YUANBAO_CONFIG_VERSION,
      baseConfig: YUANBAO_CONFIG,
    },
  ],
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
