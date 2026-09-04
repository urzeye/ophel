# 提交与 PR 规范

## Commit message

Commit message 使用英文，遵循 `commitlint.config.js` 的 Conventional Commits：`type(scope): subject`。

允许的 type：`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert`、`deps`、`ux`。

Commit type 按改动意图选择，不要把"优化""清理""移除"默认写成 `fix`：

- `fix`：修复明确 bug、错误行为、回归或兼容性问题。
- `feat`：新增、移除或改变用户可见能力；破坏性能力移除使用 `feat!`，或在 footer 标注 `BREAKING CHANGE`。
- `refactor`：不改变用户可见行为的结构调整、重复逻辑合并、死代码删除。
- `perf`：以性能为目标、用户行为等价的优化。
- `ux`：用户界面、交互流程、文案体验相关优化。
- `chore`：配置、脚本、依赖、仓库维护等不直接影响产品行为的清理。

格式限制：

- Header 最长 100 字符；scope 使用小写。
- body/footer 前留空行；body 每行最长 100 字符（长句必须手动断行）；footer 每行最长 120 字符。

## PR

- 创建 PR 使用英文；PR 标题也参考 commit message 格式，例如 `refactor(core): remove obsolete prompt pipeline`、`perf(adapter): reduce DOM observer work`、`ux(panel): simplify quick actions`、`fix(adapter): prevent duplicate panel injection`。
- 创建 PR 默认一律创建为 Draft PR（如 `gh pr create --draft`），除非用户显式要求创建正式 PR；避免未审阅的提交提前触发 CI 消耗额度或发生误合。
- CI 已配置 Draft PR 自动跳过执行，转换为 Ready for review 后方会触发全量构建与检查。
- 纯文档与元配置（`docs/**`、`*.md`、`.gitattributes`、`.editorconfig`、`.all-contributorsrc` 等）已被配置在 CI `paths-ignore` 中不会触发流水线。

## 提交前检查

- 提交代码前参考 `.github/workflows/ci.yml`，建议按 CI 顺序运行本地验证：`pnpm format:check`、`pnpm lint:check`、`pnpm typecheck`、`pnpm test`、`pnpm build`。
- 提交或整理 diff 前先看 `git status` 和 `git diff`；不要把无关文件、用户未要求的格式化改动或生成物混进提交。
