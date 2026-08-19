/**
 * 默认值常量
 */

import { t } from "~utils/i18n"
import type { Prompt } from "~utils/storage"
import type { PromptChain } from "~core/prompt-action-types"
import { siteMatchPatternMatchesUrl } from "~adapters/declarative/match-pattern"

// ==================== Zustand Store Keys ====================
// 用于备份导出/导入时识别 Zustand persist 格式的数据
export const ZUSTAND_KEYS: string[] = [
  "settings",
  "prompts",
  "promptChains",
  "folders",
  "tags",
  "conversations",
  "readingHistory",
  "claudeSessionKeys",
]

// 多属性 Store（导入时需要特殊处理）
// 这些 store 的 state 中包含多个属性，不只是与 key 同名的主数据
export const MULTI_PROP_STORES: string[] = [
  "promptChains",
  "conversations",
  "readingHistory",
  "claudeSessionKeys",
]

// ==================== 默认提示词 ====================
// 返回国际化后的默认提示词
export const getDefaultPrompts = (): Prompt[] => [
  {
    id: "default_1",
    title: t("defaultPromptCodeOptTitle"),
    content: t("defaultPromptCodeOptContent"),
    category: t("defaultPromptCodeOptCategory"),
  },
  {
    id: "default_2",
    title: t("defaultPromptTranslateTitle"),
    content: t("defaultPromptTranslateContent"),
    category: t("defaultPromptTranslateCategory"),
  },
]

// ==================== 默认 Chain ====================
export const DEFAULT_PROMPT_CHAINS_VERSION = 2
export const QUICK_QUOTE_REPLY_CHAIN_ID = "default_quick_quote_reply"

const QUICK_QUOTE_REPLY_CHAIN_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>'

