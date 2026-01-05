/**
 * 默认值常量
 */

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
export const DEFAULT_PROMPTS: Prompt[] = [
  {
    id: "default_1",
    title: "代码优化",
    content: "请帮我优化以下代码，提高性能和可读性：\n\n",
    category: "编程",
  },
  {
    id: "default_2",
    title: "翻译助手",
    content: "请将以下内容翻译成中文，保持专业术语的准确性：\n\n",
    category: "翻译",
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
  { id: "inbox", name: "📥 收件箱", icon: "📥", isDefault: true },
]
