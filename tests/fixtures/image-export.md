## 从对话到可分享的知识

用清晰的结构保留推理，也让分享更轻松。This snapshot exercises real rendering, not placeholder text.

### 数学公式

行内公式 $E = mc^2$，以及分式、积分和矩阵：

$$
\int_0^1 x^2\,dx = \frac{1}{3},\qquad A = \begin{pmatrix}1 & 2\\3 & 4\end{pmatrix}
$$

### 表格与代码

| 格式 | 使用场景       | 优点       |
| ---- | -------------- | ---------- |
| PNG  | 分享文字和图表 | 清晰、无损 |
| JPG  | 图片较多的内容 | 文件更小   |

```typescript
const message = {
  title: "Ophel Atlas",
  content: "A very long line that should wrap without being cropped: " + "knowledge ".repeat(20),
}
console.log(message)
```

### Mermaid

```mermaid
flowchart LR
    A[对话 Conversation] --> B[结构化内容]
    B --> C[分享图片]
    B --> D[未来的 PDF / DOCX]
```

### 图片

![Ophel logo](assets/images/Ophel%20logo.png)

> [!THOUGHT]
> 思考内容也应按用户的导出选项保留。
