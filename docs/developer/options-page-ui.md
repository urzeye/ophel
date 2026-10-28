# Ophel Atlas 设置页与设置弹窗

本文档记录当前 Options Page 与面板内设置弹窗的实际实现。早期独立设置页设计稿已不再作为实现依据；涉及设置 UI 的任务应以本文件、`DESIGN.md`、`src/utils/storage.ts` 和对应页面源码为准。

## 1. 当前入口

- `src/components/SettingsModal.tsx`：内容脚本中的设置弹窗，渲染在扩展 Shadow DOM 内，复用 `src/tabs/options/pages/*` 页面组件。
- `src/tabs/options.tsx`：独立 Options 页面入口，加载 `tabs/options.html`，用于扩展独立窗口、权限请求窗口等场景。
- `src/tabs/options.css`：独立页面样式入口，导入 `src/styles/theme-variables.css` 与 `src/styles/settings.css`。
- `src/contents/ui-entry.tsx`：面板与设置弹窗的 Shadow DOM 样式入口，通过 `data-text:~styles/settings.css` 注入设置页共享样式。

## 2. 导航结构

### 2.1 设置弹窗

`SettingsModal.tsx` 与独立 Options 页共用 `src/tabs/options/settings-nav.ts` 的 `SETTINGS_NAV_ITEMS` 组织一级导航，侧栏统一由 `src/tabs/options/components/SettingsSidebar.tsx` 渲染：

- 基本设置：`GeneralPage`
- 外观主题：`AppearancePage`
- 功能模块：`FeaturesPage`
- 站点设置：`SiteSettingsPage`
- 适配中心：`SitePacksPage`
- 快捷键位：`ShortcutsPage`
- 数据与权限：`BackupPage`
- 关于：`AboutPage`

全局搜索已并入功能模块页的 tab；权限管理已并入数据与权限页的 tab。油猴脚本环境没有 Chrome permissions API，`platform.hasCapability("permissions")` 为 false 时隐藏权限 tab。

### 2.2 独立 Options 页面

`src/tabs/options.tsx` 使用同一份导航定义与顺序。独立页面检测不到内容脚本中的 `__ophelThemeManager` 时，会隐藏外观主题入口；油猴脚本环境隐藏数据与权限页内的权限 tab。

### 2.3 窄屏两级导航

视口不超过 `SETTINGS_COMPACT_MEDIA_QUERY`（640px，定义在 `src/constants/ui.ts`）时，两个入口都由 `useSettingsCompactNav()` 切换为全屏单栏：

- 导航屏：侧栏全宽，每项右侧带进入箭头；设置弹窗右上角保留关闭按钮，不提供最大化。
- 页面屏：顶部 `SettingsCompactBar`（返回）加页面内容；设置行放不下「说明 + 控件」时控件换到下一行。
- 设置弹窗每次关闭时复位到导航屏；外部导航请求（深链、设置搜索、`ophel:navigateSettingsPage`）直接进入页面屏。独立页 URL 带 `page` 参数时同样直接进入页面屏。
- 布局只认 JS 挂载的 `.is-compact` 与 `data-compact-pane`，断点不在 CSS 里重复定义。

### 2.4 深链与设置搜索

- 深链解析集中在 `src/constants/ui.ts` 的 `resolveSettingsNavigateDetail()`。
- 设置搜索索引使用同文件中的 `SETTING_ID_ROUTE_MAP`、`SETTING_ID_ROUTE_RULES`、`SETTING_ID_ALIASES` 和 `SETTINGS_SEARCH_ITEMS`。
- 新增或移除设置项时，必须同步设置项的 `settingId`、路由规则、搜索索引、i18n 文案和页面控件。

## 3. 页面组件分工

