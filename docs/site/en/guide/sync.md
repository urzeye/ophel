# Backup & Sync

All Ophel data is stored locally in your browser by default. This page explains how to export and back up your data, and how to sync across multiple devices using WebDAV.

## Local Backup (Import / Export)

**Settings → Backup & Sync**

You can export your data as a JSON file for backup or migration to another device:

| Export type   | What's included                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Full backup   | Everything: settings, prompts, conversation metadata, folders, tags (and optionally Claude Session Keys) |
| Prompts only  | Your prompt library                                                                                      |
| Settings only | All configuration items                                                                                  |

**Import**: Drag and drop a JSON file or click to select one. Ophel validates the format before writing. After import, the page refreshes automatically to apply the new configuration.

> Import **overwrites** existing data. We recommend exporting a backup of your current data before importing.

## Clear All Data

**Settings → Backup & Sync → Clear all data**

Deletes all locally stored Ophel data — prompts, conversation metadata, folders, tags, and all settings — returning the extension to its initial install state.

::: warning Irreversible
This action cannot be undone. Export a backup first if you need to preserve your data.
:::

## WebDAV Sync

WebDAV sync lets you upload Ophel data to your own private server and keep it consistent across multiple devices. Common WebDAV servers include Nextcloud, Nutstore (Jianguo Yun), Synology NAS, and others.

**Settings → Backup & Sync → WebDAV**:

| Field              | Description                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Server URL         | Full URL of the WebDAV server (must start with `https://`)                                    |
| Username           | Your WebDAV account username                                                                  |
| Password           | Your WebDAV account password (stored locally, never sent to third parties)                    |
| Remote path        | Directory on the server where sync files are stored (default: `ophel`, created automatically) |
| Sync mode          | Manual (click a button) or automatic (on a set interval)                                      |
| Auto sync interval | Minimum time between automatic syncs (minutes)                                                |
| Data sources       | Which data types to sync (settings / conversations / prompts / Claude Keys)                   |

### What Gets Synced?

WebDAV sync covers the **metadata** Ophel maintains locally:

- Folders, tags, and pinned state you've set in Ophel
- Your prompt library
- Ophel settings
- Claude Session Keys (optional; included by default — be mindful when sharing backup files)

**Not synced**: The actual conversation messages on AI platforms. Those messages belong to each AI service, and Ophel has no access to upload them.

### Sync Notes

- WebDAV sync requires the optional `<all_urls>` permission. The browser will prompt when you first enable it.
- For multi-device setups, **manual sync** is recommended to avoid write conflicts when multiple devices sync simultaneously.
- To restore data on a new device: configure your WebDAV server details first, then click **Pull from server**.

## Permissions

**Settings → Permissions**

Ophel uses the following permissions:

| Permission      | Type     | Purpose                                        |
| --------------- | -------- | ---------------------------------------------- |
| `storage`       | Required | Save local configuration and data              |
| `notifications` | Optional | Desktop notification when generation completes |
| `cookies`       | Optional | Claude Session Key reading and switching       |
| `<all_urls>`    | Optional | WebDAV sync + watermark removal                |

Each optional permission can be revoked individually from this page. After revoking, features that depend on that permission are automatically disabled.
