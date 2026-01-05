/**
 * 滚动锁定管理器
 *
 * 功能：当功能开启时，阻止页面自动滚动到底部，方便用户阅读上文。
 *
 * 核心策略：
 * 通过主世界脚本（scroll-lock-main.ts）劫持 scrollIntoView、scrollTo 等 API
 * 本管理器通过 postMessage 控制主世界脚本的启用/禁用
 */

import type { SiteAdapter } from "~adapters/base"
import type { Settings } from "~utils/storage"

export class ScrollLockManager {
  private adapter: SiteAdapter
  private settings: Settings
  private enabled = false

  constructor(adapter: SiteAdapter, settings: Settings) {
    this.adapter = adapter
    this.settings = settings
    this.init()
  }

  updateSettings(settings: Settings) {
    const wasEnabled = this.settings.panel?.preventAutoScroll
    this.settings = settings

    // 动态开关支持
    if (!wasEnabled && settings.panel?.preventAutoScroll) {
      this.enable()
    } else if (wasEnabled && !settings.panel?.preventAutoScroll) {
      this.disable()
    }
  }

  private init() {
    if (!this.settings.panel?.preventAutoScroll) {
      return
    }

    this.enable()
  }

  private enable() {
    if (this.enabled) return
    this.enabled = true

    // 通知主世界脚本启用 API 劫持
    this.toggleMainWorldHijack(true)
  }

  private disable() {
    if (!this.enabled) return
    this.enabled = false

    // 通知主世界脚本禁用 API 劫持
    this.toggleMainWorldHijack(false)
  }

  stop() {
    this.disable()
  }

  /**
   * 通过 postMessage 通知主世界脚本启用/禁用 API 劫持
   */
  private toggleMainWorldHijack(enabled: boolean) {
    window.postMessage({ type: "CHAT_HELPER_SCROLL_LOCK_TOGGLE", enabled }, "*")
  }
}
