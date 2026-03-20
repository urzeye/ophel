import {
  EVENT_GEMINI_MYSTUFF_CACHE_SYNC,
  EVENT_GEMINI_MYSTUFF_SYNC_REQUEST,
  type GeminiMyStuffCachePayload,
  type GeminiMyStuffKind,
  type GeminiMyStuffRecord,
  type GeminiMyStuffSyncRequestPayload,
} from "~utils/messaging"

declare const unsafeWindow: Window | undefined

const LOG_PREFIX = "[GeminiMyStuffBridge]"
const PAGE_SIZE = 30
const MAX_PAGES = 80
const MEDIA_REQUEST_TYPE = [1, 1, 1, 0, 0, 0, 1, 0] as const
const DOCUMENT_REQUEST_TYPE = [1, 1, 1, 1, 1, 0, 1, 0] as const
const EXTENSION_HEADERS = {
  "x-same-domain": "1",
  "x-goog-ext-525001261-jspb": "[1,null,null,null,null,null,null,null,[4]]",
  "x-goog-ext-73010989-jspb": "[]",
} as const

interface GeminiMyStuffRuntimeTokens {
  bl: string
  fSid: string
  at: string
  hl: string
}

interface GeminiMyStuffParsedResponse {
  items: GeminiMyStuffRecord[]
  nextPageToken: string | null
}

let initialized = false
const recordCache = new Map<GeminiMyStuffKind, Map<string, GeminiMyStuffRecord>>()
const fetchPromises = new Map<GeminiMyStuffKind, Promise<GeminiMyStuffRecord[]>>()

function getPageWindow(): typeof globalThis {
  if (typeof unsafeWindow !== "undefined" && unsafeWindow !== window) {
    return unsafeWindow as unknown as typeof globalThis
  }

  return window
}

function isGeminiHost(): boolean {
  return window.location.hostname === "gemini.google.com"
}

function isMyStuffPath(pathname = window.location.pathname): boolean {
  const normalizedPath = pathname.replace(/^\/u\/\d+/, "")
  return (
    normalizedPath === "/mystuff" ||
    normalizedPath === "/mystuff/" ||
    normalizedPath.startsWith("/mystuff/")
  )
}

function getRequestType(kind: GeminiMyStuffKind): readonly number[] {
  return kind === "document" ? DOCUMENT_REQUEST_TYPE : MEDIA_REQUEST_TYPE
}

function getRecordKey(record: Pick<GeminiMyStuffRecord, "conversationId" | "responseId">): string {
  return `${record.conversationId}:${record.responseId}`
}

function getCache(kind: GeminiMyStuffKind): Map<string, GeminiMyStuffRecord> {
  let cache = recordCache.get(kind)
  if (!cache) {
    cache = new Map<string, GeminiMyStuffRecord>()
    recordCache.set(kind, cache)
  }
  return cache
}

function isValidBuildLabel(value: unknown): value is string {
  return typeof value === "string" && /^boq_assistant-bard-web-server_/i.test(value)
}

function isValidFSid(value: unknown): value is string {
  return typeof value === "string" && /^\d{10,}$/.test(value)
}

function isValidAt(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]+:\d{13}$/.test(value)
}

function findStringByPattern(
  source: Record<string, unknown>,
  predicate: (value: string) => boolean,
): string | null {
  for (const value of Object.values(source)) {
    if (typeof value === "string" && predicate(value)) {
      return value
    }
  }

  return null
}

function readGlobalDataScript(): string {
  return document.querySelector('script[data-id="_gd"]')?.textContent || ""
}

function extractFromScript(scriptText: string, pattern: RegExp): string | null {
  const match = scriptText.match(pattern)
  return match?.[1] || match?.[0] || null
}

