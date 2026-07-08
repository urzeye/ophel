# 项目架构与 UI 交互优化计划（2026-07）

本文档记录对当前项目架构、代码设计、UI 与交互实现的审查结论，并给出可拆分执行的优化计划。目标不是一次性大重构，而是用低风险、小步提交的方式降低维护成本、提升可访问性与后续扩展效率。

## 审查范围

本次审查基于以下内容：

- 项目架构文档：`docs/developer/architecture.md`
- UI 与主题规范：`DESIGN.md`
- Shadow DOM 与样式注入说明：`docs/developer/css-architecture.md`
- 核心初始化链路：`src/core/modules-init.ts`
- 适配器层：`src/adapters/*`
- 状态与存储：`src/stores/*`、`src/utils/storage.ts`、`src/platform/*`
- 主要 UI 组件：`src/components/App.tsx`、`MainPanel.tsx`、`SettingsModal.tsx`、`PromptsTab.tsx` 等
- 样式入口与注入链路：`src/contents/ui-entry.tsx`、`src/style.css`、`src/styles/*`

## 总体结论

当前项目的基础分层方向是正确的：

- `src/adapters/` 承担站点差异。
- `src/core/` 承担跨站点核心能力。
- `src/platform/` 抽象扩展与油猴脚本平台差异。
- `src/stores/` 负责 Zustand 状态与持久化。
- `src/components/` 承担 Shadow DOM 面板 UI。

主要风险来自功能增长后的复杂度累积：

1. 适配器和 UI 单文件体量过大，修改局部行为时容易牵动大量上下文。
2. 核心模块生命周期偏全局单例，初始化、热更新、销毁路径不够对称。
3. 设置与存储相关类型、默认值、迁移、选择器和底层存储工具混在一起，边界偏宽。
4. UI 可访问性基础存在，但复杂弹层、tab、拖拽排序等交互语义仍可补强。
5. 样式变量体系和 Shadow DOM 注入链路清晰，但 CSS 文件体量大，直接颜色、`!important` 和 `transition: all` 偏多。

## 关键证据

### 大文件与高复杂度入口

当前体量较大的文件包括：

| 文件 | 近似行数 | 风险 |
| --- | ---: | --- |
| `src/adapters/gemini.ts` | 4900 | 单站点适配器职责过多 |
| `src/components/PromptsTab.tsx` | 3778 | Prompt 列表、编辑、导入、预览、Chain 编辑耦合 |
| `src/components/App.tsx` | 3618 | 应用壳、全局搜索、弹层、快捷操作、通知等职责集中 |
| `src/adapters/chatgpt.ts` | 3411 | 单站点适配器职责过多 |
| `src/adapters/aistudio.ts` | 3276 | 单站点适配器职责过多 |
| `src/core/outline-manager.ts` | 1747 | 核心能力较重，依赖 DOM 与刷新策略 |
| `src/adapters/base.ts` | 1733 | 基类接口过宽 |

### 适配器基类偏宽

`SiteAdapter` 目前不只是站点识别和基础 DOM 访问，还覆盖了：

- 输入框查找与 prompt 插入
- 会话列表与会话导航
- 大纲提取
- 导出内容提取
- 页面宽度、用户问题宽度、Zen Mode、Clean Mode
- 主题同步
- Mermaid 支持
- 快捷引用
- 复制与公式处理
- 模型锁定与提交按钮识别

这让新增站点和维护站点都容易复制大量模板逻辑。

### 核心模块生命周期不够统一

`src/core/modules-init.ts` 中使用全局 `modules` 单例，并集中处理初始化与设置热更新。URL 变化监听会 patch `history.pushState` / `replaceState`，同时使用 1 秒兜底轮询。当前接口没有统一返回 cleanup/disposer，后续重挂载或模块重启时不利于验证监听器和定时器是否被完整释放。

