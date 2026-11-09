# Safari 核心功能适配实施计划

> 后续调整：仓库 `tests/` 已按用户要求删除，本文中的测试文件和测试命令仅保留为原实施计划记录。当前发布工作流构建并上传 Safari Web Extension 资源 zip，仅供 macOS Safari 通过“添加临时扩展”加载；暂无 Safari 商店版或已签名应用。临时扩展会在 24 小时后或退出 Safari 时移除，需要重新添加。PR CI 不运行 Safari 测试或构建。

> 执行状态以 [tasks.csv](tasks.csv) 为准。按用户追加要求，完成低风险代码适配；当前做不了或改动过大的项目明确跳过，不以自动检查替代真机验收。
>
> 通知范围已修正：保留完成检测、标题状态、提示音及重复播放；首期只关闭系统通知弹窗，不新增原生通知工程。

**Goal:** 在 macOS Safari 上保证 Ophel 核心整理、导航、词库、文本导出和数据管理能力，首期不支持去水印。

**Architecture:** Safari 继续使用 extension 平台和现有站点适配器。浏览器策略集中在平台层，UI 与生命周期按能力启用功能；普通资源请求独立于 DNR 请求头增强，MAIN world 与 SitePack 共用现有注册链路。

**Tech Stack:** TypeScript 5.3、React 18、Plasmo 0.90.5、Zustand、pnpm、Vitest；不增加运行时依赖。

范围、技术决策和外部依据见 [分析结果](analysis.md)。建议最低版本 Safari 18.0，发布时须测试该最低版本和当时的稳定版本。下述新增路径是计划，不表示当前已经存在。

## 任务 1：冻结构建基线并建立最小验证入口

**文件：**

- 修改：`package.json`，新增 `build:safari`，沿用现有资源准备、Plasmo 构建和编码检查顺序。
- 新增：`tests/setup.ts`，只补齐 `vitest.config.ts` 当前引用但缺失的入口，不做全局 Chrome 成功响应 mock。
- 后续测试放在 `tests/safari/`，按任务增量添加；不为仅新增构建命令编写镜像测试。

**步骤：**

1. 记录起点 commit、Node/pnpm 版本、Plasmo 版本和生成的 manifest，确认工作树没有混入其他修改。
2. 新增脚本，等价于 `pnpm prepare:mermaid-assets && pnpm prepare:locale-assets && plasmo build --target=safari-mv3 && pnpm check:bundle-encoding`。
3. 核实当前 pnpm 对已声明 KaTeX 补丁的处理。只解决已证实的依赖/环境阻塞，不借迁移顺手升级依赖。
4. 执行 `pnpm build:safari`，记录结果，并检查 manifest 引用的后台、内容脚本和资源都实际存在。

**完成条件：** 统一命令可重复生成 Safari 目标文件，编码检查覆盖该目录；仍明确标记为未完成运行适配。

## 任务 2：集中浏览器策略并修复后台启动

**文件：**

- 新增：`src/platform/extension/browser-policy.ts`，只放构建目标及纯策略数据，不导入 storage、platform 或业务管理器。
- 修改：`src/platform/types.ts`、`src/platform/extension/index.ts`、`src/platform/userscript/index.ts`。
- 修改：`src/background.ts`。
- 新增：`tests/safari/capabilities.test.ts`、`tests/safari/background-startup.test.ts`。

**步骤：**

