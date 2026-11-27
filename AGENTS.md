# AGENTS.md

本仓库 AI 代理的项目级规则。优先级：用户当前指令 > 本文件 > 其他项目文档。默认用中文回复，除非用户要求其他语言。

## 工作方式

- **结论先行，少问多做**：先说结论或结果，再补必要上下文；能从代码、文档或命令输出查清的，不反复问用户。
- **动手前先对齐一步**：多步任务调用工具前，先用 1–2 句说清要做什么和第一步。
- **按需读文档，够用就停**：先看任务相关源码；架构不清或跨模块改动读 `docs/developer/architecture.md`，碰样式、设置、站点包或历史坑再读对应文档。证据足够就停手，不为了显得完整去过度搜索。
- **查根因，别吞错**：定位真实根因，让错误显式暴露；不要用宽泛 `try/catch`、静默兜底、假成功或隐藏默认值把问题盖住。
- **改动聚焦，不叠补丁**：不顺手重构无关文件；但如果问题是两份状态打架、重复逻辑或跨模块设计缺陷，直接理顺结构，顺手清掉死代码和冗余分支。
- **改 UI 先读 `DESIGN.md`**：触及 UI、交互、主题、排版或动效时，先读根目录 `DESIGN.md`；开始实现前用一句话给出 `design read`（界面类型、适用章节、是否涉及主题或 Shadow DOM）。做视觉清理时不顺手删弱现有动效、品牌口号和表情徽标：`DESIGN.md` 保留清单里的不动，清单外但代码注释写明“保留”的先问用户。
- **交付前看 diff**：提交或回复前过一遍 `git diff`，确认没混入重复状态、死代码或意外改动；交付说明简短写清改了什么、动了哪些文件、跑了什么验证、还有什么风险。

## 项目概览

Ophel Atlas 是 TypeScript + React 18 + Plasmo 浏览器扩展，同时通过 Vite + `vite-plugin-monkey` 构建油猴脚本。

关键目录：

- `src/adapters/`：站点适配器。内置站点在 `src/adapters/builtin.ts` 注册（增删改顺序须同步油猴 `src/platform/userscript/adapters-vendor.ts`）。
- `src/core/`：核心管理器，由 `src/core/modules-init.ts` 编排初始化与热更新。
- `src/components/`：Shadow DOM 内的 React 面板 UI。
- `src/stores/`：Zustand + persist（扩展用 `chrome.storage.local`，油猴用同步 GM 存储）。
- `src/platform/`：扩展 / 油猴平台抽象层，跨平台差异必须走这里。
- `src/contents/`：Plasmo content script 入口（isolated / main world 与 UI 挂载）。
- `src/styles/`、`src/style.css`：原生 CSS 与 `--gh-*` 主题变量。
- `locales/` 与 `src/locales/`：扩展 manifest 与应用内 11 语种 i18n。
- `registry/`：SitePack 注册表、元数据校验与构建脚本。

## 常用命令

- **静态检查**：`pnpm format:check`、`pnpm lint:check`、`pnpm typecheck`
- **配置校验**：`pnpm adapters:validate`（内置站点配置）、`pnpm registry:validate`（SitePack 与 patch）
- **构建打包**：`pnpm build`（Chrome）、`pnpm build:firefox`、`pnpm build:userscript`、`pnpm package` / `pnpm package:firefox`
- **本地开发**：`pnpm dev`（扩展）；油猴本地调试先跑 `pnpm build:userscript:local`，再起 `pnpm serve:userscript:assets`（常驻本地资源服务，不要当一次性检查命令跑）

## 编码与架构红线

