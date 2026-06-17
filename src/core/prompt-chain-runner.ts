import type { PromptActionStep, PromptChain, PromptQuoteReference } from "~core/prompt-action-types"
import { appendQuickQuoteMarker } from "~core/quick-quote-marker"
import type { QueueEnqueueInput } from "~stores/queue-store"
import {
  extractVariables,
  formatMarkdownQuote,
  replaceVariables,
  type ParsedVariable,
} from "~utils/prompt-variables"
import type { Prompt } from "~utils/storage"

export const PROMPT_CHAIN_AUTO_VARIABLES = {
  selection: "selection",
  quote: "quote",
} as const

export interface PromptChainSelectionContext {
  selectedText: string
  quoteText?: string
  quoteRef?: PromptQuoteReference
}

export interface ResolvedPromptChainStep {
  step: PromptActionStep
  prompt: Prompt
  content: string
  quoteRef?: PromptQuoteReference
}

const getPromptById = (prompts: Prompt[], promptId: string): Prompt | null =>
  prompts.find((prompt) => prompt.id === promptId) ?? null

const uniqueVariables = (variables: ParsedVariable[]): ParsedVariable[] => {
  const seen = new Set<string>()
  const result: ParsedVariable[] = []

  variables.forEach((variable) => {
    if (seen.has(variable.raw)) return
    seen.add(variable.raw)
    result.push(variable)
  })

  return result
}

const usesQuoteContext = (template: string): boolean =>
  extractVariables(template).some(
    (variable) =>
      variable.raw === PROMPT_CHAIN_AUTO_VARIABLES.selection ||
      variable.raw === PROMPT_CHAIN_AUTO_VARIABLES.quote,
  )

export const buildPromptChainAutoValues = (
  selection: PromptChainSelectionContext,
): Record<string, string> => {
  const selectedText = selection.selectedText.trim()
  return {
    [PROMPT_CHAIN_AUTO_VARIABLES.selection]: selectedText,
    [PROMPT_CHAIN_AUTO_VARIABLES.quote]: selection.quoteText || formatMarkdownQuote(selectedText),
  }
}

export const getPromptChainTemplates = (chain: PromptChain, prompts: Prompt[]): string[] =>
  chain.steps
    .map((step) => {
      if (step.mode === "inline" && step.inlineContent) {
        return step.inlineContent
      }
      return step.promptId ? getPromptById(prompts, step.promptId)?.content || "" : ""
    })
    .filter(Boolean)

export const extractPromptChainVariables = (
  chain: PromptChain,
  prompts: Prompt[],
  providedValues: Record<string, string> = {},
): ParsedVariable[] => {
  const provided = new Set(Object.keys(providedValues))
  const variables = getPromptChainTemplates(chain, prompts).flatMap(extractVariables)

  return uniqueVariables(variables).filter((variable) => !provided.has(variable.raw))
}

export const resolvePromptChainSteps = ({
  chain,
  prompts,
  selection,
  values = {},
}: {
  chain: PromptChain
  prompts: Prompt[]
  selection: PromptChainSelectionContext
  values?: Record<string, string>
}): ResolvedPromptChainStep[] => {
  const autoValues = buildPromptChainAutoValues(selection)
  const variableValues = { ...autoValues, ...values }
  const stepTotal = chain.steps.length

  return chain.steps
    .map((step, index): ResolvedPromptChainStep | null => {
      let prompt: Prompt | null = null
      let template = ""

      if (step.mode === "inline" && step.inlineContent) {
        // 内联模式：使用 inlineContent 作为模板
        template = step.inlineContent
        // 创建一个虚拟 prompt 对象用于显示
        prompt = {
          id: step.id,
          title: `Inline Step ${index + 1}`,
          content: step.inlineContent,
          category: "",
        }
      } else {
        // Prompt 模式：从已有 prompt 获取
        prompt = getPromptById(prompts, step.promptId)
        if (!prompt) return null
        template = prompt.content
      }

      const content = replaceVariables(template, variableValues).trim()
      if (!content) return null

      let quoteRef = usesQuoteContext(template) ? selection.quoteRef : undefined
      if (quoteRef) {
        quoteRef = {
          ...quoteRef,
          chainId: chain.id,
          chainTitle: chain.title,
          stepId: step.id,
          stepIndex: index + 1,
          stepTotal,
        }
      }

      return {
        step: {
          id: step.id,
          promptId: prompt.id,
          template,
          runMode: step.runMode,
          splitMode: step.splitMode,
        },
        prompt,
        content,
        quoteRef,
      }
    })
    .filter((step): step is ResolvedPromptChainStep => step !== null)
}

export const buildPromptChainQueueInputs = (
  chain: PromptChain,
  resolvedSteps: ResolvedPromptChainStep[],
): QueueEnqueueInput[] => {
  let hasFullQuoteMarker = false

  return resolvedSteps.map((resolvedStep, index) => {
    const quoteMarkerKind = resolvedStep.quoteRef
      ? hasFullQuoteMarker
        ? "ref"
        : "full"
      : undefined

    if (quoteMarkerKind === "full") {
      hasFullQuoteMarker = true
    }

    return {
      content: appendQuickQuoteMarker(
        resolvedStep.content,
        resolvedStep.quoteRef,
        quoteMarkerKind ? { kind: quoteMarkerKind } : undefined,
      ),
      metadata: {
        source: "quick-follow-up",
        promptId: resolvedStep.prompt.id,
        promptTitle: resolvedStep.prompt.title,
        chainId: chain.id,
        chainTitle: chain.title,
        stepId: resolvedStep.step.id,
        stepIndex: index + 1,
        stepTotal: resolvedSteps.length,
        quoteRef: resolvedStep.quoteRef,
        quoteMarkerKind,
        runMode: resolvedStep.step.runMode,
      },
    }
  })
}
