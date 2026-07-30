export const normalizeRemoteConfigSourceUrl = (source: string): string => {
  const trimmedSource = source.trim()
  if (!trimmedSource) {
    throw new TypeError("Registry source must not be empty")
  }

  let url: URL
  try {
    url = new URL(trimmedSource)
  } catch {
    throw new TypeError(`Invalid registry source URL: ${trimmedSource}`)
  }

  const isLocalDevSource =
    url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
  if (url.protocol !== "https:" && !isLocalDevSource) {
    throw new TypeError(`Registry source must use HTTPS: ${trimmedSource}`)
  }

  return url.href
}
