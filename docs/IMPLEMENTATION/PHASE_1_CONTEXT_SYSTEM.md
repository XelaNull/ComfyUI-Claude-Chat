# Phase 1: Context System

**Priority**: High
**Files**: `web/js/context_generator.js`, `web/js/claude_chat.js`
**Status**: ✅ COMPLETE

## Objective

Implement the tiered context system documented in CONTEXT.md to reduce token usage by ~55-65%.

## Implementation Summary

### Changes Made

1. **Type Abbreviations** (`context_generator.js:22-46`)
   - Added `TYPE_ABBREV` constant map
   - Added `abbreviateType()` helper function
   - Updated `getNodeConnections()` to use abbreviations

2. **Tiered Levels** (`context_generator.js:48-65`)
   - Refactored from `{minimal, standard, verbose}` to numeric `{1, 2, 3}`
   - Added `CONTEXT_LEVEL_ALIASES` for backwards compatibility
   - Implemented `selectLevel(nodeCount)` for auto-selection

3. **Level-Specific Output** (`context_generator.js:125-202`)
   - Level 1: Compact nodes + connections, no geometry
   - Level 2: Standard with group membership
   - Level 3: Full geometry + widget values

4. **get_context Tool** (`claude_chat.js:73-88`)
   - Added to toolActionMap
   - Returns context, level, token_estimate, budget

5. **Static Context Optimization** (`context_generator.js:71, 188-200`)
   - Added `isFirstMessage` tracking
   - Installed Packs only sent on first message
   - Added `resetFirstMessage()` method

6. **Integration** (`claude_chat.js:734-739`)
   - `startNewChat()` calls `resetFirstMessage()`
   - Clears RefResolver for new conversations

## Tasks

### Gate 1: Type Abbreviation System

- [x] **T1.1** Create type abbreviation map in context_generator.js
- [x] **T1.2** Add abbreviation helper function
- [x] **T1.3** Apply abbreviations to connection output

**Verification**: Context output shows `←M:#1` instead of `←MODEL:#1`

### Gate 2: Tiered Level Implementation

- [x] **T2.1** Rename context levels to numeric 1/2/3
- [x] **T2.2** Implement Level 1 format (compact, ~150-250 tokens)
- [x] **T2.3** Implement Level 2 format (standard, ~350-500 tokens)
- [x] **T2.4** Implement Level 3 format (full, ~800-2000 tokens)
- [x] **T2.5** Implement auto-selection based on workflow size

### Gate 3: get_context Tool

- [x] **T3.1** Add `get_context` to toolActionMap
- [x] **T3.2** Support explicit level override
- [x] **T3.3** Return format includes token_estimate

### Gate 4: Static vs Dynamic Context

- [x] **T4.1** Move "Installed Packs" to first-message-only
- [x] **T4.2** Add timestamp to workflow context header
- [x] **T4.3** Added `resetFirstMessage()` for new chat sessions

## Completion Criteria

- [x] All T* tasks marked complete
- [x] Token usage reduced (estimated 40-60% on large workflows)
- [x] `get_context` tool functional
- [x] Auto-level selection working
- [x] Type abbreviations in all context output

## Output Format Examples

### Level 1 (Compact)
```
[WORKFLOW STATE as of 14:32:05]
WORKFLOW: 12 nodes, 15 links
#1 CheckpointLoaderSimple →M:#5 →C:#3,#4 →V:#6
#3 CLIPTextEncode ←C:#1 →CD:#5
#5 KSampler ←M:#1 ←CD:#3 ←CD:#4 ←L:#2 →L:#6
...
Groups: "Loaders", "Sampling"
```

### Level 2 (Standard)
```
[WORKFLOW STATE as of 14:32:05]
WORKFLOW: 12 nodes, 15 links
#1 CheckpointLoaderSimple →M:#5 →C:#3,#4 →V:#6
...
Groups: 2
  "Loaders" nodes:[1,2]
  "Sampling" nodes:[5,6]
Ungrouped: [3,4]
Flow: #1,#2 → ... (8 middle) → #11,#12
Models: Checkpoint:sd_xl_base_1.0.safetensors | LoRA:detail_enhancer.safetensors
```

### Level 3 (Full)
```
[WORKFLOW STATE as of 14:32:05]
WORKFLOW: 12 nodes, 15 links
#1 CheckpointLoaderSimple @(50,100) 315x58 →M:#5 →C:#3,#4 →V:#6 {ckpt_name=sd_xl_base_1.0.safetensors}
...
```
