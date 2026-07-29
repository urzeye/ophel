import React, { useMemo, useState } from "react"

import type { SitePackDetectionState } from "~adapters"
import { Button, SelectDropdown, type SelectDropdownOption } from "~components/ui"
import { t } from "~utils/i18n"

interface SitePackDetectionNoticeProps {
  detection: SitePackDetectionState | null
  onSwitch: (packId: string) => Promise<void>
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const SitePackDetectionNotice: React.FC<SitePackDetectionNoticeProps> = ({
  detection,
  onSwitch,
}) => {
  const [selectedPackId, setSelectedPackId] = useState(detection?.activePackId ?? "")
  const [isSwitching, setIsSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const options = useMemo<SelectDropdownOption[]>(
    () =>
      (detection?.candidates ?? []).map((candidate) => ({
        value: candidate.packId,
        label: candidate.name,
        title: candidate.packId,
      })),
    [detection?.candidates],
  )

  if (!detection || detection.candidates.length <= 1 || !detection.activePackId) return null

  const activeCandidate = detection.candidates.find(
    (candidate) => candidate.packId === detection.activePackId,
  )
  const handleSwitch = async () => {
    if (!selectedPackId || selectedPackId === detection.activePackId || isSwitching) return

    setError(null)
    setIsSwitching(true)
    try {
      await onSwitch(selectedPackId)
      setIsSwitching(false)
    } catch (switchError) {
      setError(t("sitePacksOperationFailed", { error: getErrorMessage(switchError) }))
      setIsSwitching(false)
    }
  }

  return (
    <section
      className="gh-site-pack-detect-notice gh-interactive"
      aria-labelledby="gh-site-pack-detect-title"
      role="region">
      <div className="gh-site-pack-detect-copy">
        <strong id="gh-site-pack-detect-title">{t("sitePackDetectMultipleTitle")}</strong>
        <p>
          {t("sitePackDetectMultipleDesc", {
            name: activeCandidate?.name ?? detection.activePackId,
          })}
        </p>
      </div>
      <div className="gh-site-pack-detect-controls">
        <SelectDropdown
          className="gh-site-pack-detect-select"
          buttonClassName="gh-site-pack-detect-select-button"
          options={options}
          value={selectedPackId}
          onChange={setSelectedPackId}
          disabled={isSwitching}
          ariaLabel={t("sitePackDetectSelectLabel")}
        />
        <Button
          type="button"
          className="gh-site-pack-detect-switch"
          variant="primary"
          size="sm"
          disabled={isSwitching || !selectedPackId || selectedPackId === detection.activePackId}
          onClick={() => void handleSwitch()}>
          {t(isSwitching ? "sitePackDetectSwitching" : "sitePackDetectSwitch")}
        </Button>
      </div>
      {error && (
        <p className="gh-site-pack-detect-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
