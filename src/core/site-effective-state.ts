/**
 * 站点有效状态判定（popup 与选项页共用）。
 *
 * 与运行时适配器解析（getEffectiveAdapter）保持同一规则：
 * 内置站点被用户停用后，已安装的 SitePack 仍可接管同站点。
 */

import type { SupportedAiPlatform } from "~constants/defaults"
import { isBuiltinSiteId } from "~constants/defaults"

export type SiteEffectiveStatus = "unsupported" | "supported" | "via-pack" | "disabled"

export interface SiteEffectiveState {
  status: SiteEffectiveStatus
  /** 当前生效的平台（适配包接管时优先于内置） */
  platform: SupportedAiPlatform | null
  /** 匹配到的内置平台（停用/启用开关的作用对象） */
  builtinPlatform: SupportedAiPlatform | null
}

const matchesUrl = (platform: SupportedAiPlatform, url: string): boolean => {
  try {
    return platform.pattern.test(url)
  } catch {
    return false
  }
}

export const resolveSiteEffectiveState = (
  platforms: readonly SupportedAiPlatform[],
  url: string,
  disabledSites: readonly string[],
): SiteEffectiveState => {
  let pack: SupportedAiPlatform | null = null
  let builtin: SupportedAiPlatform | null = null
  for (const candidate of platforms) {
    if (!matchesUrl(candidate, url)) continue
    if (isBuiltinSiteId(candidate.id)) {
      builtin ??= candidate
    } else {
      pack ??= candidate
    }
  }

  if (builtin && !disabledSites.includes(builtin.id)) {
    // 内置未停用时优先级高于适配包，与 getEffectiveAdapter 一致
    return { status: "supported", platform: builtin, builtinPlatform: builtin }
  }
  if (pack) {
    return {
      status: builtin ? "via-pack" : "supported",
      platform: pack,
      builtinPlatform: builtin,
    }
  }
  if (builtin) {
    return { status: "disabled", platform: builtin, builtinPlatform: builtin }
  }
  return { status: "unsupported", platform: null, builtinPlatform: null }
}

/** 快速访问网格中的内置站点格子是否处于停用态（适配包格子不参与内置开关）。 */
export const isQuickAccessTileDisabled = (
  platform: SupportedAiPlatform,
  disabledSites: readonly string[],
): boolean => isBuiltinSiteId(platform.id) && disabledSites.includes(platform.id)

/**
 * 弹窗站点开关的作用对象。
 *
 * 规则：生效适配器是适配包（含 via-pack 接管）→ 控制该包的启用状态；
 * 无生效适配器但当前 URL 匹配到已停用的已安装适配包 → 控制该包（支持从弹窗
 * 重新启用）；其余情况回落到内置站点开关。内置生效时忽略已停用的适配包，
 * 因为即使启用也会被内置压制，开关没有意义。
 */
export type PopupSiteToggleTarget =
  | { kind: "pack"; platform: SupportedAiPlatform; enabled: boolean }
  | { kind: "builtin"; enabled: boolean }
  | null

export const resolvePopupSiteToggleTarget = (
  state: SiteEffectiveState,
  disabledPackPlatform: SupportedAiPlatform | null,
): PopupSiteToggleTarget => {
  const serving = state.platform
  if (serving && !isBuiltinSiteId(serving.id)) {
    return { kind: "pack", platform: serving, enabled: true }
  }
  if (state.status === "supported") {
    return { kind: "builtin", enabled: true }
  }
  if (disabledPackPlatform) {
    return { kind: "pack", platform: disabledPackPlatform, enabled: false }
  }
  if (state.builtinPlatform && state.status === "disabled") {
    return { kind: "builtin", enabled: false }
  }
  return null
}
