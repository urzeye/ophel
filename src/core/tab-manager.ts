import { type SiteAdapter } from "~adapters/base"
import {
  EVENT_MONITOR_COMPLETE,
  EVENT_MONITOR_INIT,
  EVENT_MONITOR_START,
  EVENT_PRIVACY_TOGGLE,
  MSG_FOCUS_TAB,
  MSG_SHOW_NOTIFICATION,
  sendToBackground,
} from "~utils/messaging"
import { type Settings } from "~utils/storage"
import { showToast } from "~utils/toast"

// 通知声音文件（本地 assets）
const NOTIFICATION_SOUND_PATH = "assets/streaming-complete-v2.mp3"

export class TabManager {
  private adapter: SiteAdapter
  private settings: Settings["tab"]
  private isRunning = false
  private intervalId: NodeJS.Timeout | null = null

  // AI 生成状态（简化的状态机）
  private aiState: "idle" | "generating" | "completed" = "idle"
  private lastAiState: "idle" | "generating" | "completed" = "idle"

  // 用户是否在前台看到过生成完成（用于避免误发通知）
  private userSawCompletion = false

  // 会话名称缓存（避免读取被污染的标题）
  private lastSessionName: string | null = null

  // 通知声音
  private notificationAudio: HTMLAudioElement | null = null

  // 绑定的事件处理函数引用（用于移除）
  private boundHandleMessage: (event: MessageEvent) => void
  private boundVisibilityHandler: () => void
  private boundFocusHandler: () => void
  private boundBlurHandler: () => void

  constructor(adapter: SiteAdapter, settings: Settings["tab"]) {
    this.adapter = adapter
    this.settings = settings

    // 绑定事件处理函数
    this.boundHandleMessage = this.handleMessage.bind(this)
    this.boundVisibilityHandler = this.onVisibilityChange.bind(this)
    this.boundFocusHandler = this.onWindowFocus.bind(this)
    this.boundBlurHandler = this.onWindowBlur.bind(this)

    // Listen to monitor messages from Main World
    window.addEventListener("message", this.boundHandleMessage)

    // 监听页面可见性变化，用于追踪用户是否看到完成状态
    document.addEventListener("visibilitychange", this.boundVisibilityHandler)
    // 补充：监听 window 的 focus/blur 事件，作为 visibilitychange 的备用方案
    // 某些情况下 document.hidden 可能始终返回 false，但 blur/focus 事件仍能正常触发
    window.addEventListener("focus", this.boundFocusHandler)
    window.addEventListener("blur", this.boundBlurHandler)
  }

  updateSettings(settings: Settings["tab"]) {
    const oldInterval = this.settings.renameInterval
    this.settings = settings

    if (this.settings.autoRename && !this.isRunning) {
      this.start()
    } else if (!this.settings.autoRename && this.isRunning) {
      this.stop()
    }

    // 如果检测频率变化且正在运行，更新间隔
    if (this.isRunning && oldInterval !== this.settings.renameInterval) {
      this.setInterval(this.settings.renameInterval || 5)
    }

    // 立即强制更新标签页标题（设置变更应即时生效）
    if (this.isRunning) {
      this.updateTabName(true)
    }
  }

  start() {
    if (!this.settings.autoRename) return
    if (this.isRunning) return

    // 检查适配器是否支持标签页重命名
    if (this.adapter.supportsTabRename && !this.adapter.supportsTabRename()) {
      return
    }

    this.isRunning = true

    this.updateTabName()

    // 定时更新标签页标题（使用可配置的检测频率）
    const intervalMs = (this.settings.renameInterval || 5) * 1000
    this.intervalId = setInterval(() => this.updateTabName(), intervalMs)

    // Init Monitor
    const config = this.adapter.getNetworkMonitorConfig
      ? this.adapter.getNetworkMonitorConfig()
      : null
    if (config) {
      window.postMessage(
        {
          type: EVENT_MONITOR_INIT,
          payload: {
            urlPatterns: config.urlPatterns,
            silenceThreshold: config.silenceThreshold,
          },
        },
        "*",
      )
    }
  }

