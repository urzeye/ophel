import type { SitePackCapability } from "~adapters/feature-capabilities"
import {
  SITE_PACK_SCHEMA_VERSION,
  isValidSitePackId,
  type SitePackConfig,
  type SitePackManifest,
} from "~adapters/declarative/types"
import {
  validateSitePackManifest,
  type SitePackValidationError,
} from "~adapters/declarative/validate"
import {
  querySelectorAllDeep,
  validateSelectorForElement,
  type SelectorValidationResult,
  type StableSelectorFailureReason,
} from "~core/element-selector-generator"

import { allowsSitePackHttpOrigins } from "~core/site-pack-http-policy"
import {
  SITE_ADAPTER_WIZARD_STEPS,
  type SiteAdapterWizardStepId,
} from "./site-adapter-wizard-steps"

export { SITE_ADAPTER_WIZARD_STEPS } from "./site-adapter-wizard-steps"
export type { SiteAdapterWizardStepId } from "./site-adapter-wizard-steps"

export type SiteAdapterWizardSelectorSource = "generated" | "manual" | "ai"
export type SiteAdapterWizardInputMode = "textarea" | "contenteditable"

export interface SiteAdapterWizardSelection {
  readonly element: Element
  readonly selector: string
  readonly source: SiteAdapterWizardSelectorSource
  readonly generationFailure?: StableSelectorFailureReason
}

export interface SiteAdapterWizardDraft {
  readonly selections: Partial<Record<SiteAdapterWizardStepId, SiteAdapterWizardSelection>>
}

export type SiteAdapterWizardValidationIssue =
  | "selector-missing"
  | "target-disconnected"
  | "selector-invalid"
  | "selector-too-long"
  | "selector-no-match"
  | "selector-target-mismatch"
  | "selector-not-unique"
  | "input-unsupported"
  | "response-container-missing"
  | "outside-response-container"

export type SiteAdapterWizardContainment = "not-applicable" | "pending" | "contained" | "outside"

export interface SiteAdapterWizardStepValidation {
  readonly status: "empty" | "invalid" | "valid"
  readonly issues: readonly SiteAdapterWizardValidationIssue[]
  readonly expectsUnique: boolean
  readonly selectorValidation: SelectorValidationResult | null
  readonly containment: SiteAdapterWizardContainment
}

export interface SiteAdapterWizardOutlinePreviewItem {
  readonly role: "user" | "assistant"
  readonly text: string | null
  readonly matchCount: number
}

export interface SiteAdapterWizardOutlinePreview {
  readonly available: boolean
  readonly title: string
  readonly items: readonly SiteAdapterWizardOutlinePreviewItem[]
}

export interface SiteAdapterWizardConfigPreview {
  readonly config: SitePackConfig
  readonly capabilities: readonly SitePackCapability[]
  readonly conversationItemSelector: string | null
}

export interface SiteAdapterWizardPackMetadata {
  readonly name: string
  readonly id: string
  readonly version: number
}

export type SiteAdapterWizardPackBuildIssue =
  | {
      readonly code: "required-steps-invalid"
      readonly stepId: SiteAdapterWizardStepId
    }
  | { readonly code: "https-required" }
  | {
      readonly code: "manifest-invalid"
      readonly errors: readonly SitePackValidationError[]
    }

export type SiteAdapterWizardPackBuildResult =
  | {
      readonly valid: true
      readonly manifest: SitePackManifest
      readonly json: string
      readonly filename: string
      readonly contributionUrl: string
    }
  | {
      readonly valid: false
      readonly issue: SiteAdapterWizardPackBuildIssue
    }

const MESSAGE_STEP_IDS = new Set<SiteAdapterWizardStepId>(["userQuery", "assistantResponse"])

const CLICK_TARGET_SELECTOR =
  'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"], a[href]'
const TEXT_INPUT_SELECTOR =
  'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], input[type="password"], [contenteditable]'
