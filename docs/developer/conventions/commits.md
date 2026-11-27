# 提交与 PR 规范

## Commit message

使用英文，遵循 `commitlint.config.js` 的 Conventional Commits：`type(scope): subject`。

允许的 type：`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert`、`deps`、`ux`。

按改动意图选 type，别把“优化”“清理”“移除”一律写成 `fix`：

- `fix`：修复明确的 bug、错误行为、回归或兼容性问题。
- `feat`：新增、移除或改变用户可见能力；破坏性移除用 `feat!`，或在 footer 写 `BREAKING CHANGE`。
- `refactor`：不改变用户可见行为的结构调整、合并重复逻辑、删死代码。
- `perf`：以性能为目标、行为等价的优化。
- `ux`：界面、交互流程、文案体验相关改进。
- `chore`：配置、脚本、依赖、仓库维护等不影响产品行为的改动。

格式限制：

- Header 最长 100 字符；scope 小写。
- body / footer 前空一行；body 每行最长 100 字符（长句手动断行）；footer 每行最长 120 字符。

## PR

- PR 标题和描述用英文，标题沿用 commit 格式（如 `refactor(core): remove obsolete prompt pipeline`、`ux(panel): simplify quick actions`、`fix(adapter): prevent duplicate panel injection`）。
- 默认一律创建为 **Draft PR**（`gh pr create --draft`），除非用户明确要求正式 PR，避免未审阅的提交白耗 CI 额度或误合。
- CI 只在 PR 上跑（`pull_request`），`main` push 不触发。Draft PR 自动跳过，转为 Ready for review 后触发全量检查；Ready 后每次 push 都会重跑完整 CI，所以转 Ready 前先在本地跑完下方检查。需要手动跑 `main` 时执行 `gh workflow run ci.yml --ref main`。
- 纯文档和元配置（`docs/**`、`*.md`、`.gitattributes`、`.editorconfig`、`.all-contributorsrc` 等）在 CI `paths-ignore` 中，不会触发流水线。

## 提交前检查

- 代码改动按 `.github/workflows/ci.yml` 顺序在本地验证：`pnpm format:check`、`pnpm lint:check`、`pnpm typecheck`、`pnpm build`（涉及双平台或适配配置时再补对应构建与校验）。
- 提交前先看 `git status` 和 `git diff`，确认没有混入无关文件、未要求的全仓格式化或构建生成物。
