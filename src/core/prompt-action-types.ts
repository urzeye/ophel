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

export interface PromptSelectionAnchor {
  siteId: string
  sessionId: string
  cid?: string
  selectedText: string
  textSignature: string
  selectedPrefix?: string
  selectedSuffix?: string
  selectedLength?: number
  selectedHash?: string
  beforeText?: string
  afterText?: string
  rootSelector?: string
  rootIndex?: number
  rootTextSignature?: string
  selectionIndex?: number
  scrollTop?: number
  createdAt: number
}

export interface PromptQuoteReference {
  id: string
  selectedText: string
  quoteText: string
  anchor: PromptSelectionAnchor
  chainId?: string
  chainTitle?: string
  stepId?: string
  stepIndex?: number
  stepTotal?: number
  createdAt: number
}

export interface PromptActionVariableContext {
  /**
   * Future Quick Follow-up entry point: selected conversation text can be passed
   * as a template variable instead of introducing a separate follow-up renderer.
   */
  selectedText?: string
  quoteText?: string
  quoteRef?: PromptQuoteReference
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
  id?: string
  promptId?: string
  template: string
  runMode: PromptActionRunMode
  splitMode?: PromptActionSplitMode
}

export interface PromptActionDefinition {
  id: string
  title: string
  description?: string
  iconSvg?: string
  showInSelectionPopover?: boolean
  source: PromptActionSource
  steps: PromptActionStep[]
  createdAt?: number
  updatedAt?: number
}

export type PromptChainStepMode = "prompt" | "inline"

export interface PromptChainStep {
  id: string
  mode?: PromptChainStepMode
  promptId: string
  inlineContent?: string
  runMode: PromptActionRunMode
  splitMode?: PromptActionSplitMode
}

export interface PromptChain {
  id: string
  title: string
  description?: string
  iconSvg?: string
  showInSelectionPopover: boolean
  steps: PromptChainStep[]
  createdAt: number
  updatedAt: number
  lastUsedAt?: number
}

export interface PromptActionExecutionInput {
  content: string
  context: PromptActionContext
  splitMode?: PromptActionSplitMode
}
