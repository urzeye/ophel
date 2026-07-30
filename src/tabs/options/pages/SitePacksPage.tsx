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
  CopyIcon,
  DeleteIcon,
  ExternalLinkIcon,
  ImportIcon,
  InfoIcon,
  JSONFileIcon,
  RefreshIcon,
} from "~components/icons"
import { Button, Input, SelectDropdown, Switch, type SelectDropdownOption } from "~components/ui"
import {
  INSTALLED_SITE_PACKS_STORAGE_KEY,
  isInstalledSitePackEffectivelyEnabled,
  PackManagerError,
  type InstalledSitePack,
  type PackManagerIssue,
} from "~core/pack-manager"
import { createRuntimePackManager } from "~core/pack-manager-runtime"
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
import { PageTitle } from "~tabs/options/components"
import { getCurrentLang, subscribeI18nChanges, t } from "~utils/i18n"

import {
  buildRegistrySitePackViews,
  parseSitePackImport,
  type RegistrySitePackAvailability,
  type RegistrySitePackView,
} from "../site-pack-manager-view"

type FeedbackTone = "success" | "error" | "neutral"

const SITE_PACK_GUIDE_URL = "https://urzeye.github.io/ophel/site-packs/"

interface FeedbackState {
  tone: FeedbackTone
  message: string
  details?: SitePackValidationError[]
}

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

