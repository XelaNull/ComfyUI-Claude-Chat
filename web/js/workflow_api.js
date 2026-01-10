/**
 * ComfyUI Workflow API for Claude Chat
 *
 * Exposes LiteGraph operations for workflow modification.
 * This module provides a clean interface between Claude's backend
 * and ComfyUI's graph engine.
 */

// ComfyUI API - use new window.comfyAPI pattern (ComfyUI 1.35+)
const { app } = window.comfyAPI?.app ?? await import("../../../scripts/app.js");

import { GroupMethods } from "./workflow_groups.js";

class WorkflowAPI {
    constructor() {
        this.undoStack = [];
        this.maxUndoLevels = 20;
    }

    // =========================================================================
    // UNDO SUPPORT
    // =========================================================================

    /**
     * Save current workflow state for undo
     */
    saveUndoState(description = "modification") {
        try {
            const state = {
                description,
                timestamp: Date.now(),
                workflow: JSON.stringify(app.graph.serialize())
            };
            this.undoStack.push(state);
            if (this.undoStack.length > this.maxUndoLevels) {
                this.undoStack.shift();
            }
            console.log(`[WorkflowAPI] Saved undo state: ${description}`);
            return true;
        } catch (e) {
            console.error('[WorkflowAPI] Failed to save undo state:', e);
            return false;
        }
    }

