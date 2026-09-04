# 开发者文档索引

本目录只保留**长期有效**的参考文档与工作规范。一次性的计划、审计、审查记录在对应工作完成后删除，历史可从 git 记录找回。

## 目录分工

| 路径 | 类型 | 用途 |
| --- | --- | --- |
| `conventions/` | 工作规范 | 代理与贡献者都要遵守的写法约定，按需加载 |
| `architecture.md` | 架构参考 | 全局模块、初始化链路、常用命令 |
| `css-architecture.md` | 架构参考 | Shadow DOM、样式注入、主题系统机制详解与排查 |
| `troubleshooting.md` | 排查手册 | 历史疑难案例 |
| `options-page-ui.md` | 界面参考 | Options 页结构与 UI 说明 |
| `settings-schema.json` | 设置结构 | 设置项 schema 快照 |
| `site-adapter/` | 站点适配 | SitePack 审核清单、本地调试工作流、配置迁移手册、各站点热修字段矩阵 |
| `review-consolidated.md` | 进行中工作 | 三方审查汇总与未完成的修复项，收尾后删除 |

## 规范文档（conventions/）

- `changelog.md`：CHANGELOG 中英文同步写法、标题分类、条目格式。
- `commits.md`：Commit message、PR 与提交前检查规范。

`AGENTS.md` 只保留这两条规范的核心禁令与指针，细节以本目录为准。

## 新增文档的归位规则

- 长期参考（架构、机制、排查）：放本目录根级，并在上表登记。
- 工作规范（写法、流程约定）：放 `conventions/`。
- 一次性计划/审计/审查报告：默认不留在仓库；确需暂存的放在对应主题目录，工作完成后删除。
