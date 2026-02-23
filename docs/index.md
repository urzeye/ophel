---
layout: home

hero:
  name: Ophel
  text: AI 对话增强助手
  tagline: 覆盖大纲、会话、提示词、搜索、主题、快捷键、备份同步的统一增强工作台
  image:
    src: /logo.png
    alt: Ophel
  actions:
    - theme: brand
      text: 快速开始 →
      link: /zh/guide/getting-started
    - theme: alt
      text: 中文文档
      link: /zh/
    - theme: alt
      text: English
      link: /en/
    - theme: alt
      text: GitHub
      link: https://github.com/urzeye/ophel

features:
  - icon: "📑"
    title: "实时大纲导航"
    details: "实时解析对话结构并更新导航，支持章节定位、跟随模式与收藏管理。"
    link: "/zh/guide/features/outline"
    linkText: "查看详情"
  - icon: "💬"
    title: "会话管理"
    details: "支持文件夹、标签、置顶、筛选与批量操作，提升多会话组织与维护效率。"
    link: "/zh/guide/features/conversation"
    linkText: "查看详情"
  - icon: "✍️"
    title: "提示词库"
    details: "提供分类组织、变量模板、置顶排序、导入导出与双击发送等完整流程。"
    link: "/zh/guide/features/prompt"
    linkText: "查看详情"
  - icon: "🔎"
    title: "全局搜索"
    details: "通过 Ctrl/Cmd + K 或双击 Shift，统一检索大纲、会话、提示词与设置项。"
    link: "/zh/guide/enhancements"
    linkText: "查看详情"
  - icon: "🏷️"
    title: "标签页管理与通知"
    details: "支持自动重命名、生成完成通知、自动聚焦与隐私模式，提升多会话并行管理效率。"
    link: "/zh/guide/enhancements"
    linkText: "查看详情"
  - icon: "🕘"
    title: "阅读历史恢复"
    details: "记录会话阅读位置并自动恢复，支持保留周期配置与历史清理策略。"
    link: "/zh/guide/enhancements"
    linkText: "查看详情"
  - icon: "📤"
    title: "会话导出"
    details: "单会话支持 JSON、Markdown、TXT 导出，并可配置导出命名与内容选项。"
    link: "/zh/guide/enhancements"
    linkText: "查看详情"
  - icon: "🧪"
    title: "内容交互增强"
    details: "支持用户问题 Markdown 渲染，并提供 LaTeX 公式与 Markdown 表格复制。"
    link: "/zh/guide/enhancements"
    linkText: "查看详情"
  - icon: "🧰"
    title: "快捷按钮与工具箱"
    details: "提供快捷入口与工具菜单，支持排序、显示控制和常用动作快速触发。"
    link: "/zh/guide/enhancements"
    linkText: "查看详情"
  - icon: "⌨️"
    title: "快捷键系统"
    details: "提供多动作快捷键绑定与冲突检测，适配个人化高频操作流程。"
    link: "/zh/guide/shortcuts"
    linkText: "查看详情"
  - icon: "🖥️"
    title: "沉浸式布局控制"
    details: "支持宽屏、全屏与内容宽度控制，提升长上下文场景下的阅读连续性。"
    link: "/zh/guide/enhancements"
    linkText: "查看详情"
  - icon: "🔐"
    title: "滚动锁定"
    details: "在生成过程中保持阅读位置稳定，避免自动跳底干扰当前上下文。"
    link: "/zh/guide/enhancements"
    linkText: "查看详情"
  - icon: "🎨"
    title: "预置主题系统"
    details: "内置 24 套主题，支持浅色/深色/系统模式，并可叠加自定义 CSS。"
    link: "/zh/guide/appearance"
    linkText: "查看详情"
  - icon: "🤖"
    title: "模型锁定"
    details: "支持多站点模型关键词锁定，进入页面后可自动切换到目标模型。"
    link: "/zh/guide/enhancements"
    linkText: "查看详情"
  - icon: "🧩"
    title: "Markdown 渲染修复"
    details: "针对 Gemini、ChatGPT、AI Studio 的典型渲染问题提供兼容修复。"
    link: "/zh/guide/enhancements"
    linkText: "查看详情"
  - icon: "🔑"
    title: "Claude Session Key 管理"
    details: "支持 Session Key 的导入、校验、切换与状态管理，适配多账号轮换。"
    link: "/zh/guide/enhancements"
    linkText: "查看详情"
  - icon: "🖼️"
    title: "Banana 去水印"
    details: "提供图像水印移除能力，优化生成图片的可用性与后续复用体验。"
    link: "/zh/guide/enhancements"
    linkText: "查看详情"
  - icon: "☁️"
    title: "数据同步与隐私控制"
    details: "支持 WebDAV 备份/恢复、按需授权、本地优先存储与隐私模式。"
    link: "/zh/guide/privacy"
    linkText: "查看详情"
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #4285f4 30%, #ea4335);
  --vp-home-hero-image-background-image: linear-gradient(-45deg, #4285f4 50%, #ea4335 50%);
  --vp-home-hero-image-filter: blur(44px);
}

