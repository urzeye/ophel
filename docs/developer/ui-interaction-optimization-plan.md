# Ophel Atlas UI / 交互 / 布局 / 样式系统优化技术方案

## 1. 方案背景与设计读取 (Design Read)

- **产品定位**：高频 AI 对话工作流浏览器扩展/脚本工具，非展示型营销页。
- **设计模式**：`preserve` 模式（严格遵循 [`DESIGN.md`](../../DESIGN.md)）。保留现有信息架构、路由与业务逻辑，全面升级视觉层级、操作反馈、主题表达与代码规范。
- **核心强度参数**：`DESIGN_VARIANCE = 5`, `MOTION_INTENSITY = 4`, `VISUAL_DENSITY = 6`。
- **实施范围说明**：
  - **排除项**：独立 Options 页面（`src/tabs/options.tsx`）保持不变，不作为本次重点。
  - **核心范围**：
    1. **设置弹窗子页面布局与交互重构**（`BackupPage`, `ShortcutsPage`, `PermissionsPage`, `GeneralPage`, `AboutPage`）。
    2. **主面板 MainPanel (Shadow DOM) 与三大 Tab 交互排版升级**（Header/Footer, `OutlineTab`, `PromptsTab`, `ConversationsTab`）。
    3. **样式与交互系统规范化清理**（消除 JSX 内联样式、统一 `--gh-*` 主题变量、标准化 focus-visible / active 动效）。
    4. **约束保留**：关于页面 `about-slogan-badge` 中的 `✨` 装饰 emoji 明确保留。

---

## 2. 详细技术方案

### 2.1 模块一：设置子页面交互与布局重构

#### A. 备份与数据管理页面 (`BackupPage.tsx`)
- **Tab 分组化重构**：
  - 引入 [`TabGroup`](../tabs/options/components/TabGroup.tsx)，拆分为两个二级标签页：
    1. `local` (本地备份)：数据导出、数据导入、清除所有数据（危险区）。
    2. `webdav` (WebDAV 云同步)：服务商预设选择、连接表单、连接测试、远端备份文件列表与恢复。
  - 支持 `initialTab` 路由直达，保持与 `SiteSettingsPage` / `AppearancePage` / `FeaturesPage` 一致的粘性毛玻璃吸顶体验。
- **内联样式全面抽离**：
  - 抽离数据导入确认框、数据预览文本域、WebDAV 操作按钮工具栏到 `src/styles/settings.css`，命名为 `.settings-backup-*` 类。

#### B. 快捷键位设置页面 (`ShortcutsPage.tsx`)
- **快捷键录制组件升级 (`ShortcutInput`)**：
  - 移除所有内联 `style={{ ... }}`，抽离为 `.settings-shortcut-input`、`.settings-shortcut-recording`、`.settings-shortcut-btn`。
  - 录制中增加平滑的边框微光反馈（`outline: 2px solid var(--gh-primary); background: var(--gh-primary-light-bg)`）。
- **按键标签化视觉排版 (`<kbd>`)**：
  - 将纯文本快捷键（如 `Ctrl + Shift + K`）格式化渲染为语义化 `<kbd className="settings-kbd">` 标签结构，统一字重与背景，增强扫读识别度。
- **浏览器扩展快捷键指南与重置按钮样式规范化**：
  - 统一下方重置默认按钮与外链跳转按钮的工具栏布局，抽离为 `.settings-shortcuts-footer`。

#### C. 权限管理页面 (`PermissionsPage.tsx`)
- **SVG 图标替代 Emoji**：
  - 移除硬编码 emoji（`💾`, `🔔`, `🍪`, `☁️`），改用 `src/components/icons` 内的标准 SVG 图标：
    - `storage` -> `SaveIcon`
    - `notifications` -> `NotificationIcon` (或 `BellIcon`)
    - `cookies` -> `CookieIcon` (或 `PageContentIcon`)
    - `webdav` -> `CloudIcon`
- **状态徽标（Badge）规范化**：
  - 替换内联样式 `background: "rgba(16, 185, 129, 0.1)", color: "#10b981"` 为 `.settings-status-badge.is-success` 与 `.settings-status-badge.is-danger`，使用 `--gh-success`、`--gh-danger`、`--gh-text-secondary` 语义变量，确保 24 套深浅色主题下对比度合规。

#### D. 基本设置页面 (`GeneralPage.tsx`) 拖拽项规范化
- **消除拖拽虚线违规项**：
  - 将 [`SortableItem`](../tabs/options/pages/GeneralPage.tsx) 拖拽中的 `1px dashed var(--gh-primary)` 替换为 `DESIGN.md §10` 允许的实线高亮 + 半透明背景 + 投影抬升（`.settings-sortable-item.is-dragging`）。
  - 将手柄与拖拽容器的内联样式迁移至 `src/styles/settings.css`。

