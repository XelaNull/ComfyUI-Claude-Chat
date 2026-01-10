# Phase 4: Group Tools

**Priority**: Medium
**Files**: `web/js/claude_chat.js`, `web/js/workflow_groups.js`
**Status**: ✅ COMPLETE

## Objective

Complete the group management toolset: add `split_group` and enhance `update_group`.

## Implementation Summary

### Changes Made

1. **Helper Methods** (`workflow_groups.js:1685-1735`)
   - `_isNodeInGroup(node, group)` - check if node is inside group
   - `_getNodesInGroup(group)` - get all node IDs inside a group
   - `_refitGroupToNodes(group, nodeIds, padding)` - resize group to fit nodes

2. **splitGroup() Method** (`workflow_groups.js:1738-1833`)
   - Splits group into multiple new groups
   - Validates all nodes in 'into' are in source group
   - Preserves original group color if not specified

3. **Enhanced updateGroup()** (`workflow_groups.js:1836-1935`)
   - Added add_nodes param - adds nodes and refits group
   - Added remove_nodes param - moves nodes outside group
   - Added pos/size params for manual positioning

4. **Tool Updates** (`claude_chat.js:499-508`)
   - Added `split_group` tool with $ref resolution
   - Enhanced `update_group` to pass all new params

5. **Documentation** (`tool_docs.js`)
   - Updated split_group and update_group documentation

## Current State Analysis

```javascript
// Current group tools in toolActionMap:
'create_group': ✓ implemented
'delete_group': ✓ implemented
'update_group': ✓ enhanced with add_nodes, remove_nodes, pos, size
'move_to_group': ✓ implemented
'merge_groups': ✓ implemented
'detect_group_issues': ✓ implemented
'split_group': ✓ implemented
```

## Tasks

### Gate 1: Implement split_group Tool

- [x] **T1.1** Add `split_group` to toolActionMap
  ```javascript
  'split_group': (params) => {
      return this.workflowAPI.splitGroup(params.split);
  }
  ```

- [x] **T1.2** Implement `splitGroup()` in workflow_groups.js
  ```javascript
  splitGroup(split) {
      const { group, into } = split;

      // Find existing group
      const groups = app.graph._groups || [];
      const sourceGroup = typeof group === 'number'
          ? groups[group]
          : groups.find(g => g.title === group);

      if (!sourceGroup) {
          return { success: false, error: `Group not found: ${group}` };
      }

      this.saveUndoState(`Split group: ${sourceGroup.title}`);

      // Get nodes currently in the source group
      const nodesInGroup = this._getNodesInGroup(sourceGroup);

      // Validate 'into' spec - all nodes must be in original group
      for (const newGroup of into) {
          for (const nodeId of newGroup.nodes) {
              if (!nodesInGroup.includes(nodeId)) {
                  return {
                      success: false,
                      error: `Node ${nodeId} not in source group`
                  };
              }
          }
      }

      // Delete original group
      app.graph.remove(sourceGroup);

      // Create new groups
      const createdGroups = [];
      for (const spec of into) {
          const result = this.createGroupForNodes(
              spec.title,
              spec.nodes,
              spec.color || sourceGroup.color,
              60
          );
          if (result.success) {
              createdGroups.push({
                  title: spec.title,
                  nodes: spec.nodes,
                  index: result.group_index
              });
          }
      }

      return {
          success: true,
          original_group: sourceGroup.title,
          new_groups: createdGroups,
          message: `Split "${sourceGroup.title}" into ${createdGroups.length} groups`
      };
  }
  ```

- [x] **T1.3** Add `_getNodesInGroup()` helper
  ```javascript
  _getNodesInGroup(group) {
      const nodeIds = [];
      for (const node of app.graph._nodes) {
          if (this._isNodeInGroup(node, group)) {
              nodeIds.push(node.id);
          }
      }
      return nodeIds;
  }

  _isNodeInGroup(node, group) {
      const nw = node.size?.[0] || 200;
      const nh = node.size?.[1] || 100;
      return node.pos[0] >= group.pos[0] &&
             node.pos[1] >= group.pos[1] &&
             node.pos[0] + nw <= group.pos[0] + group.size[0] &&
             node.pos[1] + nh <= group.pos[1] + group.size[1];
  }
  ```

**Verification**:
- Split a group with 5 nodes into 2 groups with 2 and 3 nodes
- Original group deleted
- New groups created with correct nodes

### Gate 2: Enhance update_group Tool

- [x] **T2.1** Add `add_nodes` parameter to update_group
  ```javascript
  'update_group': (params) => {
      let updates = params.updates || [{ ...params }];

      const results = updates.map(update => {
          const result = this.workflowAPI.updateGroup(update.group, {
              title: update.title,
              color: update.color,
              pos: update.pos,
              size: update.size,
              add_nodes: update.add_nodes,
              remove_nodes: update.remove_nodes
          });
          return result;
      });

      return updates.length === 1 ? results[0] : { success: true, results };
  }
  ```

