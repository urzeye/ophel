import { APP_VERSION } from "~utils/config"
import { getEffectiveLanguage } from "~utils/i18n"

import { currentReleaseNotes } from "./current"
import type { ReleaseNotesLocale } from "./types"

const ZH_LANGS = new Set(["zh-CN", "zh-TW"])

export const hasCurrentReleaseNotes = (): boolean => currentReleaseNotes.version === APP_VERSION

export const resolveReleaseNotesLocale = (language: string): ReleaseNotesLocale => {
  return ZH_LANGS.has(getEffectiveLanguage(language)) ? "zh" : "en"
}

export const getReleaseNotesMarkdown = (language: string): string => {
  const locale = resolveReleaseNotesLocale(language)
  return currentReleaseNotes.notes[locale]
}

export const getFullChangelogUrl = (language: string): string => {
  const locale = resolveReleaseNotesLocale(language)
  return currentReleaseNotes.fullChangelogUrls[locale]
}

export const getReleaseNotesMediaAlt = (
  alt: Readonly<Record<ReleaseNotesLocale, string>>,
  language: string,
): string => {
  return alt[resolveReleaseNotesLocale(language)]
}

export const getReleaseNotesMediaCaption = (
  caption: Readonly<Partial<Record<ReleaseNotesLocale, string>>> | undefined,
  language: string,
): string | undefined => {
  return caption?.[resolveReleaseNotesLocale(language)]
}
