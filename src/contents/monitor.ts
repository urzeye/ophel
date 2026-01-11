import type { PlasmoCSConfig } from "plasmo"

import {
  EVENT_MONITOR_COMPLETE,
  EVENT_MONITOR_INIT,
  EVENT_MONITOR_START,
  type MonitorEventPayload,
} from "~utils/messaging"

export const config: PlasmoCSConfig = {
  world: "MAIN",
}

interface NetworkMonitorOptions {
  urlPatterns?: string[]
  silenceThreshold?: number
  onComplete?: (ctx: any) => void
  onStart?: (ctx: any) => void
  domValidation?: (ctx: any) => boolean
}

class NetworkMonitor {
  private urlPatterns: string[]
  private silenceThreshold: number
  private onComplete: (ctx: any) => void
  private onStart: ((ctx: any) => void) | null
  private domValidation: ((ctx: any) => boolean) | null

  private _activeCount = 0
  private _silenceTimer: any = null
  private _isMonitoring = false
  private _originalFetch: any = null
  private _originalXhrOpen: any = null
  private _originalXhrSend: any = null
  private _lastUrl = ""
  private _hasTriggeredStart = false
  private _boundHookedFetch: any

  constructor(options: NetworkMonitorOptions = {}) {
    this.urlPatterns = options.urlPatterns || []
    this.silenceThreshold = options.silenceThreshold || 3000
    this.onComplete = options.onComplete || (() => {})
    this.onStart = options.onStart || null
    this.domValidation = options.domValidation || null
    this._boundHookedFetch = this._hookedFetch.bind(this)
  }

  start() {
    if (this._isMonitoring) return

    this._originalFetch = window.fetch
    window.fetch = this._boundHookedFetch

    this._hookXHR()
    this._isMonitoring = true
  }

  stop() {
    if (!this._isMonitoring) return

    if (this._originalFetch) {
      window.fetch = this._originalFetch
      this._originalFetch = null
    }

    this._unhookXHR()

    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer)
      this._silenceTimer = null
    }

    this._isMonitoring = false
    this._activeCount = 0
    this._hasTriggeredStart = false
  }

  private _isTargetUrl(url: string | null): boolean {
    if (!url || this.urlPatterns.length === 0) return false
    return this.urlPatterns.some((pattern) => url.includes(pattern))
  }

  private _tryTriggerComplete() {
    if (this._activeCount > 0) return

    const ctx = {
      activeCount: this._activeCount,
      lastUrl: this._lastUrl,
      timestamp: Date.now(),
    }

    if (this.domValidation) {
      try {
        if (!this.domValidation(ctx)) {
          this._silenceTimer = setTimeout(() => this._tryTriggerComplete(), 1000)
          return
        }
      } catch (e) {
        console.error(e)
      }
    }

    this._hasTriggeredStart = false
    try {
      this.onComplete(ctx)
    } catch (e) {
      console.error(e)
    }
  }

  private async _hookedFetch(...args: any[]) {
    const url = args[0] ? args[0].toString() : ""

    if (!this._isTargetUrl(url)) {
      return this._originalFetch.call(window, ...args)
    }

    this._activeCount++
    this._lastUrl = url

    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer)
      this._silenceTimer = null
    }

    if (!this._hasTriggeredStart && this.onStart) {
      this._hasTriggeredStart = true
      try {
        this.onStart({ url, timestamp: Date.now(), type: "fetch" })
      } catch (e) {}
    }

    try {
      const response = await this._originalFetch.call(window, ...args)
      const clone = response.clone()
      this._readStream(clone).catch(() => {})
      return response
    } catch (error) {
      this._decrementAndSchedule()
      throw error
    }
  }

  private async _readStream(response: Response) {
    try {
      if (!response.body) return
      const reader = response.body.getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }
    } catch (err) {
    } finally {
      this._decrementAndSchedule()
    }
  }

  private _decrementAndSchedule() {
    this._activeCount = Math.max(0, this._activeCount - 1)
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer)
    }
    this._silenceTimer = setTimeout(() => this._tryTriggerComplete(), this.silenceThreshold)
  }

  private _hookXHR() {
    const self = this
    this._originalXhrOpen = XMLHttpRequest.prototype.open
    this._originalXhrSend = XMLHttpRequest.prototype.send

    // @ts-ignore
    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
      // @ts-ignore
      this._networkMonitorUrl = url ? url.toString() : ""
      // @ts-ignore
      return self._originalXhrOpen.call(this, method, url, ...rest)
    }

    XMLHttpRequest.prototype.send = function (body: any) {
      // @ts-ignore
      const url = this._networkMonitorUrl || ""

      if (!self._isTargetUrl(url)) {
        return self._originalXhrSend.call(this, body)
      }

      self._activeCount++
      self._lastUrl = url

      if (self._silenceTimer) {
        clearTimeout(self._silenceTimer)
        self._silenceTimer = null
      }

      if (!self._hasTriggeredStart && self.onStart) {
        self._hasTriggeredStart = true
        try {
          self.onStart({ url, timestamp: Date.now(), type: "xhr" })
        } catch (e) {}
      }

      const onComplete = () => {
        self._decrementAndSchedule()
      }

      this.addEventListener("load", onComplete)
      this.addEventListener("error", onComplete)
      this.addEventListener("abort", onComplete)
      this.addEventListener("timeout", onComplete)

      return self._originalXhrSend.call(this, body)
    }
  }

  private _unhookXHR() {
    if (this._originalXhrOpen) {
      XMLHttpRequest.prototype.open = this._originalXhrOpen
      this._originalXhrOpen = null
    }
    if (this._originalXhrSend) {
      XMLHttpRequest.prototype.send = this._originalXhrSend
      this._originalXhrSend = null
    }
  }
}

let monitor: NetworkMonitor | null = null

window.addEventListener("message", (event) => {
  if (event.source !== window) return
  const { type, payload } = event.data || {}

  if (type === EVENT_MONITOR_INIT) {
    if (monitor) monitor.stop()
    monitor = new NetworkMonitor({
      urlPatterns: payload.urlPatterns,
      silenceThreshold: payload.silenceThreshold,
      onStart: (info) => window.postMessage({ type: EVENT_MONITOR_START, payload: info }, "*"),
      onComplete: (info) =>
        window.postMessage({ type: EVENT_MONITOR_COMPLETE, payload: info }, "*"),
    })
    monitor.start()
  }
})