全仓核心与 UI 中存在较多异步与监听机制，包括多处 `setInterval`、`setTimeout`、`MutationObserver`、`addEventListener`。这些能力本身有必要，但需要更清晰的生命周期约束。

### 设置与存储边界偏宽

`src/utils/storage.ts` 同时包含：

- `Settings` 类型
- `DEFAULT_SETTINGS`
- storage key
- 站点设置 selector
- clear/restore flag
- Prompt、Folder、Tag 等业务类型

`src/stores/settings-store.ts` 还承担 normalize、preview settings、persisted settings、跨上下文 chrome.storage 同步等职责。

此外，`src/utils/storage.ts` 当前 type-only 引用了 `~core/webdav-sync` 的 `WebDAVProvider`。虽然 type-only 引用不会造成运行时代码加载，但从架构边界看，基础 utils 层不应依赖 core 层类型。

### UI 可访问性语义有补强空间

当前 UI 已有一些 `aria-label`、`focus-visible`、`aria-live` 与键盘处理，但复杂交互仍有缺口：

- `SettingsModal` 的主要容器缺少完整 `role="dialog"`、`aria-modal`、`aria-labelledby`、焦点陷阱和关闭后恢复焦点。
- `MainPanel` 的 tab 使用按钮和 active class，但缺少完整 `tablist` / `tab` / `tabpanel` 语义。
- 面板 tab、Prompt、Chain 等拖拽排序交互需要非鼠标替代路径。
- 大量操作依赖 toast，重要状态应区分 toast、inline status、`aria-live` 和确认弹窗。

### 样式系统可继续收敛

样式注入链路整体正确：面板样式通过 `src/contents/ui-entry.tsx` 的 `getStyle()` 合并注入 Shadow DOM，动态主题由 `ThemeManager` 注入。主要问题是维护性：

- `src/style.css` 约 3815 行。
- `src/styles/settings.css` 约 3048 行。
- 直接颜色、`rgba()`、`!important` 和 `transition: all` 数量偏多。
- `prefers-reduced-motion` 已有覆盖，但还可以更系统地约束强交互动效。

## 优化目标

1. 降低大文件和宽接口带来的维护成本。
2. 让核心模块初始化、更新、销毁路径可预测、可验证。
3. 清理设置、类型、默认值、迁移与存储之间的边界。
4. 提升复杂弹层、tab、拖拽排序等交互的可访问性。
5. 保持 Shadow DOM 与主题系统兼容，逐步拆分 CSS，避免样式继续堆叠。
6. 保持每个改动可独立验证，不做一次性大爆炸重构。

## 分阶段执行计划

### 第一阶段：低风险、高收益修复

#### 1. 补强设置弹窗可访问性

建议任务：`ux(settings): add accessible dialog semantics and focus management`

范围：

- `src/components/SettingsModal.tsx`
- 必要时补少量样式到 `src/styles/settings.css`

建议实现：

- 弹窗容器增加 `role="dialog"`、`aria-modal="true"`。
- 绑定标题 `aria-labelledby`，必要时绑定说明 `aria-describedby`。
- 打开时聚焦标题或第一个可操作控件。
- `Tab` / `Shift+Tab` 焦点限制在弹窗内。
- 关闭后恢复到打开设置的触发元素。
- 保留 `Escape` 关闭行为。

验收标准：

- 键盘可完整打开、浏览、关闭设置弹窗。
- 焦点不会逃出弹窗。
- 关闭后焦点回到原触发位置。
- 屏幕阅读器能识别弹窗标题和语义。

#### 2. 补强主面板 tab 语义与键盘切换

建议任务：`ux(panel): add ARIA tablist semantics and keyboard navigation`

范围：

- `src/components/MainPanel.tsx`
- `src/style.css`

建议实现：

