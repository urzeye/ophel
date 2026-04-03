# 💬 Conversation Manager

Conversation Manager is one of Ophel's core features, providing powerful organization, search, and backup capabilities for your AI conversations.

## Overview

<div class="tip custom-block">

**Use Cases**

- 📂 Organize extensive chat history
- 🔍 Quickly search for specific topics
- 💾 Backup important conversations
- 🔄 Sync conversation data across devices

</div>

## Enhanced Sidebar

### Infinite Scroll

Native AI platforms usually show only recent conversations. Ophel's enhanced sidebar supports:

- ♾️ **Infinite scroll**: Auto-load all history
- ⚡ **Virtual list**: Smooth scrolling with hundreds of conversations
- 📊 **Statistics**: Display total conversation count

### Real-time Search

Type keywords to filter the conversation list in real-time:

- 🔍 Search by title
- ⏱️ Instant results
- 🎯 Highlight matching keywords

## Tags & Categories

### Tag System

Add custom tags to conversations for flexible organization:

```
💼 Work
├── [Code] React component design
├── [Code] API interface design
└── [Docs] Product requirements

📚 Study Notes
├── [English] Grammar practice
└── [Math] Calculus concepts
```

**Tag Features:**

- ➕ Create custom tags
- 🎨 Auto-assign tag colors
- 🏷️ Multiple tags per conversation
- 🔍 Filter by tag

### Colorful Folders

Use colorful folders to organize different types of conversations:

- 🌈 8 rainbow color options
- 📂 Drag conversations into folders
- 🔍 Filter by folder

## Data Export

### Single Conversation Export

Export any conversation in multiple formats:

#### Markdown (.md)

```markdown
# Conversation Title

## User

How do I manage state in React?

## AI

React provides several state management options...
```

#### JSON (.json)

```json
{
  "title": "Conversation Title",
  "created": "2024-01-15T10:00:00Z",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

#### Plain Text (.txt)

```
Conversation Title
Created: 2024-01-15

[User]
How do I manage state in React?

[AI]
React provides several state management options...
```

### Batch Operations

- ☑️ Multi-select conversations
- 📦 Batch export
- 🗑️ Batch delete
- 🏷️ Batch add tags

## Sync & Backup

### WebDAV Sync

Sync with cloud storage via WebDAV protocol:

- ☁️ **Nutstore** (recommended for Chinese users)
- 🗄️ **Synology NAS**
- 📁 **Nextcloud**
- 🌐 Any WebDAV-compatible service

**Setup Steps:**

1. Open Settings → Backup & Sync
2. Enter WebDAV server address
3. Fill in username and password
4. Click "Test Connection" to verify
5. Set auto-sync interval (optional)

### Local Backup

Besides cloud sync, export data locally:

- 📥 **Full backup**: Export all conversations and settings
- 📂 **Modular export**: Export only conversations/tags/folders

## Settings

| Option        | Description                  | Default |
| ------------- | ---------------------------- | :-----: |
| Default Sort  | Conversation list sort order | Recent  |
| Show Time     | Display creation/update time |   On    |
| Auto Sync     | Enable WebDAV auto sync      |   Off   |
| Sync Interval | Auto sync time interval      | 30 min  |

## Shortcuts

| Shortcut           | Function                    |
| ------------------ | --------------------------- |
| `Ctrl + Shift + O` | New conversation            |
| `Alt + Shift + R`  | Refresh conversation list   |
| `Alt + Shift + L`  | Locate current conversation |
| `Alt + [`          | Previous conversation       |
| `Alt + ]`          | Next conversation           |

::: tip
Conversation data is stored in browser local storage. Clearing browser data may cause data loss. Regular backups recommended.
:::
