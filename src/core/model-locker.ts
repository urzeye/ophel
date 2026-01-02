/**
 * 模型锁定器
 * 自动切换到用户指定的模型
 *
 * 直接使用适配器的 lockModel 方法
 */

import type { SiteAdapter } from "~adapters/base"
import type { Settings } from "~utils/storage"

export class ModelLocker {
  private adapter: SiteAdapter
  private settings: Settings["modelLock"]
  private isLocked = false

  constructor(adapter: SiteAdapter, settings: Settings["modelLock"]) {
    this.adapter = adapter
    this.settings = settings
  }

  updateSettings(settings: Settings["modelLock"]) {
    const wasEnabled = this.settings.enabled
    this.settings = settings

    // 动态开关支持：从 false→true 时重置 isLocked 并尝试锁定
    if (!wasEnabled && settings.enabled) {
      this.isLocked = false
      this.start()
    }
  }

  start() {
    if (!this.settings.enabled || !this.settings.keyword) return
    if (this.isLocked) return

    // 直接调用适配器的 lockModel 方法
    this.adapter.lockModel(this.settings.keyword, () => {
      this.isLocked = true
    })
  }

  stop() {
    // 模型锁定是一次性操作，无需清理
    this.isLocked = true
  }
}