1. 先添加回归用例：浏览器无 `runtime.onUpdateAvailable`、无 `notifications` 时，后台仍能完成消息监听；存储/备份与 SitePack 消息可到达处理器。
2. 用 Plasmo 内置 `process.env.PLASMO_BROWSER` 确定扩展构建目标。在平台能力中显式增加 `watermarkRemoval` 和 `notifications`，两端都给出明确取值，避免油猴依靠未知能力默认返回 true。
3. Safari 关闭上述两项及首期不用的 DNR 通路，其余能力按支持事实保留；不把 cookies、permissions、tabs 一并关闭。
4. 为可选事件注册添加真实 API 检查；Safari 更新提示走既有安装/版本记录与 App Store 更新机制，不模拟不受支持的更新事件。
5. Safari 不初始化 DNR 规则；`MSG_PROXY_FETCH` 继续提供普通请求，保留已有公网目标限制和错误返回。Chrome、Firefox 仍按原有策略安装请求头规则。
6. 不支持通知的调用明确失败，不能沿用当前“没有 API 仍返回 success”的行为；UI 和调用方在任务 3 中提前按能力约束。

**验证：**

```powershell
pnpm exec vitest run tests/safari/capabilities.test.ts tests/safari/background-startup.test.ts
pnpm typecheck
```

预期：缺少可选 API 不阻断后台；Safari 普通代理不读写 DNR；Chrome/Firefox 路径保持原有调用。测试环境为 Node，不能把该结果包装为 Safari 真机通过。

## 任务 3：完整关闭去水印并隔离系统通知

**文件：**

- 修改：`src/core/modules-init.ts`、`src/core/tab-manager.ts`、`src/contents/gemini-watermark-main.ts`。
- 修改：`src/tabs/options/pages/GeminiSettings.tsx`、`FeaturesPage.tsx`、`PermissionsPage.tsx`。
- 修改：`src/locales/{zh-CN,zh-TW,en,ja,ko,it,de,es,fr,pt,ru}/index.ts`。
- 新增：`tests/safari/unsupported-features.test.ts`。

**步骤：**

1. 添加回归用例：旧设置里去水印和桌面通知均为 true，在 Safari 首次初始化、设置热更新、恢复备份后均不能启动对应副作用。
2. 去水印启动/停止判断在现有生命周期中收敛复用；MAIN world 入口在包装 fetch、添加监听和暴露处理器之前按纯构建策略退出。测试断言原 fetch 引用未变化，而不只是模块字段为 null。
3. 保留存储原值，不新建 effective settings 持久化副本，不新增 `safariMode` 设置。Safari UI 明确标为不可用且不能开启，不显示误导性的生效状态。
4. 隐藏或禁用 Safari 的系统通知和去水印操作入口，权限页不列出通知授权，也不因去水印申请 `<all_urls>`。保留生成状态检测、标题、自动聚焦和 Gemini Markdown 修复。
5. 保留现有 `showNotification` 作为完成提醒的总开关，Safari 使用声音提醒说明且不请求系统通知权限；提示音、音量和重复播放设置保持。系统通知发送单独按能力约束，不新增设置字段。自动播放和后台播放效果待真实 Safari 验证。
6. 新增用户文案同步全部 11 种应用内语言。保持现有设置字段、备份 schema 和其他浏览器行为。

**验证：**

```powershell
pnpm exec vitest run tests/safari/unsupported-features.test.ts
pnpm typecheck
```

预期：不支持的功能不产生副作用，不请求权限，不阻断核心初始化；导入到 Chrome 后原始设置仍可按原有逻辑使用。界面实测遵循根目录 `DESIGN.md` 的 Components、主题和 Shadow DOM 约束。

## 任务 4：验证 MAIN world 与 SitePack 注册顺序

**文件：**

- 检查：`src/contents/monitor-entry.ts`、`aistudio-rpc-main.ts`、`keyboard-guard-main.ts`、`scroll-lock-main.ts` 及其他核心 MAIN world 入口。
- 修改（如验证需要）：`src/platform/extension/site-pack-registration-runtime.ts`、`site-pack-registration.ts`、`src/background.ts`。
- 新增：`tests/safari/site-pack-registration.test.ts`，使用当前构建的入口描述构造测试输入。

**步骤：**

