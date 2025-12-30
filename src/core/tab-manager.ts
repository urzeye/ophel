import { type SiteAdapter } from "~adapters/base"
import {
  EVENT_MONITOR_COMPLETE,
  EVENT_MONITOR_INIT,
  EVENT_MONITOR_START,
  MSG_SHOW_NOTIFICATION,
  sendToBackground,
} from "~utils/messaging"
import type { Settings } from "~utils/storage"

export class TabManager {
  private adapter: SiteAdapter
  private settings: Settings["tabSettings"]
  private isRunning = false
  private intervalId: NodeJS.Timeout | null = null

  private aiState: "idle" | "generating" | "completed" = "idle"
  private userSawCompletion = false

  constructor(adapter: SiteAdapter, settings: Settings["tabSettings"]) {
    this.adapter = adapter
    this.settings = settings

    // Listen to monitor messages from Main World
    window.addEventListener("message", this.handleMessage.bind(this))

    document.addEventListener("visibilitychange", this.onVisibilityChange.bind(this))
  }

  updateSettings(settings: Settings["tabSettings"]) {
    this.settings = settings
    if (this.settings.autoRenameTab && !this.isRunning) {
      this.start()
    } else if (!this.settings.autoRenameTab && this.isRunning) {
      this.stop()
    }
  }

  start() {
    if (!this.settings.autoRenameTab) return
    if (this.isRunning) return
    this.isRunning = true

    this.updateTabName()
    this.intervalId = setInterval(() => this.updateTabName(), 5000)

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
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isRunning = false
  }

  private updateTabName(force = false) {
    if (!this.isRunning && !force) return

    if (this.settings.privacyMode) {
      const privacyTitle = this.settings.privacyTitle || "Google"
      if (document.title !== privacyTitle) {
        document.title = privacyTitle
      }
      return
    }

    const conversationTitle = this.adapter.getConversationTitle()
    const siteName = this.adapter.getName()
    const statusIcon = this.settings.showStatus
      ? this.aiState === "generating"
        ? "⏳ "
        : this.aiState === "completed"
          ? "✅ "
          : ""
      : ""

    let newTitle: string | null = conversationTitle

    if (!newTitle) {
      // fallback
      const sessionName = this.adapter.getSessionName()
      if (sessionName && sessionName !== siteName) {
        newTitle = sessionName
      }
    }

    if (newTitle) {
      // Format Title: {status}{title}-{model} (model not fully supported yet in adapter everywhere, defaulting empty)
      let format = this.settings.titleFormat || "{status}{title}"

      // Simple replacements
      format = format.replace("{status}", statusIcon)
      format = format.replace("{title}", newTitle)
      format = format.replace("{model}", "") // TODO: Get Model Name from Adapter
      format = format.replace("{site}", siteName)

      // Clean up if model is empty but format had separator
      // A naive approach: if format ends with separator or looks weird, user can adjust format

      if (document.title !== format) {
        document.title = format
      }
    }
  }

  private handleMessage(event: MessageEvent) {
    if (event.source !== window) return
    const { type, payload } = event.data || {}

    if (type === EVENT_MONITOR_START) {
      this.aiState = "generating"
      this.updateTabName()
    } else if (type === EVENT_MONITOR_COMPLETE) {
      this.onAiComplete()
    }
  }

  private onVisibilityChange() {
    if (this.aiState === "generating" && !document.hidden) {
      // Check if generation actually stopped (via DOM if possible)
      if (this.adapter.isGenerating && !this.adapter.isGenerating()) {
        this.userSawCompletion = true
      }
    }
  }

  private onAiComplete() {
    const wasGenerating = this.aiState === "generating"
    this.aiState = "completed"

    if (wasGenerating && !this.userSawCompletion) {
      if (document.hidden || this.settings.showNotification) {
        this.sendNotification()
      }

      if (this.settings.notificationSound) {
        this.playNotificationSound()
      }

      if (this.settings.autoFocus) {
        window.focus()
      }
    }
    this.userSawCompletion = false
    this.updateTabName(true)
  }

  private playNotificationSound() {
    try {
      const audio = new Audio("https://freesound.org/data/previews/234/234524_4019029-lq.mp3")
      audio.volume = this.settings.notificationVolume || 0.5
      audio.play().catch((e) => console.warn("Audio play failed", e))
    } catch (e) {
      console.error("播放提示音失败", e)
    }
  }

  private sendNotification() {
    if (!this.settings.showNotification) return

    sendToBackground({
      type: MSG_SHOW_NOTIFICATION,
      title: `${this.adapter.getName()} Finished`,
      body: this.adapter.getConversationTitle() || "Task Completed",
    }).catch(() => {})
  }
}
