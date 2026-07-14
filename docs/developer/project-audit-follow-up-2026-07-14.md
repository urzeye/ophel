# Ophel Atlas 重构风险复审与修复跟进

> 复审日期：2026-07-14
> 基线提交：`41454dba fix(runtime): restore locale switching after bundle split`
> 分支：`refactor/project-audit-remediation`
> 前序审计：[project-audit-2026-07-10.md](./project-audit-2026-07-10.md)

## 1. 结论

本轮不是对前序审计的重复检查，而是针对大规模 bundle split、站点入口拆分和生命周期重构做运行时复审。复审确认了多项会导致“扩展看似构建成功，但部分站点无法加载、更新后 MAIN-world 能力失效、清除数据后数据回写、模块重挂载后重复执行”的结构性问题。

主要根因不是单个选择器错误，而是五类跨模块契约缺失：

1. 支持站点列表分散在 manifest、内容脚本、background、userscript 和 adapter loader 中，存在多个真值源。
2. Plasmo MAIN-world 内容脚本实际由 background 动态注册，源码 config、构建 hash 和浏览器持久 registration 之间缺少对账。
3. core manager 只有 init/update，没有统一 destroy、初始化回滚和异步任务代际隔离。
4. Zustand hydration 与 clear-all 把“消息已发送”或“等待超时”误当成状态已稳定。
5. 扩展多 bundle、MV3 background 和 userscript 多标签之间没有事务级停写确认。

上述问题已按结构性缺陷修复，并增加静态审计、单元测试、生产构建门禁和真实浏览器冒烟。最终验证数据见第 8 节；文档中的“已通过”只以最终工作树命令和浏览器结果为准。

## 2. 支持站点与入口注册

### 2.1 发现

- Kimi 和 Qianwen 已有 adapter 与独立 site entry，但部分 background 查询、monitor 和 scroll-lock 入口遗漏匹配项。
- `chat.openai.com`、`qianwen.com` 等 redirect-only 域仍残留在部分入口，形成“声明支持但没有真实运行路径”的假覆盖。
- adapter loader、host permissions、Plasmo content script、userscript `@match` 和 background tab query 各自维护域名列表，修改任一处都可能产生静默漂移。
- adapter loader 使用宽泛字符串索引，新增站点时 TypeScript 无法证明 loader 穷尽。

### 2.2 修复

- 新增 `src/constants/supported-sites.json` 作为 15 个真实支持站点的唯一 registry。
- `src/constants/supported-sites.ts` 为运行时代码提供类型化 matches、hostnames 和 entry 信息。
- adapter loader 使用 registry 推导的穷尽类型，不再允许未登记 module 或漏 loader。
- main、UI、monitor、scroll-lock、独立 site entry、manifest host permissions、userscript metadata 和 background tab query 全部由审计脚本与 registry 对账。
- 新增 `scripts/site-support-audit.mjs`、`scripts/check-site-support.mjs` 和 `pnpm check:site-support`，CI 同时检查源码和生产 manifest/产物。

### 2.3 MAIN-world 实际机制

Plasmo 的 MAIN-world entry 不是普通 manifest content script。构建后 background 会调用 `chrome.scripting.registerContentScripts()`，注册项引用带 hash 的产物文件。旧注册若跨扩展更新保留，会继续指向已不存在的旧 hash；仅检查源码 `config.matches` 无法发现该问题。

修复包含：

- 六个 MAIN-world entry 均显式设置 `persist_across_sessions: false`。
- `src/constants/main-world-scripts.ts` 定义当前构建期望的 id、hash 产物、matches、world 和 runAt。
- background 启动时读取浏览器实际 registration，比较 id、JS 文件、matches、world、runAt 和 persistence。
- 若检测到旧 hash 或 matches 漂移，background 注销旧 registration、注册当前产物并 reload 支持站点标签。
- 生产审计验证六个产物均存在，background 引用当前 hash，且 registration 与源码 config 一致。

### 2.4 Plasmo 静默失败盲区

原生成代码包含对动态注册失败的 `.catch(() => {})`，扩展仍可安装且构建通过，但 MAIN-world 功能不会运行。当前业务层不再把“调用 promise 已 resolve”当成注册正确；启动对账会显式记录最终失败，站点审计也会在构建期阻止缺失产物或错误 registration 进入 CI。

## 3. 生命周期、初始化回滚与 hydration

### 3.1 发现