- `GeneralPage`：语言、面板行为、快捷按钮、工具箱菜单。
- `FeaturesPage`：大纲、对话、提示词、标签页行为、提醒、内容增强、阅读历史和用量统计。
- `SiteSettingsPage`：站点选择器（内置站点 + 当前社区适配包实例，面板内当前站点置顶；选中非当前站点时，选择器栏常驻一行说明）+ 选中站点的聚合设置视图，按「页面布局 / 模型锁定 / 专属设置」三个分组，每组一个分组标题加一张卡，卡内不再重复标题。页面布局是一张卡：智能避让在首行，其后是页面宽度、用户问题宽度、禅模式、净化模式，Gemini 另有自动隐藏输入框；宽度滑块与「显示退出按钮」是缩进在上级开关下方的从属行（`SettingRow` 的 `has-sub` / `is-sub`），上级开关关闭时从属行置灰、点击提示先开启。布局类设置按站点 key 存储，未单独配置的站点读取时回退到 `_default` 兜底值（写入走 `buildSiteLayoutPatch`，存储结构不变）；模型锁定仅展示当前选中站点的一行配置；Gemini / AI Studio / ChatGPT 的专属设置分别是 `GeminiSettings` / `AIStudioSettings` / `ChatGPTSettings`，Claude 为 `ClaudeSettings`。深链的 `subTab` 直接承载站点 id；`site-settings-layout`、`site-settings-model-lock` 是供设置搜索定位的分组锚点。
- `SitePacksPage`：按 `SITE_PACKS_TAB_IDS` 分为四个 tab——内置站点（启停、跳转站点设置）、已安装（启停/卸载/检查更新）、自定义站点（自定义 origin、自动识别、油猴 @match 补充）、获取与更新（页首更新状态条：自动更新、上次检查与立即检查；在线适配库，标题栏含搜索与本地 JSON 导入；默认折叠的「高级」：内置配置补丁导入与回滚）。深链定位到折叠区内的设置项时，`scrollWithinSettingsContent` 会先展开所在的 `<details>`。两处“检查更新”是同一操作（全量检查并同步所有在线适配库包，检查即更新）；不设单包刷新按钮——它实际也是全量检查，语义有误导。适配配置更新原先位于基本设置，已并入此页。
- `ShortcutsPage`：快捷键总开关、全局 URL 和各动作绑定。
- `AppearancePage`：主题同步、预置主题和自定义样式。
- `BackupPage`：本地备份/恢复、WebDAV 配置与同步操作，以及权限 tab（`PermissionsPage`，扩展权限状态与可选权限申请/撤销）。
- 全局搜索设置（触发方式、模糊搜索、提示词回车行为）是 `FeaturesPage` 的一个 tab，不再是一级页面。

## 4. 设置数据流

- 默认值定义在 `src/utils/storage.ts` 的 `DEFAULT_SETTINGS`。
- 运行时状态由 `src/stores/settings-store.ts` 管理，使用 Zustand persist 写入平台存储。
- 扩展端使用 `chrome.storage.local`；油猴端使用平台存储适配器，GM API 的同步读取不要包成 Promise。
- `settings-store.ts` 监听跨上下文 storage 变化，并通过 `_syncVersion` 触发 UI 更新。
- 旧数据兼容集中在 `normalizeSettings()`：旧快捷按钮字段会迁移到 `quickButtons`；已移除的未实现设置不应继续进入当前设置结构。
- `SitePacksPage` 不进入设置 store：已安装包继续由 `PackManager` 读写 `sitepacks/installed`，在线适配库继续使用 `sitepacks/remote-state`，两者通过平台存储接口兼容扩展与油猴脚本。

## 5. 样式与主题约束

- 设置页共享样式放在 `src/styles/settings.css`；独立页面额外通过 `src/tabs/options.css` 引入基础主题变量。
- 面板内设置弹窗样式必须通过 `src/contents/ui-entry.tsx` 的 `getStyle()` 注入 Shadow DOM。
- 颜色、边框、阴影和交互态优先使用 `--gh-*` 主题变量。
- 新增样式文件时，必须确认扩展 Shadow DOM 和独立 Options 页面是否都需要引入。
- 不要在设置页组件中新增大段内联样式；必要的运行时几何值除外。

## 6. 权限管理

- Content Script 不能直接调用 `chrome.permissions.request`。
- 设置弹窗发出权限请求时，Background 打开独立权限请求窗口。
- Options/权限请求页在扩展上下文中触发 Chrome 原生授权弹窗。
- 权限撤销后，Background 负责关闭依赖该权限的功能并同步 storage。

## 7. 平台差异

- 扩展端和油猴端共享大部分设置 UI，但权限、通知、跨域请求和默认开关可能不同。
- 油猴端保存 SitePack 自定义域名后，会根据 `GM_info` 的有效匹配规则列出尚未覆盖的 origin，并引导用户在脚本管理器中添加持久化的用户匹配；扩展端继续走权限申请与动态注册。
- 通知和部分 AI Studio 内容增强默认值会根据 `isUserscriptPlatform()` 分支确定。
- 文档中的 `settings-schema.json` 以扩展端默认值为静态示例；油猴端差异以源码中的 `DEFAULT_SETTINGS` 平台分支为准。

## 8. 修改清单

设置 UI 变更至少检查：

1. `src/utils/storage.ts` 的类型与 `DEFAULT_SETTINGS`
2. `src/stores/settings-store.ts` 的归一化和旧数据兼容
3. 对应 `src/tabs/options/pages/*` 页面控件
4. `src/constants/ui.ts` 的设置深链、别名和搜索索引
5. `src/locales/*/index.ts` 的 11 种语言文案
6. `docs/developer/settings-schema.json`
7. 涉及样式时检查 `DESIGN.md`、`src/styles/settings.css`、`src/tabs/options.css` 和 `src/contents/ui-entry.tsx`