- tab 容器增加 `role="tablist"`。
- 每个 tab 按钮增加 `role="tab"`、`aria-selected`、`aria-controls`、稳定 `id`。
- 内容区增加 `role="tabpanel"`、`aria-labelledby`。
- 支持方向键、`Home`、`End` 切换 tab。
- 拖拽排序保留，同时确保键盘用户仍可完成 tab 切换。

验收标准：

- 鼠标、键盘都能切换 tab。
- 当前 tab 可被屏幕阅读器识别。
- 不影响现有拖拽排序和 tab 顺序设置。

#### 3. 修正设置类型边界

建议任务：`refactor(settings): move shared settings types out of storage utilities`

范围：

- 新增 `src/types/settings.ts` 或 `src/types/webdav.ts`
- `src/utils/storage.ts`
- `src/core/webdav-sync.ts`

建议实现：

- 将 `WebDAVProvider` 等纯类型移到 `src/types`。
- `src/utils/storage.ts` 改为引用纯类型文件，不再 type-only 引用 `~core/webdav-sync`。
- 不改变运行时行为。

验收标准：

- `utils` 不再依赖 `core` 类型。
- `pnpm typecheck` 通过。

#### 4. 为核心订阅和 URL 监听增加 cleanup

建议任务：`refactor(core): return disposers for module subscriptions and url observer`

范围：

- `src/core/modules-init.ts`
- 内容脚本初始化入口

建议实现：

- `subscribeModuleUpdates(ctx)` 返回 unsubscribe。
- `initUrlChangeObserver(ctx)` 返回 cleanup，负责：
  - 移除 `popstate` / `hashchange` 监听。
  - 恢复 `history.pushState` / `replaceState`。
  - 清理兜底 interval。
  - 清理未完成的 timeout。
- 暂不改变模块业务逻辑，只补生命周期闭环。

验收标准：

- 现有行为不变。
- 初始化入口能保存 disposer。
- 后续模块重启或卸载时有明确清理路径。

#### 5. 替换高风险 `transition: all`

建议任务：`ux(styles): replace broad transitions with explicit properties`

范围：

- `src/style.css`
- `src/styles/*.css`

建议实现：

- 将 `transition: all` 改为明确属性，例如 `opacity`、`transform`、`background-color`、`border-color`、`box-shadow`。
- 不调整视觉风格，只降低无意动画和性能风险。

验收标准：

- 视觉效果保持基本一致。
- `transition: all` 数量明显下降。
- 不影响主题切换和 Shadow DOM 注入。

### 第二阶段：结构减负

#### 6. 从 `App.tsx` 拆出全局搜索控制器

建议任务：`refactor(app): extract global search controller from app shell`

建议拆分：

- `src/components/global-search/useGlobalSearchController.ts`
- `src/components/global-search/GlobalSearchOverlay.tsx`
- `src/components/global-search/globalSearchConstants.ts`

目标：

- `App.tsx` 只负责挂载和传递必要回调。
- 搜索输入、过滤、键盘导航、预览浮层、shortcut nudge 从应用壳中移出。

验收标准：

- 全局搜索快捷键、设置定位、Prompt 预览、空态、语法提示行为不变。
- `App.tsx` 行数明显下降。

#### 7. 拆分 `PromptsTab.tsx`

建议任务：`refactor(prompts): split prompt tab into focused components`

建议拆分：

- `PromptList`
- `PromptCategorySidebar`
- `PromptEditorDialog`
- `PromptImportDialog`
- `PromptPreviewModal`
- `PromptChainEditor`
- `usePromptDragSort`
- `usePromptImportExport`

目标：

- Prompt 列表、分类、编辑、导入导出、Chain 编辑各自维护。
- 降低拖拽排序和弹窗状态对主组件的耦合。

验收标准：

- Prompt 增删改查、分类、导入导出、Chain 编辑行为不变。
- 拆分后的组件职责清楚，避免引入新的全局状态。

#### 8. 拆分 settings schema、默认值、normalize 和 selector

