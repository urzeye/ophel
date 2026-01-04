/**
 * 默认值常量
 */

import type { Prompt } from "~utils/storage"

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

// ==================== 默认 WebDAV 配置 ====================
export interface WebDAVConfig {
  url: string
  username: string
  password: string
  remotePath: string
}

export const DEFAULT_WEBDAV_CONFIG: WebDAVConfig = {
  url: "",
  username: "",
  password: "",
  remotePath: "/ophel/backup.json",
}
