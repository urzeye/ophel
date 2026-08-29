import { platform } from "~platform"

export interface ReleaseNotesState {
  lastSeenVersion?: string
  lastToastVersion?: string
}

const RELEASE_NOTES_STATE_KEY = "ophel:releaseNotesState"

const normalizeReleaseNotesState = (value: unknown): ReleaseNotesState => {
  if (!value || typeof value !== "object") return {}

  const state = value as ReleaseNotesState
  return {
    ...(typeof state.lastSeenVersion === "string"
      ? { lastSeenVersion: state.lastSeenVersion }
      : {}),
    ...(typeof state.lastToastVersion === "string"
      ? { lastToastVersion: state.lastToastVersion }
      : {}),
  }
}

export const getReleaseNotesState = async (): Promise<ReleaseNotesState> => {
  const value = await platform.storage.get<ReleaseNotesState>(RELEASE_NOTES_STATE_KEY)
  return normalizeReleaseNotesState(value)
}

export const markReleaseNotesSeen = async (version: string): Promise<void> => {
  const state = await getReleaseNotesState()
  await platform.storage.set<ReleaseNotesState>(RELEASE_NOTES_STATE_KEY, {
    ...state,
    lastSeenVersion: version,
  })
}

/** 记录某版本的更新提醒 toast 已展示过，保证每个版本最多弹一次 */
export const markReleaseNotesToastShown = async (version: string): Promise<void> => {
  const state = await getReleaseNotesState()
  await platform.storage.set<ReleaseNotesState>(RELEASE_NOTES_STATE_KEY, {
    ...state,
    lastToastVersion: version,
  })
}
