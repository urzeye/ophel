function getSiteIcons(): Record<string, string> {
  return (
    (globalThis as typeof globalThis & { __OPHEL_SITE_ICONS__?: Record<string, string> })
      .__OPHEL_SITE_ICONS__ || {}
  )
}

export const SITE_ICONS: Record<string, string> = new Proxy(
  {},
  {
    get: (_target, key) => {
      if (typeof key !== "string") return undefined
      return getSiteIcons()[key]
    },
    has: (_target, key) => typeof key === "string" && key in getSiteIcons(),
    ownKeys: () => Reflect.ownKeys(getSiteIcons()),
    getOwnPropertyDescriptor: (_target, key) => {
      if (typeof key !== "string" || !(key in getSiteIcons())) return undefined
      return {
        enumerable: true,
        configurable: true,
      }
    },
  },
)
