/**
 * 模型锁定器
 * 自动切换到用户指定的模型
 *
 * 直接使用适配器的 lockModel 方法
 * 增加持续监控机制，防止页面初始化后又将模型改回默认值
 */

import type { SiteAdapter } from "~adapters/base"
import type { Settings } from "~utils/storage"

export class ModelLocker {
  private adapter: SiteAdapter
  private settings: Settings["modelLock"]
  private isLocked = false
  private verifyTimer: ReturnType<typeof setInterval> | null = null

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

    // 延迟 2 秒后开始锁定，让页面自己的初始化逻辑先完成
    // 这样可以避免锁定成功后被页面的默认模型初始化覆盖
    setTimeout(() => {
      if (this.isLocked) return // 再次检查，避免重复锁定

      this.adapter.lockModel(this.settings.keyword, () => {
        // 锁定成功后，启动持续监控（防止页面初始化后又改回默认值）
        this.startVerification()
      })
    }, 1500)
  }

  /**
   * 持续监控：锁定成功后继续检查 3 次（共 4.5 秒）
   * 如果连续 2 次检测到目标模型，提前结束
   * 如果发现模型被改回去，重新尝试锁定
   */
  private startVerification() {
    if (this.verifyTimer) {
      clearInterval(this.verifyTimer)
    }

    let verifyAttempts = 0
    let consecutiveSuccess = 0 // 连续成功计数
    const maxVerifyAttempts = 3
    const verifyInterval = 1500

    this.verifyTimer = setInterval(() => {
      verifyAttempts++

      // 检查当前模型是否仍然是目标模型
      const config = this.adapter.getModelSwitcherConfig(this.settings.keyword)
      if (!config) {
        this.finishVerification()
        return
      }

      const selectorBtn = this.adapter.findElementBySelectors(config.selectorButtonSelectors)
      if (!selectorBtn) {
        this.finishVerification()
        return
      }

      const currentText = (selectorBtn.textContent || "").toLowerCase().trim()
      const target = config.targetModelKeyword.toLowerCase().trim()

      if (currentText.includes(target)) {
        // 当前是目标模型
        consecutiveSuccess++
        // 连续 2 次成功，认为已稳定，提前结束
        if (consecutiveSuccess >= 2 || verifyAttempts >= maxVerifyAttempts) {
          this.finishVerification()
        }
      } else {
        // 模型被改回去了
        consecutiveSuccess = 0
        // 只在前 2 次尝试时重新锁定，避免长时间干扰用户
        if (verifyAttempts <= 2) {
          this.finishVerification()
          // 重新调用 lockModel
          this.adapter.lockModel(this.settings.keyword, () => {
            this.startVerification()
          })
        } else {
          // 超过 2 次还被改，可能是用户手动修改，放弃
          this.finishVerification()
        }
      }
    }, verifyInterval)
  }

  private finishVerification() {
    this.isLocked = true
    if (this.verifyTimer) {
      clearInterval(this.verifyTimer)
      this.verifyTimer = null
    }
  }

  stop() {
    // 停止验证定时器
    if (this.verifyTimer) {
      clearInterval(this.verifyTimer)
      this.verifyTimer = null
    }
    this.isLocked = true
  }
}
