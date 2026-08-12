/**
 * 向 adapters vendor 发布主包持有的有状态模块单例。
 *
 * 必须在 initAdapterRegistry() 之前调用；vendor 侧桥接 shim
 * 只在适配器方法执行时懒解析，晚于 @require 执行与主包模块加载。
 */
import { WatermarkRemover } from "~core/watermark-remover"
import { useSettingsStore } from "~stores/settings-store"
import { getCurrentLang, t } from "~utils/i18n"

import type { AdaptersVendorBridge } from "./vendor-bridge/types"

export function publishAdaptersVendorBridge(): void {
  const bridge: AdaptersVendorBridge = {
    useSettingsStore,
    WatermarkRemover,
    t,
    getCurrentLang,
  }
  window.__OphelAdaptersVendorBridge = bridge
}
