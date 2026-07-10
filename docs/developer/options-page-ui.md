# Ophel Atlas 设置页与设置弹窗

> 最近校验：2026-07-10。设置弹窗与独立 Options 共用导航定义和页面组件；早期独立设计稿不再作为实现依据。

## 1. 当前入口

- `src/components/SettingsModal.tsx`：内容面板内的设置弹窗，运行在 Ophel Shadow DOM。
- `src/tabs/options.tsx`：独立 Options 页面，使用 `_default` 站点上下文。
- `src/constants/settings-navigation.ts`：两种载体共用的一级导航唯一来源。
- `src/tabs/options/pages/*`：两种载体复用的页面组件。
- `src/styles/settings.css`：设置 UI 共享样式。
- `src/tabs/options.css`：独立页面入口样式。
- `src/contents/ui-entry.tsx`：把设置样式注入内容面板 Shadow Root。

## 2. 共享导航结构

`SETTINGS_NAV_ITEMS` 固定包含九个一级入口：

1. 基本设置：`GeneralPage`
2. 外观主题：`AppearancePage`
3. 功能模块：`FeaturesPage`
4. 站点配置：`SiteSettingsPage`
5. 全局搜索：`GlobalSearchPage`
6. 快捷键位：`ShortcutsPage`
7. 数据管理：`BackupPage`
8. 权限管理：`PermissionsPage`
9. 关于：`AboutPage`

只有权限入口受 `platform.hasCapability("permissions")` 控制；油猴环境不展示 Chrome permissions 页面。独立 Options 不再隐藏外观、全局搜索或快捷键。缺少当前站点上下文时使用 `_default` 配置，不通过隐藏入口制造第二套信息架构。

## 3. 深链与设置搜索

- 深链解析集中在 `src/constants/ui.ts` 的 `resolveSettingsNavigateDetail()`。
- `SETTING_ID_ALIASES` 将旧设置路径映射到当前 `data-setting-id`。
- `SETTING_ID_ROUTE_MAP` 和 `SETTING_ID_ROUTE_RULES` 决定一级页面与二级 tab。
- 独立 Options 读取 `page`、`subTab`、`settingId` URL 参数；目标挂载后滚动到可视区并短时高亮。
- 全局搜索设置结果使用同一 `settingId` 和路由函数，不另建跳转表。

新增或移动设置项时，必须同步控件的 `data-setting-id`、路由/别名、搜索索引、11 种语言文案和旧数据兼容。

## 4. 响应式布局

`src/styles/settings.css` 提供整体断点：

- `<= 900px`：收窄侧栏与内容留白。
- `<= 720px`：侧栏改为顶部横向导航，页面转为单列；导航标签保持可扫读。
- `<= 640px`：设置行和局部控制进一步纵向排列，二级 tab 可横向滚动且不逐字折行。

完成标准：600 px 视口无页面或内容横向溢出，导航标签可完整读取，Switch 仍有可访问名称、可见 `focus-visible` 和足够点击区域。

## 5. 设置数据流

- 设置类型与默认值：`src/types/settings.ts`、`src/constants/default-settings.ts`，通过 `src/utils/storage.ts` 兼容导出。
- 运行时状态：`src/stores/settings-store.ts`，Zustand persist 写入平台存储。
- 扩展端：`chrome.storage.local`；油猴端：同步 GM 存储适配器。
- 跨上下文同步使用精确 persist write gate，只抑制外部 hydration 触发的同次回写，不使用时间窗口吞掉用户写入。
- 旧数据迁移集中在 `normalizeSettings()`；备份恢复还需检查 `ZUSTAND_KEYS`、`MULTI_PROP_STORES` 和 schema 兼容。

## 6. 样式、主题与可访问性

- 设置样式优先写入 `src/styles/settings.css`，颜色和状态使用 `--gh-*` 变量。
- 面板内设置弹窗依赖 `ui-entry.tsx` 的 Shadow DOM 注入；独立 Options 通过 `options.css` 使用同一默认 token。
- Switch 由原生 checkbox 承担语义，`ToggleRow`/`SettingRow` 提供 label 关联；视觉轨道必须呈现键盘焦点。
- 不在页面组件中创建 body portal、第二主题源或大段静态内联样式。
- 修改 UI 前阅读 `DESIGN.md`，默认使用 `preserve` 模式并同时验证浅色、深色和自定义主题。

## 7. 修改清单

设置 UI 变更至少检查：

1. `DEFAULT_SETTINGS`、Settings 类型、store action 与 normalize/migration。
2. 对应 `src/tabs/options/pages/*` 控件及 `data-setting-id`。
3. `src/constants/settings-navigation.ts` 与 `src/constants/ui.ts` 深链/搜索。
4. `src/locales/*/index.ts` 的 11 种语言文案。
5. 备份/恢复 schema、`docs/developer/settings-schema.json` 和平台默认值差异。
6. `src/styles/settings.css`、`src/tabs/options.css`、`src/contents/ui-entry.tsx` 注入链路。
7. `pnpm lint:check`、`pnpm typecheck`；UI 改动做 900/720/600 px 和键盘冒烟。
