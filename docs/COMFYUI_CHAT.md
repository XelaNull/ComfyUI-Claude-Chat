# ComfyUI Claude Chat - Frontend Architecture

Technical specification for the chat panel UI implementation.

---

## Module Structure

```
web/js/
├── claude_chat.js          # Main ClaudeChatPanel class, tool execution, entry point
├── claude_chat_panel.js    # DOM creation for chat panel
├── claude_chat_settings.js # Settings modal DOM and logic
├── context_generator.js    # Workflow state generation for auto-injection
├── workflow_api.js         # LiteGraph operations (nodes, links, groups)
├── workflow_groups.js      # Group-specific operations
├── ref_resolver.js         # $ref system for cross-referencing created nodes
├── batch_executor.js       # Atomic batch command execution
├── tool_hints.js           # Error enrichment with usage hints
```

---

## ClaudeChatPanel Class

**File:** `claude_chat.js`

### State Properties

```javascript
{
    // UI state
    isOpen: boolean,
    panel: HTMLElement,
    isLoading: boolean,

    // Panel geometry
    width: 420,
    height: 550,
    x: number,              // Left position
    y: number,              // Top position

    // Drag/resize
    isDragging: boolean,
    isResizing: boolean,
    dragOffset: {x, y},

    // Auth
    authMethod: 'max_plan' | 'anthropic_api' | 'none',
    authPreference: 'auto' | 'api' | 'max',
    hasApiKey: boolean,
    hasMaxPlan: boolean,

    // Features
    workflowModeEnabled: boolean,   // Modify checkbox
    promptGuardEnabled: boolean,    // Privacy mode
    fontSizeIndex: 0|1|2,           // Indexes into [12, 14, 16]

    // Conversation
    messages: Array<{role, content}>,

    // Tool infrastructure
    refResolver: RefResolver,
    contextGenerator: ContextGenerator,
    toolActionMap: {[action]: Function},
    _toolCallCounter: number        // Cumulative tool call count per message
}
```

### Initialization Flow

```
app.registerExtension()
    └─> claudeChat.init()
        ├─> addMenuButton()
        │   ├─> Try: ComfyButton in app.menu.settingsGroup
        │   └─> Fallback: createFloatingButton() at top-left
        └─> checkStatus()
            └─> GET /claude-chat/status
```

---

## DOM Structure

### Chat Panel

```
#claude-chat-panel (fixed, draggable, resizable)
├── #claude-chat-header (drag handle)
│   ├── Logo + "Claude Chat" title
│   ├── #claude-status-badge ("Max Plan" | "API" | "Not Connected")
│   ├── #claude-prompt-guard-indicator (shield icon, hidden when disabled)
│   └── Header buttons
│       ├── New Chat button (+)
│       ├── Settings button (gear)
│       └── Close button (×)
├── #claude-messages (scrollable)
│   ├── Welcome message
│   └── Message bubbles (user/assistant/error)
├── Input area
│   ├── #claude-input (textarea)
│   ├── #claude-send-btn
│   └── Options row
│       ├── Checkboxes: Workflow, Last image, Modify
│       └── #claude-font-size-btn (AAA)
└── #claude-resize-handle (corner drag)
```

### Settings Modal

```
#claude-settings-modal (overlay)
└── Modal content
    ├── Header ("Settings" + close)
    ├── Status section (current auth status)
    ├── Auth preference (radio buttons)
    │   ├── Auto (Recommended)
    │   ├── Anthropic API Only
    │   └── Max Plan Only
    ├── API Key input (password + toggle visibility)
    ├── #prompt-guard-section
    │   ├── Shield icon + "Prompt Guard" label
    │   ├── Status text ("● Protected" | "○ Disabled")
    │   ├── Toggle switch (animated)
    │   └── Feature pills (Text hidden, Edit blocked, Persisted)
    └── Save Settings button
```

---

## Event Handling

### Drag (Panel)

```javascript
header.mousedown/touchstart → startDrag(e)
    └─> isDragging = true, capture dragOffset

document.mousemove/touchmove → handleMove(e)
    └─> Update panel.style.left/top

document.mouseup/touchend → handleEnd()
    └─> isDragging = false
```

### Resize (Panel)

```javascript
resizeHandle.mousedown/touchstart → startResize(e)
    └─> isResizing = true

document.mousemove → handleMove(e)
    └─> Update panel.style.width/height (min: 320x400)

document.mouseup → handleEnd()
    └─> isResizing = false
```

### Message Send

```javascript
textarea.keydown (Enter without Shift) → sendMessage()
sendBtn.click → sendMessage()

sendMessage()
├─> Gather: message, workflow (if checked), imageData (if checked)
├─> addMessage('user', ...)
├─> addMessage('assistant', '...', isLoading=true)
├─> if workflowModeEnabled:
│   └─> sendMessageWithTools() [tool loop]
├─> else:
│   └─> POST /claude-chat/message
└─> Update messages[], remove loading
```

---

## Tool Execution Flow

```
sendMessageWithTools(message, workflow, history, imageData)
│
├─> contextGenerator.generate() → inject [WORKFLOW STATE]
├─> POST /claude-chat/message-with-tools
│
└─> while (data.pending_tool_calls):
    │
    ├─> updateToolProgress(loadingEl, round, toolCalls)
    │
    ├─> for each toolCall:
    │   ├─> refResolver.resolveParams(params)
    │   ├─> toolActionMap[action](params)
    │   ├─> if create_node with ref: refResolver.register(ref, node_id)
    │   └─> collect results
    │
    ├─> POST /claude-chat/continue-with-tools
    │   └─> {tool_results, conversation_id}
    │
    └─> data = response (may have more pending_tool_calls)
```

