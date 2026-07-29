import { platform } from "~platform"
import { USAGE_MONITOR_STORAGE_KEY } from "~constants/storage-keys"

export { USAGE_MONITOR_STORAGE_KEY } from "~constants/storage-keys"

export interface UsageCounterRecord {
  count: number
  updatedAt: number
  resetAt: number
}

export interface UsageMonitorEvent {
  id: string
  ts: number
  siteId: string
  cid: string
  sessionId: string
  countDelta: number
  requestTokens: number
  roundTripTokens: number
  loadedConversationTokens: number
  loadedOutputTokens: number
}

export interface UsageCounterState {
  version: 2
  records: Record<string, UsageCounterRecord>
  events: UsageMonitorEvent[]
}

export type UsageHistoryGranularity = "hour" | "day" | "month"
export type UsageHistoryMetric =
  | "count"
  | "requestTokens"
  | "roundTripTokens"
  | "loadedConversationTokens"
  | "loadedOutputTokens"

export interface UsageHistoryBucket {
  key: string
  label: string
  startAt: number
  endAt: number
  count: number
  requestTokens: number
  roundTripTokens: number
  loadedConversationTokens: number
  loadedOutputTokens: number
  maxLoadedConversationTokens: number
  maxRequestTokens: number
  maxRoundTripTokens: number
  maxLoadedOutputTokens: number
}

const MAX_EVENT_COUNT = 4000
const MAX_EVENT_AGE_MS = 400 * 24 * 60 * 60 * 1000

const DEFAULT_STATE: UsageCounterState = {
  version: 2,
  records: {},
  events: [],
}

const sanitizeInt = (value: number | undefined, fallback = 0): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : fallback

const normalizeRecord = (record: UsageCounterRecord | undefined): UsageCounterRecord => {
  const now = Date.now()
  if (!record) {
    return { count: 0, updatedAt: now, resetAt: now }
  }

  return {
    count: sanitizeInt(record.count),
    updatedAt: sanitizeInt(record.updatedAt, now),
    resetAt: sanitizeInt(record.resetAt, now),
  }
}

const normalizeEvent = (event: UsageMonitorEvent | undefined): UsageMonitorEvent | null => {
  if (!event || typeof event !== "object") return null

  const ts = sanitizeInt(event.ts, Date.now())
  return {
    id:
      typeof event.id === "string" && event.id
        ? event.id
        : `${ts}-${Math.random().toString(36).slice(2, 8)}`,
    ts,
    siteId: typeof event.siteId === "string" && event.siteId ? event.siteId : "_default",
    cid: typeof event.cid === "string" && event.cid ? event.cid : "default",
    sessionId: typeof event.sessionId === "string" ? event.sessionId : "",
    countDelta: sanitizeInt(event.countDelta, 1) || 1,
    requestTokens: sanitizeInt(event.requestTokens),
    roundTripTokens: sanitizeInt(event.roundTripTokens),
    loadedConversationTokens: sanitizeInt(event.loadedConversationTokens),
    loadedOutputTokens: sanitizeInt(event.loadedOutputTokens),
  }
}

const pruneEvents = (events: UsageMonitorEvent[]): UsageMonitorEvent[] => {
  const now = Date.now()
  return events
    .filter((event) => now - event.ts <= MAX_EVENT_AGE_MS)
    .sort((a, b) => a.ts - b.ts)
    .slice(-MAX_EVENT_COUNT)
}

const normalizeState = (state: UsageCounterState | undefined): UsageCounterState => {
  if (!state || typeof state !== "object") {
    return { ...DEFAULT_STATE }
  }

  const rawEvents = Array.isArray((state as UsageCounterState).events)
    ? (state as UsageCounterState).events
    : []

  return {
    version: 2,
    records: state.records && typeof state.records === "object" ? state.records : {},
    events: pruneEvents(
      rawEvents.map((event) => normalizeEvent(event)).filter(Boolean) as UsageMonitorEvent[],
    ),
  }
}

export const getLocalDayKey = (date = new Date()): string => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

export async function readUsageCounterState(): Promise<UsageCounterState> {
  const stored = await platform.storage.get<UsageCounterState>(USAGE_MONITOR_STORAGE_KEY)
  return normalizeState(stored)
}

export async function writeUsageCounterState(state: UsageCounterState): Promise<void> {
  await platform.storage.set(USAGE_MONITOR_STORAGE_KEY, normalizeState(state))
}

export async function getUsageCounterRecord(recordKey: string): Promise<UsageCounterRecord> {
  const state = await readUsageCounterState()
  const normalized = normalizeRecord(state.records[recordKey])

  if (!state.records[recordKey]) {
    state.records[recordKey] = normalized
    await writeUsageCounterState(state)
  }

  return normalized
}

export async function incrementUsageCounter(recordKey: string): Promise<UsageCounterRecord> {
  const state = await readUsageCounterState()
  const current = normalizeRecord(state.records[recordKey])
  const next: UsageCounterRecord = {
    count: current.count + 1,
    updatedAt: Date.now(),
    resetAt: current.resetAt,
  }

  state.records[recordKey] = next
  await writeUsageCounterState(state)
  return next
}

export async function resetUsageCounter(recordKey: string): Promise<UsageCounterRecord> {
  const next: UsageCounterRecord = {
    count: 0,
    updatedAt: Date.now(),
    resetAt: Date.now(),
  }

  const state = await readUsageCounterState()
  state.records[recordKey] = next
  await writeUsageCounterState(state)
  return next
}

