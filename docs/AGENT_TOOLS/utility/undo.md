# undo

Undo recent operations.

## Syntax

```json
{"tool": "undo"}
{"tool": "undo", "count": 3}
```

## Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `count` | int | 1 | Number of operations to undo |

## Returns

```json
{"success": true, "undone": 1}
```

## Notes

- Uses ComfyUI's built-in undo system
- May not undo all operations (e.g., clear_workflow clears history)
- Undo history is per-session
