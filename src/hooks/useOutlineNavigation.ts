import { useCallback, useSyncExternalStore } from "react"

import type { OutlineManager } from "~core/outline-manager"
import { anchorStore } from "~stores/anchor-store"
import {
  canNavigateOutlineContext,
  navigateOutlineContext,
  type OutlineNavigationAction,
} from "~utils/outline-navigation"

export function useOutlineNavigation(manager?: OutlineManager | null) {
  const subscribe = useCallback(
    (listener: () => void) => manager?.subscribe(listener) ?? (() => {}),
    [manager],
  )
  const getContext = useCallback(() => manager?.getNavigationContext() ?? null, [manager])
  const getKey = useCallback(() => getContext()?.key ?? "default", [getContext])
  const key = useSyncExternalStore(subscribe, getKey)
  const getAnchor = useCallback(() => anchorStore.getSnapshot(key), [key])
  const anchorPosition = useSyncExternalStore(anchorStore.subscribe, getAnchor)
  const context = getContext()
  const navigate = useCallback(
    (action: OutlineNavigationAction) => navigateOutlineContext(getContext, action),
    [getContext],
  )

  return {
    isSourceNavigation: context !== null,
    canNavigate: context === null || canNavigateOutlineContext(context),
    anchorPosition,
    navigate,
  }
}