export async function appendUsageEvent(event: UsageMonitorEvent): Promise<void> {
  const normalized = normalizeEvent(event)
  if (!normalized) return

  const state = await readUsageCounterState()
  state.events = pruneEvents([...state.events, normalized])
  await writeUsageCounterState(state)
}

export async function getUsageEvents(filters?: {
  siteId?: string
  cid?: string
}): Promise<UsageMonitorEvent[]> {
  const state = await readUsageCounterState()
  return state.events.filter((event) => {
    if (filters?.siteId && filters.siteId !== "_default" && event.siteId !== filters.siteId) {
      return false
    }
    if (filters?.cid && event.cid !== filters.cid) {
      return false
    }
    return true
  })
}

const startOfHour = (date: Date): Date => {
  const next = new Date(date)
  next.setMinutes(0, 0, 0)
  return next
}

const startOfDay = (date: Date): Date => {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

const startOfMonth = (date: Date): Date => {
  const next = new Date(date)
  next.setDate(1)
  next.setHours(0, 0, 0, 0)
  return next
}

const formatHourLabel = (date: Date): string => `${`${date.getHours()}`.padStart(2, "0")}:00`
const formatDayLabel = (date: Date): string => `${date.getMonth() + 1}/${date.getDate()}`
const formatMonthLabel = (date: Date): string =>
  `${date.getFullYear()}/${`${date.getMonth() + 1}`.padStart(2, "0")}`

export const getUsageMetricValue = (
  bucket: Pick<
    UsageHistoryBucket,
    | "count"
    | "requestTokens"
    | "roundTripTokens"
    | "loadedConversationTokens"
    | "loadedOutputTokens"
  >,
  metric: UsageHistoryMetric,
): number => {
  switch (metric) {
    case "requestTokens":
      return bucket.requestTokens
    case "roundTripTokens":
      return bucket.roundTripTokens
    case "loadedConversationTokens":
      return bucket.loadedConversationTokens
    case "loadedOutputTokens":
      return bucket.loadedOutputTokens
    case "count":
    default:
      return bucket.count
  }
}

export function aggregateUsageEvents(
  events: UsageMonitorEvent[],
  granularity: UsageHistoryGranularity,
  now = new Date(),
): UsageHistoryBucket[] {
  // 图表固定展示一个滚动窗口：
  // - 小时：最近 24 小时
  // - 天：最近 30 天
  // - 月：最近 12 个月
  const bucketCount = granularity === "hour" ? 24 : granularity === "day" ? 30 : 12
  const buckets: UsageHistoryBucket[] = []
  const bucketMap = new Map<string, UsageHistoryBucket>()

  for (let offset = bucketCount - 1; offset >= 0; offset--) {
    const base = new Date(now)
    let start: Date
    let key: string
    let label: string

    if (granularity === "hour") {
      base.setHours(base.getHours() - offset)
      start = startOfHour(base)
      key = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}-${start.getHours()}`
      label = formatHourLabel(start)
    } else if (granularity === "day") {
      base.setDate(base.getDate() - offset)
      start = startOfDay(base)
      key = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`
      label = formatDayLabel(start)
    } else {
      base.setMonth(base.getMonth() - offset)
      start = startOfMonth(base)
      key = `${start.getFullYear()}-${start.getMonth()}`
      label = formatMonthLabel(start)
    }

    const bucket: UsageHistoryBucket = {
      key,
      label,
      startAt: start.getTime(),
      endAt:
        granularity === "hour"
          ? start.getTime() + 60 * 60 * 1000
          : granularity === "day"
            ? start.getTime() + 24 * 60 * 60 * 1000
            : new Date(start.getFullYear(), start.getMonth() + 1, 1).getTime(),
      count: 0,
      requestTokens: 0,
      roundTripTokens: 0,
      loadedConversationTokens: 0,
      loadedOutputTokens: 0,
      maxLoadedConversationTokens: 0,
      maxRequestTokens: 0,
      maxRoundTripTokens: 0,
      maxLoadedOutputTokens: 0,
    }

    buckets.push(bucket)
    bucketMap.set(key, bucket)
  }

  events.forEach((event) => {
    const date = new Date(event.ts)
    const key =
      granularity === "hour"
        ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`
        : granularity === "day"
          ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
          : `${date.getFullYear()}-${date.getMonth()}`

    const bucket = bucketMap.get(key)
    if (!bucket) return
    // 一个时间桶里同时保留总量与最大单次值，供图表 tooltip 展示“总量 + 峰值”。
    bucket.count += event.countDelta
    bucket.requestTokens += event.requestTokens
    bucket.roundTripTokens += event.roundTripTokens
    bucket.loadedConversationTokens += event.loadedConversationTokens
    bucket.loadedOutputTokens += event.loadedOutputTokens
    bucket.maxLoadedConversationTokens = Math.max(
      bucket.maxLoadedConversationTokens,
      event.loadedConversationTokens,
    )
    bucket.maxRequestTokens = Math.max(bucket.maxRequestTokens, event.requestTokens)
    bucket.maxRoundTripTokens = Math.max(bucket.maxRoundTripTokens, event.roundTripTokens)
    bucket.maxLoadedOutputTokens = Math.max(bucket.maxLoadedOutputTokens, event.loadedOutputTokens)
  })

  return buckets
}

export function watchUsageCounterState(
  callback: (newState: UsageCounterState, oldState: UsageCounterState) => void,
): () => void {
  return platform.storage.watch<UsageCounterState>(
    USAGE_MONITOR_STORAGE_KEY,
    (newValue, oldValue) => {
      callback(normalizeState(newValue), normalizeState(oldValue))
    },
  )
}
