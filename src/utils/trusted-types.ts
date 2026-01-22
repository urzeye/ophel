/**
 * Trusted Types 工具函数
 * 用于解决 CSP 限制下的 innerHTML 赋值问题
 */

// 平台检测
declare const __PLATFORM__: "extension" | "userscript" | undefined
const isUserscript = typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"

// Trusted Types 策略缓存
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let htmlPolicy: any = null

/**
 * 初始化 Trusted Types 策略
 */
function initTrustedTypesPolicy(): boolean {
  if (htmlPolicy) return true
  if (typeof window === "undefined") return false

  const tt = (window as any).trustedTypes
  if (tt?.createPolicy) {
    try {
      // 使用唯一的策略名称，避免冲突
      // 添加随机后缀以防止在某些环境下（如 Userscript 重复执行）策略名冲突导致创建失败
      const suffix = Math.random().toString(36).slice(2, 8)
      const baseName = isUserscript ? "ophel-userscript-html" : "ophel-extension-html"
      const policyName = `${baseName}-${suffix}`

      htmlPolicy = tt.createPolicy(policyName, {
        createHTML: (s: string) => s,
      })
      return true
    } catch (e) {
      console.warn("[TrustedTypes] Failed to create Trusted Types policy:", e)
      return false
    }
  }
  return false
}

/**
 * 创建安全的 HTML 对象 (TrustedHTML)
 * 如果环境支持且初始化成功，返回 TrustedHTML 对象；否则返回原字符串
 */
export function createSafeHTML(html: string): any {
  if (!htmlPolicy) {
    initTrustedTypesPolicy()
  }

  if (htmlPolicy) {
    try {
      return htmlPolicy.createHTML(html)
    } catch (e) {
      console.warn("[TrustedTypes] Failed to create safe HTML:", e)
    }
  }
  return html
}

/**
 * 安全地设置 innerHTML
 */
export function setSafeHTML(element: HTMLElement, html: string): boolean {
  try {
    const safeHtml = createSafeHTML(html)
    element.innerHTML = safeHtml
    return true
  } catch (e) {
    console.warn("[TrustedTypes] Failed to set innerHTML:", e)
    return false
  }
}