interface SitePackConfirmationDialogProps {
  title: string
  confirmText: string
  danger?: boolean
  busy: boolean
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

const SitePackConfirmationDialog: React.FC<SitePackConfirmationDialogProps> = ({
  title,
  confirmText,
  danger = false,
  busy,
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
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            {t("cancel")}
          </Button>
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
    issues.set(`${issue.code}\u0000${issue.packId ?? ""}\u0000${issue.message}`, issue)
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
  return { tone: "warning", label: t("remoteConfigNotAvailable") }
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

const SitePacksPage: React.FC = () => {
  const currentLanguage = useSyncExternalStore(subscribeI18nChanges, getCurrentLang, getCurrentLang)
  const packManager = useMemo(() => createRuntimePackManager(platform.storage), [])
  const pageRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const confirmationTriggerRef = useRef<HTMLElement | null>(null)
  const busyKeysRef = useRef<Set<string>>(new Set())
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
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null)
  const [bindingOrigin, setBindingOrigin] = useState("")
  const [bindingMode, setBindingMode] = useState<SitePackOriginBinding["mode"]>("explicit")
  const [bindingPackId, setBindingPackId] = useState("")
  const [copiedUserscriptPattern, setCopiedUserscriptPattern] = useState<string | null>(null)

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

  const setOperationError = useCallback((error: unknown) => {
    const validationErrors = getValidationErrors(error)
    setFeedback({
      tone: "error",
      message: t("sitePacksOperationFailed", { error: getErrorMessage(error) }),
      ...(validationErrors ? { details: validationErrors } : {}),
    })
  }, [])

  const setPermissionDeniedFeedback = useCallback((pack: InstalledSitePack) => {
    setFeedback({
      tone: "error",
      message: t("sitePacksPermissionDenied", {
        name: resolveSitePackName(pack.manifest, getCurrentLang()),
      }),
    })
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
    setFeedback(null)

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
        setFeedback({
          tone: "error",
          message: t("sitePacksBindingPermissionDenied", { origin }),
        })
        return
      }

      shouldRollback = true
      await packManager.setOriginBinding(origin, binding)
      await syncRuntimeStatus()
      await loadOriginBindings()
      shouldRollback = false
      setBindingOrigin(origin)
      setFeedback({ tone: "success", message: t("saveSuccess") })
    } catch (error) {
      if (shouldRollback && origin) {
        try {
          await rollbackOriginBinding(origin, previousBinding, error)
        } catch (rollbackResult) {
          setOperationError(rollbackResult)
        }
      } else if (error instanceof SitePackOriginBindingsError && error.code === "invalid-origin") {
        setFeedback({ tone: "error", message: t("sitePacksBindingHint") })
      } else {
        setOperationError(error)
      }
    } finally {
      endBusy(key)
    }
  }

  const handleRemoveOriginBinding = async (origin: string) => {
    const key = `binding:remove:${origin}`
    if (!beginBusy(key)) return
    setFeedback(null)

    const previousBinding = originBindings.bindings[origin]
    try {
      await packManager.removeOriginBinding(origin)
      try {
        await syncRuntimeStatus()
        await loadOriginBindings()
      } catch (error) {
        await rollbackOriginBinding(origin, previousBinding, error)
      }
      setFeedback({ tone: "success", message: t("deleteSuccess") })
    } catch (error) {
      setOperationError(error)
    } finally {
      endBusy(key)
    }
  }

  const handleCopyUserscriptPattern = async (pattern: string) => {
    try {
      await navigator.clipboard.writeText(pattern)
      setCopiedUserscriptPattern(pattern)
    } catch (error) {
      console.error("Failed to copy userscript match pattern:", error)
      setFeedback({ tone: "error", message: t("copyFailed") })
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
    setFeedback(null)
    try {
      if (nextEnabled) {
        const permission = await platform.sitePacks.ensureOrigins(pack.manifest.id)
        if (permission === "denied") {
          setPermissionDeniedFeedback(pack)
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
      setFeedback({
        tone: "success",
        message: t("sitePacksStateChanged", {
          name: resolveSitePackName(pack.manifest, getCurrentLang()),
          state: t(nextEnabled ? "sitePacksEnabledState" : "sitePacksDisabledState"),
        }),
      })
    } catch (error) {
      await loadInstalledPacks()
      setOperationError(error)
    } finally {
      endBusy(key)
    }
  }

  const handleReauthorizePack = async (pack: InstalledSitePack) => {
    const key = `permission:${pack.manifest.id}`
    if (!beginBusy(key)) return
    setFeedback(null)
    try {
      const permission = await platform.sitePacks.ensureOrigins(pack.manifest.id)
      if (permission === "denied") {
        await Promise.all([loadInstalledPacks(), loadRuntimeStatus()])
        setPermissionDeniedFeedback(pack)
        return
      }
      await Promise.all([loadInstalledPacks(), syncRuntimeStatus()])
      setFeedback({ tone: "success", message: t("permissionGranted") })
    } catch (error) {
      await Promise.all([loadInstalledPacks(), loadRuntimeStatus()])
      setOperationError(error)
    } finally {
      endBusy(key)
    }
  }

  const refreshRegistry = async (
    targetPack?: InstalledSitePack,
  ): Promise<RemoteConfigCheckResult | null> => {
    const key = targetPack ? `update:${targetPack.manifest.id}` : "registry:refresh"
    const previousVersion = targetPack?.manifest.version
    if (!beginBusy(key)) return null
    setFeedback(null)
    try {
      const result = await platform.remoteConfig.checkForUpdates()
      if (result.status === "failed") {
        throw new Error(result.error || t("remoteConfigNotAvailable"))
      }
      const syncResult = await packManager.syncRegistryPacks()
      const postSyncSnapshot = await packManager.getSnapshot()
      const deniedPacks = await prepareInstalledPacksRuntime(postSyncSnapshot.packs)
      const [snapshot] = await Promise.all([loadInstalledPacks(), loadRegistryState()])
      if (syncResult.issues.length > 0) {
        setSnapshotIssues((current) => mergePackManagerIssues(current, syncResult.issues))
      }

      if (deniedPacks.length > 0) {
        setPermissionDeniedFeedback(deniedPacks[0])
        return result
      }

      if (targetPack) {
        const nextPack = snapshot?.packs.find((pack) => pack.manifest.id === targetPack.manifest.id)
        if (
          nextPack &&
          previousVersion !== undefined &&
          nextPack.manifest.version > previousVersion
        ) {
          setFeedback({
            tone: "success",
            message: t("sitePacksPackUpdated", {
              name: resolveSitePackName(nextPack.manifest, getCurrentLang()),
              version: String(nextPack.manifest.version),
            }),
          })
        } else {
          setFeedback({
            tone: "neutral",
            message: t("sitePacksPackUpToDate", {
              name: resolveSitePackName(targetPack.manifest, getCurrentLang()),
            }),
          })
        }
      } else {
        setFeedback({
          tone: result.status === "updated" ? "success" : "neutral",
          message: t(
            result.status === "updated" ? "remoteConfigCheckUpdated" : "remoteConfigCheckUpToDate",
          ),
        })
      }
      return result
    } catch (error) {
      setOperationError(error)
      return null
    } finally {
      endBusy(key)
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
    setFeedback(null)
    try {
      const result = await packManager.installFromRegistry(view.id)
      if (!result.pack) throw new Error(`Installed SitePack not found after install: ${view.id}`)
      const deniedPacks = await prepareInstalledPacksRuntime([result.pack])
      await loadInstalledPacks()
      if (deniedPacks.length > 0) {
        setPermissionDeniedFeedback(deniedPacks[0])
        return
      }
      setFeedback({
        tone: "success",
        message: t(isUpdate ? "sitePacksUpdatedSuccess" : "sitePacksSavedSuccess", {
          name: result.pack
            ? resolveSitePackName(result.pack.manifest, getCurrentLang())
            : view.name,
        }),
      })
    } catch (error) {
      setOperationError(error)
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
    setFeedback(null)
    try {
      if (file.size > SITE_PACK_MAX_BYTES) {
        const parsed = parseSitePackImport("", file.size)
        if (!parsed.valid) {
          setFeedback({
            tone: "error",
            message: t("sitePacksInvalidFile"),
            details: parsed.errors,
          })
        }
        return
      }
      const parsed = parseSitePackImport(await file.text(), file.size)
      if (!parsed.valid) {
        setFeedback({
          tone: "error",
          message: t("sitePacksInvalidFile"),
          details: parsed.errors,
        })
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
      setOperationError(error)
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
          setPermissionDeniedFeedback(deniedPacks[0])
          return
        }
        setFeedback({
          tone: "success",
          message: t(confirmation.isUpdate ? "sitePacksUpdatedSuccess" : "sitePacksSavedSuccess", {
            name: resolveSitePackName(
              result.pack?.manifest ?? confirmation.manifest,
              getCurrentLang(),
            ),
          }),
        })
      } catch (error) {
        setConfirmation(null)
        setOperationError(error)
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
      setFeedback({
        tone: "success",
        message: t("sitePacksRemovedSuccess", {
          name: resolveSitePackName(confirmation.pack.manifest, getCurrentLang()),
        }),
      })
      setConfirmation(null)
    } catch (error) {
      setConfirmation(null)
      setOperationError(error)
    } finally {
      endBusy(key)
    }
  }

  const renderFeedback = () => {
    if (!feedback) return null
    return (
      <div
        className={`settings-pack-feedback ${feedback.tone}`}
        role={feedback.tone === "error" ? "alert" : "status"}
        aria-live="polite">
        <div>{feedback.message}</div>
        {feedback.details && feedback.details.length > 0 && (
          <div className="settings-pack-validation-details">
            <strong>{t("sitePacksValidationErrorsTitle")}</strong>
            <ul>
              {feedback.details.map((error, index) => (
                <li key={`${error.path}-${error.code}-${index}`}>
                  <code>{error.path}</code>
                  <span>{error.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
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
      <div className="settings-pack-binding-item" key={origin}>
        <div className="settings-pack-binding-info">
          <div className="settings-pack-title-line">
            <code className="settings-pack-binding-origin">{origin}</code>
            <span className="settings-pack-badge neutral">
              {t(
                binding.mode === "explicit"
                  ? "sitePacksBindingModeExplicit"
                  : "sitePacksBindingModeDetect",
              )}
            </span>
            <span className={`settings-pack-badge ${status.tone}`}>{status.label}</span>
          </div>
          <div className="settings-pack-binding-summary">{summary}</div>
          <div className="settings-pack-meta">
            <span>{originPattern}</span>
            {referenceEntry && (
              <span>
                {t("sitePacksBindingReferences", {
                  count: String(referenceEntry.referenceCount),
                })}
              </span>
            )}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="danger"
          className="settings-pack-action-button"
          disabled={busy || isBindingBusy}
          onClick={() => void handleRemoveOriginBinding(origin)}>
          <DeleteIcon size={13} />
          {t("delete")}
        </Button>
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
          <JSONFileIcon size={20} />
        </div>
        <div className="settings-pack-info">
          <div className="settings-pack-title-line">
            <strong>{name}</strong>
            <span className="settings-pack-badge neutral">
              {t(pack.source === "registry" ? "sitePacksSourceRegistry" : "sitePacksSourceLocal")}
            </span>
            {status && <span className={`settings-pack-badge ${status.tone}`}>{status.label}</span>}
          </div>
          <div className="settings-pack-id">{packId}</div>
          {description && <p className="settings-pack-description">{description}</p>}
          <div className="settings-pack-meta">
            <span>
              {t("version")} {pack.manifest.version}
            </span>
            {firstMatch && <span title={firstMatch}>{firstMatch}</span>}
            {pack.source === "local" && <span>{t("sitePacksLocalUpdateHint")}</span>}
          </div>
        </div>
        <div className="settings-pack-controls">
          <div className="settings-pack-switch-control">
            <span>{t("sitePacksEnabledLabel")}</span>
            <Switch
              size="sm"
              checked={pack.enabled}
              disabled={toggleDisabled}
              ariaLabel={`${name}: ${t("sitePacksEnabledLabel")}`}
              onChange={() => void handleToggleEnabled(pack)}
            />
          </div>
          <div className="settings-pack-actions">
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
              onClick={(event) => {
                confirmationTriggerRef.current = event.currentTarget
                setConfirmation({ type: "uninstall", pack })
              }}>
              <DeleteIcon size={13} />
              {t("sitePacksUninstall")}
            </Button>
          </div>
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
          <JSONFileIcon size={20} />
        </div>
        <div className="settings-pack-info">
          <div className="settings-pack-title-line">
            <strong>{view.name}</strong>
            <span
              className={`settings-pack-badge ${getRegistryAvailabilityTone(view.availability)}`}>
              {getRegistryAvailabilityLabel(view.availability)}
            </span>
            {isInstalled && (
              <span className="settings-pack-badge neutral">{t("sitePacksInstalledBadge")}</span>
            )}
          </div>
          <div className="settings-pack-id">{view.id}</div>
          {view.description && <p className="settings-pack-description">{view.description}</p>}
          <div className="settings-pack-meta">
            <span>
              {t("version")} {version}
            </span>
            {firstMatch && <span title={firstMatch}>{firstMatch}</span>}
            {view.matches.length > 1 && (
              <span>{t("sitePacksMatchesCount", { count: String(view.matches.length) })}</span>
            )}
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

  const openImportPicker = (trigger: HTMLElement) => {
    confirmationTriggerRef.current = trigger
    fileInputRef.current?.click()
  }

  return (
    <div
      ref={pageRef}
      className="settings-pack-page"
      tabIndex={-1}
      aria-busy={isInstalledLoading || isBindingsLoading || isRegistryLoading || isRuntimeLoading}>
      <PageTitle title={t("navSitePacks")} Icon={JSONFileIcon} />
      <div className="settings-pack-page-intro">
        <p className="settings-page-desc">{t("sitePacksPageDesc")}</p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="settings-pack-action-button settings-pack-guide-action"
          onClick={() => platform.openTab(SITE_PACK_GUIDE_URL)}>
          <ExternalLinkIcon size={14} />
          {t("sitePacksGuideAction")}
        </Button>
      </div>

      {permissionReviewPacks.length > 0 && (
        <div className="settings-pack-permission-review" role="alert">
          <InfoIcon size={18} />
          <div className="settings-pack-permission-review-content">
            <strong>{t("sitePacksPermissionReviewTitle")}</strong>
            <p>{t("sitePacksPermissionReviewDesc")}</p>
            <div className="settings-pack-permission-review-actions">
              {permissionReviewPacks.map((pack) => {
                const name = resolveSitePackName(pack.manifest, currentLanguage)
                return (
                  <div className="settings-pack-permission-review-item" key={pack.manifest.id}>
                    <span>{name}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      disabled={isPackBusy(pack.manifest.id)}
                      aria-label={`${t("allow")}: ${name}`}
                      onClick={() => void handleReauthorizePack(pack)}>
                      {t("allow")}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {renderFeedback()}

      <section
        className="settings-card settings-pack-section"
        aria-labelledby="site-packs-installed-title">
        <div className="settings-pack-section-header">
          <div>
            <h2 id="site-packs-installed-title">{t("sitePacksInstalledTitle")}</h2>
            <p>{t("sitePacksInstalledDesc")}</p>
          </div>
        </div>

        {installedError && (
          <div className="settings-pack-inline-error" role="alert">
            <span>{installedError}</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void loadInstalledPacks(true)}>
              {t("refresh")}
            </Button>
          </div>
        )}

        {runtimeError && (
          <div className="settings-pack-inline-error" role="alert">
            <span>{runtimeError}</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void loadRuntimeStatus(true)}>
              {t("refresh")}
            </Button>
          </div>
        )}

        {isInstalledLoading ? (
          <SitePackListSkeleton />
        ) : sortedInstalledPacks.length === 0 ? (
          <div className="settings-pack-empty-state">
            <JSONFileIcon size={26} />
            <div>
              <strong>{t("sitePacksNoInstalled")}</strong>
              <p>{t("sitePacksNoInstalledDesc")}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={isImportBusy}
              onClick={(event) => openImportPicker(event.currentTarget)}>
              <ImportIcon size={14} />
              {t("importBtn")}
            </Button>
          </div>
        ) : (
          <div className="settings-pack-list">{sortedInstalledPacks.map(renderInstalledPack)}</div>
        )}

        {snapshotIssues.length > 0 && (
          <div className="settings-pack-issues" role="alert">
            <strong>{t("sitePacksStoredIssuesTitle")}</strong>
            <ul>
              {snapshotIssues.map((issue, index) => (
                <li key={`${issue.packId ?? "unknown"}-${issue.code}-${index}`}>
                  {issue.packId && <code>{issue.packId}</code>}
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section
        className="settings-card settings-pack-section"
        aria-labelledby="site-packs-custom-origins-title">
        <div className="settings-pack-section-header">
          <div>
            <h2 id="site-packs-custom-origins-title">{t("sitePacksCustomOriginsTitle")}</h2>
            <p>{t("sitePacksCustomOriginsDesc")}</p>
          </div>
        </div>

        {bindingsError && (
          <div className="settings-pack-inline-error" role="alert">
            <span>{bindingsError}</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void loadOriginBindings(true)}>
              {t("refresh")}
            </Button>
          </div>
        )}

        <form
          className="settings-pack-binding-form"
          onSubmit={(event) => void handleSaveOriginBinding(event)}>
          <label className="settings-pack-binding-field">
            <span>{t("sitePacksCustomOriginLabel")}</span>
            <Input
              className="settings-pack-binding-input"
              type="url"
              inputMode="url"
              value={bindingOrigin}
              placeholder={t("sitePacksCustomOriginPlaceholder")}
              disabled={isBindingBusy}
              onChange={(event) => setBindingOrigin(event.target.value)}
              aria-label={t("sitePacksCustomOriginLabel")}
            />
          </label>
          <div className="settings-pack-binding-options">
            <div className="settings-pack-binding-field">
              <span>{t("sitePacksBindingModeLabel")}</span>
              <SelectDropdown
                className="settings-select-dropdown settings-pack-binding-select"
                buttonClassName="settings-select"
                options={bindingModeOptions}
                value={bindingMode}
                disabled={isBindingBusy}
                ariaLabel={t("sitePacksBindingModeLabel")}
                onChange={(value) => setBindingMode(value as SitePackOriginBinding["mode"])}
              />
            </div>
            {bindingMode === "explicit" && (
              <div className="settings-pack-binding-field">
                <span>{t("sitePacksBindingPackLabel")}</span>
                <SelectDropdown
                  className="settings-select-dropdown settings-pack-binding-select"
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
          </div>
          <p className="settings-pack-binding-hint">{t("sitePacksBindingHint")}</p>
          {detectPacks.length === 0 && (
            <p className="settings-pack-binding-hint warning">
              {t("sitePacksBindingDetectUnavailable")}
            </p>
          )}
        </form>

        {userscriptMatchInfo && missingUserscriptOriginPatterns.length > 0 && (
          <aside className="settings-pack-userscript-guide" role="status" aria-live="polite">
            <div className="settings-pack-userscript-guide-header">
              <InfoIcon size={18} />
              <div>
                <strong>{t("sitePacksUserscriptCoverageTitle")}</strong>
                <p>
                  {t("sitePacksUserscriptCoverageDesc", {
                    count: String(missingUserscriptOriginPatterns.length),
                    manager:
                      userscriptMatchInfo.managerName ?? t("sitePacksUserscriptManagerUnknown"),
                  })}
                </p>
              </div>
            </div>

            <div className="settings-pack-userscript-pattern-list">
              {missingUserscriptOriginPatterns.map((pattern) => (
                <div className="settings-pack-userscript-pattern" key={pattern}>
                  <code>{pattern}</code>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="settings-pack-action-button settings-pack-userscript-copy"
                    aria-label={`${t("copy")}: ${pattern}`}
                    onClick={() => void handleCopyUserscriptPattern(pattern)}>
                    <CopyIcon size={13} />
                    {copiedUserscriptPattern === pattern ? t("copied") : t("copy")}
                  </Button>
                </div>
              ))}
            </div>

            <ol className="settings-pack-userscript-steps">
              <li>{t("sitePacksUserscriptStepOpen")}</li>
              <li>{t("sitePacksUserscriptStepAdd")}</li>
              <li>{t("sitePacksUserscriptStepReload")}</li>
            </ol>
          </aside>
        )}

        {isBindingsLoading ? (
          <SitePackListSkeleton />
        ) : sortedOriginBindings.length === 0 ? (
          <div className="settings-pack-empty-state settings-pack-binding-empty">
            <InfoIcon size={24} />
            <div>
              <strong>{t("sitePacksBindingEmpty")}</strong>
              <p>{t("sitePacksBindingHint")}</p>
            </div>
          </div>
        ) : (
          <div className="settings-pack-binding-list">
            {sortedOriginBindings.map((entry) => renderOriginBinding(entry))}
          </div>
        )}
      </section>

      <section
        className="settings-card settings-pack-section"
        aria-labelledby="site-packs-registry-title">
        <div className="settings-pack-section-header">
          <div>
            <h2 id="site-packs-registry-title">{t("sitePacksRegistryTitle")}</h2>
            <p>{t("sitePacksRegistryDesc")}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="settings-pack-action-button"
            disabled={isRegistryBusy}
            onClick={() => void refreshRegistry()}>
            <RefreshIcon size={13} className={busyKeys.has("registry:refresh") ? "spinning" : ""} />
            {t("sitePacksRefreshRegistry")}
          </Button>
        </div>

        {registryError && (
          <div className="settings-pack-inline-error" role="alert">
            <span>{registryError}</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void loadRegistryState(true)}>
              {t("refresh")}
            </Button>
          </div>
        )}

        {isRegistryLoading ? (
          <SitePackListSkeleton />
        ) : registryViews.length === 0 ? (
          <div className="settings-pack-empty-state">
            <RefreshIcon size={24} />
            <div>
              <strong>{t("sitePacksRegistryEmpty")}</strong>
              <p>{t("sitePacksRegistryEmptyDesc")}</p>
            </div>
          </div>
        ) : (
          <div className="settings-pack-list">{registryViews.map(renderRegistryPack)}</div>
        )}
      </section>

      <section
        className="settings-card settings-pack-section"
        aria-labelledby="site-packs-import-title">
        <div className="settings-pack-section-header">
          <div>
            <h2 id="site-packs-import-title">{t("sitePacksLocalImportTitle")}</h2>
            <p>{t("sitePacksLocalImportDesc")}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="primary"
            className="settings-pack-action-button"
            data-site-pack-import-trigger="persistent"
            disabled={isImportBusy}
            onClick={(event) => openImportPicker(event.currentTarget)}>
            <ImportIcon size={14} />
            {t("importBtn")}
          </Button>
          <input
            ref={fileInputRef}
            className="settings-pack-file-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleFileSelected(event)}
          />
        </div>
      </section>

      <div className="settings-pack-activation-note" role="note">
        <InfoIcon size={18} />
        <span>{t("sitePacksChangesApplyHint")}</span>
      </div>

      {confirmation?.type === "import" && (
        <SitePackConfirmationDialog
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
        </SitePackConfirmationDialog>
      )}

      {confirmation?.type === "uninstall" && (
        <SitePackConfirmationDialog
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
        </SitePackConfirmationDialog>
      )}
    </div>
  )
}

export default SitePacksPage
