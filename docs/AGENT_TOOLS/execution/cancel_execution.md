# cancel_execution

Cancel/interrupt the current workflow execution.

## Syntax

```json
{"tool": "cancel_execution"}
```

## Returns

```json
{"success": true, "cancelled": true}
```

## Notes

- Interrupts the currently running execution immediately
- Does not affect items still queued (only the active execution)
- Already-generated outputs are preserved
- Part of the **execution lifecycle**: queue_execution → execution_status → cancel_execution
