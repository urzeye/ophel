# ChatGLM 适配器配置化设计

## 目标与约束

ChatGLM 是 P3-05 的第四个内置配置化站点。本次迁移要让输入、主题菜单、消息、大纲、导出、生成状态、模型、宽度、Zen/净化和 Canvas 避让依赖的宿主 DOM selector 可以通过 L1 patch 热修，同时保持自有会话与分享页行为不变。

只迁移可 JSON 序列化的纯配置。hostname、查询参数和分享路径解析、主题 localStorage 映射、textarea 原生 setter、点击/等待编排、分享 API 请求、附件 URL/文件名解析、导出排序及思维内容格式化继续保留在命令式适配器中。面板避让继续遵循现有 ChatGLM 布局约束：响应、消息和 Markdown 容器参与宽度重算，输入底部容器不重复限宽；新对话引导区与 Canvas 预览分别使用 edge inset。

## 方案选择

采用“完整配置抽取、保留 `SiteAdapter` 子类”的方案。公共 schema 承载 textarea、发送、消息、滚动、生成、网络、模型、导出、宽度、Zen、净化与 Quick Quote 模式；ChatGLM 专属 selector 放入强类型 `sitePrivateSelectors`。适配器在每次调用时读取 `this.config`，不缓存配置派生值。

不采用 `DeclarativeAdapter`，因为当前 DSL 无法表达分享页 API 导出、主题菜单多阶段点击、思维节点归并、图片尺寸过滤及附件去重。也不采用只迁移公共字段的最小方案，因为主题弹层、导出清理、附件卡片和 Canvas selector 会继续形成不可热修的第二数据源。

## 配置结构与数据流

新增 `ChatGLMSiteConfig extends BuiltinSiteConfig`，导出唯一的 `CHATGLM_CONFIG` 与 `CHATGLM_CONFIG_VERSION = 1`。默认配置由基础 selector 派生组合值，公共 selector 与私有用途键分别服务通用管理器和 ChatGLM 命令方法。主题标签文本、分享 API 路径、附件来源属性和 URL 过滤规则不进入 selector 配置。

`ChatGLMAdapter` 默认引用该配置对象，并实现 `getBuiltinConfig()`、`getBuiltinConfigVersion()`、`applyMergedConfig()`。门闩注入合并配置后，输入、主题、滚动、导出、生成、模型和布局方法立即读取新值；所有返回给外部的数组或对象都复制，避免调用方修改默认配置。

## 失败边界与验证

默认配置必须通过 `validateBuiltinSiteConfig`，私有键白名单来自默认配置，内置 capability 不可删除。合法 patch 应能修改 selector；未知私有键必须拒绝；旧 `baseConfigVersion` 必须跳过。默认 selector 常量和公共 getter 返回值要与迁移前逐项等价，并审计剩余直接 selector，只保留 Ophel 自身 `.gh-*` 标记、通用 DOM 原语或明确记录的发版边界。

交付前运行聚焦 Prettier/ESLint、类型检查、全仓格式与排除 `output/**` 的 ESLint、扩展构建、油猴构建和 `git diff --check`。新增热修覆盖矩阵。没有真实站点环境时，不把静态检查包装成页面回归；四站真实页面验证仍作为 P3-05 的剩余工作记录。
