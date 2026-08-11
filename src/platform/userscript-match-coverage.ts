interface UnknownRecord {
  [key: string]: unknown
}

export interface UserscriptMatchCoverageInfo {
  available: boolean
  managerName: string | null
  matchPatterns: string[]
}

interface ParsedUserscriptMatchPattern {
  scheme: "http" | "https" | "*"
  hostname: string
  wildcardHost: boolean
  anyHost: boolean
  hasExplicitPort: boolean
  port: string
  coversAllPaths: boolean
}

const isRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const getString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null

const getStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map(getString).filter((candidate): candidate is string => candidate !== null)
    : []

const unique = (values: readonly string[]): string[] => Array.from(new Set(values))

const parseMetadataMatches = (metadata: unknown): string[] => {
  if (typeof metadata !== "string") return []

  const matches: string[] = []
  for (const line of metadata.split(/\r?\n/)) {
    const match = /^\s*\/\/\s*@match\s+(.+?)\s*$/.exec(line)
    const pattern = getString(match?.[1])
    if (pattern) matches.push(pattern)
  }
  return unique(matches)
}

const resolveStructuredMatchPatterns = (script: UnknownRecord): string[] => {
  const baseMatches = getStringArray(script.matches)
  const options = isRecord(script.options) ? script.options : null
  const override = options && isRecord(options.override) ? options.override : null
  if (!override) return baseMatches

  const userMatches = getStringArray(override.use_matches)
  const originalMatches = getStringArray(override.orig_matches)
  if (override.merge_matches === false) return userMatches

  return unique([
    ...(originalMatches.length > 0 ? originalMatches : baseMatches),
    ...baseMatches,
    ...userMatches,
  ])
}

export const resolveUserscriptMatchCoverageInfo = (value: unknown): UserscriptMatchCoverageInfo => {
  if (!isRecord(value)) {
    return { available: false, managerName: null, matchPatterns: [] }
  }

  const script = isRecord(value.script) ? value.script : null
  const managerName = getString(value.scriptHandler)
  const structuredMatches = script ? resolveStructuredMatchPatterns(script) : []
  const metadataMatches = unique([
    ...parseMetadataMatches(value.scriptMetaStr),
    ...parseMetadataMatches(script?.header),
  ])

  return {
    available: true,
    managerName,
    matchPatterns: unique([
      ...structuredMatches,
      ...(structuredMatches.length === 0 ? metadataMatches : []),
    ]),
  }
}

export const getCurrentUserscriptMatchCoverageInfo = (): UserscriptMatchCoverageInfo => {
  if (typeof GM_info === "undefined") {
    return { available: false, managerName: null, matchPatterns: [] }
  }
  return resolveUserscriptMatchCoverageInfo(GM_info)
}

const parseAuthority = (
  authority: string,
): { hostname: string; hasExplicitPort: boolean; port: string } | null => {
  if (authority.startsWith("[")) {
    const bracketIndex = authority.indexOf("]")
    if (bracketIndex < 0) return null
    const hostname = authority.slice(0, bracketIndex + 1).toLowerCase()
    const portSuffix = authority.slice(bracketIndex + 1)
    if (portSuffix.length === 0) return { hostname, hasExplicitPort: false, port: "" }
    if (!/^:\d{1,5}$/.test(portSuffix)) return null
    return { hostname, hasExplicitPort: true, port: portSuffix.slice(1) }
  }

  const portMatch = /:(\d{1,5})$/.exec(authority)
  const hostname = (portMatch ? authority.slice(0, -portMatch[0].length) : authority).toLowerCase()
  if (!hostname) return null
  return {
    hostname,
    hasExplicitPort: Boolean(portMatch),
    port: portMatch?.[1] ?? "",
  }
}

const parseUserscriptMatchPattern = (rawPattern: string): ParsedUserscriptMatchPattern | null => {
  const pattern = rawPattern.trim()
  if (pattern === "<all_urls>") {
    return {
      scheme: "*",
      hostname: "*",
      wildcardHost: false,
      anyHost: true,
      hasExplicitPort: false,
      port: "",
      coversAllPaths: true,
    }
  }

  const match = /^(https?|\*):\/\/([^/]+)(\/.*)$/.exec(pattern)
  if (!match) return null

  const authority = match[2].toLowerCase()
  const anyHost = authority === "*"
  const wildcardHost = !anyHost && authority.startsWith("*.")
  const parsedAuthority = parseAuthority(wildcardHost ? authority.slice(2) : authority)
  if (!parsedAuthority) return null

  return {
    scheme: match[1] as "http" | "https" | "*",
    hostname: parsedAuthority.hostname,
    wildcardHost,
    anyHost,
    hasExplicitPort: parsedAuthority.hasExplicitPort,
    port: parsedAuthority.port,
    coversAllPaths: /^\/\*+$/.test(match[3]),
  }
}

const isSameOrSubdomain = (candidate: string, parent: string): boolean =>
  candidate === parent || candidate.endsWith(`.${parent}`)

const coversHost = (
  covering: ParsedUserscriptMatchPattern,
  candidate: ParsedUserscriptMatchPattern,
): boolean => {
  if (covering.anyHost) return true
  if (covering.wildcardHost) return isSameOrSubdomain(candidate.hostname, covering.hostname)
  return !candidate.wildcardHost && !candidate.anyHost && candidate.hostname === covering.hostname
}

const coversPort = (
  covering: ParsedUserscriptMatchPattern,
  candidate: ParsedUserscriptMatchPattern,
): boolean =>
  !covering.hasExplicitPort || (candidate.hasExplicitPort && covering.port === candidate.port)

export const userscriptMatchPatternCoversOriginPattern = (
  coveringPattern: string,
  candidateOriginPattern: string,
): boolean => {
  const covering = parseUserscriptMatchPattern(coveringPattern)
  const candidate = parseUserscriptMatchPattern(candidateOriginPattern)
  if (
    !covering ||
    !candidate ||
    (candidate.scheme !== "https" && candidate.scheme !== "http") ||
    !candidate.coversAllPaths
  ) {
    return false
  }
  if (!covering.coversAllPaths) return false
  const schemeCovered = covering.scheme === "*" || covering.scheme === candidate.scheme
  if (!schemeCovered) return false
  return coversHost(covering, candidate) && coversPort(covering, candidate)
}

export const userscriptMatchPatternsCoverOriginPattern = (
  coveringPatterns: readonly string[],
  candidateOriginPattern: string,
): boolean =>
  coveringPatterns.some((pattern) =>
    userscriptMatchPatternCoversOriginPattern(pattern, candidateOriginPattern),
  )
