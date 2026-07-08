import { useState } from "react"
import type { RefObject } from "react"

import { useGlobalSearchInputState } from "./useGlobalSearchInputState"
import { useGlobalSearchKeyboard } from "./useGlobalSearchKeyboard"
import { useGlobalSearchNavigationState } from "./useGlobalSearchNavigationState"
import { useGlobalSearchPreview } from "./useGlobalSearchPreview"
import { useGlobalSearchShortcutNudge } from "./useGlobalSearchShortcutNudge"

type GlobalSearchKeyboardParams = Parameters<typeof useGlobalSearchKeyboard>[0]

type ControllerManagedKeyboardParam =
  | "isGlobalSettingsSearchOpen"
  | "showGlobalSearchSyntaxHelp"
  | "setShowGlobalSearchSyntaxHelp"
  | "activeGlobalSearchCategory"
  | "setActiveGlobalSearchCategory"
  | "settingsSearchActiveIndex"
  | "setSettingsSearchActiveIndex"
  | "settingsSearchNavigationMode"
  | "setSettingsSearchNavigationMode"
  | "setSettingsSearchHoverLocked"
  | "activeSearchSyntaxSuggestionIndex"
  | "setActiveSearchSyntaxSuggestionIndex"
  | "settingsSearchResultsRef"

export type GlobalSearchControllerKeyboardParams = Omit<
  GlobalSearchKeyboardParams,
  ControllerManagedKeyboardParam
>

interface UseGlobalSearchControllerParams {
  shortcutNudgeText: string
  settingsSearchResultsRef: RefObject<HTMLDivElement>
  promptPreviewPointerDelayMs: number
  promptPreviewHideDelayMs: number
}

export const useGlobalSearchController = ({
  shortcutNudgeText,
  settingsSearchResultsRef,
  promptPreviewPointerDelayMs,
  promptPreviewHideDelayMs,
}: UseGlobalSearchControllerParams) => {
  const [isGlobalSettingsSearchOpen, setIsGlobalSettingsSearchOpen] = useState(false)
  const [showGlobalSearchSyntaxHelp, setShowGlobalSearchSyntaxHelp] = useState(false)
  const [activeSearchSyntaxSuggestionIndex, setActiveSearchSyntaxSuggestionIndex] = useState(-1)

  const shortcutNudge = useGlobalSearchShortcutNudge(shortcutNudgeText)
  const input = useGlobalSearchInputState()
  const navigation = useGlobalSearchNavigationState()
  const preview = useGlobalSearchPreview({
    settingsSearchResultsRef,
    pointerDelayMs: promptPreviewPointerDelayMs,
    hideDelayMs: promptPreviewHideDelayMs,
  })

  return {
    isGlobalSettingsSearchOpen,
    setIsGlobalSettingsSearchOpen,
    showGlobalSearchSyntaxHelp,
    setShowGlobalSearchSyntaxHelp,
    activeSearchSyntaxSuggestionIndex,
    setActiveSearchSyntaxSuggestionIndex,
    settingsSearchResultsRef,
    ...shortcutNudge,
    ...input,
    ...navigation,
    ...preview,
  }
}

export type GlobalSearchController = ReturnType<typeof useGlobalSearchController>

export const useGlobalSearchControllerKeyboard = (
  controller: GlobalSearchController,
  keyboard: GlobalSearchControllerKeyboardParams,
) => {
  useGlobalSearchKeyboard({
    ...keyboard,
    isGlobalSettingsSearchOpen: controller.isGlobalSettingsSearchOpen,
    showGlobalSearchSyntaxHelp: controller.showGlobalSearchSyntaxHelp,
    setShowGlobalSearchSyntaxHelp: controller.setShowGlobalSearchSyntaxHelp,
    activeGlobalSearchCategory: controller.activeGlobalSearchCategory,
    setActiveGlobalSearchCategory: controller.setActiveGlobalSearchCategory,
    settingsSearchActiveIndex: controller.settingsSearchActiveIndex,
    setSettingsSearchActiveIndex: controller.setSettingsSearchActiveIndex,
    settingsSearchNavigationMode: controller.settingsSearchNavigationMode,
    setSettingsSearchNavigationMode: controller.setSettingsSearchNavigationMode,
    setSettingsSearchHoverLocked: controller.setSettingsSearchHoverLocked,
    activeSearchSyntaxSuggestionIndex: controller.activeSearchSyntaxSuggestionIndex,
    setActiveSearchSyntaxSuggestionIndex: controller.setActiveSearchSyntaxSuggestionIndex,
    settingsSearchResultsRef: controller.settingsSearchResultsRef,
  })
}
