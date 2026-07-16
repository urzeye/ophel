import { resources } from "./resources"

import type { AppLocale } from "~utils/messaging"

type LocaleMessages = Record<string, string>

const localeMessages: Record<AppLocale, LocaleMessages> = resources

export function loadLocaleMessages(locale: AppLocale): LocaleMessages {
  const messages = localeMessages[locale]
  if (!messages) {
    throw new Error(`Unsupported locale: ${String(locale)}`)
  }

  return messages
}
