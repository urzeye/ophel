import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  generateStableSelector,
  type StableSelectorFailureReason,
} from "~core/element-selector-generator"
import { ElementPickerBusyError, startElementPicker } from "~core/element-picker-controller"
import {
  SiteAdapterAiDraftResponseError,
  applySiteAdapterAiDraftSelectors,
  createSiteAdapterAiDraftPrompt,
  parseSiteAdapterAiDraftResponse,
} from "~core/site-adapter-ai-draft"
import {
  SITE_ADAPTER_WIZARD_STEPS,
  buildSiteAdapterWizardPack,
  buildSiteAdapterWizardConfigPreview,
  buildSiteAdapterWizardOutlinePreview,
  createEmptySiteAdapterWizardDraft,
  createSiteAdapterWizardPackMetadata,
  normalizeSiteAdapterWizardTarget,
  updateSiteAdapterWizardSelection,
  validateSiteAdapterWizardDraft,
  type SiteAdapterWizardDraft,
  type SiteAdapterWizardPackBuildResult,
  type SiteAdapterWizardStepId,
  type SiteAdapterWizardValidationIssue,
} from "~core/site-adapter-wizard"
import { PackManagerError } from "~core/pack-manager"
import { createRuntimePackManager } from "~core/pack-manager-runtime"
import { platform } from "~platform"
import { APP_VERSION } from "~utils/config"
import { downloadFile } from "~utils/exporter"
import { t } from "~utils/i18n"

import {
  CheckIcon,
  ClearIcon,
  CopyIcon,
  DownloadIcon,
  GithubIcon,
  LocateIcon,
  RefreshIcon,
  SaveIcon,
  ShieldCheckIcon,
  SparkleIcon,
} from "./icons"

const VALIDATION_ISSUE_KEYS: Record<SiteAdapterWizardValidationIssue, string> = {
  "selector-missing": "siteAdapterWizardIssueMissing",
  "target-disconnected": "siteAdapterWizardIssueDisconnected",
  "selector-invalid": "siteAdapterWizardIssueInvalid",
  "selector-too-long": "siteAdapterWizardIssueTooLong",
  "selector-no-match": "siteAdapterWizardIssueNoMatch",
  "selector-target-mismatch": "siteAdapterWizardIssueTargetMismatch",
  "selector-not-unique": "siteAdapterWizardIssueNotUnique",
  "input-unsupported": "siteAdapterWizardIssueUnsupportedInput",
  "response-container-missing": "siteAdapterWizardIssueContainerMissing",
  "outside-response-container": "siteAdapterWizardIssueOutsideContainer",
}

const GENERATION_FAILURE_KEYS: Record<StableSelectorFailureReason, string> = {
  "element-disconnected": "siteAdapterWizardGenerateDisconnected",
  "element-outside-root": "siteAdapterWizardGenerateOutsideRoot",
  "no-unique-selector": "siteAdapterWizardGenerateManual",
  "attempt-limit": "siteAdapterWizardGenerateManual",
}

const CAPABILITY_LABEL_KEYS = {
  "prompt-insert": "siteAdapterWizardCapabilityPrompt",
  outline: "siteAdapterWizardCapabilityOutline",
  "outline-user-queries": "siteAdapterWizardCapabilityUserQueries",
  "document-outline": "siteAdapterWizardCapabilityDocumentOutline",
  "export-basic": "siteAdapterWizardCapabilityExport",
  "reading-history": "siteAdapterWizardCapabilityHistory",
  "new-chat": "siteAdapterWizardCapabilityNewChat",
} as const

const DOM_REFRESH_DELAY_MS = 180

type SiteAdapterWizardPublishAction = "save" | "download" | "github"
type SiteAdapterWizardPublishTone = "success" | "warning" | "error"

interface SiteAdapterWizardPublishForm {
  name: string
  id: string
  version: string
}

interface SiteAdapterWizardPublishFeedback {
  tone: SiteAdapterWizardPublishTone
  message: string
}

interface SiteAdapterWizardAiFeedback {
  tone: SiteAdapterWizardPublishTone
  message: string
  responseInvalid: boolean
}

const getCapabilityLabel = (capability: string): string => {
  const key = CAPABILITY_LABEL_KEYS[capability as keyof typeof CAPABILITY_LABEL_KEYS]
  return key ? t(key) : capability
}

const hasDraftProgress = (draft: SiteAdapterWizardDraft, activeStepIndex: number): boolean =>
  activeStepIndex > 0 || Object.keys(draft.selections).length > 0

const createPublishForm = (): SiteAdapterWizardPublishForm => {
  const metadata = createSiteAdapterWizardPackMetadata(document, new URL(window.location.href))
  return {
    name: metadata.name,
    id: metadata.id,
    version: String(metadata.version),
  }
}

