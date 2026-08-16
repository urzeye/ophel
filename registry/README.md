# Ophel SitePack Registry

`registry/sites/` 保存社区可贡献的声明式 SitePack，`registry/patches/` 保存内置适配器的配置热修。两类文件都只能包含 JSON 数据，不能包含脚本、表达式或可执行代码。

SitePack 的 TypeScript 运行时校验器是安全与兼容性的最终真值。`registry/schema/site-pack.schema.json` 用于编辑器提示和 CI 结构校验；registry 脚本会让每个 SitePack 同时通过 JSON Schema 与运行时校验器，避免只依赖其中一套规则。

## 提交 SitePack

1. 复制 `registry/examples/site-pack.example.json` 到 `registry/sites/<id>.json`。
2. 删除不需要的可选配置，只声明已经在目标站点验证过的 `capabilities`。
3. 使用稳定的属性和 DOM 结构编写选择器，避免易变 class、纯展示文案或单语言文本。
4. 运行 `pnpm registry:validate` 和 `pnpm registry:build`。
5. 使用 [SitePack PR 模板](../.github/PULL_REQUEST_TEMPLATE/site-pack.md) 提交站点、测试环境、功能证据和截图。

仓库的 `.vscode/settings.json` 已把 `registry/sites/*.json` 映射到本地 JSON Schema。不要在 manifest 中加入 `$schema`：SitePack 使用严格未知键拒绝策略，运行时会拒绝该字段。

### 新增 manifest 字段（维护者）

新增字段（根级或嵌套）可以与使用该字段的 SitePack 同 PR 提交，无需拆成两个 PR。PR 校验以候选分支的 schema 为准（`additionalProperties: false` 逐层拒绝未在 schema 声明的字段），对 schema 已声明、但当前已发布应用代码还不认识的新字段做前向兼容放行，前提是该包的 `minAppVersion` 不低于当前 `package.json` 版本，保证只有包含字段支持的版本才会加载这个包。运行时（扩展/油猴）校验不受影响，始终拒绝未知字段。

### 核心字段

