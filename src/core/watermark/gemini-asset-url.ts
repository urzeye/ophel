export type GeminiAssetPathClassification = {
  family: "gg" | "rd"
  variant: string
  isPreview: boolean
  isDownload: boolean
}

function isGoogleusercontentHost(hostname: string): boolean {
  return hostname === "googleusercontent.com" || hostname.endsWith(".googleusercontent.com")
}

function hasNativeDownloadTokenAtTail(pathname: string): boolean {
  return /=(?:d|d-I)$/i.test(pathname || "")
}

function classifyGeminiAssetPath(pathname: string): GeminiAssetPathClassification | null {
  if (!pathname) return null

  const firstSegment = pathname.split("/").filter(Boolean)[0] || ""
  if (!firstSegment) return null

  if (firstSegment.startsWith("rd-")) {
    const variant = firstSegment.slice(3)
    const isDownload = variant.endsWith("-dl")
    return {
      family: "rd",
      variant: isDownload ? variant.slice(0, -3) : variant,
      isPreview: false,
      isDownload,
    }
  }

  if (firstSegment === "gg") {
    return {
      family: "gg",
      variant: "",
      isPreview: true,
      isDownload: false,
    }
  }

  if (!firstSegment.startsWith("gg-")) return null

  const ggVariant = firstSegment.slice(3)
  const isDownload = ggVariant === "dl" || ggVariant.endsWith("-dl")
  return {
    family: "gg",
    variant: isDownload ? (ggVariant === "dl" ? "" : ggVariant.slice(0, -3)) : ggVariant,
    isPreview: !isDownload,
    isDownload,
  }
}

export function classifyGeminiAssetUrl(url: string): GeminiAssetPathClassification | null {
  if (!url) return null

  try {
    const parsed = new URL(url)
    if (!isGoogleusercontentHost(parsed.hostname)) return null
    return classifyGeminiAssetPath(parsed.pathname)
  } catch {
    return null
  }
}

export function isGeminiGeneratedImageUrl(url: string): boolean {
  return classifyGeminiAssetUrl(url) !== null
}

export function isGeminiDisplayPreviewImageUrl(url: string): boolean {
  if (!url) return false

  try {
    const parsed = new URL(url)
    if (!isGoogleusercontentHost(parsed.hostname)) return false

    const classification = classifyGeminiAssetPath(parsed.pathname)
    if (!classification || classification.family !== "gg") return false

    if (classification.isPreview) {
      return !hasNativeDownloadTokenAtTail(parsed.pathname)
    }

    if (hasNativeDownloadTokenAtTail(parsed.pathname)) return false

    return classification.isDownload && /-rj$/i.test(parsed.pathname)
  } catch {
    return false
  }
}

export function normalizeGeminiImageUrl(url: string): string {
  if (!isGeminiGeneratedImageUrl(url)) return url

  try {
    const parsed = new URL(url)
    const path = parsed.pathname

    const dimensionPairAtTail = /=w\d+-h\d+([^/]*)$/i
    if (dimensionPairAtTail.test(path)) {
      parsed.pathname = path.replace(dimensionPairAtTail, "=s0$1")
      return parsed.toString()
    }

    if (hasNativeDownloadTokenAtTail(path)) {
      parsed.pathname = path.replace(/=(?:d|d-I)$/i, (match) => `=s0-${match.slice(1)}`)
      return parsed.toString()
    }

    const sizeTransformAtTail = /=(?:s|w|h)\d+([^/]*)$/i
    if (sizeTransformAtTail.test(path)) {
      parsed.pathname = path.replace(sizeTransformAtTail, "=s0$1")
      return parsed.toString()
    }

    parsed.pathname = `${path}=s0`
    return parsed.toString()
  } catch {
    return url
  }
}
