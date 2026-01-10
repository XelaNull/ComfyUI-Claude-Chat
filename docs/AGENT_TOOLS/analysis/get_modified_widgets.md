# get_modified_widgets

Find widgets that have been changed from their default values.

## Syntax

```json
{"tool": "get_modified_widgets", "nodes": [5, 6]}
{"tool": "get_modified_widgets"}  // All nodes
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `nodes` | array | No | Specific nodes (default: all) |

## Returns

```json
{
  "modified": [
    {
      "node": 6,
      "type": "KSampler",
      "widgets": {
        "steps": {"default": 20, "current": 30},
        "cfg": {"default": 8.0, "current": 7.5}
      }
    }
  ],
  "unchanged_count": 5
}
```

## Use Cases

- Debugging unexpected behavior
- Documenting workflow customizations
- Understanding what user changed from defaults
- Creating shareable workflow descriptions
- Finding non-standard sampler settings
