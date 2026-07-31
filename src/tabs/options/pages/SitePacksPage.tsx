import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

import { resolveSitePackDescription, resolveSitePackName } from "~adapters/declarative/localization"
import { siteMatchPatternOriginPatternCovers } from "~adapters/declarative/match-pattern"
import type { SitePackManifest } from "~adapters/declarative/types"
import { SITE_PACK_MAX_BYTES, type SitePackValidationError } from "~adapters/declarative/validate"
import {
  CloudIcon,
  CopyIcon,
  DeleteIcon,
  ExternalLinkIcon,
  ImportIcon,
  InfoIcon,
  JSONFileIcon,
  RefreshIcon,
} from "~components/icons"
import { Button, Input, SelectDropdown, Switch, type SelectDropdownOption } from "~components/ui"
import { SITE_PACKS_TAB_IDS } from "~constants"
import { SUPPORTED_AI_PLATFORMS } from "~constants/defaults"
import {
  INSTALLED_SITE_PACKS_STORAGE_KEY,
  isInstalledSitePackEffectivelyEnabled,
  PackManagerError,
  type InstalledSitePack,
  type PackManagerIssue,
} from "~core/pack-manager"
import { createRuntimePackManager } from "~core/pack-manager-runtime"
import { normalizeRemoteConfigSourceUrl } from "~core/remote-config-source"
import {
  canonicalizeSitePackBindingOrigin,
  createEmptySitePackOriginBindingsState,
  SitePackOriginBindingsError,
  type SitePackOriginBinding,
  type SitePackOriginBindingsState,
} from "~core/site-pack-origin-bindings"
import {
  collapseCoveredSitePackOriginPatterns,
  deriveSitePackOriginReferences,
  sitePackBindingOriginPattern,
} from "~core/site-pack-origin-references"
import { SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY } from "~core/site-pack-storage-constants"
import {
  REMOTE_CONFIG_STORAGE_KEY,
  type RemoteConfigState,
  type RemoteConfigCheckResult,
} from "~core/remote-config-types"
import { platform, type SitePackRuntimeStatus } from "~platform"
import {
  getCurrentUserscriptMatchCoverageInfo,
  userscriptMatchPatternsCoverOriginPattern,
} from "~platform/userscript-match-coverage"
import { useSettingsStore } from "~stores/settings-store"
import { PageTitle, SettingRow, TabGroup, ToggleRow } from "~tabs/options/components"
import { IS_DEVELOPMENT_BUILD } from "~utils/config"
import { getCurrentLang, subscribeI18nChanges, t } from "~utils/i18n"
import { showToast } from "~utils/toast"

import {
  buildRegistrySitePackViews,
  parseSitePackImport,
  selectRuntimePreparationPacks,
  type RegistrySitePackAvailability,
  type RegistrySitePackView,
} from "../site-pack-manager-view"

const SITE_PACK_GUIDE_URL = "https://urzeye.github.io/ophel/site-packs/"
const ERROR_TOAST_DURATION = 3500

const builtinPlatformNames = new Map(
  SUPPORTED_AI_PLATFORMS.map(({ id, name }) => [id as string, name] as const),
)

type ConfirmationState =
  | {
      type: "import"
      manifest: SitePackManifest
      fileName: string
      isUpdate: boolean
    }
  | {
      type: "uninstall"
      pack: InstalledSitePack
    }

interface ValidationReport {
  title: string
  errors: SitePackValidationError[]
}

interface SitePackDialogProps {
  title: string
  confirmText: string
  /** notice 变体只提供关闭按钮，用于展示无需确认的只读详情。 */
  variant?: "confirm" | "notice"
  danger?: boolean
  busy?: boolean
  children: React.ReactNode
  restoreFocusTo?: HTMLElement | null
  restoreFocusFallback?: () => HTMLElement | null
  onConfirm: () => void
  onCancel: () => void
}

const getDeepActiveElement = (): HTMLElement | null => {
  let activeElement: Element | null = document.activeElement
  while (activeElement?.shadowRoot?.activeElement) {
    activeElement = activeElement.shadowRoot.activeElement
  }
  return activeElement instanceof HTMLElement ? activeElement : null
}

const SitePackDialog: React.FC<SitePackDialogProps> = ({
  title,
  confirmText,
  variant = "confirm",
  danger = false,
  busy = false,
  children,
  restoreFocusTo,
  restoreFocusFallback,
  onConfirm,
  onCancel,
}) => {
  const titleId = React.useId()
  const descriptionId = React.useId()
  const dialogRef = useRef<HTMLElement>(null)
  const busyRef = useRef(busy)

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    const restoreElement = restoreFocusTo ?? getDeepActiveElement()
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>('[data-autofocus="true"]')
        ?.focus({ preventScroll: true })
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault()
        onCancel()
        return
      }

      if (event.key !== "Tab") return
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      if (focusable.length === 0) return

      const activeElement = getDeepActiveElement()
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!activeElement || !dialogRef.current?.contains(activeElement)) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus({ preventScroll: true })
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener("keydown", handleKeyDown)
      const focusTarget = restoreElement?.isConnected ? restoreElement : restoreFocusFallback?.()
      if (focusTarget?.isConnected) {
        focusTarget.focus({ preventScroll: true })
      }
    }
  }, [onCancel, restoreFocusFallback, restoreFocusTo])

  return (
    <div
      className="settings-pack-dialog-overlay"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel()
      }}>
      <section
        ref={dialogRef}
        className="settings-pack-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}>
        <h2 id={titleId}>{title}</h2>
        <div id={descriptionId} className="settings-pack-dialog-content">
          {children}
        </div>
        <div className="settings-pack-dialog-actions">
          {variant === "confirm" && (
            <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
              {t("cancel")}
            </Button>
          )}
          <Button
            type="button"
            variant={danger ? "danger" : "primary"}
            disabled={busy}
            data-autofocus="true"
            onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </section>
    </div>
  )
}

const SitePackListSkeleton: React.FC = () => (
  <div className="settings-pack-list" aria-hidden="true">
    {[0, 1].map((index) => (
      <div className="settings-pack-item settings-pack-skeleton" key={index}>
        <span className="settings-pack-skeleton-icon" />
        <div className="settings-pack-skeleton-lines">
          <span />
          <span />
        </div>
      </div>
    ))}
  </div>
)

interface InlineErrorProps {
  message: string
  onRetry: () => void
}

const InlineError: React.FC<InlineErrorProps> = ({ message, onRetry }) => (
  <div className="settings-pack-inline-error" role="alert">
    <span>{message}</span>
    <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
      {t("refresh")}
    </Button>
  </div>
)

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const getValidationErrors = (error: unknown): SitePackValidationError[] | undefined =>
  error instanceof PackManagerError ? error.validationErrors : undefined

const getBusyPackId = (key: string): string | null => {
  for (const prefix of [
    "toggle:",
    "update:",
    "install:",
    "permission:",
    "confirm:import:",
  ] as const) {
    if (key.startsWith(prefix)) return key.slice(prefix.length)
  }
  const uninstallPrefix = "confirm:uninstall:"
  return key.startsWith(uninstallPrefix) ? key.slice(uninstallPrefix.length) : null
}

const isRegistryBusyKey = (key: string): boolean =>
  key === "registry:refresh" || key.startsWith("update:") || key.startsWith("install:")

