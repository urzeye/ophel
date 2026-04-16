# Reading History & Scroll Lock

## Reading History

Long conversations are hard to pick up after you leave — reading history solves that.

Ophel quietly records the scroll position of each conversation when you leave. The next time you return to the same conversation, it automatically scrolls to where you left off so you can continue reading without manually scrolling.

**Settings → Features → Reading History**:

| Setting                 | Description                                                             | Default |
| ----------------------- | ----------------------------------------------------------------------- | ------- |
| Record reading position | Whether to track scroll positions                                       | On      |
| Auto-restore            | Automatically scroll to the last position when reopening a conversation | On      |
| Retention period        | How long history records are kept before being cleaned up               | 30 days |

Available retention periods: 1 day / 3 days / 7 days / 30 days / 90 days / Forever.

> If you want to start from the top on a specific visit — for example, to re-read a conversation from scratch — append `?ophel_skip_restore=1` to the URL when opening it. Ophel will skip auto-restore for that single visit.

## Scroll Lock

While the AI is generating, the page automatically scrolls to keep up with the latest output — which can be disruptive if you're reading something earlier in the conversation.

**Scroll lock** freezes the page's scroll position during generation. Once the AI finishes, normal scrolling behavior resumes.

**How to toggle (either method):**

- Toolbox menu → Scroll lock
- Shortcut `Alt+S`

Toggle it the same way to turn it off.

> Scroll lock is a temporary state and does not persist across page refreshes. If you want it locked by default on a specific site, enable it manually after each page load.
