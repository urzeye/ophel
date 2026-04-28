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
  private isLocking = false
  private persistentMonitorTimer: ReturnType<typeof setInterval> | null = null
  private persistentMutationObserver: MutationObserver | null = null
  private persistentMutationDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private verifyTimer: ReturnType<typeof setInterval> | null = null
  private configDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private startTimers: ReturnType<typeof setTimeout>[] = []
  private lockTimeoutTimer: ReturnType<typeof setTimeout> | null = null
  private relockWatchTimer: ReturnType<typeof setInterval> | null = null
  private relockWatchStopTimer: ReturnType<typeof setTimeout> | null = null
  private relockSequenceId = 0

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
    if (this.adapter.usesPersistentModelLockMonitor()) {
      this.ensurePersistentMonitor()
      this.scheduleCheck(delay)
      return
    }
    if (this.isLocked) return

    // 延迟后开始锁定（初始化时需要延迟等待页面加载，手动触发时可直接执行）
    const timer = setTimeout(() => {
      this.startTimers = this.startTimers.filter((item) => item !== timer)
      if (this.isLocked) return // 再次检查，避免重复锁定
      if (this.isLocking) {
        this.start(260)
        return
      }
      this.runLockAttempt(this.relockSequenceId)
    }, delay)
    this.startTimers.push(timer)
  }

  /**
   * 路由切换后重新锁定
   */
  relock(delay = 80) {
    if (!this.config.enabled || !this.config.keyword) return

    if (this.adapter.usesPersistentModelLockMonitor()) {
      this.stop()
      this.isLocked = false
      this.relockSequenceId += 1
      this.ensurePersistentMonitor()
      this.scheduleCheck(delay)
      return
    }

    // 清理旧的定时器与状态，避免旧页面残留影响新页面
    this.stop()
    this.isLocked = false
    this.relockSequenceId += 1

    // 路由切换后页面的模型标签经常会延迟刷新，分多次快速尝试能更早收敛。
    ;[delay, delay + 250, delay + 700, delay + 1400, delay + 2400].forEach((attemptDelay) => {
      this.start(attemptDelay)
    })
    this.startRelockWatch(this.relockSequenceId, delay + 120)
  }

  private runLockAttempt(sequenceId: number) {
    if (sequenceId !== this.relockSequenceId) return
    if (!this.config.enabled || !this.config.keyword) return
    if (this.isLocked || this.isLocking) return
    if (!this.adapter.isModelLockUiReady()) return
    if (this.adapter.isModelSelectorOpen()) return
    if (this.isCurrentModelTarget()) {
      this.isLocked = true
      return
    }

    this.isLocking = true
    if (this.lockTimeoutTimer) {
      clearTimeout(this.lockTimeoutTimer)
      this.lockTimeoutTimer = null
    }

    this.lockTimeoutTimer = setTimeout(() => {
      this.isLocking = false
      this.lockTimeoutTimer = null
      if (!this.isLocked && sequenceId === this.relockSequenceId) {
        this.start(320)
      }
    }, 1800)

    this.adapter.lockModel(this.config.keyword, () => {
      if (sequenceId !== this.relockSequenceId) return
      this.isLocking = false
      if (this.lockTimeoutTimer) {
        clearTimeout(this.lockTimeoutTimer)
        this.lockTimeoutTimer = null
      }
      // 先立即标记为已锁定，避免在验证窗口内又被持续监测反复触发。
      this.isLocked = true
      // 锁定成功后，启动持续监控（防止页面初始化后又改回默认值）
      this.startVerification()
    })
  }

  private ensurePersistentMonitor() {
    if (this.persistentMonitorTimer && this.persistentMutationObserver) return

    const intervalMs = this.adapter.getModelLockMonitorInterval()
    if (!this.persistentMonitorTimer) {
      this.persistentMonitorTimer = setInterval(() => {
        this.evaluatePersistentMonitor(this.relockSequenceId)
      }, intervalMs)
    }

    if (!this.persistentMutationObserver && typeof MutationObserver !== "undefined") {
      const root = this.adapter.getModelLockMonitorRoot()
      if (root) {
        this.persistentMutationObserver = new MutationObserver(() => {
          if (this.persistentMutationDebounceTimer) {
            clearTimeout(this.persistentMutationDebounceTimer)
          }
          this.persistentMutationDebounceTimer = setTimeout(() => {
            this.persistentMutationDebounceTimer = null
            this.evaluatePersistentMonitor(this.relockSequenceId)
          }, this.adapter.getModelLockMutationDebounce())
        })

        this.persistentMutationObserver.observe(root, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: [
            "aria-label",
            "aria-expanded",
            "aria-checked",
            "aria-selected",
            "data-state",
            "class",
            "style",
          ],
        })
      }
    }
  }

  private scheduleCheck(delay: number) {
    const timer = setTimeout(() => {
      this.startTimers = this.startTimers.filter((item) => item !== timer)
      this.evaluatePersistentMonitor(this.relockSequenceId)
    }, delay)
    this.startTimers.push(timer)
  }

  private evaluatePersistentMonitor(sequenceId: number) {
    if (sequenceId !== this.relockSequenceId) return
    if (!this.config.enabled || !this.config.keyword) return
    if (this.isLocking) return
    if (!this.adapter.isModelLockUiReady()) return
    if (this.adapter.isModelSelectorOpen()) return
    if (this.isCurrentModelTarget()) {
      this.isLocked = true
      return
    }

    this.isLocked = false
    this.runLockAttempt(sequenceId)
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
    const maxVerifyAttempts = 5
    const verifyInterval = 600

    this.verifyTimer = setInterval(() => {
      verifyAttempts++

      if (!this.adapter.isModelLockUiReady()) {
        if (verifyAttempts >= maxVerifyAttempts) {
          this.finishVerification()
        }
        return
      }

      if (this.adapter.isModelSelectorOpen()) {
        if (verifyAttempts >= maxVerifyAttempts) {
          this.finishVerification()
        }
        return
      }

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

      const currentText = this.adapter.getModelLockCheckText(selectorBtn).toLowerCase().trim()
      const target = config.targetModelKeyword.toLowerCase().trim()

      if (!currentText) {
        // 某些站点在菜单关闭后无法稳定读取当前模型，空值视为“未知”而非“已切回”
        if (verifyAttempts >= maxVerifyAttempts) {
          this.finishVerification()
        }
        return
      }

      if (currentText.includes(target)) {
        // 当前是目标模型
        this.isLocked = true
        consecutiveSuccess++
        // 连续 2 次成功，认为已稳定，提前结束
        if (consecutiveSuccess >= 2 || verifyAttempts >= maxVerifyAttempts) {
          this.finishVerification()
        }
      } else {
        // 模型被改回去了
        consecutiveSuccess = 0
        // 只在前 2 次尝试时重新锁定，避免长时间干扰用户
        if (verifyAttempts <= 2 && !this.isLocking) {
          this.finishVerification()
          this.isLocked = false
          this.runLockAttempt(this.relockSequenceId)
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

  private startRelockWatch(sequenceId: number, initialDelay = 0) {
    if (this.relockWatchTimer) {
      clearInterval(this.relockWatchTimer)
      this.relockWatchTimer = null
    }
    if (this.relockWatchStopTimer) {
      clearTimeout(this.relockWatchStopTimer)
      this.relockWatchStopTimer = null
    }

    const startWatcher = () => {
      this.relockWatchTimer = setInterval(() => {
        if (sequenceId !== this.relockSequenceId) {
          this.stopRelockWatch()
          return
        }
        if (!this.config.enabled || !this.config.keyword) {
          this.stopRelockWatch()
          return
        }
        if (this.isCurrentModelTarget()) {
          this.isLocked = true
          this.stopRelockWatch()
          return
        }
        if (!this.isLocking) {
          this.runLockAttempt(sequenceId)
        }
      }, 250)
    }

    if (initialDelay > 0) {
      const starter = setTimeout(() => {
        this.startTimers = this.startTimers.filter((item) => item !== starter)
        if (sequenceId !== this.relockSequenceId) return
        startWatcher()
      }, initialDelay)
      this.startTimers.push(starter)
    } else {
      startWatcher()
    }

    this.relockWatchStopTimer = setTimeout(() => {
      this.stopRelockWatch()
    }, 10000)
  }

  private stopRelockWatch() {
    if (this.relockWatchTimer) {
      clearInterval(this.relockWatchTimer)
      this.relockWatchTimer = null
    }
    if (this.relockWatchStopTimer) {
      clearTimeout(this.relockWatchStopTimer)
      this.relockWatchStopTimer = null
    }
  }

  stop() {
    // 停止防抖定时器
    if (this.configDebounceTimer) {
      clearTimeout(this.configDebounceTimer)
      this.configDebounceTimer = null
    }
    if (this.startTimers.length > 0) {
      this.startTimers.forEach((timer) => clearTimeout(timer))
      this.startTimers = []
    }
    this.stopRelockWatch()
    if (this.persistentMonitorTimer) {
      clearInterval(this.persistentMonitorTimer)
      this.persistentMonitorTimer = null
    }
    if (this.persistentMutationObserver) {
      this.persistentMutationObserver.disconnect()
      this.persistentMutationObserver = null
    }
    if (this.persistentMutationDebounceTimer) {
      clearTimeout(this.persistentMutationDebounceTimer)
      this.persistentMutationDebounceTimer = null
    }
    if (this.lockTimeoutTimer) {
      clearTimeout(this.lockTimeoutTimer)
      this.lockTimeoutTimer = null
    }
    // 停止验证定时器
    if (this.verifyTimer) {
      clearInterval(this.verifyTimer)
      this.verifyTimer = null
    }
    this.isLocking = false
    this.isLocked = true
  }

  private isCurrentModelTarget(): boolean {
    if (!this.adapter.isModelLockUiReady()) return false
    if (this.adapter.isModelSelectorOpen()) return false

    const config = this.adapter.getModelSwitcherConfig(this.config.keyword)
    if (!config) return false

    const selectorBtn = this.adapter.findElementBySelectors(config.selectorButtonSelectors)
    if (!selectorBtn) return false

    const currentText = this.adapter.getModelLockCheckText(selectorBtn).toLowerCase().trim()
    const target = config.targetModelKeyword.toLowerCase().trim()
    return Boolean(currentText) && currentText.includes(target)
  }
}
