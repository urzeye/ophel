# 开发者文档索引

本目录只放**长期有效**的参考文档和工作规范。一次性计划、审计、审查记录做完就删，历史留给 git。

## 目录分工

| 路径                     | 类型     | 用途                                                                |
| ------------------------ | -------- | ------------------------------------------------------------------- |
| `conventions/`           | 工作规范 | 代理和贡献者都要遵守的写法与流程约定，按需查阅                      |
| `architecture.md`        | 架构参考 | 模块划分、双平台构建、初始化顺序、消息常量与关键数据流              |
| `css-architecture.md`    | 架构参考 | Shadow DOM、双平台样式注入链路、主题运行时机制与排查                |
| `export-formats.md`      | 导出参考 | 图片、PDF、DOCX 选型、体积预算、双平台策略与渲染边界                |
| `options-page-ui.md`     | 界面参考 | Options 独立页与设置弹窗结构、路由与改动清单                        |
| `settings-schema.json`   | 设置结构 | 设置项 schema 快照                                                  |
| `troubleshooting.md`     | 排查手册 | 历史疑难故障归档                                                    |
| `site-adapter/`          | 站点适配 | 配置化迁移手册、SitePack 审核清单、本地调试工作流、各站点热修矩阵   |

## 工作规范（`conventions/`）

- [changelog.md](./conventions/changelog.md)：更新日志写法、自检、分类格式与正反示例。
- [commits.md](./conventions/commits.md)：Commit message、PR 规则与提交前检查顺序。
- [site-pack.md](./conventions/site-pack.md)：内置站点适配器与 SitePack 的边界、命名分层、校验红线与版本规则。

`AGENTS.md` 只保留这些规范的底线与触发指针，细则以 `conventions/` 为准。

## 新增文档归位规则

- **长期参考**（架构、机制、排障）：放 `docs/developer/` 根级，并在上表登记。
- **工作规范**（写法、流程约定）：放 `docs/developer/conventions/`。
- **一次性计划 / 审计 / 审查报告**：不入库；本地规划放 `docs/plans/`（已被 `.gitignore` 忽略），切勿提交。