function resolveRuntimeTokens(): GeminiMyStuffRuntimeTokens | null {
  const pageWindow = getPageWindow() as typeof window & {
    WIZ_global_data?: Record<string, unknown>
  }
  const globalData = pageWindow.WIZ_global_data || {}
  const scriptText = readGlobalDataScript()

  const bl =
    (isValidBuildLabel(globalData.cfb2h) ? globalData.cfb2h : null) ||
    findStringByPattern(globalData, isValidBuildLabel) ||
    extractFromScript(scriptText, /"cfb2h":"([^"]+)"/) ||
    extractFromScript(scriptText, /boq_assistant-bard-web-server_[^"]+/)

  const fSid =
    (isValidFSid(globalData.FdrFJe) ? globalData.FdrFJe : null) ||
    findStringByPattern(globalData, isValidFSid) ||
    extractFromScript(scriptText, /"FdrFJe":"([^"]+)"/) ||
    extractFromScript(scriptText, /"\d{10,}"/)?.replace(/"/g, "") ||
    null

  const at =
    (isValidAt(globalData.SNlM0e) ? globalData.SNlM0e : null) ||
    findStringByPattern(globalData, isValidAt) ||
    extractFromScript(scriptText, /"SNlM0e":"([^"]+)"/) ||
    extractFromScript(scriptText, /[A-Za-z0-9._:-]+:\d{13}/) ||
    null

  if (!isValidBuildLabel(bl) || !isValidFSid(fSid) || !isValidAt(at)) {
    console.warn(`${LOG_PREFIX} failed to resolve runtime tokens`, {
      hasGlobalData: Boolean(pageWindow.WIZ_global_data),
      bl,
      fSid,
      at,
    })
    return null
  }

  return {
    bl,
    fSid,
    at,
    hl: document.documentElement.lang || navigator.language || "zh-CN",
  }
}

function buildRequestUrl(tokens: GeminiMyStuffRuntimeTokens): string {
  const requestUrl = new URL("/_/BardChatUi/data/batchexecute", window.location.origin)
  requestUrl.searchParams.set("rpcids", "jGArJ")
  requestUrl.searchParams.set("source-path", "/mystuff")
  requestUrl.searchParams.set("bl", tokens.bl)
  requestUrl.searchParams.set("f.sid", tokens.fSid)
  requestUrl.searchParams.set("hl", tokens.hl)
  requestUrl.searchParams.set("_reqid", String(Date.now() % 1_000_000))
  requestUrl.searchParams.set("rt", "c")
  return requestUrl.toString()
}

function buildRequestBody(
  tokens: GeminiMyStuffRuntimeTokens,
  kind: GeminiMyStuffKind,
  nextPageToken?: string,
): string {
  const body = new URLSearchParams()
  const params = nextPageToken
    ? [getRequestType(kind), PAGE_SIZE, nextPageToken]
    : [getRequestType(kind), PAGE_SIZE]

  body.set("f.req", JSON.stringify([[["jGArJ", JSON.stringify(params), null, "generic"]]]))
  body.set("at", tokens.at)
  return body.toString()
}

function parseRecord(kind: GeminiMyStuffKind, rawItem: unknown): GeminiMyStuffRecord | null {
  if (!Array.isArray(rawItem) || rawItem.length < 3) return null

  const ids = Array.isArray(rawItem[0]) ? rawItem[0] : []
  if (ids.length < 2 || typeof ids[0] !== "string" || typeof ids[1] !== "string") {
    return null
  }

  const timestamps = Array.isArray(rawItem[1]) ? rawItem[1] : []
  const thumbnail = Array.isArray(rawItem[4]) ? rawItem[4] : []

  return {
    kind,
    conversationId: ids[0],
    responseId: ids[1],
    timestamp: typeof timestamps[0] === "number" ? timestamps[0] : 0,
    timestampNano: typeof timestamps[1] === "number" ? timestamps[1] : 0,
    status: typeof rawItem[2] === "number" ? rawItem[2] : 0,
    title: typeof rawItem[3] === "string" && rawItem[3].trim() ? rawItem[3].trim() : undefined,
    thumbnailUrl: typeof thumbnail[1] === "string" && thumbnail[1] ? thumbnail[1] : undefined,
    resourceId: typeof rawItem[5] === "string" && rawItem[5] ? rawItem[5] : undefined,
  }
}

function parseResponse(responseText: string, kind: GeminiMyStuffKind): GeminiMyStuffParsedResponse {
  const normalizedText = responseText.replace(/^\)\]\}'\s*\n\s*\n/, "")
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    throw new Error("mystuff-response-lines-missing")
  }

  const dataLine = JSON.parse(lines[1]) as unknown[]
  const firstItem = Array.isArray(dataLine) ? dataLine[0] : null
  const payloadString =
    Array.isArray(firstItem) && typeof firstItem[2] === "string" ? firstItem[2] : null

  if (!payloadString) {
    throw new Error("mystuff-payload-missing")
  }

  const payload = JSON.parse(payloadString) as [unknown[], string?]
  const rawItems = Array.isArray(payload[0]) ? payload[0] : []

  return {
    items: rawItems
      .map((rawItem) => parseRecord(kind, rawItem))
      .filter((item): item is GeminiMyStuffRecord => item !== null),
    nextPageToken: typeof payload[1] === "string" && payload[1] ? payload[1] : null,
  }
}