    /**
     * Restore previous workflow state
     */
    undo() {
        if (this.undoStack.length === 0) {
            return { success: false, error: "Nothing to undo" };
        }
        try {
            const state = this.undoStack.pop();
            const workflow = JSON.parse(state.workflow);
            // Wrapped in try-catch because buggy third-party extensions may throw during nodeCreated events
            try {
                app.loadGraphData(workflow);
            } catch (extError) {
                console.warn('[WorkflowAPI] Extension error during graph reload (ignored):', extError.message);
            }
            console.log(`[WorkflowAPI] Undid: ${state.description}`);
            return { success: true, description: state.description };
        } catch (e) {
            console.error('[WorkflowAPI] Undo failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Get undo history
     */
    getUndoHistory() {
        return this.undoStack.map(s => ({
            description: s.description,
            timestamp: s.timestamp
        }));
    }

    // =========================================================================
    // DISCOVERY - Workflow Domain (what's in the canvas)
    // =========================================================================

    /**
     * List all nodes currently in the workflow
     * @param {Object} options - Options
     * @param {boolean} options.verbose - Include widgets and connections if true
     * @returns {Object} { success, nodes[], count }
     */
    listNodes({ verbose = false } = {}) {
        try {
            if (!app.graph) {
                return { success: false, error: "No graph loaded" };
            }

            const nodes = app.graph._nodes || [];

            if (verbose) {
                return {
                    success: true,
                    nodes: nodes.map(n => ({
                        id: n.id,
                        type: n.type,
                        title: n.title || n.type.split('/').pop(),
                        pos: { x: Math.round(n.pos[0]), y: Math.round(n.pos[1]) },
                        widgets: this._getWidgetSummary(n),
                        connections: this._getConnectionSummary(n),
                        mode: n.mode === 4 ? 'bypassed' : 'active'
                    })),
                    count: nodes.length
                };
            }

            return {
                success: true,
                nodes: nodes.map(n => ({
                    id: n.id,
                    type: n.type.split('/').pop()  // Short type name
                })),
                count: nodes.length
            };
        } catch (e) {
            console.error('[WorkflowAPI] listNodes failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Get widget summary for a node (used by listNodes verbose mode)
     * @private
     */
    _getWidgetSummary(node) {
        if (!node.widgets) return {};
        const summary = {};
        for (const w of node.widgets) {
            // Only include non-default interesting values
            if (w.value !== undefined && w.value !== null && w.value !== '') {
                summary[w.name] = w.value;
            }
        }
        return summary;
    }

    /**
     * Get connection summary for a node (used by listNodes verbose mode)
     * @private
     */
    _getConnectionSummary(node) {
        const summary = { inputs: [], outputs: [] };

        // Input connections
        if (node.inputs) {
            for (const inp of node.inputs) {
                if (inp.link) {
                    const link = app.graph.links?.[inp.link];
                    if (link) {
                        summary.inputs.push({
                            slot: inp.name,
                            from: link.origin_id,
                            from_slot: link.origin_slot
                        });
                    }
                }
            }
        }

        // Output connections
        if (node.outputs) {
            for (const out of node.outputs) {
                if (out.links && out.links.length > 0) {
                    for (const linkId of out.links) {
                        const link = app.graph.links?.[linkId];
                        if (link) {
                            summary.outputs.push({
                                slot: out.name,
                                to: link.target_id,
                                to_slot: link.target_slot
                            });
                        }
                    }
                }
            }
        }

        return summary;
    }

    /**
     * Find nodes matching advanced criteria
     * @param {Object} where - Filter criteria
     * @param {string} where.type - Exact type match
     * @param {string} where.title - Title contains (case-insensitive)
     * @param {boolean} where.has_disconnected_inputs - Has unconnected inputs
     * @param {string} where.in_group - Is inside specified group
     * @param {boolean} where.bypassed - Is bypassed (mode=4)
     * @param {Object} where.widget - {name, value} widget match
     * @returns {Object} { success, matches[], count }
     */
    findNodesAdvanced(where = {}) {
        try {
            if (!app.graph) {
                return { success: false, error: "No graph loaded" };
            }

            const nodes = app.graph._nodes || [];
            const matches = [];

            for (const node of nodes) {
                let match = true;

                // Type filter (exact or contains)
                if (where.type) {
                    const shortType = node.type.split('/').pop();
                    if (node.type !== where.type && shortType !== where.type) {
                        match = false;
                    }
                }

                // Title filter (contains, case-insensitive)
                if (match && where.title) {
                    const nodeTitle = node.title || node.type;
                    if (!nodeTitle.toLowerCase().includes(where.title.toLowerCase())) {
                        match = false;
                    }
                }

                // Bypassed filter
                if (match && where.bypassed !== undefined) {
                    const isBypassed = node.mode === 4;
                    if (where.bypassed !== isBypassed) {
                        match = false;
                    }
                }

                // Has disconnected inputs filter
                if (match && where.has_disconnected_inputs) {
                    const hasDisconnected = (node.inputs || []).some(inp => inp.link === null);
                    if (!hasDisconnected) {
                        match = false;
                    }
                }

                // In group filter
                if (match && where.in_group) {
                    const groups = (app.graph._groups || []).filter(g => g && g.pos && g.size);
                    let inGroup = false;
                    const nw = node.size?.[0] || 200;
                    const nh = node.size?.[1] || 100;

                    for (const g of groups) {
                        if (g.title === where.in_group ||
                            g.title.toLowerCase().includes(where.in_group.toLowerCase())) {
                            if (node.pos[0] >= g.pos[0] &&
                                node.pos[1] >= g.pos[1] &&
                                node.pos[0] + nw <= g.pos[0] + g.size[0] &&
                                node.pos[1] + nh <= g.pos[1] + g.size[1]) {
                                inGroup = true;
                                break;
                            }
                        }
                    }
                    if (!inGroup) match = false;
                }

                // Widget value filter
                if (match && where.widget) {
                    const { name, value } = where.widget;
                    const widget = node.widgets?.find(w => w.name === name);
                    if (!widget || widget.value !== value) {
                        match = false;
                    }
                }

                if (match) {
                    matches.push(node.id);
                }
            }

            return {
                success: true,
                matches,
                count: matches.length
            };
        } catch (e) {
            console.error('[WorkflowAPI] findNodesAdvanced failed:', e);
            return { success: false, error: e.message };
        }
    }

    // =========================================================================
    // DISCOVERY - Registry Domain (what's available to install)
    // =========================================================================

    /**
     * Get all available node types with optional filtering
     */
    listNodeTypes(search = null, category = null) {
        try {
            const nodeTypes = [];
            const registered = LiteGraph.registered_node_types;

            for (const [type, nodeClass] of Object.entries(registered)) {
                // Skip internal types
                if (type.startsWith("_")) continue;

                const info = {
                    type: type,
                    category: nodeClass.category || "unknown",
                    title: nodeClass.title || type.split("/").pop(),
                };

                // Apply filters
                if (category && !info.category.toLowerCase().includes(category.toLowerCase())) {
                    continue;
                }
                if (search) {
                    const searchLower = search.toLowerCase();
                    if (!info.type.toLowerCase().includes(searchLower) &&
                        !info.title.toLowerCase().includes(searchLower) &&
                        !info.category.toLowerCase().includes(searchLower)) {
                        continue;
                    }
                }

                nodeTypes.push(info);
            }

            return { success: true, nodeTypes: nodeTypes.slice(0, 100) }; // Limit results
        } catch (e) {
            console.error('[WorkflowAPI] listNodeTypes failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * List available models by type
     */
    async listModels(modelType, search = null) {
        try {
            // Fetch object_info from ComfyUI which contains all model lists
            const response = await fetch('/object_info');
            if (!response.ok) {
                return { success: false, error: 'Failed to fetch object_info' };
            }
            const objectInfo = await response.json();

            // Map model types to the nodes that have those model lists
            const modelTypeMap = {
                'checkpoints': ['CheckpointLoaderSimple', 'CheckpointLoader'],
                'loras': ['LoraLoader', 'LoraLoaderModelOnly'],
                'vae': ['VAELoader'],
                'embeddings': ['CLIPTextEncode'],  // Embeddings are used in prompts
                'controlnet': ['ControlNetLoader'],
                'upscale_models': ['UpscaleModelLoader']
            };

            const nodeTypes = modelTypeMap[modelType];
            if (!nodeTypes) {
                return { success: false, error: `Unknown model type: ${modelType}` };
            }

            let models = [];

            // Find models from the appropriate node type's input spec
            for (const nodeType of nodeTypes) {
                const nodeInfo = objectInfo[nodeType];
                if (nodeInfo && nodeInfo.input && nodeInfo.input.required) {
                    // Look for the model input field
                    for (const [fieldName, fieldSpec] of Object.entries(nodeInfo.input.required)) {
                        if (Array.isArray(fieldSpec) && Array.isArray(fieldSpec[0])) {
                            // This is a combo field with options
                            const options = fieldSpec[0];
                            if (options.length > 0 && typeof options[0] === 'string') {
                                // Filter by file extensions to identify model files
                                const modelExtensions = ['.safetensors', '.ckpt', '.pt', '.pth', '.bin'];
                                const isModelList = options.some(opt =>
                                    modelExtensions.some(ext => opt.toLowerCase().endsWith(ext)) ||
                                    modelType === 'embeddings' // Embeddings don't always have extensions
                                );
                                if (isModelList || fieldName.includes('name') || fieldName.includes('model')) {
                                    models = [...models, ...options];
                                }
                            }
                        }
                    }
                }
            }

            // Remove duplicates
            models = [...new Set(models)];

            // Apply search filter
            if (search) {
                const searchLower = search.toLowerCase();
                models = models.filter(m => m.toLowerCase().includes(searchLower));
            }

            return {
                success: true,
                modelType,
                models: models.slice(0, 100), // Limit results
                total: models.length
            };
        } catch (e) {
            console.error('[WorkflowAPI] listModels failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Get detailed schema for a specific node type
     */
    getNodeSchema(nodeType) {
        try {
            const nodeClass = LiteGraph.registered_node_types[nodeType];
            if (!nodeClass) {
                return { success: false, error: `Node type not found: ${nodeType}` };
            }

            // Create temporary node to extract widget info
            const tempNode = LiteGraph.createNode(nodeType);
            if (!tempNode) {
                return { success: false, error: `Failed to create node: ${nodeType}` };
            }

            const schema = {
                type: nodeType,
                title: nodeClass.title || nodeType,
                category: nodeClass.category || "unknown",
                inputs: [],
                outputs: [],
                widgets: []
            };

            // Extract inputs
            if (tempNode.inputs) {
                schema.inputs = tempNode.inputs.map((input, idx) => ({
                    index: idx,
                    name: input.name,
                    type: input.type,
                    link: input.link
                }));
            }

            // Extract outputs
            if (tempNode.outputs) {
                schema.outputs = tempNode.outputs.map((output, idx) => ({
                    index: idx,
                    name: output.name,
                    type: output.type
                }));
            }

            // Extract widgets
            if (tempNode.widgets) {
                schema.widgets = tempNode.widgets.map(widget => {
                    const w = {
                        name: widget.name,
                        type: widget.type,
                        value: widget.value
                    };
                    if (widget.options) {
                        if (widget.options.values) w.values = widget.options.values;
                        if (widget.options.min !== undefined) w.min = widget.options.min;
                        if (widget.options.max !== undefined) w.max = widget.options.max;
                        if (widget.options.step !== undefined) w.step = widget.options.step;
                    }
                    return w;
                });
            }

            return { success: true, schema };
        } catch (e) {
            console.error('[WorkflowAPI] getNodeSchema failed:', e);
            return { success: false, error: e.message };
        }
    }

    // =========================================================================
    // INSPECTION - Current Workflow
    // =========================================================================

    /**
     * Get COMPACT summary of current workflow (~1-3KB)
     * Optimized for layout/cleanup operations - no widget values or slot details
     * Use getWorkflowFull() when you need complete workflow JSON
     */
    getWorkflowSummary() {
        try {
            if (!app.graph) {
                return { success: false, error: "No graph loaded" };
            }

            // Filter out undefined/null groups (can happen after graph reload)
            const graphGroups = (app.graph._groups || []).filter(g => g && g.pos && g.size);
            const graphNodes = app.graph._nodes || [];

            // Calculate canvas bounds
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const node of graphNodes) {
                const w = node.size?.[0] || 200;
                const h = node.size?.[1] || 100;
                minX = Math.min(minX, node.pos[0]);
                minY = Math.min(minY, node.pos[1]);
                maxX = Math.max(maxX, node.pos[0] + w);
                maxY = Math.max(maxY, node.pos[1] + h);
            }

            // Helper to find which group a node belongs to (returns index or -1)
            const findNodeGroupIndex = (node) => {
                const nw = node.size?.[0] || 200;
                const nh = node.size?.[1] || 100;
                for (let i = 0; i < graphGroups.length; i++) {
                    const g = graphGroups[i];
                    if (node.pos[0] >= g.pos[0] &&
                        node.pos[1] >= g.pos[1] &&
                        node.pos[0] + nw <= g.pos[0] + g.size[0] &&
                        node.pos[1] + nh <= g.pos[1] + g.size[1]) {
                        return i;
                    }
                }
                return -1;
            };

            // Build groups with contained node IDs
            const groups = graphGroups.map((g, idx) => ({
                idx,
                title: g.title,
                x: Math.round(g.pos[0]),
                y: Math.round(g.pos[1]),
                w: Math.round(g.size[0]),
                h: Math.round(g.size[1]),
                nodes: [] // Will be populated below
            }));

            // Categorize nodes: grouped vs ungrouped
            const ungroupedNodes = [];
            const nodeTypeCounts = {};

            for (const node of graphNodes) {
                // Count by type
                const shortType = node.type.split('/').pop(); // Remove category prefix
                nodeTypeCounts[shortType] = (nodeTypeCounts[shortType] || 0) + 1;

                const groupIdx = findNodeGroupIndex(node);
                if (groupIdx >= 0) {
                    groups[groupIdx].nodes.push(node.id);
                } else {
                    ungroupedNodes.push({
                        id: node.id,
                        type: shortType,
                        x: Math.round(node.pos[0]),
                        y: Math.round(node.pos[1])
                    });
                }
            }

            // Build connection flow overview (source types → sink types)
            const flows = [];
            const seenFlows = new Set();
            if (app.graph.links) {
                for (const link of Object.values(app.graph.links)) {
                    if (!link) continue;
                    const fromNode = app.graph.getNodeById(link.origin_id);
                    const toNode = app.graph.getNodeById(link.target_id);
                    if (fromNode && toNode) {
                        const flowKey = `${fromNode.type.split('/').pop()}→${toNode.type.split('/').pop()}`;
                        if (!seenFlows.has(flowKey)) {
                            seenFlows.add(flowKey);
                            flows.push(flowKey);
                        }
                    }
                }
            }

            return {
                success: true,
                summary: {
                    canvas: {
                        x: Math.round(minX),
                        y: Math.round(minY),
                        w: Math.round(maxX - minX),
                        h: Math.round(maxY - minY)
                    },
                    counts: {
                        nodes: graphNodes.length,
                        links: Object.keys(app.graph.links || {}).length,
                        groups: groups.length,
                        ungrouped: ungroupedNodes.length
                    },
                    nodeTypes: nodeTypeCounts,
                    groups: groups,
                    ungrouped: ungroupedNodes,
                    flows: flows.slice(0, 20) // Limit flow count
                }
            };
        } catch (e) {
            console.error('[WorkflowAPI] getWorkflowSummary failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Get FULL workflow JSON (complete serialized workflow)
     * Use this when you need all details: widget values, connections, properties
     * Warning: Can be 15-60KB for complex workflows
     */
    getWorkflowFull() {
        try {
            if (!app.graph) {
                return { success: false, error: "No graph loaded" };
            }

            const serialized = app.graph.serialize();

            return {
                success: true,
                workflow: serialized,
                size_info: {
                    nodes: serialized.nodes?.length || 0,
                    links: serialized.links?.length || 0,
                    groups: serialized.groups?.length || 0,
                    approx_kb: Math.round(JSON.stringify(serialized).length / 1024)
                }
            };
        } catch (e) {
            console.error('[WorkflowAPI] getWorkflowFull failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Get detailed summary with node details (backward compatible)
     * More verbose than getWorkflowSummary but less than getWorkflowFull
     * Includes: node positions, sizes, group membership, input/output connectivity
     */
    getWorkflowDetails() {
        try {
            if (!app.graph) {
                return { success: false, error: "No graph loaded" };
            }

            const nodes = [];
            const groups = [];
            // Filter out undefined/null groups (can happen after graph reload)
            const graphGroups = (app.graph._groups || []).filter(g => g && g.pos && g.size);

            // Get all groups
            for (const group of graphGroups) {
                groups.push({
                    title: group.title,
                    color: group.color,
                    bounds: {
                        x: group.pos[0],
                        y: group.pos[1],
                        width: group.size[0],
                        height: group.size[1]
                    }
                });
            }

            // Helper to find which group a node belongs to
            const findNodeGroup = (node) => {
                const nw = node.size?.[0] || 200;
                const nh = node.size?.[1] || 100;
                for (let i = 0; i < graphGroups.length; i++) {
                    const g = graphGroups[i];
                    if (node.pos[0] >= g.pos[0] &&
                        node.pos[1] >= g.pos[1] &&
                        node.pos[0] + nw <= g.pos[0] + g.size[0] &&
                        node.pos[1] + nh <= g.pos[1] + g.size[1]) {
                        return g.title;
                    }
                }
                return null;
            };

            // Get all nodes with connectivity info (but no widget values)
            for (const node of app.graph._nodes) {
                nodes.push({
                    id: node.id,
                    type: node.type,
                    title: node.title || node.type,
                    pos: { x: node.pos[0], y: node.pos[1] },
                    size: { width: node.size?.[0] || 200, height: node.size?.[1] || 100 },
                    group: findNodeGroup(node),
                    hasInputs: (node.inputs || []).some(i => i.link !== null),
                    hasOutputs: (node.outputs || []).some(o => (o.links || []).length > 0),
                    widgetCount: (node.widgets || []).length
                });
            }

            return {
                success: true,
                details: {
                    nodeCount: nodes.length,
                    groupCount: groups.length,
                    nodes,
                    groups
                }
            };
        } catch (e) {
            console.error('[WorkflowAPI] getWorkflowDetails failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Find nodes matching criteria
     */
    findNodes(criteria = {}) {
        try {
            if (!app.graph) {
                return { success: false, error: "No graph loaded" };
            }

            const results = [];
            for (const node of app.graph._nodes) {
                let match = true;

                if (criteria.type && node.type !== criteria.type) match = false;
                if (criteria.title && !node.title?.toLowerCase().includes(criteria.title.toLowerCase())) match = false;
                if (criteria.id && node.id !== criteria.id) match = false;

                if (match) {
                    results.push({
                        id: node.id,
                        type: node.type,
                        title: node.title || node.type,
                        pos: { x: node.pos[0], y: node.pos[1] }
                    });
                }
            }

            return { success: true, nodes: results };
        } catch (e) {
            console.error('[WorkflowAPI] findNodes failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Get detailed info about a specific node
     */
    getNodeDetails(nodeId) {
        try {
            const node = app.graph.getNodeById(nodeId);
            if (!node) {
                return { success: false, error: `Node not found: ${nodeId}` };
            }

            const details = {
                id: node.id,
                type: node.type,
                title: node.title || node.type,
                pos: { x: node.pos[0], y: node.pos[1] },
                size: { width: node.size[0], height: node.size[1] },
                mode: node.mode,
                inputs: [],
                outputs: [],
                widgets: [],
                properties: node.properties || {}
            };

            // Get inputs with connection info
            if (node.inputs) {
                details.inputs = node.inputs.map((inp, idx) => {
                    const inputInfo = {
                        index: idx,
                        name: inp.name,
                        type: inp.type,
                        link: inp.link
                    };
                    // Get source node info if connected
                    if (inp.link && app.graph.links[inp.link]) {
                        const link = app.graph.links[inp.link];
                        inputInfo.connectedFrom = {
                            nodeId: link.origin_id,
                            slot: link.origin_slot
                        };
                    }
                    return inputInfo;
                });
            }

            // Get outputs with connection info
            if (node.outputs) {
                details.outputs = node.outputs.map((out, idx) => ({
                    index: idx,
                    name: out.name,
                    type: out.type,
                    links: out.links || [],
                    connectedTo: (out.links || []).map(linkId => {
                        const link = app.graph.links[linkId];
                        return link ? { nodeId: link.target_id, slot: link.target_slot } : null;
                    }).filter(Boolean)
                }));
            }

            // Get widgets with current values
            if (node.widgets) {
                details.widgets = node.widgets.map(w => ({
                    name: w.name,
                    type: w.type,
                    value: w.value,
                    options: w.options || {}
                }));
            }

            return { success: true, details };
        } catch (e) {
            console.error('[WorkflowAPI] getNodeDetails failed:', e);
            return { success: false, error: e.message };
        }
    }

    // =========================================================================
    // MANIPULATION - Add/Remove/Move Nodes
    // =========================================================================

    /**
     * Add a new node to the workflow
     */
    addNode(nodeType, x = 100, y = 100, config = {}) {
        try {
            this.saveUndoState(`Add ${nodeType}`);

            const node = LiteGraph.createNode(nodeType);
            if (!node) {
                return { success: false, error: `Failed to create node: ${nodeType}` };
            }

            node.pos = [x, y];

            // Apply widget configurations
            if (config.widgets && node.widgets) {
                for (const [name, value] of Object.entries(config.widgets)) {
                    const widget = node.widgets.find(w => w.name === name);
                    if (widget) {
                        widget.value = value;
                    }
                }
            }

            // Apply title if specified
            if (config.title) {
                node.title = config.title;
            }

            app.graph.add(node);
            app.graph.setDirtyCanvas(true, true);

            console.log(`[WorkflowAPI] Added node: ${nodeType} (id: ${node.id})`);
            return {
                success: true,
                node: {
                    id: node.id,
                    type: node.type,
                    pos: { x: node.pos[0], y: node.pos[1] },
                    size: { width: node.size[0], height: node.size[1] }
                }
            };
        } catch (e) {
            console.error('[WorkflowAPI] addNode failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Remove a node from the workflow
     */
    removeNode(nodeId, reconnect = false) {
        try {
            const node = app.graph.getNodeById(nodeId);
            if (!node) {
                return { success: false, error: `Node not found: ${nodeId}` };
            }

            this.saveUndoState(`Remove ${node.type}`);

            // If reconnect is true, try to bridge connections
            if (reconnect && node.inputs && node.outputs) {
                // Find first connected input and output of same type
                for (const input of node.inputs) {
                    if (!input.link) continue;
                    const inLink = app.graph.links[input.link];
                    if (!inLink) continue;

                    for (const output of node.outputs) {
                        if (!output.links || output.links.length === 0) continue;
                        if (output.type !== input.type) continue;

                        // Found matching types - reconnect
                        const sourceNode = app.graph.getNodeById(inLink.origin_id);
                        for (const outLinkId of output.links) {
                            const outLink = app.graph.links[outLinkId];
                            if (outLink) {
                                const targetNode = app.graph.getNodeById(outLink.target_id);
                                if (sourceNode && targetNode) {
                                    sourceNode.connect(inLink.origin_slot, targetNode, outLink.target_slot);
                                }
                            }
                        }
                        break;
                    }
                }
            }

            app.graph.remove(node);
            app.graph.setDirtyCanvas(true, true);

            console.log(`[WorkflowAPI] Removed node: ${nodeId}`);
            return { success: true, removedId: nodeId };
        } catch (e) {
            console.error('[WorkflowAPI] removeNode failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Move a node to a new position
     */
    moveNode(nodeId, x, y) {
        try {
            const node = app.graph.getNodeById(nodeId);
            if (!node) {
                return { success: false, error: `Node not found: ${nodeId}` };
            }

            const oldPos = { x: node.pos[0], y: node.pos[1] };
            node.pos = [x, y];
            app.graph.setDirtyCanvas(true, true);

            console.log(`[WorkflowAPI] Moved node ${nodeId}: (${oldPos.x}, ${oldPos.y}) -> (${x}, ${y})`);
            return {
                success: true,
                nodeId,
                oldPos,
                newPos: { x, y }
            };
        } catch (e) {
            console.error('[WorkflowAPI] moveNode failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Move multiple nodes (for making space)
     */
    moveNodesBatch(moves) {
        try {
            this.saveUndoState(`Move ${moves.length} nodes`);

            const results = [];
            for (const move of moves) {
                const node = app.graph.getNodeById(move.id);
                if (node) {
                    const oldPos = { x: node.pos[0], y: node.pos[1] };
                    node.pos = [move.x, move.y];
                    results.push({
                        id: move.id,
                        oldPos,
                        newPos: { x: move.x, y: move.y }
                    });
                }
            }

            app.graph.setDirtyCanvas(true, true);
            console.log(`[WorkflowAPI] Moved ${results.length} nodes`);
            return { success: true, moved: results };
        } catch (e) {
            console.error('[WorkflowAPI] moveNodesBatch failed:', e);
            return { success: false, error: e.message };
        }
    }

    // =========================================================================
    // CONNECTIONS - Link/Unlink Nodes
    // =========================================================================

    /**
     * Connect two nodes
     */
    connect(fromNodeId, fromSlot, toNodeId, toSlot) {
        try {
            const fromNode = app.graph.getNodeById(fromNodeId);
            const toNode = app.graph.getNodeById(toNodeId);

            if (!fromNode) {
                return { success: false, error: `Source node not found: ${fromNodeId}` };
            }
            if (!toNode) {
                return { success: false, error: `Target node not found: ${toNodeId}` };
            }

            // Validate slots exist
            if (!fromNode.outputs || fromSlot >= fromNode.outputs.length) {
                return { success: false, error: `Invalid output slot: ${fromSlot}` };
            }
            if (!toNode.inputs || toSlot >= toNode.inputs.length) {
                return { success: false, error: `Invalid input slot: ${toSlot}` };
            }

            // Check type compatibility
            const outputType = fromNode.outputs[fromSlot].type;
            const inputType = toNode.inputs[toSlot].type;
            if (outputType !== inputType && outputType !== "*" && inputType !== "*") {
                return {
                    success: false,
                    error: `Type mismatch: ${outputType} -> ${inputType}`
                };
            }

            this.saveUndoState(`Connect ${fromNode.type} -> ${toNode.type}`);

            const linkId = fromNode.connect(fromSlot, toNode, toSlot);
            app.graph.setDirtyCanvas(true, true);

            console.log(`[WorkflowAPI] Connected: ${fromNodeId}[${fromSlot}] -> ${toNodeId}[${toSlot}]`);
            return {
                success: true,
                link: {
                    id: linkId,
                    from: { nodeId: fromNodeId, slot: fromSlot },
                    to: { nodeId: toNodeId, slot: toSlot }
                }
            };
        } catch (e) {
            console.error('[WorkflowAPI] connect failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Disconnect a specific link
     */
    disconnect(nodeId, inputSlot) {
        try {
            const node = app.graph.getNodeById(nodeId);
            if (!node) {
                return { success: false, error: `Node not found: ${nodeId}` };
            }

            if (!node.inputs || inputSlot >= node.inputs.length) {
                return { success: false, error: `Invalid input slot: ${inputSlot}` };
            }

            const input = node.inputs[inputSlot];
            if (!input.link) {
                return { success: false, error: `No connection on slot ${inputSlot}` };
            }

            this.saveUndoState(`Disconnect from ${node.type}`);

            node.disconnectInput(inputSlot);
            app.graph.setDirtyCanvas(true, true);

            console.log(`[WorkflowAPI] Disconnected: ${nodeId}[${inputSlot}]`);
            return { success: true, nodeId, slot: inputSlot };
        } catch (e) {
            console.error('[WorkflowAPI] disconnect failed:', e);
            return { success: false, error: e.message };
        }
    }

    // =========================================================================
    // CONFIGURATION - Widget Values
    // =========================================================================

    /**
     * Set a widget value on a node
     */
    setWidget(nodeId, widgetName, value) {
        try {
            const node = app.graph.getNodeById(nodeId);
            if (!node) {
                return { success: false, error: `Node not found: ${nodeId}` };
            }

            const widget = node.widgets?.find(w => w.name === widgetName);
            if (!widget) {
                return { success: false, error: `Widget not found: ${widgetName}` };
            }

            // Validate value
            if (widget.options) {
                if (widget.options.values && !widget.options.values.includes(value)) {
                    return {
                        success: false,
                        error: `Invalid value for ${widgetName}. Valid: ${widget.options.values.join(", ")}`
                    };
                }
                if (widget.options.min !== undefined && value < widget.options.min) {
                    return { success: false, error: `Value below minimum: ${widget.options.min}` };
                }
                if (widget.options.max !== undefined && value > widget.options.max) {
                    return { success: false, error: `Value above maximum: ${widget.options.max}` };
                }
            }

            const oldValue = widget.value;
            widget.value = value;

            // Trigger callback if exists
            if (widget.callback) {
                widget.callback(value, app.canvas, node, [0, 0], {});
            }

            app.graph.setDirtyCanvas(true, true);

            console.log(`[WorkflowAPI] Set widget: ${nodeId}.${widgetName} = ${value}`);
            return {
                success: true,
                nodeId,
                widget: widgetName,
                oldValue,
                newValue: value
            };
        } catch (e) {
            console.error('[WorkflowAPI] setWidget failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Get available options for a widget (useful for combo boxes)
     */
    getWidgetOptions(nodeId, widgetName) {
        try {
            const node = app.graph.getNodeById(nodeId);
            if (!node) {
                return { success: false, error: `Node not found: ${nodeId}` };
            }

            const widget = node.widgets?.find(w => w.name === widgetName);
            if (!widget) {
                return { success: false, error: `Widget not found: ${widgetName}` };
            }

            return {
                success: true,
                widget: widgetName,
                type: widget.type,
                currentValue: widget.value,
                options: widget.options || {}
            };
        } catch (e) {
            console.error('[WorkflowAPI] getWidgetOptions failed:', e);
            return { success: false, error: e.message };
        }
    }

    // =========================================================================
    // LAYOUT - Positioning Helpers
    // =========================================================================

    /**
     * Make space in the workflow by pushing nodes
     */
    makeSpace(x, y, width, height, direction = "right") {
        try {
            this.saveUndoState(`Make space at (${x}, ${y})`);

            const moves = [];
            const buffer = 20; // Extra padding

            for (const node of app.graph._nodes) {
                const nodeRight = node.pos[0] + node.size[0];
                const nodeBottom = node.pos[1] + node.size[1];

                let shouldMove = false;
                let newX = node.pos[0];
                let newY = node.pos[1];

                if (direction === "right" || direction === "horizontal") {
                    if (node.pos[0] >= x && node.pos[1] < y + height && nodeBottom > y) {
                        shouldMove = true;
                        newX = node.pos[0] + width + buffer;
                    }
                }
                if (direction === "down" || direction === "vertical") {
                    if (node.pos[1] >= y && node.pos[0] < x + width && nodeRight > x) {
                        shouldMove = true;
                        newY = node.pos[1] + height + buffer;
                    }
                }

                if (shouldMove) {
                    moves.push({ id: node.id, x: newX, y: newY });
                }
            }

            if (moves.length > 0) {
                return this.moveNodesBatch(moves);
            }

            return { success: true, moved: [] };
        } catch (e) {
            console.error('[WorkflowAPI] makeSpace failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Insert a node between two connected nodes
     */
    insertNodeBetween(nodeType, fromNodeId, toNodeId, slotType = null) {
        try {
            const fromNode = app.graph.getNodeById(fromNodeId);
            const toNode = app.graph.getNodeById(toNodeId);

            if (!fromNode || !toNode) {
                return { success: false, error: "Source or target node not found" };
            }

            // Find the connection between them
            let connectionInfo = null;
            for (const output of fromNode.outputs || []) {
                for (const linkId of output.links || []) {
                    const link = app.graph.links[linkId];
                    if (link && link.target_id === toNodeId) {
                        if (!slotType || output.type === slotType) {
                            connectionInfo = {
                                fromSlot: fromNode.outputs.indexOf(output),
                                toSlot: link.target_slot,
                                type: output.type
                            };
                            break;
                        }
                    }
                }
                if (connectionInfo) break;
            }

            if (!connectionInfo) {
                return { success: false, error: "No connection found between nodes" };
            }

            this.saveUndoState(`Insert ${nodeType} between nodes`);

            // Calculate position between the two nodes
            const midX = (fromNode.pos[0] + toNode.pos[0]) / 2;
            const midY = (fromNode.pos[1] + toNode.pos[1]) / 2;

            // Make space
            const nodeWidth = 200; // Approximate
            const nodeHeight = 100;
            this.makeSpace(midX - nodeWidth/2, midY - nodeHeight/2, nodeWidth, nodeHeight, "right");

            // Add the new node
            const result = this.addNode(nodeType, midX, midY);
            if (!result.success) {
                return result;
            }

            const newNode = app.graph.getNodeById(result.node.id);

            // Find matching slots on new node
            const newNodeInputSlot = newNode.inputs?.findIndex(i => i.type === connectionInfo.type || i.type === "*");
            const newNodeOutputSlot = newNode.outputs?.findIndex(o => o.type === connectionInfo.type || o.type === "*");

            if (newNodeInputSlot === -1 || newNodeOutputSlot === -1) {
                return { success: false, error: `New node doesn't have matching ${connectionInfo.type} slots` };
            }

            // Disconnect original connection
            this.disconnect(toNodeId, connectionInfo.toSlot);

            // Connect: fromNode -> newNode -> toNode
            this.connect(fromNodeId, connectionInfo.fromSlot, result.node.id, newNodeInputSlot);
            this.connect(result.node.id, newNodeOutputSlot, toNodeId, connectionInfo.toSlot);

            return {
                success: true,
                insertedNode: result.node,
                connections: {
                    from: { nodeId: fromNodeId, slot: connectionInfo.fromSlot },
                    through: { nodeId: result.node.id, inputSlot: newNodeInputSlot, outputSlot: newNodeOutputSlot },
                    to: { nodeId: toNodeId, slot: connectionInfo.toSlot }
                }
            };
        } catch (e) {
            console.error('[WorkflowAPI] insertNodeBetween failed:', e);
            return { success: false, error: e.message };
        }
    }

    // =========================================================================
    // EXECUTION - Queue/Interrupt/Status
    // =========================================================================

    /**
     * Queue the current workflow for execution (generate images)
     * Uses ComfyUI's native queuePrompt method for reliability
     */
    async queuePrompt(batchSize = 1) {
        try {
            // Use ComfyUI's native queue method - this is the same as clicking "Queue Prompt"
            // Parameters: (number = queue position, batchCount = how many to generate)
            // number: 0 = end of queue, -1 = front of queue
            const result = await app.queuePrompt(0, batchSize);

            console.log(`[WorkflowAPI] Queued prompt via app.queuePrompt:`, result);

            if (result && result.response) {
                return {
                    success: true,
                    prompt_id: result.response.prompt_id,
                    number: result.response.number,
                    message: `Workflow queued for execution (ID: ${result.response.prompt_id}, Position: ${result.response.number})`
                };
            }

            // Fallback: check if it was queued by looking at queue status
            const status = await this.getQueueStatus();
            if (status.success && (status.queue.running.length > 0 || status.queue.pending.length > 0)) {
                return {
                    success: true,
                    message: `Workflow queued. Queue has ${status.queue.pending.length} pending, ${status.queue.running.length} running.`
                };
            }

            return {
                success: true,
                message: 'Queue request sent (check status to confirm)'
            };
        } catch (e) {
            console.error('[WorkflowAPI] queuePrompt failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Get current queue status - what's pending and what's running
     */
    async getQueueStatus() {
        try {
            const response = await fetch('/queue');
            if (!response.ok) {
                return { success: false, error: 'Failed to fetch queue status' };
            }

            const data = await response.json();

            // data format: { queue_running: [[...]], queue_pending: [[...]] }
            const running = data.queue_running || [];
            const pending = data.queue_pending || [];

            return {
                success: true,
                queue: {
                    running: running.map(item => ({
                        prompt_id: item[1],
                        // item[2] contains the prompt data
                    })),
                    pending: pending.map(item => ({
                        prompt_id: item[1],
                        position: pending.indexOf(item)
                    })),
                    runningCount: running.length,
                    pendingCount: pending.length,
                    isGenerating: running.length > 0,
                    queueEmpty: running.length === 0 && pending.length === 0
                },
                message: running.length > 0
                    ? `Currently generating (${pending.length} more in queue)`
                    : pending.length > 0
                        ? `${pending.length} items queued, waiting to start`
                        : 'Queue is empty - nothing running or pending'
            };
        } catch (e) {
            console.error('[WorkflowAPI] getQueueStatus failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Get recent generation history
     */
    async getHistory(limit = 5) {
        try {
            const response = await fetch(`/history?max_items=${limit}`);
            if (!response.ok) {
                return { success: false, error: 'Failed to fetch history' };
            }

            const data = await response.json();
            const entries = Object.entries(data);

            const history = entries.map(([promptId, info]) => ({
                prompt_id: promptId,
                status: info.status || {},
                outputs: Object.keys(info.outputs || {}).length,
                hasImages: Object.values(info.outputs || {}).some(o => o.images && o.images.length > 0)
            }));

            return {
                success: true,
                history,
                count: history.length,
                message: history.length > 0
                    ? `Found ${history.length} recent generations`
                    : 'No recent generation history'
            };
        } catch (e) {
            console.error('[WorkflowAPI] getHistory failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Interrupt/cancel the current generation
     */
    async interruptGeneration() {
        try {
            const response = await fetch('/interrupt', {
                method: 'POST'
            });

            if (!response.ok) {
                return { success: false, error: 'Interrupt request failed' };
            }

            console.log('[WorkflowAPI] Generation interrupted');
            return {
                success: true,
                message: 'Generation interrupted'
            };
        } catch (e) {
            console.error('[WorkflowAPI] interruptGeneration failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Clear the queue (cancel all pending)
     */
    async clearQueue() {
        try {
            const response = await fetch('/queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clear: true })
            });

            if (!response.ok) {
                return { success: false, error: 'Failed to clear queue' };
            }

            return {
                success: true,
                message: 'Queue cleared'
            };
        } catch (e) {
            console.error('[WorkflowAPI] clearQueue failed:', e);
            return { success: false, error: e.message };
        }
    }

    // GROUP MANAGEMENT methods are in workflow_groups.js (mixed in below)

    // =========================================================================
    // PHASE 1 NEW METHODS - Clean Architecture
    // =========================================================================

    /**
     * Duplicate a node with optional offset
     */
    duplicateNode(nodeId, offset = [50, 50]) {
        try {
            const node = app.graph.getNodeById(nodeId);
            if (!node) {
                return { success: false, error: `Node not found: ${nodeId}` };
            }

            this.saveUndoState(`Duplicate ${node.type}`);

            // Clone the node
            const clone = LiteGraph.createNode(node.type);
            if (!clone) {
                return { success: false, error: `Failed to clone node type: ${node.type}` };
            }

            // Copy position with offset
            clone.pos = [
                node.pos[0] + (offset[0] || 50),
                node.pos[1] + (offset[1] || 50)
            ];

            // Copy widget values
            if (node.widgets && clone.widgets) {
                for (const widget of node.widgets) {
                    const cloneWidget = clone.widgets.find(w => w.name === widget.name);
                    if (cloneWidget) {
                        cloneWidget.value = widget.value;
                    }
                }
            }

            // Copy title if customized
            if (node.title !== node.type) {
                clone.title = node.title + " (copy)";
            }

            app.graph.add(clone);
            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                original_id: nodeId,
                new_id: clone.id,
                type: clone.type,
                pos: { x: clone.pos[0], y: clone.pos[1] }
            };
        } catch (e) {
            console.error('[WorkflowAPI] duplicateNode failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Set node mode (bypass/active)
     * Mode 0 = active, Mode 4 = bypassed
     */
    setNodeMode(nodeId, mode) {
        try {
            const node = app.graph.getNodeById(nodeId);
            if (!node) {
                return { success: false, error: `Node not found: ${nodeId}` };
            }

            const oldMode = node.mode;
            node.mode = mode;
            app.graph.setDirtyCanvas(true, true);

            const modeNames = { 0: 'active', 4: 'bypassed' };
            return {
                success: true,
                node_id: nodeId,
                old_mode: oldMode,
                new_mode: mode,
                message: `Node ${nodeId} is now ${modeNames[mode] || 'mode ' + mode}`
            };
        } catch (e) {
            console.error('[WorkflowAPI] setNodeMode failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Update group properties (title, color, resize to nodes)
     */
    updateGroup(groupIndex, options = {}) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const groups = app.graph._groups || [];
            if (groupIndex < 0 || groupIndex >= groups.length) {
                return { success: false, error: `Invalid group index: ${groupIndex}` };
            }

            const group = groups[groupIndex];
            // Guard against undefined/null groups (can happen after graph operations)
            if (!group || !group.pos || !group.size) {
                return { success: false, error: `Group at index ${groupIndex} is invalid or undefined` };
            }
            this.saveUndoState(`Update group: ${group.title}`);

            if (options.title) {
                group.title = options.title;
            }
            if (options.color) {
                group.color = options.color;
            }
            if (options.nodes && options.nodes.length > 0) {
                // Resize to fit specified nodes
                let minX = Infinity, minY = Infinity;
                let maxX = -Infinity, maxY = -Infinity;
                const padding = 60;

                for (const nodeId of options.nodes) {
                    const node = app.graph.getNodeById(nodeId);
                    if (!node) continue;
                    const w = node.size?.[0] || 200;
                    const h = node.size?.[1] || 100;
                    minX = Math.min(minX, node.pos[0]);
                    minY = Math.min(minY, node.pos[1]);
                    maxX = Math.max(maxX, node.pos[0] + w);
                    maxY = Math.max(maxY, node.pos[1] + h);
                }

                if (minX !== Infinity) {
                    group.pos[0] = minX - padding;
                    group.pos[1] = minY - padding - 30;
                    group.size[0] = (maxX - minX) + (padding * 2);
                    group.size[1] = (maxY - minY) + (padding * 2) + 30;
                }
            }

            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                group_index: groupIndex,
                title: group.title,
                color: group.color,
                bounds: {
                    x: group.pos[0], y: group.pos[1],
                    width: group.size[0], height: group.size[1]
                }
            };
        } catch (e) {
            console.error('[WorkflowAPI] updateGroup failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Move nodes into a group (resize group to contain them)
     */
    moveNodesToGroup(nodeIds, groupIndex) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const groups = app.graph._groups || [];
            if (groupIndex < 0 || groupIndex >= groups.length) {
                return { success: false, error: `Invalid group index: ${groupIndex}` };
            }

            // Get current nodes in group + new nodes
            const group = groups[groupIndex];
            // Guard against undefined/null groups (can happen after graph operations)
            if (!group || !group.pos || !group.size) {
                return { success: false, error: `Group at index ${groupIndex} is invalid or undefined` };
            }
            const existingNodeIds = [];
            const gLeft = group.pos[0], gTop = group.pos[1];
            const gRight = gLeft + group.size[0], gBottom = gTop + group.size[1];

            for (const node of app.graph._nodes) {
                const nLeft = node.pos[0], nTop = node.pos[1];
                const nRight = nLeft + (node.size?.[0] || 200);
                const nBottom = nTop + (node.size?.[1] || 100);
                if (nLeft >= gLeft && nTop >= gTop && nRight <= gRight && nBottom <= gBottom) {
                    existingNodeIds.push(node.id);
                }
            }

            // Combine existing and new node IDs
            const allNodeIds = [...new Set([...existingNodeIds, ...nodeIds])];

            return this.updateGroup(groupIndex, { nodes: allNodeIds });
        } catch (e) {
            console.error('[WorkflowAPI] moveNodesToGroup failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Merge multiple groups into one
     */
    mergeGroups(groupIndices, newTitle, color = null) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            if (!groupIndices || groupIndices.length < 2) {
                return { success: false, error: "Need at least 2 groups to merge" };
            }

            const groups = app.graph._groups || [];
            const allNodeIds = [];

            // Collect all nodes from all groups
            for (const idx of groupIndices) {
                if (idx < 0 || idx >= groups.length) continue;
                const g = groups[idx];
                // Skip undefined/null groups (can happen after graph operations)
                if (!g || !g.pos || !g.size) continue;
                const gLeft = g.pos[0], gTop = g.pos[1];
                const gRight = gLeft + g.size[0], gBottom = gTop + g.size[1];

                for (const node of app.graph._nodes) {
                    const nLeft = node.pos[0], nTop = node.pos[1];
                    const nRight = nLeft + (node.size?.[0] || 200);
                    const nBottom = nTop + (node.size?.[1] || 100);
                    if (nLeft >= gLeft && nTop >= gTop && nRight <= gRight && nBottom <= gBottom) {
                        allNodeIds.push(node.id);
                    }
                }
            }

            this.saveUndoState(`Merge ${groupIndices.length} groups`);

            // Delete old groups (in reverse order to preserve indices)
            const sortedIndices = [...groupIndices].sort((a, b) => b - a);
            for (const idx of sortedIndices) {
                if (idx >= 0 && idx < groups.length) {
                    app.graph.remove(groups[idx]);
                }
            }

            // Create new merged group
            return this.createGroupForNodes(newTitle, [...new Set(allNodeIds)], color, 60);
        } catch (e) {
            console.error('[WorkflowAPI] mergeGroups failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Organize workflow using LLM-provided plan
     */
    organizeWithPlan(plan) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            if (!plan || !plan.groups || plan.groups.length === 0) {
                return { success: false, error: "Plan must include groups array" };
            }

            this.saveUndoState('Organize with plan');

            const groupSpacing = plan.group_spacing || 100;
            const groupPadding = plan.group_padding || 60;
            const flow = plan.flow || 'left_to_right';
            const isHorizontal = flow === 'left_to_right';

            // Delete existing groups
            const existingGroups = [...(app.graph._groups || [])];
            for (const g of existingGroups) {
                app.graph.remove(g);
            }

            // Sort groups by order if provided
            const sortedGroups = [...plan.groups].sort((a, b) => (a.order || 0) - (b.order || 0));

            let currentPos = isHorizontal ? 50 : 50;
            const createdGroups = [];

            for (const groupSpec of sortedGroups) {
                const nodeIds = groupSpec.nodes || [];
                if (nodeIds.length === 0) continue;

                // Calculate bounds for these nodes
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                let maxNodeWidth = 0, totalHeight = 0;

                const nodes = nodeIds.map(id => app.graph.getNodeById(id)).filter(n => n);
                for (const node of nodes) {
                    const w = node.size?.[0] || 200;
                    const h = node.size?.[1] || 100;
                    maxNodeWidth = Math.max(maxNodeWidth, w);
                    totalHeight += h + 30; // node spacing
                }
                totalHeight -= 30;

                const groupWidth = maxNodeWidth + (groupPadding * 2);
                const groupHeight = totalHeight + (groupPadding * 2) + 40;

                // Position nodes vertically within group
                const groupX = isHorizontal ? currentPos : 50;
                const groupY = isHorizontal ? 50 : currentPos;
                let nodeY = groupY + groupPadding + 40;

                for (const node of nodes) {
                    const w = node.size?.[0] || 200;
                    node.pos[0] = groupX + groupPadding + (maxNodeWidth - w) / 2;
                    node.pos[1] = nodeY;
                    nodeY += (node.size?.[1] || 100) + 30;
                }

                // Create group
                const group = new LiteGraph.LGraphGroup();
                group.title = groupSpec.title;
                group.pos = [groupX, groupY];
                group.size = [groupWidth, groupHeight];
                if (groupSpec.color) group.color = groupSpec.color;

                app.graph.add(group);
                createdGroups.push({
                    title: groupSpec.title,
                    nodeCount: nodes.length,
                    bounds: { x: groupX, y: groupY, width: groupWidth, height: groupHeight }
                });

                if (isHorizontal) {
                    currentPos += groupWidth + groupSpacing;
                } else {
                    currentPos += groupHeight + groupSpacing;
                }
            }

            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                groups_created: createdGroups.length,
                groups: createdGroups,
                message: `Organized workflow into ${createdGroups.length} groups using provided plan`
            };
        } catch (e) {
            console.error('[WorkflowAPI] organizeWithPlan failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Clear entire workflow (delete all nodes and groups)
     */
    clearWorkflow() {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            this.saveUndoState('Clear workflow');

            const nodeCount = (app.graph._nodes || []).length;
            const groupCount = (app.graph._groups || []).length;

            // Clear the graph
            app.graph.clear();
            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                deleted_nodes: nodeCount,
                deleted_groups: groupCount,
                message: `Cleared workflow: removed ${nodeCount} nodes and ${groupCount} groups`
            };
        } catch (e) {
            console.error('[WorkflowAPI] clearWorkflow failed:', e);
            return { success: false, error: e.message };
        }
    }

    // =========================================================================
    // BATCH OPERATIONS
    // =========================================================================

    /**
     * Apply multiple operations atomically
     */
    applyChanges(operations) {
        try {
            this.saveUndoState(`Batch: ${operations.length} operations`);

            const results = [];
            for (const op of operations) {
                let result;
                switch (op.op) {
                    case "add_node":
                        result = this.addNode(op.type, op.x, op.y, op.config);
                        break;
                    case "remove_node":
                        result = this.removeNode(op.id, op.reconnect);
                        break;
                    case "move_node":
                        result = this.moveNode(op.id, op.x, op.y);
                        break;
                    case "connect":
                        result = this.connect(op.from_id, op.from_slot, op.to_id, op.to_slot);
                        break;
                    case "disconnect":
                        result = this.disconnect(op.node_id, op.slot);
                        break;
                    case "set_widget":
                        result = this.setWidget(op.node_id, op.widget, op.value);
                        break;
                    default:
                        result = { success: false, error: `Unknown operation: ${op.op}` };
                }

                results.push({ op: op.op, result });

                // If any operation fails, we could rollback here
                // For now, we continue and report all results
            }

            return { success: true, results };
        } catch (e) {
            console.error('[WorkflowAPI] applyChanges failed:', e);
            return { success: false, error: e.message };
        }
    }
}

// Mix in group management methods from separate module
Object.assign(WorkflowAPI.prototype, GroupMethods);

// Create singleton instance and expose globally
const workflowAPI = new WorkflowAPI();
window.claudeWorkflowAPI = workflowAPI;

export { workflowAPI, WorkflowAPI };
