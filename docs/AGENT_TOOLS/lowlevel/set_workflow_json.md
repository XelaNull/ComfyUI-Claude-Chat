# set_workflow_json

Replace the entire workflow from JSON.

## Syntax

```json
{"tool": "set_workflow_json", "workflow": {
  "last_node_id": 8,
  "last_link_id": 9,
  "nodes": [...],
  "links": [...],
  "groups": [...],
  "config": {},
  "extra": {},
  "version": 0.4
}}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `workflow` | object | Yes | Complete workflow JSON |

## Returns

```json
{"success": true, "nodes": 8, "links": 9, "groups": 2}
```

## When to Use

- Loading a pre-designed workflow template
- AI designing entire workflow from scratch
- Restoring from backup
- Complete workflow replacement

## Notes

- **Replaces EVERYTHING** - no merge, no undo
- Use [clear_workflow](../highlevel/clear_workflow.md) + high-level tools for most cases
- Workflow must be valid ComfyUI format
- Clears undo history
