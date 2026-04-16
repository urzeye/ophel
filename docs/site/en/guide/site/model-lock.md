# Model Lock

Do you have to manually switch back to your preferred model every time you open an AI site? Model lock solves that: once configured, Ophel automatically switches to your target model on every page load.

## How It Works

After the page finishes loading, Ophel checks the current state of the model selector. If the selected model isn't the locked target, it triggers the switch automatically. If the target model doesn't exist (for example, your account doesn't have access to it), Ophel does nothing and leaves the current model as-is.

## Setup

1. Open **Settings → Site Settings**
2. Select the site you want to configure from the left sidebar
3. Find the **Model Lock** section and toggle it on
4. Type the target model name in the input field (keyword matching, case-insensitive)

You can also quickly toggle model lock for the current site from the **Toolbox menu**.

## Supported Sites

| Site              | URL                 |
| ----------------- | ------------------- |
| Gemini            | gemini.google.com   |
| Gemini Enterprise | Enterprise accounts |
| AI Studio         | aistudio.google.com |
| ChatGPT           | chatgpt.com         |
| Claude            | claude.ai           |
| Grok              | grok.com            |
| Tongyi Qianwen    | <www.qianwen.com>   |
| Qwen Studio       | chat.qwen.ai        |
| Yuanbao           | yuanbao.tencent.com |
| ima               | ima.qq.com          |
| Z.ai              | chat.z.ai           |

## Tips

**Keyword matching**: You only need part of the model name. For example, entering `flash` matches `Gemini 2.0 Flash`. If multiple models match, the first match is selected.

**Temporary overrides**: If you manually switch to a different model during a session, Ophel's lock only kicks in again on the next page load — it won't override your manual selection immediately.

**Per-site independence**: Each site's model lock setting is independent, so you can configure different target models for different platforms.

<!-- TODO: Screenshot showing the model lock settings interface -->
