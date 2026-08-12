/**
 * 油猴构建中替换 ~adapters/builtin（见 src/adapters/builtin.ts）。
 *
 * 内置适配器类由 @require 引入的 adapters vendor 注册到
 * window.__OphelBuiltinAdapters（@require 先于脚本本体执行），
 * 这里在主包上下文中完成实例化。
 */
import type { SiteAdapter } from "~adapters/base"

import type {} from "./vendor-bridge/types"

declare const __OPHEL_APP_VERSION__: string

const EXPECTED_VENDOR_SCHEMA_VERSION = 1

const vendorMeta = window.__OphelAdaptersVendorMeta
const vendorAdapterClasses = window.__OphelBuiltinAdapters

if (
  !vendorMeta ||
  vendorMeta.schemaVersion !== EXPECTED_VENDOR_SCHEMA_VERSION ||
  vendorMeta.version !== __OPHEL_APP_VERSION__
) {
  console.error(
    `[Ophel] Adapters vendor version mismatch: expected v${__OPHEL_APP_VERSION__} ` +
      `(schema ${EXPECTED_VENDOR_SCHEMA_VERSION}), got ` +
      `v${vendorMeta?.version ?? "missing"} (schema ${vendorMeta?.schemaVersion ?? "missing"}); ` +
      "built-in site support is disabled. Try updating the userscript so @require caches refresh.",
  )
} else if (!Array.isArray(vendorAdapterClasses) || vendorAdapterClasses.length === 0) {
  console.error(
    "[Ophel] Built-in adapters vendor is missing or empty; built-in site support is disabled.",
  )
}

const vendorVersionMatches =
  vendorMeta?.schemaVersion === EXPECTED_VENDOR_SCHEMA_VERSION &&
  vendorMeta.version === __OPHEL_APP_VERSION__

export const builtinAdapters: SiteAdapter[] = vendorVersionMatches
  ? (vendorAdapterClasses ?? []).map((AdapterClass) => new AdapterClass())
  : []