.VPHome .VPHero {
  padding-top: calc(var(--vp-nav-height) + var(--vp-layout-top-height, 0px) + 14px) !important;
  padding-bottom: 10px !important;
}

.VPHome .VPHero .name,
.VPHome .VPHero .text {
  max-width: none !important;
  line-height: 1.08 !important;
  font-size: clamp(32px, 3.4vw, 44px) !important;
}

.VPHome .VPHero .tagline {
  max-width: 960px !important;
  padding-top: 8px !important;
  line-height: 1.4 !important;
  font-size: clamp(15px, 1.05vw, 17px) !important;
}

.VPHome .VPHero .actions {
  margin: -4px !important;
  padding-top: 8px !important;
}

.VPHome .VPHero .action {
  padding: 4px !important;
}

@media (min-width: 960px) {
  .VPHome .VPHero .image {
    display: none !important;
  }

  .VPHome .VPHero .main,
  .VPHome .VPHero.has-image .main {
    width: 100% !important;
    max-width: none !important;
  }

  .VPHome .VPHero.has-image .container {
    text-align: left !important;
  }
}

.VPHome .VPHomeFeatures {
  padding-top: 8px !important;
  padding-bottom: 0 !important;
}

.VPHome .VPFeatures .container {
  max-width: 1440px !important;
}

.VPHome .VPFeatures .items {
  display: grid !important;
  margin: 0 !important;
  gap: 12px !important;
  align-items: stretch;
}

.VPHome .VPFeatures .item {
  width: auto !important;
  min-width: 0;
  padding: 0 !important;
}

.VPHome .VPFeature {
  height: 100% !important;
  border-radius: 14px !important;
}

.VPHome .VPFeature .box {
  height: 100% !important;
  padding: 16px 16px 14px !important;
  border: 1px solid var(--vp-c-divider) !important;
}

.VPHome .VPFeature .icon {
  width: 38px !important;
  height: 38px !important;
  margin-bottom: 10px !important;
  font-size: 22px !important;
}

.VPHome .VPFeature .title {
  margin: 0 !important;
  line-height: 1.22 !important;
  font-size: 16px !important;
  font-weight: 600;
  white-space: normal;
}

.VPHome .VPFeature .details {
  display: -webkit-box;
  overflow: hidden;
  padding-top: 8px !important;
  line-height: 1.36 !important;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  font-size: 13px !important;
  color: var(--vp-c-text-2);
}

.VPHome .VPFeature .link-text {
  margin-top: 8px !important;
  font-size: 12px !important;
}

@media (min-width: 1400px) {
  .VPHome .VPFeatures .items {
    grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
    grid-template-rows: repeat(3, minmax(0, 1fr)) !important;
    height: clamp(500px, calc(100svh - 280px), 660px);
  }
}

@media (min-width: 1100px) and (max-width: 1399px) {
  .VPHome .VPFeatures .items {
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
    grid-template-rows: repeat(4, minmax(0, 1fr)) !important;
    height: clamp(560px, calc(100svh - 260px), 760px);
  }

  .VPHome .VPFeature .title {
    font-size: 15px !important;
  }
}

@media (min-width: 760px) and (max-width: 1099px) {
  .VPHome .VPFeatures .items {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    grid-template-rows: repeat(6, minmax(0, 1fr)) !important;
    height: auto;
  }
}

@media (max-width: 759px) {
  .VPHome .VPFeatures .items {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    grid-template-rows: auto !important;
    height: auto;
  }

  .VPHome .VPFeature .title {
    font-size: 15px !important;
  }

  .VPHome .VPFeature .details {
    -webkit-line-clamp: 3;
  }
}
</style>
