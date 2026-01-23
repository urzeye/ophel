import { type SiteAdapter } from "~adapters/base"
import { type GeminiEnterpriseAdapter } from "~adapters/gemini-enterprise"
import { SITE_IDS } from "~constants/defaults"
import { DOMToolkit } from "~utils/dom-toolkit"
import { t } from "~utils/i18n"
import { EVENT_MONITOR_COMPLETE, EVENT_MONITOR_INIT } from "~utils/messaging"
import { type Settings } from "~utils/storage"
import { showToast } from "~utils/toast"

export class PolicyRetryManager {
  private adapter: GeminiEnterpriseAdapter
  private settings: NonNullable<Settings["geminiEnterprise"]>["policyRetry"]
  private retryCounts = new Map<string, number>() // promptHash -> count
  private lastPromptValues = new WeakMap<Element, string>()
  private monitorInitialized = false

  constructor(
    adapter: SiteAdapter,
    settings: NonNullable<Settings["geminiEnterprise"]>["policyRetry"],
  ) {
    this.adapter = adapter as GeminiEnterpriseAdapter
    this.settings = settings
    window.addEventListener("message", this.handleMessage.bind(this))

    // 如果功能已启用，立即初始化网络监控
    if (this.settings.enabled) {
      this.initNetworkMonitor()
    }
  }

  updateSettings(settings: NonNullable<Settings["geminiEnterprise"]>["policyRetry"]) {
    const wasEnabled = this.settings.enabled
    this.settings = settings

    // 如果功能刚被启用，初始化网络监控
    if (!wasEnabled && settings.enabled) {
      this.initNetworkMonitor()
    }
  }

  /**
   * 独立初始化网络监控，不依赖 TabManager
   */
  private initNetworkMonitor(): void {
    if (this.monitorInitialized) return

    const config = this.adapter.getNetworkMonitorConfig?.()
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
      this.monitorInitialized = true
    }
  }

  private handleMessage(event: MessageEvent) {
    // 只有 Gemini Enterprise 才启用
    if (this.adapter.getSiteId() !== SITE_IDS.GEMINI_ENTERPRISE) {
      return
    }

    const message = event.data
    if (message && message.type === EVENT_MONITOR_COMPLETE) {
      if (!this.settings.enabled) {
        return
      }
      this.checkAndRetry()
    }
  }

  private async checkAndRetry() {
    // 延迟一点，确保渲染完成
    await new Promise((resolve) => setTimeout(resolve, 500))

    // 1. 查找 ucs-conversation 的 Shadow Root
    const ucsConv = DOMToolkit.query("ucs-conversation", { shadow: true }) as Element | null
    if (!ucsConv || !ucsConv.shadowRoot) {
      return
    }

    // 2. 查找最新一轮
    // 可能是 .turn.last 或 .turn:last-child
    const root = ucsConv.shadowRoot
    const lastTurn = root.querySelector(".turn.last") || root.querySelector(".turn:last-child")

    if (!lastTurn) {
      return
    }

    // 3. 在最新一轮中查找 banned answer
    const ucsSummary = lastTurn.querySelector("ucs-summary")
    if (!ucsSummary) {
      return
    }

    // 这里我们需要深度查找 ucs-banned-answer
    const banned = this.findBannedAnswer(ucsSummary)
    if (!banned) {
      return
    }

    // 4. 提取上一轮用户问题
    const questionBlock = lastTurn.querySelector(".question-block")
    if (!questionBlock) {
      console.warn("[PolicyRetry] User question block not found")
      return
    }

    const questionText = this.adapter.extractUserQueryText(questionBlock)
    if (!questionText) {
      console.warn("[PolicyRetry] Empty user question")
      return
    }

    // 5. 计算 Hash 并重试
    const hash = await this.sha256(questionText)
    const count = this.retryCounts.get(hash) || 0

    if (count < this.settings.maxRetries) {
      this.retryCounts.set(hash, count + 1)

      const msg = t("policyRetryActive")
        .replace("{current}", (count + 1).toString())
        .replace("{max}", this.settings.maxRetries.toString())
      showToast(msg, 3000)

      await this.performRetry(questionText)
    } else {
      showToast(t("policyRetryLimitReached"), 3000)
      // 不要删除记录，防止用户手动重试时也受阻？
      // 或者我们应该在成功后清除记录吗？
      // 不，因为问题 hash 是一样的。
      // 如果用户稍后还是问这个问题，还是会被拦截，所以限制是合理的。
    }
  }

  private findBannedAnswer(root: Element): Element | null {
    // 递归查找 ucs-banned-answer

    // 1. 检查当前节点
    if (root.tagName.toLowerCase() === "ucs-banned-answer") return root

    // 2. 检查 Shadow Root
    const shadowRoot = root.shadowRoot
    if (shadowRoot) {
      const found = this.findBannedAnswerInNode(shadowRoot)
      if (found) return found
    }

    // 3. 检查子节点 (如果不是 Shadow Host 或者即使是也要查 slot?)
    // 通常只需查 Shadow Root，但为了保险起见...
    return null
  }

  private findBannedAnswerInNode(node: Node): Element | null {
    // 简单的递归查找
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      if (el.tagName.toLowerCase() === "ucs-banned-answer") return el
      if (el.shadowRoot) {
        const found = this.findBannedAnswerInNode(el.shadowRoot)
        if (found) return found
      }
    }

    const children = node.childNodes
    for (let i = 0; i < children.length; i++) {
      const found = this.findBannedAnswerInNode(children[i])
      if (found) return found
    }
    return null
  }

  private async performRetry(text: string) {
    // 1. 填入文本
    // 需要确保清空
    this.adapter.clearTextarea()
    await new Promise((r) => setTimeout(r, 100))

    const inserted = this.adapter.insertPrompt(text)
    if (!inserted) {
      console.error("[PolicyRetry] Failed to insert prompt")
      return
    }

    await new Promise((r) => setTimeout(r, 300))

    // 2. 点击提交
    // 使用 adapter 的 helper 或者自己查找
    const btnSelectors = this.adapter.getSubmitButtonSelectors()
    const submitBtn = DOMToolkit.query(btnSelectors, { shadow: true }) as HTMLElement

    if (submitBtn) {
      submitBtn.click()
    } else {
      // 尝试模拟回车
      const editor = this.adapter.findTextarea()
      if (editor) {
        editor.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }),
        )
        editor.dispatchEvent(
          new KeyboardEvent("keypress", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            bubbles: true,
          }),
        )
        editor.dispatchEvent(
          new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }),
        )
      } else {
        console.error("[PolicyRetry] Submit button and editor not found")
      }
    }
  }

  private async sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message)
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  }
}
