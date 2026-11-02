/**
 * 油猴端 AI Studio 模型列表读取（模型锁定设置用）。
 *
 * 独立成模块是为了让 adapters vendor 构建能截断这里对 ~adapters 的
 * 动态导入：vendor 只需要 platform 的存储/网络能力，若把 ~adapters
 * 整树打进 vendor，platform-catalog 等模块的顶层副作用（如
 * getCurrentLang()）会在 @require 阶段触碰尚未发布的桥接对象而抛错。
 */

import { SITE_IDS } from "~constants"
import type { AIStudioModelInfo, AIStudioModelsResponse } from "~utils/messaging"

type AIStudioModelListAdapter = {
  getSiteId(): string
  getModelList(): Promise<AIStudioModelInfo[]>
}

function hasAIStudioModelList(adapter: unknown): adapter is AIStudioModelListAdapter {
  if (!adapter || typeof adapter !== "object") return false

  const candidate = adapter as Partial<AIStudioModelListAdapter>
  return typeof candidate.getSiteId === "function" && typeof candidate.getModelList === "function"
}

/**
 * 油猴无 background 代理：仅在当前页面即 AI Studio 时，
 * 直接通过页面内适配器读取模型列表
 */
export async function getAIStudioModelsFromPage(): Promise<AIStudioModelsResponse> {
  if (window.location.hostname !== "aistudio.google.com") {
    return { success: false, error: "NO_AISTUDIO_TAB" }
  }

  const { getAdapter } = await import("~adapters")
  const adapter = getAdapter()

  if (!hasAIStudioModelList(adapter) || adapter.getSiteId() !== SITE_IDS.AISTUDIO) {
    return { success: false, error: "NOT_AISTUDIO" }
  }

  const models = await adapter.getModelList()
  return { success: true, models }
}
