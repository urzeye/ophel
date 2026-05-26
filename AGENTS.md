# AGENTS.md

面向本仓库 AI/Codex 代理的项目级规则。项目级 Agent 规则统一维护在 `AGENTS.md`。优先级：用户当前指令 > 本文件 > 其他项目文档。默认用中文回复，除非用户明确要求其他语言。

## 工作方式

- 先给结论或结果，再补必要上下文；表达直接、克制、执行优先。
- 少问多做：能从代码、文档、命令输出确认的信息，不向用户反复确认。
- 先读任务相关上下文：优先查看相关源码；仅在首次进入仓库、架构不清、跨模块变更时阅读 `docs/developer/architecture.md`；只在触及样式、设置、平台差异或历史疑难问题时阅读对应 `docs/developer/*` 文档。
- 多步任务在调用工具前，先用 1 到 2 句说明要做什么和第一步。
- 调试优先：定位根因，不用静默 fallback、宽泛 try/catch、重复实现来掩盖问题。
- 让错误显式暴露；不要靠静默兜底、伪成功、吞异常或隐藏默认值掩盖问题。
- 如果问题来自重复逻辑、双重真值、共享状态或跨模块行为，按结构性问题处理，不叠补丁。
- 小步提交式修改：保持 diff 聚焦，避免顺手重构无关文件。
- 改动保持最小闭环，但该删的死代码、冗余分支和重复逻辑要一起清掉。
- 交付前看 diff：检查是否引入第二数据源、重复逻辑、死代码、隐式行为变化或安全退化。
- 每完成关键步骤都判断是否已能回答用户核心请求；证据足够就停止，不为了“更完整”而扩写或过度搜索。

## 项目概览

Ophel Atlas 是 TypeScript + React 18 + Plasmo 的浏览器扩展，同时支持 Vite + `vite-plugin-monkey` 油猴脚本构建。

关键目录：

- `src/adapters/`：站点适配器。新增站点要继承 `SiteAdapter` 并在 `src/adapters/index.ts` 注册。
- `src/core/`：核心管理器，由 `src/core/modules-init.ts` 编排初始化与热更新。
- `src/components/`：Shadow DOM 内的 React 面板 UI。
- `src/stores/`：Zustand + persist，扩展端走 `chrome.storage.local`，油猴端走 GM 存储适配。
- `src/platform/`：扩展/油猴平台抽象。跨平台逻辑必须优先用这里的接口。
- `src/contents/`：Plasmo content script 入口，含 isolated/main world 和 UI 挂载逻辑。
- `src/styles/`、`src/style.css`：原生 CSS 与主题变量。
- `locales/` 与 `src/locales/`：manifest 与应用内 i18n。

## 常用命令

- 安装依赖：`pnpm install`
- 扩展开发：`pnpm dev`
- 格式检查：`pnpm format:check`
- Lint 检查：`pnpm lint:check`
- 类型检查：`pnpm typecheck`
- Chrome 构建：`pnpm build`
- 油猴构建：`pnpm build:userscript`
- 油猴本地调试构建：`pnpm build:userscript:local`
- 油猴本地资源服务：`pnpm serve:userscript:assets`

项目当前没有正式测试体系；代码变更优先运行最相关检查，提交前参考 CI 顺序补齐 `pnpm format:check`、`pnpm lint:check`、`pnpm typecheck`、`pnpm build`。若无法运行，交付时说明原因和替代检查。

## 编码约束

- 使用 `~` 作为 `src/` 路径别名，例如 `~utils/i18n`。
- 优先写低复杂度代码，保证易读、易调试、易修改；选择简单、可维护、可上线的方案。
- 避免过度设计、重抽象、额外分层、大依赖、炫技写法和隐式行为。
- 保持 API 小而清晰，行为显式，命名明确，控制流平坦，优先早返回。
- 遵循现有 Prettier/ESLint；React Hooks 依赖警告要认真处理。
- 标识符用英文；必要注释可用中文，但只解释意图、约束或权衡。
- 不硬编码密钥、令牌、Cookie 或用户私有数据。
- `any`、`console` 只在确有必要时使用；日志优先 `console.warn/error`。
- 设置项变更要同步 `DEFAULT_SETTINGS`、store、UI、备份/恢复兼容逻辑和 i18n 文案。
- 修改或新增任何文案时，必须一次性同步 10 种语言，不准遗漏某种语言的文案。
- 10 种语言包括：zh-CN、zh-TW、en、ja、ko、de、es、fr、pt-BR/pt、ru。
- 应用内文案检查 `src/locales/*/index.ts`；扩展 manifest 文案检查 `locales/*/messages.json`；新增 key 时按使用场景同步对应体系。
- Manifest 权限变更要保持最小授权，优先使用 optional permissions。
- 依赖管理统一使用 pnpm；不要使用 `npm install` 或 `yarn`；依赖变更必须同步 `pnpm-lock.yaml`。
- 不为绕过类型、Lint 或构建问题随意升级大版本依赖。
- 默认使用 `pnpm format:check`；需要格式化时优先格式化相关文件，不要无故全仓格式化。
- 不手改 `.plasmo/`、`build/`、`dist/`、`node_modules/`、`assets/assistant-mermaid-vendor.js` 等生成物或 vendor 文件。