async function fetchKind(kind: GeminiMyStuffKind, force: boolean): Promise<GeminiMyStuffRecord[]> {
  const cache = getCache(kind)
  if (!force && cache.size > 0) {
    return Array.from(cache.values())
  }

  const currentPromise = fetchPromises.get(kind)
  if (currentPromise) {
    return currentPromise
  }

  const promise = (async () => {
    const fetched = new Map<string, GeminiMyStuffRecord>()
    let nextPageToken: string | undefined

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const tokens = resolveRuntimeTokens()
      if (!tokens) {
        throw new Error("mystuff-runtime-tokens-missing")
      }

      const response = await getPageWindow().fetch(buildRequestUrl(tokens), {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          ...EXTENSION_HEADERS,
        },
        body: buildRequestBody(tokens, kind, nextPageToken),
      })

      const text = await response.text()
      if (!response.ok) {
        console.warn(`${LOG_PREFIX} fetch failed`, {
          kind,
          page,
          status: response.status,
          preview: text.slice(0, 240),
        })
        throw new Error(`mystuff-fetch-failed:${response.status}`)
      }

      const parsed = parseResponse(text, kind)
      parsed.items.forEach((item) => fetched.set(getRecordKey(item), item))

      console.info(`${LOG_PREFIX} fetched page`, {
        kind,
        page,
        itemCount: parsed.items.length,
        nextPageToken: parsed.nextPageToken,
      })

      if (!parsed.nextPageToken) {
        break
      }

      nextPageToken = parsed.nextPageToken
    }

    cache.clear()
    fetched.forEach((value, key) => cache.set(key, value))
    return Array.from(cache.values())
  })()

  fetchPromises.set(kind, promise)

  try {
    return await promise
  } finally {
    fetchPromises.delete(kind)
  }
}

function normalizeKinds(kinds?: GeminiMyStuffKind[]): GeminiMyStuffKind[] {
  if (!Array.isArray(kinds) || kinds.length === 0) {
    return ["media", "document"]
  }

  return Array.from(
    new Set(
      kinds.filter((kind): kind is GeminiMyStuffKind => kind === "media" || kind === "document"),
    ),
  )
}

function getCachedItems(kinds: GeminiMyStuffKind[]): GeminiMyStuffRecord[] {
  return kinds.flatMap((kind) => Array.from(getCache(kind).values()))
}

function emitCacheSync(payload: GeminiMyStuffCachePayload): void {
  window.postMessage({ type: EVENT_GEMINI_MYSTUFF_CACHE_SYNC, payload }, "*")
  window.dispatchEvent(
    new CustomEvent<GeminiMyStuffCachePayload>(EVENT_GEMINI_MYSTUFF_CACHE_SYNC, {
      detail: payload,
    }),
  )
}

async function handleSyncRequest(
  payload: GeminiMyStuffSyncRequestPayload | undefined,
): Promise<void> {
  if (!payload?.requestId || !isMyStuffPath()) return

  const kinds = normalizeKinds(payload.kinds)
  const shouldSync = payload.force || kinds.some((kind) => getCache(kind).size === 0)

  try {
    if (shouldSync) {
      await Promise.all(kinds.map((kind) => fetchKind(kind, Boolean(payload.force))))
    }

    const items = getCachedItems(kinds)
    emitCacheSync({
      requestId: payload.requestId,
      items,
      kinds,
      reason: shouldSync ? "sync" : "snapshot",
      timestamp: Date.now(),
    })
  } catch (error) {
    console.warn(`${LOG_PREFIX} sync request failed`, {
      requestId: payload.requestId,
      kinds,
      error,
    })
    emitCacheSync({
      requestId: payload.requestId,
      items: getCachedItems(kinds),
      kinds,
      reason: "snapshot",
      timestamp: Date.now(),
    })
  }
}

export function initGeminiMyStuffBridge(): void {
  if (initialized || !isGeminiHost()) return
  initialized = true

  window.addEventListener("message", (event) => {
    if (event.data?.type !== EVENT_GEMINI_MYSTUFF_SYNC_REQUEST) return
    void handleSyncRequest(event.data.payload as GeminiMyStuffSyncRequestPayload | undefined)
  })

  window.addEventListener(EVENT_GEMINI_MYSTUFF_SYNC_REQUEST, (event) => {
    const payload = (event as CustomEvent<GeminiMyStuffSyncRequestPayload>).detail
    void handleSyncRequest(payload)
  })

  console.info(`${LOG_PREFIX} initialized`)
}
