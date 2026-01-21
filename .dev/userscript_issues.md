# 油猴脚本待解决问题 (Pending Issues)

## 功能适配问题 (Functionality & Adaptation)

1. **权限管理显示问题**

   - **现象**：油猴脚本环境中不应展示“权限管理”相关的菜单或页面。
   - **原因**：userscript 无法动态申请权限，也没有 extension 的权限 api。
   - **TODO**：在 features 配置或 UI 渲染中屏蔽 permissions 相关入口。

2. **Markdown 渲染修复失效**

   - **现象**：加粗修复功能（如 Claude/Gemini 中的 Markdown 渲染优化）在 userscript 环境下不生效。
   - **可能的追踪方向**：
     - 样式注入优先级问题？
     - 脚本执行时机问题？
     - 原生页面 DOM 劫持/修改冲突？

3. **网络请求异常 (GM_xmlhttpRequest)**

   - **现象**：水印移除功能（或其他依赖网络请求的功能）报错。
   - **错误信息**：XHR 相关报错。
   - **可能的追踪方向**：
     - `GM_xmlhttpRequest` 的 polyfill 实现是否完整？
     - 跨域限制或 Headers 处理问题？
     - `platform/userscript/index.ts` 中的 `request` 实现。
   - **TODO**：调试 `GM_xmlhttpRequest` 调用，确认 `onerror` 返回的具体信息。

4. **自定义 CSS 报错**
   - **现象**：打开自定义 CSS 设置时，控制台报 `innerHTML` 相关错误。
   - **可能的追踪方向**：
     - 安全策略 (CSP) 限制？
     - React 在 Shadow DOM 或 userscript 环境下的 HTML 注入限制？
     - `dangerouslySetInnerHTML` 的使用？

## 其他 (Others)

5. **未验证问题**
   - 需继续排查其他潜在的兼容性问题。
