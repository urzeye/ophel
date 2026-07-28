# SitePack 与配置 Patch 审核清单

本清单用于审核 `registry/sites/*.json` 与 `registry/patches/*.json`。自动校验通过只是合并前提，不能替代真实站点验证；对无法验证的能力应要求贡献者移除声明，而不是凭配置外观推定可用。

## SitePack 自动检查

- [ ] PR 只包含目标 SitePack、必要文档或与本次 registry 规则直接相关的聚焦改动，没有生成的 `registry/dist/`。
- [ ] `pnpm registry:validate` 通过：JSON Schema、运行时校验、safe-regex、ID 唯一性和 match 冲突检查均无错误。
- [ ] `pnpm registry:build` 通过，包版本未回退或复用，不可变发布路径可生成。
- [ ] 文件位于 `registry/sites/<id>.json`，不是示例目录，也没有在 JSON 内加入 `disabled` 或 `$schema`。
- [ ] `schemaVersion` 是当前支持值，未知键被拒绝；Schema 与 `validateSitePackManifest()` 对该文件结论一致。

## 身份、激活与版本

- [ ] `id` 清晰、稳定、全局唯一，不冒用内置站点或其他项目名称。
- [ ] `matches` 只覆盖目标 HTTPS host/path，不使用 `<all_urls>`、`https://*/*`、顶层 host 通配或无关子域名。
- [ ] `matches` 不与内置站点及其他 SitePack 重叠；同一 origin 不产生第二激活真值。
- [ ] `matches: []` 时存在有效 `detect`，并明确该包依赖自定义域名绑定/detect 激活路径，不能包装成当前即可自动激活的公共站点包。
- [ ] 新包 `version` 从正整数开始；更新包严格递增且没有复用已发布版本号。
- [ ] `minAppVersion` 对应首次支持所用字段/行为并有实际验证依据，不随意填写最新版本。
- [ ] 名称、描述、站点 URL 和贡献证据不含内部环境、测试账号或用户私有信息。

## 选择器与声明式原语

- [ ] 优先使用稳定 `data-*`、`aria-*`、元素语义、固定 ID 或可解释的结构关系。
- [ ] 避免构建 hash、CSS Modules 随机类、utility 顺序、纯展示文案和单语言文本；确需使用时在 PR 中说明稳定性证据与替代方案。
- [ ] 选择器范围足够窄，没有把 `body`、整个页面主容器或大面积可交互区域作为自动点击目标。
- [ ] `newChatButton`、`stopButton`、`submitButton` 只指向对应白名单语义操作，不会触发删除、提交账户设置、购买或其他破坏性行为。
- [ ] 会话 `idFrom.regex` 的第一捕获组确实是稳定会话 ID；`urlTemplate` 替换后保持当前 origin。
- [ ] `session` 正则只处理短 pathname，分享页、新对话页和新标签页路径没有开放重定向。
- [ ] Shadow DOM 标记与真实 DOM 层级一致；没有用配置假装支持必须由命令式适配器完成的能力。

## 安全边界

- [ ] JSON 中没有脚本、JavaScript 表达式、事件处理器、远程模块、模板求值或新增可执行原语。
- [ ] CSS 字段只包含所需声明；没有编码或转义后的 `url(`、`@import`、`expression(`、`javascript:`，也没有远程字体/图片等资源加载。
- [ ] 正则长度、结构和输入范围合理；除自动 safe-regex 检查外，人工确认没有嵌套量词或不受限回溯设计。
- [ ] `networkMonitor` 只匹配生成相关请求；metadata 是静态非敏感标记，不包含请求正文、令牌、Cookie 或用户内容。
- [ ] 未增加 manifest 权限、host 权限或跨平台特判；新域名授权必须走既有平台能力与用户确认。
- [ ] 未引入站点删除会话、账户操作、文件上传或其他 L1 专属命令式行为。

## Capability 真实站点冒烟

只检查 manifest 声明的能力；未声明能力应在 UI 中不可见，并记录为“不适用”而不是失败。

| Capability             | 最小验证                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `outline`              | 已有回复页面能提取标题层级；定位与字数范围合理。                                    |
| `outline-user-queries` | 用户提问按 DOM 顺序进入大纲，且同时声明 `outline`。                                 |
| `conversation-list`    | 能读取 ID/标题、识别当前项并完成配置的 SPA/地址跳转。                               |
| `export-basic`         | 用户与助手消息顺序正确；`turnSelector: null` 或轮次容器行为符合页面结构。           |
| `model-lock`           | 能打开模型菜单、找到目标项并在重试上限内停止。                                      |
| `generation-detect`    | 生成中与空闲都能恢复正确状态，网络静默阈值不会长期误报。                            |
| `new-chat`             | 只触发新对话，不误点删除/清空/导航外链。                                            |
| `stop-generation`      | 只在生成期间命中停止按钮，点击后状态能回到空闲。                                    |
| `width`                | 默认、自定义宽度和恢复路径可用，没有破坏宿主响应式布局。                            |
| `zen`                  | 进入/退出均恢复页面，隐藏和样式规则不残留。                                         |
| `clean`                | 只移除声明的非核心干扰元素，关闭后完整恢复。                                        |
| `prompt-insert`        | 真实输入框可插入并读回文本；提交键符合站点行为，不依赖静默 `textContent` fallback。 |
| `reading-history`      | 消息锚点稳定，刷新/滚动后不会串到错误消息。                                         |

补充检查：

- [ ] 未声明能力在设置页与面板没有入口。
- [ ] 页面初始加载、已有会话、新对话、生成中和生成结束等适用状态均至少冒烟一次。
- [ ] 浅色/深色主题下由包提供的颜色和 CSS 不影响 Ophel 面板可读性。
- [ ] 扩展形态在已授权目标 origin 上可激活；若同时声称 userscript 支持，需在对应管理器自定义 match 环境验证并说明配置。
- [ ] PR 附带能证明关键能力的截图或录屏，且已遮挡账号、对话和其他隐私信息。

## 发布与完整性

- [ ] 构建后的 index 摘要与 manifest 的 `id`、`version`、`minAppVersion`、`matches` 一致。
- [ ] 构建产物 SHA-256 来自实际不可变包字节；没有手写或复用其他版本摘要。
- [ ] 高于当前应用版本的包会保留 catalog 条目但不可安装，并显示所需升级版本。
- [ ] 禁用文件仅用于明确的 kill switch；停用原因和恢复条件已记录。
- [ ] 合并前重新检查目标站点没有刚发生 DOM 灰度改版，必要时记录账号/地区差异。

## 内置适配器 Patch 审核

- [ ] `targetSiteId` 已注册可配置内置描述符；新增站点没有伪装成 patch。
- [ ] `patchVersion` 单调递增，`baseConfigVersion` 等于当前内置配置版本。
- [ ] `minAppVersion` / `maxAppVersion` 范围合理；临时 patch 不会覆盖已含正式修复的新版本。
- [ ] `config` 只修改必要字段；数组整体替换和 `null` 删除是有意行为，没有误删必填配置。
- [ ] `sitePrivateSelectors` 只使用目标站点已登记白名单键，没有借公共层开放站点私有实现。
- [ ] `pnpm registry:validate` 已验证 patch 局部结构与合并后的完整配置。
- [ ] 在目标内置站点回归所有被修改 selector 直接或间接影响的功能；未触及功能行为保持不变。
- [ ] PR 说明止损路径：必要时可改名为 `.disabled.json`，内置修复发布后通过提升 `baseConfigVersion` 让旧 patch 自动失效。
