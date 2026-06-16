export function isLikelyMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false

  const userAgentData = (
    navigator as Navigator & { userAgentData?: { mobile?: boolean; platform?: string } }
  ).userAgentData
  if (userAgentData?.mobile) return true

  const platformText = [navigator.platform, userAgentData?.platform, navigator.userAgent]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (/(android|iphone|ipad|ipod|mobile|tablet|windows phone)/.test(platformText)) {
    return true
  }

  return /mac/.test(platformText) && navigator.maxTouchPoints > 1
}
