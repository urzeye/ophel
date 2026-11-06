// Only the extension APIs used by the offline fixture are simulated.
const values = new Map()
const listeners = new Set()
const event = () => ({ addListener() {}, removeListener() {} })
const complete = (result, callback) => {
  if (callback) queueMicrotask(() => callback(result))
  return Promise.resolve(result)
}

globalThis.chrome = {
  runtime: {
    id: "notebook-offline-fixture",
    getURL: (path) => new URL(`/${path}`, location.origin).href,
    getManifest: () => ({ version: "1.3.1" }),
    onMessage: event(),
    sendMessage: (_message, callback) => complete({ success: false }, callback),
  },
  storage: {
    local: {
      get(keys, callback) {
        const selected =
          keys == null
            ? [...values.keys()]
            : typeof keys === "string"
              ? [keys]
              : Array.isArray(keys)
                ? keys
                : Object.keys(keys)
        const result = Object.fromEntries(
          selected.filter((key) => values.has(key)).map((key) => [key, values.get(key)]),
        )
        return complete(result, callback)
      },
      set(data, callback) {
        const changes = {}
        for (const [key, value] of Object.entries(data)) {
          changes[key] = { oldValue: values.get(key), newValue: value }
          values.set(key, value)
        }
        queueMicrotask(() => listeners.forEach((listener) => listener(changes, "local")))
        return complete(undefined, callback)
      },
      remove(keys, callback) {
        for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key)
        return complete(undefined, callback)
      },
    },
    onChanged: {
      addListener: (listener) => listeners.add(listener),
      removeListener: (listener) => listeners.delete(listener),
    },
  },
}