- `modules-init.ts` 的 manager 初始化中途失败时，已启动模块不会按逆序释放。
- SPA 重初始化、设置热更新和开发重挂载可能让旧 timer、observer、store subscription 和事件 listener 继续工作。
- 异步初始化完成后可能覆盖更新一代的 runtime 状态。
- `SiteAdapter` 没有统一 dispose 契约，站点级 listener 与缓存只能依赖页面 unload。
- NetworkMonitor、Gemini My Stuff bridge、Gemini TitleGuard、ReadingHistory 和 policy retry 均存在重复 init、迟到 callback 或不可取消等待。
- 扩展 settings hydration 可永久等待；userscript 路径则可能在数据尚未可靠恢复时伪造 `_hasHydrated=true`。

### 3.2 修复

- 增加 cleanup stack 和 module generation；每次初始化拥有独立代际，旧代异步结果不能提交到新 runtime。
- `destroyCoreModules()` 按依赖逆序销毁，初始化失败也执行同一回滚路径。
- `SiteAdapter.dispose()` 成为显式生命周期接口，adapter runtime 清理时同步调用。
- manager 的 timer、observer、listener、subscription 和 pending retry 均被实例跟踪；destroy/stop 幂等。
- NetworkMonitor、Gemini My Stuff bridge 和 Gemini TitleGuard 覆盖 `init -> destroy -> init`，避免重复监听和丢失恢复能力。
- ReadingHistory 的 hydration timeout 不再篡改 Zustand `_hasHydrated`；destroy 可取消等待与迟到恢复。
- 扩展 settings hydration 设置 5 秒上限并显式失败；userscript 使用同步 GM storage 的真实 hydration，不再用 Promise 或伪成功掩盖状态。

### 3.3 回归保护

新增测试覆盖 cleanup stack、module generation、core lifecycle、adapter runtime、NetworkMonitor、Gemini lifecycle、ReadingHistory、policy retry 和 App runtime writer cleanup。

## 4. Prompt Dialog 与覆盖层交互

### 4.1 发现

Prompt Editor、Import 和 Preview 各自实现 overlay、Escape、ARIA 和焦点恢复。嵌套 Preview 时，父子层会同时处理 Escape；关闭子层后焦点可能回到 body；Tab trap 也可能在非顶层 dialog 生效。

### 4.2 修复

- 三个 Prompt dialog 迁移到统一 `DialogOverlay` 和 Shadow Root overlay portal。
- dialog stack 使用稳定 token，不依赖渲染顺序或 DOM 查询推断顶层。
- 只有顶层 dialog 处理 Escape 和 Tab focus trap。
- 关闭子层恢复其触发器或父层内焦点；再次 Escape 才关闭父层。
- 保留 `role=dialog`、`aria-modal`、label/description 关联和打开时首焦点。

### 4.3 Design read

本轮属于工作型内容面板覆盖层，按 `DESIGN.md` 的 preserve 模式执行，主要适用 0、1、2、4、5、9、11、12 章；涉及 Shadow DOM overlay 注入和 24 套主题，但未引入新的主题 token 或视觉方向。

## 5. Clear-all 数据事务

### 5.1 原问题

原流程是“通知标签 -> clear local/sync -> 重置各 Zustand store -> reload”。它存在以下竞态：

- background 只要消息 resolve 就认为标签已停止写入，未校验 `{ success: true }`。
- 传输重试可能掩盖标签显式返回 `{ success: false }`。
- 多个 bundle 各有独立 Zustand module instance；一个 bundle 的 barrier 无法代表 main、UI 和 App 都已排空。
- ConversationManager、OutlineManager、Queue 和周期任务可能在 clear 后再次 persist。
- 已发出但未完成的 `chrome.storage.local.set()` 可在 clear 后落盘。
- local clear 成功、sync clear 失败会形成半清空；逐 store reset 又会把默认值写回，破坏“全部清除”语义。
- WebDAV restore、备份导入、发布记录、用量计数和 background 会话键写入绕过 Zustand adapter。
- `chrome.runtime.lastError` 被忽略时，调用方会收到伪成功。

### 5.2 扩展端事务

当前流程为：

1. Options 发起带 `transactionId` 的 prepare。
2. 当前 realm 先 suspend barrier，等待已发出的写入 drain，并通过 `waitUntil()` 风格事件收集 main、UI 和 App 的同步注册任务。
3. background 用 `chrome.storage.session` 持久化 transaction lease，排空 background 自身写入，再向所有活动支持站点广播 prepare。
4. 每个标签必须显式返回 `{ success: true }`；业务拒绝不会被传输重试吞掉。
5. snapshot local/sync，执行双 clear；任一步失败都从 snapshot rollback。
6. commit 只写 clear flag，不再逐个 reset Zustand。
7. complete/abort 必须携带同一 transaction owner；background 释放 lease 后 reload 其它标签。

background lease 可跨 MV3 service worker 重启恢复。若发起页中途关闭，2 分钟 TTL 会释放 stale transaction，避免永久冻结。所有权不匹配、并发 clear、pending write 失败、worker restart 和 stale lease 均有单元测试。

