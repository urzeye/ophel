export const REMOTE_CONFIG_INDEX_SCHEMA_VERSION = 1 as const
export const REMOTE_CONFIG_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
export const REMOTE_CONFIG_ALARM_NAME = "ophel-remote-config-check"
export const REMOTE_CONFIG_ALARM_PERIOD_MINUTES = 24 * 60
export const REMOTE_CONFIG_MAX_INDEX_BYTES = 512 * 1024
export const REMOTE_CONFIG_MAX_SIGNATURE_BYTES = 4 * 1024

export const DEFAULT_REMOTE_CONFIG_SOURCES = [
  "https://cdn.jsdelivr.net/gh/urzeye/ophel@registry-dist/index.json",
  "https://raw.githubusercontent.com/urzeye/ophel/registry-dist/index.json",
] as const
