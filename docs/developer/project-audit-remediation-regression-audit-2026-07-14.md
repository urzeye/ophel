# 大规模重构回归审计（2026-07-14）

> - 审计分支：`refactor/project-audit-remediation`
> - 对比基线：`main` / `4692bf09`（v1.1.5）
> - 原始审计 HEAD：`e81bbdf8`
> - 状态更新：**P1 已修复；P2 仍未修复，不建议按“零已知回归”标准合并或发布**

## 结论

原始审计覆盖 `main...e81bbdf8` 的 16 个提交、203 个文件，变更规模约为
`+12242/-5540` 行。审计确认：

1. **P1 高风险协议缺口（已修复）：油猴远端标签的 clear-all ACK 没有可靠等待该
   realm 的 tracked persistence writes 排空。**
2. **P2 确定性功能回归：独立 Options 快速连续切换语言时，旧请求可以提前结束
   loading，页面可能停留在错误语言。**

前一轮审计发现的“普通 App cleanup 永久暂停持久化”和“初始已打开 Dialog
缺失焦点/ARIA”已经由 `e81bbdf8` 修复，相关测试通过。但这不改变本报告中新发现的
问题结论；其中 P1 已由本次后续修复关闭，P2 仍然开放。

P1 已在后续修复中由 userscript 入口直接 suspend 并并行等待 persistence drain 与
runtime event tasks，新增测试覆盖 pending drain 和失败传播。P2 尚未修复，因此当前
分支仍然**不满足零已知回归的合并条件**。静态检查、自动化测试和三端生产
构建全部通过，只能证明类型、打包和已有测试覆盖范围内没有失败，不能推翻下面基于
事件顺序与异步状态机得到的反例。

## P1：油猴 clear-all ACK 早于写入屏障排空

**状态：已修复。原严重度：P1，高风险事务协议缺口。**

### 修复前证据链

- `src/platform/userscript/entry.tsx:363` 的 `prepareCurrentRuntime()` 只执行
  `suspendPersistenceWrites()` 和 `dispatchClearAllDataEvent()`，没有直接调用
  `drainPersistenceWrites()`。
- `src/platform/userscript/entry.tsx:409` 在 App 挂载前注册 `cleanupRuntime` 作为
  clear-all listener。
- `src/components/App.tsx:2373` 在 App effect 中更晚注册 `prepareForClearAll`；
  真正的 drain 位于该 listener 调用的
  `prepareAppRuntimeForClearAll()`（`src/components/app/runtime-lifecycle.ts:28`）。
- clear-all 事件同步分发时，`cleanupRuntime` 先执行。其 cleanup stack 会调用
  `userscriptRoot.unmount()`；App effect cleanup 随即在同一次事件分发中移除
  `prepareForClearAll`（`src/components/App.tsx:2377`）。
- DOM 事件规范下，listener 在轮到它之前被移除，本次 dispatch 不再调用它。本地
  jsdom 最小复现的调用结果只有 `["runtime-cleanup"]`，后注册的 App prepare
  listener 没有执行。
- `dispatchClearAllDataEvent()` 只等待 listener 通过 `waitUntil()` 注册的任务。
  上述顺序下 App 没有注册 drain task，因此 userscript coordinator 可以写入成功
  ACK，而没有证明该 realm 的 persistence barrier 已排空。
- 扩展端没有同一缺口：
  `src/core/content-script-main.ts:425` 和 `src/contents/ui-entry.tsx:19`
  都在独立入口直接注册/等待 drain，不依赖 App listener 存活。

### 触发条件与影响

触发条件是油猴环境至少有两个活动标签，远端标签收到 prepare signal，且该 realm
存在尚未 settle 的 tracked write。

协议宣称 ACK 表示“该标签已经停写且在途写入全部结束”，当前实现只能证明“新写入已
暂停、runtime cleanup 已开始”。如果 tracked write 的实际存储副作用晚于 ACK，
发起标签可能在它结束前清空共享 GM storage，旧数据随后回写；如果 pending write
失败，事务也可能在没有获知该失败时继续。

