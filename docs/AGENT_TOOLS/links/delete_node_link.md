# delete_node_link

Disconnect inputs from nodes.

## Syntax

```json
{"tool": "delete_node_link", "links": [
  {"node": 5, "input_slot": 0},
  {"node": 6, "input_slot": 1}
]}
```

## Parameters (per link)

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `node` | int/$ref | Yes | Node with the input to disconnect |
| `input_slot` | int | Yes | Input slot index (0-based) |

## Returns

```json
{"success": true, "deleted": 2}
```

## Notes

- Deletes by specifying the **input** side (target node + input slot)
- One input can only have one connection, so this fully disconnects it
- Use before [create_node_link](./create_node_link.md) if you need to rewire
- Auto-context shows disconnected required inputs in Issues section
