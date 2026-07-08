/**
 * Minimal lifecycle contract for core modules.
 *
 * Modules can adopt this interface gradually while modules-init keeps
 * legacy initialization paths for modules that have not migrated yet.
 */
export interface CoreModule<TUpdate = void> {
  start: () => void
  update: (payload: TUpdate) => void
  stop: () => void
}
