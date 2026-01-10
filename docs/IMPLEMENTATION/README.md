# Implementation Plan

This directory contains the multi-phase implementation plan for aligning the code with the documented tool architecture.

## Overview

The documentation in `docs/AGENT_TOOLS/` and `docs/CONTEXT.md` represents the **target state**. This plan bridges the gap between current implementation and that vision.

## Analysis Methodology

### Direction 1: Documentation → Code
Walk through each documented feature and verify implementation exists.

### Direction 2: Code → Documentation
Walk through source files and verify each feature matches documentation.

## Phase Summary

| Phase | Focus Area | Priority | Estimated Complexity |
|-------|-----------|----------|---------------------|
| [Phase 1](./PHASE_1_CONTEXT_SYSTEM.md) | Context System | High | Medium |
| [Phase 2](./PHASE_2_DISCOVERY_TOOLS.md) | Discovery Tools | High | Medium |
| [Phase 3](./PHASE_3_HELP_TOOL.md) | Help Tool | High | Low |
| [Phase 4](./PHASE_4_GROUP_TOOLS.md) | Group Tools | Medium | Low |
| [Phase 5](./PHASE_5_ORGANIZE_TOOL.md) | Organize Tool | Medium | Low |
| [Phase 6](./PHASE_6_VERIFICATION.md) | Code↔Docs Verification | Low | High |

## Gap Analysis Summary

### Critical Missing (High Priority)

| Feature | Documented In | Current State |
|---------|--------------|---------------|
| `help` tool | AGENT_TOOLS/utility/help.md | NOT implemented |
| `list_nodes` tool | AGENT_TOOLS/discovery/list_nodes.md | Uses legacy `get_workflow_summary` |
| `list_available_nodes` tool | AGENT_TOOLS/discovery/list_available_nodes.md | ✅ Implemented (renamed from list_types) |
| `get_context` tool | AGENT_TOOLS/discovery/get_context.md | NOT implemented |
| Tiered Levels (1/2/3) | CONTEXT.md | Only minimal/standard/verbose |
| Type Abbreviations | CONTEXT.md | NOT implemented |

### Partially Implemented

| Feature | Documented | Current Gap |
|---------|-----------|-------------|
| `update_group` | pos, size, add_nodes, remove_nodes | Missing add_nodes/remove_nodes |
| `split_group` | AGENT_TOOLS/groups/split_group.md | NOT implemented |
| `merge_groups` | AGENT_TOOLS/groups/merge_groups.md | Basic implementation exists |
| `organize` cableless | AGENT_TOOLS/highlevel/organize.md | Internal but not exposed properly |
| `organize` llm | AGENT_TOOLS/highlevel/organize.md | NOT implemented |

### Naming Mismatches

| Documentation | Current Code | Action |
|--------------|--------------|--------|
| `list_nodes` | `get_workflow_summary` | Add alias + new format |
| `list_available_nodes` | N/A | ✅ Renamed from list_types for clarity |
| `find_nodes` with `where` | `findNodesAdvanced(query)` | Update param name |

## Verification Checklist

After each phase, run this checklist:

- [ ] All documented tool names exist in `toolActionMap`
- [ ] All documented parameters accepted
- [ ] Return format matches documentation
- [ ] Error responses include hints as documented
- [ ] Context generator produces documented format

## File Mapping

| Documentation | Implementation |
|--------------|----------------|
| AGENT_TOOLS/*.md | claude_chat.js:toolActionMap |
| CONTEXT.md | context_generator.js |
| Tool execution | workflow_api.js, workflow_groups.js |
| Backend routing | claude_client.py, prompts.py |
