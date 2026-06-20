import { platform } from "~platform"

export interface ReleaseNotesState {
  lastSeenVersion?: string
}

const RELEASE_NOTES_STATE_KEY = "ophel:releaseNotesState"

const normalizeReleaseNotesState = (value: unknown): ReleaseNotesState => {
  if (!value || typeof value !== "object") return {}

  const lastSeenVersion = (value as ReleaseNotesState).lastSeenVersion
  return typeof lastSeenVersion === "string" ? { lastSeenVersion } : {}
}

export const getReleaseNotesState = async (): Promise<ReleaseNotesState> => {
  const value = await platform.storage.get<ReleaseNotesState>(RELEASE_NOTES_STATE_KEY)
  return normalizeReleaseNotesState(value)
}

export const markReleaseNotesSeen = async (version: string): Promise<void> => {
  await platform.storage.set<ReleaseNotesState>(RELEASE_NOTES_STATE_KEY, {
    lastSeenVersion: version,
  })
}