const PREVIEW_TEXT_LIMIT = 120
const SITE_PACK_NAME_MAX_LENGTH = 200
const SITE_PACK_ID_MAX_LENGTH = 40
const SITE_PACK_CONTRIBUTION_BASE_URL = "https://github.com/urzeye/ophel/new/main/registry/sites"

export const createEmptySiteAdapterWizardDraft = (): SiteAdapterWizardDraft => ({
  selections: {},
})

const normalizePackName = (value: string): string =>
  value.replace(/\s+/g, " ").trim().slice(0, SITE_PACK_NAME_MAX_LENGTH)

const getSiteMetadataContent = (documentRoot: Document, selector: string): string => {
  const content = documentRoot.querySelector<HTMLMetaElement>(selector)?.content
  return normalizePackName(content ?? "")
}

const formatHostnameAsName = (hostname: string): string => {
  const normalized = hostname
    .replace(/^www\./i, "")
    .replace(/[._-]+/g, " ")
    .trim()
  if (!normalized) return "Site adapter"
  return normalized.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

export const generateSiteAdapterWizardPackId = (hostname: string): string => {
  const normalized = hostname
    .replace(/^www\./i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  const candidate = normalized.slice(0, SITE_PACK_ID_MAX_LENGTH).replace(/-+$/g, "")
  if (isValidSitePackId(candidate)) return candidate

  const fallback = `site-${candidate || "adapter"}`
    .slice(0, SITE_PACK_ID_MAX_LENGTH)
    .replace(/-+$/g, "")
  return isValidSitePackId(fallback) ? fallback : "site-adapter"
}

export const createSiteAdapterWizardPackMetadata = (
  documentRoot: Document,
  pageUrl: URL,
): SiteAdapterWizardPackMetadata => {
  const metadataName =
    getSiteMetadataContent(documentRoot, 'meta[name="application-name"]') ||
    getSiteMetadataContent(documentRoot, 'meta[property="og:site_name"]')

  return {
    name: metadataName || formatHostnameAsName(pageUrl.hostname),
    id: generateSiteAdapterWizardPackId(pageUrl.hostname),
    version: 1,
  }
}

export const updateSiteAdapterWizardSelection = (
  draft: SiteAdapterWizardDraft,
  stepId: SiteAdapterWizardStepId,
  selection: SiteAdapterWizardSelection | null,
): SiteAdapterWizardDraft => {
  const selections = { ...draft.selections }
  if (selection) {
    selections[stepId] = selection
  } else {
    delete selections[stepId]
  }
  return { selections }
}

const isSupportedTextInput = (
  element: Element,
): element is HTMLInputElement | HTMLTextAreaElement =>
  element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement

export const getSiteAdapterWizardInputMode = (
  element: Element,
): SiteAdapterWizardInputMode | null => {
  if (isSupportedTextInput(element)) return "textarea"
  return element instanceof HTMLElement && element.isContentEditable ? "contenteditable" : null
}

export const normalizeSiteAdapterWizardTarget = (
  stepId: SiteAdapterWizardStepId,
  element: Element,
): Element => {
  if (stepId === "textarea") {
    const input = element.closest(TEXT_INPUT_SELECTOR)
    if (input && getSiteAdapterWizardInputMode(input)) return input
    return element
  }

  if (stepId === "submitButton" || stepId === "newChatButton") {
    return element.closest(CLICK_TARGET_SELECTOR) ?? element
  }

  if (stepId === "conversationItem") {
    return element.closest("a[href]") ?? element
  }

  return element
}

const getStepDefinition = (stepId: SiteAdapterWizardStepId) => {
  const definition = SITE_ADAPTER_WIZARD_STEPS.find((step) => step.id === stepId)
  if (!definition) {
    throw new Error(`Unknown site adapter wizard step: ${stepId}`)
  }
  return definition
}

const queryDeep = (documentRoot: Document, selector: string): Element[] =>
  querySelectorAllDeep(documentRoot, selector)

const isComposedDescendant = (container: Element, element: Element): boolean => {
  let current: Node | null = element
  while (current) {
    if (current === container) return true
    if (current.parentNode) {
      current = current.parentNode
      continue
    }
    const root = current.getRootNode()
    current = root instanceof ShadowRoot ? root.host : null
  }
  return false
}

const validateBaseSelection = (
  selection: SiteAdapterWizardSelection | undefined,
  expectsUnique: boolean,
  requireSupportedInput: boolean,
): Omit<SiteAdapterWizardStepValidation, "containment"> => {
  if (!selection || selection.selector.trim().length === 0) {
    return {
      status: "empty",
      issues: ["selector-missing"],
      expectsUnique,
      selectorValidation: null,
    }
  }

  if (!selection.element.isConnected) {
    return {
      status: "invalid",
      issues: ["target-disconnected"],
      expectsUnique,
      selectorValidation: null,
    }
  }

  const issues: SiteAdapterWizardValidationIssue[] = []
  if (requireSupportedInput && !getSiteAdapterWizardInputMode(selection.element)) {
    issues.push("input-unsupported")
  }

  const selectorValidation = validateSelectorForElement(
    selection.element,
    selection.selector.trim(),
    { root: selection.element.ownerDocument },
  )

  if (!selectorValidation.withinLengthLimit) issues.push("selector-too-long")
  if (!selectorValidation.validSyntax) {
    issues.push("selector-invalid")
  } else {
    if (selectorValidation.matchCount === 0) issues.push("selector-no-match")
    if (!selectorValidation.matchesTarget) issues.push("selector-target-mismatch")
    if (expectsUnique && !selectorValidation.isUnique) issues.push("selector-not-unique")
  }

  return {
    status: issues.length === 0 ? "valid" : "invalid",
    issues,
    expectsUnique,
    selectorValidation,
  }
}

export const validateSiteAdapterWizardStep = (
  draft: SiteAdapterWizardDraft,
  stepId: SiteAdapterWizardStepId,
): SiteAdapterWizardStepValidation => {
  const definition = getStepDefinition(stepId)
  const selection = draft.selections[stepId]
  const base = validateBaseSelection(selection, definition.expectsUnique, stepId === "textarea")

  if (!MESSAGE_STEP_IDS.has(stepId) || base.status !== "valid" || !selection) {
    return { ...base, containment: "not-applicable" }
  }

  const containerSelection = draft.selections.responseContainer
  const containerBase = validateBaseSelection(containerSelection, true, false)
  if (containerBase.status !== "valid" || !containerSelection) {
    return {
      ...base,
      status: "invalid",
      issues: [...base.issues, "response-container-missing"],
      containment: "pending",
    }
  }

  const matches = queryDeep(selection.element.ownerDocument, selection.selector.trim())
  const contained = matches.every((match) =>
    isComposedDescendant(containerSelection.element, match),
  )
  if (!contained) {
    return {
      ...base,
      status: "invalid",
      issues: [...base.issues, "outside-response-container"],
      containment: "outside",
    }
  }

  return { ...base, containment: "contained" }
}

export const validateSiteAdapterWizardDraft = (
  draft: SiteAdapterWizardDraft,
): Record<SiteAdapterWizardStepId, SiteAdapterWizardStepValidation> =>
  Object.fromEntries(
    SITE_ADAPTER_WIZARD_STEPS.map((step) => [
      step.id,
      validateSiteAdapterWizardStep(draft, step.id),
    ]),
  ) as Record<SiteAdapterWizardStepId, SiteAdapterWizardStepValidation>

export const areRequiredSiteAdapterWizardStepsValid = (draft: SiteAdapterWizardDraft): boolean => {
  const validations = validateSiteAdapterWizardDraft(draft)
  return SITE_ADAPTER_WIZARD_STEPS.every(
    (step) => step.optional || validations[step.id].status === "valid",
  )
}

const getDraftDocument = (draft: SiteAdapterWizardDraft): Document | null => {
  for (const step of SITE_ADAPTER_WIZARD_STEPS) {
    const selection = draft.selections[step.id]
    if (selection) return selection.element.ownerDocument
  }
  return typeof document === "undefined" ? null : document
}

const normalizePreviewText = (value: string | null | undefined): string | null => {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? ""
  if (!normalized) return null
  return normalized.length <= PREVIEW_TEXT_LIMIT
    ? normalized
    : `${normalized.slice(0, PREVIEW_TEXT_LIMIT - 1).trimEnd()}…`
}

const getPreviewTitle = (documentRoot: Document | null): string => {
  const title = normalizePreviewText(documentRoot?.title)
  if (title) return title
  return documentRoot?.location?.hostname || "Site adapter"
}

const getPreviewItem = (
  draft: SiteAdapterWizardDraft,
  validations: Record<SiteAdapterWizardStepId, SiteAdapterWizardStepValidation>,
  stepId: "userQuery" | "assistantResponse",
  role: "user" | "assistant",
): SiteAdapterWizardOutlinePreviewItem => {
  const validation = validations[stepId]
  const selection = draft.selections[stepId]
  if (validation.status !== "valid" || !selection) {
    return { role, text: null, matchCount: 0 }
  }

  const matches = queryDeep(selection.element.ownerDocument, selection.selector.trim())
  const sample = matches.find((element) => normalizePreviewText(element.textContent))
  return {
    role,
    text: normalizePreviewText(sample?.textContent),
    matchCount: matches.length,
  }
}

export const buildSiteAdapterWizardOutlinePreview = (
  draft: SiteAdapterWizardDraft,
  validations = validateSiteAdapterWizardDraft(draft),
): SiteAdapterWizardOutlinePreview => {
  const items = [
    getPreviewItem(draft, validations, "userQuery", "user"),
    getPreviewItem(draft, validations, "assistantResponse", "assistant"),
  ] as const

  return {
    available: items.every((item) => item.matchCount > 0),
    title: getPreviewTitle(getDraftDocument(draft)),
    items,
  }
}

const isSelectionInShadowRoot = (selection: SiteAdapterWizardSelection | undefined): boolean =>
  Boolean(
    selection &&
      typeof ShadowRoot !== "undefined" &&
      selection.element.getRootNode() instanceof ShadowRoot,
  )

export const buildSiteAdapterWizardConfigPreview = (
  draft: SiteAdapterWizardDraft,
  validations = validateSiteAdapterWizardDraft(draft),
): SiteAdapterWizardConfigPreview => {
  const selectors: SitePackConfig["selectors"] = {}
  const capabilities: SitePackCapability[] = []
  const config: SitePackConfig = { capabilities, selectors }

  const textarea = draft.selections.textarea
  const submitButton = draft.selections.submitButton
  const responseContainer = draft.selections.responseContainer
  const userQuery = draft.selections.userQuery
  const assistantResponse = draft.selections.assistantResponse
  const newChatButton = draft.selections.newChatButton
  const conversationItem = draft.selections.conversationItem

  if (validations.textarea.status === "valid" && textarea) {
    selectors.textarea = [textarea.selector.trim()]
  }
  if (validations.submitButton.status === "valid" && submitButton) {
    selectors.submitButton = [submitButton.selector.trim()]
  }
  if (validations.responseContainer.status === "valid" && responseContainer) {
    selectors.responseContainer = responseContainer.selector.trim()
  }
  if (validations.userQuery.status === "valid" && userQuery) {
    selectors.userQuery = userQuery.selector.trim()
  }
  if (validations.assistantResponse.status === "valid" && assistantResponse) {
    selectors.assistantResponse = assistantResponse.selector.trim()
  }
  if (validations.newChatButton.status === "valid" && newChatButton) {
    selectors.newChatButton = [newChatButton.selector.trim()]
  }

  const inputMode = textarea ? getSiteAdapterWizardInputMode(textarea.element) : null
  const promptReady = Boolean(
    inputMode &&
      validations.textarea.status === "valid" &&
      validations.submitButton.status === "valid",
  )
  if (promptReady && inputMode) {
    config.input = { mode: inputMode }
    capabilities.push("prompt-insert")
  }

  const outlineReady = Boolean(
    validations.responseContainer.status === "valid" && validations.userQuery.status === "valid",
  )
  if (outlineReady) {
    capabilities.push("outline", "outline-user-queries")
  }

  const messageSelectorsReady = Boolean(
    outlineReady &&
      validations.assistantResponse.status === "valid" &&
      userQuery &&
      assistantResponse,
  )
  if (messageSelectorsReady && userQuery && assistantResponse) {
    selectors.chatContent = [userQuery.selector.trim(), assistantResponse.selector.trim()]
    config.export = {
      userQuerySelector: userQuery.selector.trim(),
      assistantResponseSelector: assistantResponse.selector.trim(),
      turnSelector: null,
      useShadowDOM:
        isSelectionInShadowRoot(userQuery) || isSelectionInShadowRoot(assistantResponse),
    }
    capabilities.push("export-basic", "reading-history")
  }

  if (validations.newChatButton.status === "valid" && newChatButton) {
    capabilities.push("new-chat")
  }

  return {
    config,
    capabilities,
    conversationItemSelector:
      validations.conversationItem.status === "valid" && conversationItem
        ? conversationItem.selector.trim()
        : null,
  }
}

export const serializeSiteAdapterWizardManifest = (manifest: SitePackManifest): string =>
  `${JSON.stringify(manifest, null, 2)}\n`

export const buildSiteAdapterWizardContributionUrl = (
  manifest: SitePackManifest,
  json = serializeSiteAdapterWizardManifest(manifest),
): string => {
  const url = new URL(SITE_PACK_CONTRIBUTION_BASE_URL)
  url.searchParams.set("filename", `${manifest.id}.json`)
  url.searchParams.set("value", json)
  url.searchParams.set("message", `feat(registry): add ${manifest.id} SitePack`)
  return url.href
}

export const buildSiteAdapterWizardPack = (input: {
  readonly draft: SiteAdapterWizardDraft
  readonly metadata: SiteAdapterWizardPackMetadata
  readonly pageUrl: URL
  readonly appVersion: string
}): SiteAdapterWizardPackBuildResult => {
  const validations = validateSiteAdapterWizardDraft(input.draft)
  const invalidRequiredStep = SITE_ADAPTER_WIZARD_STEPS.find(
    (step) => !step.optional && validations[step.id].status !== "valid",
  )
  if (invalidRequiredStep) {
    return {
      valid: false,
      issue: { code: "required-steps-invalid", stepId: invalidRequiredStep.id },
    }
  }

  const allowHttp = allowsSitePackHttpOrigins()
  if (input.pageUrl.protocol !== "https:" && !(allowHttp && input.pageUrl.protocol === "http:")) {
    return { valid: false, issue: { code: "https-required" } }
  }

  const preview = buildSiteAdapterWizardConfigPreview(input.draft, validations)
  const matchScheme = input.pageUrl.protocol === "http:" ? "http" : "https"
  const candidate: SitePackManifest = {
    schemaVersion: SITE_PACK_SCHEMA_VERSION,
    id: input.metadata.id.trim(),
    version: input.metadata.version,
    minAppVersion: input.appVersion,
    name: normalizePackName(input.metadata.name),
    matches: [`${matchScheme}://${input.pageUrl.host.toLowerCase()}/*`],
    ...preview.config,
  }
  const validation = validateSitePackManifest(candidate, { allowHttpMatches: allowHttp })
  if (!validation.valid) {
    return {
      valid: false,
      issue: { code: "manifest-invalid", errors: validation.errors },
    }
  }

  const manifest = validation.value
  const json = serializeSiteAdapterWizardManifest(manifest)
  return {
    valid: true,
    manifest,
    json,
    filename: `${manifest.id}.json`,
    contributionUrl: buildSiteAdapterWizardContributionUrl(manifest, json),
  }
}
