# execution_status

Get the current execution queue status.

## Syntax

```json
{"tool": "execution_status"}
{"tool": "execution_status", "include_history": true}
```

## Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `include_history` | bool | true | Include recent execution history |
| `history_limit` | int | 5 | Max history entries to return |

## Returns

```json
{
  "running": true,
  "queue_size": 3,
  "queue_position": 1,
  "history": [...]
}
```

## Response Fields

| Field | Description |
|-------|-------------|
| `running` | Whether execution is in progress |
| `queue_size` | Total items in queue |
| `queue_position` | Current position in queue |
| `history` | Recent execution history (if requested) |

## Notes

- Use after [queue_execution](./queue_execution.md) to verify execution started
- `running: false` with `queue_size: 0` means queue is empty
- Part of the **execution lifecycle**: queue_execution → execution_status → cancel_execution
