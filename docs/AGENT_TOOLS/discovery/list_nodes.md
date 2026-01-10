# list_nodes

Enumerate all nodes in the current workflow.

## Syntax

```json
{"tool": "list_nodes"}
{"tool": "list_nodes", "verbose": true}
```

## Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `verbose` | bool | false | Include position, size, connections per node |

## Returns

```json
{
  "success": true,
  "nodes": [
    {"id": 1, "type": "CheckpointLoaderSimple", "title": "Load Checkpoint"},
    {"id": 2, "type": "KSampler", "title": "Sampler"},
    {"id": 3, "type": "VAEDecode", "title": "Decode"}
  ],
  "count": 3,
  "note": "This lists nodes in the current workflow. For available node types to add, use list_available_nodes or search_available_nodes."
}
```

With `verbose: true`:
```json
{
  "nodes": [
    {
      "id": 1,
      "type": "CheckpointLoaderSimple",
      "title": "Load Checkpoint",
      "pos": [50, 150],
      "size": [320, 120],
      "outputs": [{"name": "MODEL", "links": [1]}, ...]
    }
  ]
}
```

## Notes

- **This lists nodes in your workflow, NOT available node types**
- For available node types to add: use [list_available_nodes](./list_available_nodes.md) or [search_available_nodes](./search_available_nodes.md)
- Often unnecessary since auto-context provides workflow state
- Use `verbose` when you need exact positions/sizes
- For querying specific nodes, use [find_nodes](./find_nodes.md) instead
