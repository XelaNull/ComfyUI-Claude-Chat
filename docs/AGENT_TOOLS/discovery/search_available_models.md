# search_available_models

Search available models by keyword.

## Syntax

```json
{"tool": "search_available_models", "type": "checkpoints", "query": "sdxl"}
{"tool": "search_available_models", "type": "loras", "query": "detail"}
{"tool": "search_available_models", "type": "embeddings", "query": "bad"}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Model type to search |
| `query` | string | Yes | Search term |

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
  "modelType": "loras",
  "models": [
    "add_detail.safetensors",
    "more_details.safetensors"
  ],
  "total": 2
}
```

## Examples

Find SDXL checkpoints:
```json
{"tool": "search_available_models", "type": "checkpoints", "query": "sdxl"}
```

Find detail-related LoRAs:
```json
{"tool": "search_available_models", "type": "loras", "query": "detail"}
```

## Notes

- Part of **registry** discovery (models AVAILABLE to use)
- Matches against model filename (case-insensitive)
- Use this to check if a specific model exists before setting it in a widget
- For full listing, use [list_available_models](./list_available_models.md)
