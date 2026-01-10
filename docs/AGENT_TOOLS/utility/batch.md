# batch

Execute multiple tools atomically in a single operation.

## Syntax

```json
{"tool": "batch", "commands": [
  {"tool": "create_node", "nodes": [{"type": "LoraLoader", "ref": "$lora"}]},
  {"tool": "create_link", "links": [
    {"from": 1, "from_slot": 0, "to": "$lora", "to_slot": 0}
  ]},
  {"tool": "update_widget", "updates": [
    {"node": "$lora", "widget": "strength_model", "value": 0.8}
  ]}
]}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `commands` | array | Yes | Tool calls to execute in order |

## Returns

```json
{
  "success": true,
  "results": [
    {"tool": "create_node", "success": true, "created": [15]},
    {"tool": "create_link", "success": true, "links": 1},
    {"tool": "update_widget", "success": true, "updated": 1}
  ]
}
```

## Behavior

- Commands execute sequentially
- $refs from earlier commands resolve in later commands
- If any command fails, batch stops and reports error
- All-or-nothing: either all succeed or none applied

## When to Use

- Creating complete workflows (nodes + links + groups)
- Multi-step modifications that should be atomic
- Any operation where partial completion is undesirable

## Example: Insert LoRA into chain

```json
{"tool": "batch", "commands": [
  {"tool": "delete_link", "links": [{"node": 6, "input_slot": 0}]},
  {"tool": "create_node", "nodes": [{"type": "LoraLoader", "ref": "$lora"}]},
  {"tool": "create_link", "links": [
    {"from": 1, "from_slot": 0, "to": "$lora", "to_slot": 0},
    {"from": "$lora", "from_slot": 0, "to": 6, "to_slot": 0}
  ]}
]}
```
