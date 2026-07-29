import type { InstalledSitePack } from "~core/pack-manager"

import { siteMatchPatternMatchesUrl } from "./match-pattern"
import type { SiteDetectRule, SitePackManifest } from "./types"

export const SITE_PACK_DETECT_TIMEOUT_MS = 5_000
export const SITE_PACK_DETECT_MAX_ATTEMPTS = 40
export const SITE_PACK_DETECT_SCAN_INTERVAL_MS = 100
export const SITE_PACK_DETECT_SETTLE_MS = 100

export type SitePackDetectIssueCode =
  | "invalid-selector"
  | "observer-unavailable"
  | "observer-failed"

export interface SitePackDetectIssue {
  code: SitePackDetectIssueCode
  message: string
  packId?: string
  ruleIndex?: number
}

export interface SiteDetectRuleEvaluation {
  matched: boolean
  issues: SitePackDetectIssue[]
}

export interface SitePackDetectEvaluation extends SiteDetectRuleEvaluation {
  eligible: boolean
}

export interface SitePackDetectScanResult {
  matches: InstalledSitePack[]
  issues: SitePackDetectIssue[]
}

export type SitePackDetectWaitStatus = "matched" | "timeout" | "attempt-limit"

export interface SitePackDetectWaitResult extends SitePackDetectScanResult {
  status: SitePackDetectWaitStatus
  attempts: number
  elapsedMs: number
}

interface SitePackMutationObserver {
  observe(target: Node, options: MutationObserverInit): void
  disconnect(): void
}

type SitePackMutationObserverFactory = (callback: MutationCallback) => SitePackMutationObserver

type SitePackDetectTimer = ReturnType<typeof globalThis.setTimeout>

export interface WaitForSitePackDetectMatchesOptions {
  document?: Document
  timeoutMs?: number
  maxAttempts?: number
  scanIntervalMs?: number
  settleMs?: number
  now?: () => number
  setTimer?: (callback: () => void, delayMs: number) => SitePackDetectTimer
  clearTimer?: (timer: SitePackDetectTimer) => void
  createObserver?: SitePackMutationObserverFactory | null
}

const getGeneratorMetaElements = (document: Document): Element[] =>
  Array.from(document.querySelectorAll("meta[name]"))

const metaGeneratorIncludes = (document: Document, expected: string): boolean => {
  const needle = expected.trim().toLowerCase()
  if (!needle) return false
  return getGeneratorMetaElements(document).some((element) => {
    if (element.getAttribute("name")?.trim().toLowerCase() !== "generator") return false
    return (element.getAttribute("content") ?? "").toLowerCase().includes(needle)
  })
}

export const evaluateSiteDetectRule = (
  rule: SiteDetectRule,
  document: Document,
  context: { packId?: string; ruleIndex?: number } = {},
): SiteDetectRuleEvaluation => {
  const issues: SitePackDetectIssue[] = []
  let matched = true

  if (rule.selectorExists !== undefined) {
    try {
      matched = document.querySelector(rule.selectorExists) !== null && matched
    } catch (error) {
      matched = false
      issues.push({
        code: "invalid-selector",
        message: `SitePack detect selector could not be evaluated: ${String(error)}`,
        ...context,
      })
    }
  }

  if (rule.metaGenerator !== undefined) {
    matched = metaGeneratorIncludes(document, rule.metaGenerator) && matched
  }

  return { matched, issues }
}

export const evaluateSitePackDetection = (
  manifest: SitePackManifest,
  url: URL,
  document: Document,
): SitePackDetectEvaluation => {
  const detectRules = manifest.detect ?? []
  if (detectRules.length === 0) {
    return { eligible: false, matched: false, issues: [] }
  }

  const urlMatches =
    manifest.matches.length === 0 ||
    manifest.matches.some((pattern) => siteMatchPatternMatchesUrl(url, pattern))
  if (!urlMatches) {
    return { eligible: false, matched: false, issues: [] }
  }

  const issues: SitePackDetectIssue[] = []
  for (const [ruleIndex, rule] of detectRules.entries()) {
    const result = evaluateSiteDetectRule(rule, document, {
      packId: manifest.id,
      ruleIndex,
    })
    issues.push(...result.issues)
    if (result.matched) {
      return { eligible: true, matched: true, issues }
    }
  }

  return { eligible: true, matched: false, issues }
}

export const scanSitePackDetectMatches = (
  packs: readonly InstalledSitePack[],
  url: URL,
  document: Document,
): SitePackDetectScanResult => {
  const matches: InstalledSitePack[] = []
  const issues: SitePackDetectIssue[] = []

  for (const pack of packs) {
    const result = evaluateSitePackDetection(pack.manifest, url, document)
    issues.push(...result.issues)
    if (result.matched) matches.push(pack)
  }

  return { matches, issues }
}

const assertPositiveInteger = (value: number, name: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`)
  }
  return value
}

const assertNonNegativeInteger = (value: number, name: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`)
  }
  return value
}

const getDefaultObserverFactory = (): SitePackMutationObserverFactory | null =>
  typeof MutationObserver === "undefined" ? null : (callback) => new MutationObserver(callback)

const issueKey = (issue: SitePackDetectIssue): string =>
  `${issue.code}\u0000${issue.packId ?? ""}\u0000${issue.ruleIndex ?? ""}\u0000${issue.message}`

