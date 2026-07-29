# Grok 适配器配置化设计

## 目标与边界

Grok 是 P3-06 的第二个内置配置化站点。本次迁移让输入、会话侧栏与 CMDK 列表、消息、大纲、导出、生成状态、模型选择、宽度、面板避让、Zen Mode 和原生 Quick Quote 依赖的宿主 DOM selector 可以通过 L1 patch 热修，同时保持现有用户行为不变。

只抽取可 JSON 序列化且有真实运行时读取点的 selector 与公共配置。hostname、新对话/分享页判断、删除 API 与鉴权头、CMDK 虚拟列表加载和删除点击时序、置顶 SVG path 识别、Tiptap 输入事件、附件与分享响应解析、主题 class/localStorage 操作继续留在命令式适配器中。Grok 的面板避让沿用现有约束：只改写定义 `--content-max-width` 的外层节点，聊天、空态与输入区使用主布局安全区，Canvas sibling 预览单独按 `#grok-app-root` 计算右侧 edge inset。

## 方案

保留 `GrokAdapter extends SiteAdapter`，新增强类型 `GrokSiteConfig`。公共 schema 承载 textarea、发送/停止/新对话按钮、会话字段映射、消息、生成、网络监控、模型切换、导出、宽度、Zen Mode 和 Quick Quote；CMDK、侧栏菜单、消息正文、附件候选、模型文本及布局安全区等 Grok 专属 selector 放入 `sitePrivateSelectors`。适配器默认引用唯一内置配置，并在启动门闩完成后接收校验过的合并配置。

不改为 `DeclarativeAdapter`，因为当前 DSL 无法等价表达会话弹窗的虚拟列表扫描、原生 API/UI 双路径删除、置顶识别、Tiptap 输入编排、附件与分享导出以及自定义大纲字数统计。也不只迁移 getter 返回值，否则 CMDK 删除、附件识别和 Canvas 避让仍会保留不可热修的第二数据源。

## 验证与剩余风险

默认配置必须通过 capability 与私有键白名单校验；合法 patch 应即时影响适配器 getter，未知私有键与旧基线版本必须被拒绝或跳过。迁移前后的默认输入、会话、消息、宽度、面板避让、导出、模型与网络配置逐项保持等价，并审计适配器中的直接 selector，只保留 Ophel 自身标记、通用 DOM 原语和明确的发版边界。

静态检查与双构建不能替代真实页面回归。Grok 的会话弹窗全量加载、API/UI 删除、置顶识别、附件与分享页导出、生成检测、模型锁定、主题切换、新对话及 Canvas 避让仍需后续在真实站点验证，因此 P3-06 保持“进行中”。
