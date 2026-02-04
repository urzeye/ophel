/**
 * 显示 Toast 提示
 * 从用户脚本迁移的轻量级提示组件
 */
type ToastOptions = {
  className?: string
  maxWidth?: number
}

const toastCooldowns = new Map<string, number>()

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
        top: 32px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        background: var(--gh-brand-gradient);
        color: white;
        border: none;
        padding: 10px 24px;
        border-radius: 9999px;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        z-index: 2147483647;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-family: 'Google Sans', Roboto, sans-serif;
      }
      .gh-toast.show {
        opacity: 1;
      }
      .gh-toast--outline-nav {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 360px;
      }
    `
    document.head.appendChild(style)
  }

  const toast = document.createElement("div")
  toast.id = "gh-toast"
  toast.className = "gh-toast"
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
