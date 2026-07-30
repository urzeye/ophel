import { SITE_PACK_MAX_SELECTOR_LENGTH } from "~adapters/declarative/validate"

export type StableSelectorStrategy =
  | "data-testid"
  | "id"
  | "aria"
  | "classes"
  | "tag"
  | "ancestor-chain"

export type StableSelectorFailureReason =
  | "element-disconnected"
  | "element-outside-root"
  | "no-unique-selector"
  | "attempt-limit"

export interface GeneratedStableSelector {
  status: "generated"
  selector: string
  strategy: StableSelectorStrategy
  segments: number
  attempts: number
}

export interface ManualSelectorRequired {
  status: "manual-required"
  reason: StableSelectorFailureReason
  attempts: number
}

export type StableSelectorGenerationResult = GeneratedStableSelector | ManualSelectorRequired

export interface SelectorGenerationOptions {
  root?: Document | ShadowRoot
  maxAttempts?: number
}

export interface SelectorValidationResult {
  selector: string
  validSyntax: boolean
  withinLengthLimit: boolean
  matchCount: number
  matchesTarget: boolean
  isUnique: boolean
  error: string | null
}

interface SelectorSegment {
  selector: string
  strategy: Exclude<StableSelectorStrategy, "ancestor-chain">
  quality: number
}

interface AncestorCandidateSet {
  depth: number
  candidates: SelectorSegment[]
}

interface SelectorChainCandidate {
  segments: SelectorSegment[]
  selector: string
  score: number
}

const MAX_SHADOW_DEPTH = 15
const MAX_GENERATION_ATTEMPTS = 320
const MAX_DIRECT_CANDIDATES = 96
const MAX_TARGET_CANDIDATES = 18
const MAX_ANCESTOR_DEPTH = 8
const MAX_ANCESTOR_CANDIDATES = 3
const MAX_CLASS_TOKENS = 6
const MAX_CLASS_COMBINATION_SIZE = 3
const MAX_CLASS_NAME_LENGTH = 80
const MAX_ATTRIBUTE_VALUE_LENGTH = 200

const TEST_ID_ATTRIBUTES = ["data-testid", "data-test-id"] as const

const VOLATILE_ARIA_ATTRIBUTES = new Set([
  "aria-activedescendant",
  "aria-atomic",
  "aria-busy",
  "aria-checked",
  "aria-current",
  "aria-disabled",
  "aria-expanded",
  "aria-grabbed",
  "aria-hidden",
  "aria-invalid",
  "aria-level",
  "aria-live",
  "aria-modal",
  "aria-multiline",
  "aria-multiselectable",
  "aria-orientation",
  "aria-posinset",
  "aria-pressed",
  "aria-readonly",
  "aria-relevant",
  "aria-required",
  "aria-selected",
  "aria-setsize",
  "aria-sort",
  "aria-valuemax",
  "aria-valuemin",
  "aria-valuenow",
  "aria-valuetext",
])

const ARIA_ATTRIBUTE_PRIORITY = [
  "aria-label",
  "aria-labelledby",
  "aria-controls",
  "aria-describedby",
  "aria-placeholder",
  "aria-roledescription",
  "aria-keyshortcuts",
  "aria-haspopup",
  "aria-owns",
] as const

const ARIA_ID_REFERENCE_ATTRIBUTES = new Set([
  "aria-labelledby",
  "aria-controls",
  "aria-describedby",
  "aria-owns",
])

const GENERATED_ID_PREFIX_PATTERN =
  /^(?::|react[-_]|radix[-_]|headlessui[-_]|mantine[-_]|mui[-_]|chakra[-_]|rc[-_]|floating-ui[-_]|reach[-_])/i
const UUID_PATTERN =
  /^[{(]?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[)}]?$/i
