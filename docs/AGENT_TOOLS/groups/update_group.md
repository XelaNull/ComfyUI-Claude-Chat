# update_group

Modify group properties, position, size, or membership.

## Syntax

```json
// Rename/recolor
{"tool": "update_group", "updates": [
  {"group": 1, "title": "Model Loaders", "color": "#3A5868"}
]}

// Resize and reposition
{"tool": "update_group", "updates": [
  {"group": "Loaders", "pos": [50, 50], "size": [700, 500]}
]}

// Modify membership
{"tool": "update_group", "updates": [
  {"group": 1, "add_nodes": [5, 6], "remove_nodes": [3]}
]}

// Full update with reflow
{"tool": "update_group", "updates": [
  {"group": 1, "pos": [100, 100], "size": [800, 600], "reflow_nodes": true}
]}
```

## Parameters (per update)

| Param | Type | Description |
|-------|------|-------------|
| `group` | int/string | Group index or title |
| `title` | string | New title |
| `color` | string | Hex color |
| `pos` | [x, y] | New position (top-left corner) |
| `size` | [w, h] | New dimensions |
| `reflow_nodes` | bool | Auto-reposition nodes to fit (default: true) |
| `add_nodes` | array | Node IDs to add |
| `remove_nodes` | array | Node IDs to remove (ungroup) |

## Size Validation

If size is too small for contained nodes:

```json
{
  "success": false,
  "error": "Group requires minimum size [450, 380]",
  "minimum_size": [450, 380],
  "current_nodes": [1, 2, 3],
  "suggestion": "Remove nodes or increase size"
}
```

## Notes

- `remove_nodes` with no target is equivalent to ungrouping
- For bulk reassignment, use [move_to_group](./move_to_group.md)
- `reflow_nodes: true` repositions nodes within the new bounds
