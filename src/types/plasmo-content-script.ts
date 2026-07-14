import type { PlasmoCSConfig } from "plasmo"

export type MainWorldCSConfig = PlasmoCSConfig & {
  world: "MAIN"
  persist_across_sessions: false
}
