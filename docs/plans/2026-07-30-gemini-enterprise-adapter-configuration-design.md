# Gemini Enterprise 适配器配置化设计

## 目标与边界

Gemini Enterprise 是 P3-06 的第五个也是最后一个内置配置化站点。本次迁移让输入、发送与新对话、会话侧栏、消息与滚动容器、生成状态、网络监控、模型切换、导出、宽度、面板避让、Zen/Clean Mode、Mermaid、Quick Quote 和宿主主题同步依赖的宿主 DOM selector 可以通过 L1 patch 热修，同时保持现有用户行为不变。

只抽取可 JSON 序列化且有真实运行时读取点的 selector 与公共配置。hostname、CID 与会话路由解析、纯数字会话 ID 过滤、删除保护和菜单点击/等待时序、四阶段输入事件、递归 Shadow DOM 遍历、模型名称正则解析、会话展开控制流及主题切换编排继续留在命令式适配器中。

## 方案

保留 `GeminiEnterpriseAdapter extends SiteAdapter`，新增强类型 `GeminiEnterpriseSiteConfig`。公共 schema 承载输入、会话字段映射、生成状态、网络监控、模型切换、导出、宽度、Zen/Clean Mode、Mermaid、Quick Quote 与宿主主题同步开关；会话菜单、页面双重 Shadow DOM、Markdown、大纲、布局避让、模型名称、会话展开和原生主题菜单等 Enterprise 专属 selector 放入 `sitePrivateSelectors`。适配器默认引用唯一内置配置，并在启动门闩完成后接收校验过的合并配置。

不改为 `DeclarativeAdapter`，因为当前 DSL 无法等价表达 CID 路由、数字会话过滤、批量删除保护、多阶段输入事件、递归 Shadow DOM 文本与大纲提取、会话展开、模型名解析和原生主题菜单编排。也不只迁移公开 getter，否则导出、Markdown、删除菜单、主题同步和面板避让仍会保留不可热修的第二 selector 数据源。

布局继续遵循 Enterprise 的双重 Shadow DOM 约束：页面宽度与面板避让复用同一组配置，scope 和输入区 inset 仍由既有 `LayoutManager` 链路注入允许的页面 Shadow Root，不新增主题源或平行样式规则。

## 验证与剩余风险

默认配置必须通过 capability 与私有键白名单校验；合法 patch 应即时影响适配器 getter，未知/删除私有键与旧基线版本必须被拒绝或跳过。迁移前后的默认输入、会话、消息、模型、网络、导出、宽度、面板避让和模式配置逐项保持等价，并审计全部 29 个私有 selector 都有运行时消费点。

静态检查与双构建不能替代真实页面回归。Gemini Enterprise 的普通会话与无 CID 路由、会话观察和删除、四阶段输入、Shadow DOM 大纲与导出、模型锁定、新对话、停止生成、主题同步和面板避让仍需后续在真实站点验证，因此 P3-06 继续保持“进行中”。
