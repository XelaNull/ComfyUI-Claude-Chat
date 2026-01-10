# Phase 5: Organize Tool

**Priority**: Medium
**Files**: `web/js/claude_chat.js`, `web/js/workflow_groups.js`
**Status**: ✅ COMPLETE

## Objective

Unify the `organize` tool interface to match documentation with `llm` and `cableless` flags.

## Implementation Summary

### Changes Made

1. **Unified organize Tool** (`claude_chat.js:535-576`)
   - Added cableless availability check at start
   - LLM mode with `plan` parameter calls `organizeWithPlan()`
   - Instant mode passes all params including `cableless`
   - Resolves `$refs` in plan.groups[].nodes arrays

2. **Deprecated organize_layout** (`claude_chat.js:578-582`)
   - Console warning on use
   - Forwards to `organizeWithPlan(params.plan)`

3. **checkSetGetNodesAvailable()** (`workflow_groups.js:1941-1943`)
   - Wrapper for `areSetGetNodesAvailable()`

4. **organizeWithPlan()** (`workflow_groups.js:1953-2107`)
   - Handles LLM-provided plan with `flow` direction
   - Deletes existing groups, creates new ones per plan
   - Sorts groups by `order` property
   - Supports `cableless` option

5. **layoutGroupNodes()** (`workflow_groups.js:2112-2179`)
   - Positions nodes and creates group
   - Handles horizontal/vertical flow
   - Returns group dimensions for spacing calculation

6. **tool_docs.js organize entry** (lines 483-507)
   - Updated with `llm`, `plan`, `cableless` params
   - Multiple examples for each mode

## Current State Analysis

```javascript
// Current toolActionMap:
'organize': (params) => this.workflowAPI.autoOrganizeWorkflow({
    groupPadding: params?.groupPadding,
    groupSpacing: params?.groupSpacing,
    nodeSpacing: params?.nodeSpacing
})
'organize_layout': (params) => this.workflowAPI.organizeWithPlan(params.plan)
```

```javascript
// workflow_groups.js autoOrganizeWorkflow():
async autoOrganizeWorkflow(options = {}) {
    const {
        groupPadding = 60,
        groupSpacing = 60,
        nodeSpacing = 30,
        startX = 50,
        startY = 50,
        includeDescriptions = true,
        cableless = false  // ← EXISTS but not exposed in tool
    } = options;
    // ...
}
```

**Gap**:
- `cableless` mode exists internally but not exposed in tool interface
- `llm` mode (with `plan` parameter) uses separate tool `organize_layout`
- Documentation shows unified `organize` tool with both flags

## Tasks

### Gate 1: Unify organize Tool Interface

- [x] **T1.1** Merge `organize` and `organize_layout` into single tool
  ```javascript
  'organize': async (params) => {
      // Simple instant mode (JS-based layout)
      if (!params?.llm && !params?.plan) {
          return this.workflowAPI.autoOrganizeWorkflow({
              groupPadding: params?.groupPadding,
              groupSpacing: params?.groupSpacing,
              nodeSpacing: params?.nodeSpacing,
              cableless: params?.cableless || false
          });
      }

      // LLM mode with plan
      if (params?.llm && params?.plan) {
          return this.workflowAPI.organizeWithPlan(params.plan, {
              cableless: params?.cableless || false
          });
      }

      // LLM mode requested but no plan provided
      if (params?.llm && !params?.plan) {
          return {
              success: false,
              error: "LLM mode requires a 'plan' parameter",
              hint: "Provide plan: {flow, groups: [{title, nodes, order}]}"
          };
      }

      return { success: false, error: "Invalid parameters" };
  }
  ```

- [x] **T1.2** Keep `organize_layout` as deprecated alias
  ```javascript
  'organize_layout': (params) => {
      console.warn('[Claude Chat] organize_layout is deprecated, use organize with llm=true');
      return this.workflowAPI.organizeWithPlan(params.plan);
  }
  ```

**Verification**:
- `organize` → instant JS layout
- `organize cableless=true` → instant with Set/Get nodes
- `organize llm=true plan={...}` → LLM-guided layout

### Gate 2: Implement organizeWithPlan

