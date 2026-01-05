# 代码重构建议

> 创建时间: 2026-01-04
> 最后更新: 2026-01-05
> 状态: ✅ 主要任务已完成

本文档记录了项目的重构计划与执行进度。

---

## 📊 代码量概览

| 文件                      | 行数      | 状态                |
| ------------------------- | --------- | ------------------- |
| `SettingsTab.tsx`         | 2476      | 🟡 暂缓（用户要求） |
| `themes.ts`               | 1912 → 8  | ✅ 已完成           |
| `locales/resources.ts`    | 1275 → 16 | ✅ 已完成           |
| `ConversationDialogs.tsx` | 1147      | ⚪ 已评估，暂不需要 |
| `conversation-manager.ts` | 1127 → 8  | ✅ 已完成           |

---

## ✅ 已完成

### 1. themes.ts - 数据与逻辑分离 ✅

**完成时间**: 2026-01-04

拆分到 `src/utils/themes/` 目录：

- `types.ts` - 类型定义
- `helpers.ts` - 工具函数
- `light/index.ts` - 亮色主题预置
- `dark/index.ts` - 暗色主题预置
- `index.ts` - 统一导出

原 `themes.ts` 保留为重导出层，保持向后兼容。

---

### 2. locales/resources.ts - 按语言拆分 ✅

**完成时间**: 2026-01-04

拆分为：

- `zh-CN/index.ts` - 简体中文
- `zh-TW/index.ts` - 繁体中文
- `en/index.ts` - 英文
- `resources.ts` - 统一导出

---

### 3. conversation-manager.ts - 职责分离 ✅

**完成时间**: 2026-01-04

拆分到 `src/core/conversation/` 目录：

- `manager.ts` - 核心管理逻辑
- `types.ts` - 类型定义
- `index.ts` - 统一导出

原 `conversation-manager.ts` 保留为重导出层。

---

### 4. 常量集中管理 ✅

**完成时间**: 2026-01-04

创建 `src/constants/` 目录：

- `defaults.ts` - 默认值常量
- `ui.ts` - UI 相关常量
- `index.ts` - 统一导出

---

## ⚪ 已评估，暂不需要

### ConversationDialogs.tsx

**评估时间**: 2026-01-05

**结论**: 暂不重构

**原因**:

1. 文件虽大（1147行）但结构清晰，有明确的分隔注释
2. 与 `ui/Dialog.tsx` 使用不同的样式系统，强行统一有较高 bug 风险
3. 不是开发热点，修改频率低
4. 投入产出比不高

---

### 适配器共享代码提取

**评估时间**: 2026-01-05

**结论**: 暂不实施

**可提取内容**:

- `getNetworkMonitorConfig()` - 两个 Gemini 适配器完全一致
- `getThemeColors()` - 返回相同的主题色

**原因**:

- 可提取代码量小（约 10-20 行）
- 投入产出比偏低
- 待未来支持更多 Gemini 变体时再考虑引入中间抽象类

---

## 🟡 暂缓

### SettingsTab.tsx

**状态**: 用户要求暂时忽略

**问题**: 单文件 2476 行，包含所有设置项

**建议方案**（待后续处理）:

- 按功能模块拆分到 `components/settings/` 目录
- 每个设置分组独立为一个组件

---

## 📋 结论

**主要重构任务已完成**，代码质量良好：

- ✅ 4 项重构已完成
- ⚪ 2 项已评估，暂不需要
- 🟡 1 项暂缓（SettingsTab）
