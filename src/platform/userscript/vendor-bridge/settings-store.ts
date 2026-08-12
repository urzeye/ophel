/**
 * 油猴 adapters vendor 构建中替换 ~stores/settings-store。
 *
 * Zustand store 单例由主包持有；vendor 内若再打包一份会出现
 * 独立 hydration 与订阅分裂。这里通过桥接懒解析转发全部访问。
 */
import type { SettingsStoreHook } from "./types"

const resolveStore = (): SettingsStoreHook => {
  const store = window.__OphelAdaptersVendorBridge?.useSettingsStore
  if (!store) {
    throw new Error("[Ophel] Adapters vendor bridge is not ready: useSettingsStore")
  }
  return store
}

export const useSettingsStore = new Proxy((() => undefined) as unknown as SettingsStoreHook, {
  get: (_target, property) => Reflect.get(resolveStore(), property),
  apply: (_target, _thisArg, args: unknown[]) => Reflect.apply(resolveStore(), undefined, args),
})
