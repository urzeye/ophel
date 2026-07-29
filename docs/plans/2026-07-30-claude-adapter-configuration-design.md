# Claude 适配器配置化设计

## 目标与边界

Claude 是 P3-07 大站批次的第二个配置化站点。本次迁移让输入与操作按钮、会话侧栏、消息与 Markdown、生成状态、网络监控、模型菜单、实时 DOM 导出、用户附件、Artifact/文档查看器、思考块、虚拟滚动、大纲、页面宽度、面板避让、Zen/Clean Mode、Mermaid 和 Quick Quote 依赖的宿主 selector 可以通过 L1 patch 热修，同时保持现有用户行为不变。

只抽取可 JSON 序列化且有真实运行时读取点的 selector 与公共配置。hostname、会话/分享路由、组织 ID 与 Cookie/localStorage 解析、原生删除 API、删除关键词与点击等待编排、数学/Markdown 内容判断、虚拟滚动遍历与缓存、Artifact 文档采集和恢复、附件 URL 安全过滤、大纲缓存与排序、主题切换控制流继续留在命令式适配器中。Ophel 自身的 `data-gh-*`、`.gh-*`、动态消息 ID selector 和通用 DOM 原语也不进入远程配置。

## 方案

保留 `ClaudeAdapter extends SiteAdapter`，新增强类型 `ClaudeSiteConfig`。公共 schema 承载输入、会话字段映射、生成状态、网络监控、模型切换、导出、页面宽度、Zen/Clean Mode、Mermaid、Quick Quote 与宿主主题同步；Claude 专属的侧栏分组、删除菜单、文档查看器、Artifact、虚拟列表、用户附件、思考块和面板避让 selector 放入精确的 `sitePrivateSelectors` 白名单。适配器默认引用唯一内置配置，并在启动门闩完成后接收校验过的合并配置。

不改为 `DeclarativeAdapter`，因为当前 DSL 无法等价表达组织级原生删除、ProseMirror 输入、长会话虚拟滚动、大纲缓存、Artifact 文档打开/采集/恢复、附件安全过滤、思考块展开恢复和 Claude 主题存储编排。也不只迁移公开 getter，否则 Artifact、导出、思考块、会话删除和 preserve 面板避让仍会保留不可热修的第二 selector 数据源。

布局继续采用 preserve 模式：`#main-content` 相关 scope、`.max-w-3xl`/`.max-w-4xl` 内容宽度、仅作用于自动滚动容器的安全区、默认 `768px` 宽度以及 Artifact/文件查看器路径保持不变。不新增 CSS、主题源或 Shadow DOM 注入路径。

## 验证与剩余风险

默认配置必须通过 capability 与私有键白名单校验；合法 patch 应动态影响适配器读取，未知/删除私有键与旧基线版本必须被拒绝或跳过。迁移前后的默认输入、会话、消息、生成、模型、导出、Artifact/文档、思考块、虚拟滚动、宽度、面板避让和模式配置逐项保持等价，并确认每个私有 selector 都有运行时消费点。

静态检查与双构建不能替代真实页面回归。普通会话与长会话、置顶和普通侧栏项、原生/API 删除、用户附件、Artifact/文档导出与面板恢复、思考块导出、大纲跳转、模型锁定、新对话、停止生成、页面宽度、面板避让和主题切换仍需后续在真实站点验证，因此 P3-07 继续保持“进行中”。
