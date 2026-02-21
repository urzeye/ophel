# 🔒 Privacy & Data

This page maps to `PermissionsPage.tsx` and `BackupPage.tsx`, covering permissions, backups, import/export, and data boundaries.

## Storage boundary

Ophel primarily stores data in browser extension local storage (`chrome.storage.local`). It does not depend on a vendor cloud account to keep your settings and workspace state.

Common modules include:

- Settings (`settings`)
- Prompts (`prompts`)
- Conversations (`conversations`)
- Folders and tags (`folders` / `tags`)
- Reading history (`readingHistory`)
- Claude Session Keys (`claudeSessionKeys`)

## Permission management

<a id="settings-permissions"></a>

### Permission types

| Type     | Permission      | Purpose                                              |
| -------- | --------------- | ---------------------------------------------------- |
| Required | `storage`       | Save settings and local data                         |
| Optional | `notifications` | Desktop completion notifications                     |
| Optional | `cookies`       | Claude Session Key read/switch workflows             |
| Optional | `<all_urls>`    | WebDAV access and watermark-removal related requests |

### Revoke side effects

- Revoking `notifications` automatically disables desktop notifications.
- Revoking `<all_urls>` blocks features depending on broad host access (for example watermark removal and WebDAV requests).

> The permissions page supports manual refresh to sync with browser-level permission changes.

## Backup & sync

<a id="settings-backup"></a>

### Local export

Three JSON export modes are available:

- Full backup (`full`)
- Prompts only (`prompts`)
- Settings only (`settings`)

### Local import

- Import from file or paste JSON directly
- Backup structure is validated before import
- Confirmed import writes data and refreshes the page

### WebDAV

Config fields:

- Server URL
- Username
- Password
- Remote directory

Actions:

- Save config
- Test connection
- Upload backup
- Open remote backup list (restore/delete)

## Other privacy-related controls

Privacy controls also exist in Feature settings:

- Tab privacy mode (masked title)
  - Path: Features → Tab → Privacy mode
- Tab auto rename (can be disabled)
  - Path: Features → Tab → Auto rename

## Destructive operation

- `Clear all data` removes all local Ophel data and reloads the page.
- Export a full backup before running destructive operations.

## Related pages

- [Settings Center Overview](/en/guide/enhancements)
- [Shortcuts](/en/guide/shortcuts)