1. 在真实 Safari 检查后台无启动异常，读取 `getRegisteredContentScripts()`，核对所有核心 MAIN world 入口及其 world、runAt 和 matches。
2. 先深测 Gemini、ChatGPT、Claude 三条链路：冷启动、硬刷新、SPA 切换、流式生成和输入框插入；再验证 AI Studio 的 document_start RPC 及编辑器桥接。
3. 验证后台重启、浏览器重启和扩展更新后的注册恢复、已有注册项识别与对账。若当前静默注册让失败无法上报，在现有运行时增加明确的注册就绪检查；先查询后操作，不靠固定延时抢时序。
4. 验证 SitePack 安装、来源绑定授权、刷新注入、停用及撤权。复用现有 MAIN world 模板，不创建第二套注册器。
5. 仅在真实 Safari 证实动态方式不可行后调整注入实现；同时更新模板发现，入口描述只保留一份来源。该变化须重新评估工期，不以去掉 MAIN world 或停用 SitePack 通过验收。

**验证：**

```powershell
pnpm exec vitest run tests/safari/site-pack-registration.test.ts
pnpm registry:validate
```

预期：静态测试覆盖重复注册和缺失模板等失败条件；真实 Safari 上确认事件从页面主环境实际到达大纲、生成状态和导出数据源。必须记录浏览器/系统版本及测试站点。

## 任务 5：保证文本导出、数据容量与 Safari manifest

**文件：**

- 修改：`src/utils/exporter.ts`，复用现有附件清单补充缺失附件反馈，不新增 Safari 导出器。
- 修改（按实际失败定位）：`src/platform/extension/storage.ts`、相关导出和备份调用方。
- 修改：`package.json` 的 Safari manifest override 和构建清理顺序。
- 复用：`scripts/strip-manifest-key.mjs`、`scripts/check-bundle-encoding.ts`。
- 新增：`scripts/verify-safari-build.mjs`、`tests/safari/export.test.ts`、`tests/safari/manifest.test.mjs`。
- 若新增导出提示：同步任务 3 所列全部 11 种应用内语言；若新增 manifest 文案：同步 `locales/{zh_CN,zh_TW,en,ja,ko,it,de,es,fr,pt_BR,ru}/messages.json`。

**步骤：**

1. 添加回归用例：附件请求被拒绝或超时，Markdown/TXT/JSON/HTML 文本仍完整，现有附件清单含 `included: false` 和错误原因，界面不报告完整成功。
2. 保留原有页面可读资源和普通后台资源请求；跨域失败不扩权，不再触发 Safari DNR。导出结果的失败摘要从同一附件清单生成，避免双重真值。
3. Safari override 去掉 DNR 和 notifications，保留框架 scripting、storage、alarms、内置站点和按需授权能力，并为本地大数据增加 `unlimitedStorage`。cookies 保持可选。
4. 构建后复用现有清理脚本移除 Chrome key 及失效资源引用。新增的只读构建验证脚本检查实际产物：权限裁剪正确、资源引用存在、MAIN world 资产保留、脚本元数据一致；不得因空目录或缺失 manifest 返回成功。
5. 在 Safari 实测超过 5 MB 的本地数据写入、刷新、重启、备份导出及恢复。权限/容量错误须明确提示，不能表现为成功后数据丢失。备份 schema、Zustand key 和同步/异步存储约定不变。
6. 验证下载文件名、中文编码、HTML 代码/公式和用户手势下的复制。保留既有主题切换和 Shadow DOM 样式，不为 Safari 新增全局 CSS 覆盖层。

**验证：**

```powershell
pnpm exec vitest run tests/safari/export.test.ts tests/safari/manifest.test.mjs
pnpm build:safari
node scripts/verify-safari-build.mjs build/safari-mv3-prod
```

预期：目标构建和验证脚本均成功；其中 manifest 测试使用独立 fixture 覆盖错误输入，构建验证再检查本次真实产物。下载、剪贴板和存储持久化结论必须来自 Safari 实测。

## 任务 6：回归、打包与发布记录

**文件：**

