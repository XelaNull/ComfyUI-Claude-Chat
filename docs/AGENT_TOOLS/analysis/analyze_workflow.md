# analyze_workflow

Comprehensive workflow analysis covering validation, layout, and optimization.

## Syntax

```json
{"tool": "analyze_workflow"}
```

## Returns

```json
{
  "validation": {
    "is_valid": false,
    "errors": [
      {"node": 6, "issue": "Required input 'latent_image' not connected"}
    ],
    "warnings": [
      {"node": 4, "issue": "Empty prompt text"}
    ]
  },
  "layout": {
    "overlapping_nodes": [[3, 7], [5, 8]],
    "overlapping_groups": [],
    "nodes_outside_groups": [4, 5, 6],
    "suggested_flow": "left_to_right"
  },
  "optimization": {
    "unused_nodes": [11],
    "duplicate_nodes": [
      {"type": "LoraLoader", "nodes": [2, 3], "same_settings": true}
    ],
    "suggestions": [
      "Nodes #2 and #3 are identical - consider removing duplicate",
      "Node #11 has no effect on output"
    ]
  },
  "complexity": {
    "node_count": 12,
    "connection_count": 15,
    "group_count": 2,
    "depth": 6,
    "branches": 2
  }
}
```

## Sections

| Section | Purpose |
|---------|---------|
| `validation` | Can workflow execute? |
| `layout` | Visual organization issues |
| `optimization` | Redundancy and efficiency |
| `complexity` | Workflow metrics |

## Notes

- Combines [validate_workflow](./validate_workflow.md), [detect_layout_issues](./detect_layout_issues.md), and more
- Use for comprehensive review or optimization requests
- More expensive than individual analysis tools