| 字段                   | 要求                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`        | 当前固定为 `1`。                                                                                                            |
| `id`                   | 全局唯一，匹配 `^[a-z0-9-]{2,40}$`，且不能与内置站点 ID 冲突。                                                              |
| `version`              | 正整数，仅作为已发布版本号的下限。新建包填 `1`，之后修改内容无需递增：发布构建按内容自动派生版本号。                        |
| `minAppVersion`        | 最早理解这些字段并完成过验证的 Ophel SemVer 版本。                                                                          |
| `name` / `description` | 默认展示文本；可用 `nameI18n` / `descriptionI18n` 提供多语映射。                                                            |
| `matches`              | 最多 10 条 HTTPS match pattern；禁止全局匹配、顶层通配及与内置/现有包重叠。自部署站点包可为空，仅经用户自定义域名绑定激活。 |
| `capabilities`         | 用户界面能力契约，只能声明已经提供所需字段并在真实页面验证的能力。                                                          |
| `selectors`            | 通用页面选择器集合；各字符串最长 500 字符，普通数组最多 50 项。                                                             |

### 能力与必需配置

| Capability             | 必需字段                            |
| ---------------------- | ----------------------------------- |
| `outline`              | `selectors.responseContainer`       |
| `outline-user-queries` | `outline` + `selectors.userQuery`   |
| `conversation-list`    | `conversation`                      |
| `export-basic`         | `export`                            |
| `model-lock`           | `modelSwitcher`                     |
| `generation-detect`    | `generating` 或 `networkMonitor`    |
| `new-chat`             | 非空 `selectors.newChatButton`      |
| `stop-generation`      | 非空 `selectors.stopButton`         |
| `width`                | 非空 `widthSelectors`               |
| `zen`                  | `zenMode`                           |
| `clean`                | `cleanMode`                         |
| `prompt-insert`        | 非空 `selectors.textarea` + `input` |
| `reading-history`      | 非空 `selectors.chatContent`        |

### 配置分组

- `input`：输入元素类型与提交快捷键。
- `conversation`：会话列表项、ID 捕获正则、标题和同源跳转模板。
- `generating` / `networkMonitor`：DOM 或网络生成状态检测。
- `session`：会话 ID、新对话页、分享页和新标签页路径。
- `modelSwitcher`：模型菜单按钮、菜单项和可选子菜单规则。
- `export`：用户消息、助手消息、轮次容器及 Shadow DOM 标记。
- `zenMode` / `cleanMode`：隐藏选择器、根 class 和受限样式规则。
- `widthSelectors`：可调整宽度的目标与受限 CSS 值。
- `mermaidSupport` / `quickQuote` / `supportsHostThemeSync`：通用行为开关。
- `themeSync`：宿主页主题联动（亮暗）的声明式配置。仅支持 “写 localStorage + 切换 `<html>` class + 派发 storage 事件” 机制，键名、写入值、类名全部显式声明：`storageKey` 必填，`values.dark` / `values.light` 必填，`values.system` 仅当站点自身存储独立的跟随系统值时提供；`darkClass`、`lightClass` 均可选，两者都缺省时不动 DOM 类，仅靠写存储和事件让站点自行应用（适用于监听 storage 事件的站点，如 LobeChat）。扁平存储默认写裸字符串，`valueFormat: "json"` 表示写 JSON 编码字符串；键内存放 JSON 对象时用 `valuePath` 指定主题值的点分隔路径（只改写该路径，保留同键其它偏好），且不能与 `valueFormat` 同用。body class、`data-theme` 属性、模拟点击等机制不支持；不监听 storage 事件的站点无法实时生效，不得声明。声明 `themeSync` 即视为支持宿主页主题联动，不得同时声明 `supportsHostThemeSync: false`。

完整字段、类型、长度和条件约束以 [`site-pack.schema.json`](schema/site-pack.schema.json) 与 `src/adapters/declarative/validate.ts` 为准；两者冲突时，以运行时校验器为准并同步修正 Schema。

## 安全约束

- 单个 SitePack JSON 序列化后不得超过 64 KiB；普通数组最多 50 项。
- 正则最长 200 字符，必须可编译并通过 `safe-regex2` 检查。
- `urlTemplate`、`sharePathPrefix`、`newTabPath` 必须以单个 `/` 开头并保持同源。
- 远程 CSS 会在解码转义、移除注释和归一化后拒绝 `url(`、`@import`、`expression(`、`javascript:`。
- 不得提交令牌、Cookie、账号、内部 URL、用户数据或任何秘密。
- 不得用 SitePack 覆盖内置站点；内置站点改版应走 patch。
- 不得新增脚本、JavaScript 表达式、远程资源加载或破坏性自动操作字段。

## 提交内置适配器 patch

Patch 只用于已经配置化的内置适配器 selector/纯配置热修，文件放在 `registry/patches/<site-id>.json`。基本结构为：

```json
{
  "targetSiteId": "zai",
  "patchSchemaVersion": 1,
  "patchVersion": 2,
  "baseConfigVersion": 1,
  "minAppVersion": "1.1.8",
  "maxAppVersion": "1.2.0",
  "config": {
    "selectors": {
      "responseContainer": "main[data-chat]"
    }
  }
}
```

- `targetSiteId` 必须已有可配置内置描述符；不能借 patch 新增站点。
- `patchVersion` 与 SitePack `version` 同规则：仅作下限声明，新建填 `1`，之后由发布构建按内容自动派生；`baseConfigVersion` 必须等于当前内置配置版本。
- `config` 使用对象递归覆盖、数组整体替换、`null` 删除键；合并结果仍须是完整合法配置。
- `sitePrivateSelectors` 只能修改目标站点已登记的白名单键。
- 临时兼容修复可设置 `maxAppVersion`；内置修复发布并提升 `baseConfigVersion` 后旧 patch 会自动失效。
- Patch PR 使用常规 PR 模板，并按[审核清单](../docs/developer/site-adapter/site-pack-review-checklist.md#内置适配器-patch-审核)提供受影响能力的真实站点回归结果。

## 文件与发布约定

- 普通文件使用 `*.json`。
- 需要通过 registry kill switch 停用的当前版本改名为 `*.disabled.json`；JSON 内容本身不增加 `disabled` 字段。
- 同一 pack `id` 或 patch `targetSiteId` 只能存在一份当前源文件。
- 版本号无需手动递增：发布构建将源内容（剔除版本号字段）与上一份发布产物的 SHA-256 对比，未变更的包复用旧版本号，已变更的包在上一版基础上 +1，且不低于源文件声明的 `version` / `patchVersion`；同一版本号对应的内容恒定不变，声明值仅在灾难恢复等需要强制抬高已发布版本时才手动改大。发布分支会保留旧版本的不可变路径。
- `index.json` 的 `registryRevision` 每次发布递增 1，与仓库 commit 数无关；仅在 `registry-dist` 分支丢失等灾难恢复场景，通过 `workflow_dispatch` 的 `revision-override` 输入强制指定一个大于已发布值的 revision。
- `registry/examples/` 仅保存校验与创作示例，不会进入发布索引。
- 发布产物包含 `index.json` 与分离的 `index.sig.json`；签名认证完整 index，index 中的 SHA-256 再认证每个不可变包文件。

## 发布签名

正式 `registry-dist` 发布使用 Ed25519 签名。GitHub Actions 从 `REGISTRY_SIGNING_PRIVATE_KEY` secret 读取 base64 PKCS#8 私钥，并以源码内置的 key ID 和公钥校验私钥匹配关系；密钥缺失、类型错误或不匹配都会在写入发布分支前终止任务。

客户端先验证 `index.json` 原始字节对应的 `index.sig.json`，再解析 index 和下载包。签名缺失、未知 key、验签失败或 key 不适用于该 `registryRevision` 时，不会降级接受无签名数据；客户端改用备源，两源均失败则继续使用 last-known-good。

轮换密钥时必须按以下顺序操作：

1. 先发布同时信任旧、新公钥的客户端，并给旧 key 设置明确的最大 `registryRevision`。
2. 更新 GitHub secret 和 workflow key ID，切换 registry 发布签名。
3. 支持范围内客户端越过切换版本后，再删除旧公钥。

不要把生产私钥写入 `.env`、命令参数、日志或仓库文件。`pnpm registry:build:signed` 仅供配置了生产 secret 的发布环境使用。

## 本地命令

```bash
pnpm registry:validate
pnpm registry:build
pnpm registry:serve
```

`pnpm registry:build` 使用固定的 **local-dev** Ed25519 密钥写出完整签名产物，仅供本地结构检查与开发构建联调；该密钥不会进入生产信任列表，产物也不可发布。`pnpm registry:serve` 会先构建再在 `http://127.0.0.1:8787/index.json` 提供静态服务（revision 使用常规 git/env 解析，不用时间戳；客户端对 loopback 源放宽同 revision 内容替换，并在检查更新时按内容覆盖已安装包（不要求 version 递增），避免本地迭代卡死）。开发构建可在设置页一键“使用本地 Registry”，并用“恢复默认源 / 清除缓存”来回切换。正式 workflow 使用 `pnpm registry:build:signed`，并强制匹配内置生产公钥。

PR 校验 workflow 会从受信任的主分支脚本读取 PR 中的 registry 数据；本地复现时可指定候选目录：

```bash
pnpm registry:validate -- --registry-root /path/to/registry
```

生成物写入 `registry/dist/`，只用于本地检查和 `registry-dist` 分支发布，不提交到 main。
