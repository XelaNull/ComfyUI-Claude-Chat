# patch_workflow_json

Directly modify workflow JSON using JSON Patch (RFC 6902).

## Syntax

```json
{"tool": "patch_workflow_json", "patches": [
  {"op": "replace", "path": "/nodes/0/pos", "value": [100, 200]},
  {"op": "replace", "path": "/nodes/0/widgets_values/0", "value": "new_model.safetensors"},
  {"op": "add", "path": "/nodes/-", "value": {"id": 13, "type": "Note", ...}},
  {"op": "remove", "path": "/nodes/5"}
]}
```

## Operations

| Op | Description | Example |
|----|-------------|---------|
| `replace` | Replace value | `{"op": "replace", "path": "/nodes/0/pos", "value": [100,200]}` |
| `add` | Add value | `{"op": "add", "path": "/groups/-", "value": {...}}` |
| `remove` | Remove value | `{"op": "remove", "path": "/nodes/3"}` |
| `copy` | Copy from path | `{"op": "copy", "from": "/nodes/0", "path": "/nodes/-"}` |
| `move` | Move from path | `{"op": "move", "from": "/nodes/5", "path": "/nodes/0"}` |

## Path Syntax

```
/nodes/0           First node in array
/nodes/0/pos       Position of first node
/nodes/0/widgets_values/2   Third widget value
/groups/-          Append to groups array
/links/5           Sixth link
```

## When to Use

- Bulk edits that would require many high-level calls
- Fixing corrupted workflow state
- Surgical modifications to specific values
- When high-level tools don't cover your use case

## Returns

```json
{"success": true, "patches_applied": 3}
```

## Notes

- Bypasses validation - use high-level tools when possible
- Use [get_workflow_json](./get_workflow_json.md) first to understand structure
- `-` in path means "append to array"