### Tool Progress UI

```
● ● ●  Waiting for Claude
└─ Tool Call #5: create_node
```

Counter is cumulative across rounds within a single message.

---

## Context Injection

**File:** `context_generator.js`

Called before every message to backend:

```javascript
const workflowContext = contextGenerator.generate({
    promptGuardEnabled: this.promptGuardEnabled
});

// Prepended to user message:
`${workflowContext}\n\n---\n\nUser: ${message}`
```

### Generated Format

```
[WORKFLOW STATE]
Nodes: 8 total
  #1 CheckpointLoaderSimple "Load" | pos:(50,150) size:(320x120) | out: MODEL→#6
  #2 KSampler | pos:(400,150) size:(280x320) [BYPASSED] | in: MODEL←#1

Groups: 2
  1. "Loaders" [#2A4858] | bounds:(30,80) size:(750x340) | nodes: 1, 2

Ungrouped: 3, 4, 5

Data Flow: #1 → ... (4 middle) → #8

Issues Detected:
  - Node #2 KSampler: latent_image input not connected

In Use:
  - Checkpoint: dreamshaper_8.safetensors

Installed Packs:
  - ComfyUI-Impact-Pack (FaceDetailer, SAMLoader)
```

---

## Prompt Guard

Privacy feature that hides prompt text from Claude.

### When Enabled:

1. **Workflow stripping** (`stripPromptData()`):
   - CLIPTextEncode, Note, etc. → `[PROMPT GUARD - CONTENT HIDDEN]`
   - Long/suspicious titles → `[PROMPT GUARD - TITLE HIDDEN]`

2. **Context generation** (`contextGenerator.generate()`):
   - Node titles that look like prompts are omitted

3. **Tool blocking** (`update_widget` handler):
   - Blocks updates to `text`, `prompt`, `positive`, `negative` widgets
   - Blocks updates to CLIPTextEncode, Note, etc. node types
   - Returns `{success: false, blocked_by: 'prompt_guard'}`

### UI Indicators:

- Header: Shield icon badge "Guarded" (white pill)
- Settings: Premium toggle with animated knob (lock/unlock emoji)

---

## Styling

### Colors

```
Panel background:    #1a1a2e
Panel border:        #3a3a5a
Input background:    #16162a
Accent gradient:     #D97706 → #B45309 (orange)
Text primary:        #e0e0e0
Text secondary:      #888
Error:               #ef4444 / #f87171
Success:             #22c55e
Prompt Guard blue:   #3b82f6
```

### CSS Animations

```css
@keyframes claudeLoadingPulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
}
.claude-loading-dot {
    animation: claudeLoadingPulse 1s infinite;
}
```

### Scrollbar

Custom webkit scrollbar for `#claude-chat-panel`:
- Track: `#1a1a2e`
- Thumb: `#3a3a5a`, border-radius 4px

---

## LocalStorage Keys

| Key | Type | Purpose |
|-----|------|---------|
| `claude-chat-font-size` | `"0"|"1"|"2"` | Font size index |
| `claude-chat-auth-preference` | `"auto"|"api"|"max"` | Auth mode |
| `claude-chat-api-key` | string | Anthropic API key |
| `claude-chat-prompt-guard` | `"true"|"false"` | Privacy mode |

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/claude-chat/status` | GET | Auth status, capabilities |
| `/claude-chat/settings` | POST | Save auth preference, API key |
| `/claude-chat/message` | POST | Simple chat (no tools) |
| `/claude-chat/message-with-tools` | POST | Initial message with tool support |
| `/claude-chat/continue-with-tools` | POST | Continue conversation with tool results |

---

## Tool Action Map

All client-side tool handlers in `toolActionMap`:

**Discovery:**
- Workflow (canvas): `list_nodes`, `find_nodes`, `get_node` (with `id`)
- Registry (node types): `list_available_nodes`, `search_available_nodes`, `get_node` (with `type`)
- Registry (models): `list_available_models`, `search_available_models`
- Other: `get_workflow`, `get_context`

**Nodes:** `create_node`, `delete_node`, `update_node`, `duplicate_node`, `bypass_node`

**Links:** `create_node_link`, `delete_node_link`

**Widgets:** `update_widget`, `get_widget_options`

**Groups:** `create_group`, `delete_group`, `update_group`, `move_nodes_to_group`, `merge_groups`, `split_group`, `detect_group_issues`

**Execution:** `queue_execution`, `cancel_execution`, `execution_status`

**High-Level:** `organize` [llm] [cableless], `clear_workflow`

**Utility:** `undo`, `batch`

**Analysis:** `get_modified_widgets`, `detect_layout_issues`, `validate_workflow`, `analyze_workflow`

**Low-Level:** `get_workflow_json`, `patch_workflow_json`, `set_workflow_json`

---

## See Also

- [AGENT_TOOLS.md](./AGENT_TOOLS.md) - Tool definitions and architecture
- [CONTEXT.md](./CONTEXT.md) - Prompts and context injection
