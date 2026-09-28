/**
 * Google 内部 RPC（alkalimakersuite MakerSuiteService）的认证与端点解析，
 * AI Studio 适配器的会话删除与大纲/导出拉取共用。函数只依赖页面级上下文
 * （cookie / localStorage / performance / 内联配置脚本），isolated world
 * 与 main world 均可执行。
 *
 * 认证模型（见 docs/developer/aistudio-api-outline-plan.md）：
 * cookie（浏览器自动附带）+ authorization: SAPISIDHASH + x-goog-api-key +
 * origin 头。SAPISIDHASH 校验绑定 origin，跨域请求必须由页面上下文发起。
 *
 * 站点存在多个 API key，服务端按 key 粒度封禁方法（403
 * API_KEY_SERVICE_BLOCKED），因此 key 解析返回候选列表，由调用方在
 * 403 时逐个重试，成功后记录可用 key。
 */

export const GOOGLE_MAKER_SUITE_RPC_PATH =
  "/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService"
export const GOOGLE_MAKER_SUITE_RPC_FALLBACK_ORIGIN =
  "https://alkalimakersuite-pa.clients6.google.com"

export function getGoogleCookieValue(name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

async function buildSapisidHashToken(
  value: string,
  origin: string,
  timestamp: number,
): Promise<string | null> {
  try {
    const source = `${timestamp} ${value} ${origin}`
    const hashBuffer = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(source))
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
    return `${timestamp}_${hash}`
  } catch {
    return null
  }
}

/** 构造 authorization 头；三个 SAPISID 系 cookie 有哪个算哪个，都没有返回 null */
export async function buildGoogleAuthorizationHeader(origin: string): Promise<string | null> {
  const timestamp = Math.floor(Date.now() / 1000)
  const sapisid = getGoogleCookieValue("SAPISID")
  const oneP = getGoogleCookieValue("__Secure-1PAPISID")
  const threeP = getGoogleCookieValue("__Secure-3PAPISID")

  const parts: string[] = []

  const primary = sapisid || oneP || threeP
  if (primary) {
    const token = await buildSapisidHashToken(primary, origin, timestamp)
    if (token) parts.push(`SAPISIDHASH ${token}`)
  }

  if (oneP) {
    const token = await buildSapisidHashToken(oneP, origin, timestamp)
    if (token) parts.push(`SAPISID1PHASH ${token}`)
  }

  if (threeP) {
    const token = await buildSapisidHashToken(threeP, origin, timestamp)
    if (token) parts.push(`SAPISID3PHASH ${token}`)
  }

  if (parts.length === 0) return null
  return parts.join(" ")
}

export function isValidGoogleApiKey(value: unknown): value is string {
  return typeof value === "string" && /^AIza[0-9A-Za-z_-]{20,}$/.test(value)
}

/** 实测可用的站点 key，由调用方在请求成功时记录，后续请求优先使用 */
let lastKnownGoodGoogleApiKey: string | null = null

/** localStorage 持久化键：跨页面刷新保留实测可用的 key，避免刷新后首发 403 */
const API_KEY_STORAGE_KEY = "ophel:aistudioRpcApiKey"

export function recordGoogleApiKey(key: string | null): void {
  if (!key || !isValidGoogleApiKey(key)) return
  lastKnownGoodGoogleApiKey = key
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(API_KEY_STORAGE_KEY, key)
    }
  } catch {
    // 存储不可用时仅保留内存缓存
  }
}

const readPersistedApiKey = (): string | null => {
  if (typeof localStorage === "undefined") return null
  try {
    const value = localStorage.getItem(API_KEY_STORAGE_KEY)
    return isValidGoogleApiKey(value) ? value : null
  } catch {
    return null
  }
}

interface WizGlobalScope {
  WIZ_global_data?: Record<string, unknown>
}

// 站点配置中存放 API key 的字段，按优先级排列；其余字段的 AIza 值作为兜底候选
const WIZ_API_KEY_FIELDS = ["WIu0Nc", "SNlM0e"] as const

const API_KEY_SCAN_PATTERN = /AIza[0-9A-Za-z_-]{20,}/g

/** 从站点配置对象（WIZ_global_data 全局变量或内联 JSON 块）按字段优先级收集 key */
const collectConfigApiKeys = (
  config: Record<string, unknown>,
  push: (value: unknown) => void,
): void => {
  for (const field of WIZ_API_KEY_FIELDS) push(config[field])
  for (const value of Object.values(config)) push(value)
}

