interface MatchPatternHost {
  host: string
  wildcard: boolean
}

interface ParsedSiteMatchPattern {
  authority: string
  pathPattern: string
}

const SITE_MATCH_PATTERN_ORIGIN_PATTERN =
  /^https:\/\/(?:\*\.)?(?:\[[0-9a-f:.]+\]|[a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::\d{1,5})?\/\*$/i

const parseSiteMatchPattern = (pattern: string): ParsedSiteMatchPattern => {
  const match = /^https:\/\/([^/]+)(\/.*)$/.exec(pattern)
  if (!match) {
    throw new TypeError(`Validated match pattern could not be parsed: ${pattern}`)
  }
  return { authority: match[1], pathPattern: match[2] }
}

const parseMatchPatternHost = (pattern: string): MatchPatternHost => {
  const authority = parseSiteMatchPattern(pattern).authority.toLowerCase()

  const host = authority.startsWith("[")
    ? authority.slice(0, authority.indexOf("]") + 1)
    : authority.replace(/:\d+$/, "")
  const wildcard = host.startsWith("*.")
  return { host: wildcard ? host.slice(2) : host, wildcard }
}

const isSameOrSubdomain = (candidate: string, parent: string): boolean =>
  candidate === parent || candidate.endsWith(`.${parent}`)

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const createWildcardRegExp = (value: string): RegExp =>
  new RegExp(`^${value.split("*").map(escapeRegExp).join(".*")}$`)

const hasExplicitPort = (authority: string): boolean =>
  authority.startsWith("[") ? /\]:\d+$/.test(authority) : /:\d+$/.test(authority)

const matchesAuthority = (url: URL, authority: string): boolean => {
  const normalizedAuthority = authority.toLowerCase()
  const wildcard = normalizedAuthority.startsWith("*.")
  const concreteAuthority = wildcard ? normalizedAuthority.slice(2) : normalizedAuthority
  const baseUrl = new URL(`https://${concreteAuthority}/`)
  const hostname = url.hostname.toLowerCase()
  const baseHostname = baseUrl.hostname.toLowerCase()
  const hostnameMatches = wildcard
    ? hostname === baseHostname || hostname.endsWith(`.${baseHostname}`)
    : hostname === baseHostname
  const portMatches = !hasExplicitPort(concreteAuthority) || url.port === baseUrl.port

  return hostnameMatches && portMatches
}

/** 已校验 match pattern 对 URL 的运行时匹配语义。 */
export const siteMatchPatternMatchesUrl = (url: URL, pattern: string): boolean => {
  if (url.protocol !== "https:") return false

  const { authority, pathPattern } = parseSiteMatchPattern(pattern)
  if (!matchesAuthority(url, authority)) return false
  return createWildcardRegExp(pathPattern).test(`${url.pathname}${url.search}`)
}

/** 从已校验 match pattern 取得可展示/取 favicon 的具体 origin。 */
export const siteMatchPatternOrigin = (pattern: string): string => {
  const { authority } = parseSiteMatchPattern(pattern)
  const concreteAuthority = authority.startsWith("*.") ? authority.slice(2) : authority
  return new URL(`https://${concreteAuthority}/`).origin
}

/** 检查动态授权页收到的值是否为受支持的 HTTPS origin 级匹配。 */
export const isSiteMatchPatternOriginPattern = (pattern: string): boolean => {
  if (!SITE_MATCH_PATTERN_ORIGIN_PATTERN.test(pattern)) return false
  const { authority } = parseSiteMatchPattern(pattern)
  const concreteAuthority = authority.startsWith("*.") ? authority.slice(2) : authority
  try {
    new URL(`https://${concreteAuthority}/`)
    return true
  } catch {
    return false
  }
}

/** 从已校验 match pattern 取得动态授权/注册使用的 origin 级匹配。 */
export const siteMatchPatternOriginPattern = (pattern: string): string => {
  const { authority } = parseSiteMatchPattern(pattern)
  return `https://${authority.toLowerCase()}/*`
}

/** Registry CI 与运行时安装冲突检查共用的 host 重叠语义。 */
export const siteMatchPatternsOverlap = (leftPattern: string, rightPattern: string): boolean => {
  const left = parseMatchPatternHost(leftPattern)
  const right = parseMatchPatternHost(rightPattern)
  if (left.host === right.host) return true
  if (left.wildcard && isSameOrSubdomain(right.host, left.host)) return true
  if (right.wildcard && isSameOrSubdomain(left.host, right.host)) return true
  return false
}
