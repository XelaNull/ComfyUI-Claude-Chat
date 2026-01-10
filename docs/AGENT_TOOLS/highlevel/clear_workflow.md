# clear_workflow

Delete all nodes and groups from the workflow.

## Syntax

```json
{"tool": "clear_workflow"}
```

## Returns

```json
{"success": true, "deleted_nodes": 15, "deleted_groups": 4}
```

## Notes

- Removes everything - use with caution
- Cannot be undone with [undo](../utility/undo.md) (undo history is cleared)
- Use before creating a new workflow from scratch
- Consider [delete_node](../nodes/delete_node.md) for selective removal
