/**
 * ChatGPT 长会话渲染性能管理器
 *
 * 负责三个仅作用于 ChatGPT 的性能优化开关：
 * 1. 代码编辑器批量挂载：向主世界补丁（core/chatgpt-cm-batch-mount.ts）下发开关，
 *    补丁本体在扩展端是 MAIN world content script，油猴端经 unsafeWindow 注入。
 * 2. 流式渲染优化：生成回答期间给 <html> 加状态类，暂停消息区域内的动画与过渡，
 *    减少每个 token 触发合成器重绘的开销。生成状态复用适配器的 isGenerating()。
 * 3. 禁用毛玻璃：关闭页面 backdrop-filter，避免长列表滚动时每帧重新合成模糊图层。
 *
 * 样式统一注入主文档 <head>（面板样式走 Shadow DOM，这里优化的是站点本身），
 * 全部通过 <html> 上的类开关控制，可随时整体移除，不留残余样式。
 */

import type { SiteAdapter } from "~adapters/base"
import { CHATGPT_CM_BATCH_MOUNT_TOGGLE_MESSAGE } from "~core/chatgpt-cm-batch-mount"
import type { CoreModule } from "~core/core-module"
import type { ChatGPTSettings } from "~types/settings"

const STYLE_ID = "gh-chatgpt-perf-styles"
const ROOT_CLASS_NO_BLUR = "gh-cgpt-no-blur"
const ROOT_CLASS_STREAMING = "gh-cgpt-streaming"

/** 生成状态检查的最小间隔，避免流式输出期间的高频 DOM 查询 */
const GENERATING_CHECK_INTERVAL_MS = 250
/** 停止生成后延迟移除状态类，覆盖结尾抖动与 UI 收尾 */
const STREAMING_SETTLE_MS = 800

const PERF_CSS = `
html.${ROOT_CLASS_NO_BLUR} *,
html.${ROOT_CLASS_NO_BLUR} *::before,
html.${ROOT_CLASS_NO_BLUR} *::after {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

html.${ROOT_CLASS_STREAMING} [data-message-author-role] * {
  animation: none !important;
  transition: none !important;
}
`

export class ChatGptPerfManager implements CoreModule<ChatGPTSettings> {
  private adapter: SiteAdapter
  private config: ChatGPTSettings
  private observer: MutationObserver | null = null
  private streamingActive = false
  private lastGeneratingCheckAt = 0
  private generatingCheckScheduled = false
  private settleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(adapter: SiteAdapter, config: ChatGPTSettings) {
    this.adapter = adapter
    this.config = config
  }

  start() {
    this.applyRootClasses()
    this.syncBatchMountPatch()
    this.syncStreamingWatch()
  }

  update(config: ChatGPTSettings) {
    const previous = this.config
    this.config = config

    this.applyRootClasses()
    if (previous.codeBlockBatchMount !== config.codeBlockBatchMount) {
      this.syncBatchMountPatch()
    }
    if (previous.streamingRenderOptimize !== config.streamingRenderOptimize) {
      this.syncStreamingWatch()
    }
  }

  stop() {
    this.stopStreamingWatch()
    this.setStreamingClass(false)
    document.documentElement.classList.remove(ROOT_CLASS_NO_BLUR)
    document.getElementById(STYLE_ID)?.remove()
    // 关闭时显式通知主世界补丁，避免遗留暂扣的编辑器节点
    this.postBatchMountToggle(false)
  }

  private isStreamingOptimizeEnabled(): boolean {
    return this.config.streamingRenderOptimize ?? true
  }

  private applyRootClasses() {
    const needStyle =
      this.isStreamingOptimizeEnabled() || (this.config.disableBackdropBlur ?? false)

    if (needStyle && !document.getElementById(STYLE_ID)) {
      const style = document.createElement("style")
      style.id = STYLE_ID
      style.textContent = PERF_CSS
      document.head.appendChild(style)
    } else if (!needStyle) {
      document.getElementById(STYLE_ID)?.remove()
    }

    document.documentElement.classList.toggle(
      ROOT_CLASS_NO_BLUR,
      this.config.disableBackdropBlur ?? false,
    )
  }

  /** 向主世界批量挂载补丁同步开关状态 */
  private syncBatchMountPatch() {
    this.postBatchMountToggle(this.config.codeBlockBatchMount ?? true)
  }

  private postBatchMountToggle(enabled: boolean) {
    window.postMessage({ type: CHATGPT_CM_BATCH_MOUNT_TOGGLE_MESSAGE, enabled }, "*")
  }

  // ==================== 流式渲染优化 ====================

  private syncStreamingWatch() {
    if (this.isStreamingOptimizeEnabled()) {
      this.startStreamingWatch()
    } else {
      this.stopStreamingWatch()
      this.setStreamingClass(false)
    }
  }

  private startStreamingWatch() {
    if (this.observer || !document.body) return
    this.observer = new MutationObserver(() => this.scheduleGeneratingCheck())
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    this.checkGenerating()
  }

  private stopStreamingWatch() {
    this.observer?.disconnect()
    this.observer = null
    this.generatingCheckScheduled = false
    if (this.settleTimer) {
      clearTimeout(this.settleTimer)
      this.settleTimer = null
    }
  }

  /** 节流检查生成状态：流式输出期间 DOM 高频变化，限制查询频率 */
  private scheduleGeneratingCheck() {
    if (this.generatingCheckScheduled) return
    this.generatingCheckScheduled = true

    const elapsed = Date.now() - this.lastGeneratingCheckAt
    const delay = Math.max(0, GENERATING_CHECK_INTERVAL_MS - elapsed)

    setTimeout(() => {
      this.generatingCheckScheduled = false
      // 观察器已停止（如模块关闭）时不再回写状态类
      if (!this.observer) return
      this.checkGenerating()
    }, delay)
  }

  private checkGenerating() {
    this.lastGeneratingCheckAt = Date.now()

    let generating = false
    try {
      generating = this.adapter.isGenerating()
    } catch {
      generating = false
    }

    if (generating) {
      if (this.settleTimer) {
        clearTimeout(this.settleTimer)
        this.settleTimer = null
      }
      this.setStreamingClass(true)
      return
    }

    // 停止按钮消失与输出真正结束之间存在空档，延迟移除状态类
    if (this.streamingActive && !this.settleTimer) {
      this.settleTimer = setTimeout(() => {
        this.settleTimer = null
        this.setStreamingClass(false)
      }, STREAMING_SETTLE_MS)
    }
  }

  private setStreamingClass(active: boolean) {
    if (this.streamingActive === active) return
    this.streamingActive = active
    document.documentElement.classList.toggle(ROOT_CLASS_STREAMING, active)
  }
}