const HASH_FRAGMENT_PATTERN = /[a-f0-9]{5,}/i
const LONG_HASH_FRAGMENT_PATTERN = /[a-f0-9]{8,}/i
const LONG_DIGIT_RUN_PATTERN = /\d{5,}/
const CSS_IN_JS_CLASS_PATTERN =
  /^(?:css|sc|jsx|emotion|styled|chakra|mui|mantine|jss)[-_][a-z0-9_-]+$/i
const UTILITY_SYNTAX_PATTERN = /[:\[\]\\/]/
const NUMERIC_UTILITY_CLASS_PATTERN =
  /^(?:p[trblxy]?|m[trblxy]?|gap|space-[xy]|w|h|min-[wh]|max-[wh]|z|opacity|order|col-span|row-span)-/i
const PRESENTATION_ONLY_CLASS_NAMES = new Set([
  "block",
  "container",
  "contents",
  "dark",
  "fixed",
  "flex",
  "grid",
  "group",
  "hidden",
  "inline",
  "inline-block",
  "inline-flex",
  "peer",
  "relative",
  "absolute",
  "sticky",
  "sr-only",
  "w-full",
  "h-full",
])

const SEGMENT_QUALITY = {
  dataTestId: 0,
  id: 10,
  aria: 20,
  classes: 40,
  tag: 80,
} as const

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const escapeCssIdentifier = (value: string): string => {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
}

const escapeCssAttributeValue = (value: string): string =>
  value
    .replace(/\0/g, "�")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\d ")
    .replace(/\n/g, "\\a ")
    .replace(/\f/g, "\\c ")

export const isStableSelectorAttributeValue = (value: string): boolean => {
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= MAX_ATTRIBUTE_VALUE_LENGTH
}

export const isStableSelectorId = (value: string): boolean => {
  const trimmed = value.trim()
  if (trimmed.length < 2 || trimmed.length > MAX_ATTRIBUTE_VALUE_LENGTH) return false
  if (/\s/.test(trimmed) || GENERATED_ID_PREFIX_PATTERN.test(trimmed)) return false
  if (UUID_PATTERN.test(trimmed) || LONG_DIGIT_RUN_PATTERN.test(trimmed)) return false
  return !LONG_HASH_FRAGMENT_PATTERN.test(trimmed)
}

const isStableAriaValue = (attribute: string, value: string): boolean => {
  if (!isStableSelectorAttributeValue(value)) return false
  if (!ARIA_ID_REFERENCE_ATTRIBUTES.has(attribute)) return true

  const references = value.trim().split(/\s+/)
  return references.length > 0 && references.every(isStableSelectorId)
}

export const isStableSelectorClassName = (className: string): boolean => {
  const token = className.trim()
  if (token.length < 2 || token.length > MAX_CLASS_NAME_LENGTH) return false
  if (token.startsWith("gh-") || token.startsWith("!")) return false
  if (UTILITY_SYNTAX_PATTERN.test(token) || PRESENTATION_ONLY_CLASS_NAMES.has(token)) return false
  if (NUMERIC_UTILITY_CLASS_PATTERN.test(token) || CSS_IN_JS_CLASS_PATTERN.test(token)) return false
  if (UUID_PATTERN.test(token) || LONG_DIGIT_RUN_PATTERN.test(token)) return false
  return !HASH_FRAGMENT_PATTERN.test(token)
}

const buildCombinations = (values: string[], maxSize: number): string[][] => {
  const combinations: string[][] = []

  const visit = (start: number, targetSize: number, current: string[]) => {
    if (current.length === targetSize) {
      combinations.push([...current])
      return
    }

    for (let index = start; index < values.length; index += 1) {
      current.push(values[index])
      visit(index + 1, targetSize, current)
      current.pop()
    }
  }

  for (let size = 1; size <= Math.min(maxSize, values.length); size += 1) {
    visit(0, size, [])
  }

  return combinations
}

const sortSegments = (left: SelectorSegment, right: SelectorSegment): number =>
  left.quality - right.quality ||
  left.selector.length - right.selector.length ||
  left.selector.localeCompare(right.selector)

