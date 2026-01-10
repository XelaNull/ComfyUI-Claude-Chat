# integrate_node_into_groups

**Automatically** integrate a newly added node into the existing group structure.

**CRITICAL: Always call this after adding a node to an organized workflow!**

## vs `move_nodes_to_group`

| Tool | Use Case |
|------|----------|
| `move_nodes_to_group` | **Manual** - You specify which group: `{"nodes": [5], "to_group": "Output"}` |
| `integrate_node_into_groups` | **Automatic** - Tool categorizes node and handles everything |

Use `integrate_node_into_groups` when you want the system to figure out the right group based on node type (FaceDetailer → Post-Processing, SaveImage → Output, etc.)

## Syntax

```json
{"tool": "integrate_node_into_groups", "node_id": 42}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `node_id` | number | Yes | ID of the node to integrate |

## Returns

```json
{
  "success": true,
  "action": "expanded_existing",
  "group": "Post-Processing",
  "shifted_groups": ["Output"]
}
```

## Behavior

The tool automatically:

1. **Categorizes the node** based on its type:
   - Loaders → "Setup"
   - LoRA → "LoRAs"
   - CLIPTextEncode → "Prompts"
   - KSampler → "Generation"
   - Detailers/Upscalers → "Post-Processing"
   - Save/Preview → "Output"

2. **Integrates into groups** by either:
   - Expanding an existing group if one matches the category
   - Creating a new group if no match exists
   - Shifting downstream groups to make room

## Example Workflow

```json
// Step 1: Create the node
{"tool": "create_node", "nodes": [
  {"type": "FaceDetailer", "ref": "$fd", "pos": [1200, 300]}
]}

// Step 2: Connect it
{"tool": "create_node_link", "links": [
  {"from": 8, "from_slot": 0, "to": "$fd", "to_slot": 0}
]}

// Step 3: Integrate into groups (REQUIRED!)
{"tool": "integrate_node_into_groups", "node_id": "$fd"}
```

## Notes

- Without this step, new nodes float outside groups
- Automatically determines the correct group based on node type
- Shifts other groups to prevent overlaps
- Can be undone with `undo`
