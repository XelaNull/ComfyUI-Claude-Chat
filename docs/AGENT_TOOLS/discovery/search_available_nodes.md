# search_available_nodes

Search available node types by keyword.

## Syntax

```json
{"tool": "search_available_nodes", "query": "lora"}
{"tool": "search_available_nodes", "query": "face detail"}
{"tool": "search_available_nodes", "query": "sampler", "category": "sampling"}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Search term |
| `category` | string | No | Filter to specific category |

## Returns

```json
{
  "types": [
    {"type": "LoraLoader", "category": "loaders", "display_name": "Load LoRA"},
    {"type": "LoraLoaderModelOnly", "category": "loaders", "display_name": "Load LoRA (Model)"}
  ],
  "count": 2
}
```

## Examples

Check if FaceDetailer is installed:
```json
{"tool": "search_available_nodes", "query": "face detailer"}
```

Find all upscale-related nodes:
```json
{"tool": "search_available_nodes", "query": "upscale"}
```

## Notes

- Part of **registry** discovery (node types AVAILABLE to add to workflow)
- Matches against type name, display name, and description
- Use this to check if a custom node is installed before trying to create it
- Different from [find_nodes](./find_nodes.md) which searches nodes already IN your workflow
