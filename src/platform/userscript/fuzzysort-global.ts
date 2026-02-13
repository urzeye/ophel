type FuzzysortMatch = {
  score: number
}

type FuzzysortLike = {
  single: (search: string, target: string) => FuzzysortMatch | null
  go: (...args: unknown[]) => unknown[]
  prepare: (target: string) => string
  cleanup: () => void
}

const globalFuzzysort = (globalThis as { fuzzysort?: FuzzysortLike }).fuzzysort

const fallbackFuzzysort: FuzzysortLike = {
  single: () => null,
  go: () => [],
  prepare: (target) => target,
  cleanup: () => undefined,
}

const fuzzysort =
  globalFuzzysort && typeof globalFuzzysort.single === "function"
    ? globalFuzzysort
    : fallbackFuzzysort

export default fuzzysort
