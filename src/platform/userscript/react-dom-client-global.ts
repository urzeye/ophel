type ReactDOMClientLike = {
  createRoot: (...args: unknown[]) => unknown
  hydrateRoot: (...args: unknown[]) => unknown
}

function getGlobalReactDOMClient(): ReactDOMClientLike {
  const reactDom = (globalThis as typeof globalThis & { ReactDOM?: ReactDOMClientLike }).ReactDOM

  if (!reactDom || typeof reactDom.createRoot !== "function") {
    throw new Error("[Ophel] ReactDOM client CDN runtime is missing")
  }

  return reactDom
}

const reactDomClient = getGlobalReactDOMClient()

export default reactDomClient
export const createRoot = reactDomClient.createRoot
export const hydrateRoot = reactDomClient.hydrateRoot
