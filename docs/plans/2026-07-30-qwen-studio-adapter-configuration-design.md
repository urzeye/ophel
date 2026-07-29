# Qwen Studio 适配器配置化设计

## 目标与边界

Qwen Studio 是 P3-06 的第四个内置配置化站点。本次迁移让输入、会话侧栏、消息正文、公式、代码块与 Mermaid、思考面板、附件与生成图片、生成状态、模型选择、导出、宽度、面板避让、Zen/Clean Mode、Quick Quote 和宿主主题同步依赖的宿主 DOM selector 可以通过 L1 patch 热修，同时保持现有用户行为不变。

只抽取可 JSON 序列化且有真实运行时读取点的 selector 与公共配置。`/c`、`/s` 路由判断，token/cookie 解析，会话 API 快照与分页，受控 textarea 事件，完整历史加载，附件 URL 安全过滤，Mermaid 视图切换与恢复时序，思考面板点击/等待/文本解析，主题 API 与 localStorage 操作，以及二级模型菜单 hover/click、关键词匹配和等待时序继续留在命令式适配器中。

## 方案

保留 `QwenAiAdapter extends SiteAdapter`，新增强类型 `QwenStudioSiteConfig`。公共 schema 承载 textarea、发送/停止/新对话按钮、会话字段映射、消息、生成状态、网络监控、模型切换、导出、宽度、Zen/Clean Mode、Mermaid、Quick Quote 与宿主主题同步开关；侧栏与布局、消息正文、公式、代码块/Mermaid、思考面板、附件/图片和模型菜单等 Qwen Studio 专属 selector 放入 `sitePrivateSelectors`。适配器默认引用唯一内置配置，并在启动门闩完成后接收校验过的合并配置。

原模型菜单组合 selector 超过公共 schema 的单字符串长度上限，因此使用语义等价的 `:is(...)` 与 `:has(:is(...))` 合并重复前缀；匹配范围不变，不放宽全局校验约束。

不改为 `DeclarativeAdapter`，因为当前 DSL 无法等价表达会话 API 快照与分页、受控 textarea 事件、完整历史加载、附件 URL 过滤、Mermaid 视图切换、思考面板导出、主题同步和多阶段模型选择。也不只迁移公开 getter，否则导出、代码块、思考面板、模型二级菜单和布局避让仍会保留不可热修的第二 selector 数据源。

## 验证与剩余风险

默认配置必须通过 capability 与私有键白名单校验；合法 patch 应即时影响适配器 getter，未知/删除私有键与旧基线版本必须被拒绝或跳过。迁移前后的默认输入、会话、消息、模型、导出、宽度、面板避让和模式配置逐项保持等价，并审计全部 59 个私有 selector 都有运行时消费点。

静态检查与双构建不能替代真实页面回归。Qwen Studio 的普通聊天与分享页、会话侧栏、完整历史导出、附件/生成图片、公式复制、Mermaid 代码/预览切换、思考面板、模型锁定、新对话、停止生成、主题同步和面板避让仍需后续在真实站点验证，因此 P3-06 保持“进行中”。
