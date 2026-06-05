export interface ParsedVariable {
  raw: string
  name: string
  defaultValue?: string
  options?: string[]
}

export const parseVariable = (raw: string): ParsedVariable => {
  const colonIndex = raw.indexOf(":")
  if (colonIndex === -1) {
    return { raw, name: raw }
  }

  const name = raw.substring(0, colonIndex)
  const rest = raw.substring(colonIndex + 1)

  if (rest.includes("|")) {
    const options = rest.split("|").filter((option) => option.length > 0)
    return { raw, name, options }
  }

  return { raw, name, defaultValue: rest }
}

export const extractVariables = (content: string): ParsedVariable[] => {
  const regex = /\{\{([^\s{}]+)\}\}/g
  const seen = new Set<string>()
  const variables: ParsedVariable[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const raw = match[1]
    if (!seen.has(raw)) {
      seen.add(raw)
      variables.push(parseVariable(raw))
    }
  }

  return variables
}

export const replaceVariables = (content: string, values: Record<string, string>): string =>
  content.replace(/\{\{([^\s{}]+)\}\}/g, (match, raw: string) => {
    return values[raw] !== undefined ? values[raw] : match
  })

export const formatMarkdownQuote = (text: string): string => {
  const normalized = text.replace(/\r\n?/g, "\n").trim()
  if (!normalized) return ""

  return normalized
    .split("\n")
    .map((line) => (line.trim().length > 0 ? `> ${line}` : ">"))
    .join("\n")
}

export const buildPromptVariableValueMap = (
  variables: ParsedVariable[],
  values: Record<string, string>,
): Record<string, string> => {
  const result: Record<string, string> = {}

  variables.forEach((variable) => {
    if (values[variable.raw] !== undefined) {
      result[variable.raw] = values[variable.raw]
      return
    }

    if (variable.defaultValue !== undefined) {
      result[variable.raw] = variable.defaultValue
      return
    }

    if (variable.options?.[0] !== undefined) {
      result[variable.raw] = variable.options[0]
      return
    }

    result[variable.raw] = ""
  })

  return result
}
