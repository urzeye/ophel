/**
 * Trusted Types 工具函数
 * 用于解决 CSP 限制下的 innerHTML 赋值问题
 */

// 平台检测
declare const __PLATFORM__: "extension" | "userscript" | undefined
const isUserscript = typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"

type TrustedTypesFactoryLike = {
  createPolicy: (
    policyName: string,
    policyRules: Record<string, (value: string) => string>,
  ) => unknown
}

type TrustedTypesHtmlPolicyLike = {
  createHTML: (value: string) => unknown
}

type TrustedTypesScriptUrlPolicyLike = {
  createScriptURL: (value: string) => unknown
}

let htmlPolicy: TrustedTypesHtmlPolicyLike | null = null
let scriptUrlPolicy: TrustedTypesScriptUrlPolicyLike | null = null
let defaultPolicyInitialized = false

function getTrustedTypesFactory(): TrustedTypesFactoryLike | null {
  if (typeof window === "undefined") return null

  const tt = (window as { trustedTypes?: TrustedTypesFactoryLike }).trustedTypes
  return tt?.createPolicy ? tt : null
}

function createPolicyName(sink: "html" | "script-url"): string {
  const suffix = Math.random().toString(36).slice(2, 8)
  const baseName = isUserscript ? "ophel-userscript" : "ophel-extension"
  return `${baseName}-${sink}-${suffix}`
}

/**
 * 初始化 Trusted Types 策略
 */
function initTrustedTypesPolicy(): boolean {
  if (htmlPolicy) return true

  const tt = getTrustedTypesFactory()
  if (!tt) return false

  try {
    htmlPolicy = tt.createPolicy(createPolicyName("html"), {
      createHTML: (s: string) => s,
    }) as TrustedTypesHtmlPolicyLike
    return true
  } catch (e) {
    console.warn("[TrustedTypes] Failed to create Trusted Types policy:", e)
    return false
  }
}

function initTrustedTypesScriptUrlPolicy(): boolean {
  if (scriptUrlPolicy) return true

  const tt = getTrustedTypesFactory()
  if (!tt) return false

  try {
    scriptUrlPolicy = tt.createPolicy(createPolicyName("script-url"), {
      createScriptURL: (s: string) => s,
    }) as TrustedTypesScriptUrlPolicyLike
    return true
  } catch (e) {
    console.warn("[TrustedTypes] Failed to create Trusted Types script URL policy:", e)
    return false
  }
}

function ensureTrustedTypesDefaultPolicy(): boolean {
  if (defaultPolicyInitialized) return true

  const tt = getTrustedTypesFactory()
  if (!tt) return false

  try {
    tt.createPolicy("default", {
      createHTML: (s: string) => s,
      createScript: (s: string) => s,
      createScriptURL: (s: string) => s,
    })
    defaultPolicyInitialized = true
    return true
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (/default/i.test(message) && /already exists/i.test(message)) {
      defaultPolicyInitialized = true
      return true
    }

    console.warn("[TrustedTypes] Failed to create default Trusted Types policy:", e)
    return false
  }
}

/**
 * 创建安全的 HTML 对象 (TrustedHTML)
 * 如果环境支持且初始化成功，返回 TrustedHTML 对象；否则返回原字符串
 */
export function createSafeHTML(html: string): string {
  if (!htmlPolicy) {
    initTrustedTypesPolicy()
  }

  if (htmlPolicy) {
    try {
      return htmlPolicy.createHTML(html) as string
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

/**
 * 创建安全的脚本 URL (TrustedScriptURL)
 * 如果环境支持且初始化成功，返回 TrustedScriptURL 对象；否则返回原字符串
 */
export function createSafeScriptURL(url: string): string {
  if (!scriptUrlPolicy) {
    initTrustedTypesScriptUrlPolicy()
  }

  if (scriptUrlPolicy) {
    try {
      return scriptUrlPolicy.createScriptURL(url) as string
    } catch (e) {
      console.warn("[TrustedTypes] Failed to create safe script URL:", e)
    }
  }

  return url
}

/**
 * 安全地设置 script.src
 */
export function setSafeScriptSrc(element: HTMLScriptElement, src: string): boolean {
  let lastError: unknown = null
  const assignSrc = (value: unknown) => {
    if (!Reflect.set(element, "src", value)) {
      throw new Error("Trusted Types prevented script src assignment")
    }
  }

  try {
    assignSrc(createSafeScriptURL(src))
    return true
  } catch (e) {
    lastError = e
  }

  if (ensureTrustedTypesDefaultPolicy()) {
    try {
      assignSrc(src)
      return true
    } catch (e) {
      lastError = e
    }
  }

  console.warn("[TrustedTypes] Failed to set script src:", lastError)
  return false
}