当前 userscript 的 Zustand adapter 和已检查到的 GM 写入最终都同步调用
`GM_setValue()`，这降低了现有调用点发生“清除后回写”的概率；但
`runTrackedPersistenceWrite()` 的公开契约接受任意异步 Promise，clear-all
coordinator 也明确以 drain 作为正确性边界。不能把“当前多数底层副作用同步”当成
事务完成证明，更不能据此给出零数据风险结论。

### 根因

clear-all runtime cleanup 与 App clear-all prepare 都挂在同一个 DOM 事件上，但
前者会卸载后者。事务正确性依赖 listener 注册顺序和 React unmount 副作用，形成了
隐式且不成立的跨层契约。

### 修复与测试

新增 `src/platform/userscript/runtime-lifecycle.ts`，由 userscript 入口直接把
coordinator callback 绑定到写入屏障：

```ts
prepareCurrentRuntime: async () => {
  suspendPersistenceWrites()
  await Promise.all([drainPersistenceWrites(), dispatchClearAllDataEvent()])
}
```

该修复不依赖 listener 注册顺序；只有 drain 与 runtime event tasks 都完成，
coordinator callback 才 resolve，随后才能写入成功 ACK。

新增 `tests/platform/userscript/runtime-lifecycle.test.ts`，覆盖：

1. runtime event task 已完成但 persistence drain 仍 pending 时，prepare 不得完成；
2. drain resolve 后 prepare 才完成；
3. drain reject 时 prepare 必须 reject，由现有 coordinator 失败 ACK 路径继续处理。

现有 `tests/platform/userscript/clear-all-coordinator.test.ts` 只验证 coordinator
等待其 callback；新增测试补上了 runtime callback 的真实 drain 契约。

## P2：Options 连续切换语言可停留在错误语言

**状态：未修复。严重度：P2，确定性竞态回归。**

### 证据链

- 本分支将 locale 改为异步按需加载；`setLanguage()` 现在返回 Promise。
- `src/utils/i18n.ts:120` 附近用 `languageRequestVersion` 阻止旧请求覆盖新语言。
  旧请求过期时会直接 return，但它的 Promise 仍正常 resolve。
- `src/tabs/options.tsx:163` 的 effect 每次语言变化都先
  `setLanguageReady(false)`，随后无条件在对应 Promise resolve 时执行
  `setLanguageReady(true)`。
- Options 没有像 `src/components/App.tsx:196` 那样订阅
  `subscribeI18nChanges()`，因此最终 locale 加载完成不一定产生独立的组件 render。

### 可复现时序

1. 语言 A 的 locale 请求尚未完成。
2. 用户切换到语言 B；B 请求开始，Options 将 `languageReady` 设为 `false`。
3. 较早的 A 请求先完成。i18n version guard 正确拒绝应用 A，但 A 的 Promise
   仍 resolve。
4. A 对应的 `.then()` 把 `languageReady` 提前设为 `true`，Options 使用当时仍旧的
   locale 渲染。
5. B 最终完成并把 i18n current language 更新为 B；它再次执行
   `setLanguageReady(true)`。由于状态已经是 `true`，React 可以跳过 render。
6. 页面继续显示旧语言，直到其它状态变化偶然触发重渲染。

该问题由 `a343353d` 的 locale 懒加载改造引入。旧实现的 `setLanguage()` 同步完成，
不存在跨请求完成顺序。

### 用户影响

独立 Options 中快速连续选择语言，或 locale 消息加载延迟顺序发生反转时，菜单和设置
内容可能显示上一个语言或默认语言。存储里的 `settings.language` 已经是新值，因此
刷新后通常恢复，容易表现为偶发且难以复现的“语言切换没生效”。

### 建议修复与测试

Options effect 必须只允许当前请求结束 loading，例如使用 effect cancellation token：

