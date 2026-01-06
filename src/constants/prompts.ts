/**
 * 提示词模块常量
 */

/**
 * 虚拟分类标识符
 * 使用特殊前缀避免与用户自定义分类冲突
 */
export const VIRTUAL_CATEGORY = {
  /** 全部分类 */
  ALL: "__all__",
  /** 最近使用 */
  RECENT: "__recent__",
} as const

export type VirtualCategoryType = (typeof VIRTUAL_CATEGORY)[keyof typeof VIRTUAL_CATEGORY]
