/**
 * 模型锁定器
 * 自动切换到用户指定的模型
 */

import type { SiteAdapter } from "~adapters/base"
import type { Settings } from "~utils/storage"

export class ModelLocker {
  private adapter: SiteAdapter
  private settings: Settings["modelLock"]
  private checkInterval: NodeJS.Timeout | null = null
  private isLocked = false

  constructor(adapter: SiteAdapter, settings: Settings["modelLock"]) {
    this.adapter = adapter
    this.settings = settings
  }

  updateSettings(settings: Settings["modelLock"]) {
    this.settings = settings
    if (!settings.enabled) {
      this.stop()
    }
  }

  start() {
    if (!this.settings.enabled || !this.settings.keyword) return
    if (this.isLocked) return

    // 立即尝试一次
    this.tryLock()

    // 定时检查（处理页面动态加载模型选择器的情况）
    this.checkInterval = setInterval(() => {
      if (!this.isLocked) {
        this.tryLock()
      }
    }, 2000)

    // 最多尝试 30 秒后停止
    setTimeout(() => {
      if (this.checkInterval) {
        clearInterval(this.checkInterval)
        this.checkInterval = null
      }
    }, 30000)
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  private tryLock() {
    const keyword = this.settings.keyword.toLowerCase().trim()
    if (!keyword) return

    // 使用 adapter 的方法获取模型选择器 (如果存在)
    const getModelSelector = (this.adapter as any).getModelSelector
    const modelSelector = getModelSelector?.call(this.adapter)
    if (!modelSelector) return

    // 尝试查找匹配的模型选项
    const options = modelSelector.querySelectorAll('button, [role="option"], [role="menuitem"]')

    for (const option of options) {
      const text = (option as HTMLElement).textContent?.toLowerCase() || ""
      if (text.includes(keyword)) {
        // 找到匹配的模型，点击选择
        ;(option as HTMLElement).click()
        this.isLocked = true
        console.log(`[Chat Helper] Model locked to: ${text}`)
        this.stop()
        return
      }
    }
  }
}