#### E. 关于页面 (`AboutPage.tsx`) 样式类化与触感统一
- 保留 `about-slogan-badge` 中的 `✨` 装饰 emoji。
- 将各平台卡片、赞助卡片、社区卡片和徽章的内联 `style={{ ... }}` 整理收敛至 `src/styles/settings.css`。
- 统一卡片 `:hover` 位移为 `translateY(-2px)` 与柔和阴影，避免不同卡片浮动高度不一。

---

### 2.2 模块二：主面板 MainPanel (Shadow DOM) 与三大 Tab 交互排版升级

#### A. MainPanel 框架与 Header/Footer 触感
- **Header 区域层级与 Focus 环**：
  - 明确拖拽区（Grab 区域）与按钮点击区的视觉分隔，避免触发误判；
  - 统一 Header 按钮（模式切换、主题切换、新标签页、设置、最小化）的 `:focus-visible` 样式。
- **Footer 底部动作按钮触感**：
  - 为置顶、置底、锚点跳转按钮增加统一的 `:active` 态（`transform: scale(0.96)`，`transition: transform 120ms ease`）。
  - 锚点按钮禁用状态保持语义化低透明度与 `cursor: not-allowed`。

#### B. 大纲 Tab (`OutlineTab.tsx`)
- **层级树视觉缩进参考线 (Indentation Guide Lines)**：
  - 对 H1 ~ H4 多层标题增加左侧微细参考线（`1px solid color-mix(in srgb, var(--gh-border) 60%, transparent)`），在悬停父级节点时参考线高亮，提升超长复杂大纲结构的可读性。
- **当前阅读位置高亮条**：
  - 正在阅读的标题项增加左侧 3px 胶囊形高亮指示条，文字对比度适度增强，符合 `DESIGN.md §5.2`。

#### C. 提示词 Tab (`PromptsTab.tsx`)
- **搜索框增强**：
  - 增加内容清除按钮（Clear Icon），带平滑渐入渐出动效；
  - 快捷标签栏（Tag Filter Pills）增加激活态（Active）与悬停态（Hover）微动效。
- **提示词卡片操作栏平滑过渡**：
  - 卡片 Hover 时操作按钮组使用 `opacity 150ms ease, transform 150ms ease`，避免弹出跳跃感。

#### D. 对话管理 Tab (`ConversationsTab.tsx`)
- **空状态体验升级**：
  - 优化文件夹与对话列表为空时的展示，增加引导性排版与快捷操作提示。
- **文件夹展开/折叠动效**：
  - 文件夹展开/收起时 Chevron 图标提供平滑旋转动效（`transform: rotate(90deg)`，`150ms ease`）。

---

### 2.3 模块三：样式与交互系统规范化清理 (Cleanup Checklist)

1. **内联样式清零 (Zero Inline Styles)**：
   - 严格遵循 `DESIGN.md §9.2`，JSX 中除动态运行时坐标（如拖拽位置、浮动菜单定位）外，一律使用 CSS 类名。
2. **24 套主题变量规范化**：
   - 全局替换散落的 Hex 颜色为语义变量：
     - 成功状态：`var(--gh-success, #10b981)`
     - 警告状态：`var(--gh-warning, #f59e0b)`
     - 危险状态：`var(--gh-danger, #ef4444)`
     - 强调色：`var(--gh-primary, #4285f4)`
     - 表面色：`var(--gh-bg)`, `var(--gh-bg-secondary)`, `var(--gh-card-bg)`
3. **交互状态完备性 (States Complete)**：
   - 确保所有可交互按钮、链接、卡片均具备 `default`、`:hover`、`:active`、`:focus-visible`、`disabled` 5 种状态。

---

## 3. 验收标准与测试矩阵 (Quality & Testing)

| 检查维度 | 验收标准 | 验证方式 |
| :--- | :--- | :--- |
| **主题兼容** | 24 套预置（12 浅色 + 12 深色）下，文字对比度合规、卡片无反相割裂、边框清晰 | 浅色/深色主题遍历切换冒烟 |
| **双平台构建** | 浏览器扩展与油猴脚本构建完全正常，无平台 API 泄漏 | `pnpm build` & `pnpm build:userscript` |
| **静态检查** | 无类型报错、无 ESLint / Prettier 警告 | `pnpm lint:check` & `pnpm typecheck` |
| **交互性能** | 动效流畅（150ms~250ms），无常驻 CPU 动画，支持 `prefers-reduced-motion` | 检查 CSS keyframes / transitions |
