# help

Get on-demand tool documentation.

## Syntax

```json
{"tool": "help"}
{"tool": "help", "topic": "create_link"}
{"tool": "help", "topic": "groups"}
{"tool": "help", "topic": "patterns"}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | string | No | Tool name or category |

## Topics

| Topic | Returns |
|-------|---------|
| (none) | List of all tools with one-line descriptions |
| `create_link` | Full documentation for create_link |
| `discovery` | All discovery tools |
| `nodes` | All node tools |
| `links` | Link tools + slot numbering |
| `widgets` | Widget tools |
| `groups` | All group tools |
| `organize` | Organize tool with flags |
| `batch` | Batch wrapper + $ref system |
| `patterns` | $ref, multi-item syntax, inline groups |
| `lowlevel` | JSON tools |

## Returns

```json
{
  "topic": "create_link",
  "documentation": "... full tool documentation ..."
}
```

## Notes

- Use this instead of guessing tool syntax
- Documentation stays in conversation context after first lookup
- System prompt contains tool index; use `help` for details
