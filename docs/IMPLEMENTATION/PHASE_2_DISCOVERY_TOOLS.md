# Phase 2: Discovery Tools

**Priority**: High
**Files**: `web/js/claude_chat.js`, `web/js/workflow_api.js`
**Status**: ✅ COMPLETE

## Objective

Implement the two-domain discovery model: Workflow (canvas) vs Registry (installation).

## Implementation Summary

### Changes Made

1. **Workflow Domain Methods** (`workflow_api.js:88-285`)
   - Added `listNodes({ verbose })` - compact or detailed node listing
   - Added `_getWidgetSummary()` - helper for verbose mode
   - Added `_getConnectionSummary()` - helper for verbose mode
   - Added `findNodesAdvanced(where)` - advanced filtering with where clause

2. **Discovery Tools** (`claude_chat.js:91-156`)
   - `list_nodes` - returns all workflow nodes (compact or verbose)
   - `get_node` - unified for both id (workflow) and type (registry)
   - `list_types` - list available node types by category
   - `search_types` - text search across node types
   - Legacy `search_node_types` and `get_node_schema` preserved with deprecation warnings

3. **find_nodes Enhancement** (`claude_chat.js:542-545`)
   - Now uses `findNodesAdvanced()` with `where` filters
   - Supports: type, title, bypassed, has_disconnected_inputs, in_group, widget

## Domain Model

| Domain | Question | Documented Tools | Current Tools |
|--------|----------|-----------------|---------------|
| Workflow | "What's in my workflow?" | list_nodes, find_nodes, get_node(id) | get_workflow, findNodesAdvanced |
| Registry | "What's available?" | list_types, search_types, get_node(type) | search_node_types, get_node_schema |

## Tasks

### Gate 1: Workflow Domain Tools

- [x] **T1.1** Implement `list_nodes` tool
  ```javascript
  'list_nodes': (params) => {
      const verbose = params?.verbose || false;
      return this.workflowAPI.listNodes({ verbose });
  }
  ```

- [x] **T1.2** Add `listNodes()` to workflow_api.js
  ```javascript
  listNodes({ verbose = false }) {
      const nodes = app.graph._nodes || [];
      if (verbose) {
          return {
              success: true,
              nodes: nodes.map(n => ({
                  id: n.id,
                  type: n.type,
                  title: n.title,
                  widgets: this._getWidgetSummary(n),
                  connections: this._getConnectionSummary(n)
              }))
          };
      }
      return {
          success: true,
          nodes: nodes.map(n => ({
              id: n.id,
              type: n.type.split('/').pop()
          }))
      };
  }
  ```

- [x] **T1.3** Update `find_nodes` to use `where` parameter
  ```javascript
  'find_nodes': (params) => {
      // Support both old 'query' and new 'where' params
      const where = params?.where || params?.query || {};
      return this.findNodesAdvanced(where);
  }
  ```

- [x] **T1.4** Add filters to find_nodes
  - `where.type` - exact type match
  - `where.has_disconnected_inputs` - boolean
  - `where.in_group` - group name
  - `where.bypassed` - boolean
  - `where.widget` - {name, value} match

**Verification**:
- `list_nodes` returns all nodes in compact format
- `find_nodes where.type="KSampler"` returns matching IDs

### Gate 2: Registry Domain Tools

- [x] **T2.1** Implement `list_types` tool
  ```javascript
  'list_types': (params) => {
      return this.workflowAPI.listNodeTypes(null, params?.category);
  }
  ```

- [x] **T2.2** Add category filtering to listNodeTypes (already existed)
  ```javascript
  listNodeTypes(query = null, category = null) {
      let types = Object.keys(LiteGraph.registered_node_types);

      if (category) {
          types = types.filter(t =>
              t.toLowerCase().includes(category.toLowerCase())
          );
      }

      if (query) {
          types = types.filter(t =>
              t.toLowerCase().includes(query.toLowerCase())
          );
      }

      return { success: true, types, count: types.length };
  }
  ```

- [x] **T2.3** Implement `search_types` tool
  ```javascript
  'search_types': (params) => {
      return this.workflowAPI.listNodeTypes(params?.query);
  }
  ```

- [x] **T2.4** Unify `get_node` for both domains
  ```javascript
  'get_node': (params) => {
      // If 'id' provided → workflow node details
      if (params?.id !== undefined) {
          return this.workflowAPI.getNodeDetails(params.id);
      }
      // If 'type' provided → registry schema
      if (params?.type) {
          return this.workflowAPI.getNodeSchema(params.type);
      }
      // If both → return both
      if (params?.id !== undefined && params?.schema) {
          const node = this.workflowAPI.getNodeDetails(params.id);
          if (node.success) {
              node.schema = this.workflowAPI.getNodeSchema(node.type);
          }
          return node;
      }
      return { success: false, error: "Provide 'id' for workflow node or 'type' for schema" };
  }
  ```

**Verification**:
- `list_types category="loaders"` returns loader types
- `search_types query="face"` finds face-related nodes
- `get_node id=5` returns workflow node
- `get_node type="KSampler"` returns schema

### Gate 3: Response Format Alignment

- [x] **T3.1** Update list_nodes return format
  ```json
  {
      "success": true,
      "nodes": [
          {"id": 1, "type": "CheckpointLoaderSimple"},
          {"id": 5, "type": "KSampler"}
      ],
      "count": 12
  }
  ```

- [x] **T3.2** Update find_nodes return format
  ```json
  {
      "success": true,
      "matches": [5, 6, 12],
      "count": 3
  }
  ```

- [x] **T3.3** Update list_types return format
  ```json
  {
      "success": true,
      "types": ["CheckpointLoaderSimple", "LoraLoader", ...],
      "count": 245,
      "category": "loaders"
  }
  ```

**Verification**: Response JSON matches documented schemas

### Gate 4: Legacy Compatibility

- [x] **T4.1** Keep `get_workflow_summary` as alias
- [x] **T4.2** Keep `search_node_types` as alias
- [x] **T4.3** Add deprecation console.warn in code
- [ ] **T4.4** Update prompts.py if tool names referenced (deferred - backend update)

**Verification**: Old tool names still work, new names preferred

## Completion Criteria

- [x] All T* tasks complete (except T4.4 backend update)
- [x] `list_nodes`, `find_nodes` functional for workflow domain
- [x] `list_types`, `search_types` functional for registry domain
- [x] `get_node` unified for both domains
- [x] Return formats match documentation
- [x] Legacy tools still work

## Test Scenarios

1. `list_nodes` on 20-node workflow → returns 20 entries
2. `find_nodes where.type="KSampler"` → returns sampler node IDs
3. `list_types category="loaders"` → returns loader types only
4. `search_types query="upscale"` → finds upscale-related nodes
5. `get_node id=5` → returns workflow node #5
6. `get_node type="KSampler"` → returns input/output schema
