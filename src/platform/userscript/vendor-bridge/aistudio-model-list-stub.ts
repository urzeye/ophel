/**
 * adapters vendor 构建中替换 ../aistudio-model-list。
 *
 * vendor 内的适配器只会用到 platform 的存储/网络能力，永远不会读取
 * AI Studio 模型列表；截断该动态导入，避免 ~adapters 整树（含
 * platform-catalog 顶层 getCurrentLang() 副作用）被打进 vendor，
 * 在 @require 阶段触碰尚未发布的桥接对象。与 ./remote-config-stub.ts
 * 同一模式。
 */

export function getAIStudioModelsFromPage(): Promise<never> {
  return Promise.reject(
    new Error("[Ophel] AI Studio model list is not available in the adapters vendor bundle"),
  )
}