const mergePackManagerIssues = (
  ...groups: readonly (readonly PackManagerIssue[])[]
): PackManagerIssue[] => {
  const issues = new Map<string, PackManagerIssue>()
  for (const issue of groups.flat()) {
    issues.set(`${issue.code}|${issue.packId ?? ""}|${issue.message}`, issue)
  }
  return Array.from(issues.values())
}

const getInstalledPackStatus = (
  pack: InstalledSitePack,
): { tone: "warning" | "danger"; label: string } | null => {
  if (pack.source !== "registry" || pack.registryStatus === "available") return null
  if (pack.registryStatus === "disabled") {
    return { tone: "danger", label: t("sitePacksStatusDisabled") }
  }
  return { tone: "warning", label: t("sitePacksStatusUnavailable") }
}

const getRegistryAvailabilityLabel = (availability: RegistrySitePackAvailability): string => {
  if (availability === "disabled") return t("sitePacksStatusDisabled")
  if (availability === "incompatible") return t("sitePacksStatusIncompatible")
  return t("sitePacksStatusAvailable")
}

const getRegistryAvailabilityTone = (
  availability: RegistrySitePackAvailability,
): "success" | "warning" | "danger" => {
  if (availability === "disabled") return "danger"
  if (availability === "incompatible") return "warning"
  return "success"
}

const formatCheckTime = (timestamp: number): string =>
  new Intl.DateTimeFormat(getCurrentLang(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp))

const notify = (message: string) => showToast(message)
const notifyError = (message: string) => showToast(message, ERROR_TOAST_DURATION)

interface SitePacksPageProps {
  initialTab?: string
}