建议任务：`refactor(settings): split schema defaults normalization and selectors`

建议结构：

- `src/types/settings.ts`
- `src/constants/default-settings.ts`
- `src/utils/settings-normalize.ts`
- `src/utils/settings-selectors.ts`
- `src/utils/storage-flags.ts`

目标：

- `src/utils/storage.ts` 不再承载所有设置相关逻辑。
- 设置迁移、默认值、站点 selector 可分别测试和审查。

验收标准：

- 备份/恢复、设置修改、站点特定设置读取行为不变。
- `DEFAULT_SETTINGS`、store、UI、备份/恢复兼容逻辑仍同步。

#### 9. 建立核心模块生命周期接口

建议任务：`refactor(core): introduce module lifecycle contract`

建议接口：

```ts
interface CoreModule {
  start(): void | Promise<void>
  update?(settings: Settings): void | Promise<void>
  stop(): void
}
```

目标：

- `modules-init.ts` 从“集中写所有热更新逻辑”转为“模块注册与事件分发”。
- 模块自己管理自己的 update 和 stop。
- URL 变化、设置变化、清除数据都走统一事件路径。

验收标准：

- 至少先迁移 1 到 2 个低风险模块作为样板。
- 后续模块可逐步迁移，不要求一次性改完。

### 第三阶段：长期架构优化

#### 10. 将适配器改为基础适配器 + capability

建议任务：`refactor(adapter): split site capabilities from base adapter`

建议 capability：

- `OutlineCapability`
- `ConversationListCapability`
- `ExportCapability`
- `ThemeCapability`
- `PromptInputCapability`
- `LayoutCapability`
- `QuickQuoteCapability`

目标：

- `SiteAdapter` 只保留站点识别、基础 DOM 和通用查询。
- 站点按需声明能力。
- 核心模块通过 capability 判断是否启用，而不是假设所有 adapter 都有所有方法。

验收标准：

- 先选一个小站点适配器试点。
- 不把站点特定逻辑泄漏到公共基类。
- 新增站点需要实现的最小接口明显减少。

#### 11. 统一轮询和 observer 预算

建议任务：`perf(core): centralize polling and observer lifecycle`

目标：

- 建立 `PollingTaskRegistry` 或类似调度器。
- 所有周期任务声明：名称、间隔、启动条件、停止条件、页面隐藏行为。
- 页面隐藏时统一降频或暂停。
- 模块销毁时统一清理。

验收标准：

- 新增轮询必须注册到调度器。
- 能从开发日志或调试面板看出当前活跃轮询任务。

#### 12. 渐进提升 TypeScript 约束

建议任务：`refactor(types): reduce any usage in platform messaging and shared utilities`

优先目录：

- `src/platform`
- `src/utils/messaging.ts`
- `src/types`
- `src/core/network-monitor.ts`

目标：

- 为 `window.__ophel*` 全局字段增加 `global.d.ts` 声明。
- 为 background message 建立 request/response 映射。
- 将可替换的 `any` 改为 `unknown`、泛型或明确 DOM 类型。
- 暂不一次性开启 `strict`，避免大范围无关改动。

验收标准：

- `any` 数量逐步下降。
- 核心消息和平台能力类型更明确。

## UI 与交互专项建议

### 设置页信息架构

建议逐步优化：

- 设置首页增加“常用设置 / 最近修改 / 当前站点推荐”。
- 全局设置和当前站点设置在视觉上更明确区分。
- 对高风险设置增加简短说明和即时预览。
- 搜索结果点击后滚动到目标设置并高亮 1 到 2 秒。
- 对扩展版/油猴版能力差异，在帮助区域说明原因，避免用户误解为功能丢失。

### 反馈系统

建议统一反馈分级：

