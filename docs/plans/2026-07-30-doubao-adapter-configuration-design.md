# Doubao 适配器配置化设计

## 目标与边界

Doubao 是 P3-06 的第三个内置配置化站点。本次迁移让输入、会话侧栏、虚拟消息列表、消息正文、附件与生成图片、生成状态、模型选择、导出、宽度、面板避让、Zen/Clean Mode 和原生 Quick Quote 依赖的宿主 DOM selector 可以通过 L1 patch 热修，同时保持现有用户行为不变。

只抽取可 JSON 序列化且有真实运行时读取点的 selector 与公共配置。`/chat`、`/code/chat`、`/thread` 路由判断，Slate paste/清空事件，虚拟大纲缓存与跳转，滚动扫描导出，附件 URL 与 Performance 资源解析，会话删除点击/等待时序和主题行为继续留在命令式适配器中。面板避让继续分别处理主聊天列、新对话空态和 `/code/chat` Canvas 右侧安全区。

## 方案

保留 `DoubaoAdapter extends SiteAdapter`，新增强类型 `DoubaoSiteConfig`。公共 schema 承载 textarea、发送/停止/新对话按钮、会话字段映射、消息、生成状态、模型切换、导出、宽度、Zen/Clean Mode、Quick Quote 与宿主主题同步开关；Slate 节点、侧栏和虚拟列表、消息正文、附件/图片、模型文本、删除菜单/弹窗及布局安全区等豆包专属 selector 放入 `sitePrivateSelectors`。适配器默认引用唯一内置配置，并在启动门闩完成后接收校验过的合并配置。

不改为 `DeclarativeAdapter`，因为当前 DSL 无法等价表达 `/code/chat` 的 Slate 输入事件、虚拟列表大纲缓存、滚动扫描导出、附件与生成图片解析以及多阶段 UI 删除。也不只迁移公开 getter，否则大纲、导出、删除和 Canvas 避让仍会保留不可热修的第二 selector 数据源。

## 验证与剩余风险

默认配置必须通过 capability 与私有键白名单校验；合法 patch 应即时影响适配器 getter，未知/删除私有键与旧基线版本必须被拒绝或跳过。迁移前后的默认输入、会话、消息、模型、导出、宽度和面板避让配置逐项保持等价，并审计全部私有 selector 都有运行时消费点。

静态检查与双构建不能替代真实页面回归。豆包的普通聊天与 `/code/chat` 输入、虚拟会话列表、大纲缓存跳转、附件/生成图片导出、批量删除、模型锁定、新对话、分享页及 Canvas 避让仍需后续在真实站点验证，因此 P3-06 保持“进行中”。
