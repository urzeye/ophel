# 🧠 Smart Outline

Smart Outline is one of Ophel's core features. It auto-parses AI conversation content into a structured navigation tree, letting you navigate freely in long conversations.

## Overview

<div class="tip custom-block">

**Use Cases**

- 📚 Quickly locate sections in long AI responses
- 🔍 Find specific questions when reviewing history
- 📋 Grasp overall structure when organizing thoughts

</div>

## Multi-level Navigation

The outline auto-parses two types of content:

### User Questions

Every user message becomes a first-level node in the outline for quick access.

### Heading Structure

Markdown headings (H1-H6) in AI responses are parsed as nested child nodes:

```
📝 User Question: Tell me about React core concepts
   ├── # React Introduction
   │   ├── ## What is React
   │   └── ## React Features
   ├── # Core Concepts
   │   ├── ## Components
   │   ├── ## JSX
   │   ├── ## Props and State
   │   └── ## Lifecycle
   └── # Summary
```

## Smart Filtering

### User View Mode

Enable "User View" to show only user questions, filtering out AI response headings. Great for reviewing conversation flow:

- ✅ Focus on your questions
- ✅ Quickly locate topics
- ✅ Grasp conversation direction

### One-click Copy

Click the copy icon on outline nodes to copy the original user question text:

- 📋 Reuse in other conversations
- 📝 Quote in notes
- 🔄 Re-ask AI

## Smart Following

### Current Position Highlight

As you scroll, the outline highlights the current section, always showing your position.

### Smooth Navigation

Click any outline node to smoothly scroll to that content:

- 🎯 Precise targeting
- ✨ Smooth animation
- 🔗 URL anchor support

### Generation Lock

When AI is generating, the outline locks to the latest content for real-time progress tracking.

## Deep Integration

### Shadow DOM Parsing

Some AI platforms use Shadow DOM. Ophel penetrates these boundaries to correctly parse content.

### User Message Rendering

User Markdown messages are rendered in the outline for better readability.

## Settings

Customize outline behavior in settings:

| Option           | Description                  | Default |
| ---------------- | ---------------------------- | :-----: |
| Default Expanded | Whether nodes start expanded |   On    |
| User View        | Enable user view by default  |   Off   |
| Show Icons       | Show node type icons         |   On    |
| Panel Position   | Outline panel position       |  Right  |

## Shortcuts

| Shortcut  | Function            |
| --------- | ------------------- |
| `Alt + R` | Refresh outline     |
| `Alt + E` | Expand/collapse all |
| `Alt + Q` | Toggle user view    |
| `Alt + L` | Locate in outline   |
| `Alt + F` | Search outline      |
| `Alt + ↑` | Previous heading    |
| `Alt + ↓` | Next heading        |

::: tip
Shortcuts can be customized in settings. See [Shortcuts](/en/guide/shortcuts).
:::
