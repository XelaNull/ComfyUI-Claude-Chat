# get_workflow

Get the full serialized workflow JSON.

## Syntax

```json
{"tool": "get_workflow"}
```

## Returns

Complete workflow structure as ComfyUI stores it:

```json
{
  "last_node_id": 12,
  "last_link_id": 15,
  "nodes": [...],
  "links": [...],
  "groups": [...],
  "config": {},
  "extra": {},
  "version": 0.4
}
```

## Notes

- Returns the full raw structure, not a summary
- Usually unnecessary since auto-context provides workflow state
- Use for exporting, debugging, or when you need exact internal structure
- For specific nodes, use [get_node](./get_node.md) instead
- For low-level modifications, see [patch_workflow_json](./patch_workflow_json.md)