- [x] **T2.2** Update `updateGroup()` in workflow_groups.js
  ```javascript
  updateGroup(groupRef, updates) {
      const groups = app.graph._groups || [];
      const group = typeof groupRef === 'number'
          ? groups[groupRef]
          : groups.find(g => g.title === groupRef);

      if (!group) {
          return { success: false, error: `Group not found: ${groupRef}` };
      }

      this.saveUndoState(`Update group: ${group.title}`);

      // Apply simple updates
      if (updates.title) group.title = updates.title;
      if (updates.color) group.color = updates.color;
      if (updates.pos) {
          group.pos[0] = updates.pos[0];
          group.pos[1] = updates.pos[1];
      }
      if (updates.size) {
          group.size[0] = updates.size[0];
          group.size[1] = updates.size[1];
      }

      // Handle node membership changes
      if (updates.add_nodes || updates.remove_nodes) {
          // Get current nodes in group
          let currentNodes = this._getNodesInGroup(group);

          // Remove specified nodes (move outside group bounds)
          if (updates.remove_nodes) {
              for (const nodeId of updates.remove_nodes) {
                  const node = app.graph.getNodeById(nodeId);
                  if (node) {
                      // Move node outside group (to the right)
                      node.pos[0] = group.pos[0] + group.size[0] + 50;
                  }
                  currentNodes = currentNodes.filter(id => id !== nodeId);
              }
          }

          // Add specified nodes and resize group to fit
          if (updates.add_nodes) {
              currentNodes = [...currentNodes, ...updates.add_nodes];
          }

          // Refit group to contain all nodes
          if (currentNodes.length > 0) {
              this._refitGroupToNodes(group, currentNodes);
          }
      }

      app.graph.setDirtyCanvas(true, true);

      return {
          success: true,
          title: group.title,
          bounds: {
              x: group.pos[0], y: group.pos[1],
              width: group.size[0], height: group.size[1]
          }
      };
  }
  ```

- [x] **T2.3** Add `_refitGroupToNodes()` helper
  ```javascript
  _refitGroupToNodes(group, nodeIds, padding = 60) {
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;

      for (const nodeId of nodeIds) {
          const node = app.graph.getNodeById(nodeId);
          if (!node) continue;

          const nw = node.size?.[0] || 200;
          const nh = node.size?.[1] || 100;

          minX = Math.min(minX, node.pos[0]);
          minY = Math.min(minY, node.pos[1]);
          maxX = Math.max(maxX, node.pos[0] + nw);
          maxY = Math.max(maxY, node.pos[1] + nh);
      }

      if (minX !== Infinity) {
          group.pos[0] = minX - padding;
          group.pos[1] = minY - padding - 30;
          group.size[0] = (maxX - minX) + padding * 2;
          group.size[1] = (maxY - minY) + padding * 2 + 30;
      }
  }
  ```

**Verification**:
- `update_group group=1 add_nodes=[5,6]` expands group to include nodes
- `update_group group=1 remove_nodes=[3]` removes node from group
- `update_group group=1 pos=[100,100] size=[500,400]` repositions group

### Gate 3: Response Format Alignment

- [x] **T3.1** Verify split_group response matches docs
  ```json
  {
      "success": true,
      "original_group": "Loaders",
      "new_groups": [
          {"title": "Checkpoints", "nodes": [1], "index": 0},
          {"title": "LoRAs", "nodes": [2, 3], "index": 1}
      ]
  }
  ```

- [x] **T3.2** Verify update_group response matches docs
  ```json
  {
      "success": true,
      "title": "Updated Title",
      "bounds": {"x": 100, "y": 100, "width": 500, "height": 400}
  }
  ```

- [x] **T3.3** Add error hints for common issues
  ```javascript
  if (!group) {
      return {
          success: false,
          error: `Group not found: ${groupRef}`,
          hint: "Use list_groups to see available groups"
      };
  }
  ```

**Verification**: Error responses include helpful hints

## Completion Criteria

- [x] All T* tasks complete
- [x] `split_group` fully functional
- [x] `update_group` supports add_nodes/remove_nodes
- [x] Response formats match documentation
- [x] Error responses include hints

## Test Scenarios

1. **split_group** - Split "Loaders" into "Checkpoints" and "LoRAs"
2. **update_group add_nodes** - Add node 5 to group "Generation"
3. **update_group remove_nodes** - Remove node 3 from group
4. **update_group pos/size** - Manually reposition group
5. **Error: invalid group** - Returns hint to use list_groups