export const waitForSitePackDetectMatches = async (
  packs: readonly InstalledSitePack[],
  url: URL,
  options: WaitForSitePackDetectMatchesOptions = {},
): Promise<SitePackDetectWaitResult> => {
  const document = options.document ?? globalThis.document
  if (!document) {
    throw new Error("SitePack detection requires a document")
  }

  const timeoutMs = assertPositiveInteger(
    options.timeoutMs ?? SITE_PACK_DETECT_TIMEOUT_MS,
    "SitePack detect timeoutMs",
  )
  const maxAttempts = assertPositiveInteger(
    options.maxAttempts ?? SITE_PACK_DETECT_MAX_ATTEMPTS,
    "SitePack detect maxAttempts",
  )
  const scanIntervalMs = assertNonNegativeInteger(
    options.scanIntervalMs ?? SITE_PACK_DETECT_SCAN_INTERVAL_MS,
    "SitePack detect scanIntervalMs",
  )
  const settleMs = assertNonNegativeInteger(
    options.settleMs ?? SITE_PACK_DETECT_SETTLE_MS,
    "SitePack detect settleMs",
  )
  const now = options.now ?? Date.now
  const setTimer =
    options.setTimer ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs))
  const clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer))
  const createObserver =
    options.createObserver === undefined ? getDefaultObserverFactory() : options.createObserver
  const startedAt = now()
  const issuesByKey = new Map<string, SitePackDetectIssue>()
  let attempts = 0

  const appendIssues = (issues: readonly SitePackDetectIssue[]) => {
    for (const issue of issues) issuesByKey.set(issueKey(issue), issue)
  }
  const scan = (): SitePackDetectScanResult => {
    attempts += 1
    const result = scanSitePackDetectMatches(packs, url, document)
    appendIssues(result.issues)
    return result
  }
  const buildResult = (
    status: SitePackDetectWaitStatus,
    matches: InstalledSitePack[],
  ): SitePackDetectWaitResult => ({
    status,
    matches,
    issues: Array.from(issuesByKey.values()),
    attempts,
    elapsedMs: Math.max(0, now() - startedAt),
  })

  const initial = scan()
  if (initial.matches.length > 0) {
    if (settleMs === 0 || attempts >= maxAttempts) {
      return buildResult("matched", initial.matches)
    }
    await new Promise<void>((resolve) => {
      setTimer(resolve, Math.min(settleMs, timeoutMs))
    })
    const settledScan = scan()
    return buildResult(
      "matched",
      settledScan.matches.length > 0 ? settledScan.matches : initial.matches,
    )
  }
  if (attempts >= maxAttempts) return buildResult("attempt-limit", [])

  return new Promise<SitePackDetectWaitResult>((resolve) => {
    let settled = false
    let observer: SitePackMutationObserver | null = null
    let timeoutTimer: SitePackDetectTimer | null = null
    let scanTimer: SitePackDetectTimer | null = null
    let settleTimer: SitePackDetectTimer | null = null
    let pendingMatches: InstalledSitePack[] | null = null

    const cleanup = () => {
      observer?.disconnect()
      if (timeoutTimer !== null) clearTimer(timeoutTimer)
      if (scanTimer !== null) clearTimer(scanTimer)
      if (settleTimer !== null) clearTimer(settleTimer)
    }

    const finish = (status: SitePackDetectWaitStatus, matches: InstalledSitePack[]) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(buildResult(status, matches))
    }

    const settleDetectedMatches = (matches: InstalledSitePack[]) => {
      pendingMatches = matches
      observer?.disconnect()
      if (settleMs === 0 || attempts >= maxAttempts) {
        finish("matched", matches)
        return
      }

      settleTimer = setTimer(() => {
        settleTimer = null
        const finalScan = scan()
        finish("matched", finalScan.matches.length > 0 ? finalScan.matches : matches)
      }, settleMs)
    }

    const runScheduledScan = () => {
      scanTimer = null
      if (settled || pendingMatches) return

      const result = scan()
      if (result.matches.length > 0) {
        settleDetectedMatches(result.matches)
        return
      }
      if (attempts >= maxAttempts) finish("attempt-limit", [])
    }

    const scheduleScan = () => {
      if (settled || pendingMatches || scanTimer !== null) return
      scanTimer = setTimer(runScheduledScan, scanIntervalMs)
    }

    if (!createObserver || !document.documentElement) {
      const issue: SitePackDetectIssue = {
        code: "observer-unavailable",
        message: "SitePack detection MutationObserver is unavailable",
      }
      issuesByKey.set(issueKey(issue), issue)
    } else {
      try {
        observer = createObserver(scheduleScan)
        observer.observe(document.documentElement, {
          attributes: true,
          childList: true,
          subtree: true,
        })
      } catch (error) {
        const issue: SitePackDetectIssue = {
          code: "observer-failed",
          message: `SitePack detection MutationObserver failed: ${String(error)}`,
        }
        issuesByKey.set(issueKey(issue), issue)
        observer = null
      }
    }

    timeoutTimer = setTimer(() => {
      timeoutTimer = null
      if (pendingMatches) {
        finish("matched", pendingMatches)
        return
      }

      if (attempts < maxAttempts) {
        const finalScan = scan()
        if (finalScan.matches.length > 0) {
          finish("matched", finalScan.matches)
          return
        }
      }
      finish(attempts >= maxAttempts ? "attempt-limit" : "timeout", [])
    }, timeoutMs)
  })
}
