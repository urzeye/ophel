import type { SiteAdapter } from "~adapters/base"
import { isBuiltinSiteId } from "~constants/defaults"
import type { ActiveAdapterConfigContext } from "./site-adapter-config-runtime"

export interface AdapterDiagnosticSelectorHit {
  id: string
  label: string
  selectors: string[]
  matchCount: number
  sampleText?: string
  error?: string
}

export interface AdapterDiagnosticsReport {
  generatedAt: number
  kind: "builtin" | "site-pack"
  siteId: string
  siteName: string
  origin: string
  href: string
  baseConfigVersion?: number
  patchVersion?: number
  patchSource?: "registry" | "local"
  packId?: string
  packVersion?: number
  packSource?: "registry" | "local"
  capabilities: string[]
  selectors: AdapterDiagnosticSelectorHit[]
  summaryLine: string
}

const UNIQUE_CAP = 20

const uniqueSelectors = (values: readonly (string | null | undefined)[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value?.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
    if (result.length >= UNIQUE_CAP) break
  }
  return result
}

const safeQueryCount = (
  root: ParentNode,
  selectors: readonly string[],
): Pick<AdapterDiagnosticSelectorHit, "matchCount" | "sampleText" | "error"> => {
  if (selectors.length === 0) {
    return { matchCount: 0, error: "no-selector" }
  }
  let matchCount = 0
  let sampleText: string | undefined
  const errors: string[] = []
  for (const selector of selectors) {
    try {
      const nodes = root.querySelectorAll(selector)
      matchCount += nodes.length
      if (!sampleText && nodes.length > 0) {
        const text = (nodes[0].textContent || "").replace(/\s+/g, " ").trim()
        if (text) sampleText = text.slice(0, 80)
      }
    } catch (error) {
      errors.push(`${selector}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return {
    matchCount,
    ...(sampleText ? { sampleText } : {}),
    ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
  }
}

const collectSelectorProbes = (
  adapter: SiteAdapter,
): Array<{ id: string; label: string; selectors: string[] }> => {
  const exportConfig = adapter.getExportConfig?.() ?? null
  return [
    {
      id: "textarea",
      label: "textarea",
      selectors: uniqueSelectors(adapter.getTextareaSelectors()),
    },
    {
      id: "submitButton",
      label: "submitButton",
      selectors: uniqueSelectors(adapter.getSubmitButtonSelectors()),
    },
    {
      id: "responseContainer",
      label: "responseContainer",
      selectors: uniqueSelectors([adapter.getResponseContainerSelector()]),
    },
    {
      id: "chatContent",
      label: "chatContent",
      selectors: uniqueSelectors(adapter.getChatContentSelectors()),
    },
    {
      id: "userQuery",
      label: "userQuery",
      selectors: uniqueSelectors([adapter.getUserQuerySelector(), exportConfig?.userQuerySelector]),
    },
    {
      id: "assistantResponse",
      label: "assistantResponse",
      selectors: uniqueSelectors([exportConfig?.assistantResponseSelector]),
    },
    {
      id: "newChatButton",
      label: "newChatButton",
      selectors: uniqueSelectors(adapter.getNewChatButtonSelectors()),
    },
    {
      id: "stopButton",
      label: "stopButton",
      selectors: uniqueSelectors(adapter.getStopButtonSelectors()),
    },
  ]
}

export const buildAdapterDiagnostics = (
  adapter: SiteAdapter,
  options: {
    configContext?: ActiveAdapterConfigContext | null
    root?: ParentNode
    now?: number
    href?: string
  } = {},
): AdapterDiagnosticsReport => {
  const root = options.root ?? (typeof document !== "undefined" ? document : null)
  if (!root) {
    throw new TypeError("Adapter diagnostics require a document root")
  }

  const siteId = adapter.getSiteId()
  const kind = isBuiltinSiteId(siteId) ? "builtin" : "site-pack"
  const configContext = options.configContext
  const capabilities = [...(adapter.getFeatureCapabilities?.() ?? [])].sort()
  const probes = collectSelectorProbes(adapter)
  const selectors: AdapterDiagnosticSelectorHit[] = probes.map((probe) => {
    const hit = safeQueryCount(root, probe.selectors)
    return {
      id: probe.id,
      label: probe.label,
      selectors: probe.selectors,
      matchCount: hit.matchCount,
      ...(hit.sampleText ? { sampleText: hit.sampleText } : {}),
      ...(hit.error ? { error: hit.error } : {}),
    }
  })

  const hitCount = selectors.filter((item) => item.matchCount > 0).length
  const missingCount = selectors.filter(
    (item) => item.selectors.length > 0 && item.matchCount === 0,
  ).length

  const report: AdapterDiagnosticsReport = {
    generatedAt: options.now ?? Date.now(),
    kind,
    siteId,
    siteName: adapter.getName(),
    origin: configContext?.origin || (typeof window !== "undefined" ? window.location.origin : ""),
    href: options.href || (typeof window !== "undefined" ? window.location.href : ""),
    capabilities,
    selectors,
    summaryLine: `${kind}:${siteId} hits=${hitCount}/${selectors.length} missing=${missingCount}`,
  }

  if (configContext?.baseConfigVersion !== undefined) {
    report.baseConfigVersion = configContext.baseConfigVersion
  }
  if (configContext?.patchVersion !== undefined) {
    report.patchVersion = configContext.patchVersion
  }
  if (configContext?.patchSource) {
    report.patchSource = configContext.patchSource
  }
  if (configContext?.packId) {
    report.packId = configContext.packId
  }
  if (configContext?.activeVersion !== undefined) {
    report.packVersion = configContext.activeVersion
  }
  if (configContext?.source) {
    report.packSource = configContext.source
  }

  if (configContext?.kind === "builtin") {
    const patchPart =
      configContext.patchVersion !== undefined
        ? ` patch=v${configContext.patchVersion}${configContext.patchSource ? `(${configContext.patchSource})` : ""}`
        : " patch=none"
    report.summaryLine = `builtin:${siteId} base=${configContext.baseConfigVersion ?? "?"}${patchPart} hits=${hitCount}/${selectors.length} missing=${missingCount}`
  } else if (configContext?.kind === "site-pack") {
    report.summaryLine = `site-pack:${configContext.packId ?? siteId}@${configContext.activeVersion ?? "?"} hits=${hitCount}/${selectors.length} missing=${missingCount}`
  }

  return report
}

export const formatAdapterDiagnosticsText = (report: AdapterDiagnosticsReport): string => {
  const lines = [
    `Ophel adapter diagnostics`,
    `summary: ${report.summaryLine}`,
    `site: ${report.siteName} (${report.siteId})`,
    `kind: ${report.kind}`,
    `origin: ${report.origin}`,
    `href: ${report.href}`,
  ]
  if (report.baseConfigVersion !== undefined) {
    lines.push(`baseConfigVersion: ${report.baseConfigVersion}`)
  }
  if (report.patchVersion !== undefined) {
    lines.push(`patchVersion: ${report.patchVersion}`)
  }
  if (report.patchSource) {
    lines.push(`patchSource: ${report.patchSource}`)
  }
  if (report.packId) {
    lines.push(`packId: ${report.packId}`)
  }
  if (report.packVersion !== undefined) {
    lines.push(`packVersion: ${report.packVersion}`)
  }
  if (report.packSource) {
    lines.push(`packSource: ${report.packSource}`)
  }
  lines.push(`capabilities: ${report.capabilities.join(", ") || "(none)"}`)
  lines.push("selectors:")
  for (const item of report.selectors) {
    const selectorText = item.selectors.join(" || ") || "(none)"
    const sample = item.sampleText ? ` sample=${JSON.stringify(item.sampleText)}` : ""
    const error = item.error ? ` error=${item.error}` : ""
    lines.push(
      `- ${item.label}: count=${item.matchCount} selector=${selectorText}${sample}${error}`,
    )
  }
  return `${lines.join("\n")}\n`
}