const SitePacksPage: React.FC<SitePacksPageProps> = ({ initialTab }) => {
  const currentLanguage = useSyncExternalStore(subscribeI18nChanges, getCurrentLang, getCurrentLang)
  const packManager = useMemo(() => createRuntimePackManager(platform.storage), [])
  const settings = useSettingsStore((state) => state.settings)
  const updateNestedSetting = useSettingsStore((state) => state.updateNestedSetting)
  const pageRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const confirmationTriggerRef = useRef<HTMLElement | null>(null)
  const busyKeysRef = useRef<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<string>(
    initialTab && Object.values(SITE_PACKS_TAB_IDS).some((id) => id === initialTab)
      ? initialTab
      : SITE_PACKS_TAB_IDS.INSTALLED,
  )
  const [installedPacks, setInstalledPacks] = useState<InstalledSitePack[]>([])
  const [originBindings, setOriginBindings] = useState<SitePackOriginBindingsState>(
    createEmptySitePackOriginBindingsState,
  )
  const [snapshotIssues, setSnapshotIssues] = useState<PackManagerIssue[]>([])
  const [remoteState, setRemoteState] = useState<RemoteConfigState | null>(null)
  const [runtimeStatus, setRuntimeStatus] = useState<SitePackRuntimeStatus>({
    activeOrigins: [],
    missingPermissionOrigins: [],
    originReferences: [],
    bindingIssues: [],
  })
  const [isInstalledLoading, setIsInstalledLoading] = useState(true)
  const [isBindingsLoading, setIsBindingsLoading] = useState(true)
  const [isRegistryLoading, setIsRegistryLoading] = useState(true)
  const [isRuntimeLoading, setIsRuntimeLoading] = useState(true)
  const [installedError, setInstalledError] = useState<string | null>(null)
  const [bindingsError, setBindingsError] = useState<string | null>(null)
  const [registryError, setRegistryError] = useState<string | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null)
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null)
  const [bindingOrigin, setBindingOrigin] = useState("")
  const [bindingMode, setBindingMode] = useState<SitePackOriginBinding["mode"]>("explicit")
  const [bindingPackId, setBindingPackId] = useState("")
  const [resettingSiteId, setResettingSiteId] = useState<string | null>(null)
  const configuredRegistrySource = settings.remoteConfig?.registrySourceUrl ?? ""
  const [registrySourceInput, setRegistrySourceInput] = useState(configuredRegistrySource)
  const [registrySourceError, setRegistrySourceError] = useState<string | null>(null)

  const beginBusy = useCallback((key: string): boolean => {
    const current = busyKeysRef.current
    if (current.has(key)) return false

    const packId = getBusyPackId(key)
    if (packId && Array.from(current).some((activeKey) => getBusyPackId(activeKey) === packId)) {
      return false
    }
    if (isRegistryBusyKey(key) && Array.from(current).some(isRegistryBusyKey)) return false

    const next = new Set(current)
    next.add(key)
    busyKeysRef.current = next
    setBusyKeys(next)
    return true
  }, [])

  const endBusy = useCallback((key: string) => {
    const current = busyKeysRef.current
    if (!current.has(key)) return
    const next = new Set(current)
    next.delete(key)
    busyKeysRef.current = next
    setBusyKeys(next)
  }, [])

  const sortedInstalledPacks = useMemo(
    () =>
      [...installedPacks].sort(
        (left, right) =>
          resolveSitePackName(left.manifest, currentLanguage).localeCompare(
            resolveSitePackName(right.manifest, currentLanguage),
          ) || left.manifest.id.localeCompare(right.manifest.id),
      ),
    [currentLanguage, installedPacks],
  )
  const installedById = useMemo(
    () => new Map(installedPacks.map((pack) => [pack.manifest.id, pack] as const)),
    [installedPacks],
  )
  const detectPacks = useMemo(
    () => sortedInstalledPacks.filter((pack) => Boolean(pack.manifest.detect?.length)),
    [sortedInstalledPacks],
  )
  const bindingModeOptions: SelectDropdownOption[] = [
    { value: "explicit", label: t("sitePacksBindingModeExplicit") },
    {
      value: "detect",
      label: t("sitePacksBindingModeDetect"),
      disabled: detectPacks.length === 0,
    },
  ]
  const bindingPackOptions = useMemo<SelectDropdownOption[]>(
    () =>
      sortedInstalledPacks.map((pack) => ({
        value: pack.manifest.id,
        label: resolveSitePackName(pack.manifest, currentLanguage),
        title: pack.manifest.id,
      })),
    [currentLanguage, sortedInstalledPacks],
  )
  const sortedOriginBindings = useMemo(
    () =>
      Object.entries(originBindings.bindings).sort(([left], [right]) => left.localeCompare(right)),
    [originBindings.bindings],
  )
  const userscriptMatchInfo = useMemo(
    () => (platform.type === "userscript" ? getCurrentUserscriptMatchCoverageInfo() : null),
    [],
  )
  const userscriptReferenceGraph = useMemo(
    () =>
      platform.type === "userscript"
        ? deriveSitePackOriginReferences(installedPacks, originBindings)
        : null,
    [installedPacks, originBindings],
  )
  const requiredUserscriptOriginPatterns = useMemo(() => {
    if (!userscriptReferenceGraph) return []
    return collapseCoveredSitePackOriginPatterns(
      userscriptReferenceGraph.originReferences.map(({ originPattern }) => originPattern),
    )
  }, [userscriptReferenceGraph])
  const missingUserscriptOriginPatterns = useMemo(() => {
    if (!userscriptMatchInfo) return []
    return requiredUserscriptOriginPatterns.filter(
      (originPattern) =>
        !userscriptMatchPatternsCoverOriginPattern(
          userscriptMatchInfo.matchPatterns,
          originPattern,
        ),
    )
  }, [requiredUserscriptOriginPatterns, userscriptMatchInfo])
  const canonicalFormOrigin = useMemo(() => {
    try {
      return canonicalizeSitePackBindingOrigin(bindingOrigin)
    } catch {
      return null
    }
  }, [bindingOrigin])
  const isUpdatingBinding = Boolean(
    canonicalFormOrigin && originBindings.bindings[canonicalFormOrigin],
  )
  const registryViews = useMemo(
    () => buildRegistrySitePackViews(remoteState, installedPacks, currentLanguage),
    [currentLanguage, installedPacks, remoteState],
  )
  const activePatches = useMemo(
    () =>
      Object.entries(remoteState?.active?.patches ?? {})
        .map(([siteId, cachedPatch]) => ({
          siteId,
          siteName: builtinPlatformNames.get(siteId) ?? siteId,
          patchVersion: cachedPatch.index.patchVersion,
          baseConfigVersion: cachedPatch.index.baseConfigVersion,
        }))
        .sort((left, right) => left.siteName.localeCompare(right.siteName)),
    [remoteState],
  )
  const permissionReviewPacks = useMemo(() => {
    const missingOrigins = new Set(runtimeStatus.missingPermissionOrigins)
    if (missingOrigins.size === 0) return []
    const packIds = new Set(
      runtimeStatus.originReferences
        .filter((entry) => missingOrigins.has(entry.originPattern))
        .flatMap((entry) => entry.references.map((reference) => reference.packId)),
    )
    return sortedInstalledPacks.filter(
      (pack) => isInstalledSitePackEffectivelyEnabled(pack) && packIds.has(pack.manifest.id),
    )
  }, [runtimeStatus.missingPermissionOrigins, runtimeStatus.originReferences, sortedInstalledPacks])
  const isRegistryBusy = useMemo(() => Array.from(busyKeys).some(isRegistryBusyKey), [busyKeys])
  const isImportBusy = useMemo(
    () =>
      Array.from(busyKeys).some(
        (key) => key === "import:read" || key.startsWith("confirm:import:"),
      ),
    [busyKeys],
  )
  const isPackBusy = useCallback(
    (packId: string) => Array.from(busyKeys).some((key) => getBusyPackId(key) === packId),
    [busyKeys],
  )
  const isBindingBusy = useMemo(
    () => Array.from(busyKeys).some((key) => key.startsWith("binding:")),
    [busyKeys],
  )
  const getConfirmationFocusFallback = useCallback(
    () =>
      pageRef.current?.querySelector<HTMLElement>('[data-site-pack-import-trigger="persistent"]') ??
      pageRef.current,
    [],
  )

  const loadInstalledPacks = useCallback(
    async (showLoading = false) => {
      if (showLoading) setIsInstalledLoading(true)
      try {
        const snapshot = await packManager.getSnapshot()
        setInstalledPacks(snapshot.packs)
        setSnapshotIssues(snapshot.issues)
        setInstalledError(null)
        return snapshot
      } catch (error) {
        setInstalledError(t("sitePacksLoadFailed", { error: getErrorMessage(error) }))
        return null
      } finally {
        if (showLoading) setIsInstalledLoading(false)
      }
    },
    [packManager],
  )

  const loadRegistryState = useCallback(async (showLoading = false) => {
    if (showLoading) setIsRegistryLoading(true)
    try {
      const state = await platform.remoteConfig.getState()
      setRemoteState(state)
      setRegistryError(null)
      return state
    } catch (error) {
      setRegistryError(t("sitePacksLoadFailed", { error: getErrorMessage(error) }))
      return null
    } finally {
      if (showLoading) setIsRegistryLoading(false)
    }
  }, [])

  const loadOriginBindings = useCallback(
    async (showLoading = false) => {
      if (showLoading) setIsBindingsLoading(true)
      try {
        const state = await packManager.getOriginBindings()
        setOriginBindings(state)
        setBindingsError(null)
        return state
      } catch (error) {
        setBindingsError(t("sitePacksLoadFailed", { error: getErrorMessage(error) }))
        return null
      } finally {
        if (showLoading) setIsBindingsLoading(false)
      }
    },
    [packManager],
  )

  const syncRuntimeStatus = useCallback(async () => {
    const status = await platform.sitePacks.reconcile()
    setRuntimeStatus(status)
    setRuntimeError(null)
    return status
  }, [])

  const loadRuntimeStatus = useCallback(
    async (showLoading = false) => {
      if (showLoading) setIsRuntimeLoading(true)
      try {
        return await syncRuntimeStatus()
      } catch (error) {
        setRuntimeError(t("sitePacksOperationFailed", { error: getErrorMessage(error) }))
        return null
      } finally {
        if (showLoading) setIsRuntimeLoading(false)
      }
    },
    [syncRuntimeStatus],
  )

  useEffect(() => {
    void Promise.all([
      loadInstalledPacks(true),
      loadOriginBindings(true),
      loadRegistryState(true),
      loadRuntimeStatus(true),
    ])
  }, [loadInstalledPacks, loadOriginBindings, loadRegistryState, loadRuntimeStatus])

  useEffect(() => {
    setRegistrySourceInput(configuredRegistrySource)
    setRegistrySourceError(null)
  }, [configuredRegistrySource])

  useEffect(() => {
    if (bindingPackId && installedById.has(bindingPackId)) return
    setBindingPackId(sortedInstalledPacks[0]?.manifest.id ?? "")
  }, [bindingPackId, installedById, sortedInstalledPacks])

  useEffect(() => {
    const stopInstalledWatch = platform.storage.watch(INSTALLED_SITE_PACKS_STORAGE_KEY, () => {
      void Promise.all([loadInstalledPacks(), loadOriginBindings(), loadRuntimeStatus()])
    })
    const stopBindingsWatch = platform.storage.watch(SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY, () => {
      void Promise.all([loadOriginBindings(), loadRuntimeStatus()])
    })
    const stopRegistryWatch = platform.storage.watch(REMOTE_CONFIG_STORAGE_KEY, () => {
      void loadRegistryState()
    })
    return () => {
      stopInstalledWatch()
      stopBindingsWatch()
      stopRegistryWatch()
    }
  }, [loadInstalledPacks, loadOriginBindings, loadRegistryState, loadRuntimeStatus])

  const closeConfirmation = useCallback(() => setConfirmation(null), [])

  const reportOperationError = useCallback((error: unknown) => {
    const validationErrors = getValidationErrors(error)
    notifyError(t("sitePacksOperationFailed", { error: getErrorMessage(error) }))
    if (validationErrors && validationErrors.length > 0) {
      setValidationReport({ title: t("sitePacksValidationErrorsTitle"), errors: validationErrors })
    }
  }, [])

  const reportPermissionDenied = useCallback((pack: InstalledSitePack) => {
    notifyError(
      t("sitePacksPermissionDenied", {
        name: resolveSitePackName(pack.manifest, getCurrentLang()),
      }),
    )
  }, [])

  const rollbackOriginBinding = useCallback(
    async (
      origin: string,
      previousBinding: SitePackOriginBinding | undefined,
      operationError: unknown,
    ): Promise<never> => {
      try {
        if (previousBinding) {
          await packManager.setOriginBinding(origin, previousBinding)
        } else {
          await packManager.removeOriginBinding(origin)
        }
        await syncRuntimeStatus()
        await loadOriginBindings()
      } catch (rollbackError) {
        throw new Error(
          `SitePack origin binding operation failed: ${getErrorMessage(operationError)}; rollback failed: ${getErrorMessage(rollbackError)}`,
        )
      }
      throw operationError
    },
    [loadOriginBindings, packManager, syncRuntimeStatus],
  )

  const handleSaveOriginBinding = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const key = "binding:save"
    if (!beginBusy(key)) return

    let origin: string | null = null
    let previousBinding: SitePackOriginBinding | undefined
    let shouldRollback = false
    try {
      origin = canonicalizeSitePackBindingOrigin(bindingOrigin)
      const binding: SitePackOriginBinding =
        bindingMode === "explicit"
          ? { mode: "explicit", packId: bindingPackId }
          : { mode: "detect" }

      if (binding.mode === "explicit" && !installedById.has(binding.packId)) {
        throw new Error(t("sitePacksBindingPackRequired"))
      }
      if (binding.mode === "detect" && detectPacks.length === 0) {
        throw new Error(t("sitePacksBindingDetectRequired"))
      }

      previousBinding = originBindings.bindings[origin]
      const requestName =
        binding.mode === "explicit"
          ? resolveSitePackName(installedById.get(binding.packId)!.manifest, getCurrentLang())
          : t("sitePacksBindingModeDetect")
      const permission = await platform.sitePacks.ensureBindingOrigin(origin, binding, requestName)
      if (permission === "denied") {
        notifyError(t("sitePacksBindingPermissionDenied", { origin }))
        return
      }

      shouldRollback = true
      await packManager.setOriginBinding(origin, binding)
      await syncRuntimeStatus()
      await loadOriginBindings()
      shouldRollback = false
      setBindingOrigin(origin)
      notify(t("saveSuccess"))
    } catch (error) {
      if (shouldRollback && origin) {
        try {
          await rollbackOriginBinding(origin, previousBinding, error)
        } catch (rollbackResult) {
          reportOperationError(rollbackResult)
        }
      } else if (error instanceof SitePackOriginBindingsError && error.code === "invalid-origin") {
        notifyError(t("sitePacksBindingHint"))
      } else {
        reportOperationError(error)
      }
    } finally {
      endBusy(key)
    }
  }

  const handleRemoveOriginBinding = async (origin: string) => {
    const key = `binding:remove:${origin}`
    if (!beginBusy(key)) return

    const previousBinding = originBindings.bindings[origin]
    try {
      await packManager.removeOriginBinding(origin)
      try {
        await syncRuntimeStatus()
        await loadOriginBindings()
      } catch (error) {
        await rollbackOriginBinding(origin, previousBinding, error)
      }
      notify(t("deleteSuccess"))
    } catch (error) {
      reportOperationError(error)
    } finally {
      endBusy(key)
    }
  }

  const handleCopyUserscriptPattern = async (pattern: string) => {
    try {
      await navigator.clipboard.writeText(pattern)
      notify(t("copied"))
    } catch (error) {
      console.error("Failed to copy userscript match pattern:", error)
      notifyError(t("copyFailed"))
    }
  }

  const rollbackRuntimeActivation = useCallback(
    async (packIds: readonly string[], activationError: unknown): Promise<never> => {
      try {
        for (const packId of new Set(packIds)) {
          await packManager.setEnabled(packId, false)
        }
        await syncRuntimeStatus()
      } catch (rollbackError) {
        throw new Error(
          `SitePack activation failed: ${getErrorMessage(activationError)}; rollback failed: ${getErrorMessage(rollbackError)}`,
        )
      }
      throw activationError
    },
    [packManager, syncRuntimeStatus],
  )

  const prepareInstalledPacksRuntime = useCallback(
    async (packs: readonly InstalledSitePack[]): Promise<InstalledSitePack[]> => {
      const effectivePacks = packs.filter(isInstalledSitePackEffectivelyEnabled)
      const deniedPacks: InstalledSitePack[] = []
      try {
        for (const pack of effectivePacks) {
          const permission = await platform.sitePacks.ensureOrigins(pack.manifest.id)
          if (permission !== "denied") continue
          await packManager.setEnabled(pack.manifest.id, false)
          deniedPacks.push(pack)
        }
        await syncRuntimeStatus()
        return deniedPacks
      } catch (error) {
        await rollbackRuntimeActivation(
          effectivePacks.map((pack) => pack.manifest.id),
          error,
        )
      }
    },
    [packManager, rollbackRuntimeActivation, syncRuntimeStatus],
  )

  const handleToggleEnabled = async (pack: InstalledSitePack) => {
    const nextEnabled = !pack.enabled
    const key = `toggle:${pack.manifest.id}`
    if (!beginBusy(key)) return
    try {
      if (nextEnabled) {
        const permission = await platform.sitePacks.ensureOrigins(pack.manifest.id)
        if (permission === "denied") {
          reportPermissionDenied(pack)
          return
        }
        try {
          await packManager.setEnabled(pack.manifest.id, true)
          await syncRuntimeStatus()
        } catch (error) {
          await rollbackRuntimeActivation([pack.manifest.id], error)
        }
      } else {
        await packManager.setEnabled(pack.manifest.id, false)
        await syncRuntimeStatus()
      }
      await loadInstalledPacks()
      notify(
        t("sitePacksStateChanged", {
          name: resolveSitePackName(pack.manifest, getCurrentLang()),
          state: t(nextEnabled ? "sitePacksEnabledState" : "sitePacksDisabledState"),
        }),
      )
    } catch (error) {
      await loadInstalledPacks()
      reportOperationError(error)
    } finally {
      endBusy(key)
    }
  }

  const handleReauthorizePack = async (pack: InstalledSitePack) => {
    const key = `permission:${pack.manifest.id}`
    if (!beginBusy(key)) return
    try {
      const permission = await platform.sitePacks.ensureOrigins(pack.manifest.id)
      if (permission === "denied") {
        await Promise.all([loadInstalledPacks(), loadRuntimeStatus()])
        reportPermissionDenied(pack)
        return
      }
      await Promise.all([loadInstalledPacks(), syncRuntimeStatus()])
      notify(t("permissionGranted"))
    } catch (error) {
      await Promise.all([loadInstalledPacks(), loadRuntimeStatus()])
      reportOperationError(error)
    } finally {
      endBusy(key)
    }
  }

  /** 唯一的更新入口：同步 registry 索引、内置配置补丁与已安装适配包。 */
  const refreshRegistry = async (
    targetPack?: InstalledSitePack,
  ): Promise<RemoteConfigCheckResult | null> => {
    const key = targetPack ? `update:${targetPack.manifest.id}` : "registry:refresh"
    const previousVersion = targetPack?.manifest.version
    if (!beginBusy(key)) return null
    try {
      const result = await platform.remoteConfig.checkForUpdates()
      if (result.status === "failed") {
        throw new Error(result.error || t("operationFailed"))
      }
      const syncResult = await packManager.syncRegistryPacks()
      const postSyncSnapshot = await packManager.getSnapshot()
      const runtimePreparationPacks = selectRuntimePreparationPacks(
        postSyncSnapshot.packs,
        syncResult,
      )
      const deniedPacks = await prepareInstalledPacksRuntime(runtimePreparationPacks)
      const [snapshot] = await Promise.all([loadInstalledPacks(), loadRegistryState()])
      if (syncResult.issues.length > 0) {
        setSnapshotIssues((current) => mergePackManagerIssues(current, syncResult.issues))
      }

      if (deniedPacks.length > 0) {
        reportPermissionDenied(deniedPacks[0])
        return result
      }

      if (targetPack) {
        const nextPack = snapshot?.packs.find((pack) => pack.manifest.id === targetPack.manifest.id)
        const updated =
          nextPack && previousVersion !== undefined && nextPack.manifest.version > previousVersion
        notify(
          updated
            ? t("sitePacksPackUpdated", {
                name: resolveSitePackName(nextPack.manifest, getCurrentLang()),
                version: String(nextPack.manifest.version),
              })
            : t("sitePacksPackUpToDate", {
                name: resolveSitePackName(targetPack.manifest, getCurrentLang()),
              }),
        )
      } else {
        notify(
          t(result.status === "updated" ? "remoteConfigCheckUpdated" : "remoteConfigCheckUpToDate"),
        )
      }
      return result
    } catch (error) {
      reportOperationError(error)
      return null
    } finally {
      endBusy(key)
    }
  }

  const handleResetSite = async (siteId: string, siteName: string, patchVersion: number) => {
    setResettingSiteId(siteId)
    try {
      const reset = await platform.remoteConfig.resetSite(siteId, patchVersion)
      if (!reset) throw new Error(t("remoteConfigResetUnavailable"))
      notify(t("remoteConfigResetSuccess", { site: siteName }))
      await loadRegistryState()
    } catch (error) {
      notifyError(t("remoteConfigResetFailed", { error: getErrorMessage(error) }))
    } finally {
      setResettingSiteId(null)
    }
  }

  const handleApplyRegistrySource = () => {
    const source = registrySourceInput.trim()

    if (!source) {
      updateNestedSetting("remoteConfig", "registrySourceUrl", "")
      setRegistrySourceInput("")
      setRegistrySourceError(null)
      notify(t("remoteConfigRegistrySourceCleared"))
      return
    }

    try {
      const normalizedSource = normalizeRemoteConfigSourceUrl(source)
      updateNestedSetting("remoteConfig", "registrySourceUrl", normalizedSource)
      setRegistrySourceInput(normalizedSource)
      setRegistrySourceError(null)
      notify(t("remoteConfigRegistrySourceApplied"))
    } catch (error) {
      setRegistrySourceError(
        t("remoteConfigRegistrySourceInvalid", { error: getErrorMessage(error) }),
      )
    }
  }

  const handleInstallRegistry = async (view: RegistrySitePackView) => {
    const isUpdate = Boolean(
      view.installed &&
        view.installed.source === "registry" &&
        view.availableVersion !== undefined &&
        view.availableVersion > view.installed.manifest.version,
    )
    const key = `install:${view.id}`
    if (!beginBusy(key)) return
    try {
      const result = await packManager.installFromRegistry(view.id)
      if (!result.pack) throw new Error(`Installed SitePack not found after install: ${view.id}`)
      const deniedPacks = await prepareInstalledPacksRuntime([result.pack])
      await loadInstalledPacks()
      if (deniedPacks.length > 0) {
        reportPermissionDenied(deniedPacks[0])
        return
      }
      notify(
        t(isUpdate ? "sitePacksUpdatedSuccess" : "sitePacksSavedSuccess", {
          name: resolveSitePackName(result.pack.manifest, getCurrentLang()),
        }),
      )
    } catch (error) {
      reportOperationError(error)
    } finally {
      endBusy(key)
    }
  }

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    const key = "import:read"
    if (!beginBusy(key)) return
    try {
      const content = file.size > SITE_PACK_MAX_BYTES ? "" : await file.text()
      const parsed = parseSitePackImport(content, file.size)
      if (!parsed.valid) {
        notifyError(t("sitePacksInvalidFile"))
        setValidationReport({ title: t("sitePacksInvalidFile"), errors: parsed.errors })
        return
      }
      const existing = installedById.get(parsed.manifest.id)
      setConfirmation({
        type: "import",
        manifest: parsed.manifest,
        fileName: file.name,
        isUpdate: Boolean(existing && parsed.manifest.version > existing.manifest.version),
      })
    } catch (error) {
      reportOperationError(error)
    } finally {
      endBusy(key)
    }
  }

  const handleConfirmAction = async () => {
    if (!confirmation) return

    if (confirmation.type === "import") {
      const key = `confirm:import:${confirmation.manifest.id}`
      if (!beginBusy(key)) return
      try {
        const result = await packManager.installLocal(confirmation.manifest)
        if (!result.pack) {
          throw new Error(`Installed SitePack not found after import: ${confirmation.manifest.id}`)
        }
        const deniedPacks = await prepareInstalledPacksRuntime([result.pack])
        await loadInstalledPacks()
        setConfirmation(null)
        if (deniedPacks.length > 0) {
          reportPermissionDenied(deniedPacks[0])
          return
        }
        notify(
          t(confirmation.isUpdate ? "sitePacksUpdatedSuccess" : "sitePacksSavedSuccess", {
            name: resolveSitePackName(result.pack.manifest, getCurrentLang()),
          }),
        )
      } catch (error) {
        setConfirmation(null)
        reportOperationError(error)
      } finally {
        endBusy(key)
      }
      return
    }

    const key = `confirm:uninstall:${confirmation.pack.manifest.id}`
    if (!beginBusy(key)) return
    try {
      await packManager.uninstall(confirmation.pack.manifest.id)
      await syncRuntimeStatus()
      await loadInstalledPacks()
      notify(
        t("sitePacksRemovedSuccess", {
          name: resolveSitePackName(confirmation.pack.manifest, getCurrentLang()),
        }),
      )
      setConfirmation(null)
    } catch (error) {
      setConfirmation(null)
      reportOperationError(error)
    } finally {
      endBusy(key)
    }
  }

  const openImportPicker = (trigger: HTMLElement) => {
    confirmationTriggerRef.current = trigger
    fileInputRef.current?.click()
  }

  const renderOriginBinding = ([origin, binding]: [string, SitePackOriginBinding]) => {
    const originPattern = sitePackBindingOriginPattern(origin)
    const referenceGraph = userscriptReferenceGraph ?? runtimeStatus
    const referenceEntry = referenceGraph.originReferences.find(
      (entry) => entry.originPattern === originPattern,
    )
    const issue = referenceGraph.bindingIssues.find((candidate) => candidate.origin === origin)
    const userscriptCovered = Boolean(
      userscriptMatchInfo &&
        userscriptMatchPatternsCoverOriginPattern(userscriptMatchInfo.matchPatterns, originPattern),
    )
    const userscriptMatchRequired = Boolean(
      userscriptReferenceGraph && referenceEntry && !userscriptCovered,
    )
    const missingPermission =
      !userscriptReferenceGraph && runtimeStatus.missingPermissionOrigins.includes(originPattern)
    const active = userscriptReferenceGraph
      ? Boolean(referenceEntry && userscriptCovered)
      : runtimeStatus.activeOrigins.some((activeOrigin) =>
          siteMatchPatternOriginPatternCovers(activeOrigin, originPattern),
        )
    const status = issue
      ? { tone: "danger", label: t("sitePacksStatusIncompatible") }
      : userscriptMatchRequired
        ? { tone: "warning", label: t("sitePacksStatusMatchRequired") }
        : missingPermission
          ? { tone: "warning", label: t("notGranted") }
          : active
            ? { tone: "success", label: t("sitePacksStatusAvailable") }
            : { tone: "neutral", label: t("sitePacksStatusDisabled") }
    const explicitPack = binding.mode === "explicit" ? installedById.get(binding.packId) : undefined
    const referenceNames = Array.from(
      new Set(
        (referenceEntry?.references ?? []).map((reference) => {
          const pack = installedById.get(reference.packId)
          return pack ? resolveSitePackName(pack.manifest, currentLanguage) : reference.packId
        }),
      ),
    )
    const summary =
      binding.mode === "explicit"
        ? explicitPack
          ? resolveSitePackName(explicitPack.manifest, currentLanguage)
          : binding.packId
        : referenceNames.length > 0
          ? referenceNames.join(", ")
          : t("sitePacksBindingDetectPool")
    const busy = busyKeys.has(`binding:remove:${origin}`)

    return (
      <div className="settings-pack-item" key={origin}>
        <div className="settings-pack-info">
          <div className="settings-pack-title-line">
            <strong className="settings-pack-origin">{origin}</strong>
            <span className={`settings-pack-badge ${status.tone}`}>{status.label}</span>
          </div>
          <div className="settings-pack-meta">
            <span>
              {t(
                binding.mode === "explicit"
                  ? "sitePacksBindingModeExplicit"
                  : "sitePacksBindingModeDetect",
              )}
            </span>
            <span>{summary}</span>
          </div>
        </div>
        <div className="settings-pack-controls">
          <Button
            type="button"
            size="sm"
            variant="danger"
            className="settings-pack-action-button"
            disabled={busy || isBindingBusy}
            aria-label={`${t("delete")}: ${origin}`}
            onClick={() => void handleRemoveOriginBinding(origin)}>
            <DeleteIcon size={13} />
            {t("delete")}
          </Button>
        </div>
      </div>
    )
  }

  const renderInstalledPack = (pack: InstalledSitePack) => {
    const packId = pack.manifest.id
    const status = getInstalledPackStatus(pack)
    const isBusy = isPackBusy(packId)
    const canToggleOn = pack.source === "local" || pack.registryStatus === "available"
    const toggleDisabled = isBusy || (!pack.enabled && !canToggleOn)
    const firstMatch = pack.manifest.matches[0]
    const name = resolveSitePackName(pack.manifest, currentLanguage)
    const description = resolveSitePackDescription(pack.manifest, currentLanguage)

    return (
      <div className="settings-pack-item" key={packId}>
        <div className="settings-pack-icon" aria-hidden="true">
          <JSONFileIcon size={18} />
        </div>
        <div className="settings-pack-info">
          <div className="settings-pack-title-line">
            <strong title={packId}>{name}</strong>
            {status && <span className={`settings-pack-badge ${status.tone}`}>{status.label}</span>}
          </div>
          {description && <p className="settings-pack-description">{description}</p>}
          <div className="settings-pack-meta">
            <span>
              {t("version")} {pack.manifest.version}
            </span>
            <span>
              {t(pack.source === "registry" ? "sitePacksSourceRegistry" : "sitePacksSourceLocal")}
            </span>
            {firstMatch && <span title={firstMatch}>{firstMatch}</span>}
          </div>
        </div>
        <div className="settings-pack-controls">
          {pack.source === "registry" && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="settings-pack-action-button"
              disabled={isBusy || isRegistryBusy}
              onClick={() => void refreshRegistry(pack)}>
              <RefreshIcon
                size={13}
                className={busyKeys.has(`update:${packId}`) ? "spinning" : ""}
              />
              {t("sitePacksCheckUpdates")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="danger"
            className="settings-pack-action-button"
            disabled={isBusy}
            aria-label={`${t("sitePacksUninstall")}: ${name}`}
            onClick={(event) => {
              confirmationTriggerRef.current = event.currentTarget
              setConfirmation({ type: "uninstall", pack })
            }}>
            <DeleteIcon size={13} />
            {t("sitePacksUninstall")}
          </Button>
          <Switch
            size="sm"
            checked={pack.enabled}
            disabled={toggleDisabled}
            ariaLabel={`${name}: ${t("sitePacksEnabledLabel")}`}
            onChange={() => void handleToggleEnabled(pack)}
          />
        </div>
      </div>
    )
  }

  const renderRegistryPack = (view: RegistrySitePackView) => {
    const isInstalled = Boolean(view.installed)
    const canUpdate = Boolean(
      view.installed &&
        view.installed.source === "registry" &&
        view.availableVersion !== undefined &&
        view.availableVersion > view.installed.manifest.version,
    )
    const isAvailable = view.availability === "available"
    const isBusy = isPackBusy(view.id)
    const firstMatch = view.matches[0]
    const version = view.availableVersion ?? view.latestVersion

    return (
      <div className="settings-pack-item" key={view.id}>
        <div className="settings-pack-icon" aria-hidden="true">
          <JSONFileIcon size={18} />
        </div>
        <div className="settings-pack-info">
          <div className="settings-pack-title-line">
            <strong title={view.id}>{view.name}</strong>
            {!isAvailable && (
              <span
                className={`settings-pack-badge ${getRegistryAvailabilityTone(view.availability)}`}>
                {getRegistryAvailabilityLabel(view.availability)}
              </span>
            )}
            {isInstalled && (
              <span className="settings-pack-badge neutral">{t("sitePacksInstalledBadge")}</span>
            )}
          </div>
          {view.description && <p className="settings-pack-description">{view.description}</p>}
          <div className="settings-pack-meta">
            <span>
              {t("version")} {version}
            </span>
            {firstMatch && <span title={firstMatch}>{firstMatch}</span>}
            {view.availability === "incompatible" && (
              <span>{t("sitePacksRequiresNewerApp", { version: view.minAppVersion })}</span>
            )}
          </div>
        </div>
        <div className="settings-pack-controls">
          <Button
            type="button"
            size="sm"
            variant={canUpdate ? "primary" : "secondary"}
            className="settings-pack-action-button"
            disabled={!isAvailable || (isInstalled && !canUpdate) || isBusy || isRegistryBusy}
            onClick={() => void handleInstallRegistry(view)}>
            {canUpdate ? t("sitePacksUpdate") : t("sitePacksInstall")}
          </Button>
        </div>
      </div>
    )
  }

  const confirmationPackId =
    confirmation?.type === "import" ? confirmation.manifest.id : confirmation?.pack.manifest.id
  const isDialogBusy = confirmationPackId ? isPackBusy(confirmationPackId) : false
  const registryRevision = remoteState?.active?.index.registryRevision
  const lastCheckAt = remoteState?.lastCheckAt
  const isCheckingRegistry = busyKeys.has("registry:refresh")
  const registryStatusSummary = isRegistryLoading
    ? t("remoteConfigStatusLoading")
    : lastCheckAt
      ? t("remoteConfigStatusSummary", {
          revision: registryRevision !== undefined ? String(registryRevision) : "—",
          time: formatCheckTime(lastCheckAt),
        })
      : t("remoteConfigNeverChecked")

  const tabs = [
    { id: SITE_PACKS_TAB_IDS.INSTALLED, label: t("sitePacksTabInstalled") },
    { id: SITE_PACKS_TAB_IDS.ORIGINS, label: t("sitePacksTabOrigins") },
    { id: SITE_PACKS_TAB_IDS.UPDATES, label: t("sitePacksTabUpdates") },
  ]

  return (
    <div
      ref={pageRef}
      className="settings-pack-page"
      tabIndex={-1}
      aria-busy={isInstalledLoading || isBindingsLoading || isRegistryLoading || isRuntimeLoading}>
      <PageTitle title={t("navSitePacks")} Icon={JSONFileIcon} />

      <div className="settings-pack-toolbar">
        <TabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        <button
          type="button"
          className="settings-pack-guide-link"
          onClick={() => platform.openTab(SITE_PACK_GUIDE_URL)}>
          {t("sitePacksGuideAction")}
          <ExternalLinkIcon size={13} />
        </button>
      </div>

      {permissionReviewPacks.length > 0 && (
        <div className="settings-pack-notice warning" role="alert">
          <InfoIcon size={16} />
          <div className="settings-pack-notice-body">
            <strong>{t("sitePacksPermissionReviewTitle")}</strong>
            <div className="settings-pack-notice-actions">
              {permissionReviewPacks.map((pack) => {
                const name = resolveSitePackName(pack.manifest, currentLanguage)
                return (
                  <Button
                    key={pack.manifest.id}
                    type="button"
                    size="sm"
                    variant="primary"
                    disabled={isPackBusy(pack.manifest.id)}
                    onClick={() => void handleReauthorizePack(pack)}>
                    {`${t("allow")}: ${name}`}
                  </Button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === SITE_PACKS_TAB_IDS.INSTALLED && (
        <section className="settings-card">
          {installedError && (
            <InlineError message={installedError} onRetry={() => void loadInstalledPacks(true)} />
          )}
          {runtimeError && (
            <InlineError message={runtimeError} onRetry={() => void loadRuntimeStatus(true)} />
          )}

          {isInstalledLoading ? (
            <SitePackListSkeleton />
          ) : sortedInstalledPacks.length === 0 ? (
            <div className="settings-pack-empty-state">
              <JSONFileIcon size={24} />
              <strong>{t("sitePacksNoInstalled")}</strong>
              <div className="settings-pack-empty-actions">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={() => setActiveTab(SITE_PACKS_TAB_IDS.UPDATES)}>
                  {t("sitePacksRegistryTitle")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isImportBusy}
                  onClick={(event) => openImportPicker(event.currentTarget)}>
                  <ImportIcon size={14} />
                  {t("importBtn")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="settings-pack-list">
              {sortedInstalledPacks.map(renderInstalledPack)}
            </div>
          )}

          {snapshotIssues.length > 0 && (
            <details className="settings-pack-issues">
              <summary>
                {t("sitePacksStoredIssuesTitle")} ({snapshotIssues.length})
              </summary>
              <ul>
                {snapshotIssues.map((issue, index) => (
                  <li key={`${issue.packId ?? "unknown"}-${issue.code}-${index}`}>
                    {issue.packId && <code>{issue.packId}</code>}
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {activeTab === SITE_PACKS_TAB_IDS.ORIGINS && (
        <>
          <section className="settings-card">
            <div className="settings-card-title">{t("sitePacksCustomOriginsTitle")}</div>
            <div className="settings-card-desc">{t("sitePacksCustomOriginsDesc")}</div>

            {bindingsError && (
              <InlineError message={bindingsError} onRetry={() => void loadOriginBindings(true)} />
            )}

            <form
              className="settings-pack-binding-form"
              onSubmit={(event) => void handleSaveOriginBinding(event)}>
              <label className="settings-pack-field settings-pack-field-origin">
                <span>{t("sitePacksCustomOriginLabel")}</span>
                <Input
                  type="url"
                  inputMode="url"
                  value={bindingOrigin}
                  placeholder={t("sitePacksCustomOriginPlaceholder")}
                  disabled={isBindingBusy}
                  onChange={(event) => setBindingOrigin(event.target.value)}
                  aria-label={t("sitePacksCustomOriginLabel")}
                />
              </label>
              <div className="settings-pack-field">
                <span>{t("sitePacksBindingModeLabel")}</span>
                <SelectDropdown
                  className="settings-select-dropdown"
                  buttonClassName="settings-select"
                  options={bindingModeOptions}
                  value={bindingMode}
                  disabled={isBindingBusy}
                  ariaLabel={t("sitePacksBindingModeLabel")}
                  onChange={(value) => setBindingMode(value as SitePackOriginBinding["mode"])}
                />
              </div>
              {bindingMode === "explicit" && (
                <div className="settings-pack-field">
                  <span>{t("sitePacksBindingPackLabel")}</span>
                  <SelectDropdown
                    className="settings-select-dropdown"
                    buttonClassName="settings-select"
                    options={bindingPackOptions}
                    value={bindingPackId}
                    placeholder={t("sitePacksBindingPackPlaceholder")}
                    emptyText={t("sitePacksBindingPackPlaceholder")}
                    disabled={isBindingBusy || bindingPackOptions.length === 0}
                    ariaLabel={t("sitePacksBindingPackLabel")}
                    onChange={setBindingPackId}
                  />
                </div>
              )}
              <Button
                type="submit"
                size="sm"
                variant="primary"
                className="settings-pack-action-button settings-pack-binding-submit"
                disabled={isBindingBusy || isBindingsLoading || isInstalledLoading}>
                {isUpdatingBinding ? t("sitePacksUpdate") : t("add")}
              </Button>
            </form>

            {bindingMode === "detect" && detectPacks.length === 0 && (
              <p className="settings-pack-field-hint warning">
                {t("sitePacksBindingDetectUnavailable")}
              </p>
            )}
          </section>

          {userscriptMatchInfo && missingUserscriptOriginPatterns.length > 0 && (
            <section className="settings-card">
              <div className="settings-card-title">{t("sitePacksUserscriptCoverageTitle")}</div>
              <div className="settings-card-desc">
                {t("sitePacksUserscriptCoverageDesc", {
                  count: String(missingUserscriptOriginPatterns.length),
                  manager:
                    userscriptMatchInfo.managerName ?? t("sitePacksUserscriptManagerUnknown"),
                })}
              </div>
              <div className="settings-pack-pattern-list">
                {missingUserscriptOriginPatterns.map((pattern) => (
                  <div className="settings-pack-pattern" key={pattern}>
                    <code>{pattern}</code>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="settings-pack-action-button"
                      aria-label={`${t("copy")}: ${pattern}`}
                      onClick={() => void handleCopyUserscriptPattern(pattern)}>
                      <CopyIcon size={13} />
                      {t("copy")}
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="settings-card">
            <div className="settings-card-title">{t("sitePacksBindingListTitle")}</div>
            {isBindingsLoading ? (
              <SitePackListSkeleton />
            ) : sortedOriginBindings.length === 0 ? (
              <div className="settings-pack-empty-state">
                <InfoIcon size={24} />
                <strong>{t("sitePacksBindingEmpty")}</strong>
              </div>
            ) : (
              <div className="settings-pack-list">
                {sortedOriginBindings.map((entry) => renderOriginBinding(entry))}
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === SITE_PACKS_TAB_IDS.UPDATES && (
        <>
          <section className="settings-card" data-setting-id="remote-config-status">
            <div className="settings-card-title">{t("remoteConfigSettingsTitle")}</div>

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

            <SettingRow
              label={t("remoteConfigCheckNowLabel")}
              description={registryStatusSummary}
              settingId="remote-config-check-now">
              <Button
                type="button"
                variant="secondary"
                className="settings-pack-action-button"
                disabled={isRegistryBusy}
                onClick={() => void refreshRegistry()}>
                <RefreshIcon size={14} className={isCheckingRegistry ? "spinning" : ""} />
                {isCheckingRegistry
                  ? t("remoteConfigCheckingButton")
                  : t("remoteConfigCheckNowButton")}
              </Button>
            </SettingRow>

            {IS_DEVELOPMENT_BUILD && (
              <SettingRow
                label={t("remoteConfigRegistrySourceLabel")}
                description={t("remoteConfigRegistrySourceDesc")}
                settingId="remote-config-registry-source">
                <div className="settings-pack-source-editor">
                  <div className="settings-pack-source-controls">
                    <Input
                      type="url"
                      inputMode="url"
                      value={registrySourceInput}
                      placeholder={t("remoteConfigRegistrySourcePlaceholder")}
                      aria-label={t("remoteConfigRegistrySourceLabel")}
                      aria-invalid={registrySourceError ? "true" : undefined}
                      disabled={isRegistryBusy}
                      spellCheck={false}
                      onChange={(event) => {
                        setRegistrySourceInput(event.target.value)
                        setRegistrySourceError(null)
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="settings-pack-action-button"
                      disabled={
                        isRegistryBusy || registrySourceInput.trim() === configuredRegistrySource
                      }
                      onClick={handleApplyRegistrySource}>
                      {t("remoteConfigRegistrySourceApplyButton")}
                    </Button>
                  </div>
                  {registrySourceError && (
                    <span className="settings-pack-source-error" role="alert">
                      {registrySourceError}
                    </span>
                  )}
                </div>
              </SettingRow>
            )}

            <div className="settings-pack-patches" data-setting-id="remote-config-active-patches">
              <h3>{t("remoteConfigActivePatchesLabel")}</h3>
              {activePatches.length === 0 ? (
                <div className="settings-pack-empty-state compact">
                  <CloudIcon size={20} />
                  <strong>{t("remoteConfigUsingBuiltin")}</strong>
                </div>
              ) : (
                <div className="settings-pack-list">
                  {activePatches.map((patch) => (
                    <div className="settings-pack-item" key={patch.siteId}>
                      <div className="settings-pack-info">
                        <div className="settings-pack-title-line">
                          <strong>{patch.siteName}</strong>
                        </div>
                        <div className="settings-pack-meta">
                          <span>
                            {t("remoteConfigPatchVersionLabel")} {patch.patchVersion}
                          </span>
                          <span>
                            {t("remoteConfigBaseVersionLabel")} {patch.baseConfigVersion}
                          </span>
                        </div>
                      </div>
                      <div className="settings-pack-controls">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="settings-pack-action-button"
                          disabled={isRegistryBusy || resettingSiteId !== null}
                          onClick={() =>
                            void handleResetSite(patch.siteId, patch.siteName, patch.patchVersion)
                          }>
                          {resettingSiteId === patch.siteId
                            ? t("remoteConfigResettingButton")
                            : t("remoteConfigResetBuiltinButton")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="settings-pack-privacy-note">{t("remoteConfigPrivacyDesc")}</p>
          </section>

          <section className="settings-card">
            <div className="settings-card-title">{t("sitePacksRegistryTitle")}</div>

            {registryError && (
              <InlineError message={registryError} onRetry={() => void loadRegistryState(true)} />
            )}

            {isRegistryLoading ? (
              <SitePackListSkeleton />
            ) : registryViews.length === 0 ? (
              <div className="settings-pack-empty-state">
                <RefreshIcon size={24} />
                <strong>{t("sitePacksRegistryEmpty")}</strong>
              </div>
            ) : (
              <div className="settings-pack-list">{registryViews.map(renderRegistryPack)}</div>
            )}
          </section>

          <section className="settings-card">
            <div className="settings-pack-import-row">
              <div>
                <div className="settings-card-title">{t("sitePacksLocalImportTitle")}</div>
                <div className="settings-card-desc">{t("sitePacksLocalImportDesc")}</div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="settings-pack-action-button"
                data-site-pack-import-trigger="persistent"
                disabled={isImportBusy}
                onClick={(event) => openImportPicker(event.currentTarget)}>
                <ImportIcon size={14} />
                {t("importBtn")}
              </Button>
            </div>
          </section>
        </>
      )}

      <input
        ref={fileInputRef}
        className="settings-pack-file-input"
        type="file"
        accept="application/json,.json"
        onChange={(event) => void handleFileSelected(event)}
      />

      {confirmation?.type === "import" && (
        <SitePackDialog
          title={t("sitePacksImportConfirmTitle")}
          confirmText={t("confirm")}
          busy={isDialogBusy}
          restoreFocusTo={confirmationTriggerRef.current}
          restoreFocusFallback={getConfirmationFocusFallback}
          onConfirm={() => void handleConfirmAction()}
          onCancel={closeConfirmation}>
          <p>{t("sitePacksImportRisk")}</p>
          <p>
            {t("sitePacksImportSummary", {
              name: resolveSitePackName(confirmation.manifest, currentLanguage),
              id: confirmation.manifest.id,
              version: String(confirmation.manifest.version),
              matches: String(confirmation.manifest.matches.length),
            })}
          </p>
          <code className="settings-pack-dialog-file">{confirmation.fileName}</code>
        </SitePackDialog>
      )}

      {confirmation?.type === "uninstall" && (
        <SitePackDialog
          title={t("sitePacksUninstallConfirmTitle")}
          confirmText={t("sitePacksUninstall")}
          danger
          busy={isDialogBusy}
          restoreFocusTo={confirmationTriggerRef.current}
          restoreFocusFallback={getConfirmationFocusFallback}
          onConfirm={() => void handleConfirmAction()}
          onCancel={closeConfirmation}>
          <p>
            {t("sitePacksUninstallConfirmDesc", {
              name: resolveSitePackName(confirmation.pack.manifest, currentLanguage),
            })}
          </p>
          <p>{t("sitePacksUninstallKeepData")}</p>
        </SitePackDialog>
      )}

      {validationReport && (
        <SitePackDialog
          title={validationReport.title}
          confirmText={t("close")}
          variant="notice"
          restoreFocusFallback={getConfirmationFocusFallback}
          onConfirm={() => setValidationReport(null)}
          onCancel={() => setValidationReport(null)}>
          <ul className="settings-pack-validation-list">
            {validationReport.errors.map((error, index) => (
              <li key={`${error.path}-${error.code}-${index}`}>
                <code>{error.path}</code>
                <span>{error.message}</span>
              </li>
            ))}
          </ul>
        </SitePackDialog>
      )}
    </div>
  )
}

export default SitePacksPage
