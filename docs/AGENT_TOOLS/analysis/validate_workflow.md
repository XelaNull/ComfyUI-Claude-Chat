# validate_workflow

Check if the workflow will execute successfully.

## Syntax

```json
{"tool": "validate_workflow"}
```

## Returns

```json
{
  "can_execute": false,
  "blocking_errors": [
    {"node": 6, "input": "latent_image", "error": "Required input not connected"}
  ],
  "warnings": [
    {"node": 1, "widget": "ckpt_name", "warning": "Model file may be missing"}
  ],
  "execution_order": [1, 2, 3, 4, 5, 6, 7, 8]
}
```

## Response Fields

| Field | Description |
|-------|-------------|
| `can_execute` | Whether workflow will run |
| `blocking_errors` | Issues that prevent execution |
| `warnings` | Non-blocking concerns |
| `execution_order` | Order nodes will execute |

## Notes

- Call before [queue](../execution/queue.md) to catch problems
- Blocking errors must be fixed for workflow to run
- Auto-context Issues section shows common problems already