const getAriaAttributeNames = (element: Element): string[] => {
  const priority = new Map<string, number>(
    ARIA_ATTRIBUTE_PRIORITY.map((attribute, index) => [attribute, index]),
  )

  return element
    .getAttributeNames()
    .filter(
      (attribute) => attribute.startsWith("aria-") && !VOLATILE_ARIA_ATTRIBUTES.has(attribute),
    )
    .sort(
      (left, right) =>
        (priority.get(left) ?? ARIA_ATTRIBUTE_PRIORITY.length) -
          (priority.get(right) ?? ARIA_ATTRIBUTE_PRIORITY.length) || left.localeCompare(right),
    )
}

const getLocalCandidates = (element: Element, includeTagFallback: boolean): SelectorSegment[] => {
  const candidates = new Map<string, SelectorSegment>()
  const tag = escapeCssIdentifier(element.localName || element.tagName.toLowerCase())

  const addCandidate = (candidate: SelectorSegment) => {
    if (candidate.selector.length > SITE_PACK_MAX_SELECTOR_LENGTH) return
    const existing = candidates.get(candidate.selector)
    if (!existing || sortSegments(candidate, existing) < 0) {
      candidates.set(candidate.selector, candidate)
    }
  }

  TEST_ID_ATTRIBUTES.forEach((attribute, attributeIndex) => {
    const value = element.getAttribute(attribute)
    if (!value || !isStableSelectorAttributeValue(value)) return
    const selector = `[${attribute}="${escapeCssAttributeValue(value)}"]`
    const quality = SEGMENT_QUALITY.dataTestId + attributeIndex * 2
    addCandidate({ selector, strategy: "data-testid", quality })
    addCandidate({ selector: `${tag}${selector}`, strategy: "data-testid", quality: quality + 1 })
  })

  const id = element.getAttribute("id")
  if (id && isStableSelectorId(id)) {
    const selector = `#${escapeCssIdentifier(id)}`
    addCandidate({ selector, strategy: "id", quality: SEGMENT_QUALITY.id })
    addCandidate({ selector: `${tag}${selector}`, strategy: "id", quality: SEGMENT_QUALITY.id + 1 })
  }

  getAriaAttributeNames(element).forEach((attribute, index) => {
    const value = element.getAttribute(attribute)
    if (!value || !isStableAriaValue(attribute, value)) return
    const attributeSelector = `[${attribute}="${escapeCssAttributeValue(value)}"]`
    const quality = SEGMENT_QUALITY.aria + index * 2
    addCandidate({ selector: attributeSelector, strategy: "aria", quality })
    addCandidate({
      selector: `${tag}${attributeSelector}`,
      strategy: "aria",
      quality: quality + 1,
    })
  })

  const stableClasses = Array.from(element.classList)
    .filter(isStableSelectorClassName)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, MAX_CLASS_TOKENS)

  buildCombinations(stableClasses, MAX_CLASS_COMBINATION_SIZE).forEach((classNames) => {
    const classSelector = classNames
      .map((className) => `.${escapeCssIdentifier(className)}`)
      .join("")
    const quality = SEGMENT_QUALITY.classes + (classNames.length - 1) * 2
    addCandidate({ selector: classSelector, strategy: "classes", quality })
    addCandidate({
      selector: `${tag}${classSelector}`,
      strategy: "classes",
      quality: quality + 1,
    })
  })

  if (includeTagFallback) {
    addCandidate({ selector: tag, strategy: "tag", quality: SEGMENT_QUALITY.tag })
  }

  return Array.from(candidates.values()).sort(sortSegments)
}

const collectOpenSelectorRoots = (root: Document | ShadowRoot): Array<Document | ShadowRoot> => {
  const roots: Array<Document | ShadowRoot> = []
  const visited = new Set<Document | ShadowRoot>()

  const visit = (current: Document | ShadowRoot, depth: number) => {
    if (visited.has(current) || depth > MAX_SHADOW_DEPTH) return
    visited.add(current)
    roots.push(current)

    current.querySelectorAll("*").forEach((element) => {
      if (element.shadowRoot) {
        visit(element.shadowRoot, depth + 1)
      }
    })
  }

  visit(root, 0)
  return roots
}

