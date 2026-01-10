# detect_group_issues

Find problems with group layout and organization.

## Syntax

```json
{"tool": "detect_group_issues"}
```

## Returns

```json
{
  "overlapping_groups": [
    {"group1": 1, "group2": 3, "overlap_percent": 45}
  ],
  "duplicate_names": [
    {"name": "Loaders", "groups": [1, 4]}
  ],
  "empty_groups": [2],
  "oversized_groups": [
    {"group": 5, "node_count": 15, "suggestion": "Consider splitting"}
  ]
}
```

## Issues Detected

| Issue | Description |
|-------|-------------|
| `overlapping_groups` | Groups that visually overlap |
| `duplicate_names` | Multiple groups with same title |
| `empty_groups` | Groups with no nodes |
| `oversized_groups` | Groups with many nodes (>10) |

## Notes

- Use before [organize](../highlevel/organize.md) to understand current state
- Helps identify groups that should be merged or split