## 架构规则

- 适配器层只处理站点识别、DOM 选择、输入/导航/导出等站点差异；通用行为放回 core 或 utils。
- 修改 `src/adapters/*` 时优先使用稳定选择器，避免依赖易变 class、纯展示文案或单语言文本。
- 修改单个站点适配器时，不要把站点特定逻辑泄漏到公共基类或影响其他站点。
- 新增核心模块时，检查 `modules-init.ts` 的初始化顺序和 `subscribeModuleUpdates()` 热更新路径。
- 修改 Zustand persist 时，注意油猴 GM API 是同步存储；不要把同步 `getItem` 包成 Promise。
- 修改备份/恢复时，检查 `ZUSTAND_KEYS`、`MULTI_PROP_STORES`、schema 兼容和旧数据迁移。
- 修改 background 消息时，使用 `src/utils/messaging.ts` 的常量，避免散落字符串。
- 跨扩展和油猴的能力差异必须通过 `src/platform/` 显式表达，不在业务代码里分散判断。
- 修改 `src/platform/`、存储适配、内容脚本入口、样式注入或核心初始化时，必须同时考虑浏览器扩展和油猴脚本；高风险变更优先验证 `pnpm build` 和 `pnpm build:userscript`。

## UI 与 CSS 规则

- 面板运行在 Plasmo Shadow DOM 中；普通 CSS import 不会自动作用于面板。
- 面板样式要通过 `src/contents/ui-entry.tsx` 的 `getStyle()` 注入，新增 CSS 文件需用 `data-text:` 合并。
- 动态主题变量由 `ThemeManager` 注入到 Shadow Root 末尾，避免被静态变量覆盖。
- `::view-transition-*` 等文档根伪元素样式必须注入主文档 `document.head`，不能放在 Shadow DOM CSS 里。
- Gemini Enterprise 等第三方 Shadow DOM 场景，样式要注入目标 shadowRoot，而不是只注入页面或插件 Shadow DOM。
- CSS 类名延续 `gh-` 前缀，颜色优先使用 `--gh-*` 变量并提供合理 fallback。

## 排查优先读的文档

- 全局架构、模块、命令：`docs/developer/architecture.md`
- Shadow DOM、样式注入、主题系统：`docs/developer/css-architecture.md`
- 历史疑难案例：`docs/developer/troubleshooting.md`
- 设置结构：`docs/developer/settings-schema.json`
- Options UI：`docs/developer/options-page-ui.md`

## 提交与 PR

- 提交代码前参考 `.github/workflows/ci.yml`，建议按 CI 顺序运行：`pnpm format:check`、`pnpm lint:check`、`pnpm typecheck`、`pnpm build`。
- 仅文档或 `docs/**` 变更通常不会触发 CI，可按风险选择是否运行完整检查。
- Commit message 使用英文，遵循 `commitlint.config.js` 的 Conventional Commits：`type(scope): subject`。
- 允许的 type：`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert`、`deps`、`ux`。
- Commit header 最长 100 字符；scope 使用小写；body/footer 前留空行。
- 创建 PR 使用英文；PR 标题也参考 commit message 格式，例如 `fix(adapter): handle ChatGPT panel remount`。
- 提交或整理 diff 前先看 `git status` 和 `git diff`；不要把无关文件、用户未要求的格式化改动或生成物混进提交。

## 验证与交付

- 行为变更：优先跑目标检查，再跑 `pnpm typecheck`，必要时跑对应构建。
- 本地调试油猴脚本相关问题时，先执行 `pnpm build:userscript:local`，再执行 `pnpm serve:userscript:assets`。
- `pnpm serve:userscript:assets` 是长运行本地资源服务，通常需要保持运行，不要当作一次性检查命令。
- UI/样式变更：先做相关静态检查；能实际运行时，用浏览器查看目标页面或选项页做最小冒烟。
- 能跑验证就跑；不能跑就明确说明原因，不把静态阅读包装成运行时验证。
- 交付内容保持简短：说明改了什么、在哪些文件、跑了什么验证、还有什么风险。
- 不要因为命令失败就跳过；先判断是环境问题、依赖问题还是代码问题，并把关键输出转述给用户。
