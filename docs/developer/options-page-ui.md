# Ophel Atlas 设置页与设置弹窗

本文档记录当前独立 Options 页和面板内设置弹窗的实际结构。涉及设置 UI 改动时，以本文件、`DESIGN.md`、`src/utils/storage.ts` 和对应页面源码为准。

## 1. 入口文件

- `src/components/SettingsModal.tsx`：内容脚本里的设置弹窗，渲染在 Shadow DOM 内，复用 `src/tabs/options/pages/*`。
- `src/tabs/options.tsx`：独立 Options 页入口（加载 `tabs/options.html`），用于独立窗口和权限请求场景。
- `src/tabs/options.css`：独立页样式入口，导入 `theme-variables.css`、`settings.css` 和 `release-notes.css`。
- `src/contents/ui-entry.tsx`：面板与设置弹窗的 Shadow DOM 样式入口；首屏样式走 `getStyle()`，`settings.css` 和 `release-notes.css` 经 `~utils/panel-lazy-styles` 以 `<link>` 懒加载。

## 2. 导航结构

### 2.1 一级导航

`SettingsModal.tsx` 与独立 Options 页共用 `src/tabs/options/settings-nav.ts` 的 `SETTINGS_NAV_ITEMS`，侧栏由 `src/tabs/options/components/SettingsSidebar.tsx` 渲染：

- 基本设置：`GeneralPage`
- 外观主题：`AppearancePage`
- 功能模块：`FeaturesPage`（含全局搜索 tab）
- 站点设置：`SiteSettingsPage`
- 适配中心：`SitePacksPage`
- 快捷键：`ShortcutsPage`
- 数据与权限：`BackupPage`（含权限管理 tab）
- 关于：`AboutPage`

平台与上下文裁剪：

- 油猴环境没有 Chrome permissions API，`platform.hasCapability("permissions")` 为 `false` 时隐藏权限 tab。
- 独立 Options 页检测不到内容脚本的 `__ophelThemeManager` 时，隐藏外观主题入口。

### 2.2 窄屏两级导航

视口不超过 `SETTINGS_COMPACT_MEDIA_QUERY`（`640px`，定义在 `src/constants/ui.ts`）时，`useSettingsCompactNav()` 把两个入口都切为全屏单栏：

- **导航屏**：侧栏铺满，每项右侧带进入箭头；设置弹窗右上角保留关闭按钮，不提供最大化。
- **页面屏**：顶部 `SettingsCompactBar` 返回按钮加正文；设置行放不下「说明 + 控件」时控件自动换行。
- **状态复位**：设置弹窗每次关闭都回到导航屏；外部深链、设置搜索、`ophel:navigateSettingsPage` 或独立页 URL 带 `page` 参数时直接进页面屏。
- 布局只认 JS 挂载的 `.is-compact` 与 `data-compact-pane`，不在 CSS 里重复写 `640px` 断点。

### 2.3 深链与设置搜索

- 深链解析集中在 `src/constants/ui.ts` 的 `resolveSettingsNavigateDetail()`。
- 搜索索引使用同文件中的 `SETTING_ID_ROUTE_MAP`、`SETTING_ID_ROUTE_RULES`、`SETTING_ID_ALIASES` 和 `SETTINGS_SEARCH_ITEMS`。
- 新增或移除设置项时，同步更新 `settingId`、路由规则、搜索索引、11 语种文案和页面控件。
- 设置项改名时：展示标题走 `SETTING_SEARCH_TITLE_KEY_MAP` 自动跟随本地化文案；`SETTINGS_SEARCH_ITEMS` 的中文 `title` 换新叫法，`keywords`（跨语言共用）追加新叫法并保留旧叫法作别名，保证老用户按旧名字也能搜到。

## 3. 各页面组件分工

