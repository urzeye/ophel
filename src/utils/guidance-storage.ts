/**
 * 引导状态注册表 - 存储层
 *
 * 每个引导一个独立存储键（ophel:guidance:<id>），走 platform.storage：
 * 扩展端 chrome.storage.local，油猴端 GM 存储，保证同一浏览器内跨站点一致
 * （localStorage 按站点隔离，不适用）。
 *
 * chrome.storage / GM 均不提供原子的读-改-写。按键隔离后，不同引导的写入
 * 物理上互不覆盖；同一引导在多个标签页并发写时以后写为准，但注册表各操作
 * 幂等（置位类重复写结果相同，计数类允许低估），不会跨引导丢失状态。
 */

import { platform } from "~platform"

import {
  decideShouldShowGuidance,
  GUIDANCE_RULES,
  guidanceStorageKey,
  normalizeGuidanceEntryState,
  type GuidanceEntryState,
  type GuidanceId,
} from "./guidance"

const writeGuidanceEntry = async (
  id: GuidanceId,
  updater: (state: GuidanceEntryState) => GuidanceEntryState,
): Promise<GuidanceEntryState> => {
  const key = guidanceStorageKey(id)
  const next = updater(normalizeGuidanceEntryState(await platform.storage.get(key)))
  await platform.storage.set(key, next)
  return next
}

export const getGuidanceState = async (id: GuidanceId): Promise<GuidanceEntryState> =>
  normalizeGuidanceEntryState(await platform.storage.get(guidanceStorageKey(id)))

export const shouldShowGuidance = async (id: GuidanceId): Promise<boolean> => {
  const state = await getGuidanceState(id)
  return decideShouldShowGuidance(state, GUIDANCE_RULES[id], Date.now())
}

export const markGuidanceShown = (id: GuidanceId): Promise<GuidanceEntryState> =>
  writeGuidanceEntry(id, (state) => ({
    ...state,
    shownCount: state.shownCount + 1,
    lastShownAt: Date.now(),
  }))

export const dismissGuidance = (id: GuidanceId): Promise<GuidanceEntryState> =>
  writeGuidanceEntry(id, (state) => ({ ...state, dismissed: true }))

/** 目标行为完成一次；达到规则阈值后自动永久停用 */
export const markGuidanceAction = (id: GuidanceId): Promise<GuidanceEntryState> =>
  writeGuidanceEntry(id, (state) => {
    const actionCount = state.actionCount + 1
    return {
      ...state,
      actionCount,
      dismissed: state.dismissed || actionCount >= GUIDANCE_RULES[id].autoDismissAfterActions,
    }
  })

/** 订阅单个引导的状态变化；初始值需另行 getGuidanceState 读取 */
export const watchGuidanceState = (
  id: GuidanceId,
  callback: (state: GuidanceEntryState) => void,
): (() => void) =>
  platform.storage.watch(guidanceStorageKey(id), (newValue) => {
    callback(normalizeGuidanceEntryState(newValue))
  })
