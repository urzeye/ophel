type ReactLike = {
  Children: unknown
  Component: unknown
  Fragment: unknown
  Profiler: unknown
  PureComponent: unknown
  StrictMode: unknown
  Suspense: unknown
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: unknown
  act: (...args: unknown[]) => unknown
  cloneElement: (...args: unknown[]) => unknown
  createContext: (...args: unknown[]) => unknown
  createElement: (...args: unknown[]) => unknown
  createFactory: (...args: unknown[]) => unknown
  createRef: (...args: unknown[]) => unknown
  forwardRef: (...args: unknown[]) => unknown
  isValidElement: (...args: unknown[]) => boolean
  lazy: (...args: unknown[]) => unknown
  memo: (...args: unknown[]) => unknown
  startTransition: (...args: unknown[]) => unknown
  unstable_act: (...args: unknown[]) => unknown
  useCallback: (...args: unknown[]) => unknown
  useContext: (...args: unknown[]) => unknown
  useDebugValue: (...args: unknown[]) => unknown
  useDeferredValue: (...args: unknown[]) => unknown
  useEffect: (...args: unknown[]) => unknown
  useId: (...args: unknown[]) => unknown
  useImperativeHandle: (...args: unknown[]) => unknown
  useInsertionEffect: (...args: unknown[]) => unknown
  useLayoutEffect: (...args: unknown[]) => unknown
  useMemo: (...args: unknown[]) => unknown
  useReducer: (...args: unknown[]) => unknown
  useRef: (...args: unknown[]) => unknown
  useState: (...args: unknown[]) => unknown
  useSyncExternalStore: (...args: unknown[]) => unknown
  useTransition: (...args: unknown[]) => unknown
  version: string
}

function getGlobalReact(): ReactLike {
  const react = (globalThis as typeof globalThis & { React?: ReactLike }).React

  if (!react || typeof react.createElement !== "function") {
    throw new Error("[Ophel] React CDN runtime is missing")
  }

  return react
}

const react = getGlobalReact()

export default react
export const Children = react.Children
export const Component = react.Component
export const Fragment = react.Fragment
export const Profiler = react.Profiler
export const PureComponent = react.PureComponent
export const StrictMode = react.StrictMode
export const Suspense = react.Suspense
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED =
  react.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
export const act = react.act
export const cloneElement = react.cloneElement
export const createContext = react.createContext
export const createElement = react.createElement
export const createFactory = react.createFactory
export const createRef = react.createRef
export const forwardRef = react.forwardRef
export const isValidElement = react.isValidElement
export const lazy = react.lazy
export const memo = react.memo
export const startTransition = react.startTransition
export const unstable_act = react.unstable_act
export const useCallback = react.useCallback
export const useContext = react.useContext
export const useDebugValue = react.useDebugValue
export const useDeferredValue = react.useDeferredValue
export const useEffect = react.useEffect
export const useId = react.useId
export const useImperativeHandle = react.useImperativeHandle
export const useInsertionEffect = react.useInsertionEffect
export const useLayoutEffect = react.useLayoutEffect
export const useMemo = react.useMemo
export const useReducer = react.useReducer
export const useRef = react.useRef
export const useState = react.useState
export const useSyncExternalStore = react.useSyncExternalStore
export const useTransition = react.useTransition
export const version = react.version
