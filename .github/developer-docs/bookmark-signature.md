# Implementation Plan - Stable Bookmark Signatures

## Problem
The current bookmark signature strategy uses `index` or `offsetTop`, which are unstable in dynamic environments (lazy loading, virtual scrolling, window resizing). This causes bookmarks to be lost or misapplied (e.g., bookmarking one "Hello" bookmarks all "Hello"s).

## Proposed Solution
Implement a multi-tiered signature generation strategy that prioritizes stable IDs provided by the platform, falling back to robust content-based signatures.

### 1. Update [OutlineItem](file:///d:/workspace/ophel/src/adapters/base.ts#12-19) Interface
Add an optional [id](file:///d:/workspace/ophel/src/adapters/chatgpt.ts#45-62) field to [OutlineItem](file:///d:/workspace/ophel/src/adapters/base.ts#12-19) in [src/adapters/base.ts](file:///d:/workspace/ophel/src/adapters/base.ts).

### 2. Update Adapters
Modify [extractOutline](file:///d:/workspace/ophel/src/adapters/base.ts#597-601) in adapters (ChatGPT, Claude, etc.) to extract unique IDs if available.
- **ChatGPT**: Look for `data-message-id`.
- **Claude**: Look for unique attributes in message containers.

### 3. Implement Robust [generateSignature](file:///d:/workspace/ophel/src/core/outline-manager.ts#439-452)
Refactor [generateSignature](file:///d:/workspace/ophel/src/core/outline-manager.ts#439-452) in [src/core/outline-manager.ts](file:///d:/workspace/ophel/src/core/outline-manager.ts):
1. **Tier 1 (Stable ID)**: If `item.id` exists, use it. (e.g., `id:uuid-1234`)
2. **Tier 2 (Content + Occurrence)**:
   - Generate a content hash: `level::title::next_sibling_text_preview`
   - Calculate occurrence index: "The 2nd occurrence of 'Hello' with context 'World'"
   - *Note*: This requires generating signatures for the *entire outline* at once to count occurrences, rather than generating them in isolation.

### 4. Refactor Signature Generation Flow
- Instead of calling [generateSignature(item)](file:///d:/workspace/ophel/src/core/outline-manager.ts#439-452) in isolation, [OutlineManager](file:///d:/workspace/ophel/src/core/outline-manager.ts#30-1080) should generate and assign signatures during [refresh()](file:///d:/workspace/ophel/src/core/outline-manager.ts#488-622), mapping them to the flattened outline list.
- Store these signatures in the [OutlineNode](file:///d:/workspace/ophel/src/core/outline-manager.ts#7-23) so [toggleBookmark](file:///d:/workspace/ophel/src/core/outline-manager.ts#453-487) can simply read `node.signature`.

## Verification Plan
### Automated Tests
- (None existing for this logic) - Will rely on manual verification.

### Manual Verification
1. **Uniqueness**: Create a chat with multiple identical messages (e.g., "Test", "Test", "Test").
2. **Persistence**: Bookmark the 2nd "Test". Reload the page. Ensure only the 2nd "Test" is bookmarked.
3. **Stability**: Scroll up/down to trigger lazy loading (if applicable) or toggle "Show User Queries" and verify bookmarks remain correct.
