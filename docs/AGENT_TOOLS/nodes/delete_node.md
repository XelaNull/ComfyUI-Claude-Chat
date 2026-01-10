# delete_node

Remove one or more nodes from the workflow.

## Syntax

```json
{"tool": "delete_node", "nodes": [5]}
{"tool": "delete_node", "nodes": [5, 6, 7]}
{"tool": "delete_node", "nodes": ["$ref_name"]}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `nodes` | array | Yes | Node IDs or $refs to delete |

## Returns

```json
{"success": true, "deleted": [5, 6, 7]}
```

## Notes

- Automatically removes all connected links
- Supports $refs from earlier [create_node](./create_node.md) calls in same batch
- Nodes are removed from any groups they belong to
- Use [undo](./undo.md) if deleted by mistake
