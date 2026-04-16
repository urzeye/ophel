# Claude Account Management

Claude accounts have usage rate limits, and once you hit the cap you have to wait for a reset. If you have multiple Claude accounts, Ophel's account management feature lets you store Session Keys for all of them and switch instantly when one account runs out — keeping the conversation going without interruption.

## What Is a Session Key?

A Session Key (`sk-ant-sid...` format) is the authentication token your browser session uses on claude.ai. Ophel intercepts requests and injects the specified Session Key, allowing you to switch accounts without logging out and logging back in.

Session Keys are stored in your local browser extension storage (`chrome.storage.local`). Ophel does not upload them to any server.

## Adding a Session Key

**Settings → Site Settings → Claude**

Two methods are available:

**Auto-import (recommended)**: Click **Import current session**. Ophel reads the Session Key for your currently logged-in account directly from the browser's cookies — no manual copying needed.

**Manual add**: Click the Add button and paste a Session Key string (format: `sk-ant-sid...`).

Each key can have a label to help you identify which account it belongs to.

## Switching Accounts

Two ways to switch:

- **Toolbox menu** → Click the currently active key and select a different one
- **Shortcut `Ctrl+Alt+S`** (Mac: `Cmd+Option+S`) — Switch to the next key in your list

After switching, Ophel refreshes the current Claude page to apply the new Session Key.

## Managing the Key List

| Action | Description |
| ------ | ----------- |
| Set as current | Make a specific key the active account |
| Test single | Send a lightweight request to verify whether the key is valid (not rate-limited and credentials are correct) |
| Test all | Validate all keys in sequence, with 500 ms between each test to avoid triggering rate limits |
| Export | Export all keys as a JSON file (for backup) |
| Import | Restore a key list from a JSON file |
| Delete | Remove a single entry — does not affect the Claude account itself |

::: warning Mind the sharing risk
Exported JSON files contain the full Session Keys. Anyone who has the file can use your account's quota. Be careful when sharing WebDAV backups or local files.
:::

## Security Notes

- Keys are stored only on your device and never sent to Ophel's servers
- All network requests made by Ophel go through Claude's official API — no proxy
- If an account is banned or a key expires, Ophel cannot help you bypass that; the key test feature will mark invalid keys

## Shortcuts

> Mac users: **Ctrl** = **Cmd**, **Alt** = **Option**.

| Action | Shortcut |
| ------ | -------- |
| Open Claude settings | `Ctrl+Alt+C` |
| Switch to next key | `Ctrl+Alt+S` |
