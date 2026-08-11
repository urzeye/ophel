# feat/site-adapter-pluginization 分支审查报告

  基于当前 HEAD(434c9db3，相对 main 138 个提交，258 文件，+45.8k/-5.7k)。注意 docs/developer/site-
  adapter/2026-08-05-site-adapter-pluginization-review.md 已有一轮审查（基线 6fa0f2e3)，本报告在此之上复
  核了其后 16 个提交并重新验证关键路径。已实际运行：pnpm test、pnpm typecheck、pnpm lint:check、pnpm
  build、pnpm build:userscript。

  ## P0:合并即破坏 CI

  分支新增的测试步骤全部失败。 分支给 CI 加了 pnpm test 步骤（main 没有），但 6 个测试文件全挂——全部是
  ReferenceError: chrome is not defined:

  - 根因：vitest.config.ts( 分支新增）没有注入 __PLATFORM__ define,node 环境下 src/utils/config.ts:23 的
    APP_VERSION 在模块顶层执行 chrome.runtime.getManifest()，任何经 site-pack-http-policy.ts 间接 import
    它的测试都在加载期崩溃。

  - 挂掉的恰好是核心新逻辑的测试：pack-manager、remote-config-manager、site-pack-registration、platform-
    catalog、site-adapter-ai-draft、site-pack-manager-view。分支自己的安全网当前是失效的——233 个通过的测
    试里没有这些关键文件。

  - 修法很简单：vitest.config.ts 加 define: { __PLATFORM__: JSON.stringify("extension") }（顺带可能需要
    stub chrome.runtime.getManifest)，或把 APP_VERSION 改成惰性求值。

  ## P1：对 main 既有功能的风险

  1. 初始化单点故障，爆炸半径是全部 15 个内置站。 分支把原本同步的适配器获取改成三个入口都必须先 await
  initAdapterRegistry():src/contents/main.ts:594、src/contents/ui-entry.tsx:131(catch 后 isRegistryReady
  永远 false，面板永不渲染）、src/platform/userscript/entry.tsx:395。initializeAdapterRegistry 内部
  catch 较全，触发概率低，但一旦有任何未兜住的异常（如 primeDynamicPlatforms bug)，内置站面板也一起消
  失，无任何降级。建议：registry 初始化失败时 fall back 到"仅内置适配器"继续初始化，而不是整站不挂面板。

  2. 沿用上轮：remoteConfig.autoUpdate 默认 true 未变(src/constants/default-settings.ts:81)，安装后约 1
  分钟即后台联网拉取远程清单。技术上安全（签名数据非代码），但商店审核/隐私叙事需要配套说明。

  已验证无破坏的方面:15 站内建适配器保持 class + 原 siteId + 内置优先匹配顺序；conversations 存储迁移
  （裸 id → v1:instance:id）与全部调用方契约一致（src/core/conversation/manager.ts:177 统一换
  算）;siteInstanceKey 对内建站等于 siteId，存量设置不受影响；备份 codec 兼容 v1-4 旧格式；pnpm build 和
  build:userscript 均通过。

  ## P2:SitePack 新功能的逻辑缺陷

  3. 平台目录双源不一致。 src/core/platform-catalog.ts:63 的 loadSupportedAiPlatforms 用未过滤的
  snapshot.packs（含禁用包）prime 目录，而 src/adapters/index.ts 初始化时只传有效启用的包；
  getDynamicPlatforms 内部不过滤 enabled。两个 realm 各自 prime-once，导致"禁用包是否出现在平台列表/入
  口"取决于哪条路径先跑。

  4. 绑定失效的状态文案误导。 绑定指向的 pack 被卸载/损坏时，src/tabs/options/pages/
  SitePacksPage.tsx:1530 把 binding-pack-missing 显示为"不兼容"——用户无法判断该重装包还是删绑定，应有独
  立文案（如"适配包缺失")。

  5. 绑定硬失败在目标站仍无用户可见提示（上轮 P1，本轮确认未改）：选项页有徽标，但用户打开目标站点时面板
  直接不出现，只有 console.error。普通用户不会想到去选项页排查。

  ## P3：交互与流程问题

  6. src/tabs/options/pages/SiteSettingsPage.tsx:48 的 SITE_PACK_INFO_URL 作为用户可见链接指向开发计划文
  档的 URL 编码 anchor（含中文 fragment)，文档重构即 404，应指向 docs/site 用户文档。

  7. conversations 迁移中无法解析 instance key 的旧记录被保留在原裸 key 下（src/stores/conversations-
  store.ts Preserved unresolved 分支），从此任何 UI 都读不到它们——数据没丢但已成僵尸，且会随备份继续传
  播。

  8. 两个提交违反仓库 commit 规范：da6ce626 feat: 删除适配器诊断（中文 subject)、434c9db3 feat:
  userscript interaction（无 scope、语义含糊）。

  9. 上轮已提、本轮确认：sample packs 选择器质量（LobeChat 依赖 SVG path 等）、plan/tasks 文档中
  healthCheck 残留（仅开发文档，用户文档已干净）。

  ## 做得好的部分（明确确认）

  远程链路全程严谨：Ed25519 验签在解析 index 之前、revision 单调防回滚、内容寻址产物 + SHA-256、备源
  failover、失败保 last-known-good；双平台 transport 都有超时 + 大小上限 + 流式截断；MV3 权限用独立弹窗
  解决 user-gesture 约束，拒绝/撤销有回滚和测试；备份排除运行时状态、restore 后 reconcile;backup-
  validator 只是 re-export，无双真值；油猴 match 缺口已有检测 + 分管理器引导（本轮新增）。

  一句话结论：方向和安全边界没问题，构建与静态检查全绿，但测试基础设施是红的（P0，必修）；其次是初始化无
  降级（P1 建议加 fall back)；其余为逻辑一致性和文案级问题。未做真实站点冒烟，15 站兼容性仍是"结构保留、
  运行时未证"。