  stop() {
    if (!this.isRunning) return

    this.isRunning = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /**
   * 销毁管理器，移除所有监听器
   */
  destroy() {
    this.stop()
    window.removeEventListener("message", this.boundHandleMessage)
    document.removeEventListener("visibilitychange", this.boundVisibilityHandler)
    window.removeEventListener("focus", this.boundFocusHandler)
    window.removeEventListener("blur", this.boundBlurHandler)
  }

  /**
   * 更新检测频率
   */
  setInterval(intervalSeconds: number) {
    if (!this.isRunning) return

    const intervalMs = intervalSeconds * 1000
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
    this.intervalId = setInterval(() => this.updateTabName(), intervalMs)
  }

  /**
   * 切换隐私模式
   */
  togglePrivacyMode(): boolean {
    this.settings.privacyMode = !this.settings.privacyMode
    this.updateTabName(true)
    return this.settings.privacyMode
  }

  /**
   * 重置会话名称缓存
   * 用于 SPA 切换会话时清除旧的会话标题
   */
  resetSessionCache() {
    this.lastSessionName = null
  }

  /**
   * 更新标签页标题
   * 设为 public 以支持 SPA 导航切换时外部调用
   */
  updateTabName(force = false) {
    if (!this.isRunning && !force) return

    // 检查适配器是否支持标签页重命名
    if (this.adapter.supportsTabRename && !this.adapter.supportsTabRename()) {
      return
    }

    // 隐私模式
    if (this.settings.privacyMode) {
      const privacyTitle = this.settings.privacyTitle || "Google"
      if (document.title !== privacyTitle) {
        document.title = privacyTitle
      }
      return
    }

    // 获取会话名称（防止读取被污染的 title）
    const sessionName = this.getCleanSessionName()

    // 检查生成状态
    const isGenerating = this.isCurrentlyGenerating()

    // DOM 检测的状态变更通知（用于没有网络监控的站点或后备检测）
    if (
      this.lastAiState === "generating" &&
      !isGenerating &&
      this.isUserAway() &&
      this.aiState !== "completed"
    ) {
      this.sendCompletionNotification()
    }
    this.lastAiState = isGenerating ? "generating" : "idle"

    // 构建标题
    // 开启 showStatus 时：生成中显示 ⏳，其他情况（idle/completed）都显示 ✅
    const statusPrefix = this.settings.showStatus !== false ? (isGenerating ? "⏳ " : "✅ ") : ""

    const siteName = this.adapter.getName()
    const format = this.settings.titleFormat || "{status}{title}"

    // 获取模型名称（如果格式中包含 {model}）
    const modelName = format.includes("{model}") ? this.adapter.getModelName?.() || "" : ""

    let finalTitle = format
      .replace("{status}", statusPrefix)
      .replace("{title}", sessionName || siteName)
      .replace("{model}", modelName ? `[${modelName}] ` : "")
      .replace("{site}", siteName)
      .replace(/\s+/g, " ")
      .trim()

    if (finalTitle && (force || finalTitle !== document.title)) {
      document.title = finalTitle
    }
  }

  /**
   * 获取干净的会话名称（过滤被污染的标题）
   */
  private getCleanSessionName(): string | null {
    // 新对话页面：清除旧会话标题，避免使用之前的标题
    if (this.adapter.isNewConversation?.()) {
      this.lastSessionName = null
      return null
    }

    // 优先使用 getConversationTitle，其次使用 getSessionName
    let sessionName = this.adapter.getConversationTitle?.() || this.adapter.getSessionName?.()

    // 检测污染
    const isPolluted = (name: string | null): boolean => {
      if (!name) return false
      // 被状态图标污染
      if (/^[⏳✅]/.test(name)) return true
      // 被模型名称标记污染
      if (/\[[\w\s.]+\]/.test(name)) return true
      // 被隐私标题污染
      if (name === (this.settings.privacyTitle || "Google")) return true
      return false
    }

    // 如果获取到有效且非污染的标题，更新缓存并返回
    if (sessionName && !isPolluted(sessionName)) {
      this.lastSessionName = sessionName
      return sessionName
    }

    // 否则返回缓存的标题（可能为 null）
    return this.lastSessionName
  }

  /**
   * 获取当前是否正在生成
   */
  private isCurrentlyGenerating(): boolean {
    // 如果已确认完成，返回 false
    if (this.aiState === "completed") return false
    // 否则结合网络状态和 DOM 检测
    return this.aiState === "generating" || (this.adapter.isGenerating?.() ?? false)
  }

  private handleMessage(event: MessageEvent) {
    // 兼容性与安全性平衡：
    // 1. 移除 event.source === window 检查（油猴脚本中 source 可能不一致）
    // 2. 增加 origin 检查，防止跨域 iframe 干扰
    if (event.origin !== window.location.origin) return

    const { type } = event.data || {}

    if (type === EVENT_MONITOR_START) {
      this.lastAiState = this.aiState
      this.aiState = "generating"
      this.updateTabName()
    } else if (type === EVENT_MONITOR_COMPLETE) {
      this.onAiComplete()
    } else if (type === EVENT_PRIVACY_TOGGLE) {
      // 切换隐私模式
      const isPrivacy = this.togglePrivacyMode()
      // 动态导入 toast 显示提示
      setTimeout(() => {
        showToast(isPrivacy ? "隐私模式已开启" : "隐私模式已关闭", 2000)
      }, 0)
    }
  }

  /**
   * 判断用户是否「离开」当前页面
   * 综合使用多种检测方式，因为 document.hidden 在某些情况下可能始终返回 false
   */
  private isUserAway(): boolean {
    // 方式1: document.hidden - 标准的 Page Visibility API
    const hidden = document.hidden
    // 方式2: document.hasFocus() - 检查文档是否获得焦点
    const hasFocus = document.hasFocus()
    // 方式3: document.visibilityState - 更详细的可见性状态
    const notVisible = document.visibilityState !== "visible"

    // 如果任一条件表明用户不在当前页面，则认为用户已离开
    return hidden || !hasFocus || notVisible
  }

  /**
   * 页面可见性变化处理
   * 用于追踪用户是否在前台看到过生成完成
   */
  private onVisibilityChange() {
    const isAway = this.isUserAway()

    // 用户切换回页面时，检查 DOM 状态
    // 如果正在生成但 DOM 显示已完成，说明用户看到了完成状态
    if (this.aiState === "generating" && !isAway) {
      if (this.adapter.isGenerating && !this.adapter.isGenerating()) {
        this.userSawCompletion = true
      }
    }
  }

  /**
   * 窗口获得焦点事件处理
   */
  private onWindowFocus() {
    // 用户回到页面时，检查是否应该标记 userSawCompletion
    if (this.aiState === "generating") {
      if (this.adapter.isGenerating && !this.adapter.isGenerating()) {
        this.userSawCompletion = true
      }
    }
  }

  /**
   * 窗口失去焦点事件处理
   */
  private onWindowBlur() {
    // blur 事件表明用户离开了页面，不需要额外处理
  }

  /**
   * AI 任务完成处理（由 NetworkMonitor 触发）
   */
  private onAiComplete() {
    const wasGenerating = this.aiState === "generating"
    this.lastAiState = this.aiState
    this.aiState = "completed"

    // 检查是否应当发送通知
    // 1. 必须是从生成状态完成
    // 2. 用户没有在前台看到过完成状态
    // 3. 要么在后台，要么开启了「前台时也通知」
    const notifyWhenFocused = this.settings.notifyWhenFocused
    const isAway = this.isUserAway()
    const shouldNotify = wasGenerating && !this.userSawCompletion && (isAway || notifyWhenFocused)

    if (shouldNotify) {
      this.sendCompletionNotification()
    }

    // 重置状态
    this.userSawCompletion = false

    // 强制更新标签页标题
    this.updateTabName(true)
  }

  /**
   * 发送完成通知
   */
  private sendCompletionNotification() {
    // 发送桌面通知
    if (this.settings.showNotification) {
      sendToBackground({
        type: MSG_SHOW_NOTIFICATION,
        title: `✅ ${this.adapter.getName()} 生成完成`,
        body: this.lastSessionName || this.adapter.getConversationTitle?.() || "任务完成",
      }).catch((e) => console.error("[TabManager] 通知发送失败:", e))
    }

    // 播放通知声音（独立于桌面通知）
    if (this.settings.notificationSound) {
      this.playNotificationSound()
    }

    // 自动窗口置顶（通过 background script 使用 chrome.tabs API）
    if (this.settings.autoFocus) {
      sendToBackground({ type: MSG_FOCUS_TAB }).catch(() => {})
    }
  }

  /**
   * 播放通知声音
   * 使用本地 assets 文件
   */
  private playNotificationSound() {
    // 使用 chrome.runtime.getURL 获取本地 assets 路径
    const audioUrl = chrome.runtime.getURL(NOTIFICATION_SOUND_PATH)
    this.playAudioFromUrl(audioUrl)
  }

  /**
   * 从 URL 播放音频
   */
  private playAudioFromUrl(url: string) {
    try {
      if (!this.notificationAudio) {
        this.notificationAudio = new Audio()
      }
      // 使用用户设置的音量，默认 0.5
      const volume = this.settings.notificationVolume ?? 0.5
      this.notificationAudio.volume = Math.max(0.1, Math.min(1.0, volume))
      this.notificationAudio.src = url
      this.notificationAudio.currentTime = 0
      this.notificationAudio.play().catch(() => {}) // 忽略播放失败
    } catch (e) {
      console.error("[TabManager] 音频初始化失败:", e)
    }
  }

  /**
   * 获取当前状态
   */
  isActive(): boolean {
    return this.isRunning
  }
}
