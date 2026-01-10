# get_node

Smart lookup for workflow node details OR type schema. Domain inferred from parameters.

## Syntax

```json
// WORKFLOW: get node by ID
{"tool": "get_node", "id": 5}
{"tool": "get_node", "ids": [5, 6, 7]}

// REGISTRY: get type schema
{"tool": "get_node", "type": "KSampler"}
{"tool": "get_node", "types": ["KSampler", "KSamplerAdvanced"]}

// BOTH: node details + its type schema
{"tool": "get_node", "id": 5, "schema": true}
```

## Parameters

| Param | Type | Description |
|-------|------|-------------|
| `id` | int | Workflow node ID → returns node details |
| `ids` | array | Multiple node IDs → returns array |
| `type` | string | Type name → returns schema |
| `types` | array | Multiple types → returns array |
| `schema` | bool | When true with `id`, also returns type schema |

## Returns (Workflow Node)

```json
{
  "node": {
    "id": 5,
    "type": "KSampler",
    "title": "Sampler",
    "pos": [400, 200],
    "size": [280, 320],
    "widgets": {"steps": 20, "cfg": 7.5, "sampler_name": "euler"},
    "inputs": [
      {"name": "model", "type": "MODEL", "link": 1},
      {"name": "positive", "type": "CONDITIONING", "link": 3}
    ],
    "outputs": [
      {"name": "LATENT", "type": "LATENT", "links": [7]}
    ]
  }
}
```

## Returns (Type Schema)

```json
{
  "schema": {
    "type": "KSampler",
    "category": "sampling",
    "display_name": "KSampler",
    "inputs": [
      {"name": "model", "type": "MODEL", "required": true},
      {"name": "positive", "type": "CONDITIONING", "required": true},
      {"name": "negative", "type": "CONDITIONING", "required": true},
      {"name": "latent_image", "type": "LATENT", "required": true}
    ],
    "outputs": [
      {"name": "LATENT", "type": "LATENT", "slot": 0}
    ],
    "widgets": [
      {"name": "seed", "type": "INT", "default": 0},
      {"name": "steps", "type": "INT", "default": 20, "min": 1, "max": 10000},
      {"name": "cfg", "type": "FLOAT", "default": 8.0},
      {"name": "sampler_name", "type": "COMBO", "options": ["euler", "dpmpp_2m", ...]},
      {"name": "scheduler", "type": "COMBO", "options": ["normal", "karras", ...]}
    ]
  }
}
```

## Notes

- **id** → workflow domain (instances on canvas)
- **type** → registry domain (available templates)
- Use `schema: true` when you need both node state and slot definitions
- Schema shows slot indices, useful for [create_link](./create_link.md)
