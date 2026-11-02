/**
 * 页面级 URL 变化单例广播器（支持 SPA 导航，分发 EVENT_PAGE_URL_CHANGE 事件）
 *
 * 独立成模块：ui-entry（面板 UI）只需要这个广播器，从 modules-init
 * 引入会连带打包全部核心管理器与适配器注册表。每个 bundle 各自持有
 * 一份模块实例，跨 bundle 的去重依赖 window 事件本身。
 */

import { EVENT_PAGE_URL_CHANGE } from "~utils/messaging"

let globalUrlChangeBroadcasterStarted = false
let broadcasterRefCount = 0
let broadcasterCleanup: (() => void) | null = null

/**
 * 启动页面级 URL 变化单例广播器（支持 SPA 导航，分发 EVENT_PAGE_URL_CHANGE 事件）
 */
export function startPageUrlChangeBroadcaster(): () => void {
  broadcasterRefCount++
  if (globalUrlChangeBroadcasterStarted && broadcasterCleanup) {
    return () => {
      broadcasterRefCount--
      if (broadcasterRefCount <= 0) {
        broadcasterCleanup?.()
        broadcasterCleanup = null
        globalUrlChangeBroadcasterStarted = false
        broadcasterRefCount = 0
      }
    }
  }

  globalUrlChangeBroadcasterStarted = true
  let lastHref = window.location.href

  const broadcastUrlChange = () => {
    const currentHref = window.location.href
    if (currentHref === lastHref) return

    const previousHref = lastHref
    lastHref = currentHref

    window.dispatchEvent(
      new CustomEvent(EVENT_PAGE_URL_CHANGE, {
        detail: {
          href: currentHref,
          previousHref,
        },
      }),
    )
  }

  window.addEventListener("popstate", broadcastUrlChange)
  window.addEventListener("hashchange", broadcastUrlChange)

  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState
  const patchedPushState = function (this: History, ...args: Parameters<History["pushState"]>) {
    originalPushState.apply(this, args)
    broadcastUrlChange()
  }
  const patchedReplaceState = function (
    this: History,
    ...args: Parameters<History["replaceState"]>
  ) {
    originalReplaceState.apply(this, args)
    broadcastUrlChange()
  }
  history.pushState = patchedPushState
  history.replaceState = patchedReplaceState

  const intervalId = window.setInterval(broadcastUrlChange, 1000)

  broadcasterCleanup = () => {
    window.removeEventListener("popstate", broadcastUrlChange)
    window.removeEventListener("hashchange", broadcastUrlChange)
    window.clearInterval(intervalId)

    if (history.pushState === patchedPushState) {
      history.pushState = originalPushState
    }
    if (history.replaceState === patchedReplaceState) {
      history.replaceState = originalReplaceState
    }
  }

  return () => {
    broadcasterRefCount--
    if (broadcasterRefCount <= 0) {
      broadcasterCleanup?.()
      broadcasterCleanup = null
      globalUrlChangeBroadcasterStarted = false
      broadcasterRefCount = 0
    }
  }
}
