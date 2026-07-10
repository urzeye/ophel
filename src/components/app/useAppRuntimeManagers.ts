import { useEffect, useMemo, useState } from "react"

import type { SiteAdapter } from "~adapters/base"
import { ConversationManager, type ConversationExportProgress } from "~core/conversation-manager"
import { OutlineManager } from "~core/outline-manager"
import { PromptManager } from "~core/prompt-manager"
import { QueueDispatcher } from "~core/queue-dispatcher"
import type { useSettingsStore } from "~stores/settings-store"
import { DEFAULT_SETTINGS, type Settings } from "~utils/storage"

type UpdateDeepSetting = ReturnType<typeof useSettingsStore.getState>["updateDeepSetting"]

interface UseAppRuntimeManagersOptions {
  adapter: SiteAdapter
  settings: Settings
  updateDeepSetting: UpdateDeepSetting
}

export function useAppRuntimeManagers({
  adapter,
  settings,
  updateDeepSetting,
}: UseAppRuntimeManagersOptions) {
  const promptManager = useMemo(() => new PromptManager(adapter), [adapter])
  const queueDispatcher = useMemo(
    () => new QueueDispatcher(adapter, promptManager),
    [adapter, promptManager],
  )
  const conversationManager = useMemo(() => new ConversationManager(adapter), [adapter])
  const [exportProgress, setExportProgress] = useState<ConversationExportProgress | null>(null)

  const outlineManager = useMemo(() => {
    const handleExpandLevelChange = (level: number) => {
      updateDeepSetting("features", "outline", "expandLevel", level)
    }

    const handleShowUserQueriesChange = (show: boolean) => {
      updateDeepSetting("features", "outline", "showUserQueries", show)
    }

    return new OutlineManager(
      adapter,
      settings.features?.outline ?? DEFAULT_SETTINGS.features.outline,
      handleExpandLevelChange,
      handleShowUserQueriesChange,
    )
    // Managers are scoped to the active adapter. Settings changes use updateSettings below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, updateDeepSetting])

  useEffect(() => {
    const isQueueEnabled = settings.features?.prompts?.promptQueue ?? false
    if (isQueueEnabled) {
      queueDispatcher.start()
    } else {
      queueDispatcher.stop()
    }
    return () => queueDispatcher.stop()
  }, [queueDispatcher, settings.features?.prompts?.promptQueue])

  useEffect(() => {
    setExportProgress(null)
    return conversationManager.onExportProgress(setExportProgress)
  }, [conversationManager])

  return {
    promptManager,
    queueDispatcher,
    conversationManager,
    outlineManager,
    exportProgress,
  }
}
