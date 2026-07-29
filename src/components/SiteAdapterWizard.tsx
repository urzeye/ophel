import React, { useCallback, useEffect, useMemo, useState } from "react"

import {
  generateStableSelector,
  type StableSelectorFailureReason,
} from "~core/element-selector-generator"
import { ElementPickerBusyError, startElementPicker } from "~core/element-picker-controller"
import {
  SITE_ADAPTER_WIZARD_STEPS,
  buildSiteAdapterWizardConfigPreview,
  buildSiteAdapterWizardOutlinePreview,
  createEmptySiteAdapterWizardDraft,
  normalizeSiteAdapterWizardTarget,
  updateSiteAdapterWizardSelection,
  validateSiteAdapterWizardDraft,
  type SiteAdapterWizardDraft,
  type SiteAdapterWizardStepId,
  type SiteAdapterWizardValidationIssue,
} from "~core/site-adapter-wizard"
import { t } from "~utils/i18n"

import { CheckIcon, ClearIcon, LocateIcon, SparkleIcon } from "./icons"

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
  "export-basic": "siteAdapterWizardCapabilityExport",
  "reading-history": "siteAdapterWizardCapabilityHistory",
  "new-chat": "siteAdapterWizardCapabilityNewChat",
} as const

const DOM_REFRESH_DELAY_MS = 180

const getCapabilityLabel = (capability: string): string => {
  const key = CAPABILITY_LABEL_KEYS[capability as keyof typeof CAPABILITY_LABEL_KEYS]
  return key ? t(key) : capability
}

const hasDraftProgress = (draft: SiteAdapterWizardDraft, activeStepIndex: number): boolean =>
  activeStepIndex > 0 || Object.keys(draft.selections).length > 0

export function SiteAdapterWizard() {
  const [isOpen, setIsOpen] = useState(false)
  const [isPicking, setIsPicking] = useState(false)
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [draft, setDraft] = useState<SiteAdapterWizardDraft>(createEmptySiteAdapterWizardDraft)
  const [pickerError, setPickerError] = useState<string | null>(null)
  const [domRevision, setDomRevision] = useState(0)

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
  const firstInvalidRequiredStepIndex = SITE_ADAPTER_WIZARD_STEPS.findIndex(
    (step) => !step.optional && validations[step.id].status !== "valid",
  )

  useEffect(() => {
    if (!isComplete || firstInvalidRequiredStepIndex === -1) return
    setActiveStepIndex(firstInvalidRequiredStepIndex)
  }, [firstInvalidRequiredStepIndex, isComplete])

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

  const resetWizard = useCallback(() => {
    setDraft(createEmptySiteAdapterWizardDraft())
    setActiveStepIndex(0)
    setPickerError(null)
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
                      : "siteAdapterWizardSelectorManual",
                  )}
                </span>
              )}
            </label>
            <input
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
          <p className="gh-site-adapter-wizard-next-stage">{t("siteAdapterWizardSaveLater")}</p>
          <div className="gh-site-adapter-wizard-complete-actions">
            <button type="button" className="is-secondary" onClick={resetWizard}>
              {t("siteAdapterWizardStartOver")}
            </button>
            <button type="button" className="is-primary" onClick={() => setIsOpen(false)}>
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
