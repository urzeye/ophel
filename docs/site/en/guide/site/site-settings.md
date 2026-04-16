# Site-Specific Settings

AI platforms differ in their page structure and features. Ophel provides dedicated configuration options for select sites.

Go to **Settings → Site Settings** and select a site from the left sidebar to view its options.

## Gemini / Gemini Enterprise

**Settings → Site Settings → Gemini (or Gemini Enterprise)**

| Setting           | Description                                                                                       | Default |
| ----------------- | ------------------------------------------------------------------------------------------------- | ------- |
| Markdown fix      | Fix intermittent bold text rendering failures on Gemini                                           | On      |
| Remove watermark  | Strip "Created with Gemini" watermarks from exports/screenshots; requires `<all_urls>` permission | Off     |
| Follow page theme | Automatically sync the Ophel panel theme with Gemini's light/dark mode                            | On      |

**Gemini Enterprise only**:

| Setting      | Description                                                                                              | Default |
| ------------ | -------------------------------------------------------------------------------------------------------- | ------- |
| Policy retry | Automatically retry requests blocked by enterprise content policies (for false-positive policy triggers) | Off     |
| Max retries  | Maximum number of consecutive retries when policy retry is enabled                                       | 3       |

## AI Studio

**Settings → Site Settings → AI Studio**

These settings control the initial expand/collapse state of various sections on the AI Studio page, saving you from manual adjustments every time you open it:

| Setting                       | Description                                                              | Default |
| ----------------------------- | ------------------------------------------------------------------------ | ------- |
| Collapse left nav             | Auto-collapse the left project navigation bar on load                    | Off     |
| Collapse run settings         | Auto-collapse the entire right-side run settings panel                   | Off     |
| Collapse tools panel          | Auto-collapse the "Tools" subsection inside run settings                 | Off     |
| Collapse advanced options     | Auto-collapse the "Advanced" subsection                                  | Off     |
| Enable search tool by default | Auto-enable Google Search when entering Prompt or Free mode              | On      |
| Markdown fix                  | Fix bold text rendering failures on AI Studio                            | Off     |
| Remove watermark              | Strip watermarks from generated images; requires `<all_urls>` permission | Off     |
| Default model                 | Model ID to auto-switch to when AI Studio loads                          | (empty) |

> **Default model** (AI Studio-specific) coexists with the general **Model Lock** feature. AI Studio's default model is configured here in the site-specific settings, not on the Model Lock page.

## ChatGPT

**Settings → Site Settings → ChatGPT**

| Setting      | Description                                              | Default |
| ------------ | -------------------------------------------------------- | ------- |
| Markdown fix | Fix intermittent bold text rendering failures on ChatGPT | Off     |

## Grok / DeepSeek / Kimi / Doubao / Yuanbao & Others

These sites currently have no site-specific settings. All general features — the panel, layout, themes, and shortcuts — work on them as usual.

<!-- TODO: Screenshot showing the AI Studio site-specific settings panel -->
