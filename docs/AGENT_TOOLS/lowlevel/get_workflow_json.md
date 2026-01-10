# get_workflow_json

Get the complete raw workflow JSON.

## Syntax

```json
{"tool": "get_workflow_json"}
```

## Returns

```json
{
  "last_node_id": 12,
  "last_link_id": 15,
  "nodes": [
    {"id": 1, "type": "CheckpointLoaderSimple", "pos": [50, 150], ...}
  ],
  "links": [
    [1, 1, 0, 6, 0, "MODEL"]
  ],
  "groups": [...],
  "config": {},
  "extra": {},
  "version": 0.4
}
```

## Link Format

Links are arrays: `[link_id, origin_id, origin_slot, target_id, target_slot, type]`

## When to Use

- Troubleshooting unexpected behavior
- Examining exact internal structure
- Exporting workflows
- When high-level context isn't sufficient

## Notes

- Returns full serialized workflow exactly as ComfyUI stores it
- For modifications, use [patch_workflow_json](./patch_workflow_json.md)
- For complete replacement, use [set_workflow_json](./set_workflow_json.md)
