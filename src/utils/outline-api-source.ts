/**
 * 站点 API 数据源大纲的站无关通用机制（DeepSeek 首发，ChatGPT/Claude 同类
 * 能力复用此模块，只实现各自的 payload 解析）：
 * - resolveActiveBranch：沿 parent_id 回溯重新生成场景下的激活分支；
 * - isApiOutlineStale / shouldAttemptApiOutlineFetch：缓存过期判定与拉取闸门
 *   （单飞、生成中跳过、冷却窗口、解析失败熔断）；
 * - mergeByBranchMessageOrder：DOM 条目与接口回填条目按分支序号统一归并。
 *
 * 站点接入契约（详见 docs/developer/architecture.md「API 数据源大纲与导出」）：
 * 1. 解析器把接口响应转换为满足 ApiOutlineSourceData 的数据形态；
 * 2. config traits 声明 virtualOutlineFill，跳转后的即时刷新与高亮重算才会启用；
 * 3. 数据更新后 postMessage EVENT_OUTLINE_DATA_UPDATED 请求大纲刷新；
 * 4. 接口主机（含附件 CDN）需加入 package.json host_permissions。
 */

/** 分支回溯所需的最小消息形态（各站点消息类型结构满足即可复用） */
export interface BranchMessageRef {
  message_id?: unknown
  parent_id?: unknown
}

/** 过期判定所需的最小缓存数据形态；站点大纲数据类型应 extends 此接口 */
export interface ApiOutlineSourceData {
  sessionId: string
  /** 激活分支上的 message_id 顺序 */
  branchMessageIds: number[]
  /** 分支上最大 message_id（和 DOM 挂载行比对判断数据是否过期） */
  maxMessageId: number
}

/**
 * 沿 parent_id 从 current_message_id 回溯激活分支。
 * current_message_id 未收录（分页/删除）或历史为单链时，退化为接口返回顺序；
 * 字段缺失（疑似接口改版）且存在重新生成的旁支时返回 null——无法确定激活
 * 分支，退化为纯 DOM 扫描好过展示混入旁支的错误大纲。
 */
export const resolveActiveBranch = <T extends BranchMessageRef>(
  messages: T[],
  currentMessageId: number | null,
): T[] | null => {
  const byId = new Map<number, T>()
  for (const message of messages) {
    if (typeof message.message_id === "number") {
      byId.set(message.message_id, message)
    }
  }

  if (currentMessageId !== null && byId.has(currentMessageId)) {
    const chain: T[] = []
    const seen = new Set<number>()
    let current: T | undefined = byId.get(currentMessageId)
    while (current && typeof current.message_id === "number" && !seen.has(current.message_id)) {
      seen.add(current.message_id)
      chain.unshift(current)
      current = typeof current.parent_id === "number" ? byId.get(current.parent_id) : undefined
    }
    if (chain.length > 0) return chain
  }

  if (currentMessageId === null) {
    const childCount = new Map<number, number>()
    for (const message of messages) {
      if (typeof message.parent_id !== "number") continue
      const count = (childCount.get(message.parent_id) ?? 0) + 1
      childCount.set(message.parent_id, count)
      if (count > 1) return null
    }
  }

  return messages
}

/** 解析失败连续达到该次数后熔断，等会话切换再重试（大概率站点改版） */
export const API_OUTLINE_PARSE_FAILURE_LIMIT = 3

export interface ApiOutlineStaleCheckInput {
  data: ApiOutlineSourceData | null
  sessionId: string
  /** 当前挂载行的 message_id 集合 */
  mountedIds: ReadonlySet<number>
  /** 滚动容器是否处于底部（尾部删除信号的必要前提） */
  atBottom: boolean
}

/**
 * 接口缓存过期判定（满足任一即需重拉）：
 * 1. 无数据或会话不匹配；
 * 2. 挂载行出现比缓存更大的 message_id（新增消息已入库）；
 * 3. 挂载行 id 不在分支序列中（编辑/重生切换了分支）；
 * 4. 尾部删除复合判定：贴底且挂载行最大 id 小于缓存 maxMessageId。
 *    at-bottom 前提不可省：向上滚动时挂载窗口 max id 天然小于缓存值，
 *    裸比较会在滚动期间反复触发全量重拉。
 */
