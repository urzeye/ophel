const MANAGED_TAB_TITLE_ATTR = "data-ophel-managed-tab-title"

interface TitleSanitizeOptions {
  expectedManagedTitle?: string | null
  privacyTitle?: string | null
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
  document.documentElement?.setAttribute(MANAGED_TAB_TITLE_ATTR, title)
}

export function getRememberedManagedTabTitle(): string | null {
  return document.documentElement?.getAttribute(MANAGED_TAB_TITLE_ATTR) || null
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

  const rememberedTitle = getRememberedManagedTabTitle()
  const expectedManagedTitle = normalizeConversationTitle(options.expectedManagedTitle)
  const privacyTitle = normalizeConversationTitle(options.privacyTitle)
  const siteName = normalizeConversationTitle(options.siteName)

  const isExactManagedTitle =
    Boolean(expectedManagedTitle && title === expectedManagedTitle) ||
    Boolean(rememberedTitle && title === rememberedTitle)

  if (privacyTitle && title === privacyTitle) {
    return null
  }

  const cleaned = stripManagedTabTitleDecorations(title, {
    hasManagedSignal: isExactManagedTitle,
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
  const title = sanitizeConversationTitleCandidate(documentTitle, options)
  if (!title) return null

  const siteName = normalizeConversationTitle(options.siteName)
  if (siteName && title === siteName) return null

  const cleanedSiteSuffix = siteName
    ? title
        .replace(new RegExp(`\\s*[-|]\\s*${escapeRegExp(siteName)}$`, "i"), "")
        .replace(new RegExp(`^${escapeRegExp(siteName)}\\s*[-|]\\s*`, "i"), "")
        .trim()
    : title

  return normalizeConversationTitle(cleanedSiteSuffix)
}

function removeEmptyModelPlaceholderSegment(format: string): string {
  return format
    .replace(/\s*[\[\(（【]\s*\{model\}\s*[\]\)）】]\s*/g, " ")
    .replace(/\s*(?:模型|model)\s*[:：]\s*\{model\}\s*/gi, " ")
    .replace(/\s*(?:->|→|[-–—|:：/\\>]+)\s*\{model\}\s*$/g, "")
    .replace(/^\s*\{model\}\s*(?:->|→|[-–—|:：/\\>]+)\s*/g, "")
    .replace(/\{model\}/g, "")
}

function stripManagedTabTitleDecorations(
  title: string,
  options: Pick<TitleSanitizeOptions, "titleFormat"> & { hasManagedSignal: boolean },
): string | null {
  let cleaned = title
  let hasManagedSignal = options.hasManagedSignal

  if (/^(?:[⏳✅]\s*)+/u.test(cleaned)) {
    cleaned = cleaned.replace(/^(?:[⏳✅]\s*)+/u, "")
    hasManagedSignal = true
  }

  if (/(?:\s*(?:->|→)\s*)+$/u.test(cleaned)) {
    cleaned = cleaned.replace(/(?:\s*(?:->|→)\s*)+$/u, "")
    hasManagedSignal = true
  }

  if (hasManagedSignal) {
    cleaned = cleaned.replace(/\s*(?:->|→|[-–—|:：])\s*\[[^\]]{1,80}\]\s*$/u, "")
  } else if (options.titleFormat?.includes("{model}")) {
    cleaned = cleaned.replace(/\s*(?:->|→)\s*\[[^\]]{1,80}\]\s*$/u, "")
  }

  if (hasManagedSignal) {
    cleaned = cleaned.replace(/\s*\[[^\]]{1,80}\]\s*$/u, "")
  }

  return normalizeConversationTitle(cleaned)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
