# Tabs & Notifications

Ophel can take over your browser tab's title display and send you a desktop notification when the AI finishes generating — even if you've already switched to another tab.

## Tab Auto-Rename

By default, Ophel keeps the browser tab title in sync with the AI conversation title, making it easy to tell multiple conversation windows apart from the tab bar.

**Settings → Features → Tab**:

| Setting               | Description                                                                         | Default                    |
| --------------------- | ----------------------------------------------------------------------------------- | -------------------------- |
| Auto-rename           | Sync conversation title to the browser tab                                          | On                         |
| Title update interval | How often to poll for title changes (seconds)                                       | 3 s                        |
| Title format          | Custom tab title template supporting `{title}`, `{status}`, and `{model}` variables | `{status}{title}->{model}` |
| Show status icon      | Show spinning/check icon in the title (generating / complete)                       | On                         |

**Open in new tab**: When enabled, clicking a conversation in the conversation list opens it in a new browser tab instead of navigating in the current one.

## Generation Complete Notification

When the AI finishes its reply in another tab, Ophel can alert you with a desktop notification and a sound.

**Settings → Features → Alerts**:

| Setting                    | Description                                                          | Default   |
| -------------------------- | -------------------------------------------------------------------- | --------- |
| Completion notification    | Send a desktop notification when generation completes                | Off       |
| Notification sound         | Play an audio cue along with the notification                        | On        |
| Sound preset               | Built-in sound effects to choose from                                | softChime |
| Volume                     | Notification volume (0–100%)                                         | 50%       |
| Repeat count               | How many times to repeat a short sound effect                        | 3         |
| Repeat interval            | Time between each repeat (seconds)                                   | 2 s       |
| Notify when tab is focused | Also send a notification when the current tab is already active      | Off       |
| Auto-focus window          | Bring the browser window to the foreground when generation completes | Off       |

> The first time you enable **Completion notification**, the browser will ask for the **notifications** permission. Choose Allow. If you previously denied it, go to **Settings → Permissions** to grant it.

## Privacy Mode

Don't want the tab title to reveal what you're discussing? Privacy mode replaces the browser tab title with custom text, completely hiding the real conversation content.

**Settings → Features → Tab**:

| Setting       | Description                                   | Default |
| ------------- | --------------------------------------------- | ------- |
| Privacy mode  | Replace the tab title with custom text        | Off     |
| Privacy title | The text to display instead of the real title | Google  |

> Privacy mode only affects the browser tab title. It has no effect on the AI conversation content itself or any feature inside the Ophel panel.

<!-- TODO: Screenshot showing tab rename effect (with and without status icon) -->
