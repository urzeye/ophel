/**
 * 油猴构建中替换 ~adapters/builtin（见 src/adapters/builtin.ts）。
 *
 * 内置适配器类由 @require 引入的 adapters vendor 注册到
 * window.__OphelBuiltinAdapters（@require 先于脚本本体执行），
 * 这里在主包上下文中完成实例化。
 */
import type { SiteAdapter } from "~adapters/base"

import type {} from "./vendor-bridge/types"

const vendorAdapterClasses = window.__OphelBuiltinAdapters

if (!Array.isArray(vendorAdapterClasses) || vendorAdapterClasses.length === 0) {
  console.error(
    "[Ophel] Built-in adapters vendor is missing or empty; built-in site support is disabled.",
  )
}

export const builtinAdapters: SiteAdapter[] = (vendorAdapterClasses ?? []).map(
  (AdapterClass) => new AdapterClass(),
)
