# queue_execution

Submit the current workflow to ComfyUI's execution queue.

## Syntax

```json
{"tool": "queue_execution"}
{"tool": "queue_execution", "batch_size": 4}
```

## Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `batch_size` | int | 1 | Number of times to execute the workflow |

## Returns

```json
{"success": true, "queued": true, "position": 1}
```

## Notes

- Validate workflow first with [validate_workflow](../analysis/validate_workflow.md) if unsure
- Use [execution_status](./execution_status.md) to check queue progress
- Use [cancel_execution](./cancel_execution.md) to cancel execution
- Part of the **execution lifecycle**: queue_execution → execution_status → cancel_execution
