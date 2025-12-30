import type { SiteAdapter } from "~adapters/base"
import { getLocalData, setLocalData, STORAGE_KEYS, type Prompt } from "~utils/storage"

const DEFAULT_PROMPTS: Prompt[] = [
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

export class PromptManager {
  private prompts: Prompt[] = []
  private adapter: SiteAdapter

  constructor(adapter: SiteAdapter) {
    this.adapter = adapter
  }

  async init() {
    this.prompts = await this.loadPrompts()
  }

  async loadPrompts(): Promise<Prompt[]> {
    const saved = await getLocalData<Prompt[] | null>(STORAGE_KEYS.LOCAL.PROMPTS, null)
    if (!saved) {
      // Initialize with defaults if empty
      await setLocalData(STORAGE_KEYS.LOCAL.PROMPTS, DEFAULT_PROMPTS)
      return [...DEFAULT_PROMPTS]
    }
    return saved
  }

  async savePrompts() {
    await setLocalData(STORAGE_KEYS.LOCAL.PROMPTS, this.prompts)
  }

  getPrompts(): Prompt[] {
    return this.prompts
  }

  async addPrompt(data: Omit<Prompt, "id">): Promise<Prompt> {
    const newPrompt: Prompt = {
      id: "custom_" + Date.now(),
      ...data,
    }
    this.prompts.push(newPrompt)
    await this.savePrompts()
    return newPrompt
  }

  async updatePrompt(id: string, data: Partial<Omit<Prompt, "id">>) {
    const index = this.prompts.findIndex((p) => p.id === id)
    if (index !== -1) {
      this.prompts[index] = { ...this.prompts[index], ...data }
      await this.savePrompts()
    }
  }

  async deletePrompt(id: string) {
    this.prompts = this.prompts.filter((p) => p.id !== id)
    await this.savePrompts()
  }

  getCategories(): string[] {
    const categories = new Set<string>()
    this.prompts.forEach((p) => {
      if (p.category) categories.add(p.category)
    })
    return Array.from(categories)
  }

  async renameCategory(oldName: string, newName: string) {
    let changed = false
    this.prompts.forEach((p) => {
      if (p.category === oldName) {
        p.category = newName
        changed = true
      }
    })
    if (changed) {
      await this.savePrompts()
    }
  }

  async deleteCategory(name: string, defaultCategoryName: string = "未分类") {
    let changed = false
    this.prompts.forEach((p) => {
      if (p.category === name) {
        p.category = defaultCategoryName
        changed = true
      }
    })
    if (changed) {
      await this.savePrompts()
    }
  }

  async updateOrder(newOrderIds: string[]) {
    const ordered: Prompt[] = []
    newOrderIds.forEach((id) => {
      const p = this.prompts.find((x) => x.id === id)
      if (p) ordered.push(p)
    })
    // Append any missing ones (safety)
    this.prompts.forEach((p) => {
      if (!ordered.find((x) => x.id === p.id)) ordered.push(p)
    })

    this.prompts = ordered
    await this.savePrompts()
  }

  async insertPrompt(content: string): Promise<boolean> {
    // 首次尝试插入
    let result = this.adapter.insertPrompt(content)

    // 如果失败，尝试重新查找输入框后再次插入
    if (!result) {
      this.adapter.findTextarea()
      // 短暂延迟后重试
      await new Promise((resolve) => setTimeout(resolve, 100))
      result = this.adapter.insertPrompt(content)
    }

    return result
  }

  filterPrompts(filter: string = "", category: string = "all"): Prompt[] {
    let filtered = this.prompts
    if (category !== "all") {
      filtered = filtered.filter((p) => p.category === category)
    }
    if (filter) {
      const lowerFilter = filter.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(lowerFilter) ||
          p.content.toLowerCase().includes(lowerFilter),
      )
    }
    return filtered
  }
}
