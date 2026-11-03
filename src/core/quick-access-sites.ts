import type { SupportedAiPlatform } from "~constants/defaults"

export interface QuickAccessSite {
  key: string
  platform: SupportedAiPlatform
  /** 可打开的入口地址；未绑定任何域名的适配包为空数组。 */
  urls: string[]
}

const originOf = (url: string): string => {
  try {
    return new URL(url).origin
  } catch {
    return ""
  }
}

export const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * 快捷入口按平台聚合：一个平台只占一个格子，多入口平台的候选地址收进 urls，
 * 由 popup 提供入口切换菜单；一个域名都没绑定时保留一个无地址条目用于引导绑定。
 * 同一地址只保留给最先注册的平台，避免共享 detect 池的多个包给出指向同一站点的重复入口。
 */
export const buildQuickAccessSites = (
  platforms: readonly SupportedAiPlatform[],
): QuickAccessSite[] => {
  const seenUrls = new Set<string>()
  const sites: QuickAccessSite[] = []

  for (const platform of platforms) {
    if (platform.entryUrls.length === 0) {
      sites.push({ key: platform.id, platform, urls: [] })
      continue
    }

    const urls = platform.entryUrls.filter((url) => !seenUrls.has(url))
    if (urls.length === 0) continue
    for (const url of urls) {
      seenUrls.add(url)
    }
    sites.push({ key: platform.id, platform, urls })
  }

  return sites
}

/** 多入口平台的打开目标：记住的选择仍有效时优先，否则退回首个入口。 */
export const resolveQuickAccessUrl = (
  site: QuickAccessSite,
  lastUrls: Record<string, string>,
): string | undefined => {
  const remembered = lastUrls[site.platform.id]
  if (remembered && site.urls.includes(remembered)) return remembered
  return site.urls[0]
}

/**
 * 应用用户自定义顺序：被记录的项按记录序在前，未记录的项保持传入顺序追加在后
 * （新上线站点、新装的包自动排到末尾）。传入列表按当前平台目录给出，
 * 记录里已失效的 ID 不参与排序，天然被忽略。
 */
export const orderByQuickAccessOrder = <T>(
  items: readonly T[],
  order: readonly string[],
  getId: (item: T) => string,
): T[] => {
  if (order.length === 0) return [...items]
  const rank = new Map(order.map((id, index) => [id, index]))
  // sort 稳定：未记录的项之间保持传入的目录顺序
  return [...items].sort((a, b) => {
    const rankA = rank.get(getId(a))
    const rankB = rank.get(getId(b))
    if (rankA === undefined) return rankB === undefined ? 0 : 1
    if (rankB === undefined) return -1
    return rankA - rankB
  })
}

/**
 * 拖拽落盘：visibleIds 为当前列表实际展示的项（popup 网格会隐藏停用站点、
 * 适配中心内置站点 Tab 不展示适配包）。在应用自定义顺序后的完整顺序上，
 * 隐藏项占据的槽位保持不动，可见项的槽位按拖拽后的新相对顺序重新填充，
 * 返回新的完整排序数组供持久化。
 */
export const moveQuickAccessItem = (params: {
  catalogIds: readonly string[]
  order: readonly string[]
  visibleIds: readonly string[]
  draggedId: string
  targetId: string
  position: "before" | "after"
}): string[] => {
  const { catalogIds, order, visibleIds, draggedId, targetId, position } = params
  const visibleSet = new Set(visibleIds)
  const fullOrder = orderByQuickAccessOrder(catalogIds, order, (id) => id)
  const visibleOrder = fullOrder.filter((id) => visibleSet.has(id))

  const fromIndex = visibleOrder.indexOf(draggedId)
  if (fromIndex < 0 || draggedId === targetId || !visibleOrder.includes(targetId)) {
    return fullOrder
  }
  const nextVisible = visibleOrder.filter((id) => id !== draggedId)
  let insertIndex = nextVisible.indexOf(targetId)
  if (position === "after") insertIndex += 1
  nextVisible.splice(insertIndex, 0, draggedId)

  const queue = [...nextVisible]
  return fullOrder.map((id) => (visibleSet.has(id) ? (queue.shift() as string) : id))
}

/** 当前标签页所在的入口地址优先，其次是平台首个入口，最后退回当前 origin。 */
export const resolveSiteEntryUrl = (platform: SupportedAiPlatform, currentUrl: string): string => {
  const currentOrigin = originOf(currentUrl)
  const matchingEntry = platform.entryUrls.find((entry) => originOf(entry) === currentOrigin)
  return matchingEntry ?? platform.entryUrls[0] ?? currentOrigin
}
