# create_node_link

Connect nodes by creating links between outputs and inputs.

## Syntax

```json
{"tool": "create_node_link", "links": [
  {"from": "$ckpt", "from_slot": 0, "to": "$sampler", "to_slot": 0},
  {"from": 1, "from_slot": 1, "to": 3, "to_slot": 0}
]}
```

## Parameters (per link)

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `from` | int/$ref | Yes | Source node |
| `from_slot` | int | Yes | Output slot index (0-based) |
| `to` | int/$ref | Yes | Target node |
| `to_slot` | int | Yes | Input slot index (0-based) |

## Returns

```json
{"success": true, "links": 2}
```

## Common Slot Patterns

**CheckpointLoaderSimple outputs:**
- Slot 0: MODEL
- Slot 1: CLIP
- Slot 2: VAE

**KSampler inputs:**
- Slot 0: model (MODEL)
- Slot 1: positive (CONDITIONING)
- Slot 2: negative (CONDITIONING)
- Slot 3: latent_image (LATENT)

**KSampler output:**
- Slot 0: LATENT

## Example

Connect a basic txt2img flow:
```json
{"tool": "create_node_link", "links": [
  {"from": "$ckpt", "from_slot": 0, "to": "$sampler", "to_slot": 0},
  {"from": "$ckpt", "from_slot": 1, "to": "$pos", "to_slot": 0},
  {"from": "$ckpt", "from_slot": 1, "to": "$neg", "to_slot": 0},
  {"from": "$pos", "from_slot": 0, "to": "$sampler", "to_slot": 1},
  {"from": "$neg", "from_slot": 0, "to": "$sampler", "to_slot": 2},
  {"from": "$latent", "from_slot": 0, "to": "$sampler", "to_slot": 3},
  {"from": "$sampler", "from_slot": 0, "to": "$decode", "to_slot": 0},
  {"from": "$ckpt", "from_slot": 2, "to": "$decode", "to_slot": 1}
]}
```

## Notes

- Use [get_node](./get_node.md) with `type` param to see slot indices
- Supports $refs from [create_node](./create_node.md) in same batch
- If input already has a link, it's replaced
- Error hints show valid slot names if wrong index used
