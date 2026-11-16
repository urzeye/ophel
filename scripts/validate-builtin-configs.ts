/**
 * 内置站点配置全量校验。
 *
 * 与 resolveSiteConfig 对内置 baseConfig 的校验路径一致（validateBuiltinSiteConfig），
 * 用于在交付前发现"能力表 / 配置 / 校验规则"三者漂移——例如声明了能力却缺少
 * 对应配置字段。这类漂移在运行时只会让缓存 patch 静默失效并刷控制台报错，
 * 没有本脚本时只能靠人工盯控制台发现。
 */
import { AISTUDIO_CONFIG } from "../src/adapters/aistudio-config"
import { CHATGLM_CONFIG } from "../src/adapters/chatglm-config"
import { CHATGPT_CONFIG } from "../src/adapters/chatgpt-config"
import { CLAUDE_CONFIG } from "../src/adapters/claude-config"
import { DEEPSEEK_CONFIG } from "../src/adapters/deepseek-config"
import { DOUBAO_CONFIG } from "../src/adapters/doubao-config"
import { GEMINI_ENTERPRISE_CONFIG } from "../src/adapters/gemini-enterprise-config"
import { GEMINI_CONFIG } from "../src/adapters/gemini-config"
import { GROK_CONFIG } from "../src/adapters/grok-config"
import { IMA_CONFIG } from "../src/adapters/ima-config"
import { KIMI_CONFIG } from "../src/adapters/kimi-config"
import { NOTEBOOK_CONFIG } from "../src/adapters/notebook-config"
import { QIANWEN_CONFIG } from "../src/adapters/qianwen-config"
import { QWEN_STUDIO_CONFIG } from "../src/adapters/qwen-studio-config"
import { YUANBAO_CONFIG } from "../src/adapters/yuanbao-config"
import { ZAI_CONFIG } from "../src/adapters/zai-config"
import type { BuiltinSiteConfig } from "../src/adapters/declarative/types"
import { validateBuiltinSiteConfig } from "../src/adapters/declarative/validate"

const configs: Array<[string, BuiltinSiteConfig]> = [
  ["gemini-enterprise", GEMINI_ENTERPRISE_CONFIG],
  ["gemini", GEMINI_CONFIG],
  ["notebook", NOTEBOOK_CONFIG as BuiltinSiteConfig],
  ["chatgpt", CHATGPT_CONFIG],
  ["grok", GROK_CONFIG],
  ["aistudio", AISTUDIO_CONFIG],
  ["claude", CLAUDE_CONFIG],
  ["deepseek", DEEPSEEK_CONFIG],
  ["doubao", DOUBAO_CONFIG],
  ["ima", IMA_CONFIG],
  ["chatglm", CHATGLM_CONFIG],
  ["kimi", KIMI_CONFIG],
  ["qwen-studio", QWEN_STUDIO_CONFIG],
  ["qianwen", QIANWEN_CONFIG],
  ["yuanbao", YUANBAO_CONFIG],
  ["zai", ZAI_CONFIG],
]

let invalidCount = 0

for (const [siteId, config] of configs) {
  // 与 merge.ts resolveSiteConfig 的 baseConfig 校验参数保持一致。
  const allowedPrivateSelectorKeys = Object.keys(config.sitePrivateSelectors ?? {})
  const result = validateBuiltinSiteConfig(config, {
    allowedPrivateSelectorKeys,
    requiredPrivateSelectorKeys: allowedPrivateSelectorKeys,
    requiredCapabilities: [...config.capabilities],
  })
  if (result.valid) {
    console.log(`[OK] ${siteId}`)
    continue
  }
  invalidCount += 1
  console.error(`[INVALID] ${siteId}`)
  for (const error of result.errors) {
    console.error(`    ${error.path} [${error.code}] ${error.message}`)
  }
}

if (invalidCount > 0) {
  console.error(`\n${invalidCount} built-in site config(s) failed validation.`)
  process.exit(1)
}
console.log(`\nAll ${configs.length} built-in site configs passed validation.`)
