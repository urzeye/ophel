import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

import { resolveSitePackDescription, resolveSitePackName } from "~adapters/declarative/localization"
import {
  siteMatchPatternOrigin,
  siteMatchPatternOriginPatternCovers,
} from "~adapters/declarative/match-pattern"
import type { SitePackManifest } from "~adapters/declarative/types"
import { SITE_PACK_MAX_BYTES, type SitePackValidationError } from "~adapters/declarative/validate"
import {
  CheckIcon,
  DeleteIcon,
  EditIcon,
  ExternalLinkIcon,
  GlobeIcon,
  ImportIcon,
  InfoIcon,
  PuzzleIcon,
  RefreshIcon,
  SitePacksIcon,
} from "~components/icons"
import { PlatformIcon } from "~components/PlatformIcon"
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
import {
  getLocalDevRegistryIndexUrl,
  getLocalDevRegistryOriginPatterns,
  isLoopbackRegistrySourceUrl,
} from "~core/remote-config-local-dev"
import { normalizeRemoteConfigSourceUrl } from "~core/remote-config-source"
import {
  canonicalizeSitePackBindingOrigin,
  createEmptySitePackOriginBindingsState,
  SitePackOriginBindingsError,
  type SitePackOriginBinding,
  type SitePackOriginBindingsState,
} from "~core/site-pack-origin-bindings"
import {
  deriveSitePackOriginReferences,
  getSitePackBoundOriginPatterns,
  sitePackBindingOriginPattern,
} from "~core/site-pack-origin-references"
import { getSitePackFaviconUrl } from "~core/site-pack-platforms"
import { SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY } from "~core/site-pack-storage-constants"
import {
  DEFAULT_REMOTE_CONFIG_SOURCES,
  REMOTE_CONFIG_STORAGE_KEY,
  type RemoteConfigState,
  type RemoteConfigCheckResult,
} from "~core/remote-config-types"
import { platform, type SitePackRuntimeStatus } from "~platform"
import { useSettingsStore } from "~stores/settings-store"
import { PageTitle, SettingRow, TabGroup, ToggleRow } from "~tabs/options/components"
import { IS_DEVELOPMENT_BUILD } from "~utils/config"
import { getCurrentLang, subscribeI18nChanges, t } from "~utils/i18n"
import { scrollWithinSettingsContent } from "~utils/settings-scroll"
import { showToast } from "~utils/toast"

import {
  buildRegistrySitePackViews,
  parseSitePackImport,
  selectRuntimePreparationPacks,
  type RegistrySitePackAvailability,
  type RegistrySitePackView,
} from "../site-pack-manager-view"

const SITE_PACK_GUIDE_URL_EN = "https://ophel.app/docs/enhancements/site-extensions"
const SITE_PACK_GUIDE_URL_ZH = "https://ophel.app/docs/zh/enhancements/site-extensions"

const getSitePackGuideUrl = (lang: string): string =>
  lang.startsWith("zh") ? SITE_PACK_GUIDE_URL_ZH : SITE_PACK_GUIDE_URL_EN

const ERROR_TOAST_DURATION = 3500

const builtinPlatformNames = new Map(
  SUPPORTED_AI_PLATFORMS.map(({ id, name }) => [id as string, name] as const),
)

/**
 * 适配包图标按 manifest 品牌色着色。
 * 颜色混向主题变量，保证 24 套预设主题（亮/暗）下图标与底色都有足够对比度。
 */
const getPackIconStyle = (theme?: SitePackManifest["theme"]): React.CSSProperties | undefined =>
  theme?.primary
    ? {
        background: `color-mix(in srgb, ${theme.primary} 14%, var(--gh-card-bg, #ffffff))`,
        color: `color-mix(in srgb, ${theme.primary} 82%, var(--gh-text, #374151))`,
      }
    : undefined

type ConfirmationState =
  | {
      type: "import"
      manifest: SitePackManifest
      fileName: string
      isUpdate: boolean
    }
  | {
      type: "import-patch"
      patch: unknown
      fileName: string
      siteId: string
      siteName: string
      patchVersion: number
      baseConfigVersion: number
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
  for (const prefix of ["toggle:", "install:", "permission:", "confirm:import:"] as const) {
    if (key.startsWith(prefix)) return key.slice(prefix.length)
  }
  const uninstallPrefix = "confirm:uninstall:"
  return key.startsWith(uninstallPrefix) ? key.slice(uninstallPrefix.length) : null
}

const isRegistryBusyKey = (key: string): boolean =>
  key === "registry:refresh" ||
  key === "registry:clear-cache" ||
  key === "registry:apply-source" ||
  key === "registry:use-local" ||
  key === "registry:restore-defaults" ||
  key.startsWith("install:")

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

/**
 * 用户通常只输入主机名。补全 https:// 后再交给校验，
 * 其它协议原样保留，让下游给出明确的拒绝理由而不是笼统的格式错误。
 */
const normalizeBindingOriginInput = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

interface SitePacksPageProps {
  initialTab?: string
}

/** Same loopback URL can be re-applied to re-check after local registry rebuilds. */
const isReapplyableLoopbackRegistrySource = (sourceInput: string): boolean => {
  const trimmed = sourceInput.trim()
  if (!trimmed) return false
  try {
    return isLoopbackRegistrySourceUrl(normalizeRemoteConfigSourceUrl(trimmed))
  } catch {
    return false
  }
}