class DeepSelectorQueryContext {
  private readonly roots: Array<Document | ShadowRoot>
  private readonly cache = new Map<string, Element[]>()

  constructor(root: Document | ShadowRoot) {
    this.roots = collectOpenSelectorRoots(root)
  }

  contains(element: Element): boolean {
    const elementRoot = element.getRootNode()
    return this.roots.some((root) => root === elementRoot)
  }

  query(selector: string): Element[] {
    const cached = this.cache.get(selector)
    if (cached) return cached

    const matches = new Set<Element>()
    this.roots.forEach((root) => {
      root.querySelectorAll(selector).forEach((element) => matches.add(element))
    })

    const result = Array.from(matches)
    this.cache.set(selector, result)
    return result
  }
}

export const querySelectorAllDeep = (root: Document | ShadowRoot, selector: string): Element[] =>
  new DeepSelectorQueryContext(root).query(selector)

const isUniqueTargetMatch = (
  context: DeepSelectorQueryContext,
  target: Element,
  selector: string,
): boolean => {
  const matches = context.query(selector)
  return matches.length === 1 && matches[0] === target
}

const buildSelector = (segments: readonly SelectorSegment[]): string =>
  segments.map((segment) => segment.selector).join(" ")

const scoreChain = (segments: readonly SelectorSegment[], depths: readonly number[]): number => {
  const target = segments[segments.length - 1]
  const ancestors = segments.slice(0, -1)
  const ancestorQuality = ancestors.reduce((total, segment) => total + segment.quality, 0)
  const selectorLength = buildSelector(segments).length

  return (
    target.quality * 100_000 +
    ancestorQuality * 100 +
    segments.length * 10 +
    depths.reduce((total, depth) => total + depth, 0) +
    selectorLength / 1_000
  )
}

const addChainCandidate = (
  chains: Map<string, SelectorChainCandidate>,
  segments: SelectorSegment[],
  depths: number[],
) => {
  const selector = buildSelector(segments)
  if (selector.length > SITE_PACK_MAX_SELECTOR_LENGTH) return

  const candidate = {
    segments,
    selector,
    score: scoreChain(segments, depths),
  }
  const existing = chains.get(selector)
  if (!existing || candidate.score < existing.score) {
    chains.set(selector, candidate)
  }
}

const buildAncestorChains = (
  targetCandidates: SelectorSegment[],
  ancestors: AncestorCandidateSet[],
): SelectorChainCandidate[] => {
  const chains = new Map<string, SelectorChainCandidate>()

  ancestors.forEach((ancestor) => {
    ancestor.candidates.forEach((anchor) => {
      targetCandidates.forEach((target) => {
        addChainCandidate(chains, [anchor, target], [ancestor.depth])
      })
    })
  })

  for (let nearIndex = 0; nearIndex < ancestors.length; nearIndex += 1) {
    const near = ancestors[nearIndex]
    for (let farIndex = nearIndex + 1; farIndex < ancestors.length; farIndex += 1) {
      const far = ancestors[farIndex]
      far.candidates.forEach((farAnchor) => {
        near.candidates.forEach((nearAnchor) => {
          targetCandidates.forEach((target) => {
            addChainCandidate(chains, [farAnchor, nearAnchor, target], [far.depth, near.depth])
          })
        })
      })
    }
  }

  return Array.from(chains.values()).sort(
    (left, right) => left.score - right.score || left.selector.localeCompare(right.selector),
  )
}

const collectAncestorCandidates = (element: Element): AncestorCandidateSet[] => {
  const ancestors: AncestorCandidateSet[] = []
  let current = element.parentElement
  let depth = 1

  while (current && depth <= MAX_ANCESTOR_DEPTH) {
    const candidates = getLocalCandidates(current, false).slice(0, MAX_ANCESTOR_CANDIDATES)
    if (candidates.length > 0) {
      ancestors.push({ depth, candidates })
    }
    current = current.parentElement
    depth += 1
  }

  return ancestors
}

