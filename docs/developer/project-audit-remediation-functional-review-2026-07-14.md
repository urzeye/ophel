# 大规模重构功能审计（2026-07-14）

## 结论

审计范围为 `origin/main`（`4692bf09`）到
`refactor/project-audit-remediation`（`632a6e8a`）的 15 个提交，共 202 个文件、
约 `+12016/-5539` 行。

审计确认了 2 个回归缺陷：

1. **P1：普通 React 生命周期清理会永久暂停当前 realm 的持久化写入。**
2. **P2：Provider 首次挂载时已经打开的统一 Dialog 缺失初始焦点和标题 ARIA 关联。**

**两个缺陷已在本分支修复并增加回归测试。** 除此之外，站点注册、扩展与油猴入口、
MAIN-world 脚本注册、模块初始化、设置深链、备份/清除事务、i18n 懒加载、面板拆分
和大纲虚拟列表未发现新的确定性功能回归。静态检查、104 个自动化测试以及 Chrome、
Firefox、油猴三端构建均通过，但这些检查不能覆盖真实站点 DOM、浏览器权限和多标签
时序，因此仍有必须做人工冒烟的残余风险。

## 确定缺陷

### P1：普通 effect cleanup 永久关闭持久化写入

**状态：已修复。** 普通 runtime cleanup 与 clear-all 准备流程已经拆分；新增测试分别
验证普通 cleanup 不触发持久化暂停，以及 clear-all 仍会暂停并 drain 在途写入。

**修复前证据**

- `src/components/App.tsx:2367` 把 `stopAppRuntimeWriters()` 同时用于
  `EVENT_CLEAR_ALL_DATA` 和普通 effect cleanup。
- `src/components/App.tsx:2384` 在 effect cleanup 中无条件执行该函数。
- `src/components/app/runtime-lifecycle.ts:18` 中该函数首先调用
  `suspendPersistenceWrites()`，随后停止运行时管理器并 drain 写入。
- `src/stores/chrome-adapter.ts:259` 只提供暂停和 drain，没有恢复入口。暂停在当前
  JS realm 内是永久的。

**触发条件**

该 effect 的任一依赖（`promptManager`、`queueDispatcher`、
`conversationManager`、`outlineManager`）身份变化，或 App 被卸载后在同一 realm
重新挂载。生产环境中的管理器通常稳定，因此普通设置更新未必触发；HMR、宿主重挂载、
初始化边界调整或后续代码让 manager 重建时会触发。

**用户影响**

触发后，Zustand persist 和显式 tracked write 都会持续抛出
`Persistence writes are suspended by a clear-all transaction`。用户随后修改的设置或
数据不会落盘，刷新后丢失。错误虽然显式输出，但 UI 不一定向用户显示保存失败。

**根因**

“销毁 UI runtime writers”和“清除全部数据前冻结所有持久化写入”是两个不同生命周期
动作，却被合并成同一个不可逆 helper。

**建议修复**

拆分为两个明确操作：

- 普通 cleanup 只停止 `queueDispatcher`，销毁 conversation/outline manager；
- clear-all handler 才执行 `suspendPersistenceWrites()`、停止 writers 和
  `drainPersistenceWrites()`。

增加回归测试，分别证明普通 cleanup 不暂停持久化、clear-all cleanup 必须暂停并等待
在途写入。现有 `tests/components/app/runtime-lifecycle.test.ts` 只验证所有 manager
都会停止，没有覆盖二者的语义差异。

### P2：初始已打开的 Dialog 不会完成焦点初始化

**状态：已修复。** Dialog 的注册、标题解析、初始聚焦和键盘保护现在会等待
`portalTarget` 就绪；新增测试覆盖 Provider 初次挂载时 Dialog 已打开的场景。

**修复前证据**

- `OverlayPortalProvider` 首次 render 时 context 值为 `null`，portal root 需要 ref
  commit 后才进入 context。
- `src/components/ui/Dialog.tsx:122` 的标题解析和初始聚焦 effect 只依赖稳定的
  `titleId`。
- Dialog 首次 effect 执行时 `dialogRef.current` 为空并直接返回；Provider 随后
  rerender，`src/components/ui/Dialog.tsx:179` 才真正创建 portal，但该 effect 不会
  再次执行。

**触发条件**

