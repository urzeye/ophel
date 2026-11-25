import React, { useSyncExternalStore } from "react"

import type { ConversationManager } from "~core/conversation-manager"
import { t } from "~utils/i18n"

import { SyncIcon } from "./icons/SyncIcon"

export function ConversationSyncNotice({ manager }: { manager: ConversationManager }) {
  const progress = useSyncExternalStore(manager.subscribeSyncProgress, manager.getSyncProgress)
  if (!progress?.showNotice) return null

  return (
    <section className="gh-conversation-sync-notice gh-interactive">
      <span className="gh-conversation-sync-notice-icon" aria-hidden="true">
        <SyncIcon size={18} />
      </span>
      <div className="gh-conversation-sync-notice-content" role="status" aria-live="polite">
        <strong>
          {t(progress.initial ? "conversationsInitialSyncTitle" : "conversationsSync")}
        </strong>
        <span>
          {t(
            progress.stage === "saving" ? "conversationsSyncSaving" : "conversationsSyncProgress",
            { count: String(progress.loadedCount) },
          )}
        </span>
      </div>
      <button type="button" disabled={progress.stage === "stopping"} onClick={manager.cancelSync}>
        {t(progress.stage === "stopping" ? "conversationsSyncStopping" : "conversationsSyncStop")}
      </button>
    </section>
  )
}
