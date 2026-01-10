# list_available_models

List available models by type.

## Syntax

```json
{"tool": "list_available_models", "type": "checkpoints"}
{"tool": "list_available_models", "type": "loras"}
{"tool": "list_available_models", "type": "vae"}
{"tool": "list_available_models", "type": "embeddings"}
{"tool": "list_available_models", "type": "controlnet"}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Model type to list |

## Model Types

| Type | Description |
|------|-------------|
| `checkpoints` | Main model files (.safetensors, .ckpt) |
| `loras` | LoRA adapters |
| `vae` | VAE models |
| `embeddings` | Textual inversions |
| `controlnet` | ControlNet models |
| `upscale_models` | Upscaler models |

## Returns

```json
{
  "success": true,
  "modelType": "checkpoints",
  "models": [
    "dreamshaper_8.safetensors",
    "sd_xl_base_1.0.safetensors",
    "realisticVision_v51.safetensors"
  ],
  "total": 3
}
```

## Notes

- Part of **registry** discovery (models AVAILABLE to use)
- Only call when user asks to add/change models
- Model names match what appears in widget dropdowns
- For keyword search, use [search_available_models](./search_available_models.md)
- Use [get_widget_options](../widgets/get_widget_options.md) to see what's currently selectable in a specific widget