`OverlayPortalProvider` 第一次挂载时，其子树中的 Dialog 已处于打开状态。例如首次
启动提示、恢复出的弹窗状态或由初始 props 直接打开的确认框。用户点击按钮后再打开的
Dialog 不受影响。

**用户影响**

首个可聚焦控件不会自动获得焦点，Dialog 也不会获得从标题推导出的
`aria-labelledby`。键盘用户的焦点仍停留在背景页面，读屏软件无法用标题命名弹窗。

**建议修复**

让标题解析、初始聚焦和 editable keyboard guard 在 `portalTarget` 可用后执行，例如
将 `portalTarget` 加入相关 effect 依赖；同时避免 portal target 变化时重复注册 Dialog
栈或错误恢复焦点。增加“Provider 初始 render 即打开 Dialog”的测试。现有 Dialog
测试只覆盖点击后打开。

## 已审计但未发现确定回归

- **站点加载：** 15 个 adapter 与 15 个应用 host、独立 site content entry 对账一致；
  isolated-world adapter 注册与 `document_idle` 主入口的顺序成立。
- **跨平台入口：** userscript 的 i18n alias、scroll-lock 注入和平台能力边界未发现
  扩展 API 泄漏。
- **MAIN-world：** 构建产物 hash 漂移后的动态注册修复、background 消息 ACK 和
  clear-all lease 逻辑结构一致。
- **模块生命周期：** 初始化 generation、热更新和 cleanup stack 未发现重复实例或
  明确漏清理；P1 所述 App cleanup 除外。
- **备份与清除：** 当前 realm 先 freeze/drain，跨标签协调后再 snapshot/clear/commit，
  失败路径保留 rollback；未发现确定的数据破坏路径。
- **设置与 i18n：** Options 深链、hydration 后语言加载、11 种应用语言资源和
  userscript 语言实现未发现漏接。
- **UI 拆分：** `PanelWorkspace`、`VirtualizedOutlineTree` 和 prompts dialog 拆分未
  发现 props、事件、状态或样式注入链路丢失。

## 验证记录

以下命令通过：

- `pnpm format:check`
- `pnpm lint:check`
- `pnpm typecheck`
- `pnpm test:run`：35 个测试文件、104 个测试通过
- `pnpm check:theme-tokens`：101 个引用、85 个全局 token 默认值通过
- `pnpm check:site-support`：15 个 adapter 覆盖 15 个应用 host
- `pnpm build`：Chrome MV3
- `pnpm build:firefox`：Firefox MV3
- `pnpm build:userscript`
- `pnpm check:bundle-budget`：content gzip 975.0 KiB，较审计基线低 49.7%；
  userscript gzip 472.7 KiB

曾并行执行三个构建时，Chrome 构建一次报
`Failed to resolve '~styles/overlays.css'`，同时进行的 Firefox 构建通过。串行重跑
Chrome 后通过；bundle budget 在构建尚未完成时也曾因找不到产物失败，构建完成后通过。
这些现象表明 Plasmo 构建/产物目录不适合并行共享，不视为标准 CI 串行流程下的源码
回归。

## 残余风险与人工验收

以下项目无法仅靠仓库内测试消除，应在合并前完成：

1. 在 15 个真实站点逐项验证面板注入、输入、导航、大纲、导出和 SPA 路由切换。站点
   DOM 与 CSP 会持续变化，registry 对账只能证明配置一致。
2. 在 Firefox 实机验证动态 MAIN-world 注册和需要 `chrome.scripting` 的功能。构建
   通过不能证明浏览器运行时行为一致。
3. 用至少两个扩展标签页和两个油猴标签页验证 clear-all 的 freeze、ACK、超时、回滚和
   reload，尤其覆盖一个标签无响应的情形。
4. 覆盖 Provider 初始挂载即打开 Dialog、嵌套 Dialog、Shadow DOM 焦点恢复。
5. 核实移除 `chat.openai.com`、裸 `claude.com` 和裸 `qianwen.com` host 后，所有目标
   浏览器和地区都可靠重定向；否则会造成旧入口不再加载扩展。

## 合并判断

两个已确认缺陷及其回归测试均已完成，仓库内自动门禁未再发现阻断项。合并前仍建议
完成上述真实站点、Firefox MAIN-world 和多标签 clear-all 人工冒烟；这些运行时风险
无法由当前自动化测试和构建结果完全排除。
