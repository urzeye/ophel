export const MANAGED_TAB_TITLE_ATTR = "data-ophel-managed-tab-title"
export const STALE_MANAGED_TAB_TITLE_ATTR = "data-ophel-stale-managed-tab-title"
export const GEMINI_NATIVE_TAB_TITLE_ATTR = "data-ophel-gemini-native-tab-title"
export const GEMINI_NATIVE_TAB_TITLE_PATH_ATTR = "data-ophel-gemini-native-tab-title-path"
const MAX_MANAGED_TITLE_STRIP_PASSES = 20
const PLACEHOLDER_PATTERN = /\{(?:status|title|model|site)\}/g
const MODEL_PLACEHOLDER = "{model}"
const WRAPPER_PAIRS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  "<": ">",
  "（": "）",
  "【": "】",
  "《": "》",
  "「": "」",
  "『": "』",
}

interface TitleSanitizeOptions {
  expectedManagedTitle?: string | null
  hasManagedTitleSignal?: boolean
  privacyTitle?: string | null
  rejectManagedTitle?: boolean
  siteName?: string | null
  titleFormat?: string | null
}

interface ManagedTabTitleParts {
  statusPrefix: string
  conversationTitle: string
  modelName?: string | null
  siteName: string
}

export function normalizeConversationTitle(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, " ").trim()
  return text || null
}

export function rememberManagedTabTitle(title: string): void {
  if (typeof document === "undefined") return
  document.documentElement?.setAttribute(MANAGED_TAB_TITLE_ATTR, title)
}

export function forgetManagedTabTitle(): void {
  if (typeof document === "undefined") return
  document.documentElement?.removeAttribute(MANAGED_TAB_TITLE_ATTR)
}

export function getRememberedManagedTabTitle(): string | null {
  if (typeof document === "undefined") return null
  return document.documentElement?.getAttribute(MANAGED_TAB_TITLE_ATTR) || null
}

export function rememberStaleManagedTabTitle(title: string): void {
  if (typeof document === "undefined") return
  document.documentElement?.setAttribute(STALE_MANAGED_TAB_TITLE_ATTR, title)
}

export function forgetStaleManagedTabTitle(): void {
  if (typeof document === "undefined") return
  document.documentElement?.removeAttribute(STALE_MANAGED_TAB_TITLE_ATTR)
}

function getRememberedStaleManagedTabTitle(): string | null {
  if (typeof document === "undefined") return null
  return document.documentElement?.getAttribute(STALE_MANAGED_TAB_TITLE_ATTR) || null
}

export function formatManagedTabTitle(format: string, parts: ManagedTabTitleParts): string {
  const modelToken = normalizeConversationTitle(parts.modelName)
    ? `[${normalizeConversationTitle(parts.modelName)}]`
    : ""
  const normalizedFormat = modelToken ? format : removeEmptyModelPlaceholderSegment(format)

  return normalizedFormat
    .replace(/\{status\}/g, parts.statusPrefix)
    .replace(/\{title\}/g, parts.conversationTitle)
    .replace(/\{model\}/g, modelToken)
    .replace(/\{site\}/g, parts.siteName)
    .replace(/\s+/g, " ")
    .trim()
}

export function sanitizeConversationTitleCandidate(
  value: string | null | undefined,
  options: TitleSanitizeOptions = {},
): string | null {
  const title = normalizeConversationTitle(value)
  if (!title) return null

  const expectedManagedTitle = normalizeConversationTitle(options.expectedManagedTitle)
  const privacyTitle = normalizeConversationTitle(options.privacyTitle)
  const siteName = normalizeConversationTitle(options.siteName)

  const isExactManagedTitle = isKnownManagedTabTitle(title, expectedManagedTitle)
  const hasManagedTitleSignal = isExactManagedTitle || options.hasManagedTitleSignal === true

  if (privacyTitle && title === privacyTitle) {
    return null
  }

  const cleaned = stripManagedTabTitleDecorations(title, {
    hasManagedSignal: hasManagedTitleSignal,
    siteName: options.siteName,
    titleFormat: options.titleFormat,
  })

  if (!cleaned) return null
  if (siteName && cleaned === siteName && cleaned !== title && isExactManagedTitle) return null
  if (privacyTitle && cleaned === privacyTitle) return null

  return cleaned
}

