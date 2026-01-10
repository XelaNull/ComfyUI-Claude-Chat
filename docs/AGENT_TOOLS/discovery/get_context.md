# get_context

Request higher context detail level than auto-injected.

## Syntax

```json
{"tool": "get_context", "level": 2}
{"tool": "get_context", "level": 3}
{"tool": "get_context", "nodes": [5, 6, 7]}
```

## Parameters

| Param | Type | Description |
|-------|------|-------------|
| `level` | int | Detail level (1-3) |
| `nodes` | array | Specific node IDs only |

## Levels

| Level | Contains | Tokens |
|-------|----------|--------|
| 1 | Node list, groups, flow, issues | ~150-250 |
| 2 | + Connection details with slots | ~350-500 |
| 3 | + Positions, sizes, widget values | ~800-2000 |

## Returns

Returns workflow context at requested detail level. See [CONTEXT.md](../CONTEXT.md) for format details.

## Notes

- Auto-context typically provides Level 1 for large workflows
- Request Level 2 when creating links (need slot info)
- Request Level 3 when organizing layout (need positions)
- Use `nodes` param to get detail for specific nodes only, reducing token cost
