/**
 * 油猴 adapters vendor 构建中替换 platform/userscript/remote-config。
 *
 * platform.remoteConfig 的这些方法只有设置 UI 会调用，适配器代码
 * 永远不会触达；vendor 里保留真实实现会把 pack-manager、远程配置
 * 签名校验等整条注册表链路打包进 vendor（且永远不会执行）。
 * 若被意外调用，显式抛错而不是静默失败。
 */

const unavailable = (): never => {
  throw new Error("[Ophel] Remote config is not available in the adapters vendor bundle")
}

export const getUserscriptRemoteConfigState = unavailable
export const checkUserscriptRemoteConfigOnStartup = unavailable
export const checkUserscriptRemoteConfigNow = unavailable
export const resetUserscriptRemotePatch = unavailable
export const installUserscriptLocalRemotePatch = unavailable
export const removeUserscriptLocalRemotePatch = unavailable
export const clearUserscriptRemoteConfigCache = unavailable
