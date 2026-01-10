# move_nodes_to_group

Reassign nodes between groups.

## Syntax

```json
{"tool": "move_nodes_to_group", "moves": [
  {"nodes": [4, 5], "to_group": "Prompts"},
  {"nodes": [6], "to_group": {"title": "New Group", "color": "#385828"}},
  {"nodes": [7, 8], "to_group": null}
]}
```

## Parameters (per move)

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `nodes` | array | Yes | Node IDs to move |
| `to_group` | string/object/null | Yes | Target group, config, or null to ungroup |

## Target Options

```json
// Existing group by name
"to_group": "Prompts"

// Create new group with config
"to_group": {"title": "New Group", "color": "#4A3858"}

// Ungroup (remove from all groups)
"to_group": null
```

## Returns

```json
{"success": true, "moved": 4}
```

## Notes

- Removes nodes from current group, adds to target
- Creates target group if it doesn't exist
- Use `null` to ungroup nodes
- Group bounds auto-recalculated after move
