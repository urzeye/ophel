export const READING_HISTORY_USER_NAVIGATION_EVENT = "ophel:reading-history-user-navigation"
export const READING_HISTORY_RESTORE_TOKEN_ATTRIBUTE = "data-ophel-reading-history-restore-token"

export function signalReadingHistoryUserNavigation(): void {
  window.dispatchEvent(new Event(READING_HISTORY_USER_NAVIGATION_EVENT))
}
