export const normalizeQueueBatchInput = (input: string) => input.replace(/\r\n?/g, "\n")

export const splitQueueLines = (input: string): string[] =>
  normalizeQueueBatchInput(input)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)

export const decodeQueueDelimiter = (delimiter: string) =>
  delimiter.replace(/\\(\\|n|r|t)/g, (_match, token: string) => {
    switch (token) {
      case "n":
        return "\n"
      case "r":
        return "\r"
      case "t":
        return "\t"
      case "\\":
        return "\\"
      default:
        return token
    }
  })

export type QueueBatchSplitMode = "line" | "delimiter"

export const parseQueueBatchInput = (
  input: string,
  splitMode: QueueBatchSplitMode,
  delimiter: string,
): string[] => {
  const normalizedInput = normalizeQueueBatchInput(input)
  const normalizedDelimiter = normalizeQueueBatchInput(decodeQueueDelimiter(delimiter))

  const segments =
    splitMode === "line"
      ? splitQueueLines(input)
      : normalizedDelimiter
        ? normalizedInput.split(normalizedDelimiter)
        : []

  return segments.map((item) => item.trim()).filter(Boolean)
}