const shrinkAncestorChain = (
  context: DeepSelectorQueryContext,
  target: Element,
  original: SelectorSegment[],
  canAttempt: () => boolean,
  recordAttempt: () => void,
): SelectorSegment[] => {
  let segments = [...original]
  let index = 0

  while (index < segments.length - 1) {
    if (!canAttempt()) break
    const next = segments.filter((_, segmentIndex) => segmentIndex !== index)
    recordAttempt()
    if (isUniqueTargetMatch(context, target, buildSelector(next))) {
      segments = next
      index = 0
      continue
    }
    index += 1
  }

  return segments
}

export const validateSelectorForElement = (
  element: Element,
  selector: string,
  options: Pick<SelectorGenerationOptions, "root"> = {},
): SelectorValidationResult => {
  const withinLengthLimit = selector.length <= SITE_PACK_MAX_SELECTOR_LENGTH
  const context = new DeepSelectorQueryContext(options.root ?? element.ownerDocument)

  try {
    const matches = context.query(selector)
    const matchesTarget = matches.includes(element)
    return {
      selector,
      validSyntax: true,
      withinLengthLimit,
      matchCount: matches.length,
      matchesTarget,
      isUnique: matches.length === 1 && matchesTarget,
      error: null,
    }
  } catch (error) {
    return {
      selector,
      validSyntax: false,
      withinLengthLimit,
      matchCount: 0,
      matchesTarget: false,
      isUnique: false,
      error: getErrorMessage(error),
    }
  }
}

export const generateStableSelector = (
  element: Element,
  options: SelectorGenerationOptions = {},
): StableSelectorGenerationResult => {
  if (!element.isConnected) {
    return { status: "manual-required", reason: "element-disconnected", attempts: 0 }
  }

  const context = new DeepSelectorQueryContext(options.root ?? element.ownerDocument)
  if (!context.contains(element)) {
    return { status: "manual-required", reason: "element-outside-root", attempts: 0 }
  }

  const maxAttempts = Math.max(1, options.maxAttempts ?? MAX_GENERATION_ATTEMPTS)
  let attempts = 0
  const canAttempt = () => attempts < maxAttempts
  const recordAttempt = () => {
    attempts += 1
  }

  const allTargetCandidates = getLocalCandidates(element, true)
  for (const candidate of allTargetCandidates.slice(0, MAX_DIRECT_CANDIDATES)) {
    if (!canAttempt()) {
      return { status: "manual-required", reason: "attempt-limit", attempts }
    }
    recordAttempt()
    if (isUniqueTargetMatch(context, element, candidate.selector)) {
      return {
        status: "generated",
        selector: candidate.selector,
        strategy: candidate.strategy,
        segments: 1,
        attempts,
      }
    }
  }

  const targetCandidates = allTargetCandidates.slice(0, MAX_TARGET_CANDIDATES)
  const ancestors = collectAncestorCandidates(element)
  const chains = buildAncestorChains(targetCandidates, ancestors)

  for (const chain of chains) {
    if (!canAttempt()) {
      return { status: "manual-required", reason: "attempt-limit", attempts }
    }
    recordAttempt()
    if (!isUniqueTargetMatch(context, element, chain.selector)) continue

    const segments = shrinkAncestorChain(
      context,
      element,
      chain.segments,
      canAttempt,
      recordAttempt,
    )
    return {
      status: "generated",
      selector: buildSelector(segments),
      strategy: segments.length === 1 ? segments[0].strategy : "ancestor-chain",
      segments: segments.length,
      attempts,
    }
  }

  return {
    status: "manual-required",
    reason: canAttempt() ? "no-unique-selector" : "attempt-limit",
    attempts,
  }
}
