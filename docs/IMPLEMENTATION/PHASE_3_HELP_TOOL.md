# Phase 3: Help Tool

**Priority**: High
**Files**: `web/js/claude_chat.js`, `web/js/tool_docs.js` (new)
**Status**: ✅ COMPLETE

## Objective

Implement on-demand documentation lookup to reduce system prompt from ~12KB to ~1.5KB.

## Implementation Summary

### Changes Made

1. **Created tool_docs.js** (`web/js/tool_docs.js`)
   - `TOOL_DOCS` - comprehensive documentation for all 40+ tools
   - `TOOL_CATEGORIES` - tools grouped by function
   - `PATTERNS` - $ref system, arrays, inline groups documentation
   - `COMMON_SLOTS` - slot patterns for common nodes (KSampler, CheckpointLoader, etc.)
   - `searchTools()` - helper for fuzzy tool search

2. **Added help tool** (`claude_chat.js:539-542`)
   - Routes to `getToolHelp()` method

3. **Implemented getToolHelp()** (`claude_chat.js:790-868`)
   - No topic → returns tool index with categories
   - Tool name → returns detailed documentation
   - Category name → returns tools in category with summaries
   - 'patterns' → returns $ref, arrays, inline groups docs
   - 'slots' → returns common slot patterns
   - Fuzzy search fallback for partial matches

## Current State Analysis

The full tool documentation is embedded in `prompts.py` system prompts, consuming ~10KB per message.

**Gap**: Documentation specifies a `help` tool that returns tool docs on-demand.

## Architecture

