# get_widget_options

Get valid options for dropdown widgets.

## Syntax

```json
{"tool": "get_widget_options", "queries": [
  {"node": 5, "widget": "sampler_name"},
  {"node": 5, "widget": "scheduler"},
  {"node": 1, "widget": "ckpt_name"}
]}
```

## Parameters (per query)

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `node` | int/$ref | Yes | Target node |
| `widget` | string | Yes | Widget name |

## Returns

```json
{
  "results": [
    {
      "node": 5,
      "widget": "sampler_name",
      "type": "dropdown",
      "options": ["euler", "euler_ancestral", "dpmpp_2m", "dpmpp_2m_sde", ...],
      "current": "euler"
    },
    {
      "node": 1,
      "widget": "ckpt_name",
      "type": "dropdown",
      "options": ["dreamshaper_8.safetensors", "sd_xl_base_1.0.safetensors", ...],
      "current": "dreamshaper_8.safetensors"
    }
  ]
}
```

## Notes

- Call before [update_widget](./update_widget.md) to verify valid values
- Returns current value along with options
- For model files, this shows what's actually available in the models folder
