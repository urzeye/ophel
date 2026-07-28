import type { SitePackManifest } from "./types"

type SitePackLocalizedValues = Record<string, string> | undefined

const normalizeLocale = (locale: string): string => locale.trim().replaceAll("_", "-").toLowerCase()

const getCurrentLocaleCandidates = (language: string): string[] => {
  const normalized = normalizeLocale(language)
  if (normalized === "pt") return [normalized, "pt-br"]
  if (normalized === "pt-br") return [normalized, "pt"]
  return [normalized]
}

const findLocalizedValue = (
  values: SitePackLocalizedValues,
  language: string,
): string | undefined => {
  if (!values) return undefined

  if (Object.prototype.hasOwnProperty.call(values, language)) {
    return values[language]
  }

  const entries = Object.entries(values)
  for (const candidate of getCurrentLocaleCandidates(language)) {
    const match = entries.find(([locale]) => normalizeLocale(locale) === candidate)
    if (match) return match[1]
  }

  const english = entries.find(([locale]) => normalizeLocale(locale) === "en")
  return english?.[1]
}

export const resolveSitePackName = (manifest: SitePackManifest, language: string): string =>
  findLocalizedValue(manifest.nameI18n, language) ?? manifest.name

export const resolveSitePackDescription = (
  manifest: SitePackManifest,
  language: string,
): string | undefined =>
  findLocalizedValue(manifest.descriptionI18n, language) ?? manifest.description