export function extractConversationTitleFromDocumentTitle(
  documentTitle: string | null | undefined,
  options: TitleSanitizeOptions = {},
): string | null {
  const normalizedDocumentTitle = normalizeConversationTitle(documentTitle)
  if (!normalizedDocumentTitle) return null

  if (
    options.rejectManagedTitle &&
    isRejectedManagedDocumentTitle(normalizedDocumentTitle, options.expectedManagedTitle)
  ) {
    return null
  }

  const title = sanitizeConversationTitleCandidate(documentTitle, options)
  if (!title) return null

  const siteName = normalizeConversationTitle(options.siteName)
  if (siteName && title === siteName) return null

  const cleanedSiteSuffix = siteName
    ? title
        .replace(new RegExp(`\\s*[-|]\\s*${escapeRegExp(siteName)}$`, "i"), "")
        .replace(new RegExp(`^${escapeRegExp(siteName)}\\s*(?:\\||-(?!\\s*>))\\s*`, "i"), "")
        .trim()
    : title

  return normalizeConversationTitle(cleanedSiteSuffix)
}

function isKnownManagedTabTitle(title: string, expectedManagedTitle?: string | null): boolean {
  const normalizedExpectedManagedTitle = normalizeConversationTitle(expectedManagedTitle)
  const rememberedTitle = normalizeConversationTitle(getRememberedManagedTabTitle())

  return (
    Boolean(normalizedExpectedManagedTitle && title === normalizedExpectedManagedTitle) ||
    Boolean(rememberedTitle && title === rememberedTitle)
  )
}

function isRejectedManagedDocumentTitle(
  title: string,
  expectedManagedTitle?: string | null,
): boolean {
  const normalizedExpectedManagedTitle = normalizeConversationTitle(expectedManagedTitle)
  const staleManagedTitle = normalizeConversationTitle(getRememberedStaleManagedTabTitle())

  return (
    Boolean(normalizedExpectedManagedTitle && title === normalizedExpectedManagedTitle) ||
    Boolean(staleManagedTitle && title === staleManagedTitle)
  )
}

function removeEmptyModelPlaceholderSegment(format: string): string {
  let cleaned = format

  while (cleaned.includes(MODEL_PLACEHOLDER)) {
    const next = removeOneEmptyModelPlaceholderSegment(cleaned)
    if (next === cleaned) {
      return cleaned.replace(/\{model\}/g, "")
    }
    cleaned = next
  }

  return cleaned
}

function removeOneEmptyModelPlaceholderSegment(format: string): string {
  const placeholders = Array.from(format.matchAll(PLACEHOLDER_PATTERN))
  const modelIndex = placeholders.findIndex(
    (match) => match[0] === MODEL_PLACEHOLDER && match.index !== undefined,
  )

  if (modelIndex < 0) return format

  const previous = placeholders[modelIndex - 1]
  const next = placeholders[modelIndex + 1]
  const model = placeholders[modelIndex]
  const modelStart = model.index ?? 0
  const modelEnd = modelStart + model[0].length
  const previousEnd = previous?.index !== undefined ? previous.index + previous[0].length : 0
  const nextStart = next?.index ?? format.length
  const joinLiteral =
    previous && next && previous[0] !== "{status}" && next[0] !== "{status}"
      ? joinEmptyModelNeighborLiterals(
          format.slice(previousEnd, modelStart),
          format.slice(modelEnd, nextStart),
        )
      : ""

  return `${format.slice(0, previousEnd)}${joinLiteral}${format.slice(nextStart)}`
}

function joinEmptyModelNeighborLiterals(left: string, right: string): string {
  const unwrapped = unwrapMatchingModelLiterals(left, right)
  if (unwrapped !== null) return unwrapped

  const leftHasText = hasTextLiteral(left)
  const rightHasText = hasTextLiteral(right)

  if (leftHasText && !rightHasText) return right
  if (!leftHasText && rightHasText) return left

  if (left.trim() && left.trim() === right.trim()) return left
  if (!left.trim()) return right
  if (!right.trim()) return left

  return left
}

function unwrapMatchingModelLiterals(left: string, right: string): string | null {
  const leftMatch = left.match(/^(.*?)([\[({<（【《「『])\s*$/u)
  const rightMatch = right.match(/^\s*([\])}>）】》」』])(.*)$/u)
  if (!leftMatch || !rightMatch) return null

  const opening = leftMatch[2]
  const closing = rightMatch[1]
  if (WRAPPER_PAIRS[opening] !== closing) return null

  return `${leftMatch[1]}${rightMatch[2]}`
}

function hasTextLiteral(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value)
}

