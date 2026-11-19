/**
 * 引导状态注册表 - 纯逻辑层
 *
 * 面板内一次性/低频引导（按钮流光、快捷键提示等）的统一规则与判定。
 * 本模块不依赖平台与 React，便于单测；存储读写见 ./guidance-storage。
 */

/** 单个引导的持久化状态 */
export interface GuidanceEntryState {
  shownCount: number
  lastShownAt: number
  dismissed: boolean
  /** 目标行为已完成次数（如点击导出、使用快捷键） */
  actionCount: number
}

/** 单个引导的展示规则 */
export interface GuidanceRule {
  /** 最多展示次数 */
  maxShows: number
  /** 两次展示的最小间隔（ms） */
  minIntervalMs: number
  /** 目标行为完成多少次后永久停用 */
  autoDismissAfterActions: number
}

/**
 * 全部引导的规则表。新增引导时在此登记 id 与规则，
 * 状态统一持久化在同一个存储键下，按 id 分槽。
 */
export const GUIDANCE_RULES = {
  // 大纲工具栏导出按钮流光：首次点击导出前持续展示
  "export-entry-shimmer": {
    maxShows: Number.POSITIVE_INFINITY,
    minIntervalMs: 0,
    autoDismissAfterActions: 1,
  },
  // 全局搜索快捷键提示
  "global-search-shortcut-nudge": {
    maxShows: 3,
    minIntervalMs: 24 * 60 * 60 * 1000,
    autoDismissAfterActions: 2,
  },
} as const satisfies Record<string, GuidanceRule>

export type GuidanceId = keyof typeof GUIDANCE_RULES

export const DEFAULT_GUIDANCE_ENTRY_STATE: GuidanceEntryState = {
  shownCount: 0,
  lastShownAt: 0,
  dismissed: false,
  actionCount: 0,
}

const toNonNegativeNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0

/** 容忍损坏/异常数据，把任意输入归一化为合法状态 */
export const normalizeGuidanceEntryState = (value: unknown): GuidanceEntryState => {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_GUIDANCE_ENTRY_STATE }
  }
  const raw = value as Partial<Record<keyof GuidanceEntryState, unknown>>
  return {
    shownCount: toNonNegativeNumber(raw.shownCount),
    lastShownAt: toNonNegativeNumber(raw.lastShownAt),
    dismissed: raw.dismissed === true,
    actionCount: toNonNegativeNumber(raw.actionCount),
  }
}

/** 引导是否已终结（手动关闭或目标行为达标） */
export const hasGuidanceCompleted = (state: GuidanceEntryState, rule: GuidanceRule): boolean =>
  state.dismissed || state.actionCount >= rule.autoDismissAfterActions

/** 当前时刻是否应展示该引导 */
export const decideShouldShowGuidance = (
  state: GuidanceEntryState,
  rule: GuidanceRule,
  now: number,
): boolean => {
  if (hasGuidanceCompleted(state, rule)) return false
  if (state.shownCount >= rule.maxShows) return false
  if (state.lastShownAt > 0 && now - state.lastShownAt < rule.minIntervalMs) return false
  return true
}
