/**
 * 显示 Toast 提示
 * 从用户脚本迁移的轻量级提示组件
 */
type ToastOptions = {
  className?: string
  maxWidth?: number
}

const toastCooldowns = new Map<string, number>()
export const EXPORT_START_TOAST_DURATION = 5000

export function showToast(message: string, duration = 2000, options: ToastOptions = {}) {
  // 移除现有的 toast
  const existing = document.getElementById("gh-toast")
  if (existing) {
    existing.remove()
  }

  // 确保样式已注入
  if (!document.getElementById("gh-toast-style")) {
    const style = document.createElement("style")
    style.id = "gh-toast-style"
    style.textContent = `
      .gh-toast {
        position: fixed !important;
        left: 50% !important;
        background: var(--gh-glass-bg, rgba(255, 255, 255, 0.6)) !important;
        color: var(--gh-text, #1f2937) !important;
        border: 1px solid var(--gh-border, rgba(255, 255, 255, 0.15)) !important;
        padding: 12px 24px !important;
        border-radius: 9999px !important;
        font-size: 14px !important;
        font-weight: 500 !important;
        box-shadow: 
          var(--gh-shadow-lg, 0 10px 30px rgba(0, 0, 0, 0.1)),
          0 0 0 1px inset rgba(255, 255, 255, 0.1) !important;
        z-index: 2147483646 !important; /* 刚好在一级最高层（禅模式按钮 2147483647）之下 */
        pointer-events: none !important;
        opacity: 0 !important;
        transform: translateY(-16px) translateX(-50%) scale(0.96) !important;
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", "PingFang SC", "Microsoft YaHei", sans-serif !important;
        letter-spacing: 0.2px !important;
        backdrop-filter: blur(24px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
      }
      .gh-toast.show {
        opacity: 1 !important;
        transform: translateY(0) translateX(-50%) scale(1) !important;
      }
      .gh-toast--outline-nav {
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        max-width: 360px !important;
      }
    `
    document.head.appendChild(style)
  }

  const toast = document.createElement("div")
  toast.id = "gh-toast"
  toast.className = "gh-toast"

  // 动态避让：检测禅模式退出按钮是否存在，以决定 top 位置
  const isZenMode = !!document.getElementById("gh-zen-mode-exit-host")
  toast.style.setProperty("top", isZenMode ? "84px" : "32px", "important")

  if (options.className) {
    toast.classList.add(options.className)
  }
  if (options.maxWidth && Number.isFinite(options.maxWidth)) {
    toast.style.maxWidth = `${options.maxWidth}px`
  }
  toast.textContent = message

  document.body.appendChild(toast)

  // 触发重绘以应用过渡效果
  requestAnimationFrame(() => {
    toast.classList.add("show")
  })

  setTimeout(() => {
    toast.classList.remove("show")
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast)
      }
    }, 300)
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