export function isApiOutlineStale({
  data,
  sessionId,
  mountedIds,
  atBottom,
}: ApiOutlineStaleCheckInput): boolean {
  if (!data || data.sessionId !== sessionId) return true
  if (mountedIds.size === 0) return false

  let maxMountedId = 0
  mountedIds.forEach((id) => {
    maxMountedId = Math.max(maxMountedId, id)
  })
  if (maxMountedId > data.maxMessageId) return true

  const branchIds = new Set(data.branchMessageIds)
  for (const id of mountedIds) {
    if (!branchIds.has(id)) return true
  }

  return atBottom && maxMountedId < data.maxMessageId
}

export interface ApiOutlineFetchGateInput {
  now: number
  /** 任何一次实际发起的拉取都记入该时间戳（含 version 未变的成功重拉），消掉连续重试路径 */
  lastFetchAt: number
  backoffMs: number
  parseFailures: number
  inFlight: boolean
  generating: boolean
  stale: boolean
}

/** 拉取闸门：单飞、生成中跳过、冷却窗口、解析失败熔断 */
export function shouldAttemptApiOutlineFetch({
  now,
  lastFetchAt,
  backoffMs,
  parseFailures,
  inFlight,
  generating,
  stale,
}: ApiOutlineFetchGateInput): boolean {
  if (inFlight || generating || !stale) return false
  if (parseFailures >= API_OUTLINE_PARSE_FAILURE_LIMIT) return false
  return now - lastFetchAt >= backoffMs
}

export interface BranchMergeEntry<T> {
  /** 条目所属消息的 message_id；null 表示未知（生成中的新消息） */
  messageId: number | null
  item: T
}

/**
 * 统一归并：DOM 条目与接口回填条目统一打上 message_id -> 分支序号键，
 * 按分支序号归并。挂载项由调用方保证只出现在 domEntries（DOM 为准），
 * 接口只补未挂载的。未知 id（生成中的新提问/新回复不在 branchMessageIds 里）
 * 按 DOM 相对顺序挂在最近一个已知分支序号之后，重拉后自动归位。
 */
export function mergeByBranchMessageOrder<T>(
  branchMessageIds: readonly number[],
  domEntries: readonly BranchMergeEntry<T>[],
  fillEntries: readonly BranchMergeEntry<T>[],
): T[] {
  const branchIndex = new Map<number, number>()
  branchMessageIds.forEach((id, index) => {
    branchIndex.set(id, index)
  })
  // 同一会话内 message_id 随时间递增，分支最大 id 即「缓存已知的最新一条」
  const maxBranchId =
    branchMessageIds.length > 0 ? branchMessageIds[branchMessageIds.length - 1] : null

  const keyed: { key: number; seq: number; item: T }[] = []
  let lastKnownKey = -1
  let unknownOffset = 0
  let seq = 0

  for (const entry of domEntries) {
    const index = entry.messageId !== null ? branchIndex.get(entry.messageId) : undefined
    if (index !== undefined) {
      lastKnownKey = index
      unknownOffset = 0
      keyed.push({ key: index, seq, item: entry.item })
    } else {
      unknownOffset += 1
      // 刚发送/生成中的新消息还没入库：行 key 是临时值（数值大于分支最大 id）
      // 或行根本不在虚拟列表里（messageId 为 null）。这类条目必须追加到末尾，
      // 否则挂载窗口里没有已知行时会被顶到大纲最前。
      // 其余未知 id（删除残留/旁支行）按 DOM 相对顺序贴在最近已知序号之后
      // （数量级只有一两条，小步偏移不会越过下一个已知序号）
      const isNewTail =
        entry.messageId === null || (maxBranchId !== null && entry.messageId > maxBranchId)
      const key = isNewTail
        ? branchMessageIds.length + unknownOffset * 0.01
        : lastKnownKey + unknownOffset * 0.01
      keyed.push({ key, seq, item: entry.item })
    }
    seq += 1
  }

  for (const entry of fillEntries) {
    const index = entry.messageId !== null ? branchIndex.get(entry.messageId) : undefined
    if (index === undefined) continue
    keyed.push({ key: index, seq, item: entry.item })
    seq += 1
  }

  return keyed.sort((a, b) => a.key - b.key || a.seq - b.seq).map((entry) => entry.item)
}