// 返回国际化后的默认 Chain，语言行为与默认提示词保持一致
export const getDefaultPromptChains = (): PromptChain[] => [
  {
    id: QUICK_QUOTE_REPLY_CHAIN_ID,
    title: t("quickQuoteReply"),
    description: "",
    iconSvg: QUICK_QUOTE_REPLY_CHAIN_ICON,
    showInSelectionPopover: true,
    steps: [
      {
        id: "default_quick_quote_reply_step",
        mode: "inline",
        promptId: "",
        inlineContent: t("quickQuoteReplyTemplate"),
        runMode: "insert",
        splitMode: "none",
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  },
]

// ==================== 默认文件夹 ====================
export interface Folder {
  id: string
  name: string
  icon: string
  isDefault?: boolean
  color?: string
}

export const DEFAULT_FOLDERS: Folder[] = [
  { id: "inbox", name: "收件箱", icon: "📥", isDefault: true },
]

// ==================== 布局配置默认值 ====================
export const LAYOUT_CONFIG = {
  PAGE_WIDTH: {
    DEFAULT_PX: "1280",
    DEFAULT_PERCENT: "81",
    MIN_PERCENT: 40,
    MAX_PERCENT: 99,
    MIN_PX: 1200,
  },
  USER_QUERY_WIDTH: {
    DEFAULT_PX: "600",
    DEFAULT_PERCENT: "81",
    MIN_PERCENT: 40,
    MAX_PERCENT: 99,
    MIN_PX: 600,
  },
} as const

// ==================== 验证规则 ====================
export const VALIDATION_PATTERNS = {
  // Claude Session Key 格式：sk-ant-sidXX-
  CLAUDE_KEY: /^sk-ant-sid\d{2}-/,
} as const

// ==================== 批量测试配置 ====================
export const BATCH_TEST_CONFIG = {
  INTERVAL_MS: 500, // 两次请求间隔
} as const

// ==================== 站点 ID ====================
export const SITE_IDS = {
  CLAUDE: "claude",
  GEMINI: "gemini",
  CHATGPT: "chatgpt",
  CHATGLM: "chatglm",
  GEMINI_ENTERPRISE: "gemini-enterprise",
  GROK: "grok",
  AISTUDIO: "aistudio",
  DOUBAO: "doubao",
  IMA: "ima",
  DEEPSEEK: "deepseek",
  KIMI: "kimi",
  QIANWEN: "qianwen",
  QWENAI: "qwenai",
  YUANBAO: "yuanbao",
  ZAI: "zai",
} as const

export type BuiltinSiteId = (typeof SITE_IDS)[keyof typeof SITE_IDS]

const BUILTIN_SITE_IDS = new Set<string>(Object.values(SITE_IDS))

export const isBuiltinSiteId = (siteId: string): siteId is BuiltinSiteId =>
  BUILTIN_SITE_IDS.has(siteId)

export interface SiteUrlPatternMatcher {
  test(url: string): boolean
}

export interface SupportedAiPlatform {
  id: string
  name: string
  /** 产品侧 URL 识别与 registry 冲突校验共用的单一域名声明。 */
  matchPatterns: readonly string[]
  pattern: SiteUrlPatternMatcher
  /**
   * 可直接打开的入口地址。内置站点恒为一条；适配包按静态 matches 与用户绑定域名展开，
   * 未绑定任何域名时为空数组——消费方必须显式处理"没有入口"这种状态。
   */
  entryUrls: readonly string[]
  icon: string
  faviconUrl?: string
}

type SupportedAiPlatformDefinition = Omit<SupportedAiPlatform, "pattern">

interface CreateSupportedAiPlatformOptions {
  allowEmptyMatchPatterns?: boolean
}

export const createSupportedAiPlatform = (
  definition: SupportedAiPlatformDefinition,
  options: CreateSupportedAiPlatformOptions = {},
): SupportedAiPlatform => {
  const matchPatterns = [...definition.matchPatterns]
  if (matchPatterns.length === 0 && !options.allowEmptyMatchPatterns) {
    throw new Error(`Supported platform ${definition.id} must declare at least one match pattern`)
  }
  return {
    ...definition,
    matchPatterns,
    pattern: {
      test(url: string): boolean {
        let parsedUrl: URL
        try {
          parsedUrl = new URL(url)
        } catch {
          return false
        }
        return matchPatterns.some((pattern) => siteMatchPatternMatchesUrl(parsedUrl, pattern))
      },
    },
  }
}

export const SUPPORTED_AI_PLATFORMS: SupportedAiPlatform[] = [
  createSupportedAiPlatform({
    id: SITE_IDS.CHATGPT,
    name: "ChatGPT",
    matchPatterns: [
      "https://chatgpt.com/*",
      "https://*.chatgpt.com/*",
      "https://chat.openai.com/*",
    ],
    entryUrls: ["https://chatgpt.com"],
    icon: "💬",
  }),
  createSupportedAiPlatform({
    id: SITE_IDS.GEMINI,
    name: "Gemini",
    matchPatterns: ["https://gemini.google.com/*", "https://*.gemini.google.com/*"],
    entryUrls: ["https://gemini.google.com"],
    icon: "🌟",
  }),
  createSupportedAiPlatform({
    id: SITE_IDS.CLAUDE,
    name: "Claude",
    matchPatterns: [
      "https://claude.ai/*",
      "https://*.claude.ai/*",
      "https://claude.com/*",
      "https://*.claude.com/*",
    ],
    entryUrls: ["https://claude.ai"],
    icon: "🎭",
  }),
  createSupportedAiPlatform({
    id: SITE_IDS.AISTUDIO,
    name: "AI Studio",
    matchPatterns: ["https://aistudio.google.com/*"],
    entryUrls: ["https://aistudio.google.com"],
    icon: "🧪",
  }),
  createSupportedAiPlatform({
    id: SITE_IDS.GROK,
    name: "Grok",
    matchPatterns: ["https://grok.com/*", "https://*.grok.com/*"],
    entryUrls: ["https://grok.com"],
    icon: "🤖",
  }),
  createSupportedAiPlatform({
    id: SITE_IDS.GEMINI_ENTERPRISE,
    name: "Gemini Enterprise",
    matchPatterns: ["https://business.gemini.google/*", "https://*.business.gemini.google/*"],
    entryUrls: ["https://business.gemini.google"],
    icon: "🏢",
  }),
  createSupportedAiPlatform({
    id: SITE_IDS.DOUBAO,
    name: "Doubao",
    matchPatterns: ["https://www.doubao.com/*"],
    entryUrls: ["https://www.doubao.com"],
    icon: "🌱",
  }),
  createSupportedAiPlatform({
    id: SITE_IDS.DEEPSEEK,
    name: "DeepSeek",
    matchPatterns: ["https://chat.deepseek.com/*"],
    entryUrls: ["https://chat.deepseek.com"],
    icon: "🌀",
  }),
  createSupportedAiPlatform({
    id: SITE_IDS.KIMI,
    name: "Kimi",
    matchPatterns: ["https://www.kimi.com/*"],
    entryUrls: ["https://www.kimi.com"],
    icon: "🌙",
  }),
  createSupportedAiPlatform({
    id: SITE_IDS.ZAI,
    name: "Z.ai",
    matchPatterns: ["https://chat.z.ai/*"],
    entryUrls: ["https://chat.z.ai"],
    icon: "⚡",
  }),
  createSupportedAiPlatform({
    id: SITE_IDS.CHATGLM,
    name: "ChatGLM",
    matchPatterns: ["https://chatglm.cn/*"],
    entryUrls: ["https://chatglm.cn/main/alltoolsdetail?lang=zh"],
    icon: "🧠",
  }),
  createSupportedAiPlatform({
    id: SITE_IDS.YUANBAO,
    name: "Yuanbao",
    matchPatterns: ["https://yuanbao.tencent.com/*"],
    entryUrls: ["https://yuanbao.tencent.com"],
    icon: "💎",
  }),
  createSupportedAiPlatform({
    id: SITE_IDS.QIANWEN,
    name: "Qianwen",
    matchPatterns: ["https://qianwen.com/*", "https://www.qianwen.com/*"],
    entryUrls: ["https://www.qianwen.com"],
    icon: "🔮",
  }),
  createSupportedAiPlatform({
    id: SITE_IDS.QWENAI,
    name: "Qwen Studio",
    matchPatterns: ["https://chat.qwen.ai/*"],
    entryUrls: ["https://chat.qwen.ai"],
    icon: "🪄",
  }),
  createSupportedAiPlatform({
    id: SITE_IDS.IMA,
    name: "ima",
    matchPatterns: ["https://ima.qq.com/*"],
    entryUrls: ["https://ima.qq.com"],
    icon: "🐼",
  }),
]
