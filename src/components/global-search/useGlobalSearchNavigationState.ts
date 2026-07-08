import { useState } from "react"

import type { GlobalSearchCategoryId, GlobalSearchResultCategory } from "./types"

export type GlobalSearchNavigationMode = "keyboard" | "pointer"

export const useGlobalSearchNavigationState = () => {
  const [activeGlobalSearchCategory, setActiveGlobalSearchCategory] =
    useState<GlobalSearchCategoryId>("all")
  const [settingsSearchActiveIndex, setSettingsSearchActiveIndex] = useState(0)
  const [settingsSearchHoverLocked, setSettingsSearchHoverLocked] = useState(false)
  const [settingsSearchNavigationMode, setSettingsSearchNavigationMode] =
    useState<GlobalSearchNavigationMode>("pointer")
  const [expandedGlobalSearchCategories, setExpandedGlobalSearchCategories] = useState<
    Partial<Record<GlobalSearchResultCategory, boolean>>
  >({})

  return {
    activeGlobalSearchCategory,
    setActiveGlobalSearchCategory,
    settingsSearchActiveIndex,
    setSettingsSearchActiveIndex,
    settingsSearchHoverLocked,
    setSettingsSearchHoverLocked,
    settingsSearchNavigationMode,
    setSettingsSearchNavigationMode,
    expandedGlobalSearchCategories,
    setExpandedGlobalSearchCategories,
  }
}
