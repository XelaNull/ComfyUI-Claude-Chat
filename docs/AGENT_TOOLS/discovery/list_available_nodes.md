# list_available_nodes

Browse available node types in the ComfyUI installation.

## Syntax

```json
{"tool": "list_available_nodes"}
{"tool": "list_available_nodes", "category": "loaders"}
{"tool": "list_available_nodes", "category": "sampling"}
```

## Parameters

| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Filter by category (loaders, sampling, image, etc.) |

## Returns

```json
{
  "types": [
    {"type": "CheckpointLoaderSimple", "category": "loaders", "display_name": "Load Checkpoint"},
    {"type": "LoraLoader", "category": "loaders", "display_name": "Load LoRA"},
    {"type": "VAELoader", "category": "loaders", "display_name": "Load VAE"}
  ],
  "count": 3
}
```

## Notes

- Part of **registry** discovery (node types AVAILABLE to add to workflow)
- Returns all installed node types, including custom nodes
- For keyword search, use [search_available_nodes](./search_available_nodes.md)
- For detailed schema, use [get_node](./get_node.md) with `type` param
- Different from [list_nodes](./list_nodes.md) which lists nodes already IN your workflow
