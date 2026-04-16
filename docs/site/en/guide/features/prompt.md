# Prompt Library

![Prompt Library tab — prompt list and categories](/images/features/prompt.png)

The Prompts tab is where you save, organize, and reuse prompts. Instead of retyping the same instructions over and over, you build a personal library and insert from it instantly.

## Using a Prompt

There are two ways to use a prompt:

- **Single click** — inserts the prompt into the AI input box but does not submit. You can review or edit it first.
- **Double-click** — inserts and submits immediately (can be toggled off in Settings if you prefer single-click only).

If the prompt contains variables (see below), a dialog appears first asking you to fill in each value before insertion.

## Creating Prompts

Click the **+** button at the top of the Prompts tab. Fill in:

- **Title** — a short label shown in the list
- **Content** — the full prompt text. Variables can be embedded here.
- **Category** — optional tag to group related prompts (e.g., "Writing", "Coding", "Research")
- **Pin** — optional, to keep this prompt at the top of the list

The prompt appears in the list immediately after saving. You can edit or delete it at any time.

## Variables

Variables let you write a reusable prompt template where certain values are filled in at send time. The syntax is **double curly braces**: `&#123;&#123;...&#125;&#125;`.

There are three sub-types, all within `&#123;&#123; &#125;&#125;`:

### Basic variable

```
Summarize the following text in {{language}}:

{{content}}
```

When you use this prompt, a dialog pops up with a text input for each variable. Enter values and press Enter or click Confirm.

### Variable with a default value

Use a colon (`:`) followed by the default:

```
Translate to {{target_language:English}}:

{{text}}
```

The default value pre-fills the text field. Press Enter to accept without changing it.

### Variable with dropdown options

Use a colon followed by options separated by pipe characters (`|`):

```
Rewrite this in a {{tone:formal|casual|humorous}} tone.
```

The dialog shows a dropdown menu instead of a text field. Pick one of the listed options. You can add as many options as you need:

```
Code review for {{language:TypeScript|Python|Go|Rust|Java}}
```

Variables can be mixed in any combination within a single prompt. The variable name is the text before the colon (or the whole `&#123;&#123; &#125;&#125;` content if there is no colon).

## Categories

Assign prompts to categories to keep them organized. A category sidebar appears on the Prompts tab — click a category to filter the list. Categories are created automatically when you type a new name while editing a prompt.

## Pins

Click the pin icon on any prompt to float it to the top of the list. Pinned prompts are always visible before unpinned ones, regardless of the active category filter.

## Import and Export

**Export** saves all your prompts to a JSON file — useful for backup or sharing between devices. **Import** reads a JSON file back and lets you choose whether to:

- Add new prompts (skip existing ones with the same title)
- Overwrite existing prompts with the same title
- Replace all prompts entirely

## Prompt Queue

The Prompt Queue lets you line up multiple prompts and send them automatically one by one, so you do not have to wait and manually submit after each AI response. This is useful for multi-step workflows, batch tasks, or long interview sequences.

### Enabling the Queue

Go to **Settings → Features → Prompts → Prompt Queue** and toggle it on. A queue widget appears near the AI input box, and you can show/hide it with the **Toggle Prompt Queue** shortcut (default: `Alt+J`, Mac: `Option+J`).

### Adding Prompts to the Queue

Type in the queue input field and press **Enter** to add a prompt. The queue shows a numbered list of pending items.

**Batch import** — click the import button in the queue panel to paste a large block of text and split it into multiple prompts at once. Two split modes:

- **Split by line** — each line becomes one prompt (empty lines are ignored)
- **Split by delimiter** — enter a custom separator string (e.g. `---`) and the text is split at each occurrence

A preview shows exactly how the text will be divided before you confirm.

### Running the Queue

Press **Start**. Ophel monitors the AI page every second. When it detects that the page has been idle (no active generation) for two consecutive checks, it automatically sends the next prompt in the queue.

You can:

- **Pause** — stop auto-sending until you resume
- **Skip** — immediately mark the current item as done and move to the next (sends it right away)
- **Reorder** — drag items to change their order
- **Delete** individual items
- **Clear all** — remove every item from the queue

The queue remembers paused state between interactions.

## Settings

Go to **Settings → Features → Prompts** to configure:

| Setting              | Description                                                                      |
| -------------------- | -------------------------------------------------------------------------------- |
| Double-click to send | Double-clicking sends the prompt directly without manual submission confirmation |
| Submit key           | Key used to submit to the AI after insertion — Enter or Ctrl/Shift+Enter         |
| Prompt queue         | Enable or disable the queue overlay feature                                      |