### 5.3 写入边界

- Zustand `setItem/removeItem` 共享不可逆 suspend barrier。
- barrier 跟踪 suspend 前已开始的 Promise 写入，prepare 必须等待它们 settle；失败会终止事务。
- WebDAV restore、Backup import、release notes、usage monitor 和 userscript Claude key 切换使用 `runTrackedPersistenceWrite()`。
- background settings/Claude key 写入由独立 coordinator 跟踪。
- snapshot、clear、rollback、generation、prepare/ack/heartbeat 等事务协议写入明确绕过 barrier，避免事务阻塞自身。
- Chrome callback adapter 会读取 `runtime.lastError` 并 reject，不再静默成功。

## 6. Userscript 多标签事务

Userscript 的 GM storage 在同一脚本的所有标签之间共享，但每个标签有独立 JS realm。仅冻结发起标签会让其它标签在 clear 后立即写回。

当前 coordinator 提供：

- 活跃 runtime heartbeat 与过期清理。
- prepare signal、目标 runtime 集合和逐标签 ack/error。
- 有界等待；任一活动标签未确认或确认失败则拒绝 clear。
- 新打开标签检测正在进行的 prepare，立即冻结并等待 reload。
- clear generation key；旧 realm 即使错过 prepare 通知，也会因 generation 改变而永久停止写入。
- `GM_listValues` grant；`get(null)`、snapshot 和 clear 枚举真实 GM keys，不再遗漏 `bookmarks` 等未知或未来 key。
- complete/abort 清理协议元数据并通知其它 runtime reload。

这套协议不依赖 GM storage 的 Promise 语义；底层 GM get/set/delete 仍保持同步。

## 7. 自动化与真实浏览器证据

### 7.1 自动化范围

- Vitest 限制为 `tests/**/*.test.{ts,tsx}`，测试按源码领域镜像集中存放，不再与生产源码混排，也不会误收集 `output/playwright` 临时脚本。
- 测试覆盖 adapter routing、MAIN registration 诊断、生命周期、hydration、Dialog、clear transaction、extension background lease、userscript coordinator、storage rollback 和消息 acknowledgement。
- `check:site-support` 验证 15 个站点、所有入口、host permissions、userscript metadata、15 个 site entry、6 个 MAIN-world entry 和生产 registration。
- `check:bundle-budget` 同时验证 content entry、最大 site entry、userscript、运行时 JS 暴露和动态 chunk lookup。

### 7.2 浏览器冒烟

使用生产 Chrome 构建验证：

- Options 可打开，无启动错误。
- ChatGPT、Qianwen、Gemini 均存在扩展 Shadow Root、React App 和 overlay root。
- Gemini MAIN-world marker 正常。
- 六个动态 registration 存在，`persistAcrossSessions=false`。
- 人工制造旧 hash/matches registration 后，background 能自动注销、重注册并恢复当前产物。

临时 Playwright 脚本保存在 `output/playwright`，只作为本地证据，不进入提交。

## 8. 最终验证结果

最终工作树必须通过以下门禁：

```text
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm test:run
pnpm check:theme-tokens
pnpm check:site-support
pnpm build
pnpm build:firefox
pnpm build:userscript
pnpm check:bundle-budget
git diff --check
```

最终结果：

- 35 个测试文件、101 项测试全部通过。
- Chrome MV3、Firefox MV3 和 userscript 生产构建全部通过。
- 15 个 site entry 与 6 个 MAIN-world 产物通过生产 manifest/registration 审计。
- 扩展 `main + ui-entry`：3,766,388 B raw / 998,441 B gzip，较审计基线下降 49.7%。
- 最大单站点入口 `site-claude.*.js`：1,018,230 B raw / 292,965 B gzip。
- userscript：1,848,311 B raw / 484,011 B gzip。

## 9. 残余风险

1. 站点 DOM 和未公开 API 会持续变化；registry 和生命周期门禁不能替代每个站点的真实交互回归。
2. MAIN-world 自动修复依赖 `chrome.scripting` 可用；最终失败会显式记录，但无法在权限或浏览器实现缺失时自行绕过。
3. Clear-all 是跨 realm 协调事务，不是数据库原子事务；浏览器进程在 local clear 与 rollback 之间崩溃仍可能留下部分状态。snapshot、ack、generation 和 lease 已降低正常运行中的竞态，但无法保证进程崩溃原子性。
4. Userscript 活跃标签判断依赖 heartbeat，有界窗口内的休眠/冻结标签可能导致 prepare 超时并安全失败，而不是强行清除。
5. 浏览器冒烟覆盖代表性站点和注册修复，不等于 15 个站点的完整 E2E。后续应把扩展加载、面板挂载、设置 hydration 和 clear-all 主流程迁入可重复 CI 浏览器测试。
