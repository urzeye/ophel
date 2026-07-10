# Project Audit Remediation Design

## Decision

采用单分支、单 PR、分阶段提交的结构性修复方案。保持现有产品信息架构和用户数据兼容，不做整页重写；先建立可验证的运行时边界和测试，再处理 UI/主题、生命周期、性能与清理。

## Alternatives considered

### 方案 A：一次性重写核心和 UI

优点是理论上能快速消除历史结构；缺点是站点适配、双平台、24 套主题和用户持久化数据同时变化，回归面不可控。本次不采用。

### 方案 B：分层收敛（采用）

先补测试与共享基础设施，再逐层替换重复实现。每阶段独立可构建、可 review、可回滚，并以审计报告的验收指标作为完成门槛。

### 方案 C：只修 P1 表面问题

短期 diff 小，但会保留双重主题源、生命周期缺口和 bundle 重复，无法满足“完成审计问题并重构优化”的要求。本次不采用。

## Architecture

### Runtime and adapter loading

- UI 不再自行创建第二套适配器注册表；当前适配器通过共享 runtime/context 注入 React 树。
- 站点识别保持轻量，具体适配器按 hostname/path 动态加载。
- 扩展 `main` 与 `ui-entry` 不再重复包含全部适配器；油猴构建保持单文件可分发，并通过构建验证确认动态加载策略可用。
- i18n 保持同步 `t()` API，但语言资源改为当前语言加英文 fallback 的按需加载。

### Overlay and theme boundary

- 在 Ophel Shadow Root 内建立唯一 overlay root。
- Dialog、菜单、Loading、Prompt modal、Tooltip、Queue 默认 Portal 到 overlay root。
- 只有必须进入主文档的页面增强 UI 才使用 document portal，并由 ThemeManager 显式镜像主题变量。
- 合并通用 Dialog，实现 role/aria-modal、焦点陷阱、ESC、焦点恢复和统一样式。

### Lifecycle and polling

- 核心管理器统一实现可释放生命周期；所有 listener、observer、timeout、interval 和 store subscription 都必须可清理。
- 通用周期任务迁移到 `PollingTaskRegistry`，默认在隐藏页面暂停。
- SPA URL fallback 只在适配器明确需要或 history patch 被覆盖时运行。
- 布局跟踪使用 observer 与事件驱动，不保留永久 rAF。

### UI/UX

- Options 与 SettingsModal 共享导航定义，站点上下文缺失时显示默认/说明，不隐藏核心能力。
- 900/720/640 px 提供明确整体断点；窄屏侧栏收敛、二级 tabs 横向滚动、设置行上下布局。
- Switch 与 label 建立原生关联，支持整行点击、键盘焦点和屏幕阅读器名称。
- 所有新增/修改文案同步 11 种语言。

### Testing and quality

- 引入 Vitest，优先覆盖设置迁移、主题 token、管理器生命周期、适配器路由和 i18n loader。
- 增加 bundle budget 脚本，验证扩展内容脚本体积与站点适配器隔离。
- 保持 CI 原有顺序，并增加测试和 warning gate。

## Error handling

- 动态加载失败必须显式记录并阻止伪初始化，不回退加载全部适配器。
- i18n 当前语言加载失败时使用英文 fallback，并输出一次明确 warning。
- Overlay root 缺失视为初始化错误，不静默 Portal 到 document.body。
- 生命周期 cleanup 必须幂等。

## Validation

- 单元测试覆盖核心纯逻辑和生命周期。
- 运行 format、lint、typecheck、test、Chrome build、userscript build。
- Playwright 检查 Options 1440/800/600 px、Switch 键盘焦点、Dialog 焦点循环、浅色/深色 overlay。
- 两轮人工 review：第一轮按审计 ID，第二轮按 diff/数据源/cleanup/安全/双平台清单。

