/**
 * 平台实现选择（编译期解析）。
 *
 * 本文件是浏览器扩展（Plasmo）构建的解析结果；油猴构建通过
 * vite.userscript.config.ts 的 resolve.alias 把 `~platform/impl`
 * 指向 ./userscript/impl.ts。
 *
 * 关键约束：平台选择必须保持为静态 import 链，让两个 bundler 都能
 * 把另一平台的实现整体 tree-shake 掉。之前 platform/index.ts 同时
 * 静态导入两端实现、靠运行时 __PLATFORM__ 判断选择，Plasmo 无法
 * 静态求值，导致扩展产物混入整个 userscript 平台实现，并催生出
 * 永远不会被加载的 adapters/remote-config 异步 chunk（约 5MB）。
 */
export { platform } from "./extension"
