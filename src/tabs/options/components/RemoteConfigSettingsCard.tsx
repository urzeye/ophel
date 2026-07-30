import React, { useCallback, useEffect, useMemo, useState } from "react"

import { CloudIcon, InfoIcon, RefreshIcon } from "~components/icons"
import { Button } from "~components/ui"
import { SUPPORTED_AI_PLATFORMS } from "~constants/defaults"
import { normalizeRemoteConfigSourceUrl } from "~core/remote-config-source"
import type { RemoteConfigState } from "~core/remote-config-types"
import { platform } from "~platform"
import { useSettingsStore } from "~stores/settings-store"
import { IS_DEVELOPMENT_BUILD } from "~utils/config"
import { getCurrentLang, t } from "~utils/i18n"

import { SettingCard } from "./SettingCard"
import { SettingRow, ToggleRow } from "./SettingRow"

type FeedbackTone = "success" | "error" | "neutral"

interface FeedbackState {
  tone: FeedbackTone
  message: string
}

const platformNames = new Map(
  SUPPORTED_AI_PLATFORMS.map(({ id, name }) => [id as string, name] as const),
)

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const formatCheckTime = (timestamp: number): string =>
  new Intl.DateTimeFormat(getCurrentLang(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp))

export const RemoteConfigSettingsCard: React.FC = () => {
  const settings = useSettingsStore((state) => state.settings)
  const updateNestedSetting = useSettingsStore((state) => state.updateNestedSetting)
  const [remoteState, setRemoteState] = useState<RemoteConfigState | null>(null)
  const [isStateLoading, setIsStateLoading] = useState(true)
  const [stateError, setStateError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [resettingSiteId, setResettingSiteId] = useState<string | null>(null)
  const configuredRegistrySource = settings.remoteConfig?.registrySourceUrl ?? ""
  const [registrySourceInput, setRegistrySourceInput] = useState(configuredRegistrySource)
  const [registrySourceError, setRegistrySourceError] = useState<string | null>(null)

  useEffect(() => {
    setRegistrySourceInput(configuredRegistrySource)
    setRegistrySourceError(null)
  }, [configuredRegistrySource])

  const refreshState = useCallback(async (): Promise<boolean> => {
    try {
      const nextState = await platform.remoteConfig.getState()
      setRemoteState(nextState)
      setStateError(null)
      return true
    } catch (error) {
      setStateError(t("remoteConfigStateFailed", { error: getErrorMessage(error) }))
      return false
    }
  }, [])

  useEffect(() => {
    setIsStateLoading(true)
    void refreshState().finally(() => setIsStateLoading(false))
  }, [refreshState])

  const activePatches = useMemo(
    () =>
      Object.entries(remoteState?.active?.patches ?? {})
        .map(([siteId, cachedPatch]) => ({
          siteId,
          siteName: platformNames.get(siteId) ?? siteId,
          patchVersion: cachedPatch.index.patchVersion,
          baseConfigVersion: cachedPatch.index.baseConfigVersion,
        }))
        .sort((left, right) => left.siteName.localeCompare(right.siteName)),
    [remoteState],
  )

  const handleCheckNow = async () => {
    setIsChecking(true)
    setFeedback(null)

    try {
      const result = await platform.remoteConfig.checkForUpdates()
      if (result.status === "failed") {
        setFeedback({
          tone: "error",
          message: t("remoteConfigCheckFailed", {
            error: result.error || t("remoteConfigNotAvailable"),
          }),
        })
      } else if (result.status === "updated") {
        setFeedback({ tone: "success", message: t("remoteConfigCheckUpdated") })
      } else {
        setFeedback({ tone: "neutral", message: t("remoteConfigCheckUpToDate") })
      }
      await refreshState()
    } catch (error) {
      setFeedback({
        tone: "error",
        message: t("remoteConfigCheckFailed", { error: getErrorMessage(error) }),
      })
    } finally {
      setIsChecking(false)
    }
  }

  const handleApplyRegistrySource = () => {
    setFeedback(null)
    const source = registrySourceInput.trim()

    if (!source) {
      updateNestedSetting("remoteConfig", "registrySourceUrl", "")
      setRegistrySourceInput("")
      setRegistrySourceError(null)
      setFeedback({ tone: "success", message: t("remoteConfigRegistrySourceCleared") })
      return
    }

    try {
      const normalizedSource = normalizeRemoteConfigSourceUrl(source)
      updateNestedSetting("remoteConfig", "registrySourceUrl", normalizedSource)
      setRegistrySourceInput(normalizedSource)
      setRegistrySourceError(null)
      setFeedback({ tone: "success", message: t("remoteConfigRegistrySourceApplied") })
    } catch (error) {
      setRegistrySourceError(
        t("remoteConfigRegistrySourceInvalid", { error: getErrorMessage(error) }),
      )
    }
  }

  const handleReset = async (siteId: string, siteName: string, patchVersion: number) => {
    setResettingSiteId(siteId)
    setFeedback(null)

    try {
      const reset = await platform.remoteConfig.resetSite(siteId, patchVersion)
      if (!reset) {
        throw new Error(t("remoteConfigResetUnavailable"))
      }
      setFeedback({
        tone: "success",
        message: t("remoteConfigResetSuccess", { site: siteName }),
      })
      await refreshState()
    } catch (error) {
      setFeedback({
        tone: "error",
        message: t("remoteConfigResetFailed", { error: getErrorMessage(error) }),
      })
    } finally {
      setResettingSiteId(null)
    }
  }

  const registryRevision = remoteState?.active?.index.registryRevision
  const lastCheckAt = remoteState?.lastCheckAt

  return (
    <div aria-busy={isStateLoading || isChecking || resettingSiteId !== null}>
      <SettingCard
        className="remote-config-settings-card"
        title={t("remoteConfigSettingsTitle")}
        description={t("remoteConfigSettingsDesc")}>
        <ToggleRow
          label={t("remoteConfigAutoUpdateLabel")}
          description={t("remoteConfigAutoUpdateDesc")}
          settingId="remote-config-auto-update"
          checked={settings.remoteConfig?.autoUpdate ?? true}
          onChange={() =>
            updateNestedSetting(
              "remoteConfig",
              "autoUpdate",
              !(settings.remoteConfig?.autoUpdate ?? true),
            )
          }
        />

        {IS_DEVELOPMENT_BUILD && (
          <SettingRow
            label={t("remoteConfigRegistrySourceLabel")}
            description={t("remoteConfigRegistrySourceDesc")}
            settingId="remote-config-registry-source">
            <div className="remote-config-source-editor">
              <div className="remote-config-source-controls">
                <input
                  id="remote-config-registry-source-input"
                  type="url"
                  inputMode="url"
                  className="settings-input remote-config-source-input"
                  value={registrySourceInput}
                  placeholder={t("remoteConfigRegistrySourcePlaceholder")}
                  aria-label={t("remoteConfigRegistrySourceLabel")}
                  aria-invalid={registrySourceError ? "true" : undefined}
                  aria-describedby={
                    registrySourceError ? "remote-config-registry-source-error" : undefined
                  }
                  disabled={isChecking || resettingSiteId !== null}
                  spellCheck={false}
                  onChange={(event) => {
                    setRegistrySourceInput(event.target.value)
                    setRegistrySourceError(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return
                    event.preventDefault()
                    if (registrySourceInput.trim() !== configuredRegistrySource) {
                      handleApplyRegistrySource()
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="remote-config-action-button"
                  disabled={
                    isChecking ||
                    resettingSiteId !== null ||
                    registrySourceInput.trim() === configuredRegistrySource
                  }
                  onClick={handleApplyRegistrySource}>
                  {t("remoteConfigRegistrySourceApplyButton")}
                </Button>
              </div>
              {registrySourceError && (
                <span
                  id="remote-config-registry-source-error"
                  className="remote-config-source-error"
                  role="alert">
                  {registrySourceError}
                </span>
              )}
            </div>
          </SettingRow>
        )}

        <SettingRow
          label={t("remoteConfigCheckNowLabel")}
          description={t("remoteConfigCheckNowDesc")}
          settingId="remote-config-check-now">
          <Button
            type="button"
            variant="secondary"
            className="remote-config-action-button"
            disabled={isChecking || resettingSiteId !== null}
            onClick={() => void handleCheckNow()}>
            <RefreshIcon
              size={14}
              className={
                isChecking ? "remote-config-refresh-icon spinning" : "remote-config-refresh-icon"
              }
            />
            {isChecking ? t("remoteConfigCheckingButton") : t("remoteConfigCheckNowButton")}
          </Button>
        </SettingRow>

        {feedback && (
          <div
            className={`remote-config-feedback ${feedback.tone}`}
            role={feedback.tone === "error" ? "alert" : "status"}
            aria-live="polite">
            {feedback.message}
          </div>
        )}

        {stateError && (
          <div className="remote-config-feedback error" role="alert">
            {stateError}
          </div>
        )}

        {(isStateLoading || remoteState) && (
          <>
            <div className="remote-config-metadata" data-setting-id="remote-config-status">
              <div className="remote-config-meta-item">
                <span>{t("remoteConfigRegistryRevisionLabel")}</span>
                <strong>
                  {isStateLoading
                    ? t("remoteConfigStatusLoading")
                    : registryRevision !== undefined
                      ? registryRevision
                      : t("remoteConfigNotAvailable")}
                </strong>
              </div>
              <div className="remote-config-meta-item">
                <span>{t("remoteConfigLastCheckLabel")}</span>
                <strong>
                  {isStateLoading
                    ? t("remoteConfigStatusLoading")
                    : lastCheckAt
                      ? formatCheckTime(lastCheckAt)
                      : t("remoteConfigNeverChecked")}
                </strong>
              </div>
            </div>

            <section
              className="remote-config-patches"
              data-setting-id="remote-config-active-patches">
              <h3>{t("remoteConfigActivePatchesLabel")}</h3>
              {isStateLoading ? (
                <div className="remote-config-empty-state" role="status">
                  <span aria-hidden="true">
                    <RefreshIcon size={20} className="remote-config-refresh-icon spinning" />
                  </span>
                  <span>{t("remoteConfigStatusLoading")}</span>
                </div>
              ) : activePatches.length === 0 ? (
                <div className="remote-config-empty-state">
                  <span aria-hidden="true">
                    <CloudIcon size={20} />
                  </span>
                  <span>{t("remoteConfigUsingBuiltin")}</span>
                </div>
              ) : (
                <div className="remote-config-patch-list">
                  {activePatches.map((patch) => {
                    const isResetting = resettingSiteId === patch.siteId
                    return (
                      <div className="remote-config-patch-item" key={patch.siteId}>
                        <div className="remote-config-patch-info">
                          <strong>{patch.siteName}</strong>
                          <div className="remote-config-patch-versions">
                            <span>
                              {t("remoteConfigPatchVersionLabel")}: {patch.patchVersion}
                            </span>
                            <span>
                              {t("remoteConfigBaseVersionLabel")}: {patch.baseConfigVersion}
                            </span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="remote-config-action-button"
                          disabled={isChecking || resettingSiteId !== null}
                          onClick={() =>
                            void handleReset(patch.siteId, patch.siteName, patch.patchVersion)
                          }>
                          {isResetting
                            ? t("remoteConfigResettingButton")
                            : t("remoteConfigResetBuiltinButton")}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}

        <div className="remote-config-privacy-note">
          <span aria-hidden="true">
            <InfoIcon size={18} />
          </span>
          <div>
            <strong>{t("remoteConfigPrivacyTitle")}</strong>
            <p>{t("remoteConfigPrivacyDesc")}</p>
          </div>
        </div>
      </SettingCard>
    </div>
  )
}

export default RemoteConfigSettingsCard
