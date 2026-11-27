# 对话导出：格式选型与图片渲染

本文记录 [Issue #1073](https://github.com/urzeye/ophel/issues/1073) 的需求、格式选型、体积测量、跨平台约束和实现边界。测量基线为 2026-11-26、Ophel 1.3.6、commit `9f96dcd67`；后续以实际构建输出为准。

## 结论与优先级

1. 优先图片：单条／多段回答的分享需求明确，轻量截图库足够；主要成本是资源准备、公式／图表、分页和跨浏览器验证。
2. PDF 优先考虑浏览器打印／另存 PDF：复用文档视图，不增加 PDF 引擎。若要求直接下载 PDF Blob，另行评估。
3. DOCX 后置：面向可编辑文档，优先 Markdown token 映射到原生 Word 组件；不要把网页截图放进 Word 当作完整支持。

本次实现图片导出；PDF、DOCX 不添加占位入口。复用消息、资源和文档准备能力，为未来格式保留明确的数据边界。

## 需求与产品取舍

Issue 希望单条或多条回答导出 PNG／JPG，保留 Markdown、代码高亮、LaTeX、表格、Mermaid 和图片；图片复制、主题、品牌署名是增强能力。

采用 Ophel 统一分享排版，而非承诺逐像素复刻各 AI 站点。这样 API 历史和 DOM 采集得到的完整消息都能导出，也不依赖虚拟列表是否挂载。严格复制原站样式需要另一条 DOM 克隆路径，并承担站点 CSS、Shadow DOM、虚拟滚动和界面变更的维护成本。

导出视图是 Operate／Read 界面，继承根目录 DESIGN.md。设置与预览分区，主操作清晰；成品使用舒适行宽、正文间距、代码排版和原生图表。默认品牌页脚由现有 Logo、`Powered by Ophel Atlas` 和 `ophel.app` 构成，允许关闭。每张分图重复品牌页脚，不用遮盖正文的平铺水印。

## 现有代码基础

- `src/utils/exporter.ts`：统一消息、元数据、附件、HTML／Markdown／JSON／TXT、Blob 下载和 ZIP 写入。
- `src/core/conversation/manager.ts`：历史采集、API／DOM 路由、导出生命周期、思考内容选项、分段数据。
- `src/utils/markdown.ts`：markdown-it、highlight.js 和公式插件。
- `src/core/assistant-mermaid-renderer.ts` 与 `assets/assistant-mermaid-runner.js`：现成 Mermaid 运行时、SVG 和 PNG 处理。
- `src/platform/`：扩展／油猴的网络、资源和依赖加载差异。

原有 HTML 导出已有明暗主题、MathML 和打印 CSS，但 Mermaid 代码块不会自动变成图；横向滚动的表格、代码和公式也不能原样截图，否则会漏内容。原有分段草稿没有附件集合；选中图片目的地后，重新采集带附件的快照并核对分段结构，避免改变原有分段 Markdown 的链接。

## 体积基线与测量方法

| 生产产物 | 基线 |
| --- | ---: |
| 油猴主脚本 UTF-8 字节数 | 1,832,234 |
| 项目字节闸门 | 1,950,000 |
| 距离项目闸门 | 117,766，约 118 KB |
| Chrome 扩展未压缩文件合计 | 14,765,023 |
| Chrome 扩展 ZIP | 4,744,909 |

仓库将 2,000,000 字节作为保守限制；Greasy Fork 公开源码使用 `MAX_CODE_LENGTH = 2.megabytes` 和字符串长度校验，不能混淆字节数与字符数。本项目继续遵守更严格的 1,950,000 字节闸门。Chrome 商店 ZIP 上限为 2 GB，当前更实际的约束是下载、解析和每个页面的运行开销。

候选库在仓库外以 Vite 7.3.1、Terser 5.46.0、ES2022、IIFE、`inlineDynamicImports: true`、保留实际使用入口测量。KB 按 1,000 字节计。结果是独立构建基准，不是集成后的精确增量；gzip 仅供传输大小参考，不能拿来判断油猴主脚本是否触闸。

| 库与入口 | 未 gzip 的压缩 JS | gzip |
| --- | ---: | ---: |
| html-to-image 1.11.13，toBlob | 13.2 KB | 5.1 KB |
| modern-screenshot 4.7.0，domToBlob | 24.2 KB | 9.3 KB |
| html2canvas 1.4.1 | 199.1 KB | 46.0 KB |
| docx 9.16.0，最小文档生成 | 168.2 KB | 46.8 KB |
| docx，常用组件和 LaTeX 转换 | 236.3 KB | 69.1 KB |
| docx 与 docx/html | 529.4 KB | 156.4 KB |
| jsPDF 4.2.1，默认入口 | 766.0 KB | 229.6 KB |
| pdf-lib 1.17.1，创建文档并写文本 | 425.4 KB | 176.2 KB |
| pdfmake 0.3.15，不含字体 | 840.8 KB | 307.9 KB |
| pdfmake 自带字体包 | 855.0 KB | 465.3 KB |
| fflate 0.8.3，仅 zipSync | 8.7 KB | 4.4 KB |

jsPDF 的默认构建会包含可选能力的依赖，不能将上表当成精简专用 PDF 构建的理论下限。程序生成中文文字 PDF 还要处理字体、字形覆盖和分页；自带西文字体不等于完整中文支持。当前 ZIP 已有实现，不需要再为了打包引入 fflate／JSZip。

## 图片库与视觉质量

首选 html-to-image：指定版本、体积小，能将排好版的 DOM 经 SVG／Canvas 转为 PNG／JPG。modern-screenshot 是可替换候选，支持进度、上下文复用等控制，最终应由同一套复杂内容在目标浏览器里的结果决定是否更换。两者不要同时引入。html2canvas 自行重绘 CSS，存在样式支持范围限制，当前不优先。

美观主要来自模板，而非库名：字体层级、45–75ch 左右的阅读宽度、正文节奏、代码可读性、主题对比和品牌页脚。PNG 适合文字；JPG 可压缩照片较多的分享内容。像素倍率受尺寸和总像素预算控制。

没有必要引入单独的水印库：品牌页脚作为文档内容一起截图即可，Logo 复用 `assets/icon.png` 和平台资源 URL，不重复塞入 Base64 字符串。装饰性水印也可用 DOM 或 Canvas 叠加，但不以遮盖正文作为默认视觉。

## 在线引入与跨平台策略

| 方式 | 油猴 | 扩展 |
| --- | --- | --- |
| 固定版本 CDN @require | 推荐，沿用现有模式并校验完整性 | 不适用 |
| 点击后插入 CDN script | 受 CSP、执行上下文和网络影响 | 不能作为常规 MV3 依赖加载方案 |
| 随包分发的本地库 | 会增加主脚本；普通动态 import 最终仍被内联 | 推荐；大功能可考虑独立导出页 |
| 远程导出页／隔离 iframe | 可以另行设计 | Chrome 有隔离上下文例外，但仍需审查功能与数据边界；不是普通 CDN 替代 |

油猴使用固定版本的浏览器发行文件，例如 `https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js`，通过编译期平台包装读取全局对象。`@require` 缩小主文件，不消除库的下载、缓存和每次脚本运行前执行的成本，也不是点击导出时才执行。

现成浏览器发行包大小与裁剪构建不同：html-to-image 约 20.6 KB，modern-screenshot 约 29.3 KB；docx 主 IIFE 约 1.06 MB，再加 HTML 和公式模块约 1.72 MB。未来 DOCX 更适合分发只暴露所需 API 的 vendor，而不是整套直接 @require。

扩展必须随包分发导出库，不执行 CDN JavaScript。Firefox 也要求自包含。不要通过 eval／new Function 执行下载代码，或放宽宿主页 CSP。仓库已有 Parcel 内容脚本异步 chunk 执行上下文的历史限制；较大的未来导出能力可放在独立扩展页面。

## PDF 方案

浏览器打印／另存 PDF 不增加生成库，复用排版与系统字体，正文通常可搜索复制，但会出现系统打印界面；`window.print()` 不返回 PDF Blob。

直接下载 PDF 有两条路线：图片分页写入 PDF 容易复用截图，但文字不可搜索、文件较大；文字／矢量 PDF 则需要独立处理布局、分页、表格、字体和公式。第一阶段无需引入 jsPDF／pdfmake。

现有打印 CSS 后续还需验证长回答分页、表格表头、代码换行、折叠内容、图表和资源等待，不依赖导出 HTML 的内联脚本在扩展环境执行。

## DOCX 方案

推荐 Markdown token 映射到 docx 原生组件：标题、段落、列表、表格、链接、代码和图片行为显式，公式可使用 docx/math 的 latexToMath。Mermaid 转为图片嵌入，不声称图表在 Word 中原生可编辑。

docx/html 已支持 HTML 转段落、表格、图片和原生公式，接入代码较少，但依赖更大，也不是完整浏览器 CSS 布局引擎；非 data URL 图片仍需调用方提供字节，并处理转换警告。

可用现有 ZIP 手写有限 OOXML，免新增依赖，但样式、列表编号、图片关系和公式会成为项目自己的维护责任。仅在明确接受有限格式时考虑。旧 html-docx-js 使用 altChunk，其项目说明 LibreOffice 和 Google Docs 不支持，不推荐。

## 代码量与工期估算

以下是分析阶段估算，不是承诺或实测代码增量；不含第三方代码、翻译和测试。共享部分不应重复累计。

| 功能 | 难度 | 新增自有代码 | 投入 |
| --- | --- | ---: | ---: |
| 图片，统一分享排版 | 中高 | 700–1,400 行 | 4–8 人日 |
| 打印／另存 PDF | 低至中 | 150–350 行 | 1–2 人日 |
| DOCX，token 映射和公式 | 中高 | 600–1,200 行 | 5–10 人日 |
| DOCX，官方 HTML 转换 | 中 | 300–700 行 | 3–6 人日 |

## 实现与验证计划

1. 保留统一消息／元数据／附件的数据契约，图片格式进入现有整篇和分段导出流程。
2. 共用文档渲染和资源准备；公式使用现有数学渲染，Mermaid 使用现有运行时，图片通过现有平台资源通道内嵌。资源失败必须明确报错，不生成静默缺图的成功结果。
3. 图片层默认生成一张完整长图；超出当前清晰度的安全预算时提供降低清晰度或自动分图的明确操作。用户选择分图后再按内容断点有界捕获，每张保留品牌页脚。
4. 预览弹窗提供格式、主题和品牌选择，明确准备／生成／失败／完成状态；支持下载及可用时的 PNG 复制。取消时清理 DOM、URL、事件和异步任务。
5. 11 种语言同步文案。验证单段／多段、思考内容、表格、代码、LaTeX、Mermaid、图片、长内容、空内容、资源失败、重复操作和窄屏。
6. 运行针对性测试、typecheck、相关格式和 lint 检查、Chrome／Firefox／油猴构建；记录实际油猴增量，实际查看界面和图片。

未来 PDF 接入准备好的文档视图；DOCX 接入统一消息与准备好的资源。无需提前引入插件注册器或通用转换框架。

## 当前图片实现

- `src/utils/export-document.ts` 定义 `ExportDocumentInput`，保留消息、元数据和附件快照；复用 HTML 排版、MathML 和已有资源获取通道，准备独立 Shadow DOM 文档。
- `src/utils/mermaid-runtime.ts` 为页面增强与导出共用脚本加载和请求协议。运行时串行处理主题初始化与渲染，导出使用原生 SVG 标签，避免两种主题并发互相污染。
- `src/utils/export-image-layout.ts` 规划分图；`src/utils/export-image.ts` 负责捕获和编码。提供 640／800／1000 CSS px 宽，默认 800；支持 1×／2× 分辨率，默认单张长图。每张最多 16,000,000 像素、最长边 16,000 px；自动分图按实际页眉、外观留白、品牌和水印页脚计算正文可用高度，最多 64 张；不再使用固定 3,200 CSS px 阈值，不自动降低清晰度或静默拆图。
- `src/components/ImageExportDialog.tsx` 提供 PNG／JPG、自动／浅／深色、分辨率、内容与排版控制、水印、预览缩放、尺寸与文件体积、下载及单张 PNG 复制；控制项由 `ImageExportControls.tsx` 渐进展开。多图通过现有 ZIP 写入器下载；关闭未保存的预览属于取消，不提示导出失败。
- `src/platform/image-capture.ts` 随扩展打包 html-to-image；油猴编译期别名读取固定版本的 `@require` 全局，SRI 从安装包实际字节计算。
- 使用系统字体，不为截图加载新字体，也不等待宿主页无关的网络字体。成品正文提供 14／16／18px，默认 16px，代码和表格字号按比例变化；控制界面沿用现有弹窗字体层级。
- 避开 html-to-image 1.11.13 的 `toBlob()` 未传递编码选项的问题：捕获 Canvas 后显式调用原生编码器，校验 MIME。Firefox 替换已加载图片的 src 后立即 decode 可能检查旧请求，改为监听新资源的加载完成并检查有效尺寸。

手动烟测入口：`pnpm exec vite --config tests/image-export.vite.config.ts`，打开 `http://127.0.0.1:4178/tests/fixtures/image-export.html`。该夹具使用实际导出组件、KaTeX、Mermaid、图片资源与编码器，仅替代扩展后台网络传输。

已在 Chromium 与 Firefox 检查复杂内容的浅深色 PNG、真实 JPG 编码、品牌切换、长内容多图 ZIP、390px 视口、错误提示及恢复；同时验证分图无间隙／重叠、11 种语言占位符、ZIP CRC 和临时渲染节点清理。测试夹具不替代各站点登录态下的附件权限和宿主页 CSP 验证。

首次图片实现（commit `8a7214664`）的生产构建基线：

| 指标 | 结果 | 相对基线 |
| --- | ---: | ---: |
| 油猴主脚本 | 1,859,164 字节 | +26,930 字节，约 +1.47% |
| 项目闸门剩余 | 90,836 字节 | 闸门未调整 |
| Chrome 扩展 ZIP | 4,771,177 字节 | +26,268 字节 |
| Chrome 扩展未压缩文件 | 14,854,715 字节 | +89,692 字节 |

`pnpm format:check`、`pnpm lint:check`、`pnpm typecheck`、19 个 Vitest 用例及 Chrome／Firefox／油猴生产构建通过；Lint 保留仓库既有的 110 条警告，没有错误。27 个油猴自托管资产的本地摘要与元数据一致，新增 html-to-image CDN 文件已与安装包逐字节核对，SRI 一致。

`pnpm verify:userscript-assets <40-char-commit-sha>` 是发布后的 CDN 核验，需要 `userscript-assets` 分支的发布提交。本次只创建功能分支，不发布资产，因此不执行发布后核验；上述本地摘要检查不替代该发布步骤。


### 长图优先

输出方式默认选择“单张长图”，保持内容连贯，标题和品牌页脚各出现一次；“自动分图”作为用户可选模式。超出单张预算时停止生成，不先申请巨大 Canvas，也不自动改变用户的清晰度或输出方式。

若降低到 1× 后确实能够容纳完整内容，超限界面提供“使用标准清晰度”；否则只提供“改为自动分图”。自动分图以同一套实际渲染框架测量页眉、留白、品牌页脚，再由最长边和总像素预算计算每张正文高度，防止页脚使最终图片超过预算。

例如宽 800 CSS px、2× 输出时，总高度上限为 5,000 CSS px（包含页眉页脚）；1× 输出时最长边预算允许总高度到 16,000 CSS px。这些是项目的保守安全预算，不是所有浏览器通用的硬上限。分辨率、主题、品牌设置与分图模式可以独立选择。

已检查超过旧 3,200 CSS px 阈值的内容仍导出一张长图、2× 超限后改用 1× 保持单图、主动切换自动分图，以及内容在 1× 也无法容纳时不提供无效降清晰度操作。原有 PNG／JPG、公式、图表、图片、品牌和 ZIP 能力沿用同一渲染链路。 本次修订的油猴主脚本为 1,861,372 字节，相对初次图片实现增加 2,208 字节，距项目闸门还剩 88,628 字节。

### 导出选项与水印

- 默认跟随 `ThemeManager` 的当前生效模式，并订阅变化；用户明确选择浅色或深色后，成品保持该选择。主题变化时正文与 Mermaid 一起重新准备，不读取宿主页某一种主题属性推断模式。
- 标题可编辑或隐藏，来源、导出时间、提问和品牌署名可分别隐藏。编辑标题只影响当前图片，不修改源对话或记入偏好；其它选项存入 `settings.export.image`，沿用已有跨平台设置存储、重置及备份／恢复链路。旧设置和不完整备份通过统一归一化补齐默认值，导入的枚举、颜色和数值均受约束。
- 外观提供纸面、卡片和阴影三套预设，均支持浅深色；宽度、字号及外观变化触发重新测量和捕获。预览支持适应宽度、50% 和 100%，缩放只影响显示，不重做图片，也不改变导出分辨率。
- 自定义水印与 Ophel 品牌署名相互独立，默认关闭。支持底部署名与全图平铺、文案、自动或自定义颜色、透明度、字号；平铺另支持旋转、水平／垂直间距和交错排列。页脚模式先测量预留位置，平铺按旋转后文字包围盒计算间距，最后绘制到 Canvas，避免水印 DOM 改变正文排版。
- `useImageExport` 分开管理正文捕获和成品合成，以请求身份拒绝过期结果，连续调参延迟 200ms 后处理。正文仅缓存当前请求的压缩 PNG；调整平铺水印或 PNG／JPG 格式复用该截图，逐张解码、合成和编码后释放位图和 Canvas。修改页脚模式或其字号需要重新测量；取消时中止请求并清理临时 DOM 和预览 URL。

本轮通过 23 项本地 Vitest 检查、格式／Lint／类型检查及 Chrome／Firefox／油猴生产构建；Lint 无错误，保留既有警告。Chromium 与 Firefox 实际检查配置记忆和恢复默认、主题跟随与手动覆盖、水印调参、标题转义、PNG／JPG 编码、下载、ZIP、预览缩放、窄屏和取消清理，Chromium 另验证 PNG 剪贴板。像素对比确认底部署名只改变预留区域，三档宽度与字号测量正确，2× 阴影与大字号页脚的分图均在预算内。夹具和测试按仓库约定仅保留本地；登录态附件权限与宿主页 CSP 仍需在具体站点验证。

## 参考来源

- [Issue #1073](https://github.com/urzeye/ophel/issues/1073)
- [Greasy Fork 长度校验](https://github.com/greasyfork-org/greasyfork/blob/main/app/models/script_version.rb)、[代码规则](https://greasyfork.org/en/help/code-rules)、[外部脚本规则](https://greasyfork.org/en/help/external-scripts)
- [Chrome 上传限制](https://developer.chrome.com/docs/webstore/publish)、[MV3 代码政策](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)、[Firefox 政策](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [html-to-image](https://github.com/bubkoo/html-to-image)、[modern-screenshot](https://github.com/qq15725/modern-screenshot)、[html2canvas 限制](https://html2canvas.hertzen.com/documentation)
- [docx/html](https://docx.js.org/api/modules/html.html)、[docx/math](https://docx.js.org/api/modules/math.html)、[html-docx-js](https://github.com/evidenceprime/html-docx-js)
- [jsPDF 依赖与字体](https://github.com/parallax/jsPDF)、[Window.print](https://developer.mozilla.org/en-US/docs/Web/API/Window/print)、[Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)、[OOXML 包结构](https://learn.microsoft.com/en-us/office/open-xml/general/how-to-create-a-package)