const parsePackVersion = (value: string): number => {
  const normalized = value.trim()
  if (!/^[1-9]\d*$/.test(normalized)) return Number.NaN
  return Number(normalized)
}

const getPackBuildErrorMessage = (result: SiteAdapterWizardPackBuildResult): string | null => {
  if (result.valid === true) return null
  const issue = result.issue
  if (issue.code === "required-steps-invalid") {
    return t("siteAdapterWizardPublishDraftInvalid")
  }
  if (issue.code === "unsupported-scheme") {
    return t("siteAdapterWizardPublishSchemeUnsupported")
  }

  const firstError = issue.errors[0]
  if (!firstError) return t("siteAdapterWizardPublishManifestInvalid")
  if (firstError.path === "$.name") return t("siteAdapterWizardPublishNameInvalid")
  if (firstError.path === "$.id") return t("siteAdapterWizardPublishIdInvalid")
  if (firstError.path === "$.version") return t("siteAdapterWizardPublishVersionInvalid")
  if (firstError.path === "$.minAppVersion") {
    return t("siteAdapterWizardPublishAppVersionInvalid")
  }
  if (firstError.path.startsWith("$.matches")) {
    return t("siteAdapterWizardPublishSchemeUnsupported")
  }
  return t("siteAdapterWizardPublishManifestInvalidField", { field: firstError.path })
}

const getPublishOperationErrorMessage = (error: unknown): string => {
  if (error instanceof PackManagerError) {
    if (error.code === "version-reuse" || error.code === "version-rollback") {
      return t("siteAdapterWizardPublishVersionConflict")
    }
    if (error.code === "source-conflict") {
      return t("siteAdapterWizardPublishSourceConflict")
    }
    if (
      error.code === "builtin-id-conflict" ||
      error.code === "builtin-match-conflict" ||
      error.code === "installed-match-conflict"
    ) {
      return t("siteAdapterWizardPublishMatchConflict")
    }
  }
  return t("siteAdapterWizardPublishSaveFailed")
}

const getAiResponseErrorMessage = (error: SiteAdapterAiDraftResponseError): string => {
  switch (error.code) {
    case "response-too-large":
      return t("siteAdapterWizardAiErrorResponseTooLarge")
    case "invalid-json":
      return t("siteAdapterWizardAiErrorInvalidJson")
    case "no-selectors":
      return t("siteAdapterWizardAiErrorNoSelectors")
    default:
      return t("siteAdapterWizardAiErrorInvalidSchema")
  }
}

