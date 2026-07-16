import type { ConversationManager } from "~core/conversation-manager"
import type { OutlineManager } from "~core/outline-manager"
import type { QueueDispatcher } from "~core/queue-dispatcher"
import { drainPersistenceWrites, suspendPersistenceWrites } from "~stores/chrome-adapter"
import { drainCleanupStack } from "~utils/cleanup-stack"

interface AppRuntimeWriters {
  conversationManager: Pick<ConversationManager, "destroy">
  outlineManager: Pick<OutlineManager, "destroy">
  queueDispatcher: Pick<QueueDispatcher, "stop">
}

export function stopAppRuntimeWriters({
  conversationManager,
  outlineManager,
  queueDispatcher,
}: AppRuntimeWriters): void {
  drainCleanupStack(
    [
      () => outlineManager.destroy(),
      () => conversationManager.destroy(),
      () => queueDispatcher.stop(),
    ],
    "app runtime",
  )
}

export function prepareAppRuntimeForClearAll(writers: AppRuntimeWriters): Promise<void> {
  suspendPersistenceWrites()
  stopAppRuntimeWriters(writers)
  return drainPersistenceWrites()
}
