/**
 * 油猴 adapters vendor 构建中替换 ~utils/i18n。
 *
 * 油猴版 i18n 的语言与文案缓存保存在主包模块闭包中，
 * vendor 内若打包第二份会退回浏览器默认语言。这里把 t()
 * 转发给主包实例，保证语言切换后适配器文案同步更新。
 */
import type { GetCurrentLangFn, TranslateFn } from "./types"

const resolveBridge = () => {
  const bridge = window.__OphelAdaptersVendorBridge
  if (!bridge) {
    throw new Error("[Ophel] Adapters vendor bridge is not ready: i18n")
  }
  return bridge
}

export const t: TranslateFn = (key, params) => {
  return resolveBridge().t(key, params)
}

export const getCurrentLang: GetCurrentLangFn = () => {
  return resolveBridge().getCurrentLang()
}
