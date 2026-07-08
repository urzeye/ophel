/**
 * Shared WebDAV types.
 *
 * Keep provider identifiers in a leaf type module so settings types do not
 * depend on the WebDAV sync manager runtime module.
 */

// WebDAV 服务商标识
export type WebDAVProvider =
  | "jianguoyun"
  | "nextcloud"
  | "synology"
  | "seafile"
  | "infinicloud"
  | "pcloud"
  | "custom"
