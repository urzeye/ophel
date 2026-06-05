export const normalizeContentForHash = (value: string): string =>
  value.replace(/\s+/g, " ").trim().toLowerCase()

export const djb2ContentHash = (value: string): string => {
  const normalized = normalizeContentForHash(value)
  let hash = 5381
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash << 5) + hash + normalized.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}
