# Conversation Manager

![Conversation tab — folder and tag list](/images/features/conversation.png)

The Conversations tab gives you a searchable, organized view of all your chat history on a given AI platform. You can tag, group, pin, export, and back up conversations.

## Browsing Your Conversations

The Conversations tab shows the same list the AI platform shows, but with enhancements:

- **Search** — type in the search box to filter conversations by title in real time
- **Filter by folder** — click a folder in the sidebar to show only its conversations
- **Filter by tag** — click a tag to show matching conversations
- **Sort and pin** — pin important conversations to the top so they do not get buried

## Folders

Create color-coded folders to group related conversations. There are 8 color options. You can enable "rainbow colors" in settings to give each folder a distinct tint that carries through the entire list item.

To assign a conversation to a folder:

1. Open the toolbox menu (☰ button in the floating group)
2. Click **Move to folder**
3. Pick an existing folder or create a new one

You can also do this from the conversation list context menu or the batch action bar.

## Tags

Tags are free-form labels you attach to conversations. One conversation can have multiple tags. Use them to mark status ("reviewed", "todo"), topic ("work", "study"), or anything else.

- Create and manage tags in **Settings → Features → Conversations**
- Assign tags via toolbox → **Set tag**, or from the conversation list
- Filter by tag using the tag sidebar

## Pins and Bulk Actions

Right-click any conversation (or hover to reveal action buttons) to pin it to the top of the list.

For bulk work, select multiple conversations using the checkboxes to:

- Move to folder
- Set tags
- Delete

## Exporting a Conversation

To export the current conversation, open the toolbox (☰) and click **Export**, or use the shortcut `Alt+Shift+E`.

Three formats are available:

**Markdown (.md)** — great for pasting into a note-taking app. Includes headings, code blocks, and image references.

**JSON (.json)** — structured data containing all messages, roles, timestamps, and model info. Good for programmatic use.

**Plain text (.txt)** — simple, no formatting. Copy into any text editor.

Export settings (in **Settings → Features → Conversations**):

- Custom user name in export (replaces "User")
- Custom model name in export
- Include filename timestamp
- Include thinking/reasoning chains (for models that show their reasoning steps)
- Convert images to Base64 (embeds images inline instead of linking)

You can also **Copy as Markdown** from the toolbox to copy the entire conversation to the clipboard without saving a file.

## WebDAV Sync and Backup

Ophel supports syncing conversation data (titles, tags, folders, pins) via WebDAV. This does not sync the full message content, only the metadata Ophel adds.

To set up:

1. Go to **Settings → Backup & Sync**
2. Enter your WebDAV server URL, username, and password
3. Click **Test Connection**
4. Choose which data to sync: conversations metadata, prompts, settings, Claude session keys
5. Set to **Manual** or **Auto** sync with an interval

Compatible services include Nextcloud, Nutstore (recommended for users in China), Synology NAS, and any standard WebDAV host.

You can also do a **full local backup** from the same page — exports all your Ophel data as a single JSON file you can import later.

## Settings

Go to **Settings → Features → Conversations** to configure:

| Setting               | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| Folder rainbow colors | Use distinct colored backgrounds for folder-assigned conversations |
| Auto unpin on sync    | Remove pins when syncing from remote                               |
| Sync delete to cloud  | Delete remote records when you delete conversations locally        |

## Shortcuts

| Shortcut       | Action                              |
| -------------- | ----------------------------------- |
| `Ctrl+Shift+O` | New conversation                    |
| `Alt+Shift+R`  | Refresh conversation list           |
| `Alt+Shift+L`  | Locate current conversation in list |
| `Alt+[`        | Previous conversation               |
| `Alt+]`        | Next conversation                   |

All shortcuts are customizable in **Settings → Shortcuts**.
