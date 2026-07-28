interface MatchPatternHost {
  host: string
  wildcard: boolean
}

const parseMatchPatternHost = (pattern: string): MatchPatternHost => {
  const authority = /^https:\/\/([^/]+)\//.exec(pattern)?.[1].toLowerCase()
  if (!authority) {
    throw new TypeError(`Validated match pattern could not be parsed: ${pattern}`)
  }

  const host = authority.startsWith("[")
    ? authority.slice(0, authority.indexOf("]") + 1)
    : authority.replace(/:\d+$/, "")
  const wildcard = host.startsWith("*.")
  return { host: wildcard ? host.slice(2) : host, wildcard }
}

const isSameOrSubdomain = (candidate: string, parent: string): boolean =>
  candidate === parent || candidate.endsWith(`.${parent}`)

/** Registry CI 与运行时安装冲突检查共用的 host 重叠语义。 */
export const siteMatchPatternsOverlap = (leftPattern: string, rightPattern: string): boolean => {
  const left = parseMatchPatternHost(leftPattern)
  const right = parseMatchPatternHost(rightPattern)
  if (left.host === right.host) return true
  if (left.wildcard && isSameOrSubdomain(right.host, left.host)) return true
  if (right.wildcard && isSameOrSubdomain(left.host, right.host)) return true
  return false
}
