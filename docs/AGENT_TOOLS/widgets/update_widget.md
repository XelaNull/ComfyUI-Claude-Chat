# update_widget

Set widget values on one or more nodes.

## Syntax

```json
{"tool": "update_widget", "updates": [
  {"node": 5, "widget": "steps", "value": 30},
  {"node": 5, "widget": "cfg", "value": 7.5},
  {"node": 3, "widget": "text", "value": "a photo of a cat"}
]}
```

## Parameters (per update)

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `node` | int/$ref | Yes | Target node |
| `widget` | string | Yes | Widget name |
| `value` | any | Yes | New value |

## Returns

```json
{"success": true, "updated": 3}
```

## Common Widgets

| Widget | Found On | Type |
|--------|----------|------|
| `text` | CLIPTextEncode | string |
| `ckpt_name` | CheckpointLoaderSimple | dropdown |
| `steps` | KSampler | int |
| `cfg` | KSampler | float |
| `seed` | KSampler | int |
| `sampler_name` | KSampler | dropdown |
| `scheduler` | KSampler | dropdown |
| `width`, `height` | EmptyLatentImage | int |
| `denoise` | KSampler | float |

## Notes

- For dropdowns, use [get_widget_options](./get_widget_options.md) first to see valid values
- Widget names are case-sensitive
- Blocked by Prompt Guard for `text`, `prompt`, `positive`, `negative` widgets
