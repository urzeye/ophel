/**
 * 引导状态注册表 - 存储层
 *
 * 全部引导状态合存于 GUIDANCE_STORAGE_KEY 一个键下（Record<id, state>），
 * 走 platform.storage：扩展端 chrome.storage.local，油猴端 GM 存储，
 * 保证同一浏览器内跨站点一致（localStorage 按站点隔离，不适用）。
 */

import { GUIDANCE_STORAGE_KEY } from "~constants/storage-keys"
import { platform } from "~platform"

import {
  decideShouldShowGuidance,
  GUIDANCE_RULES,
  normalizeGuidanceEntryState,
  type GuidanceEntryState,
  type GuidanceId,
} from "./guidance"

type GuidanceStoreShape = Partial<Record<GuidanceId, unknown>>

const readGuidanceStore = async (): Promise<GuidanceStoreShape> => {
  const value = await platform.storage.get<GuidanceStoreShape>(GUIDANCE_STORAGE_KEY)
  return value && typeof value === "object" ? value : {}
}

const writeGuidanceEntry = async (
  id: GuidanceId,
  updater: (state: GuidanceEntryState) => GuidanceEntryState,
): Promise<GuidanceEntryState> => {
  const store = await readGuidanceStore()
  const next = updater(normalizeGuidanceEntryState(store[id]))
  await platform.storage.set(GUIDANCE_STORAGE_KEY, { ...store, [id]: next })
  return next
}

export const getGuidanceState = async (id: GuidanceId): Promise<GuidanceEntryState> => {
  const store = await readGuidanceStore()
  return normalizeGuidanceEntryState(store[id])
}

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
  platform.storage.watch<GuidanceStoreShape>(GUIDANCE_STORAGE_KEY, (newValue) => {
    callback(normalizeGuidanceEntryState(newValue?.[id]))
  })
