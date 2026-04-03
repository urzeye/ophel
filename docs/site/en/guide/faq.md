# ❓ FAQ

Common questions and solutions collected here.

## Installation Issues

### Extension Won't Load

**Symptoms:** After installation, extension icon doesn't appear or doesn't work on AI platforms.

**Solutions:**

1. Ensure Developer Mode is enabled
2. Try refreshing the page or restarting browser
3. Check if extension has Site Access permission for that site
4. Clear browser cache and reinstall

### Multiple Extensions Conflict

**Symptoms:** Ophel behaves abnormally when other extensions are installed.

**Solutions:**

1. Disable other similar extensions
2. Check for overlapping shortcut keys
3. Try using in browser incognito mode

## Feature Issues

### Outline Not Showing

**Symptoms:** Outline panel is empty, doesn't show headings.

**Possible Causes:**

1. AI response has no Markdown headings
2. Page structure parsing failed
3. Panel might be hidden

**Solutions:**

1. Ensure AI response contains `# ## ###` etc. heading markers
2. Try `Alt + R` to refresh outline
3. Try `Alt + P` to toggle panel

### Conversations Not Syncing

**Symptoms:** WebDAV sync fails or data incomplete.

**Check Steps:**

1. Verify WebDAV server address is correct
2. Check username/password is correct
3. Ensure server supports WebDAV protocol
4. Check network connection

### Prompts Not Auto-Filling

**Symptoms:** Variable prompts don't popup for input.

**Solutions:**

1. Check prompt uses correct <code v-pre>{{variable}}</code> syntax
2. Ensure variables are in prompt content, not title
3. Try re-editing and saving the prompt

## Platform Compatibility

### Feature Support Table

| Feature                 | Gemini | AI Studio | ChatGPT | Claude | Grok |
| ----------------------- | :----: | :-------: | :-----: | :----: | :--: |
| Smart Outline           |   ✅   |    ✅     |   ✅    |   ✅   |  ✅  |
| Conversation Management |   ✅   |    ✅     |   ✅    |   ✅   |  ✅  |
| Prompt Library          |   ✅   |    ✅     |   ✅    |   ✅   |  ✅  |
| Theme Switching         |   ✅   |    ✅     |   ✅    |   ✅   |  ✅  |
| Model Lock              |   ✅   |    ✅     |   ✅    |   ✅   |  ✅  |
| Wide Screen Mode        |   ✅   |    ✅     |   ✅    |   ✅   |  ✅  |

### Platform Specifics

#### Gemini

- Supports Gemini (gemini.google.com) and Gemini Business
- Auto-differentiate personal and workspace accounts

#### AI Studio

- Supports Google AI Studio (aistudio.google.com)
- Supports sidebar auto-collapse

#### ChatGPT

- Supports ChatGPT (chatgpt.com)
- Compatible with GPT-4, GPT-3.5 models

#### Claude

- Supports Claude (claude.ai)
- Session Key management supported

#### Grok

- Supports Grok (grok.x.ai)
- Full feature support

## Performance Issues

### Page Lag

**Symptoms:** Page slowly responds or freezes after installing Ophel.

**Solutions:**

1. Try disabling some features (like outline auto-refresh)
2. Clear browser cache
3. Check if too many conversations loaded

### High Memory Usage

**Symptoms:** Browser memory usage increases.

**Solutions:**

1. Reduce number of loaded conversations
2. Close unused tabs
3. Periodically clear cached data

## Other Issues

### How to Reset Settings

1. Open Settings Panel
2. Scroll to bottom, click "Reset All Settings"
3. Confirm reset

### How to Backup Data

1. Open Settings → Backup
2. Click "Export Data"
3. Save JSON file to safe location

### How to Report Issues

1. Visit [GitHub Issues](https://github.com/urzeye/ophel/issues)
2. Describe the problem in detail
3. Provide browser version, OS info
4. Attach screenshots or error logs if possible