```
┌─────────────────────────────────┐
│ prompts.py                      │
│ ┌─────────────────────────────┐ │
│ │ CONDENSED SYSTEM PROMPT     │ │  ← ~1.5KB (tool index only)
│ │ - Tool names                │ │
│ │ - Basic categories          │ │
│ │ - "Use help for details"    │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ tool_docs.js (new)              │
│ ┌─────────────────────────────┐ │
│ │ TOOL_DOCS = {               │ │  ← ~15KB (loaded on demand)
│ │   create_node: {...},       │ │
│ │   batch: {...},             │ │
│ │   ...                       │ │
│ │ }                           │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

## Tasks

### Gate 1: Create tool_docs.js

- [x] **T1.1** Create `web/js/tool_docs.js` file
  ```javascript
  export const TOOL_DOCS = {
      // Discovery
      list_nodes: {
          summary: "List all nodes in the workflow",
          syntax: '{"tool": "list_nodes"}',
          params: { verbose: "boolean - include connections" },
          returns: "Array of {id, type} or detailed objects",
          category: "discovery"
      },
      // ... all 40+ tools
  };
  ```

- [x] **T1.2** Embed docs directly (no build step needed)
- [x] **T1.3** Add category groupings
  ```javascript
  export const TOOL_CATEGORIES = {
      discovery: ['list_nodes', 'find_nodes', 'list_types', 'search_types', 'get_node', 'get_models'],
      nodes: ['create_node', 'delete_node', 'update_node', 'duplicate_node', 'bypass_node'],
      // ...
  };
  ```

**Verification**: `TOOL_DOCS.batch` returns batch documentation object

### Gate 2: Implement help Tool

- [x] **T2.1** Add help handler to toolActionMap
  ```javascript
  'help': (params) => {
      return this.getToolHelp(params?.topic);
  }
  ```

- [x] **T2.2** Implement `getToolHelp()` method
  ```javascript
  getToolHelp(topic = null) {
      if (!topic) {
          // Return tool index
          return {
              success: true,
              topic: 'index',
              categories: TOOL_CATEGORIES,
              hint: "Call help with a topic for detailed documentation"
          };
      }

      // Check if topic is a tool name
      if (TOOL_DOCS[topic]) {
          return {
              success: true,
              topic: topic,
              documentation: TOOL_DOCS[topic]
          };
      }

      // Check if topic is a category
      if (TOOL_CATEGORIES[topic]) {
          const tools = TOOL_CATEGORIES[topic];
          return {
              success: true,
              topic: topic,
              tools: tools.map(t => ({
                  name: t,
                  summary: TOOL_DOCS[t]?.summary
              }))
          };
      }

      return {
          success: false,
          error: `Unknown topic: ${topic}`,
          hint: "Try 'batch', 'discovery', 'nodes', 'links', 'groups', or 'patterns'"
      };
  }
  ```

- [x] **T2.3** Add `patterns` special topic (also added `slots` topic)
  ```javascript
  // Returns $ref system, multi-item syntax, inline groups documentation
  ```

**Verification**:
- `help` returns tool index
- `help topic="batch"` returns batch documentation
- `help topic="discovery"` returns discovery tool list

### Gate 3: Update System Prompt (Backend - Deferred)

- [ ] **T3.1** Create condensed system prompt in prompts.py (deferred to backend update)
  ```python
  SYSTEM_PROMPT_CONDENSED = """You can modify ComfyUI workflows using tools.

  TOOL INDEX:
  Discovery: list_nodes, find_nodes, list_types, search_types, get_node, get_models
  Nodes: create_node, delete_node, update_node, duplicate_node, bypass_node
  Links: create_link, delete_link
  Widgets: update_widget, get_widget_options
  Groups: create_group, delete_group, update_group, move_to_group, merge_groups, split_group
  High-Level: organize, clear_workflow
  Analysis: validate_workflow, analyze_workflow, compare_to_defaults, detect_layout_issues
  Execution: queue, stop, get_status
  Utility: batch ⭐, undo, help

  ⭐ IMPORTANT: Use 'batch' to combine multiple operations (5x faster)

  Use 'help' tool for detailed syntax: {"tool": "help", "topic": "batch"}
  """
  ```

- [ ] **T3.2** Add continuation prompt that references help (deferred)
  ```python
  SYSTEM_PROMPT_CONTINUATION = """Continue the workflow task.
  If unsure about tool syntax, use: {"tool": "help", "topic": "tool_name"}
  """
  ```

- [ ] **T3.3** Measure token reduction (after backend update)
  - Before: ~12KB system prompt
  - After: ~1.5KB system prompt + on-demand ~500B per help call

**Verification**: First message system prompt <2KB

### Gate 4: Documentation Completeness

- [x] **T4.1** Verify all 40+ tools documented in TOOL_DOCS
- [x] **T4.2** Add common slot patterns to help output (COMMON_SLOTS)
  ```javascript
  common_slots: {
      CheckpointLoaderSimple: { outputs: ['MODEL', 'CLIP', 'VAE'] },
      KSampler: { inputs: ['model', 'positive', 'negative', 'latent_image'] },
      // ...
  }
  ```

- [x] **T4.3** Add error hint suggestions (via searchTools fallback)
  ```javascript
  if (topic.includes('slot') || topic.includes('connect')) {
      result.related = ['create_link', 'common_slots'];
  }
  ```

**Verification**: `help topic="create_link"` includes slot numbering info

## Completion Criteria

- [x] All T* tasks complete (except Gate 3 backend updates)
- [x] `help` tool returns index when called without params
- [x] `help topic="X"` returns detailed docs for any tool
- [ ] System prompt reduced to <2KB (pending backend update)
- [x] All tools documented in tool_docs.js

## Token Savings Analysis

| Scenario | Before | After | Savings |
|----------|--------|-------|---------|
| First message | ~12KB | ~1.5KB | 88% |
| With 2 help calls | ~12KB | ~2.5KB | 79% |
| Continuation | ~12KB | ~0.5KB | 96% |

## Test Scenarios

1. `help` → returns category index
2. `help topic="batch"` → returns full batch documentation
3. `help topic="patterns"` → returns $ref and multi-item patterns
4. `help topic="unknown"` → returns error with suggestions
5. First message token count < 2000