| 类型 | 适用场景 |
| --- | --- |
| toast info | 复制成功、轻量完成提示 |
| toast warning | 非阻塞警告，如没有可导出内容 |
| toast error | 操作失败，需要说明原因 |
| inline status | 表单校验、导入失败、同步失败 |
| `aria-live` | 后台任务、导入导出、队列状态 |
| confirm dialog | 删除、清空、覆盖导入等破坏性操作 |

目标是避免所有反馈都依赖 toast，让重要状态更可见、更可访问。

### 拖拽排序的非鼠标替代

涉及面板 tab、Prompt、Chain 等排序功能。建议为每类排序至少提供一种替代路径：

- 上移 / 下移按钮。
- 更多菜单中的“移到顶部 / 移到底部”。
- 设置页排序列表。
- 键盘快捷方式说明。

### 动效与 reduced motion

建议建立 motion token：

- `--gh-motion-fast`
- `--gh-motion-normal`
- `--gh-motion-slow`
- `--gh-ease-standard`
- `--gh-ease-emphasized`

并在 `prefers-reduced-motion: reduce` 下统一限制：

- 强 transform 动画。
- 循环动画。
- 自动滚动动画。
- 拖拽和边缘唤起的强动效。

## CSS 拆分建议

保持现有 `getStyle()` 合并注入 Shadow DOM 的机制不变，但逐步把大 CSS 文件拆为更明确的域：

- `src/styles/panel.css`
- `src/styles/panel-tabs.css`
- `src/styles/outline.css`
- `src/styles/prompts.css`
- `src/styles/quick-buttons.css`
- `src/styles/settings-layout.css`
- `src/styles/settings-controls.css`
- `src/styles/dialogs.css`

拆分原则：

- 每次只拆一个样式域。
- 同步更新 `src/contents/ui-entry.tsx` 的 `data-text:` 注入。
- 不改变动态主题变量由 `ThemeManager` 注入 Shadow Root 末尾的事实。
- 不把 `::view-transition-*` 等文档根伪元素样式放进 Shadow DOM CSS。

## 建议 PR 拆分

推荐按以下顺序创建独立 PR：

1. `ux(settings): add accessible dialog semantics and focus trap`
2. `ux(panel): add ARIA tablist semantics and keyboard navigation`
3. `refactor(settings): move WebDAVProvider to shared types`
4. `refactor(core): return cleanup functions from module observers`
5. `ux(styles): replace transition all with explicit transitions`
6. `refactor(app): extract global search controller`
7. `refactor(prompts): split prompt tab dialogs and drag logic`
8. `refactor(settings): split settings schema defaults normalization selectors`
9. `refactor(core): introduce module lifecycle interface`
10. `refactor(adapter): pilot capability-based adapter on one small site`

## 验证策略

### 文档或纯类型边界调整

- `pnpm typecheck`
- 必要时 `pnpm lint:check`

### UI/样式调整

- `pnpm format:check`
- `pnpm lint:check`
- `pnpm typecheck`
- 能实际运行时，在至少一个目标站点做最小冒烟：
  - 面板打开/关闭。
  - 设置弹窗打开/关闭。
  - tab 切换。
  - 主题切换。
  - Shadow DOM 样式注入。

### 平台或核心初始化调整

- `pnpm typecheck`
- `pnpm build`
- 涉及油猴路径时补充 `pnpm build:userscript`

## 非目标

以下内容不建议在同一个阶段混入：

- 一次性全仓格式化。
- 一次性开启 TypeScript `strict`。
- 一次性重写所有适配器。
- 在架构优化 PR 中顺手调整大量视觉风格。
- 为绕过类型或 lint 问题升级大版本依赖。

## 维护约定

后续执行本计划时，建议每个 PR 都在描述中说明：

- 对应本文档的哪个阶段和任务。
- 改动涉及的层：adapter / core / platform / store / UI / CSS。
- 是否涉及扩展和油猴双平台。
- 是否涉及 Shadow DOM 样式注入或主题变量。
- 已运行的验证命令。
- 未覆盖的风险与后续任务。
