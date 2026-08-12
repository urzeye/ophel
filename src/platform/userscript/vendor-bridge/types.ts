/**
 * 油猴 adapters vendor 与主包之间的桥接类型。
 *
 * adapters vendor（@require 引入）与油猴主包是两个独立 bundle。
 * 适配器代码依赖的少数有状态模块必须由主包持有单例，
 * vendor 通过 window.__OphelAdaptersVendorBridge 懒解析访问，
 * 避免同一模块被打包两份导致状态分裂（store 双 hydration、
 * 静态单例失效、语言状态不一致）。
 */

export type WatermarkRemoverClass = (typeof import("~core/watermark-remover"))["WatermarkRemover"]
export type SettingsStoreHook = (typeof import("~stores/settings-store"))["useSettingsStore"]
export type TranslateFn = (typeof import("~utils/i18n"))["t"]
export type GetCurrentLangFn = (typeof import("~utils/i18n"))["getCurrentLang"]

export interface AdaptersVendorBridge {
  useSettingsStore: SettingsStoreHook
  WatermarkRemover: WatermarkRemoverClass
  t: TranslateFn
  getCurrentLang: GetCurrentLangFn
}

declare global {
  interface Window {
    /** adapters vendor 注册的内置适配器类（顺序即匹配优先级） */
    __OphelBuiltinAdapters?: Array<new () => import("~adapters/base").SiteAdapter>
    /** adapters vendor 的版本握手信息，主包据此拒绝加载错配版本 */
    __OphelAdaptersVendorMeta?: {
      version: string
      schemaVersion: number
    }
    /** 主包发布的有状态模块单例，vendor 侧桥接 shim 懒解析读取 */
    __OphelAdaptersVendorBridge?: AdaptersVendorBridge
  }
}
