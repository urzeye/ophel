import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react"

import type { SiteAdapter } from "~adapters/base"
import {
  buildAdapterHealthIssueUrl,
  HealthCheckManager,
  IDLE_HEALTH_CHECK_SNAPSHOT,
  type HealthCheckUpdateResult,
} from "~core/health-check-manager"
import { refreshActiveAdapterConfig } from "~core/site-adapter-config-runtime"
import { platform } from "~platform"
import { getCurrentLang } from "~utils/i18n"

const missingManagerError = () => new Error("Adapter health manager is unavailable")

export function useAdapterHealthCheck(adapter: SiteAdapter | null) {
  const manager = useMemo(
    () =>
      adapter
        ? new HealthCheckManager({
            adapter,
            storage: platform.storage,
            checkForUpdates: () => platform.remoteConfig.checkForUpdates(),
            refreshConfig: () => refreshActiveAdapterConfig(adapter, platform.storage),
          })
        : null,
    [adapter],
  )

  useEffect(() => {
    manager?.start()
    return () => manager?.destroy()
  }, [manager])

  const subscribe = useCallback(
    (listener: () => void) => manager?.subscribe(listener) ?? (() => undefined),
    [manager],
  )
  const getSnapshot = useCallback(
    () => manager?.getSnapshot() ?? IDLE_HEALTH_CHECK_SNAPSHOT,
    [manager],
  )
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const checkConfigurationUpdates = useCallback((): Promise<HealthCheckUpdateResult> => {
    if (!manager) return Promise.reject(missingManagerError())
    return manager.checkConfigurationUpdates()
  }, [manager])

  const openIssueReport = useCallback(() => {
    if (!manager) throw missingManagerError()
    platform.openTab(
      buildAdapterHealthIssueUrl(manager.getSnapshot(), platform.type, getCurrentLang()),
    )
  }, [manager])

  return {
    snapshot,
    checkConfigurationUpdates,
    openIssueReport,
  }
}