- **`GeneralPage`**：语言、面板行为、快捷按钮、工具箱菜单。
- **`AppearancePage`**：主题同步、预置主题与自定义样式。
- **`FeaturesPage`**：大纲、对话、提示词、标签页行为、提醒、内容增强、阅读历史、全局搜索和用量统计。
- **`SiteSettingsPage`**：顶部站点选择器 + 选中站点的聚合视图：
  - 选择器包含内置站点与已安装社区适配包，面板内当前站点置顶；选中非当前站点时常驻一行提示。
  - 下方按「页面布局 / 模型锁定 / 专属设置」三组呈现，每组一个分组标题配一张卡，卡内不重复标题。
  - **页面布局卡**：依次是智能避让、页面宽度、用户问题宽度、禅模式、净化模式（Gemini 另有自动隐藏输入框）；宽度滑块与「显示退出按钮」通过 `SettingRow` 的 `has-sub` / `is-sub` 缩进在上级开关下方，上级关闭时置灰并在点击时提示先开启。布局配置按站点 key 存储，未单独配置时回退 `_default`（写入走 `buildSiteLayoutPatch`）。
  - **模型锁定**：只展示当前选中站点的一行配置。
  - **专属设置**：`GeminiSettings`、`AIStudioSettings`、`ChatGPTSettings`、`ClaudeSettings`。
  - 深链的 `subTab` 直接承载站点 id；`site-settings-layout`、`site-settings-model-lock` 是供搜索定位的分组锚点。
- **`SitePacksPage`**：按 `SITE_PACKS_TAB_IDS` 分四个 tab：
  - **内置站点**：启停与跳转站点设置。
  - **已安装**：启停、卸载、检查更新。
  - **自定义站点**：自定义 origin、自动识别、油猴 `@match` 补充提示。
  - **获取与更新**：顶部更新状态条（自动更新、上次检查、立即检查）、在线适配库（含搜索与本地 JSON 导入）、默认折叠的「开发者选项」（内置配置补丁导入与回滚）。
  - 深链定位到折叠区内部项时，`scrollWithinSettingsContent` 会自动展开祖先 `<details>`。两处“检查更新”本质都是全量检查并同步在线适配库，因此不设单包刷新按钮，避免语义误导。
- **`ShortcutsPage`**：快捷键总开关、全局 URL 与各动作绑定。
- **`BackupPage`**：本地备份/恢复、WebDAV 配置与定时同步，以及权限 tab（`PermissionsPage`）。

## 4. 设置数据流

- 默认值定义在 `src/utils/storage.ts` 的 `DEFAULT_SETTINGS`。
- 运行时状态由 `src/stores/settings-store.ts`（Zustand persist）管理，扩展走 `chrome.storage.local`，油猴走同步 GM 存储适配器（不要把同步读取包成 Promise）。
- `settings-store.ts` 监听跨上下文 storage 变化，通过 `_syncVersion` 刷新 UI；旧字段迁移集中在 `normalizeSettings()`。
- `SitePacksPage` 的数据不进设置 store：已安装包由 `PackManager` 读写 `sitepacks/installed`，在线适配库读写 `sitepacks/remote-state`，均走平台存储接口。

## 5. 样式、权限与平台差异

- **样式与主题**：共享样式写在 `src/styles/settings.css`，颜色与交互态优先用 `--gh-*` 变量；新增样式文件前确认扩展 Shadow DOM 与独立 Options 页是否都要加载；组件内不堆大段内联样式（运行时几何值除外）。
- **权限申请**：Content Script 不能直接调 `chrome.permissions.request`。设置弹窗发起申请时，Background 打开独立权限请求窗口触发浏览器原生弹窗；权限撤销后由 Background 关闭依赖功能并同步 storage。
- **油猴差异**：油猴保存 SitePack 自定义域名后，会根据 `GM_info` 的匹配规则列出未覆盖的 origin，提示用户在脚本管理器中添加持久 `@match`（扩展端走权限申请与动态注册）。部分通知和 AI Studio 默认值按 `isUserscriptPlatform()` 分支决定；`settings-schema.json` 以扩展端默认值为静态快照，油猴差异以 `DEFAULT_SETTINGS` 源码为准。

## 6. 改动检查清单

修改设置 UI 时，至少核对这 7 处：

1. `src/utils/storage.ts`（类型与 `DEFAULT_SETTINGS`）
2. `src/stores/settings-store.ts`（归一化与旧数据迁移）
3. `src/tabs/options/pages/*`（页面控件）
4. `src/constants/ui.ts`（设置深链、别名与搜索索引）
5. `src/locales/*/index.ts`（11 种语言文案）
6. `docs/developer/settings-schema.json`
7. 涉及样式时同步核对 `DESIGN.md`、`src/styles/settings.css`、`src/tabs/options.css`、`src/contents/ui-entry.tsx`
