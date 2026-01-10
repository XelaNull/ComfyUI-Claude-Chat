# detect_layout_issues

Find visual/layout problems in the workflow.

## Syntax

```json
{"tool": "detect_layout_issues"}
{"tool": "detect_layout_issues", "options": {"min_spacing": 20}}
```

## Returns

```json
{
  "overlapping_nodes": [
    {"nodes": [3, 7], "overlap_area": 1200, "suggestion": "Move #7 right by 150px"}
  ],
  "cramped_areas": [
    {"bounds": [400, 100, 600, 300], "nodes": [2, 3, 4], "density": "high"}
  ],
  "disconnected_regions": [
    {"nodes": [11], "issue": "Isolated from main flow"}
  ],
  "poor_alignment": [
    {"nodes": [4, 5], "issue": "Same X but different widths, looks misaligned"}
  ]
}
```

## Issues Detected

| Issue | Description |
|-------|-------------|
| `overlapping_nodes` | Nodes that visually overlap |
| `cramped_areas` | Dense clusters of nodes |
| `disconnected_regions` | Nodes isolated from main flow |
| `poor_alignment` | Nodes that look misaligned |

## Notes

- Use before [organize](../highlevel/organize.md) to see problems
- Suggestions include specific fixes (e.g., "move right by 150px")