```ts
useEffect(() => {
  if (!isHydrated || !settings?.language) return

  let active = true
  setLanguageReady(false)
  void setLanguage(settings.language).then(() => {
    if (active) setLanguageReady(true)
  })

  return () => {
    active = false
  }
}, [isHydrated, settings?.language])
```

同时建议 Options 订阅 `subscribeI18nChanges()`，把 i18n 当前语言作为明确的 render
信号，而不是依赖 loading boolean 恰好变化。

新增组件测试：控制两个 locale Promise 的完成顺序为 `A -> B`，但选择顺序为
`A -> B`；断言 A 完成时页面仍 loading，B 完成后只显示 B。

## 已审计但未发现新增确定回归

- **站点与入口：** 15 个 adapter、15 个应用 host、独立 site entries 和 registry
  静态对账一致；未发现 adapter loader 漏注册。
- **MAIN-world：** 6 个动态注册定义、产物引用、drift 检测和修复流程结构一致。
- **扩展 clear-all：** main、UI、App、background lease、snapshot/rollback 和消息
  ACK 链路均有直接 drain；未发现与 P1 相同的 listener 卸载缺口。
- **模块生命周期：** generation、cleanup stack、adapter dispose、NetworkMonitor、
  ReadingHistory 和 URL observer 的销毁路径未发现新的确定性重复实例。
- **UI 拆分：** `PanelWorkspace`、大纲虚拟列表和 prompts dialog 的关键 props、
  handler、overlay target 未发现丢失。
- **Shadow DOM 样式：** conversations、settings、overlays、queue overlay 均由
  `ui-entry.tsx` 注入；Options 也直接引入 overlays CSS。
- **主题与导航：** 独立 Options 暴露 `_default` 外观配置是本分支有测试约束的显式
  行为变化，不按回归处理。
- **先前缺陷：** `e81bbdf8` 已把普通 cleanup 与不可逆 persistence suspend 拆开，
  并修复 Provider 初始挂载即打开 Dialog 的焦点与 ARIA 初始化。

## 验证记录

P1 修复后重新运行了以下门禁，均通过：

- `pnpm format:check`
- `pnpm lint:check`
- `pnpm typecheck`
- `pnpm test:run`：36 个测试文件、106 项测试通过
- `pnpm check:theme-tokens`：101 个引用、85 个全局 token 默认值通过
- `pnpm check:site-support`：15 个 adapter 覆盖 15 个应用 host
- `pnpm build`：Chrome MV3 生产构建通过
- `pnpm build:firefox`：Firefox MV3 生产构建通过
- `pnpm build:userscript`：userscript 生产构建通过
- `pnpm check:bundle-budget`：
  - content entries：3678.2 KiB raw / 975.1 KiB gzip，低于审计基线 49.7%
  - 最大 site entry：994.4 KiB raw / 286.1 KiB gzip
  - userscript：1805.0 KiB raw / 472.7 KiB gzip
- `git diff --check`

构建按 Chrome、Firefox、userscript 串行执行，避免 Plasmo 共享产物目录的并发竞态。

## 残余风险与人工验收

即使修复上述两项，也不能用仓库内静态检查数学证明“绝对零 bug”。合并前至少应完成：

1. 两个以上油猴标签的 clear-all：pending write、失败 ACK、超时、abort、complete、
   generation 和 reload。
2. 独立 Options 快速连续切换三种未缓存语言，并人为增加 locale 响应延迟。
3. 15 个真实站点的面板注入、输入、导航、大纲、导出和 SPA 路由切换。
4. Chrome 与 Firefox 实机的 MAIN-world registration 漂移修复。
5. Shadow DOM 中初始 Dialog、嵌套 Dialog、焦点恢复和 24 套主题的关键状态冒烟。

## 合并判断

**当前判断：P1 已解除；P2 仍阻止“零已知回归”标准下的合并。**

P1 现在已经建立 ACK 与 drain 的直接保证并有回归测试。P2 仍有完整可达时序，属于
确定性用户可见回归；如要求本次大规模重构不存在任何已知问题，还需要修复 P2。
多标签与真实浏览器人工验收仍不能由单元测试替代。
