/**
 * 默认值常量
 */

import { t } from "~utils/i18n"
import type { Prompt } from "~utils/storage"

// ==================== Zustand Store Keys ====================
// 用于备份导出/导入时识别 Zustand persist 格式的数据
export const ZUSTAND_KEYS: string[] = [
  "settings",
  "prompts",
  "folders",
  "tags",
  "conversations",
  "readingHistory",
]

// 多属性 Store（导入时需要特殊处理）
// 这些 store 的 state 中包含多个属性，不只是与 key 同名的主数据
export const MULTI_PROP_STORES: string[] = ["conversations", "readingHistory"]

// ==================== 默认提示词 ====================
// 返回国际化后的默认提示词
export const getDefaultPrompts = (): Prompt[] => [
  {
    id: "default_1",
    title: t("defaultPromptCodeOptTitle") || "代码优化",
    content: t("defaultPromptCodeOptContent") || "请帮我优化以下代码，提高性能和可读性：\n\n",
    category: t("defaultPromptCodeOptCategory") || "编程",
  },
  {
    id: "default_2",
    title: t("defaultPromptTranslateTitle") || "翻译助手",
    content:
      t("defaultPromptTranslateContent") || "请将以下内容翻译成中文，保持专业术语的准确性：\n\n",
    category: t("defaultPromptTranslateCategory") || "翻译",
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

export interface SupportedAiPlatform {
  id: (typeof SITE_IDS)[keyof typeof SITE_IDS]
  name: string
  pattern: RegExp
  url: string
  icon: string
}

export const SUPPORTED_AI_PLATFORMS: SupportedAiPlatform[] = [
  {
    id: SITE_IDS.CHATGPT,
    name: "ChatGPT",
    pattern: /chatgpt\.com/,
    url: "https://chatgpt.com",
    icon: "💬",
  },
  {
    id: SITE_IDS.GEMINI,
    name: "Gemini",
    pattern: /gemini\.google\.com/,
    url: "https://gemini.google.com",
    icon: "🌟",
  },
  {
    id: SITE_IDS.CLAUDE,
    name: "Claude",
    pattern: /claude\.(ai|com)/,
    url: "https://claude.ai",
    icon: "🎭",
  },
  {
    id: SITE_IDS.AISTUDIO,
    name: "AI Studio",
    pattern: /aistudio\.google\.com/,
    url: "https://aistudio.google.com",
    icon: "🧪",
  },
  {
    id: SITE_IDS.GROK,
    name: "Grok",
    pattern: /grok\.com/,
    url: "https://grok.com",
    icon: "🤖",
  },
  {
    id: SITE_IDS.GEMINI_ENTERPRISE,
    name: "Gemini Enterprise",
    pattern: /business\.gemini\.google/,
    url: "https://business.gemini.google",
    icon: "🏢",
  },
  {
    id: SITE_IDS.DOUBAO,
    name: "Doubao",
    pattern: /www\.doubao\.com/,
    url: "https://www.doubao.com",
    icon: "🌱",
  },
  {
    id: SITE_IDS.DEEPSEEK,
    name: "DeepSeek",
    pattern: /chat\.deepseek\.com/,
    url: "https://chat.deepseek.com",
    icon: "🌀",
  },
  {
    id: SITE_IDS.KIMI,
    name: "Kimi",
    pattern: /www\.kimi\.com/,
    url: "https://www.kimi.com",
    icon: "🌙",
  },
  {
    id: SITE_IDS.ZAI,
    name: "Z.ai",
    pattern: /chat\.z\.ai/,
    url: "https://chat.z.ai",
    icon: "⚡",
  },
  {
    id: SITE_IDS.CHATGLM,
    name: "ChatGLM",
    pattern: /chatglm\.cn/,
    url: "https://chatglm.cn/main/alltoolsdetail?lang=zh",
    icon: "🧠",
  },
  {
    id: SITE_IDS.YUANBAO,
    name: "Yuanbao",
    pattern: /yuanbao\.tencent\.com/,
    url: "https://yuanbao.tencent.com",
    icon: "💎",
  },
  {
    id: SITE_IDS.QIANWEN,
    name: "Qianwen",
    pattern: /www\.qianwen\.com/,
    url: "https://www.qianwen.com",
    icon: "🔮",
  },
  {
    id: SITE_IDS.QWENAI,
    name: "Qwen Studio",
    pattern: /chat\.qwen\.ai/,
    url: "https://chat.qwen.ai",
    icon: "🪄",
  },
  {
    id: SITE_IDS.IMA,
    name: "ima",
    pattern: /ima\.qq\.com/,
    url: "https://ima.qq.com",
    icon: "🐼",
  },
]
