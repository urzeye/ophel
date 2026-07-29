# Yuanbao 适配器配置化设计

## 目标与约束

Yuanbao 是 P3-05 的第三个内置配置化站点。本次迁移要让输入、会话列表、消息、导出、模型、生成状态、宽度、Zen/净化及会话删除流程依赖的宿主 DOM selector 可以通过 L1 patch 热修，同时保持现有用户行为不变。

迁移只处理可 JSON 序列化的纯配置。hostname、路径与 localStorage 解析、Quill 输入事件、点击模拟、会话删除状态机、附件 URL/文件名解析、导出排序与思维内容格式化仍留在命令式适配器中。面板避让继续遵循 Yuanbao 的变量型布局：宽度变量作用于 `:root`，聊天内容和输入区以左侧 Pane 为 scope，Canvas Pane 单独使用右侧 edge inset。

## 方案选择

采用“完整配置抽取、保留 `SiteAdapter` 子类”的方案。公共 schema 承载 textarea、发送、消息、滚动、会话、生成、网络、模型、导出、宽度、Zen 与净化配置；Yuanbao 专属 selector 放入强类型 `sitePrivateSelectors`。适配器在每次方法调用时读取 `this.config`，不缓存由配置派生的 selector。

不采用 `DeclarativeAdapter`：Yuanbao 的 Quill 输入、动态 agent/session URL、置顶状态、会话删除菜单/弹窗编排、思维正文识别及附件去重无法由当前声明式 DSL 等价表达。也不采用只迁移公共字段的最小方案，因为那会把会话删除、导出和 Canvas 相关 selector 留成第二数据源，无法满足 P3-05 的热修目标。

## 配置结构与数据流

新增 `YuanbaoSiteConfig extends BuiltinSiteConfig`，要求完整的公共配置和专属私有 selector。默认配置由少量基础 selector 派生组合值，导出唯一的 `YUANBAO_CONFIG` 与 `YUANBAO_CONFIG_VERSION = 1`。会话公共配置提供列表项、主 ID 属性/正则、标题、活动态和 URL 模板；动态 agent ID、备用 `data-item-id`、置顶判断及删除算法继续由适配器处理。

`YuanbaoAdapter` 默认引用该配置对象，并实现 `getBuiltinConfig()`、`getBuiltinConfigVersion()`、`applyMergedConfig()`。运行时门闩注入校验后的合并结果后，输入、消息、滚动、导出、模型和会话 UI 方法立即读取新配置。所有返回给公共管理器的数组或对象都复制后返回，避免调用方修改默认配置。

## 失败边界与验证

默认配置必须通过 `validateBuiltinSiteConfig`，私有键白名单由默认配置自动生成，内置 capability 不可删除。合法 patch 应能修改 selector；未知私有键必须在验证阶段拒绝；旧 `baseConfigVersion` 必须跳过。默认值要与迁移前常量和 getter 返回值逐项等价，并审计适配器中剩余的直接 selector，只允许 Ophel 自身 `.gh-*` 标记、通用 DOM 原语或明确记录的命令式边界。

交付前运行聚焦 Prettier/ESLint、类型检查、全仓格式与排除 `output/**` 的 ESLint、扩展构建、油猴构建和 `git diff --check`。新增热修覆盖矩阵，明确哪些会话、删除、资源与路径行为仍需随应用发版；真实站点回归未完成前，P3-05 继续保持“进行中”。
