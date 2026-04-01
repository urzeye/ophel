type ReactDOMLike = {
  createPortal: (...args: unknown[]) => unknown
  flushSync?: (...args: unknown[]) => unknown
  unstable_batchedUpdates?: (...args: unknown[]) => unknown
  version?: string
}

function getGlobalReactDOM(): ReactDOMLike {
  const reactDom = (globalThis as typeof globalThis & { ReactDOM?: ReactDOMLike }).ReactDOM

  if (!reactDom || typeof reactDom.createPortal !== "function") {
    throw new Error("[Ophel] ReactDOM CDN runtime is missing")
  }

  return reactDom
}

const reactDom = getGlobalReactDOM()

export default reactDom
export const createPortal = reactDom.createPortal
export const flushSync = reactDom.flushSync
export const unstable_batchedUpdates = reactDom.unstable_batchedUpdates
export const version = reactDom.version
