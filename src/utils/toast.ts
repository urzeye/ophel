/**
 * 显示 Toast 提示
 * 从用户脚本迁移的轻量级提示组件
 */
import { INTER_LOCAL_FONT_FACE, getPlatformFontFamily } from "~utils/font"

type ToastOptions = {
  className?: string
  maxWidth?: number
}

const toastCooldowns = new Map<string, number>()
const TOAST_EXIT_DURATION = 160
export const EXPORT_START_TOAST_DURATION = 5000

export function showToast(message: string, duration = 2000, options: ToastOptions = {}) {
  let targetContainer: Node = document.body
  let shadowHost: Element | null = null

  // 遍历所有可能的 shadow host，找到真正挂载了应用容器的那个，优先使用 .gh-root
  const hosts = document.querySelectorAll("plasmo-csui, #ophel-userscript-root")
  for (const host of hosts) {
    if (host.shadowRoot) {
      const container = host.shadowRoot.querySelector(
        ".gh-root, #plasmo-shadow-container, .plasmo-csui-container, #ophel-app-container",
      )
      if (container) {
        targetContainer = container
        shadowHost = host
        break
      }
      // 如果还没渲染具体容器，但有 shadowRoot，退而求其次用 shadowRoot 自己
      targetContainer = host.shadowRoot
      shadowHost = host
    }
  }

  // 使用 targetContainer 所在的根节点作为样式容器
  const rootNode = targetContainer.getRootNode()
  const styleContainer = rootNode instanceof ShadowRoot ? rootNode : document.head

  // 移除所有可能存在的旧 toast (遍历所有 DOM 树)
  const existingInBody = document.getElementById("gh-toast")
  if (existingInBody) existingInBody.remove()
  for (const host of hosts) {
    if (host.shadowRoot) {
      const existingInShadow = host.shadowRoot.querySelector("#gh-toast")
      if (existingInShadow) existingInShadow.remove()
    }
  }

  // 确保样式已注入
  if (!styleContainer.querySelector("#gh-toast-style")) {
    const style = document.createElement("style")
    style.id = "gh-toast-style"
    style.textContent = `
${INTER_LOCAL_FONT_FACE}
      .gh-toast {
        --gh-toast-accent: var(--gh-primary-text, var(--gh-primary, #4285f4));
        position: fixed !important;
        left: 50% !important;
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        box-sizing: border-box !important;
        width: max-content !important;
        max-width: min(calc(100vw - 32px), var(--gh-toast-max-width, 480px)) !important;
        background: color-mix(in srgb, var(--gh-primary, #4285f4) 6%, var(--gh-bg, #ffffff)) !important;
        color: var(--gh-text, #1f2937) !important;
        border: 1px solid color-mix(in srgb, var(--gh-primary, #4285f4) 24%, var(--gh-border, #e5e7eb)) !important;
        padding: 10px 16px !important;
        border-radius: 12px !important;
        font-size: 14px !important;
        font-weight: 500 !important;
        line-height: 20px !important;
        box-shadow:
          var(--gh-shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.1)),
          0 8px 24px color-mix(in srgb, var(--gh-text, #1f2937) 10%, transparent) !important;
        z-index: 2147483646 !important; /* 刚好在一级最高层（禅模式按钮 2147483647）之下 */
        pointer-events: none !important;
        opacity: 0 !important;
        transform: translate(-50%, -8px) scale(0.98) !important;
        transform-origin: center top !important;
        transition: opacity ${TOAST_EXIT_DURATION}ms ease, transform ${TOAST_EXIT_DURATION}ms ease !important;
        font-family: ${getPlatformFontFamily()} !important;
        letter-spacing: normal !important;
      }
      .gh-toast::before {
        content: "";
        flex: 0 0 6px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--gh-toast-accent);
      }
      .gh-toast-message {
        min-width: 0;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        overflow-wrap: anywhere;
        white-space: normal;
      }
      .gh-toast.show {
        opacity: 1 !important;
        transform: translate(-50%, 0) scale(1) !important;
        transition-duration: 240ms !important;
        transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1) !important;
      }
      .gh-toast--outline-nav {
        --gh-toast-max-width: 360px;
        font-weight: 600 !important;
      }
      @media (prefers-reduced-motion: reduce) {
        .gh-toast {
          transition: opacity ${TOAST_EXIT_DURATION}ms ease !important;
          transform: translateX(-50%) !important;
        }
        .gh-toast.show {
          transform: translateX(-50%) !important;
        }
      }
    `
    styleContainer.appendChild(style)
  }

  const toast = document.createElement("div")
  toast.id = "gh-toast"
  toast.className = "gh-toast"
  toast.setAttribute("role", "status")
  toast.setAttribute("aria-atomic", "true")

  // 动态避让：检测禅模式退出按钮是否存在，以决定 top 位置
  const isZenMode = !!(
    document.getElementById("gh-zen-mode-exit-host") ||
    shadowHost?.shadowRoot?.querySelector("#gh-zen-mode-exit-host")
  )
  toast.style.setProperty("top", isZenMode ? "84px" : "32px", "important")

  if (options.className) {
    toast.classList.add(options.className)
  }
  if (options.maxWidth && Number.isFinite(options.maxWidth)) {
    toast.style.setProperty("--gh-toast-max-width", `${options.maxWidth}px`)
  }
  const text = document.createElement("span")
  text.className = "gh-toast-message"
  text.textContent = message
  toast.appendChild(text)

  // 挂载到最高层级容器，如果不存在则使用 body
  targetContainer.appendChild(toast)

  // 留出初始状态的一帧，确保首次挂载也能触发入场过渡。
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add("show")
    })
  })

  setTimeout(() => {
    toast.classList.remove("show")
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast)
      }
    }, TOAST_EXIT_DURATION)
  }, duration)
}

export function showToastThrottled(
  message: string,
  duration = 2000,
  options: ToastOptions = {},
  cooldown = 1500,
  key: string = message,
) {
  const now = Date.now()
  const last = toastCooldowns.get(key) || 0
  if (now - last < cooldown) return
  toastCooldowns.set(key, now)
  showToast(message, duration, options)
}
