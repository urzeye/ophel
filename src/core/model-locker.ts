/**
 * 模型锁定器
 * 自动切换到用户指定的模型
 *
 * 直接使用适配器的 lockModel 方法
 * 增加持续监控机制，防止页面初始化后又将模型改回默认值
 */

import type { SiteAdapter } from "~adapters/base"

// 单站点的模型锁定配置
export interface ModelLockSiteConfig {
  enabled: boolean
  keyword: string
}

export class ModelLocker {
  private adapter: SiteAdapter
  private config: ModelLockSiteConfig
  private isLocked = false
  private verifyTimer: ReturnType<typeof setInterval> | null = null
  private configDebounceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(adapter: SiteAdapter, config: ModelLockSiteConfig) {
    this.adapter = adapter
    this.config = config
  }

  updateConfig(config: ModelLockSiteConfig) {
    const wasEnabled = this.config.enabled
    const oldKeyword = this.config.keyword
    this.config = config

    // 动态开关支持：从 false→true 或 关键词变化时触发锁定
    const needsLock =
      (!wasEnabled && config.enabled) || (config.enabled && config.keyword !== oldKeyword)

    if (needsLock) {
      // 使用防抖：避免输入过程中频繁触发（例如 React 重渲染导致输入框短暂失焦）
      if (this.configDebounceTimer) {
        clearTimeout(this.configDebounceTimer)
      }
      this.configDebounceTimer = setTimeout(() => {
        this.configDebounceTimer = null
        this.isLocked = false
        this.start(50)
      }, 500) // 500ms 防抖
    }
  }

  start(delay = 1500) {
    if (!this.config.enabled || !this.config.keyword) return
    if (this.isLocked) return

    // 延迟后开始锁定（初始化时需要延迟等待页面加载，手动触发时可直接执行）
    setTimeout(() => {
      if (this.isLocked) return // 再次检查，避免重复锁定

      this.adapter.lockModel(this.config.keyword, () => {
        // 锁定成功后，启动持续监控（防止页面初始化后又改回默认值）
        this.startVerification()
      })
    }, delay)
  }

  /**
   * 路由切换后重新锁定
   */
  relock(delay = 300) {
    if (!this.config.enabled || !this.config.keyword) return

    // 清理旧的定时器与状态，避免旧页面残留影响新页面
    this.stop()
    this.isLocked = false
    this.start(delay)
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
      const config = this.adapter.getModelSwitcherConfig(this.config.keyword)
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
          this.adapter.lockModel(this.config.keyword, () => {
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
    // 停止防抖定时器
    if (this.configDebounceTimer) {
      clearTimeout(this.configDebounceTimer)
      this.configDebounceTimer = null
    }
    // 停止验证定时器
    if (this.verifyTimer) {
      clearInterval(this.verifyTimer)
      this.verifyTimer = null
    }
    this.isLocked = true
  }
}
