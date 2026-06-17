import type { SiteAdapter } from "~adapters/base"
import type { PromptManager } from "~core/prompt-manager"
import {
  appendQuickQuoteMarker,
  rememberQuickQuoteReferenceForContent,
} from "~core/quick-quote-marker"
import type { QueueItemMetadata } from "~stores/queue-store"
import { useQueueStore } from "~stores/queue-store"
import { useSettingsStore } from "~stores/settings-store"
import { splitQueueLines } from "~utils/queue-batch"
import type { PromptActionContext, PromptActionSplitMode } from "./prompt-action-types"

export type PromptSendResult =
  | { status: "sent" }
  | { status: "queued"; count: number }
  | { status: "send-failed" }
  | { status: "insert-failed" }

export type PromptEnqueueResult =
  | { status: "queued"; count: number }
  | { status: "disabled" }
  | { status: "empty" }

interface EnqueuePromptOptions {
  content: string
  splitByLine?: boolean
  /**
   * Reserved for Quick Follow-up and other non-Prompt-Tab callers. The current
   * enqueue behavior does not branch on context yet, but carrying it through
   * now makes future telemetry, variable resolution, and source-specific UX
   * possible without changing every call site again.
   */
  context?: PromptActionContext
}

interface SendOrQueuePromptOptions {
  adapter: SiteAdapter | null | undefined
  manager: PromptManager
  content: string
  submitShortcut: "enter" | "ctrlEnter"
  /**
   * Reserved for future multi-step PromptAction execution. Quick Follow-up will
   * pass source="quick-follow-up" plus selected text variables through this
   * field while reusing the same send/queue behavior as Prompt Library.
   */
  context?: PromptActionContext
}

const splitModeToBoolean = (splitMode?: PromptActionSplitMode) => splitMode === "line"

const buildQueueMetadata = (context?: PromptActionContext): QueueItemMetadata | undefined => {
  if (!context) return undefined

  return {
    source: context.source,
    promptId: context.prompt?.id,
    promptTitle: context.prompt?.title,
    quoteRef: context.variables?.quoteRef,
  }
}

export const sendOrQueuePrompt = async ({
  adapter,
  manager,
  content,
  submitShortcut,
  context,
}: SendOrQueuePromptOptions): Promise<PromptSendResult> => {
  const trimmedContent = content.trim()
  if (!trimmedContent) {
    return { status: "insert-failed" }
  }
  const quoteRef = context?.variables?.quoteRef
  rememberQuickQuoteReferenceForContent(trimmedContent, quoteRef)
  const contentWithMarker = appendQuickQuoteMarker(trimmedContent, quoteRef)

  const promptQueueEnabled =
    useSettingsStore.getState().settings.features?.prompts?.promptQueue ?? false

  if (adapter?.isGenerating() && promptQueueEnabled) {
    useQueueStore.getState().enqueue(contentWithMarker, buildQueueMetadata(context))
    return { status: "queued", count: 1 }
  }

  const insertOk = await manager.insertPrompt(contentWithMarker)
  if (!insertOk) {
    return { status: "insert-failed" }
  }

  const submitOk = await manager.submitPrompt(submitShortcut)
  if (!submitOk) {
    return { status: "send-failed" }
  }

  return { status: "sent" }
}

export const enqueuePrompt = ({
  content,
  splitByLine = false,
  context: _context,
}: EnqueuePromptOptions): PromptEnqueueResult => {
  const promptQueueEnabled =
    useSettingsStore.getState().settings.features?.prompts?.promptQueue ?? false

  if (!promptQueueEnabled) {
    return { status: "disabled" }
  }

  const contents = splitByLine ? splitQueueLines(content) : [content.trim()].filter(Boolean)
  if (contents.length === 0) {
    return { status: "empty" }
  }

  const metadata = buildQueueMetadata(_context)
  const queuedItems = useQueueStore.getState().enqueueMany(
    contents.map((content) => ({
      content: appendQuickQuoteMarker(content, metadata?.quoteRef),
      metadata,
    })),
  )
  if (queuedItems.length === 0) {
    return { status: "empty" }
  }

  return { status: "queued", count: queuedItems.length }
}

/**
 * Forward-compatible wrapper for explicit enqueue actions.
 *
 * The current UI still calls enqueuePrompt() directly for simple cases. Future
 * Quick Follow-up actions should prefer this wrapper because it accepts the
 * action context and split mode used by PromptActionDefinition steps.
 */
export const enqueuePromptAction = ({
  content,
  context,
  splitMode = "none",
}: {
  content: string
  context: PromptActionContext
  splitMode?: PromptActionSplitMode
}): PromptEnqueueResult =>
  enqueuePrompt({
    content,
    context,
    splitByLine: splitModeToBoolean(splitMode),
  })