function stripManagedTabTitleDecorations(
  title: string,
  options: Pick<TitleSanitizeOptions, "siteName" | "titleFormat"> & {
    hasManagedSignal: boolean
  },
): string | null {
  let cleaned = title
  let hasManagedSignal = options.hasManagedSignal

  if (hasManagedSignal && /^(?:[⏳✅]\s*)+/u.test(cleaned)) {
    cleaned = cleaned.replace(/^(?:[⏳✅]\s*)+/u, "")
  }

  const templateCleaned = stripManagedTitleFormatDecorations(cleaned, {
    hasManagedSignal,
    siteName: options.siteName,
    titleFormat: options.titleFormat,
  })
  if (templateCleaned && templateCleaned !== cleaned) {
    cleaned = templateCleaned
    hasManagedSignal = true
  }

  return normalizeConversationTitle(cleaned)
}

function stripManagedTitleFormatDecorations(
  title: string,
  options: Pick<TitleSanitizeOptions, "siteName" | "titleFormat"> & {
    hasManagedSignal: boolean
  },
): string | null {
  const titleFormat = options.titleFormat || ""
  if (!titleFormat.includes("{title}")) return null

  const regexes = createManagedTitleFormatRegexes(titleFormat, options.siteName)
  if (regexes.length === 0) return null

  let cleaned = title
  let didStrip = false
  let hasManagedSignal = options.hasManagedSignal

  for (let pass = 0; pass < MAX_MANAGED_TITLE_STRIP_PASSES; pass += 1) {
    const parsed = parseManagedTitleByFormat(cleaned, regexes)
    if (!parsed) break

    if (!hasManagedSignal && !parsed.hasManagedSignal) {
      break
    }

    if (!parsed.title || parsed.title === cleaned) {
      break
    }

    cleaned = parsed.title
    didStrip = true
    hasManagedSignal = true
  }

  return didStrip ? normalizeConversationTitle(cleaned) : null
}

function createManagedTitleFormatRegexes(titleFormat: string, siteName?: string | null): RegExp[] {
  const formats = [titleFormat]
  const emptyModelFormat = removeEmptyModelPlaceholderSegment(titleFormat)

  if (emptyModelFormat !== titleFormat) {
    formats.push(emptyModelFormat)
  }

  const regexes: RegExp[] = []

  formats.forEach((format) => {
    const regex = createManagedTitleFormatRegex(format, siteName)
    if (regex) regexes.push(regex)
  })

  return regexes
}

function createManagedTitleFormatRegex(
  titleFormat: string,
  siteName?: string | null,
): RegExp | null {
  const placeholders = /\{(status|title|model|site)\}/g
  let source = "^\\s*"
  let lastIndex = 0
  let titleSeen = false
  let groupIndex = 0

  for (const match of titleFormat.matchAll(placeholders)) {
    source += literalToFlexiblePattern(titleFormat.slice(lastIndex, match.index))

    const placeholder = match[1]
    if (placeholder === "title") {
      source += titleSeen ? "[\\s\\S]*?" : "(?<ophelTitle>[\\s\\S]+?)"
      titleSeen = true
    } else if (placeholder === "status") {
      source += `(?<ophelStatus${groupIndex}>(?:[⏳✅]\\s*)*)`
      groupIndex += 1
    } else if (placeholder === "model") {
      source += `(?<ophelModel${groupIndex}>\\[[^\\]]{1,160}\\])?`
      groupIndex += 1
    } else if (placeholder === "site") {
      const normalizedSiteName = normalizeConversationTitle(siteName)
      source += normalizedSiteName
        ? `(?<ophelSite${groupIndex}>${literalToFlexiblePattern(normalizedSiteName)})`
        : `(?<ophelSite${groupIndex}>[\\s\\S]*?)`
      groupIndex += 1
    }

    lastIndex = match.index + match[0].length
  }

  source += literalToFlexiblePattern(titleFormat.slice(lastIndex))
  source += "\\s*$"

  if (!titleSeen) return null

  try {
    return new RegExp(source, "u")
  } catch {
    return null
  }
}

function parseManagedTitleByFormat(
  title: string,
  regexes: RegExp[],
): { title: string; hasManagedSignal: boolean } | null {
  for (const regex of regexes) {
    const match = regex.exec(title)
    const parsedTitle = normalizeConversationTitle(match?.groups?.ophelTitle)
    if (!match || !parsedTitle) continue

    return {
      title: parsedTitle,
      hasManagedSignal: false,
    }
  }

  return null
}

function literalToFlexiblePattern(value: string): string {
  return escapeRegExp(value).replace(/\s+/g, "\\s+")
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
