/**
 * Google 内部 RPC（alkalimakersuite MakerSuiteService）的认证与端点解析。
 * AI Studio 适配器的会话删除与大纲接口拉取共用。函数只依赖页面级上下文
 * （document.cookie / localStorage / performance），isolated world 与
 * main world 均可执行；WIZ_global_data 仅 main world 可见，通过参数传入。
 *
 * 认证模型（2026-09 实测，见 docs/developer/aistudio-api-outline-plan.md）：
 * 必传 cookie（浏览器自动附带）+ authorization: SAPISIDHASH + x-goog-api-key +
 * origin 头（SAPISIDHASH 校验绑定 origin，跨域请求必须由页面上下文发起）。
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

let cachedGoogleApiKey: string | null = null

interface WizGlobalScope {
  WIZ_global_data?: Record<string, unknown>
}

/**
 * 解析站点公开 API key（AIza 开头，非用户凭证）：
 * WIZ_global_data（仅 main world 可见，经参数传入）→ localStorage → script 扫描。
 */
export function resolveGoogleApiKey(pageWindow?: unknown): string | null {
  if (cachedGoogleApiKey && isValidGoogleApiKey(cachedGoogleApiKey)) {
    return cachedGoogleApiKey
  }

  const scope: WizGlobalScope | undefined =
    (pageWindow as WizGlobalScope | undefined) ??
    (typeof window !== "undefined" ? (window as WizGlobalScope) : undefined)
  const wizKey = scope?.WIZ_global_data?.SNlM0e
  if (isValidGoogleApiKey(wizKey)) {
    cachedGoogleApiKey = wizKey
    return wizKey
  }

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    const value = localStorage.getItem(key)
    if (!value) continue
    const match = value.match(/AIza[0-9A-Za-z_-]{20,}/)
    if (match) {
      cachedGoogleApiKey = match[0]
      return match[0]
    }
  }

  const scripts = Array.from(document.querySelectorAll("script"))
  for (const script of scripts) {
    const text = script.textContent
    if (!text) continue
    const match = text.match(/AIza[0-9A-Za-z_-]{20,}/)
    if (match) {
      cachedGoogleApiKey = match[0]
      return match[0]
    }
  }

  return null
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
