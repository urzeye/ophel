import React from "react"

import type {
  HealthCheckSnapshot,
  HealthCheckUpdateResult,
  HealthSelectorKey,
} from "~core/health-check-manager"
import { t } from "~utils/i18n"
import { showToast } from "~utils/toast"

interface SiteAdapterHealthNoticeProps {
  snapshot: HealthCheckSnapshot
  onCheckUpdates: () => Promise<HealthCheckUpdateResult>
  onReportIssue: () => void
}

const SELECTOR_LABEL_KEYS: Record<HealthSelectorKey, string> = {
  textarea: "healthCheckSelectorTextarea",
  responseContainer: "healthCheckSelectorResponseContainer",
  chatContent: "healthCheckSelectorChatContent",
}

const getDescription = (snapshot: HealthCheckSnapshot): string => {
  const context = snapshot.context
  if (!context) return t("healthCheckSiteChangedDesc")

  if (snapshot.warningReason === "site-pack-update") {
    return t("healthCheckUpdateAvailableDesc", {
      name: context.siteName,
      current: String(context.activeVersion ?? "?"),
      latest: String(context.registryVersion ?? "?"),
    })
  }
  if (snapshot.warningReason === "local-site-pack") {
    return t("healthCheckLocalPackDesc", {
      version: String(context.activeVersion ?? "?"),
    })
  }
  return t("healthCheckSiteChangedDesc")
}

export const SiteAdapterHealthNotice: React.FC<SiteAdapterHealthNoticeProps> = ({
  snapshot,
  onCheckUpdates,
  onReportIssue,
}) => {
  if (snapshot.phase !== "warning" || !snapshot.context) return null

  const failedLabels = snapshot.failedSelectors
    .map((failure) => t(SELECTOR_LABEL_KEYS[failure.key]))
    .join(" · ")

  const handleCheckUpdates = async () => {
    try {
      const result = await onCheckUpdates()
      showToast(t(result.recovered ? "healthCheckRecovered" : "healthCheckStillFailing"), 3000)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      showToast(t("remoteConfigCheckFailed", { error: message }), 3000)
    }
  }

  return (
    <section
      className="gh-site-adapter-health-notice gh-interactive"
      role="status"
      aria-live="polite"
      aria-labelledby="gh-site-adapter-health-title"
      aria-busy={snapshot.isCheckingUpdates}>
      <div className="gh-site-adapter-health-heading">
        <svg
          className="gh-site-adapter-health-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true">
          <path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
        <strong id="gh-site-adapter-health-title">{t("healthCheckTitle")}</strong>
      </div>
      <p className="gh-site-adapter-health-description">{getDescription(snapshot)}</p>
      <p className="gh-site-adapter-health-failures">
        <span>{t("healthCheckFailedSelectorsLabel")}</span>
        {failedLabels}
      </p>
      <div className="gh-site-adapter-health-actions">
        {snapshot.context.canCheckUpdates && (
          <button
            type="button"
            className="gh-site-adapter-health-button gh-site-adapter-health-button--primary"
            disabled={snapshot.isCheckingUpdates}
            onClick={() => void handleCheckUpdates()}>
            {t(
              snapshot.isCheckingUpdates ? "remoteConfigCheckingButton" : "healthCheckCheckUpdates",
            )}
          </button>
        )}
        <button type="button" className="gh-site-adapter-health-button" onClick={onReportIssue}>
          {t("healthCheckReportIssue")}
        </button>
      </div>
      {snapshot.updateError && (
        <p className="gh-site-adapter-health-error" role="alert">
          {t("remoteConfigCheckFailed", { error: snapshot.updateError })}
        </p>
      )}
    </section>
  )
}