export function SiteAdapterWizard() {
  const [isOpen, setIsOpen] = useState(false)
  const [isPicking, setIsPicking] = useState(false)
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [draft, setDraft] = useState<SiteAdapterWizardDraft>(createEmptySiteAdapterWizardDraft)
  const [pickerError, setPickerError] = useState<string | null>(null)
  const [domRevision, setDomRevision] = useState(0)
  const [publishForm, setPublishForm] = useState<SiteAdapterWizardPublishForm>(createPublishForm)
  const [publishAction, setPublishAction] = useState<SiteAdapterWizardPublishAction | null>(null)
  const [publishFeedback, setPublishFeedback] = useState<SiteAdapterWizardPublishFeedback | null>(
    null,
  )
  const [savedPackJson, setSavedPackJson] = useState<string | null>(null)
  const [aiResponse, setAiResponse] = useState("")
  const [isCopyingAiPrompt, setIsCopyingAiPrompt] = useState(false)
  const [aiFeedback, setAiFeedback] = useState<SiteAdapterWizardAiFeedback | null>(null)
  const pickerButtonRef = useRef<HTMLButtonElement>(null)
  const selectorInputRef = useRef<HTMLInputElement>(null)
  const packManager = useMemo(() => createRuntimePackManager(platform.storage), [])

  const isComplete = activeStepIndex >= SITE_ADAPTER_WIZARD_STEPS.length
  const activeStep = isComplete ? null : SITE_ADAPTER_WIZARD_STEPS[activeStepIndex]
  const hasProgress = hasDraftProgress(draft, activeStepIndex)

  useEffect(() => {
    if (!isOpen || isPicking) return

    let refreshTimer: number | null = null
    const scheduleRefresh = () => {
      if (refreshTimer !== null) return
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null
        setDomRevision((revision) => revision + 1)
      }, DOM_REFRESH_DELAY_MS)
    }

    const observer = new MutationObserver(scheduleRefresh)
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
    }
  }, [isOpen, isPicking])

  const validations = useMemo(() => {
    void domRevision
    return validateSiteAdapterWizardDraft(draft)
  }, [domRevision, draft])

  const outlinePreview = useMemo(
    () => buildSiteAdapterWizardOutlinePreview(draft, validations),
    [draft, validations],
  )
  const configPreview = useMemo(
    () => buildSiteAdapterWizardConfigPreview(draft, validations),
    [draft, validations],
  )
  const packBuild = useMemo(() => {
    void domRevision
    return buildSiteAdapterWizardPack({
      draft,
      metadata: {
        name: publishForm.name,
        id: publishForm.id,
        version: parsePackVersion(publishForm.version),
      },
      pageUrl: new URL(window.location.href),
      appVersion: APP_VERSION,
    })
  }, [domRevision, draft, publishForm])
  const packBuildError = getPackBuildErrorMessage(packBuild)
  const firstInvalidRequiredStepIndex = SITE_ADAPTER_WIZARD_STEPS.findIndex(
    (step) => !step.optional && validations[step.id].status !== "valid",
  )

  useEffect(() => {
    if (!isComplete || firstInvalidRequiredStepIndex === -1) return
    setActiveStepIndex(firstInvalidRequiredStepIndex)
  }, [firstInvalidRequiredStepIndex, isComplete])

  useEffect(() => {
    if (!savedPackJson) return
    if (packBuild.valid && packBuild.json === savedPackJson) return
    setSavedPackJson(null)
    setPublishFeedback(null)
  }, [packBuild, savedPackJson])

  const handlePick = useCallback(async () => {
    if (!activeStep || isPicking) return

    setPickerError(null)
    setIsPicking(true)

    let result
    try {
      result = await startElementPicker()
    } catch (error) {
      setIsPicking(false)
      if (error instanceof ElementPickerBusyError) {
        setPickerError(t("siteAdapterWizardPickerBusy"))
        return
      }
      throw error
    }

    if (result.status === "selected") {
      const target = normalizeSiteAdapterWizardTarget(activeStep.id, result.element)
      const generated = generateStableSelector(target)

      setDraft((currentDraft) =>
        updateSiteAdapterWizardSelection(currentDraft, activeStep.id, {
          element: target,
          selector: generated.status === "generated" ? generated.selector : "",
          source: generated.status === "generated" ? "generated" : "manual",
          ...(generated.status === "manual-required"
            ? { generationFailure: generated.reason }
            : {}),
        }),
      )
    }

    setIsPicking(false)
  }, [activeStep, isPicking])

  const handleSelectorChange = useCallback((stepId: SiteAdapterWizardStepId, selector: string) => {
    setPickerError(null)
    setDraft((currentDraft) => {
      const currentSelection = currentDraft.selections[stepId]
      if (!currentSelection) return currentDraft
      return updateSiteAdapterWizardSelection(currentDraft, stepId, {
        element: currentSelection.element,
        selector,
        source: "manual",
      })
    })
  }, [])

  const goToNextStep = useCallback(() => {
    if (!activeStep || validations[activeStep.id].status !== "valid") return
    setPickerError(null)
    if (
      activeStepIndex === SITE_ADAPTER_WIZARD_STEPS.length - 1 &&
      firstInvalidRequiredStepIndex !== -1
    ) {
      setActiveStepIndex(firstInvalidRequiredStepIndex)
      return
    }
    setActiveStepIndex((index) => Math.min(index + 1, SITE_ADAPTER_WIZARD_STEPS.length))
  }, [activeStep, activeStepIndex, firstInvalidRequiredStepIndex, validations])

  const skipOptionalStep = useCallback(() => {
    if (!activeStep?.optional) return
    setPickerError(null)
    setDraft((currentDraft) => updateSiteAdapterWizardSelection(currentDraft, activeStep.id, null))
    if (
      activeStepIndex === SITE_ADAPTER_WIZARD_STEPS.length - 1 &&
      firstInvalidRequiredStepIndex !== -1
    ) {
      setActiveStepIndex(firstInvalidRequiredStepIndex)
      return
    }
    setActiveStepIndex((index) => Math.min(index + 1, SITE_ADAPTER_WIZARD_STEPS.length))
  }, [activeStep, activeStepIndex, firstInvalidRequiredStepIndex])

  const goToPreviousStep = useCallback(() => {
    setPickerError(null)
    setActiveStepIndex((index) => Math.max(0, index - 1))
  }, [])

  const handleCopyAiPrompt = useCallback(async () => {
    if (isCopyingAiPrompt) return

    setAiFeedback(null)
    if (!navigator.clipboard?.writeText) {
      setAiFeedback({
        tone: "error",
        message: t("siteAdapterWizardAiCopyFailed"),
        responseInvalid: false,
      })
      return
    }

    setIsCopyingAiPrompt(true)
    try {
      const prompt = createSiteAdapterAiDraftPrompt({
        documentRoot: document,
        pageUrl: new URL(window.location.href),
        draft,
      })
      await navigator.clipboard.writeText(prompt)
      setAiFeedback({
        tone: "success",
        message: t("siteAdapterWizardAiCopied"),
        responseInvalid: false,
      })
    } catch {
      setAiFeedback({
        tone: "error",
        message: t("siteAdapterWizardAiCopyFailed"),
        responseInvalid: false,
      })
    } finally {
      setIsCopyingAiPrompt(false)
    }
  }, [draft, isCopyingAiPrompt])

  const handleApplyAiDraft = useCallback(() => {
    if (!aiResponse.trim()) return

    setAiFeedback(null)
    try {
      const selectors = parseSiteAdapterAiDraftResponse(aiResponse)
      const result = applySiteAdapterAiDraftSelectors({
        draft,
        selectors,
        documentRoot: document,
      })
      const nextValidations = validateSiteAdapterWizardDraft(result.draft)
      const firstRequiredReviewIndex = SITE_ADAPTER_WIZARD_STEPS.findIndex(
        (step) => !step.optional && nextValidations[step.id].status !== "valid",
      )

      setDraft(result.draft)
      setPickerError(null)
      if (firstRequiredReviewIndex !== -1) {
        setActiveStepIndex(firstRequiredReviewIndex)
        const reviewStepId = SITE_ADAPTER_WIZARD_STEPS[firstRequiredReviewIndex].id
        window.requestAnimationFrame(() => {
          if (result.draft.selections[reviewStepId]) {
            selectorInputRef.current?.focus()
          } else {
            pickerButtonRef.current?.focus()
          }
        })
      }

      const appliedCount = result.appliedStepIds.length
      const validCount = result.validStepIds.length
      const reviewCount = result.reviewStepIds.length
      const rejectedCount = result.issues.length
      if (appliedCount === 0) {
        setAiFeedback({
          tone: "error",
          message: t("siteAdapterWizardAiAppliedNone", {
            rejected: String(rejectedCount),
          }),
          responseInvalid: true,
        })
      } else if (reviewCount > 0 || rejectedCount > 0) {
        setAiFeedback({
          tone: "warning",
          message: t("siteAdapterWizardAiAppliedReview", {
            applied: String(appliedCount),
            valid: String(validCount),
            review: String(reviewCount),
            rejected: String(rejectedCount),
          }),
          responseInvalid: false,
        })
      } else {
        setAiFeedback({
          tone: "success",
          message: t("siteAdapterWizardAiAppliedSuccess", {
            count: String(validCount),
          }),
          responseInvalid: false,
        })
      }
    } catch (error) {
      setAiFeedback({
        tone: "error",
        message:
          error instanceof SiteAdapterAiDraftResponseError
            ? getAiResponseErrorMessage(error)
            : t("siteAdapterWizardAiErrorInvalidSchema"),
        responseInvalid: true,
      })
    }
  }, [aiResponse, draft])

  const updatePublishForm = useCallback(
    (field: keyof SiteAdapterWizardPublishForm, value: string) => {
      setPublishFeedback(null)
      setPublishForm((current) => ({ ...current, [field]: value }))
    },
    [],
  )

  const handleSavePack = useCallback(async () => {
    if (!packBuild.valid || publishAction) return

    setPublishAction("save")
    setPublishFeedback(null)
    try {
      const result = await packManager.installLocal(packBuild.manifest)
      if (!result.pack) {
        throw new Error(`Installed SitePack not found after save: ${packBuild.manifest.id}`)
      }

      const packId = result.pack.manifest.id
      const permissionDeniedError = new Error(`SitePack origin permission denied: ${packId}`)
      try {
        const permission = await platform.sitePacks.ensureOrigins(packId)
        if (permission === "denied") throw permissionDeniedError
        await platform.sitePacks.reconcile()
      } catch (activationError) {
        try {
          await packManager.setEnabled(packId, false)
          await platform.sitePacks.reconcile()
        } catch (rollbackError) {
          throw new Error(
            `SitePack activation preparation failed: ${String(activationError)}; rollback failed: ${String(rollbackError)}`,
          )
        }
        if (activationError === permissionDeniedError) {
          setPublishFeedback({
            tone: "error",
            message: t("siteAdapterWizardPublishPermissionDenied"),
          })
          return
        }
        throw activationError
      }

      setSavedPackJson(packBuild.json)
      setPublishFeedback({
        tone: "success",
        message: t("siteAdapterWizardPublishSaved", { name: packBuild.manifest.name }),
      })
    } catch (error) {
      console.error("[Ophel] Failed to save wizard SitePack:", error)
      setPublishFeedback({ tone: "error", message: getPublishOperationErrorMessage(error) })
    } finally {
      setPublishAction(null)
    }
  }, [packBuild, packManager, publishAction])

  const handleDownloadPack = useCallback(async () => {
    if (!packBuild.valid || publishAction) return

    setPublishAction("download")
    setPublishFeedback(null)
    const downloaded = await downloadFile(
      packBuild.json,
      packBuild.filename,
      "application/json;charset=utf-8",
    )
    setPublishFeedback({
      tone: downloaded ? "success" : "error",
      message: t(downloaded ? "siteAdapterWizardPublishDownloaded" : "exportFailed"),
    })
    setPublishAction(null)
  }, [packBuild, publishAction])

  const handleOpenContribution = useCallback(async () => {
    if (!packBuild.valid || publishAction) return

    setPublishAction("github")
    setPublishFeedback(null)
    if (!navigator.clipboard?.writeText) {
      setPublishFeedback({
        tone: "error",
        message: t("copyFailed"),
      })
      setPublishAction(null)
      return
    }

    try {
      await navigator.clipboard.writeText(packBuild.json)
    } catch (error) {
      console.error("[Ophel] Failed to copy wizard SitePack JSON:", error)
      setPublishFeedback({
        tone: "error",
        message: t("copyFailed"),
      })
      setPublishAction(null)
      return
    }

    try {
      platform.openTab(packBuild.contributionUrl)
      setPublishFeedback({
        tone: "success",
        message: t("siteAdapterWizardPublishContributionOpened"),
      })
    } catch (error) {
      console.error("[Ophel] Failed to open SitePack contribution page:", error)
      setPublishFeedback({
        tone: "warning",
        message: t("siteAdapterWizardPublishOpenFailed"),
      })
    } finally {
      setPublishAction(null)
    }
  }, [packBuild, publishAction])

  const resetWizard = useCallback(() => {
    setDraft(createEmptySiteAdapterWizardDraft())
    setActiveStepIndex(0)
    setPickerError(null)
    setPublishForm(createPublishForm())
    setPublishAction(null)
    setPublishFeedback(null)
    setSavedPackJson(null)
    setAiResponse("")
    setIsCopyingAiPrompt(false)
    setAiFeedback(null)
  }, [])

  if (isPicking) return null

  if (!isOpen) {
    return (
      <button
        type="button"
        className="gh-site-adapter-wizard-launcher gh-interactive"
        data-testid="site-adapter-wizard-launcher"
        onClick={() => setIsOpen(true)}>
        <span aria-hidden="true" className="gh-site-adapter-wizard-launcher-icon">
          <SparkleIcon size={16} color="currentColor" />
        </span>
        <span>{t(hasProgress ? "siteAdapterWizardResume" : "siteAdapterWizardLauncher")}</span>
      </button>
    )
  }

  const selection = activeStep ? draft.selections[activeStep.id] : null
  const validation = activeStep ? validations[activeStep.id] : null
  const firstIssue = validation?.issues[0]
  const selectorInputId = activeStep ? `gh-site-adapter-selector-${activeStep.id}` : undefined
  const canAdvance = validation?.status === "valid"
  const isLastStep = activeStepIndex === SITE_ADAPTER_WIZARD_STEPS.length - 1

  return (
    <aside
      className="gh-site-adapter-wizard gh-interactive"
      data-testid="site-adapter-wizard"
      role="dialog"
      aria-modal="false"
      aria-labelledby="gh-site-adapter-wizard-title">
      <header className="gh-site-adapter-wizard-header">
        <div className="gh-site-adapter-wizard-heading">
          <span aria-hidden="true" className="gh-site-adapter-wizard-heading-icon">
            <SparkleIcon size={17} color="currentColor" />
          </span>
          <div>
            <h2 id="gh-site-adapter-wizard-title">{t("siteAdapterWizardTitle")}</h2>
            <p>{t("siteAdapterWizardSubtitle")}</p>
          </div>
        </div>
        <button
          type="button"
          className="gh-site-adapter-wizard-icon-button"
          aria-label={t("close")}
          title={t("close")}
          onClick={() => setIsOpen(false)}>
          <ClearIcon size={17} />
        </button>
      </header>

      <details className="gh-site-adapter-wizard-ai" data-testid="site-adapter-ai-assist">
        <summary>
          <span aria-hidden="true" className="gh-site-adapter-wizard-ai-icon">
            <SparkleIcon size={15} color="currentColor" />
          </span>
          <span className="gh-site-adapter-wizard-ai-summary-copy">
            <strong>{t("siteAdapterWizardAiTitle")}</strong>
            <small>{t("siteAdapterWizardAiSummary")}</small>
          </span>
          <span className="gh-site-adapter-wizard-ai-optional">
            {t("siteAdapterWizardAiOptional")}
          </span>
        </summary>
        <div className="gh-site-adapter-wizard-ai-body">
          <p className="gh-site-adapter-wizard-ai-privacy">
            <ShieldCheckIcon size={15} />
            <span>{t("siteAdapterWizardAiPrivacy")}</span>
          </p>
          <button
            type="button"
            className="gh-site-adapter-wizard-ai-copy is-secondary"
            disabled={isCopyingAiPrompt}
            data-testid="site-adapter-ai-copy"
            onClick={() => void handleCopyAiPrompt()}>
            <CopyIcon size={14} />
            {t(isCopyingAiPrompt ? "siteAdapterWizardAiCopying" : "siteAdapterWizardAiCopy")}
          </button>

          <label
            className="gh-site-adapter-wizard-ai-response-label"
            htmlFor="gh-site-adapter-ai-response">
            {t("siteAdapterWizardAiResponseLabel")}
          </label>
          <textarea
            id="gh-site-adapter-ai-response"
            className={aiFeedback?.responseInvalid ? "is-invalid" : ""}
            value={aiResponse}
            rows={6}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={aiFeedback?.responseInvalid ? "true" : undefined}
            data-testid="site-adapter-ai-response"
            placeholder={t("siteAdapterWizardAiResponsePlaceholder")}
            onChange={(event) => {
              setAiResponse(event.target.value)
              setAiFeedback(null)
            }}
          />

          <div className="gh-site-adapter-wizard-ai-actions">
            <p>{t("siteAdapterWizardAiReviewReminder")}</p>
            <button
              type="button"
              className="is-primary"
              disabled={!aiResponse.trim()}
              data-testid="site-adapter-ai-apply"
              onClick={handleApplyAiDraft}>
              <SparkleIcon size={14} color="currentColor" />
              {t("siteAdapterWizardAiApply")}
            </button>
          </div>

          {aiFeedback && (
            <p
              className={`gh-site-adapter-wizard-ai-feedback is-${aiFeedback.tone}`}
              role={aiFeedback.tone === "error" ? "alert" : "status"}
              aria-live="polite"
              data-testid="site-adapter-ai-feedback">
              {aiFeedback.message}
            </p>
          )}
        </div>
      </details>

      {!isComplete && activeStep && validation && (
        <>
          <div className="gh-site-adapter-wizard-progress">
            <div className="gh-site-adapter-wizard-progress-copy">
              <span>
                {t("siteAdapterWizardProgress", {
                  current: String(activeStepIndex + 1),
                  total: String(SITE_ADAPTER_WIZARD_STEPS.length),
                })}
              </span>
              <span className={activeStep.optional ? "is-optional" : "is-required"}>
                {t(activeStep.optional ? "siteAdapterWizardOptional" : "required")}
              </span>
            </div>
            <ol aria-label={t("siteAdapterWizardProgressLabel")}>
              {SITE_ADAPTER_WIZARD_STEPS.map((step, index) => {
                const stepValidation = validations[step.id]
                const stateClass =
                  index === activeStepIndex
                    ? "is-active"
                    : stepValidation.status === "valid"
                      ? "is-complete"
                      : step.optional && index < activeStepIndex && !draft.selections[step.id]
                        ? "is-skipped"
                        : index < activeStepIndex
                          ? "is-attention"
                          : ""
                return (
                  <li
                    key={step.id}
                    className={stateClass}
                    aria-current={index === activeStepIndex ? "step" : undefined}>
                    <span>{index + 1}</span>
                  </li>
                )
              })}
            </ol>
          </div>

          <section className="gh-site-adapter-wizard-step" data-step-id={activeStep.id}>
            <div className="gh-site-adapter-wizard-step-heading">
              <div>
                <h3>{t(activeStep.titleKey)}</h3>
                <p>{t(activeStep.descriptionKey)}</p>
              </div>
              <button
                ref={pickerButtonRef}
                type="button"
                className="gh-site-adapter-wizard-pick-button"
                onClick={() => void handlePick()}>
                <LocateIcon size={16} />
                <span>{t(selection ? "siteAdapterWizardRepick" : "siteAdapterWizardPick")}</span>
              </button>
            </div>

            <label className="gh-site-adapter-wizard-selector-label" htmlFor={selectorInputId}>
              <span>{t("siteAdapterWizardSelectorLabel")}</span>
              {selection && (
                <span className="gh-site-adapter-wizard-selector-source">
                  {t(
                    selection.source === "generated"
                      ? "siteAdapterWizardSelectorGenerated"
                      : selection.source === "ai"
                        ? "siteAdapterWizardAiSelectorSource"
                        : "siteAdapterWizardSelectorManual",
                  )}
                </span>
              )}
            </label>
            <input
              ref={selectorInputRef}
              id={selectorInputId}
              className={`gh-site-adapter-wizard-selector-input ${
                validation.status === "valid"
                  ? "is-valid"
                  : validation.status === "invalid"
                    ? "is-invalid"
                    : ""
              }`}
              type="text"
              value={selection?.selector ?? ""}
              disabled={!selection}
              spellCheck={false}
              autoComplete="off"
              placeholder={
                selection
                  ? t("siteAdapterWizardSelectorPlaceholder")
                  : t("siteAdapterWizardPickFirst")
              }
              onChange={(event) => handleSelectorChange(activeStep.id, event.target.value)}
            />

            <div className="gh-site-adapter-wizard-feedback" aria-live="polite">
              {selection?.generationFailure && (
                <p className="gh-site-adapter-wizard-message is-warning">
                  {t(GENERATION_FAILURE_KEYS[selection.generationFailure])}
                </p>
              )}
              {pickerError && (
                <p className="gh-site-adapter-wizard-message is-error">{pickerError}</p>
              )}
              {firstIssue && validation.status !== "empty" && (
                <p className="gh-site-adapter-wizard-message is-error">
                  {t(VALIDATION_ISSUE_KEYS[firstIssue])}
                  {firstIssue === "selector-invalid" && validation.selectorValidation?.error
                    ? `: ${validation.selectorValidation.error}`
                    : ""}
                </p>
              )}
              {validation.status === "valid" && (
                <p className="gh-site-adapter-wizard-message is-success">
                  <CheckIcon size={14} />
                  {t("siteAdapterWizardStepReady")}
                </p>
              )}
              {validation.selectorValidation?.validSyntax && (
                <div className="gh-site-adapter-wizard-badges">
                  <span>
                    {t("siteAdapterWizardMatchCount", {
                      count: String(validation.selectorValidation.matchCount),
                    })}
                  </span>
                  <span>
                    {t(
                      validation.selectorValidation.isUnique
                        ? "siteAdapterWizardUnique"
                        : "siteAdapterWizardShared",
                    )}
                  </span>
                  {validation.containment === "contained" && (
                    <span className="is-success">{t("siteAdapterWizardContained")}</span>
                  )}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      <section className="gh-site-adapter-wizard-preview">
        <div className="gh-site-adapter-wizard-section-heading">
          <div>
            <span>{t("siteAdapterWizardPreviewEyebrow")}</span>
            <h3>{t("siteAdapterWizardPreviewTitle")}</h3>
          </div>
          {outlinePreview.available && (
            <span className="gh-site-adapter-wizard-ready-badge">
              <CheckIcon size={13} />
              {t("siteAdapterWizardPreviewReady")}
            </span>
          )}
        </div>

        {outlinePreview.available ? (
          <div className="gh-site-adapter-wizard-outline" data-testid="site-adapter-preview">
            <div className="gh-site-adapter-wizard-outline-title">{outlinePreview.title}</div>
            {outlinePreview.items.map((item) => (
              <div
                key={item.role}
                className={`gh-site-adapter-wizard-outline-item is-${item.role}`}>
                <span>
                  {t(item.role === "user" ? "siteAdapterWizardUser" : "siteAdapterWizardAssistant")}
                </span>
                <p>{item.text || t("siteAdapterWizardPreviewNoText")}</p>
                <small>
                  {t("siteAdapterWizardMatchCount", { count: String(item.matchCount) })}
                </small>
              </div>
            ))}
          </div>
        ) : (
          <div className="gh-site-adapter-wizard-preview-empty">
            {t("siteAdapterWizardPreviewEmpty")}
          </div>
        )}

        <div className="gh-site-adapter-wizard-capabilities">
          <h4>{t("siteAdapterWizardCapabilitiesTitle")}</h4>
          {configPreview.capabilities.length > 0 ? (
            <ul>
              {configPreview.capabilities.map((capability) => (
                <li key={capability}>
                  <CheckIcon size={13} />
                  <span>{getCapabilityLabel(capability)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("siteAdapterWizardCapabilitiesEmpty")}</p>
          )}
          {configPreview.conversationItemSelector && (
            <p className="gh-site-adapter-wizard-conversation-note">
              <CheckIcon size={13} />
              {t("siteAdapterWizardConversationCaptured")}
            </p>
          )}
        </div>
      </section>

      {isComplete ? (
        <section className="gh-site-adapter-wizard-complete" data-testid="site-adapter-complete">
          <span aria-hidden="true" className="gh-site-adapter-wizard-complete-icon">
            <CheckIcon size={24} />
          </span>
          <h3>{t("siteAdapterWizardCompleteTitle")}</h3>
          <p>{t("siteAdapterWizardCompleteDesc")}</p>
          <div className="gh-site-adapter-wizard-publish">
            <div className="gh-site-adapter-wizard-publish-heading">
              <span>{t("siteAdapterWizardPublishEyebrow")}</span>
              <h4>{t("siteAdapterWizardPublishTitle")}</h4>
              <p>{t("siteAdapterWizardPublishDesc")}</p>
            </div>

            <div className="gh-site-adapter-wizard-publish-fields">
              <label>
                <span>{t("siteAdapterWizardPublishNameLabel")}</span>
                <input
                  type="text"
                  value={publishForm.name}
                  maxLength={200}
                  autoComplete="off"
                  onChange={(event) => updatePublishForm("name", event.target.value)}
                />
              </label>
              <div className="gh-site-adapter-wizard-publish-field-row">
                <label>
                  <span>{t("siteAdapterWizardPublishIdLabel")}</span>
                  <input
                    type="text"
                    value={publishForm.id}
                    maxLength={40}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) => updatePublishForm("id", event.target.value)}
                  />
                  <small>{t("siteAdapterWizardPublishIdHint")}</small>
                </label>
                <label>
                  <span>{t("version")}</span>
                  <input
                    type="number"
                    value={publishForm.version}
                    min={1}
                    step={1}
                    inputMode="numeric"
                    onChange={(event) => updatePublishForm("version", event.target.value)}
                  />
                  <small>{t("siteAdapterWizardPublishVersionHint")}</small>
                </label>
              </div>
            </div>

            <dl className="gh-site-adapter-wizard-publish-facts">
              <div>
                <dt>{t("siteAdapterWizardPublishOriginLabel")}</dt>
                <dd>{new URL(window.location.href).origin}</dd>
              </div>
              <div>
                <dt>{t("siteAdapterWizardPublishMinVersionLabel")}</dt>
                <dd>{APP_VERSION}</dd>
              </div>
            </dl>

            {configPreview.conversationItemSelector && (
              <p className="gh-site-adapter-wizard-publish-note">
                {t("siteAdapterWizardPublishConversationOmitted")}
              </p>
            )}

            {packBuildError && (
              <p className="gh-site-adapter-wizard-publish-feedback is-error" role="alert">
                {packBuildError}
              </p>
            )}
            {publishFeedback && (
              <p
                className={`gh-site-adapter-wizard-publish-feedback is-${publishFeedback.tone}`}
                role={publishFeedback.tone === "error" ? "alert" : "status"}
                aria-live="polite">
                {publishFeedback.message}
              </p>
            )}

            {savedPackJson && (
              <div className="gh-site-adapter-wizard-reload-callout">
                <div>
                  <strong>{t("siteAdapterWizardPublishReloadTitle")}</strong>
                  <p>{t("siteAdapterWizardPublishReloadDesc")}</p>
                </div>
                <button
                  type="button"
                  className="is-primary"
                  onClick={() => window.location.reload()}>
                  <RefreshIcon size={14} />
                  {t("extensionUpdateNoticeAction")}
                </button>
              </div>
            )}

            <div className="gh-site-adapter-wizard-publish-actions">
              <button
                type="button"
                className="is-secondary"
                disabled={!packBuild.valid || publishAction !== null}
                onClick={() => void handleDownloadPack()}>
                <DownloadIcon size={15} />
                {t(publishAction === "download" ? "exportOverlayDownloading" : "webdavDownloadBtn")}
              </button>
              <button
                type="button"
                className="is-secondary"
                disabled={!packBuild.valid || publishAction !== null}
                onClick={() => void handleOpenContribution()}>
                <GithubIcon size={15} />
                {t(
                  publishAction === "github"
                    ? "siteAdapterWizardPublishOpening"
                    : "siteAdapterWizardPublishGithub",
                )}
              </button>
              <button
                type="button"
                className="is-primary"
                disabled={!packBuild.valid || publishAction !== null}
                onClick={() => void handleSavePack()}>
                <SaveIcon size={15} />
                {t(publishAction === "save" ? "siteAdapterWizardPublishSaving" : "save")}
              </button>
            </div>
          </div>
          <div className="gh-site-adapter-wizard-complete-actions">
            <button type="button" className="is-ghost" onClick={resetWizard}>
              {t("siteAdapterWizardStartOver")}
            </button>
            <button type="button" className="is-secondary" onClick={() => setIsOpen(false)}>
              {t("siteAdapterWizardDone")}
            </button>
          </div>
        </section>
      ) : (
        <footer className="gh-site-adapter-wizard-footer">
          <button
            type="button"
            className="is-secondary"
            disabled={activeStepIndex === 0}
            onClick={goToPreviousStep}>
            {t("siteAdapterWizardBack")}
          </button>
          <div>
            {activeStep?.optional && (
              <button type="button" className="is-ghost" onClick={skipOptionalStep}>
                {t("siteAdapterWizardSkip")}
              </button>
            )}
            <button
              type="button"
              className="is-primary"
              disabled={!canAdvance}
              onClick={goToNextStep}>
              {t(isLastStep ? "siteAdapterWizardFinish" : "siteAdapterWizardNext")}
            </button>
          </div>
        </footer>
      )}
    </aside>
  )
}
