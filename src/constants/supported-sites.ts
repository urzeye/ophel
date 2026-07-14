import supportedSites from "./supported-sites.json"

export type SupportedAdapterModuleKey =
  | "aistudio"
  | "chatglm"
  | "chatgpt"
  | "claude"
  | "deepseek"
  | "doubao"
  | "gemini"
  | "gemini-enterprise"
  | "grok"
  | "ima"
  | "kimi"
  | "qianwen"
  | "qwen-studio"
  | "yuanbao"
  | "zai"

export interface SupportedSiteDefinition {
  entry: string
  module: SupportedAdapterModuleKey
  matches: string[]
}

export const SUPPORTED_SITES = supportedSites as SupportedSiteDefinition[]

export const SUPPORTED_SITE_MATCHES = SUPPORTED_SITES.flatMap((site) => site.matches)

export const SUPPORTED_SITE_HOSTNAMES = SUPPORTED_SITES.flatMap((site) =>
  site.matches.map((match) => new URL(match.replace(/\*$/, "")).hostname),
)

const moduleByHostname = new Map(
  SUPPORTED_SITES.flatMap((site) =>
    site.matches.map((match) => [new URL(match.replace(/\*$/, "")).hostname, site.module] as const),
  ),
)

export function resolveSupportedAdapterModule(hostname: string): SupportedAdapterModuleKey | null {
  return moduleByHostname.get(hostname.toLowerCase()) ?? null
}
