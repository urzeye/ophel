/**
 * 油猴 adapters vendor 构建中替换 ~core/watermark-remover。
 *
 * WatermarkRemover 依赖静态单例（getActiveInstance），实例由主包
 * modules-init 创建；vendor 内若打包第二份，静态方法会永远返回 null。
 * 这里通过桥接懒解析转发静态访问与构造调用。
 */
import type { WatermarkRemoverClass } from "./types"

const resolveClass = (): WatermarkRemoverClass => {
  const watermarkRemover = window.__OphelAdaptersVendorBridge?.WatermarkRemover
  if (!watermarkRemover) {
    throw new Error("[Ophel] Adapters vendor bridge is not ready: WatermarkRemover")
  }
  return watermarkRemover
}

export const WatermarkRemover = new Proxy(function () {} as unknown as WatermarkRemoverClass, {
  get: (_target, property) => Reflect.get(resolveClass(), property),
  construct: (_target, args: unknown[]) => Reflect.construct(resolveClass(), args),
})