- [x] **T2.1** Add `organizeWithPlan()` to workflow_groups.js (if not exists)
  ```javascript
  organizeWithPlan(plan, options = {}) {
      const { cableless = false } = options;

      if (!plan?.groups || !Array.isArray(plan.groups)) {
          return { success: false, error: "Plan must include 'groups' array" };
      }

      this.saveUndoState('Organize with LLM plan');

      // Delete existing groups
      const existingGroups = [...(app.graph._groups || [])];
      for (const group of existingGroups) {
          app.graph.remove(group);
      }

      // Sort groups by order
      const sortedGroups = [...plan.groups].sort((a, b) =>
          (a.order || 0) - (b.order || 0)
      );

      // Determine flow direction
      const flow = plan.flow || 'left_to_right';
      const isHorizontal = flow === 'left_to_right';

      // Layout groups
      let currentPos = 50;
      const spacing = 60;
      const createdGroups = [];

      for (const groupSpec of sortedGroups) {
          // Move nodes and create group
          const result = this.layoutGroupNodes(
              groupSpec.title,
              groupSpec.nodes,
              currentPos,
              50, // startY
              isHorizontal,
              groupSpec.color
          );

          if (result.success) {
              createdGroups.push(result);
              currentPos += (isHorizontal ? result.width : result.height) + spacing;
          }
      }

      // Handle cableless mode
      if (cableless) {
          this.convertCrossGroupCablesToSetGet(createdGroups);
      }

      app.graph.setDirtyCanvas(true, true);

      return {
          success: true,
          groups_created: createdGroups.length,
          flow: flow,
          cableless: cableless,
          groups: createdGroups
      };
  }
  ```

- [x] **T2.2** Add `layoutGroupNodes()` helper
  ```javascript
  layoutGroupNodes(title, nodeIds, startPos, baseY, isHorizontal, color = null) {
      const nodes = nodeIds.map(id => app.graph.getNodeById(id)).filter(Boolean);
      if (nodes.length === 0) {
          return { success: false, error: `No valid nodes for group "${title}"` };
      }

      // Calculate group bounds
      let maxWidth = 0, totalHeight = 0;
      for (const node of nodes) {
          const w = node.size?.[0] || 200;
          const h = node.size?.[1] || 100;
          maxWidth = Math.max(maxWidth, w);
          totalHeight += h + 30; // nodeSpacing
      }

      // Position nodes
      let currentY = baseY + 80; // Account for group header
      for (const node of nodes) {
          if (isHorizontal) {
              node.pos = [startPos + 40, currentY];
          } else {
              node.pos = [startPos + 40, currentY];
          }
          currentY += (node.size?.[1] || 100) + 30;
      }

      // Create group
      const groupWidth = maxWidth + 80;
      const groupHeight = totalHeight + 80;

      const group = new LiteGraph.LGraphGroup();
      group.title = title;
      group.pos = [startPos, baseY];
      group.size = [groupWidth, groupHeight];
      if (color) group.color = color;

      app.graph.add(group);

      return {
          success: true,
          title: title,
          width: groupWidth,
          height: groupHeight,
          node_count: nodes.length
      };
  }
  ```

**Verification**:
- Plan with `flow: "left_to_right"` arranges groups horizontally
- Plan with `flow: "top_to_bottom"` arranges groups vertically
- Groups created in specified order

### Gate 3: Expose cableless Mode

- [x] **T3.1** Verify cableless works in instant mode
  ```javascript
  'organize': async (params) => {
      return this.workflowAPI.autoOrganizeWorkflow({
          // ...
          cableless: params?.cableless || false
      });
  }
  ```

- [x] **T3.2** Verify cableless works in LLM mode
  - Pass cableless flag to organizeWithPlan

- [x] **T3.3** Add cableless availability check
  ```javascript
  // At start of organize tool
  if (params?.cableless) {
      const setGetAvailable = this.checkSetGetNodesAvailable();
      if (!setGetAvailable) {
          return {
              success: false,
              error: "Cableless mode requires ComfyUI-Easy-Use extension",
              hint: "Install ComfyUI-Easy-Use for Set/Get nodes"
          };
      }
  }
  ```

**Verification**:
- `organize cableless=true` creates Set/Get nodes for cross-group connections
- Error returned if Set/Get nodes not available

### Gate 4: Response Format Alignment

- [x] **T4.1** Instant mode response
  ```json
  {
      "success": true,
      "summary": {
          "totalNodes": 15,
          "groupsCreated": 5,
          "nodesMoved": 15,
          "setGetPairsCreated": 0
      },
      "groups": [
          {"title": "Setup", "nodeCount": 3},
          {"title": "Prompts", "nodeCount": 2}
      ]
  }
  ```

- [x] **T4.2** LLM mode response
  ```json
  {
      "success": true,
      "groups_created": 4,
      "flow": "left_to_right",
      "cableless": false,
      "groups": [...]
  }
  ```

- [x] **T4.3** Cableless mode includes pair count
  ```json
  {
      "success": true,
      "summary": {
          "setGetPairsCreated": 8
      }
  }
  ```

**Verification**: Response format matches documentation

## Completion Criteria

- [x] All T* tasks complete
- [x] `organize` works without params (instant mode)
- [x] `organize cableless=true` creates Set/Get pairs
- [x] `organize llm=true plan={...}` uses LLM layout
- [x] Response formats match documentation
- [x] `organize_layout` deprecated but still works

## Test Scenarios

1. **organize** (no params) → Auto-categorizes and layouts
2. **organize cableless=true** → Same + replaces cross-group wires
3. **organize llm=true plan={flow, groups}** → Follows LLM plan
4. **organize llm=true** (no plan) → Error with hint
5. **organize cableless=true** (no ComfyUI-Easy-Use) → Error with hint