const SitePacksPage: React.FC<SitePacksPageProps> = ({ initialTab }) => {
  const currentLanguage = useSyncExternalStore(subscribeI18nChanges, getCurrentLang, getCurrentLang)
  const packManager = useMemo(() => createRuntimePackManager(platform.storage), [])
  const settings = useSettingsStore((state) => state.settings)
  const updateNestedSetting = useSettingsStore((state) => state.updateNestedSetting)
  const pageRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const patchFileInputRef = useRef<HTMLInputElement>(null)
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
  const [bindingPackId, setBindingPackId] = useState("")
  // 显式编辑态：锁定正在编辑的绑定域名，改域名提交时按“迁移绑定”处理而不是新增
  const [editingOrigin, setEditingOrigin] = useState<string | null>(null)
  const [resettingSiteId, setResettingSiteId] = useState<string | null>(null)
  const [registryQuery, setRegistryQuery] = useState("")
  const [pendingLocateId, setPendingLocateId] = useState<string | null>(null)
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
  const userscriptReferenceGraph = useMemo(
    () =>
      platform.type === "userscript"
        ? deriveSitePackOriginReferences(installedPacks, originBindings)
        : null,
    [installedPacks, originBindings],
  )
  const canonicalFormOrigin = useMemo(() => {
    try {
      return canonicalizeSitePackBindingOrigin(normalizeBindingOriginInput(bindingOrigin))
    } catch {
      return null
    }
  }, [bindingOrigin])
  const isUpdatingBinding =
    editingOrigin !== null ||
    Boolean(canonicalFormOrigin && originBindings.bindings[canonicalFormOrigin])
  const registryViews = useMemo(
    () => buildRegistrySitePackViews(remoteState, installedPacks, currentLanguage),
    [currentLanguage, installedPacks, remoteState],
  )
  const filteredRegistryViews = useMemo(() => {
    const query = registryQuery.trim().toLowerCase()
    if (!query) return registryViews
    return registryViews.filter((view) =>
      [view.name, view.id, view.description ?? "", ...view.matches].some((field) =>
        field.toLowerCase().includes(query),
      ),
    )
  }, [registryQuery, registryViews])
  // 已有绑定指向的适配包集合：自部署包（manifest.matches 为空）不在其中时需要引导绑定
  const boundPackIds = useMemo(
    () => new Set(Object.values(originBindings.bindings).map((binding) => binding.packId)),
    [originBindings],
  )
  const activePatches = useMemo(() => {
    type ActivePatchRow = {
      siteId: string
      siteName: string
      patchVersion: number
      baseConfigVersion: number
      source: "registry" | "local"
      fileName?: string
    }
    const bySiteId = new Map<string, ActivePatchRow>()
    for (const [siteId, cachedPatch] of Object.entries(remoteState?.active?.patches ?? {})) {
      bySiteId.set(siteId, {
        siteId,
        siteName: builtinPlatformNames.get(siteId) ?? siteId,
        patchVersion: cachedPatch.index.patchVersion,
        baseConfigVersion: cachedPatch.index.baseConfigVersion,
        source: "registry",
      })
    }
    for (const [siteId, record] of Object.entries(remoteState?.localPatches ?? {})) {
      bySiteId.set(siteId, {
        siteId,
        siteName: builtinPlatformNames.get(siteId) ?? siteId,
        patchVersion: record.patch.patchVersion,
        baseConfigVersion: record.patch.baseConfigVersion,
        source: "local",
        ...(record.fileName ? { fileName: record.fileName } : {}),
      })
    }
    return Array.from(bySiteId.values()).sort((left, right) =>
      left.siteName.localeCompare(right.siteName),
    )
  }, [remoteState])
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
        (key) =>
          key === "import:read" ||
          key === "import-patch:read" ||
          key.startsWith("confirm:import:") ||
          key.startsWith("confirm:import-patch:"),
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

  /** 跨 tab 跳转后把目标区块滚到视野内并复用设置页既有的定位高亮。 */
  useEffect(() => {
    if (!pendingLocateId) return

    const frame = window.requestAnimationFrame(() => {
      const target = pageRef.current?.querySelector<HTMLElement>(
        `[data-setting-id="${pendingLocateId}"]`,
      )
      setPendingLocateId(null)
      if (!target) return

      scrollWithinSettingsContent(target)
      target.classList.add("setting-locate-highlight")
      window.setTimeout(() => target.classList.remove("setting-locate-highlight"), 2200)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [pendingLocateId])

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

    try {
      const origin = canonicalizeSitePackBindingOrigin(normalizeBindingOriginInput(bindingOrigin))
      if (!installedById.has(bindingPackId)) {
        throw new Error(t("sitePacksBindingPackRequired"))
      }
      const binding: SitePackOriginBinding = { mode: "explicit", packId: bindingPackId }

      // 编辑态下改了域名视为迁移绑定；目标域名已有绑定则阻止，避免静默覆盖
      const moveFrom = editingOrigin !== null && editingOrigin !== origin ? editingOrigin : null
      if (moveFrom && originBindings.bindings[origin]) {
        notifyError(t("sitePacksBindingOriginExists", { origin }))
        return
      }

      const previousBinding = originBindings.bindings[origin]
      const moveFromBinding = moveFrom ? originBindings.bindings[moveFrom] : undefined
      const requestName = resolveSitePackName(
        installedById.get(bindingPackId)!.manifest,
        getCurrentLang(),
      )
      const permission = await platform.sitePacks.ensureBindingOrigin(origin, binding, requestName)
      if (permission === "denied") {
        notifyError(t("sitePacksBindingPermissionDenied", { origin }))
        return
      }

      let wroteNewBinding = false
      try {
        await packManager.setOriginBinding(origin, binding)
        wroteNewBinding = true
        if (moveFrom) await packManager.removeOriginBinding(moveFrom)
        await syncRuntimeStatus()
        await loadOriginBindings()
      } catch (error) {
        if (!wroteNewBinding) throw error
        // 新绑定写入后的任何失败统一回滚：恢复原值（或删除）；迁移场景同时还原旧域名绑定
        try {
          if (previousBinding) {
            await packManager.setOriginBinding(origin, previousBinding)
          } else {
            await packManager.removeOriginBinding(origin)
          }
          if (moveFrom && moveFromBinding) {
            await packManager.setOriginBinding(moveFrom, moveFromBinding)
          }
          await syncRuntimeStatus()
          await loadOriginBindings()
        } catch (rollbackError) {
          throw new Error(
            `SitePack origin binding operation failed: ${getErrorMessage(error)}; rollback failed: ${getErrorMessage(rollbackError)}`,
          )
        }
        throw error
      }

      if (moveFrom) setEditingOrigin(origin)
      // 新增成功后清空输入框，给出明确的“已提交”信号；更新/迁移则保留域名便于继续调整
      setBindingOrigin(previousBinding || moveFrom ? origin : "")
      notify(t("saveSuccess"))
    } catch (error) {
      if (error instanceof SitePackOriginBindingsError && error.code === "invalid-origin") {
        notifyError(t("sitePacksBindingHint"))
      } else {
        reportOperationError(error)
      }
    } finally {
      endBusy(key)
    }
  }

  /** 把已有绑定回填到表单进入编辑态；表单在列表上方，长列表时需滚动右侧内容区并聚焦 */
  const handleEditOriginBinding = (origin: string, binding: SitePackOriginBinding) => {
    setEditingOrigin(origin)
    setBindingOrigin(origin)
    setBindingPackId(binding.packId)
    const form = pageRef.current?.querySelector<HTMLElement>(".settings-pack-binding-form")
    if (form) {
      // 只滚动右侧内容区并提到顶部，避免连带滚动弹窗容器或背景页
      scrollWithinSettingsContent(form, { block: "start" })
      form.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true })
    }
  }

  const handleCancelEditOriginBinding = () => {
    setEditingOrigin(null)
    setBindingOrigin("")
  }

  /** 自部署包的一键绑定引导：切到自定义站点 tab、预选该包并定位高亮表单 */
  const handleBindPackNow = (packId: string) => {
    handleCancelEditOriginBinding()
    setActiveTab(SITE_PACKS_TAB_IDS.ORIGINS)
    setBindingPackId(packId)
    setPendingLocateId("site-pack-custom-origin")
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
      // 删除的正是编辑中的绑定时退出编辑态，避免向已不存在的域名提交
      if (origin === editingOrigin) {
        setEditingOrigin(null)
        setBindingOrigin("")
      }
      notify(t("deleteSuccess"))
    } catch (error) {
      reportOperationError(error)
    } finally {
      endBusy(key)
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
  const refreshRegistry = useCallback(
    async (
      options: {
        manageBusyState?: boolean
        sources?: readonly string[]
        silent?: boolean
      } = {},
    ): Promise<RemoteConfigCheckResult | null> => {
      const manageBusyState = options.manageBusyState !== false
      const key = "registry:refresh"
      if (manageBusyState && !beginBusy(key)) return null
      try {
        const result = await platform.remoteConfig.checkForUpdates(
          options.sources && options.sources.length > 0 ? { sources: options.sources } : undefined,
        )
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
        await Promise.all([loadInstalledPacks(), loadRegistryState()])
        if (syncResult.issues.length > 0) {
          setSnapshotIssues((current) => mergePackManagerIssues(current, syncResult.issues))
        }

        if (deniedPacks.length > 0) {
          reportPermissionDenied(deniedPacks[0])
          return result
        }

        if (!options.silent) {
          notify(
            t(
              result.status === "updated"
                ? "remoteConfigCheckUpdated"
                : "remoteConfigCheckUpToDate",
            ),
          )
        }
        return result
      } catch (error) {
        reportOperationError(error)
        return null
      } finally {
        if (manageBusyState) endBusy(key)
      }
    },
    [
      beginBusy,
      endBusy,
      loadInstalledPacks,
      loadRegistryState,
      packManager,
      prepareInstalledPacksRuntime,
      reportOperationError,
      reportPermissionDenied,
    ],
  )

  // 首次安装时在线适配库为空，进入“获取与更新”页自动检查一次；
  // 底层按 checkIntervalMs 节流，重复进入或双重挂载不会频繁请求。
  const autoCheckedTabRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeTab !== SITE_PACKS_TAB_IDS.UPDATES) {
      autoCheckedTabRef.current = null
      return
    }
    if (autoCheckedTabRef.current === activeTab) return
    autoCheckedTabRef.current = activeTab
    void refreshRegistry({ silent: true })
  }, [activeTab, refreshRegistry])

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

  const handleRemoveLocalPatch = async (siteId: string, siteName: string) => {
    setResettingSiteId(siteId)
    try {
      const removed = await platform.remoteConfig.removeLocalPatch(siteId)
      if (!removed) throw new Error(t("remoteConfigResetUnavailable"))
      notify(t("remoteConfigLocalPatchRemoved", { site: siteName }))
      await loadRegistryState()
    } catch (error) {
      notifyError(t("remoteConfigLocalPatchRemoveFailed", { error: getErrorMessage(error) }))
    } finally {
      setResettingSiteId(null)
    }
  }

  const handlePatchFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    const key = "import-patch:read"
    if (!beginBusy(key)) return
    try {
      if (file.size > SITE_PACK_MAX_BYTES) {
        notifyError(t("remoteConfigLocalPatchInvalid"))
        return
      }
      const content = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        notifyError(t("remoteConfigLocalPatchInvalid"))
        return
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        notifyError(t("remoteConfigLocalPatchInvalid"))
        return
      }
      const record = parsed as Record<string, unknown>
      const siteId = typeof record.targetSiteId === "string" ? record.targetSiteId : ""
      const patchVersion =
        typeof record.patchVersion === "number" && Number.isSafeInteger(record.patchVersion)
          ? record.patchVersion
          : 0
      const baseConfigVersion =
        typeof record.baseConfigVersion === "number" &&
        Number.isSafeInteger(record.baseConfigVersion)
          ? record.baseConfigVersion
          : 0
      if (!siteId || patchVersion < 1 || baseConfigVersion < 1) {
        notifyError(t("remoteConfigLocalPatchInvalid"))
        return
      }
      setConfirmation({
        type: "import-patch",
        patch: parsed,
        fileName: file.name,
        siteId,
        siteName: builtinPlatformNames.get(siteId) ?? siteId,
        patchVersion,
        baseConfigVersion,
      })
    } catch (error) {
      reportOperationError(error)
    } finally {
      endBusy(key)
    }
  }

  const openPatchImportPicker = (trigger: HTMLElement) => {
    confirmationTriggerRef.current = trigger
    patchFileInputRef.current?.click()
  }

  const ensureLocalRegistryHostPermission = async (sourceUrl: string): Promise<boolean> => {
    let url: URL
    try {
      url = new URL(sourceUrl)
    } catch {
      return true
    }
    const isLoopback =
      url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
    if (!isLoopback) return true
    if (typeof chrome === "undefined" || !chrome.permissions?.request) return true

    const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80
    const origins = getLocalDevRegistryOriginPatterns(url.hostname, port)
    try {
      const already = await chrome.permissions.contains({ origins })
      if (already) return true
      return await chrome.permissions.request({ origins })
    } catch (error) {
      console.warn("[Ophel] Failed to request local registry host permission:", error)
      return false
    }
  }

  const clearRegistryCache = async (): Promise<boolean> => {
    try {
      await platform.remoteConfig.clearCache()
      await loadRegistryState()
      return true
    } catch (error) {
      setRegistrySourceError(
        t("remoteConfigRegistryCacheClearFailed", { error: getErrorMessage(error) }),
      )
      return false
    }
  }

  const handleClearRegistryCache = async () => {
    const key = "registry:clear-cache"
    if (!beginBusy(key)) return
    try {
      const cleared = await clearRegistryCache()
      if (!cleared) return
      notify(t("remoteConfigRegistryCacheCleared"))
    } finally {
      endBusy(key)
    }
  }

  const handleApplyRegistrySource = async (options: { forceCheck?: boolean } = {}) => {
    const source = registrySourceInput.trim()
    const key = "registry:apply-source"
    if (!beginBusy(key)) return

    try {
      if (!source) {
        const previousActiveSource = remoteState?.active?.sourceUrl
        updateNestedSetting("remoteConfig", "registrySourceUrl", "")
        setRegistrySourceInput("")
        setRegistrySourceError(null)
        // Leaving a loopback snapshot behind poisons later production checks for some clients;
        // always drop cache when restoring defaults from a local active source.
        if (previousActiveSource && isLoopbackRegistrySourceUrl(previousActiveSource)) {
          await clearRegistryCache()
        }
        notify(t("remoteConfigRegistrySourceCleared"))
        if (options.forceCheck) {
          await refreshRegistry({
            manageBusyState: false,
            sources: DEFAULT_REMOTE_CONFIG_SOURCES,
          })
        }
        return
      }

      const normalizedSource = normalizeRemoteConfigSourceUrl(source)
      const permitted = await ensureLocalRegistryHostPermission(normalizedSource)
      if (!permitted) {
        setRegistrySourceError(t("remoteConfigLocalRegistryPermissionDenied"))
        return
      }

      const previousActiveSource = remoteState?.active?.sourceUrl
      const crossingLocalBoundary =
        Boolean(previousActiveSource) &&
        isLoopbackRegistrySourceUrl(previousActiveSource!) !==
          isLoopbackRegistrySourceUrl(normalizedSource)
      if (crossingLocalBoundary) {
        await clearRegistryCache()
      }

      updateNestedSetting("remoteConfig", "registrySourceUrl", normalizedSource)
      setRegistrySourceInput(normalizedSource)
      setRegistrySourceError(null)
      notify(t("remoteConfigRegistrySourceApplied"))
      // Always check immediately after applying a custom registry source.
      await refreshRegistry({
        manageBusyState: false,
        sources: [normalizedSource],
      })
    } catch (error) {
      setRegistrySourceError(
        t("remoteConfigRegistrySourceInvalid", { error: getErrorMessage(error) }),
      )
    } finally {
      endBusy(key)
    }
  }

  const handleUseLocalRegistrySource = async () => {
    const localUrl = getLocalDevRegistryIndexUrl()
    const key = "registry:use-local"
    if (!beginBusy(key)) return
    setRegistrySourceInput(localUrl)
    setRegistrySourceError(null)
    try {
      const normalizedSource = normalizeRemoteConfigSourceUrl(localUrl)
      const permitted = await ensureLocalRegistryHostPermission(normalizedSource)
      if (!permitted) {
        setRegistrySourceError(t("remoteConfigLocalRegistryPermissionDenied"))
        return
      }
      const previousActiveSource = remoteState?.active?.sourceUrl
      if (previousActiveSource && !isLoopbackRegistrySourceUrl(previousActiveSource)) {
        await clearRegistryCache()
      }
      updateNestedSetting("remoteConfig", "registrySourceUrl", normalizedSource)
      setRegistrySourceInput(normalizedSource)
      notify(t("remoteConfigLocalRegistrySourceApplied"))
      await refreshRegistry({
        manageBusyState: false,
        sources: [normalizedSource],
      })
    } catch (error) {
      const message = getErrorMessage(error)
      setRegistrySourceError(t("remoteConfigRegistrySourceInvalid", { error: message }))
      notifyError(
        t("remoteConfigLocalRegistryCheckFailed", {
          error: message,
          url: localUrl,
        }),
      )
    } finally {
      endBusy(key)
    }
  }

  const handleRestoreDefaultRegistrySource = async () => {
    const key = "registry:restore-defaults"
    if (!beginBusy(key)) return
    try {
      updateNestedSetting("remoteConfig", "registrySourceUrl", "")
      setRegistrySourceInput("")
      setRegistrySourceError(null)
      await clearRegistryCache()
      notify(t("remoteConfigRegistryDefaultsRestored"))
      await refreshRegistry({
        manageBusyState: false,
        sources: DEFAULT_REMOTE_CONFIG_SOURCES,
      })
    } catch (error) {
      setRegistrySourceError(
        t("remoteConfigRegistrySourceInvalid", { error: getErrorMessage(error) }),
      )
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

    if (confirmation.type === "import-patch") {
      const key = `confirm:import-patch:${confirmation.siteId}`
      if (!beginBusy(key)) return
      try {
        await platform.remoteConfig.installLocalPatch(confirmation.patch, confirmation.fileName)
        await loadRegistryState()
        notify(
          t("remoteConfigLocalPatchInstalled", {
            site: confirmation.siteName,
            version: String(confirmation.patchVersion),
          }),
        )
        setConfirmation(null)
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
    const userscriptMatchRequired = false
    const missingPermission =
      !userscriptReferenceGraph && runtimeStatus.missingPermissionOrigins.includes(originPattern)
    const active = userscriptReferenceGraph
      ? Boolean(referenceEntry)
      : runtimeStatus.activeOrigins.some((activeOrigin) =>
          siteMatchPatternOriginPatternCovers(activeOrigin, originPattern),
        )
    const status = issue
      ? {
          tone: "danger",
          label:
            issue.code === "binding-pack-missing"
              ? t("sitePacksStatusPackMissing")
              : t("sitePacksStatusIncompatible"),
        }
      : userscriptMatchRequired
        ? { tone: "warning", label: t("sitePacksStatusMatchRequired") }
        : missingPermission
          ? { tone: "warning", label: t("notGranted") }
          : active
            ? { tone: "success", label: t("sitePacksStatusAvailable") }
            : { tone: "neutral", label: t("sitePacksStatusDisabled") }
    const boundPack = installedById.get(binding.packId)
    const summary = boundPack
      ? resolveSitePackName(boundPack.manifest, currentLanguage)
      : binding.packId
    const busy = busyKeys.has(`binding:remove:${origin}`)

    return (
      <div className="settings-pack-item" key={origin}>
        <div className="settings-pack-icon" aria-hidden="true">
          <GlobeIcon size={16} />
        </div>
        <div className="settings-pack-info">
          <div className="settings-pack-title-line">
            <button
              type="button"
              className="settings-pack-origin-link"
              title={`${t("sitePacksOpenSite")}: ${origin}`}
              aria-label={`${t("sitePacksOpenSite")}: ${origin}`}
              onClick={() => platform.openTab(origin)}>
              <span className="settings-pack-origin">{origin}</span>
              <ExternalLinkIcon size={12} />
            </button>
            <span className={`settings-pack-badge ${status.tone}`}>{status.label}</span>
          </div>
          <div className="settings-pack-meta">
            <span>{summary}</span>
          </div>
        </div>
        <div className="settings-pack-controls">
          <button
            type="button"
            className="settings-pack-icon-btn"
            disabled={busy || isBindingBusy}
            title={t("edit")}
            aria-label={`${t("edit")}: ${origin}`}
            onClick={() => handleEditOriginBinding(origin, binding)}>
            <EditIcon size={15} />
          </button>
          <button
            type="button"
            className="settings-pack-icon-btn danger"
            disabled={busy || isBindingBusy}
            title={t("delete")}
            aria-label={`${t("delete")}: ${origin}`}
            onClick={() => void handleRemoveOriginBinding(origin)}>
            <DeleteIcon size={15} />
          </button>
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
    const firstSiteUrl = firstMatch ? siteMatchPatternOrigin(firstMatch) : undefined
    const name = resolveSitePackName(pack.manifest, currentLanguage)
    // 与提示词平台筛选同一条 favicon 规则；无 favicon 或加载失败时回退为首字母
    const faviconUrl = getSitePackFaviconUrl([
      ...pack.manifest.matches,
      ...getSitePackBoundOriginPatterns(pack, originBindings),
    ])
    const description = resolveSitePackDescription(pack.manifest, currentLanguage)
    // 自部署包没有任何绑定指向时不会在任何站点生效，显式提示并给出绑定入口
    const needsBinding = pack.manifest.matches.length === 0 && !boundPackIds.has(packId)

    return (
      <div className="settings-pack-item" key={packId}>
        <div
          className="settings-pack-icon"
          style={getPackIconStyle(pack.manifest.theme)}
          aria-hidden="true">
          <PlatformIcon platform={faviconUrl ? { name, faviconUrl } : { name }} size={18} />
        </div>
        <div className="settings-pack-info">
          <div className="settings-pack-title-line">
            <strong title={packId}>{name}</strong>
            {needsBinding && (
              <span className="settings-pack-badge warning">{t("sitePacksNeedsBindingBadge")}</span>
            )}
            {status && <span className={`settings-pack-badge ${status.tone}`}>{status.label}</span>}
          </div>
          {description && <p className="settings-pack-description">{description}</p>}
          <div className="settings-pack-meta">
            <span className="settings-pack-version">v{pack.manifest.version}</span>
            <span className="settings-pack-source">
              {t(pack.source === "registry" ? "sitePacksSourceRegistry" : "sitePacksSourceLocal")}
            </span>
            {firstMatch &&
              (firstSiteUrl ? (
                <button
                  type="button"
                  className="settings-pack-origin-link"
                  title={firstMatch}
                  aria-label={`${t("sitePacksOpenSite")}: ${firstSiteUrl}`}
                  onClick={() => platform.openTab(firstSiteUrl)}>
                  <span className="settings-pack-origin">{firstSiteUrl}</span>
                  <ExternalLinkIcon size={12} />
                </button>
              ) : (
                <code className="settings-pack-match" title={firstMatch}>
                  {firstMatch}
                </code>
              ))}
            {needsBinding && (
              <button
                type="button"
                className="settings-pack-bind-now-btn"
                onClick={() => handleBindPackNow(packId)}>
                {t("sitePacksBindNowAction")}
              </button>
            )}
          </div>
        </div>
        <div className="settings-pack-controls">
          {firstSiteUrl && (
            <button
              type="button"
              className="settings-pack-icon-btn"
              title={t("sitePacksOpenSite")}
              aria-label={`${t("sitePacksOpenSite")}: ${name}`}
              onClick={() => platform.openTab(firstSiteUrl)}>
              <ExternalLinkIcon size={15} />
            </button>
          )}
          <button
            type="button"
            className="settings-pack-icon-btn danger"
            disabled={isBusy}
            title={t("sitePacksUninstall")}
            aria-label={`${t("sitePacksUninstall")}: ${name}`}
            onClick={(event) => {
              confirmationTriggerRef.current = event.currentTarget
              setConfirmation({ type: "uninstall", pack })
            }}>
            <DeleteIcon size={15} />
          </button>
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
    const isSelfHosted = view.matches.length === 0
    const firstMatch = view.matches[0]
    const firstSiteUrl = firstMatch ? siteMatchPatternOrigin(firstMatch) : undefined
    const version = view.availableVersion ?? view.latestVersion
    // 已安装的 registry 包把用户绑定域名也计入 favicon 来源，与已安装列表保持一致
    const faviconUrl = getSitePackFaviconUrl(
      view.installed
        ? [...view.matches, ...getSitePackBoundOriginPatterns(view.installed, originBindings)]
        : view.matches,
    )

    return (
      <div className="settings-pack-item" key={view.id}>
        <div className="settings-pack-icon" style={getPackIconStyle(view.theme)} aria-hidden="true">
          <PlatformIcon
            platform={faviconUrl ? { name: view.name, faviconUrl } : { name: view.name }}
            size={18}
          />
        </div>
        <div className="settings-pack-info">
          <div className="settings-pack-title-line">
            <strong title={view.id}>{view.name}</strong>
            {isSelfHosted && (
              <span className="settings-pack-badge">{t("sitePacksSelfHostedBadge")}</span>
            )}
            {!isAvailable && (
              <span
                className={`settings-pack-badge ${getRegistryAvailabilityTone(view.availability)}`}>
                {getRegistryAvailabilityLabel(view.availability)}
              </span>
            )}
          </div>
          {view.description && <p className="settings-pack-description">{view.description}</p>}
          <div className="settings-pack-meta">
            <span className="settings-pack-version">v{version}</span>
            {firstMatch &&
              (firstSiteUrl ? (
                <button
                  type="button"
                  className="settings-pack-origin-link"
                  title={firstMatch}
                  aria-label={`${t("sitePacksOpenSite")}: ${firstSiteUrl}`}
                  onClick={() => platform.openTab(firstSiteUrl)}>
                  <span className="settings-pack-origin">{firstSiteUrl}</span>
                  <ExternalLinkIcon size={12} />
                </button>
              ) : (
                <code className="settings-pack-match" title={firstMatch}>
                  {firstMatch}
                </code>
              ))}
            {isSelfHosted && <span>{t("sitePacksSelfHostedHint")}</span>}
            {view.availability === "incompatible" && (
              <span>{t("sitePacksRequiresNewerApp", { version: view.minAppVersion })}</span>
            )}
          </div>
        </div>
        <div className="settings-pack-controls">
          {firstSiteUrl && (
            <button
              type="button"
              className="settings-pack-icon-btn"
              title={t("sitePacksOpenSite")}
              aria-label={`${t("sitePacksOpenSite")}: ${view.name}`}
              onClick={() => platform.openTab(firstSiteUrl)}>
              <ExternalLinkIcon size={15} />
            </button>
          )}
          <Button
            type="button"
            size="sm"
            variant={canUpdate ? "primary" : "secondary"}
            className="settings-pack-action-button"
            disabled={!isAvailable || (isInstalled && !canUpdate) || isBusy || isRegistryBusy}
            onClick={() => void handleInstallRegistry(view)}>
            {isInstalled && !canUpdate && <CheckIcon size={13} />}
            {canUpdate
              ? t("sitePacksUpdate")
              : isInstalled
                ? t("sitePacksInstalledBadge")
                : t("sitePacksInstall")}
          </Button>
        </div>
      </div>
    )
  }

  const confirmationPackId =
    confirmation?.type === "import"
      ? confirmation.manifest.id
      : confirmation?.type === "uninstall"
        ? confirmation.pack.manifest.id
        : confirmation?.type === "import-patch"
          ? confirmation.siteId
          : undefined
  const isDialogBusy = confirmation
    ? confirmation.type === "import-patch"
      ? busyKeys.has(`confirm:import-patch:${confirmation.siteId}`) ||
        busyKeys.has("import-patch:read")
      : Boolean(confirmationPackId && isPackBusy(confirmationPackId))
    : false
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
      <PageTitle title={t("navSitePacks")} Icon={SitePacksIcon} />
      <p className="settings-page-desc">{t("sitePacksPageDesc")}</p>

      <div className="settings-pack-toolbar">
        <TabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        <button
          type="button"
          className="settings-pack-guide-link"
          onClick={() => platform.openTab(getSitePackGuideUrl(currentLanguage))}>
          {t("sitePacksGuideAction")}
          <ExternalLinkIcon size={13} />
        </button>
      </div>

      {permissionReviewPacks.length > 0 && (
        <div className="settings-pack-notice" role="alert">
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
              <div className="settings-pack-empty-icon" aria-hidden="true">
                <PuzzleIcon size={22} />
              </div>
              <strong>{t("sitePacksNoInstalled")}</strong>
              <div className="settings-pack-empty-actions">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setActiveTab(SITE_PACKS_TAB_IDS.UPDATES)
                    setPendingLocateId("site-packs-registry")
                  }}>
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
            <>
              <div className="settings-pack-list-toolbar">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isRegistryBusy}
                  onClick={() => void refreshRegistry()}>
                  <RefreshIcon size={14} className={isCheckingRegistry ? "spinning" : ""} />
                  {isCheckingRegistry
                    ? t("remoteConfigCheckingButton")
                    : t("sitePacksCheckUpdates")}
                </Button>
              </div>
              <div className="settings-pack-list">
                {sortedInstalledPacks.map(renderInstalledPack)}
              </div>
            </>
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
          <section className="settings-card" data-setting-id="site-pack-custom-origin">
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
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={bindingOrigin}
                  placeholder={t("sitePacksCustomOriginPlaceholder")}
                  disabled={isBindingBusy}
                  onChange={(event) => setBindingOrigin(event.target.value)}
                  onBlur={() => setBindingOrigin(normalizeBindingOriginInput(bindingOrigin))}
                  aria-label={t("sitePacksCustomOriginLabel")}
                />
              </label>
              <div className="settings-pack-field settings-pack-field-pack">
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
              <div className="settings-pack-binding-actions">
                {editingOrigin !== null && (
                  <Button
                    type="button"
                    size="md"
                    variant="secondary"
                    className="settings-pack-action-button"
                    disabled={isBindingBusy}
                    onClick={handleCancelEditOriginBinding}>
                    {t("cancel")}
                  </Button>
                )}
                <Button
                  type="submit"
                  size="md"
                  variant="primary"
                  className="settings-pack-action-button settings-pack-binding-submit"
                  disabled={isBindingBusy || isBindingsLoading || isInstalledLoading}>
                  {isUpdatingBinding ? t("sitePacksUpdate") : t("add")}
                </Button>
              </div>
            </form>

            {editingOrigin !== null && (
              <p className="settings-pack-field-hint editing">
                {t("sitePacksBindingEditing", { origin: editingOrigin })}
              </p>
            )}
            <p className="settings-pack-field-hint">{t("sitePacksBindingHint")}</p>
          </section>

          <section className="settings-card">
            <div className="settings-card-title">{t("sitePacksBindingListTitle")}</div>
            {isBindingsLoading ? (
              <SitePackListSkeleton />
            ) : sortedOriginBindings.length === 0 ? (
              <div className="settings-pack-empty-state">
                <div className="settings-pack-empty-icon" aria-hidden="true">
                  <GlobeIcon size={20} />
                </div>
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
          <section className="settings-card" data-setting-id="site-packs-registry">
            <div className="settings-pack-section-head">
              <div className="settings-card-title">{t("sitePacksRegistryTitle")}</div>
              {registryViews.length > 0 && (
                <div className="settings-pack-search">
                  <Input
                    type="search"
                    autoComplete="off"
                    spellCheck={false}
                    value={registryQuery}
                    placeholder={t("sitePacksRegistrySearchPlaceholder")}
                    aria-label={t("sitePacksRegistrySearchPlaceholder")}
                    onChange={(event) => setRegistryQuery(event.target.value)}
                  />
                </div>
              )}
            </div>

            {registryError && (
              <InlineError message={registryError} onRetry={() => void loadRegistryState(true)} />
            )}

            {isRegistryLoading ? (
              <SitePackListSkeleton />
            ) : registryViews.length === 0 ? (
              <div className="settings-pack-empty-state">
                <div className="settings-pack-empty-icon" aria-hidden="true">
                  <GlobeIcon size={20} />
                </div>
                <strong>{t("sitePacksRegistryEmpty")}</strong>
              </div>
            ) : filteredRegistryViews.length === 0 ? (
              <div className="settings-pack-empty-state">
                <div className="settings-pack-empty-icon" aria-hidden="true">
                  <GlobeIcon size={20} />
                </div>
                <strong>{t("sitePacksRegistryNoMatch")}</strong>
              </div>
            ) : (
              <div className="settings-pack-list">
                {filteredRegistryViews.map(renderRegistryPack)}
              </div>
            )}
          </section>

          <section className="settings-card settings-pack-secondary-card">
            <div className="settings-pack-import-row">
              <div className="settings-pack-icon" aria-hidden="true">
                <ImportIcon size={16} />
              </div>
              <div className="settings-pack-import-text">
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

            <div className="settings-pack-patches" data-setting-id="remote-config-active-patches">
              <div className="settings-pack-section-head">
                <div className="settings-pack-subsection-title">
                  {t("remoteConfigActivePatchesLabel")}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="settings-pack-action-button"
                  data-setting-id="remote-config-local-patch-import"
                  disabled={isRegistryBusy || isImportBusy}
                  onClick={(event) => openPatchImportPicker(event.currentTarget)}>
                  <ImportIcon size={14} />
                  {t("remoteConfigLocalPatchImportButton")}
                </Button>
              </div>
              <p className="settings-pack-source-desc">{t("remoteConfigLocalPatchImportDesc")}</p>
              {activePatches.length === 0 ? (
                <p className="settings-pack-patch-status">{t("remoteConfigUsingBuiltin")}</p>
              ) : (
                <div className="settings-pack-list">
                  {activePatches.map((patch) => (
                    <div className="settings-pack-item" key={`${patch.source}:${patch.siteId}`}>
                      <div className="settings-pack-info">
                        <div className="settings-pack-title-line">
                          <strong>{patch.siteName}</strong>
                          <span className="settings-site-pack-badge">
                            {t(
                              patch.source === "local"
                                ? "remoteConfigPatchSourceLocal"
                                : "remoteConfigPatchSourceRegistry",
                            )}
                          </span>
                        </div>
                        <div className="settings-pack-meta">
                          <span
                            className="settings-pack-version"
                            title={t("remoteConfigPatchVersionLabel")}>
                            v{patch.patchVersion}
                          </span>
                          <span>
                            {t("remoteConfigBaseVersionLabel")} {patch.baseConfigVersion}
                          </span>
                          {patch.fileName ? (
                            <span title={patch.fileName}>{patch.fileName}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="settings-pack-controls">
                        {patch.source === "local" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="settings-pack-action-button"
                            disabled={isRegistryBusy || resettingSiteId !== null}
                            onClick={() =>
                              void handleRemoveLocalPatch(patch.siteId, patch.siteName)
                            }>
                            {resettingSiteId === patch.siteId
                              ? t("remoteConfigResettingButton")
                              : t("remoteConfigLocalPatchRemoveButton")}
                          </Button>
                        ) : null}
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

          {IS_DEVELOPMENT_BUILD && (
            <section
              className="settings-card settings-pack-dev-card"
              data-setting-id="remote-config-registry-source">
              <label className="settings-card-title" htmlFor="remote-config-registry-source-input">
                {t("remoteConfigRegistrySourceLabel")}
              </label>
              <p className="settings-pack-source-desc">{t("remoteConfigRegistrySourceDesc")}</p>
              <p className="settings-pack-source-desc">
                {t("remoteConfigRegistryActiveSourceLabel")}:{" "}
                <code>
                  {remoteState?.active?.sourceUrl ?? t("remoteConfigRegistryActiveSourceDefault")}
                </code>
                {remoteState?.active?.index.registryRevision !== undefined
                  ? ` · rev ${remoteState.active.index.registryRevision}`
                  : ""}
                {configuredRegistrySource ? ` · ${t("remoteConfigRegistryOverrideLabel")}` : ""}
              </p>
              {remoteState?.lastError?.message ? (
                <p className="settings-pack-source-error" role="status">
                  {t("remoteConfigRegistryLastErrorLabel")}: {remoteState.lastError.message}
                </p>
              ) : null}
              <div className="settings-pack-source-controls">
                <div className="settings-pack-source-input-row">
                  <Input
                    id="remote-config-registry-source-input"
                    type="text"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={registrySourceInput}
                    placeholder={t("remoteConfigRegistrySourcePlaceholder")}
                    aria-invalid={registrySourceError ? "true" : undefined}
                    disabled={isRegistryBusy}
                    onChange={(event) => {
                      setRegistrySourceInput(event.target.value)
                      setRegistrySourceError(null)
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="settings-pack-action-button settings-pack-source-apply"
                    disabled={
                      isRegistryBusy ||
                      (registrySourceInput.trim() === configuredRegistrySource &&
                        !isReapplyableLoopbackRegistrySource(registrySourceInput))
                    }
                    onClick={() => void handleApplyRegistrySource({ forceCheck: true })}>
                    {t("remoteConfigRegistrySourceApplyButton")}
                  </Button>
                </div>
                <div className="settings-pack-source-actions">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="settings-pack-action-button"
                    disabled={isRegistryBusy}
                    onClick={() => void handleUseLocalRegistrySource()}>
                    {t("remoteConfigLocalRegistryUseButton")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="settings-pack-action-button"
                    disabled={isRegistryBusy}
                    onClick={() => void handleRestoreDefaultRegistrySource()}>
                    {t("remoteConfigRegistryRestoreDefaultsButton")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="settings-pack-action-button"
                    disabled={isRegistryBusy || (!remoteState?.active && !remoteState?.lastError)}
                    onClick={() => void handleClearRegistryCache()}>
                    {t("remoteConfigRegistryCacheClearButton")}
                  </Button>
                </div>
              </div>
              <p className="settings-pack-source-desc">
                {t("remoteConfigLocalRegistryHint", {
                  button: t("remoteConfigLocalRegistryUseButton"),
                })}
              </p>
              {registrySourceError && (
                <span className="settings-pack-source-error" role="alert">
                  {registrySourceError}
                </span>
              )}
            </section>
          )}
        </>
      )}

      <input
        ref={fileInputRef}
        className="settings-pack-file-input"
        type="file"
        accept="application/json,.json"
        onChange={(event) => void handleFileSelected(event)}
      />
      <input
        ref={patchFileInputRef}
        className="settings-pack-file-input"
        type="file"
        accept="application/json,.json"
        onChange={(event) => void handlePatchFileSelected(event)}
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

      {confirmation?.type === "import-patch" && (
        <SitePackDialog
          title={t("remoteConfigLocalPatchConfirmTitle")}
          confirmText={t("confirm")}
          busy={isDialogBusy}
          restoreFocusTo={confirmationTriggerRef.current}
          restoreFocusFallback={getConfirmationFocusFallback}
          onConfirm={() => void handleConfirmAction()}
          onCancel={closeConfirmation}>
          <p>{t("remoteConfigLocalPatchRisk")}</p>
          <p>
            {t("remoteConfigLocalPatchSummary", {
              site: confirmation.siteName,
              id: confirmation.siteId,
              version: String(confirmation.patchVersion),
              base: String(confirmation.baseConfigVersion),
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