─ Worked for 1h 24m 50s ────────────────────────────────────────────────────────────────────────────────

• 上轮已交付完整审查报告。按完成审计要求，补两个证据缺口再收官：油猴入口的外层调用是否有兜底，以及
  initAdapterRegistry 内部真实的拒绝路径有哪些（校准 P1 的严重度）。

• Explored
  └ Read entry.tsx
    Search bootstrap|main\(\)|catch in entry.tsx
    Search ^init\(\)|^void init|init\(\)\.catch|readyState in entry.tsx
    Read entry.tsx
    Read entry.tsx

────────────────────────────────────────────────────────────────────────────────────────────────────────

• 两个证据缺口补齐，结论与前一轮报告一致且更严重一点：

  1. 油猴入口确认无兜底:src/platform/userscript/entry.tsx:608 是 void init(),initAdapterRegistry() 一旦
     拒绝就是未处理的 Promise rejection，脚本静默死亡，15 个内置站同样无面板。三个入口（扩展 main、扩展
     UI、油猴）全部无降级，P1 成立。

  2. 追加一个细节:initAdapterRegistry 用 ??= 记忆化（src/adapters/index.ts)，一旦 Promise 拒绝，后续所有
     调用永远拿到同一个 rejected promise，不会重试——瞬时故障（如 storage 偶发错误）会变成永久性不初始
     化，直到页面刷新。

  审查目标的各项均已用当前代码/命令输出验证：分支改动全貌、对 main 的破坏面（P0 CI 测试全红、P1 初始化单
  点）、SitePack 的逻辑缺陷（平台目录双源、绑定失效文案、硬失败无站内提示、僵尸会话记录）、交互问题，以
  及实际跑过的验证（test/typecheck/lint/build/build:userscript)。完整报告见上一条回复。

审查目标已完成并归档。最终交付物是上一条的完整报告，核心结论：

- **P0（必修）**：分支新增的 vitest 步骤 6 个测试文件全挂（`chrome is not defined`，根因是 vitest.config 缺 `__PLATFORM__` define)，合并即 CI 红，且失效的恰好是 pack-manager / remote-config / registration 这些核心新逻辑的测试。
- **P1**：三个入口都硬依赖 `initAdapterRegistry()`，无降级、拒绝后不重试（`??=` 记忆化 rejected promise)，爆炸半径覆盖全部 15 个内置站；`autoUpdate` 默认 true 的审核叙事待配套。
- **P2**：平台目录双源不一致（禁用包是否出现取决于谁先 prime)、绑定失效显示"不兼容"误导用户、绑定硬失败在目标站无用户可见提示。
- **P3**：用户可见链接指向开发计划文档 anchor、迁移后僵尸会话记录、两个中文/无 scope 的 commit message。
- **确认无破坏**:15 站适配器结构、conversations 存储迁移契约、备份 v1-4 兼容、远程签名/revision/备源链路、MV3 权限弹窗流；`pnpm build`、`build:userscript`、typecheck、lint 全绿。

全程耗时约 1 小时 38 分，未做真实站点冒烟——15 站运行时兼容性仍需一轮真机验证才能签收。