/**
 * 解析站点公开 API key 候选列表（AIza 开头，非用户凭证），按优先级排列：
 * 上次实测可用值（内存 + localStorage 持久化）→ WIZ_global_data（仅 main world 可见，经参数传入）
 * → 内联 JSON 配置块（<script type="application/json">）→ localStorage →
 * script 纯文本扫描。调用方在 403 时应尝试下一个候选。
 */
export function resolveGoogleApiKeys(pageWindow?: unknown): string[] {
  const keys: string[] = []
  const push = (value: unknown) => {
    if (isValidGoogleApiKey(value) && !keys.includes(value)) keys.push(value)
  }

  push(lastKnownGoodGoogleApiKey)
  push(readPersistedApiKey())

  const scope: WizGlobalScope | undefined =
    (pageWindow as WizGlobalScope | undefined) ??
    (typeof window !== "undefined" ? (window as WizGlobalScope) : undefined)
  if (scope?.WIZ_global_data) {
    collectConfigApiKeys(scope.WIZ_global_data, push)
  }

  let scripts: Element[] = []
  if (typeof document !== "undefined") {
    scripts = Array.from(document.querySelectorAll("script"))
    // 内联 JSON 配置按字段名解析，优先于纯文本扫描（扫描命中顺序不可控）
    for (const script of scripts) {
      if ((script as HTMLScriptElement).type !== "application/json") continue
      try {
        const parsed: unknown = JSON.parse(script.textContent || "")
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          collectConfigApiKeys(parsed as Record<string, unknown>, push)
        }
      } catch {
        // 非 JSON 内容忽略
      }
    }
  }

  if (typeof localStorage !== "undefined") {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      const value = key ? localStorage.getItem(key) : null
      if (!value) continue
      for (const match of value.matchAll(API_KEY_SCAN_PATTERN)) push(match[0])
    }
  }

  for (const script of scripts) {
    const text = script.textContent
    if (!text) continue
    for (const match of text.matchAll(API_KEY_SCAN_PATTERN)) push(match[0])
  }

  return keys
}

/** 返回首个候选 key */
export function resolveGoogleApiKey(pageWindow?: unknown): string | null {
  return resolveGoogleApiKeys(pageWindow)[0] ?? null
}

/** 多账号场景下从 URL 取 authuser 序号，默认 0 */
export function resolveGoogleAuthUser(): string {
  const fromQuery = new URLSearchParams(window.location.search).get("authuser")
  if (fromQuery && /^\d+$/.test(fromQuery)) {
    return fromQuery
  }
  return "0"
}

const isLikelyGoogleRpcHost = (hostname: string): boolean =>
  /(?:^|\.)alkalimakersuite-[a-z0-9-]+\.clients\d+\.google\.com$/i.test(hostname)

const normalizeGoogleRpcOriginFromEndpoint = (endpoint: string): string | null => {
  try {
    const url = new URL(endpoint)
    if (!isLikelyGoogleRpcHost(url.hostname)) return null
    return `${url.protocol}//${url.host}`
  } catch {
    return null
  }
}

/** 上次请求成功的 RPC origin，优先于性能条目再发现（origin 前缀会随部署变化） */
let lastKnownGoodGoogleRpcOrigin: string | null = null

export function recordGoogleRpcOrigin(origin: string | null): void {
  if (origin) lastKnownGoodGoogleRpcOrigin = origin
}

/**
 * 解析候选 RPC origin：上次成功值 → 页面性能条目（站点自身的 $rpc 请求）→ 兜底。
 */
export function resolveGoogleRpcOrigins(): string[] {
  const origins: string[] = []
  if (lastKnownGoodGoogleRpcOrigin) origins.push(lastKnownGoodGoogleRpcOrigin)

  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[]
  for (let index = entries.length - 1; index >= 0; index--) {
    const name = entries[index]?.name
    if (!name || !name.includes(GOOGLE_MAKER_SUITE_RPC_PATH)) continue
    const origin = normalizeGoogleRpcOriginFromEndpoint(name)
    if (origin) origins.push(origin)
  }

  origins.push(GOOGLE_MAKER_SUITE_RPC_FALLBACK_ORIGIN)
  return Array.from(new Set(origins))
}
