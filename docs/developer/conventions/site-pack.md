# 站点适配器与 SitePack 规范

改内置站点适配器、SitePack manifest、远程配置 patch 或声明式校验规则前读本文件。

## 职责边界与注册

- **只处理站点差异**：`src/adapters/` 只负责站点识别、DOM 选择、输入/导航/导出等单站差异；通用能力放回 `src/core/` 或 `src/utils/`。
- **改单站不污染基类**：不要把某个站点的特判漏进公共基类 `SiteAdapter`，避免误伤其他站点。
- **内置注册双端同步**：内置适配器列表定义在 `src/adapters/builtin.ts`（顺序即匹配优先级）。新增、删除或调整顺序时，必须同步油猴 vendor 入口 `src/platform/userscript/adapters-vendor.ts`。
- **优先稳定选择器**：选 `data-*`、`aria-*`、语义标签、固定 ID 或稳定的结构关系；避免构建 hash、易变 class、纯展示文案或单语言文本。

## 特征与布尔命名分层

适配器上的静态特征、功能开关与运行时状态不要混用前缀：

- **静态结构/加载特征**（页面怎么渲染、怎么加载）：统一声明在 config 的 `traits` 字段（`SiteTraits`，名词式命名，如 `shadowDOM`、`historyLazyLoad`、`virtualOutlineFill`）。基类已有布尔方法（如 `usesShadowDOM()`）只作薄封装；新增特征只加 `SiteTraits` 字段，不再新增 `xxx()` 布尔方法。倒序渲染沿用既有顶层字段 `outlineReverse`，不进 `traits`。
- **静态功能开关**（站点支不支持某功能）：用 `supports*`（如 `supportsFormulaCopy`、`supportsHostThemeSync`）。
- **运行时状态查询**（此刻页面是什么状态）：用 `has*` / `is*`（如 `hasUnloadedConversationHistory`、`hasInputDraft`）。静态特征禁止用 `has*` / `is*`。

## 内置配置、能力声明与校验

- **改完必跑 `pnpm adapters:validate`**：修改 `src/adapters/feature-capabilities.ts`、内置 `*-config.ts` 结构或 `src/adapters/declarative/validate.ts` 校验规则后，必须确认全部内置配置通过校验再交付。
  - 教训：v1.3.3 曾因漏跑该检查，16 个内置配置全部校验失败却静默发布，导致所有站点的缓存 patch 机制整体失效。
- **命令式能力 vs 声明式校验**：内置适配器的能力可以由适配器类命令式实现（例如覆写 `getPanelAvoidanceConfig()`、独立导出模块 `notebook-export.ts`），不要求每个 `capabilities` 声明都有对应的声明式配置字段；“能力 ⇒ 配置字段”强校验只适用于 SitePack manifest 和远程 patch 等 JSON 层。
- **禁止靠改能力来“修”校验**：内置配置校验报错时，先查清该能力实际是怎么实现的再改校验规则；严禁通过增删站点 `capabilities` 或配置字段来凑通过——那会直接改变线上功能。
- **纯 JSON 约束**：SitePack manifest、远程 patch、用户覆盖全部是纯 JSON，禁止函数值；`transformValue` 这类函数字段只允许出现在内置 TS 配置里，由校验器的内置模式放行。
- **版本累加规则**：修改内置 `*-config.ts` 默认配置时，对应 `*_CONFIG_VERSION` 在同一个发版周期内相对上个 release 只加 1（用来让旧缓存 patch 失效），同一次发版内的多次 commit 不要重复累加。

## 配套参考

按具体任务继续查阅 `docs/developer/site-adapter/`：

- 内置适配器配置化迁移与细则：[site-adapter-config-migration-guide.md](../site-adapter/site-adapter-config-migration-guide.md)
- SitePack 与远程 patch 审核清单：[site-pack-review-checklist.md](../site-adapter/site-pack-review-checklist.md)
- 本地调试工作流：[local-debug-workflow.md](../site-adapter/local-debug-workflow.md)
- 各内置站点可热修字段矩阵：`docs/developer/site-adapter/*-hotfix-matrix.md`
