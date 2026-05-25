import type { Prompt } from "~utils/storage"

/**
 * Shared action model for prompt execution.
 *
 * Today this is only used by Prompt Library -> Prompt Queue / send helpers.
 * It is intentionally broader than the current UI because Quick Follow-up will
 * need the same execution primitives later: select text in conversation history,
 * resolve it into template variables, then run one or more prompt steps.
 *
 * Keeping these types separate from React components prevents future follow-up
 * features from duplicating prompt insertion, queueing, and variable handling
 * logic inside selection popovers.
 */

export type PromptActionSource =
  | "prompt-library"
  | "prompt-queue"
  | "quick-follow-up"
  | "inline-selection"

export type PromptActionRunMode = "insert" | "send-or-queue" | "enqueue"

export type PromptActionSplitMode = "none" | "line"

export interface PromptActionVariableContext {
  /**
   * Future Quick Follow-up entry point: selected conversation text can be passed
   * as a template variable instead of introducing a separate follow-up renderer.
   */
  selectedText?: string
  /**
   * Variables resolved from Prompt Library templates, VariableInputDialog, or a
   * future Quick Follow-up action form.
   */
  values?: Record<string, string>
}

export interface PromptActionContext {
  source: PromptActionSource
  prompt?: Prompt
  variables?: PromptActionVariableContext
}

export interface PromptActionStep {
  template: string
  runMode: PromptActionRunMode
  splitMode?: PromptActionSplitMode
}

export interface PromptActionDefinition {
  id: string
  title: string
  source: PromptActionSource
  steps: PromptActionStep[]
}

export interface PromptActionExecutionInput {
  content: string
  context: PromptActionContext
  splitMode?: PromptActionSplitMode
}