- 修改：`.github/workflows/ci.yml`，在后续代码实现阶段增加 Safari 目标构建和产物检查，不把构建通过标记为 Safari 运行测试通过。
- 更新：`docs/developer/architecture.md`、本目录文档；README/商店说明仅在实际支持后更新。文案、更新日志和提交遵循仓库规范。

**代码侧验证顺序：**

```powershell
pnpm exec vitest run tests/safari
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm registry:validate
pnpm build
pnpm build:userscript
pnpm build:firefox
pnpm build:safari
node scripts/verify-safari-build.mjs build/safari-mv3-prod
```

以上是代码侧验证门槛，实际结果记录在 CSV。修复目标检查后再拓展回归；若编码检查扫描到旧产物中的问题，应识别产物来源，不跳过失败或伪造通过。

**真机验收矩阵：**

| 编号 | 场景                                                    | 通过条件                                                                               |
| ---- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A1   | 最低支持版本及发布时稳定版；首次启用、拒绝/授予站点权限 | 可正常启动，权限拒绝有明确状态，无未处理异常                                           |
| A2   | 所有内置站点的基础工作流                                | 逐站点记录原有大纲、定位、Prompt、会话导航和文本导出结果；不以少量抽样代表全部站点     |
| A3   | Gemini、ChatGPT、Claude 长对话；AI Studio RPC           | MAIN world 数据实际到达，生成状态、虚拟滚动数据源和导出内容不丢失                      |
| A4   | 新增/编辑词库和会话组织；刷新及浏览器重启               | 数据和组织关系保持一致，无重复面板和事件监听                                           |
| A5   | SitePack 授权、来源绑定、注册、重启、停用及撤权         | 授权与注册一致；无重复注册，撤权后不继续注入                                           |
| A6   | 旧备份中去水印/通知为 true，恢复后再热更新              | 设置原值保留，不启动去水印或系统通知、不包装 fetch、不弹相关授权；声音设置继续生效     |
| A7   | 纯文本、代码、公式、表格与中文导出                      | Markdown/TXT/JSON/HTML 文件内容和文件名正确，复制在用户手势下成功                      |
| A8   | 含可读和受限附件的导出                                  | 文本完整；成功附件可打开，失败附件在清单及界面可见，不宣称完整离线包                   |
| A9   | 超过 5 MB 的数据备份、恢复及重启                        | 无数据丢失、无错误成功提示；空间/权限失败能明确定位                                    |
| A10  | 面板、设置弹窗、Options；浅/深色、主题切换、自定义样式  | 24 套主题预置均做基本显示检查，深测浅/深色及含背景/渐变的代表主题；Shadow DOM 样式正确 |
| A11  | Chrome、Firefox 与油猴                                  | 核心功能无回归，原有去水印和通知能力未被全局关闭                                       |
| A12  | Safari 打包及安装后复测                                 | packager 警告已处理或有明确非核心解释，安装包能启用并通过 A1/A3/A4 最小复测            |

A1～A10 是 Safari 核心可用门槛，A11 是跨平台门槛，A12 是可分发门槛。未完成 A12 时可以交付本地验证版本，不能称为可正式分发；任何未测平台、版本或站点必须明确列出。

打包采用 Apple 官方 Xcode 命令行或 App Store Connect 在线工具。真实测试、证书/签名、账号、商店元数据和审核等待单独记录；本计划不自动授权上传、发布或对外宣称支持。

## 当前交付检查

- [x] 从干净 main 基线创建 `docs/safari-core-support-plan` 分支。
- [x] 记录代码现状、Safari 兼容依据、核心范围、可舍弃增强和待验证项。
- [x] 定义具体文件落点、实施顺序、验证命令及真机验收门槛。
- [x] 任务 1～6 的低风险代码改动与验证入口已实现；完成状态和跳过项见 CSV。
- [ ] 完成 Safari 真机测试、打包和分发验收。