- **代码风格**：用 `~` 作为 `src/` 路径别名（如 `~utils/i18n`）。代码写直白好懂，不搞过度抽象、多余分层和隐式逻辑，优先早返回。遵循现有 Prettier / ESLint，认真处理 Hooks 依赖警告。
- **命名与日志**：标识符用英文，注释可用中文（只解释意图、约束或权衡）；`any` 和 `console` 只在确有必要时用，日志优先 `console.warn/error`。
- **安全与权限**：不硬编码密钥、令牌、Cookie 或用户私有数据；Manifest 权限保持最小，优先 optional permissions。
- **依赖与生成物**：统一用 `pnpm`（不用 `npm` / `yarn`），改依赖同步 `pnpm-lock.yaml`，不为绕过报错随意升大版本；默认跑 `pnpm format:check`，需要格式化时只格式化改到的文件，不全仓重排；不手改 `.plasmo/`、`build/`、`dist/`、`node_modules/`、`assets/assistant-mermaid-vendor.js` 等生成物或 vendor。
- **11 种语言一次改全**：改或加任何文案时，11 种语言必须一次同步到位，不能漏语种；注意两套体系目录命名不同：
  - 应用内（横杠/简写）：`src/locales/{zh-CN, zh-TW, en, ja, ko, it, de, es, fr, pt, ru}/index.ts`
  - 扩展 Manifest（下划线）：`locales/{zh_CN, zh_TW, en, ja, ko, it, de, es, fr, pt_BR, ru}/messages.json`
- **设置、存储与模块联动**：
  - 改设置项同步 `DEFAULT_SETTINGS`、store、UI、备份/恢复兼容和 11 语种文案；改备份/恢复检查 `ZUSTAND_KEYS`、`MULTI_PROP_STORES`、schema 兼容和旧数据迁移。
  - 改 Zustand persist 时注意油猴 GM 存储是同步的，别把同步 `getItem` 包成 Promise。
  - 新增核心模块检查 `modules-init.ts` 初始化顺序与 `subscribeModuleUpdates()` 热更新；background 消息统一用 `src/utils/messaging.ts` 常量。
  - 扩展与油猴的能力差异通过 `src/platform/` 显式表达，不在业务代码里分散判断。
- **UI 与 CSS**：`DESIGN.md` 是唯一规范入口（执行约定看附录 A，Shadow DOM / 主题 / Firefox 兼容硬约束看附录 B，机制细节看 `docs/developer/css-architecture.md`）。
- **站点适配器与 SitePack**：完整约定见 `docs/developer/conventions/site-pack.md`。三条底线：改 `feature-capabilities.ts`、`*-config.ts` 结构或 `declarative/validate.ts` 后**必跑 `pnpm adapters:validate`**；严禁靠增删 `capabilities` 或配置字段来“修”校验；同一发版周期内 `*_CONFIG_VERSION` 相对上个 release 只加 1。

## 更新日志、提交与验证

- **更新日志**：写前必读 `docs/developer/conventions/changelog.md`。底线：一条一句话、不写细节和括号举例、同主题多 PR 合成一条、中英文两份同步。
- **提交与 PR**：写前必读 `docs/developer/conventions/commits.md`。底线：英文 Conventional Commits（`type(scope): subject`）；PR 默认 Draft；提之前先看 `git status` 和 `git diff`。
- **本地目录禁入库**：`tests/` 和 `docs/plans/` 仅供本地验证与规划，禁止纳入 Git（不得 `git add -f` 或改 ignore）。提交前跑 `git ls-files -- tests docs/plans` 确认为空；清理既有跟踪用 `git rm --cached`，保留本地文件。
- **验证原则**：行为变更先跑最相关检查，再跑 `pnpm typecheck`，必要时跑对应构建；涉及 `src/platform/`、存储适配、内容脚本入口、样式注入或核心初始化时，同时验证 `pnpm build`、`pnpm build:firefox` 和 `pnpm build:userscript`。UI 变更先做静态检查，能跑起来就用浏览器做最小冒烟。跑不了就明说原因，不拿静态阅读冒充运行验证；命令失败先区分环境、依赖还是代码问题，把关键输出转述给用户。

## 按需查阅文档

- 文档分工索引：`docs/developer/README.md`
- UI / 交互 / 主题规范：`DESIGN.md`
- 全局架构与模块：`docs/developer/architecture.md`
- Shadow DOM 与样式注入：`docs/developer/css-architecture.md`
- 站点适配器与 SitePack 规范：`docs/developer/conventions/site-pack.md`
- Options 与设置弹窗：`docs/developer/options-page-ui.md`
- 设置结构快照：`docs/developer/settings-schema.json`
- 历史疑难排查：`docs/developer/troubleshooting.md`
