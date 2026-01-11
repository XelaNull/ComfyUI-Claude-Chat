/**
 * ComfyUI Claude Chat Extension
 * Adds a chat panel for interacting with Claude about your workflow.
 */

// ComfyUI API - use new window.comfyAPI pattern (ComfyUI 1.35+)
const { app } = window.comfyAPI?.app ?? await import("../../../scripts/app.js");

import { workflowAPI } from "./workflow_api.js";
import { createPanelDOM } from "./claude_chat_panel.js";
import { openSettingsModal } from "./claude_chat_settings.js";
import { RefResolver } from "./ref_resolver.js";
import { BatchExecutor } from "./batch_executor.js";
import { ContextGenerator } from "./context_generator.js";
import { enrichError } from "./tool_hints.js";
import { TOOL_DOCS, TOOL_CATEGORIES, PATTERNS, COMMON_SLOTS, searchTools } from "./tool_docs.js";

// Prompt Guard modules - loaded lazily to avoid circular dependencies
let protectedNodesManager = null;
let promptGuardCanvas = null;

// Load prompt guard modules on demand (from lib/ subdirectory to avoid auto-loading)
async function loadPromptGuardModules() {
    if (!protectedNodesManager) {
        try {
            const managerModule = await import('./prompt_guard_manager.js');
            protectedNodesManager = managerModule.protectedNodesManager;
        } catch (e) {
            console.warn('[Claude Chat] Could not load protectedNodesManager:', e);
        }
    }
    if (!promptGuardCanvas) {
        try {
            const canvasModule = await import('./prompt_guard_canvas.js');
            promptGuardCanvas = canvasModule.promptGuardCanvas;
        } catch (e) {
            console.warn('[Claude Chat] Could not load promptGuardCanvas:', e);
        }
    }
    return { protectedNodesManager, promptGuardCanvas };
}

class ClaudeChatPanel {
    constructor() {
        this.isOpen = false;
        this.panel = null;
        this.messages = [];
        this.isLoading = false;
        this.authMethod = 'unknown';
        this.authPreference = 'auto';
        this.hasApiKey = false;
        this.hasMaxPlan = false;

        // Panel dimensions
        this.width = 420;
        this.height = 550;
        this.x = window.innerWidth - 435;
        this.y = 230;

        // Drag state
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };

        // Resize state
        this.isResizing = false;

        // Touch support
        this.isTouchDevice = 'ontouchstart' in window;

        // Font size (xsmall=12, small=14, medium=16) - default to middle (14px)
        this.fontSizes = [12, 14, 16];
        const savedFontIndex = localStorage.getItem('claude-chat-font-size');
        this.fontSizeIndex = savedFontIndex !== null ? parseInt(savedFontIndex) : 1;

        // Workflow modification mode
        this.workflowModeEnabled = false;

        // Prompt Guard - hides prompt text from Claude (ENABLED by default)
        this.promptGuardEnabled = localStorage.getItem('claude-chat-prompt-guard') !== 'false';
        // Initialize canvas visual indicators for prompt guard (lazy load)
        if (this.promptGuardEnabled) {
            loadPromptGuardModules().then(({ promptGuardCanvas }) => {
                if (promptGuardCanvas) {
                    promptGuardCanvas.setEnabled(true);
                }
            });
        }
        this.workflowAPI = workflowAPI;

        // Phase 2: RefResolver for $ref cross-referencing
        this.refResolver = new RefResolver();

        // Phase 5: ContextGenerator for automatic workflow state injection
        this.contextGenerator = new ContextGenerator();

        // Tool action map for client-side execution
        // Phase 1 Architecture: Clean naming (create_X, delete_X, update_X, get_X)
        // Phase 2: Multi-item support with $ref resolution
        this.toolActionMap = {
            // =========================================================================
            // CONTEXT TOOLS - Workflow inspection
            // =========================================================================
            'get_workflow': (params) => {
                const mode = params?.mode || 'summary';
                if (mode === 'full') return this.workflowAPI.getWorkflowFull();
                if (mode === 'details') return this.workflowAPI.getWorkflowDetails();
                return this.workflowAPI.getWorkflowSummary();
            },
            'get_context': (params) => {
                // Request workflow context at a specific detail level
                const level = params?.level ?? this.contextGenerator.selectLevel();
                const context = this.contextGenerator.generate({
                    level,
                    promptGuardEnabled: this.promptGuardEnabled,
                    includeStaticContext: params?.include_static ?? false
                });
                const estimate = this.contextGenerator.estimateTokens(level);
                return {
                    success: true,
                    level,
                    context,
                    token_estimate: estimate.estimated_tokens,
                    budget: estimate.budget
                };
            },

            // =========================================================================
            // DISCOVERY TOOLS - Workflow Domain (what's in the canvas)
            // =========================================================================
            'list_nodes': (params) => {
                // List all nodes in the current workflow
                const result = this.workflowAPI.listNodes({ verbose: params?.verbose || false });
                if (result.success) {
                    result.note = "This lists nodes in the current workflow. For available node types to add, use list_available_nodes or search_available_nodes.";
                }
                return result;
            },
            'get_node': (params) => {
                // Unified: 'id' for workflow node, 'type' for registry schema
                if (params?.id !== undefined) {
                    // Workflow domain: get node instance by ID
                    const result = this.workflowAPI.getNodeDetails(params.id);
                    // Optionally include schema
                    if (result.success && params?.schema) {
                        result.schema = this.workflowAPI.getNodeSchema(result.details.type);
                    }
                    return result;
                }
                if (params?.type) {
                    // Registry domain: get node type schema
                    return this.workflowAPI.getNodeSchema(params.type);
                }
                // Legacy 'node' param support
                if (params?.node !== undefined) {
                    return this.workflowAPI.getNodeDetails(params.node);
                }
                return {
                    success: false,
                    error: "Provide 'id' for workflow node or 'type' for registry schema",
                    hint: "get_node id=5 (workflow) | get_node type='KSampler' (registry)"
                };
            },

            // =========================================================================
            // DISCOVERY TOOLS - Registry Domain (what's available to add)
            // =========================================================================
            'list_available_nodes': (params) => {
                // List available node types, optionally filtered by category
                const result = this.workflowAPI.listNodeTypes(null, params?.category);
                if (params?.category && result.success) {
                    result.category = params.category;
                }
                return result;
            },
            'search_available_nodes': (params) => {
                // Search available node types by text query
                if (!params?.query) {
                    return {
                        success: false,
                        error: "Required parameter 'query' not provided",
                        hint: "search_available_nodes query='upscale'"
                    };
                }
                return this.workflowAPI.listNodeTypes(params.query, params?.category);
            },
            'list_available_models': (params) => {
                // List available models by type
                if (!params?.type) {
                    return {
                        success: false,
                        error: "Required parameter 'type' not provided",
                        hint: "list_available_models type='checkpoints' | 'loras' | 'vae' | 'embeddings' | 'controlnet' | 'upscale_models'"
                    };
                }
                return this.workflowAPI.listModels(params.type);
            },
            'search_available_models': (params) => {
                // Search available models by query
                if (!params?.type) {
                    return {
                        success: false,
                        error: "Required parameter 'type' not provided",
                        hint: "search_available_models type='checkpoints' query='sdxl'"
                    };
                }
                if (!params?.query) {
                    return {
                        success: false,
                        error: "Required parameter 'query' not provided",
                        hint: "search_available_models type='loras' query='detail'"
                    };
                }
                return this.workflowAPI.listModels(params.type, params.query);
            },

            // =========================================================================
            // NODE TOOLS - CRUD operations (Phase 2: Multi-item with $ref support)
            // =========================================================================
            'create_node': async (params) => {
                // Handle both array and single-node formats
                let nodes = params.nodes;
                if (!nodes && params.type) {
                    // Single-node shorthand
                    nodes = [{
                        type: params.type,
                        pos: params.pos,
                        ref: params.ref,
                        widgets: params.widgets,
                        title: params.title,
                        group: params.group
                    }];
                }
                if (!nodes || nodes.length === 0) {
                    return enrichError('create_node', 'No nodes specified - provide type or nodes array');
                }

                // Check if workflow has existing groups (for auto-integration)
                const existingGroups = app?.graph?._groups || [];
                const hasGroups = existingGroups.length > 0;

                const results = [];
                const groupNodes = {}; // Track nodes by group for batch group creation

                for (const nodeSpec of nodes) {
                    // Resolve any $refs in the spec (e.g., position relative to another node)
                    const resolved = this.refResolver.resolveParams(nodeSpec);

                    // =============================================================
                    // AUTO-INTEGRATION: Smart positioning when workflow has groups
                    // =============================================================
                    // If no explicit position AND no explicit group specified,
                    // AND workflow has existing groups, auto-integrate!
                    let finalX = resolved.pos?.[0];
                    let finalY = resolved.pos?.[1];
                    let autoGroup = null;

                    const hasExplicitPos = resolved.pos && (resolved.pos[0] !== undefined || resolved.pos[1] !== undefined);
                    const hasExplicitGroup = resolved.group !== undefined;

                    if (hasGroups && !hasExplicitPos && !hasExplicitGroup) {
                        // AUTO-INTEGRATE: Prepare group and get smart position
                        console.log(`[ClaudeChat] Auto-integrating ${resolved.type} into groups`);

                        const prepResult = GroupMethods.prepareGroupForNode.call(
                            this.workflowAPI,
                            resolved.type,
                            200, // estimated width
                            100  // estimated height
                        );

                        if (prepResult.success && prepResult.position) {
                            finalX = prepResult.position[0];
                            finalY = prepResult.position[1];
                            autoGroup = prepResult.group;

                            console.log(`[ClaudeChat] Auto-position: (${finalX}, ${finalY}) in group "${autoGroup}" (${prepResult.action})`);
                        }
                    }

                    // Default position if still not set
                    if (finalX === undefined) finalX = 100;
                    if (finalY === undefined) finalY = 100;

                    const result = this.workflowAPI.addNode(
                        resolved.type,
                        finalX,
                        finalY,
                        { widgets: resolved.widgets, title: resolved.title }
                    );

                    if (result.success && nodeSpec.ref) {
                        // Register the $ref for use in subsequent tool calls
                        this.refResolver.register(nodeSpec.ref, result.node_id);
                        result.ref = nodeSpec.ref;
                    }

                    // Track auto-integration result
                    if (result.success && autoGroup) {
                        result.auto_integrated = true;
                        result.group = autoGroup;
                    }

                    // Track explicit group assignment for batch creation
                    if (result.success && nodeSpec.group) {
                        const groupName = typeof nodeSpec.group === 'string'
                            ? nodeSpec.group
                            : nodeSpec.group.title;
                        if (!groupNodes[groupName]) {
                            groupNodes[groupName] = { nodes: [], config: nodeSpec.group };
                        }
                        groupNodes[groupName].nodes.push(result.node_id);
                    }

                    results.push(result);
                }

                // Create/update groups for explicitly assigned nodes
                for (const [groupName, data] of Object.entries(groupNodes)) {
                    const color = typeof data.config === 'object' ? data.config.color : null;
                    this.workflowAPI.createGroupForNodes(groupName, data.nodes, color, 60);
                }

                return nodes.length === 1
                    ? results[0]
                    : { success: results.every(r => r.success), results };
            },
            'delete_node': (params) => {
                // Handle both 'node' (single) and 'nodes' (array) params
                let nodes = params.nodes || (params.node ? [params.node] : []);
                if (nodes.length === 0) {
                    return enrichError('delete_node', 'No nodes specified - provide node ID or nodes array');
                }
                // Resolve $refs
                nodes = nodes.map(n => this.refResolver.resolve(n));
                const deleted = [];
                let allSuccess = true;
                for (const nodeId of nodes) {
                    const result = this.workflowAPI.removeNode(nodeId, params.reconnect);
                    if (result.success) {
                        deleted.push(nodeId);
                    } else {
                        allSuccess = false;
                    }
                }
                return { success: allSuccess, deleted };
            },
            'update_node': (params) => {
                // Handle both 'updates' array and single update
                let updates = params.updates;
                if (!updates && params.node) {
                    updates = [{ node: params.node, pos: params.pos, title: params.title }];
                }
                if (!updates || updates.length === 0) {
                    return { success: true, message: 'No updates specified' };
                }

                const updated = [];
                for (const update of updates) {
                    const nodeId = this.refResolver.resolve(update.node);
                    let success = true;

                    if (update.pos) {
                        const result = this.workflowAPI.moveNode(nodeId, update.pos[0], update.pos[1]);
                        success = result.success;
                    }
                    if (update.title) {
                        const node = app.graph?.getNodeById(nodeId);
                        if (node) {
                            node.title = update.title;
                            app.graph?.setDirtyCanvas(true, true);
                        }
                    }
                    if (success) updated.push(nodeId);
                }
                return { success: updated.length === updates.length, updated };
            },
            'duplicate_node': async (params) => {
                // Handle both 'nodes' array and single node
                let nodes = params.nodes;
                if (!nodes && params.node) {
                    nodes = [{ node: params.node, ref: params.ref, offset: params.offset }];
                }
                if (!nodes || nodes.length === 0) {
                    return enrichError('duplicate_node', 'No nodes specified - provide node ID to duplicate');
                }

                const created = [];
                const refs = {};
                for (const spec of nodes) {
                    const nodeId = this.refResolver.resolve(spec.node);
                    const result = this.workflowAPI.duplicateNode(nodeId, spec.offset || [50, 50]);

                    if (result.success) {
                        created.push(result.new_id);
                        if (spec.ref) {
                            this.refResolver.register(spec.ref, result.new_id);
                            refs[spec.ref] = result.new_id;
                        }
                    }
                }
                return { success: created.length === nodes.length, created, refs };
            },
            'bypass_node': (params) => {
                // Handle both 'nodes' array and single node
                let nodes = params.nodes || (params.node ? [params.node] : []);
                if (nodes.length === 0) {
                    return enrichError('bypass_node', 'No nodes specified - provide node ID or nodes array');
                }
                nodes = nodes.map(n => this.refResolver.resolve(n));
                const bypass = params.bypass !== false;
                const affected = [];
                for (const nodeId of nodes) {
                    const result = this.workflowAPI.setNodeMode(nodeId, bypass ? 4 : 0);
                    if (result.success) affected.push(nodeId);
                }
                const key = bypass ? 'bypassed' : 'activated';
                return { success: affected.length === nodes.length, [key]: affected };
            },

            // =========================================================================
            // LINK TOOLS - Node connections (Phase 2: Multi-item with $ref support)
            // =========================================================================
            'create_node_link': (params) => {
                // Handle both 'links' array and single link
                let links = params.links;
                if (!links && (params.from_node !== undefined || params.from !== undefined)) {
                    links = [{
                        from: params.from_node ?? params.from,
                        from_slot: params.from_slot,
                        to: params.to_node ?? params.to,
                        to_slot: params.to_slot
                    }];
                }
                if (!links || links.length === 0) {
                    return enrichError('create_node_link', 'No links specified - provide from_node, from_slot, to_node, to_slot');
                }

                let created = 0;
                for (const link of links) {
                    const fromNode = this.refResolver.resolve(link.from_node ?? link.from);
                    const toNode = this.refResolver.resolve(link.to_node ?? link.to);
                    const result = this.workflowAPI.connect(
                        fromNode, link.from_slot,
                        toNode, link.to_slot
                    );
                    if (result.success) created++;
                }
                return { success: created === links.length, links: created };
            },
            'delete_node_link': (params) => {
                // Handle both 'links' array and single link
                let links = params.links;
                if (!links && params.node !== undefined) {
                    links = [{ node: params.node, input_slot: params.input_slot }];
                }
                if (!links || links.length === 0) {
                    return enrichError('delete_node_link', 'No links specified - provide node and input_slot');
                }

                let deleted = 0;
                for (const link of links) {
                    const nodeId = this.refResolver.resolve(link.node);
                    const result = this.workflowAPI.disconnect(nodeId, link.input_slot);
                    if (result.success) deleted++;
                }
                return { success: deleted === links.length, deleted };
            },

            // =========================================================================
            // WIDGET TOOLS - Node configuration (Phase 2: Multi-item with $ref)
            // =========================================================================
            'update_widget': (params) => {
                // Handle both 'updates' array and single update
                let updates = params.updates;
                if (!updates && params.node !== undefined) {
                    updates = [{ node: params.node, widget: params.widget, value: params.value }];
                }
                if (!updates || updates.length === 0) {
                    return enrichError('update_widget', 'No updates specified - provide node, widget, and value');
                }

                // Note: Prompt Guard only hides prompt text from Claude's view (via stripPromptData).
                // It does NOT block modifications - Claude can still change settings on any node,
                // it just can't see the current prompt values.

                let updated = 0;
                for (const update of updates) {
                    const nodeId = this.refResolver.resolve(update.node);
                    const result = this.workflowAPI.setWidget(nodeId, update.widget, update.value);
                    if (result.success) updated++;
                }
                return { success: updated === updates.length, updated };
            },
            'get_widget_options': (params) => {
                // Handle both 'queries' array and single query
                let queries = params.queries;
                if (!queries && params.node !== undefined) {
                    queries = [{ node: params.node, widget: params.widget }];
                }
                if (!queries || queries.length === 0) {
                    return enrichError('get_widget_options', 'No queries specified - provide node and widget name');
                }

                const results = [];
                for (const query of queries) {
                    const nodeId = this.refResolver.resolve(query.node);
                    const result = this.workflowAPI.getWidgetOptions(nodeId, query.widget);
                    results.push(result);
                }
                return queries.length === 1 ? results[0] : { success: true, results };
            },

            // =========================================================================
            // GROUP TOOLS - Visual organization (Phase 2: Multi-item with $ref)
            // =========================================================================
            'create_group': (params) => {
                // Handle both 'groups' array and single group
                let groups = params.groups;
                if (!groups && params.title !== undefined) {
                    groups = [{ title: params.title, nodes: params.nodes, color: params.color, padding: params.padding }];
                }
                if (!groups || groups.length === 0) {
                    return enrichError('create_group', 'No groups specified - provide title and optional nodes array');
                }

                const results = [];
                for (const group of groups) {
                    // Resolve $refs in node list
                    const nodeIds = (group.nodes || []).map(n => this.refResolver.resolve(n));
                    const result = this.workflowAPI.createGroupForNodes(
                        group.title, nodeIds, group.color, group.padding || 60
                    );
                    results.push(result);
                }
                return groups.length === 1 ? results[0] : { success: results.every(r => r.success), results };
            },
            'delete_group': (params) => {
                // Handle both 'groups' array and single group
                let groups = params.groups;
                if (groups === undefined && params.group !== undefined) {
                    groups = [params.group];
                }
                if (!groups || groups.length === 0) {
                    return enrichError('delete_group', 'No groups specified - provide group index or name');
                }

                // Delete in reverse order to preserve indices
                const sorted = [...groups].sort((a, b) => b - a);
                const results = sorted.map(g => this.workflowAPI.deleteGroup(g));
                return groups.length === 1 ? results[0] : { success: results.every(r => r.success), results };
            },
            'update_group': (params) => {
                // Handle both 'updates' array and single update
                let updates = params.updates;
                if (!updates && params.group !== undefined) {
                    updates = [{
                        group: params.group,
                        title: params.title,
                        color: params.color,
                        pos: params.pos,
                        size: params.size,
                        nodes: params.nodes,
                        add_nodes: params.add_nodes,
                        remove_nodes: params.remove_nodes
                    }];
                }
                if (!updates || updates.length === 0) {
                    return enrichError('update_group', 'No updates specified - provide group and properties to update');
                }

                const results = [];
                for (const update of updates) {
                    // Resolve $refs in node lists
                    const nodeIds = update.nodes ? update.nodes.map(n => this.refResolver.resolve(n)) : undefined;
                    const addNodeIds = update.add_nodes ? update.add_nodes.map(n => this.refResolver.resolve(n)) : undefined;
                    const removeNodeIds = update.remove_nodes ? update.remove_nodes.map(n => this.refResolver.resolve(n)) : undefined;

                    const result = this.workflowAPI.updateGroup(update.group, {
                        title: update.title,
                        color: update.color,
                        pos: update.pos,
                        size: update.size,
                        nodes: nodeIds,
                        add_nodes: addNodeIds,
                        remove_nodes: removeNodeIds
                    });
                    results.push(result);
                }
                return updates.length === 1 ? results[0] : { success: results.every(r => r.success), results };
            },
            'split_group': (params) => {
                // Resolve $refs in node lists within 'into' array
                const split = { ...params.split || params };
                if (split.into) {
                    split.into = split.into.map(spec => ({
                        ...spec,
                        nodes: spec.nodes ? spec.nodes.map(n => this.refResolver.resolve(n)) : []
                    }));
                }
                return this.workflowAPI.splitGroup(split);
            },
            'move_nodes_to_group': (params) => {
                // Handle both 'moves' array (documented) and legacy params
                let moves = params.moves;
                if (!moves && params.nodes !== undefined) {
                    moves = [{ nodes: params.nodes, to_group: params.group ?? params.to_group }];
                }
                if (!moves || moves.length === 0) {
                    return { success: false, error: 'No moves specified', hint: 'Use moves: [{nodes: [ids], to_group: "name"}]' };
                }

                let totalMoved = 0;
                for (const move of moves) {
                    const nodeIds = (move.nodes || []).map(n => this.refResolver.resolve(n));
                    const target = move.to_group;

                    // Handle different target types
                    if (target === null) {
                        // Ungroup - just remove from all groups (nodes stay in place)
                        for (const nodeId of nodeIds) totalMoved++;
                    } else if (typeof target === 'string') {
                        // Move to existing group by name
                        const result = this.workflowAPI.moveNodesToGroup(nodeIds, target);
                        if (result.success) totalMoved += nodeIds.length;
                    } else if (typeof target === 'object') {
                        // Create new group with config
                        const result = this.workflowAPI.createGroupForNodes(target.title, nodeIds, target.color);
                        if (result.success) totalMoved += nodeIds.length;
                    }
                }
                return { success: true, moved: totalMoved };
            },
            'merge_groups': (params) => {
                // Handle both 'merge' object (documented) and legacy flat params
                let groups, title, color;
                if (params.merge) {
                    groups = params.merge.groups;
                    title = params.merge.into?.title || params.merge.into;
                    color = params.merge.into?.color;
                } else {
                    groups = params.groups;
                    title = params.new_title;
                    color = params.color;
                }
                const result = this.workflowAPI.mergeGroups(groups, title, color);
                if (result.success) {
                    return { success: true, merged: groups.length, resulting_group: result.group_index };
                }
                return result;
            },
            'detect_group_issues': (params) => this.workflowAPI.checkGroupOverlaps(params?.min_gap),

            // =========================================================================
            // LAYOUT TOOLS - Node/Group positioning (Phase 2)
            // =========================================================================
            'move_group': (params) => {
                // Move group and all its contents by delta
                if (params.group === undefined) {
                    return enrichError('move_group', 'Group index or name required');
                }
                return this.workflowAPI.moveGroupWithContents(
                    params.group,
                    params.dx || 0,
                    params.dy || 0
                );
            },
            'fit_group_to_nodes': (params) => {
                // Resize group to fit specified nodes
                if (params.group === undefined) {
                    return enrichError('fit_group_to_nodes', 'Group index or name required');
                }
                const nodeIds = (params.nodes || []).map(n => this.refResolver.resolve(n));
                return this.workflowAPI.fitGroupToNodes(
                    params.group,
                    nodeIds,
                    params.padding || 60
                );
            },
            'align_nodes': (params) => {
                // Align nodes to edge or center
                if (!params.nodes || params.nodes.length === 0) {
                    return enrichError('align_nodes', 'Node IDs array required');
                }
                const nodeIds = params.nodes.map(n => this.refResolver.resolve(n));
                return this.workflowAPI.alignNodes(nodeIds, params.alignment || 'left');
            },
            'distribute_nodes': (params) => {
                // Space nodes evenly
                if (!params.nodes || params.nodes.length === 0) {
                    return enrichError('distribute_nodes', 'Node IDs array required');
                }
                const nodeIds = params.nodes.map(n => this.refResolver.resolve(n));
                return this.workflowAPI.distributeNodes(
                    nodeIds,
                    params.direction || 'horizontal',
                    params.spacing
                );
            },
            'integrate_node_into_groups': (params) => {
                // Integrate newly added node into existing group layout
                if (params.node_id === undefined) {
                    return enrichError('integrate_node_into_groups', 'node_id required');
                }
                return this.workflowAPI.integrateNodeIntoGroups(
                    this.refResolver.resolve(params.node_id),
                    params
                );
            },

            // =========================================================================
            // EXECUTION TOOLS - Workflow execution lifecycle
            // =========================================================================
            'queue_execution': async (params) => {
                // Submit current workflow to ComfyUI's execution queue
                const result = await this.workflowAPI.queuePrompt(params?.batch_size || 1);
                if (result.success) {
                    return {
                        success: true,
                        queued: true,
                        position: result.number || 1
                    };
                }
                return result;
            },
            'cancel_execution': async () => {
                // Cancel/interrupt current workflow execution
                const result = await this.workflowAPI.interruptGeneration();
                return {
                    success: result.success,
                    cancelled: result.success
                };
            },
            'execution_status': async (params) => {
                const status = await this.workflowAPI.getQueueStatus();
                if (!status.success) return status;

                // Transform to documented format
                const running = status.queue?.running?.length > 0;
                const queueSize = (status.queue?.running?.length || 0) + (status.queue?.pending?.length || 0);

                const response = {
                    running,
                    queue_size: queueSize,
                    queue_position: running ? 1 : 0
                };

                // Include history if requested
                if (params?.include_history) {
                    const history = await this.workflowAPI.getHistory(params?.history_limit || 5);
                    response.history = history.history;
                }

                return response;
            },

            // =========================================================================
            // HIGH-LEVEL TOOLS - Workflow-wide operations
            // =========================================================================
            'organize': async (params) => {
                // Check cableless availability upfront
                if (params?.cableless) {
                    const setGetAvailable = this.workflowAPI.checkSetGetNodesAvailable?.() ?? true;
                    if (!setGetAvailable) {
                        return {
                            success: false,
                            error: "Cableless mode requires ComfyUI-Easy-Use extension",
                            hint: "Install ComfyUI-Easy-Use for Set/Get nodes, or omit cableless flag"
                        };
                    }
                }

                // LLM mode with plan
                if (params?.llm || params?.plan) {
                    if (!params?.plan) {
                        return {
                            success: false,
                            error: "LLM mode requires a 'plan' parameter",
                            hint: "Provide plan: {flow: 'left_to_right', groups: [{title, nodes, order}]}"
                        };
                    }
                    // Resolve $refs in plan node arrays
                    const plan = { ...params.plan };
                    if (plan.groups) {
                        plan.groups = plan.groups.map(g => ({
                            ...g,
                            nodes: g.nodes ? g.nodes.map(n => this.refResolver.resolve(n)) : []
                        }));
                    }
                    return this.workflowAPI.organizeWithPlan(plan, {
                        cableless: params?.cableless || false
                    });
                }

                // Instant mode (JS-based auto-layout)
                return this.workflowAPI.autoOrganizeWorkflow({
                    groupPadding: params?.groupPadding,
                    groupSpacing: params?.groupSpacing,
                    nodeSpacing: params?.nodeSpacing,
                    cableless: params?.cableless || false
                });
            },
            'clear_workflow': () => this.workflowAPI.clearWorkflow(),

            // =========================================================================
            // UTILITY TOOLS
            // =========================================================================
            'undo': (params) => {
                const count = params?.count || 1;
                let result;
                for (let i = 0; i < count; i++) {
                    result = this.workflowAPI.undo();
                    if (!result.success) break;
                }
                return result;
            },
            'batch': async (params) => {
                // Phase 3: Execute multiple commands atomically with rollback support
                const executor = new BatchExecutor(
                    this.workflowAPI,
                    this.refResolver,
                    this.toolActionMap
                );
                return await executor.execute(params.commands, {
                    dry_run: params.dry_run || false
                });
            },
            'help': (params) => {
                // Phase 3: On-demand documentation lookup
                return this.getToolHelp(params?.topic);
            },

            // =========================================================================
            // ANALYSIS TOOLS (Phase 4)
            // =========================================================================
            'find_nodes': (params) => {
                // Support both 'where' (new) and 'query' (legacy) params
                const where = params?.where || params?.query || {};
                return this.workflowAPI.findNodesAdvanced(where);
            },
            'get_modified_widgets': (params) => {
                // Returns widgets that differ from their default values
                const nodes = params?.nodes || [];
                return this.compareToDefaults(nodes);
            },
            'detect_layout_issues': (params) => {
                const minSpacing = params?.min_spacing || 20;
                return this.detectLayoutIssues(minSpacing);
            },
            'validate_workflow': () => {
                return this.validateWorkflow();
            },
            'analyze_workflow': (params) => {
                const includeSuggestions = params?.include_suggestions !== false;
                return this.analyzeWorkflow(includeSuggestions);
            },

            // =========================================================================
            // LOW-LEVEL DEBUG TOOLS (Phase 4)
            // =========================================================================
            'get_workflow_json': () => {
                return this.workflowAPI.getWorkflowFull();
            },
            'patch_workflow_json': (params) => {
                return this.patchWorkflowJson(params.patches);
            },
            'set_workflow_json': (params) => {
                return this.setWorkflowJson(params.workflow);
            },

            // =========================================================================
            // ALIASES - Handle common LLM hallucinations gracefully
            // =========================================================================
            'mute_node': (params) => {
                // Alias: mute_node -> bypass_node (LLM sometimes hallucinates this name)
                console.warn('[Claude Chat] mute_node is not a valid tool - using bypass_node instead');
                return this.toolActionMap['bypass_node'](params);
            },
            'set_bypass': (params) => {
                // Alias: set_bypass -> bypass_node (LLM sometimes hallucinates this name)
                console.warn('[Claude Chat] set_bypass is not a valid tool - using bypass_node instead');
                return this.toolActionMap['bypass_node'](params);
            },
            'toggle_bypass': (params) => {
                // Alias: toggle_bypass -> bypass_node
                console.warn('[Claude Chat] toggle_bypass is not a valid tool - using bypass_node instead');
                return this.toolActionMap['bypass_node'](params);
            },
            'unmute_node': (params) => {
                // Alias: unmute_node -> bypass_node with bypass: false
                console.warn('[Claude Chat] unmute_node is not a valid tool - using bypass_node instead');
                return this.toolActionMap['bypass_node']({ ...params, bypass: false });
            },

        };
    }

    get currentFontSize() {
        return this.fontSizes[this.fontSizeIndex];
    }

    cycleFontSize() {
        this.fontSizeIndex = (this.fontSizeIndex + 1) % this.fontSizes.length;
        localStorage.setItem('claude-chat-font-size', this.fontSizeIndex.toString());
        this.applyFontSize();
    }

    applyFontSize() {
        // Apply font size to the entire panel - all text inherits from here
        const panel = document.getElementById('claude-chat-panel');
        if (panel) {
            panel.style.fontSize = this.currentFontSize + 'px';
        }
    }

    async init() {
        console.log('[Claude Chat] Starting initialization...');

        // Add button to ComfyUI menu bar
        await this.addMenuButton();

        // Check connection status
        await this.checkStatus();

        console.log('[Claude Chat] Initialized successfully');
    }

    async addMenuButton() {
        console.log('[Claude Chat] Adding menu button...');

        // Wait for app.menu to be available
        let attempts = 0;
        const maxAttempts = 50;

        const waitForMenu = () => {
            return new Promise((resolve) => {
                const check = setInterval(() => {
                    attempts++;
                    if (app.menu?.settingsGroup) {
                        clearInterval(check);
                        resolve(true);
                    } else if (attempts >= maxAttempts) {
                        clearInterval(check);
                        resolve(false);
                    }
                }, 100);
            });
        };

        const hasMenu = await waitForMenu();

        if (hasMenu) {
            try {
                // Get ComfyButton from new API or fall back to legacy import
                const { ComfyButton } = window.comfyAPI?.ui?.components ??
                    await import("../../../scripts/ui/components/button.js");

                const claudeButton = new ComfyButton({
                    icon: "chat",
                    action: () => this.toggle(),
                    tooltip: "Claude Chat",
                    content: "Claude",
                });

                // Style the button with Claude orange
                const btn = claudeButton.element;
                btn.style.backgroundColor = '#D97706';
                btn.style.color = 'white';
                btn.style.borderColor = '#B45309';
                btn.addEventListener('mouseenter', () => {
                    btn.style.backgroundColor = '#B45309';
                });
                btn.addEventListener('mouseleave', () => {
                    btn.style.backgroundColor = '#D97706';
                });

                app.menu.settingsGroup.append(claudeButton);
                console.log('[Claude Chat] Menu button added successfully');
            } catch (e) {
                console.error('[Claude Chat] Failed to create ComfyButton:', e);
                this.createFloatingButton();
            }
        } else {
            console.log('[Claude Chat] Menu not found, creating floating button');
            this.createFloatingButton();
        }
    }

    createFloatingButton() {
        // Create a floating button in the top-left corner
        const button = document.createElement('button');
        button.id = 'claude-chat-btn';
        button.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
        `;
        button.style.cssText = `
            position: fixed;
            top: 10px;
            left: 60px;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            padding: 8px;
            background: linear-gradient(135deg, #D97706 0%, #B45309 100%);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            transition: all 0.2s ease;
        `;

        button.onmouseenter = () => {
            button.style.transform = 'scale(1.1)';
        };
        button.onmouseleave = () => {
            button.style.transform = 'scale(1)';
        };

        button.onclick = () => this.toggle();

        document.body.appendChild(button);
        console.log('[Claude Chat] Floating button created');
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        if (this.panel) {
            this.panel.style.display = 'flex';
        } else {
            this.createPanel();
        }
        this.isOpen = true;
    }

    close() {
        if (this.panel) {
            this.panel.style.display = 'none';
        }
        this.isOpen = false;
    }

    // =========================================================================
    // HELP SYSTEM (Phase 3)
    // =========================================================================

    /**
     * Get tool documentation on-demand
     * @param {string} topic - Tool name, category, 'patterns', 'slots', or empty for index
     * @returns {Object} Documentation or error with suggestions
     */
    getToolHelp(topic = null) {
        // No topic: return tool index
        if (!topic) {
            return {
                success: true,
                topic: 'index',
                categories: Object.entries(TOOL_CATEGORIES).map(([name, tools]) => ({
                    name,
                    tools: tools.map(t => ({ name: t, summary: TOOL_DOCS[t]?.summary || '' }))
                })),
                hint: "Call help with a topic for details: help topic='batch' or help topic='discovery'"
            };
        }

        const topicLower = topic.toLowerCase();

        // Check if topic is a tool name
        if (TOOL_DOCS[topic] || TOOL_DOCS[topicLower]) {
            const doc = TOOL_DOCS[topic] || TOOL_DOCS[topicLower];
            return {
                success: true,
                topic: topic,
                documentation: doc
            };
        }

        // Check if topic is a category
        if (TOOL_CATEGORIES[topicLower]) {
            const tools = TOOL_CATEGORIES[topicLower];
            return {
                success: true,
                topic: topicLower,
                category: topicLower,
                tools: tools.map(t => ({
                    name: t,
                    summary: TOOL_DOCS[t]?.summary || '',
                    syntax: TOOL_DOCS[t]?.syntax || ''
                }))
            };
        }

        // Special topic: patterns ($ref, arrays, inline groups)
        if (topicLower === 'patterns' || topicLower === 'pattern') {
            return {
                success: true,
                topic: 'patterns',
                patterns: PATTERNS
            };
        }

        // Special topic: slots (common node slot patterns)
        if (topicLower === 'slots' || topicLower === 'slot' || topicLower === 'common_slots') {
            return {
                success: true,
                topic: 'slots',
                common_slots: COMMON_SLOTS,
                hint: "Slot indices are 0-based. Use get_node type='NodeType' for full schema."
            };
        }

        // Search for partial matches
        const matches = searchTools(topic);
        if (matches.length > 0) {
            return {
                success: true,
                topic: 'search',
                query: topic,
                matches: matches.slice(0, 10),
                hint: matches.length > 10 ? `${matches.length} results, showing first 10` : null
            };
        }

        // No match found
        return {
            success: false,
            error: `Unknown topic: ${topic}`,
            hint: "Try a tool name (batch, create_node), category (discovery, nodes), or special topic (patterns, slots)",
            available_categories: Object.keys(TOOL_CATEGORIES)
        };
    }

    startNewChat() {
        // Clear the messages array
        this.messages = [];

        // Clear the messages container and add welcome message
        const container = document.getElementById('claude-messages');
        if (container) {
            container.innerHTML = '';
            this.addWelcomeMessage(container);
        }

        // Clear the input field
        const input = document.getElementById('claude-input');
        if (input) {
            input.value = '';
            input.style.height = 'auto';
        }

        // Reset context generator's first message flag
        // This ensures Installed Packs are sent again on the first message of a new chat
        this.contextGenerator.resetFirstMessage();

        // Clear RefResolver for new conversation
        this.refResolver.clear();

        console.log('[Claude Chat] Started new chat');
    }

    createPanel() {
        createPanelDOM(this);
    }

    addWelcomeMessage(container) {
        const msg = document.createElement('div');
        msg.style.cssText = `
            padding: 16px;
            background: linear-gradient(135deg, rgba(217,119,6,0.1) 0%, rgba(180,83,9,0.1) 100%);
            border-radius: 8px;
            border-left: 3px solid #D97706;
            font-size: inherit;
        `;
        msg.innerHTML = `
            <div style="font-weight: 600; color: #D97706; margin-bottom: 8px;">
                Hi, I'm Claude by Anthropic!
            </div>
            <div style="color: #aaa; font-size: 0.9em; line-height: 1.5;">
                I can help with your ComfyUI workflow. Try asking:
                <ul style="margin: 8px 0 0 0; padding-left: 20px;">
                    <li>Why is my image grainy?</li>
                    <li>What CFG should I use for SDXL?</li>
                    <li>Add a LoRA loader to my workflow</li>
                </ul>
            </div>
            <div style="color: #666; font-size: 0.75em; margin-top: 12px; padding-top: 10px; border-top: 1px solid #3a3a5a; line-height: 1.4;">
                🔒 <strong>Privacy:</strong> Conversations are sent to Anthropic's Claude API. Debug logging is <strong>disabled by default</strong> and can only be enabled by the server administrator via CLAUDE_CHAT_DEBUG=1.
            </div>
        `;
        container.appendChild(msg);
    }

    getEventPos(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    startDrag(e) {
        if (e.target.tagName === 'BUTTON') return;
        e.preventDefault();

        const pos = this.getEventPos(e);
        this.isDragging = true;
        this.dragOffset = {
            x: pos.x - this.panel.offsetLeft,
            y: pos.y - this.panel.offsetTop
        };
    }

    startResize(e) {
        e.preventDefault();
        e.stopPropagation();
        this.isResizing = true;
    }

    handleMove(e) {
        if (!this.isDragging && !this.isResizing) return;

        const pos = this.getEventPos(e);

        if (this.isDragging) {
            e.preventDefault();
            this.x = Math.max(0, Math.min(window.innerWidth - 100, pos.x - this.dragOffset.x));
            this.y = Math.max(0, Math.min(window.innerHeight - 100, pos.y - this.dragOffset.y));
            this.panel.style.left = this.x + 'px';
            this.panel.style.top = this.y + 'px';
        }

        if (this.isResizing) {
            e.preventDefault();
            this.width = Math.max(320, pos.x - this.panel.offsetLeft);
            this.height = Math.max(400, pos.y - this.panel.offsetTop);
            this.panel.style.width = this.width + 'px';
            this.panel.style.height = this.height + 'px';
        }
    }

    handleEnd() {
        this.isDragging = false;
        this.isResizing = false;
    }

    async checkStatus() {
        try {
            const response = await fetch('/claude-chat/status');
            const data = await response.json();
            this.authMethod = data.auth_method || 'none';

            const badge = document.getElementById('claude-status-badge');
            if (badge) {
                if (data.auth_method === 'max_plan') {
                    badge.textContent = 'Max Plan';
                    badge.style.background = 'rgba(34,197,94,0.3)';
                } else if (data.auth_method === 'anthropic_api') {
                    badge.textContent = 'API';
                    badge.style.background = 'rgba(59,130,246,0.3)';
                } else {
                    badge.textContent = 'Not Connected';
                    badge.style.background = 'rgba(239,68,68,0.3)';
                }
            }

            // Store status data for later use
            this.hasApiKey = data.has_api_key;
            this.hasMaxPlan = data.has_max_plan;
            this.authPreference = data.auth_preference || 'auto';

            // Update image checkbox based on auth preference and API key availability
            // - Max Plan Only mode: Always disabled (no image analysis)
            // - Auto mode: Enabled if API key available (hybrid: Max Plan for chat, API for images)
            // - API Only mode: Enabled if API key available
            const imageCheckbox = document.getElementById('claude-include-image');
            const imageOption = document.getElementById('claude-image-option');
            if (imageCheckbox && imageOption) {
                const isMaxPlanOnly = data.auth_preference === 'max';
                const canUseImages = !isMaxPlanOnly && data.has_api_key;

                if (canUseImages) {
                    imageCheckbox.disabled = false;
                    imageOption.style.opacity = '1';
                    imageOption.title = 'Attach last generated image for analysis';
                } else {
                    imageCheckbox.disabled = true;
                    imageCheckbox.checked = false;
                    imageOption.style.opacity = '0.5';
                    if (isMaxPlanOnly) {
                        imageOption.title = 'Image analysis disabled in Max Plan Only mode';
                    } else {
                        imageOption.title = 'Image analysis requires an Anthropic API key';
                    }
                }
            }
        } catch (e) {
            console.error('[Claude Chat] Status check failed:', e);
        }
    }

    /**
     * Update the Prompt Guard indicator in the header
     * Shows/hides shield icon based on promptGuardEnabled state
     * Also syncs the canvas visual indicators
     */
    updatePromptGuardIndicator() {
        const indicator = document.getElementById('claude-prompt-guard-indicator');
        if (indicator) {
            indicator.style.display = this.promptGuardEnabled ? 'flex' : 'none';
        }
        // Sync canvas visual indicators (lazy load)
        loadPromptGuardModules().then(({ promptGuardCanvas }) => {
            if (promptGuardCanvas) {
                promptGuardCanvas.setEnabled(this.promptGuardEnabled);
            }
        });
    }

    getCurrentWorkflow() {
        try {
            if (app && app.graph) {
                const workflow = app.graph.serialize();
                // Apply Prompt Guard if enabled
                if (this.promptGuardEnabled) {
                    return this.stripPromptData(workflow);
                }
                return workflow;
            }
        } catch (e) {
            console.error('[Claude Chat] Failed to get workflow:', e);
        }
        return null;
    }

    /**
     * Strip prompt/text data from workflow for Prompt Guard
     * Uses the ProtectedNodesManager for intelligent detection
     * @param {Object} workflow - Serialized workflow object
     * @returns {Object} - Workflow with prompt data redacted
     */
    stripPromptData(workflow) {
        if (!workflow || !workflow.nodes) return workflow;

        // Deep clone to avoid modifying original
        const sanitized = JSON.parse(JSON.stringify(workflow));

        // Get protected nodes from manager (if loaded), otherwise use fallback
        let protectedNodeIds = new Set();
        if (protectedNodesManager) {
            protectedNodeIds = protectedNodesManager.getProtectedNodeIds();
        } else {
            // Fallback: protect known prompt node types
            const promptNodeTypes = ['CLIPTextEncode', 'CLIPTextEncodeSDXL', 'Note', 'ShowText', 'PrimitiveNode'];
            for (const node of sanitized.nodes) {
                if (promptNodeTypes.some(t => node.type?.includes(t))) {
                    protectedNodeIds.add(node.id);
                }
            }
        }

        let strippedCount = 0;

        for (const node of sanitized.nodes) {
            // Check if this node is protected (by auto-detection or user selection)
            const isProtected = protectedNodeIds.has(node.id);

            if (isProtected) {
                // Strip all string widget values
                if (node.widgets_values && Array.isArray(node.widgets_values)) {
                    node.widgets_values = node.widgets_values.map(val => {
                        if (typeof val === 'string' && val.length > 0) {
                            return '[PROMPT GUARD - CONTENT HIDDEN]';
                        }
                        return val;
                    });
                    strippedCount++;
                }

                // Strip properties.text for Note nodes
                if (node.properties?.text && typeof node.properties.text === 'string') {
                    node.properties.text = '[PROMPT GUARD - CONTENT HIDDEN]';
                }

                // Check title if it might contain prompt info
                if (node.title && node.title !== node.type) {
                    const looksLikePrompt = node.title.length > 30 ||
                        /\b(girl|boy|woman|man|photo|style|quality|detailed)\b/i.test(node.title);
                    if (looksLikePrompt) {
                        node.title = '[PROMPT GUARD - TITLE HIDDEN]';
                    }
                }
            }
        }

        console.log(`[Claude Chat] Prompt Guard: Stripped data from ${strippedCount} protected nodes (${protectedNodeIds.size} total protected)`);
        return sanitized;
    }

    async getLastGeneratedImage() {
        // Try to get the most recent image from ComfyUI's output
        try {
            // Method 1: Check for preview images in the DOM (most reliable)
            const previewImages = document.querySelectorAll('.comfy-img-preview, [data-node-type="PreviewImage"] img, .imagePreview img');
            if (previewImages.length > 0) {
                const lastImg = previewImages[previewImages.length - 1];
                if (lastImg.src) {
                    return await this.imageToBase64(lastImg.src);
                }
            }

            // Method 2: Check app's lastNodePreview if available
            if (app?.lastNodePreview?.src) {
                return await this.imageToBase64(app.lastNodePreview.src);
            }

            // Method 3: Fetch most recent from /history API
            const historyResponse = await fetch('/history?max_items=1');
            if (historyResponse.ok) {
                const history = await historyResponse.json();
                const prompts = Object.values(history);
                if (prompts.length > 0) {
                    const lastPrompt = prompts[0];
                    const outputs = lastPrompt?.outputs || {};
                    for (const nodeId in outputs) {
                        const nodeOutput = outputs[nodeId];
                        if (nodeOutput.images && nodeOutput.images.length > 0) {
                            const img = nodeOutput.images[nodeOutput.images.length - 1];
                            const imgUrl = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`;
                            return await this.imageToBase64(imgUrl);
                        }
                    }
                }
            }

            console.log('[Claude Chat] No recent image found');
            return null;
        } catch (e) {
            console.error('[Claude Chat] Failed to get last image:', e);
            return null;
        }
    }

    async imageToBase64(imgUrl) {
        try {
            const response = await fetch(imgUrl);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    // Return object with both base64 data and URL for preview
                    resolve({
                        base64: reader.result,
                        url: imgUrl,
                        mediaType: blob.type || 'image/png'
                    });
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error('[Claude Chat] Failed to convert image:', e);
            return null;
        }
    }

    /**
     * Execute a tool action client-side and return result
     */
    async executeClientSideTool(action, params) {
        console.log(`[Claude Chat] Executing client-side tool: ${action}`, params);

        const handler = this.toolActionMap[action];
        if (!handler) {
            return { success: false, error: `Unknown action: ${action}` };
        }

        try {
            const result = await handler(params);
            console.log(`[Claude Chat] Tool result:`, result);
            return result;
        } catch (e) {
            console.error(`[Claude Chat] Tool execution error:`, e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Update loading indicator with status text
     * @param {HTMLElement} loadingEl - The loading message element
     * @param {string} status - Status text to display
     */
    updateLoadingStatus(loadingEl, status) {
        if (!loadingEl) return;

        const statusText = loadingEl.querySelector('.claude-status-text');
        const toolLine = loadingEl.querySelector('.claude-tool-line');

        if (statusText) {
            statusText.textContent = status;
        }
        if (toolLine) {
            toolLine.style.display = 'none';
        }
    }

    /**
     * Send message with workflow tool support
     * @param {boolean} includeWorkflow - Whether to include workflow with requests
     */
    async sendMessageWithTools(message, workflow, history, imageData, loadingEl = null, includeWorkflow = true) {
        // Show initial status
        if (loadingEl) {
            this.updateLoadingStatus(loadingEl, 'Analyzing workflow...');
        }

        // Phase 5: Generate and inject workflow context automatically
        // This eliminates the need for Claude to call inspection tools
        // Respect Prompt Guard - hide prompt content if enabled
        let contextInjectedMessage = message;
        try {
            const workflowContext = this.contextGenerator.generate({
                promptGuardEnabled: this.promptGuardEnabled
            });
            if (workflowContext && !workflowContext.includes('Error generating')) {
                contextInjectedMessage = `${workflowContext}\n\n---\n\nUser: ${message}`;
            }
        } catch (e) {
            console.warn('[Claude Chat] Context generation failed:', e);
            // Continue without context on error
        }

        // Use AbortController for 3-minute timeout (large workflows take time)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000);

        const response = await fetch('/claude-chat/message-with-tools', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: contextInjectedMessage,
                workflow,
                image: imageData ? {
                    base64: imageData.base64,
                    mediaType: imageData.mediaType
                } : null,
                history: history.slice(-10),
                enable_tools: true
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const data = await response.json();

        // Check if there are client-side tools to execute
        if (data.success && data.pending_tool_calls) {
            console.log('[Claude Chat] Executing pending tool calls:', data.pending_tool_calls);
            console.log('[Claude Chat] Auth method:', data.auth_method);

            // Preserve the response text from the initial response (CLI mode includes explanation)
            const initialResponseText = data.response_text;

            // Update UI with first round of tools
            if (loadingEl) {
                this.updateToolProgress(loadingEl, 1, data.pending_tool_calls);
            }

            // Phase 2: Clear RefResolver before processing this batch of tool calls
            // $refs created in this batch will be available for subsequent tools in the same batch
            this.refResolver.clear();

            const toolResults = [];
            for (let i = 0; i < data.pending_tool_calls.length; i++) {
                const toolCall = data.pending_tool_calls[i];
                console.log(`[Claude Chat] Executing tool: ${toolCall.action}`, toolCall.params);

                // Update progress to show current tool
                if (loadingEl) {
                    this.updateToolProgress(loadingEl, 1, data.pending_tool_calls, i);
                }

                const result = await this.executeClientSideTool(
                    toolCall.action,
                    toolCall.params
                );
                console.log(`[Claude Chat] Tool ${toolCall.action} result:`, result);
                toolResults.push({
                    tool_use_id: toolCall.id,
                    result: result
                });
            }

            // Continue conversation with tool results (both API and CLI mode)
            // CLI mode now uses continue_cli_with_tool_results on the backend
            console.log('[Claude Chat] Continuing conversation with tool results...');
            if (loadingEl) {
                const statusText = loadingEl.querySelector('.claude-status-text');
                const toolStatus = loadingEl.querySelector('.claude-tool-status');
                if (statusText) statusText.textContent = 'Waiting for Claude...';
                // Show round number and completed tool names (truncate if too many)
                const allToolNames = data.pending_tool_calls.map(t => t.action || t.name);
                const toolCount = allToolNames.length;
                let toolSummary;
                if (toolCount <= 3) {
                    toolSummary = allToolNames.join(', ');
                } else {
                    toolSummary = `${allToolNames.slice(0, 2).join(', ')} +${toolCount - 2} more`;
                }
                if (toolStatus) toolStatus.textContent = `Round 1 • ${toolCount} tool${toolCount > 1 ? 's' : ''}: ${toolSummary}`;
            }

            // NOTE: Workflow is NOT sent with continuations - Claude should use
            // get_workflow_summary tool if it needs current state after modifications

            // Use AbortController for 3-minute timeout
            const contController = new AbortController();
            const contTimeoutId = setTimeout(() => contController.abort(), 180000);

            const continueResponse = await fetch('/claude-chat/continue-with-tools', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tool_results: toolResults,
                    conversation_id: data.conversation_id
                }),
                signal: contController.signal
            });
            clearTimeout(contTimeoutId);

            const continueData = await continueResponse.json();
            console.log('[Claude Chat] Continue response:', continueData);

            // Build accumulated response from initial text and any additional responses
            if (continueData.success) {
                // Combine initial explanation with continuation response
                let accumulatedResponse = '';
                if (initialResponseText) {
                    accumulatedResponse = initialResponseText;
                }
                if (continueData.response) {
                    if (accumulatedResponse) {
                        accumulatedResponse += '\n\n' + continueData.response;
                    } else {
                        accumulatedResponse = continueData.response;
                    }
                }
                if (continueData.response_text) {
                    if (accumulatedResponse) {
                        accumulatedResponse += '\n\n' + continueData.response_text;
                    } else {
                        accumulatedResponse = continueData.response_text;
                    }
                }
                // Set accumulated response if we have one
                if (accumulatedResponse && !continueData.pending_tool_calls) {
                    continueData.response = accumulatedResponse;
                }
            }

            return continueData;
        }

        return data;
    }

    async sendMessage() {
        const input = document.getElementById('claude-input');
        const message = input.value.trim();
        if (!message || this.isLoading) return;

        // Reset tool call counter for new message
        this.resetToolCounter();

        input.value = '';
        input.style.height = 'auto';

        const includeWorkflow = document.getElementById('claude-include-workflow')?.checked;
        const includeImage = document.getElementById('claude-include-image')?.checked;
        const workflowModeEnabled = document.getElementById('claude-workflow-mode')?.checked;

        const workflow = includeWorkflow ? this.getCurrentWorkflow() : null;

        // Get image data if checkbox is checked
        let imageData = null;
        if (includeImage) {
            imageData = await this.getLastGeneratedImage();
            if (!imageData) {
                this.addMessage('error', 'No recent image found to include');
            }
        }

        // Show user message with optional image thumbnail
        this.addMessage('user', message, false, imageData?.url);

        this.isLoading = true;
        const loadingEl = this.addMessage('assistant', '...', true);

        try {
            let data;

            if (workflowModeEnabled) {
                // Use workflow tools mode
                data = await this.sendMessageWithTools(message, workflow, this.messages, imageData, loadingEl, includeWorkflow);

                // Track accumulated response text across tool rounds
                let accumulatedText = data.response_text || '';
                let loopCount = 0;
                const maxLoops = 10;  // Prevent infinite loops

                // Handle recursive tool calls if there are still pending ones
                while (data.success && data.pending_tool_calls && loopCount < maxLoops) {
                    loopCount++;
                    console.log(`[Claude Chat] Processing tool round ${loopCount}...`);

                    // Update loading indicator with tool progress
                    this.updateToolProgress(loadingEl, loopCount, data.pending_tool_calls);

                    // Accumulate any response text from this round
                    if (data.response_text && !accumulatedText.includes(data.response_text)) {
                        accumulatedText += (accumulatedText ? '\n\n' : '') + data.response_text;
                    }

                    const toolResults = [];
                    for (let i = 0; i < data.pending_tool_calls.length; i++) {
                        const toolCall = data.pending_tool_calls[i];
                        console.log(`[Claude Chat] Executing: ${toolCall.action}`);

                        // Update progress to show current tool
                        this.updateToolProgress(loadingEl, loopCount, data.pending_tool_calls, i);

                        const result = await this.executeClientSideTool(
                            toolCall.action,
                            toolCall.params
                        );
                        toolResults.push({
                            tool_use_id: toolCall.id,
                            result: result
                        });
                    }

                    // Show status while waiting for continuation (keep tool line visible)
                    if (loadingEl) {
                        const statusText = loadingEl.querySelector('.claude-status-text');
                        const toolStatus = loadingEl.querySelector('.claude-tool-status');
                        if (statusText) statusText.textContent = 'Waiting for Claude...';
                        // Show round number and completed tool names (truncate if too many)
                        const allToolNames = data.pending_tool_calls.map(t => t.action || t.name);
                        const toolCount = allToolNames.length;
                        let toolSummary;
                        if (toolCount <= 3) {
                            toolSummary = allToolNames.join(', ');
                        } else {
                            toolSummary = `${allToolNames.slice(0, 2).join(', ')} +${toolCount - 2} more`;
                        }
                        if (toolStatus) toolStatus.textContent = `Round ${loopCount} • ${toolCount} tool${toolCount > 1 ? 's' : ''}: ${toolSummary}`;
                    }

                    // NOTE: Workflow NOT sent - Claude uses get_workflow_summary tool when needed

                    // Use AbortController for 3-minute timeout
                    const loopController = new AbortController();
                    const loopTimeoutId = setTimeout(() => loopController.abort(), 180000);

                    const continueResponse = await fetch('/claude-chat/continue-with-tools', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            tool_results: toolResults,
                            conversation_id: data.conversation_id
                        }),
                        signal: loopController.signal
                    });
                    clearTimeout(loopTimeoutId);
                    data = await continueResponse.json();
                    console.log(`[Claude Chat] Round ${loopCount} result:`, data);
                }

                // Final accumulation of response
                if (data.success) {
                    if (data.response_text && !accumulatedText.includes(data.response_text)) {
                        accumulatedText += (accumulatedText ? '\n\n' : '') + data.response_text;
                    }
                    if (data.response && !accumulatedText.includes(data.response)) {
                        accumulatedText += (accumulatedText ? '\n\n' : '') + data.response;
                    }
                    // Use accumulated text as final response
                    if (accumulatedText) {
                        data.response = accumulatedText;
                    }
                }

                if (loopCount >= maxLoops) {
                    console.warn('[Claude Chat] Max tool loop iterations reached');
                }
            } else {
                // Regular chat mode
                const response = await fetch('/claude-chat/message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message,
                        workflow,
                        image: imageData ? {
                            base64: imageData.base64,
                            mediaType: imageData.mediaType
                        } : null,
                        history: this.messages.slice(-10)
                    })
                });
                data = await response.json();
            }

            loadingEl.remove();

            if (data.success) {
                // CLI mode returns response_text alongside tool calls, API mode returns response
                const responseText = data.response_text || data.response || '';
                this.addMessage('assistant', responseText);
                this.messages.push(
                    { role: 'user', content: message, hasImage: !!imageData },
                    { role: 'assistant', content: responseText }
                );
            } else {
                this.addMessage('error', data.error || 'Failed to get response');
            }
        } catch (e) {
            loadingEl.remove();
            this.addMessage('error', 'Connection error: ' + e.message);
            console.error('[Claude Chat] Send error:', e);
        }

        this.isLoading = false;
    }

    addMessage(role, content, isLoading = false, imageUrl = null) {
        const container = document.getElementById('claude-messages');
        const msg = document.createElement('div');

        const isUser = role === 'user';
        const isError = role === 'error';

        msg.style.cssText = `
            padding: 12px 14px;
            border-radius: 12px;
            max-width: 90%;
            line-height: 1.5;
            font-size: inherit;
            ${isUser ? `
                background: linear-gradient(135deg, #D97706 0%, #B45309 100%);
                color: white;
                align-self: flex-end;
                margin-left: auto;
            ` : isError ? `
                background: rgba(239,68,68,0.2);
                border: 1px solid rgba(239,68,68,0.3);
                color: #f87171;
            ` : `
                background: #252540;
                color: #e0e0e0;
                border: 1px solid #3a3a5a;
            `}
            ${isLoading ? 'opacity: 0.7;' : ''}
        `;

        if (!isLoading) {
            content = this.formatMessage(content);
        }

        // Build message HTML with optional image thumbnail
        let msgHtml = '';
        if (imageUrl && isUser) {
            msgHtml = `
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                    <img src="${imageUrl}" style="
                        width: 48px;
                        height: 48px;
                        object-fit: cover;
                        border-radius: 6px;
                        border: 2px solid rgba(255,255,255,0.3);
                        flex-shrink: 0;
                    " title="Attached image">
                    <div style="flex: 1;">${content}</div>
                </div>
            `;
        } else if (isLoading) {
            msgHtml = `
                <div class="claude-loading-content" style="display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span class="claude-loading-dot">●</span>
                        <span class="claude-loading-dot" style="animation-delay: 0.2s">●</span>
                        <span class="claude-loading-dot" style="animation-delay: 0.4s">●</span>
                        <span class="claude-status-text" style="font-size: 0.9em; color: #e0e0e0; margin-left: 6px;">Waiting for Claude</span>
                    </div>
                    <div class="claude-tool-line" style="display: none; padding-left: 4px; font-size: 0.8em; color: #888; font-family: monospace;">
                        <span style="color: #555;">└─</span>
                        <span class="claude-tool-status" style="color: #D97706;"></span>
                    </div>
                </div>
            `;
        } else {
            msgHtml = content;
        }

        msg.innerHTML = msgHtml;

        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;

        return msg;
    }

    formatMessage(text) {
        return text
            .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre style="background:#1a1a2e;padding:8px;border-radius:4px;overflow-x:auto;margin:8px 0;font-size:0.9em;"><code style="font-size:inherit;">$2</code></pre>')
            .replace(/`([^`]+)`/g, '<code style="background:#1a1a2e;padding:2px 6px;border-radius:3px;font-size:0.9em;">$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    /**
     * Update the loading message with tool execution progress
     * Shows two-line format:
     *   Waiting for Claude
     *   └─ Tool Call #5: get_models
     *
     * @param {HTMLElement} loadingEl - The loading message element
     * @param {number} round - Current tool round (1-based)
     * @param {Array} toolCalls - Array of tool calls being executed
     * @param {number} currentTool - Index of current tool being executed (0-based)
     */
    updateToolProgress(loadingEl, round, toolCalls, currentTool = -1) {
        if (!loadingEl) return;

        const statusText = loadingEl.querySelector('.claude-status-text');
        const toolLine = loadingEl.querySelector('.claude-tool-line');
        const toolStatus = loadingEl.querySelector('.claude-tool-status');

        if (!statusText || !toolLine || !toolStatus) return;

        // Initialize cumulative counter if not set
        if (this._toolCallCounter === undefined) {
            this._toolCallCounter = 0;
        }

        // Update first line
        statusText.textContent = 'Waiting for Claude';

        if (currentTool >= 0 && currentTool < toolCalls.length) {
            // Increment counter for each new tool
            this._toolCallCounter++;

            // Show current tool being executed
            const toolName = toolCalls[currentTool].action || toolCalls[currentTool].name;
            toolStatus.textContent = `Tool Call #${this._toolCallCounter}: ${toolName}`;
            toolLine.style.display = 'block';
        } else {
            // Just starting a round - show count preview
            toolStatus.textContent = `Round ${round}: ${toolCalls.length} tool${toolCalls.length > 1 ? 's' : ''} queued`;
            toolLine.style.display = 'block';
        }
    }

    /**
     * Reset the tool call counter (call at start of new message)
     */
    resetToolCounter() {
        this._toolCallCounter = 0;
    }

    async openSettings() {
        await openSettingsModal(this);
    }

    // =========================================================================
    // PHASE 4: Analysis Tool Helper Methods
    // =========================================================================

    /**
     * Advanced node search with query-based filtering
     */
    findNodesAdvanced(query) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const matches = [];
            // Filter out undefined/null groups (can happen after graph reload)
            const graphGroups = (app.graph._groups || []).filter(g => g && g.pos && g.size);

            // Helper to check if node is in a specific group
            const getNodeGroup = (node) => {
                const nw = node.size?.[0] || 200;
                const nh = node.size?.[1] || 100;
                for (const g of graphGroups) {
                    if (node.pos[0] >= g.pos[0] &&
                        node.pos[1] >= g.pos[1] &&
                        node.pos[0] + nw <= g.pos[0] + g.size[0] &&
                        node.pos[1] + nh <= g.pos[1] + g.size[1]) {
                        return g.title;
                    }
                }
                return null;
            };

            for (const node of app.graph._nodes) {
                let match = true;

                // Type filter
                if (query.type && node.type !== query.type) {
                    match = false;
                }

                // Disconnected inputs filter
                if (query.has_disconnected_inputs !== undefined && match) {
                    const hasDisconnected = (node.inputs || []).some(i => i.link === null);
                    if (query.has_disconnected_inputs !== hasDisconnected) {
                        match = false;
                    }
                }

                // Group filter
                if (query.in_group !== undefined && match) {
                    const nodeGroup = getNodeGroup(node);
                    if (nodeGroup !== query.in_group) {
                        match = false;
                    }
                }

                // Ungrouped filter
                if (query.ungrouped !== undefined && match) {
                    const nodeGroup = getNodeGroup(node);
                    const isUngrouped = nodeGroup === null;
                    if (query.ungrouped !== isUngrouped) {
                        match = false;
                    }
                }

                // Bypassed filter
                if (query.bypassed !== undefined && match) {
                    const isBypassed = node.mode === 4;
                    if (query.bypassed !== isBypassed) {
                        match = false;
                    }
                }

                // Widget value filter
                if (query.widget && match) {
                    const widget = node.widgets?.find(w => w.name === query.widget.name);
                    if (!widget || widget.value !== query.widget.value) {
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
            console.error('[Claude Chat] findNodesAdvanced failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Compare node widget values to their defaults
     */
    compareToDefaults(nodeIds) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const nodes = nodeIds.length > 0
                ? nodeIds.map(id => app.graph.getNodeById(id)).filter(Boolean)
                : app.graph._nodes;

            const comparisons = [];

            for (const node of nodes) {
                // Create a fresh node of same type to get defaults
                const defaultNode = LiteGraph.createNode(node.type);
                if (!defaultNode) continue;

                const modifiedWidgets = {};
                let allDefault = true;

                if (node.widgets && defaultNode.widgets) {
                    for (const widget of node.widgets) {
                        const defaultWidget = defaultNode.widgets.find(w => w.name === widget.name);
                        if (defaultWidget && widget.value !== defaultWidget.value) {
                            modifiedWidgets[widget.name] = {
                                default: defaultWidget.value,
                                current: widget.value
                            };
                            allDefault = false;
                        }
                    }
                }

                comparisons.push({
                    node: node.id,
                    type: node.type,
                    modified_widgets: modifiedWidgets,
                    all_default: allDefault
                });
            }

            return {
                success: true,
                comparisons,
                nodes_with_changes: comparisons.filter(c => !c.all_default).length
            };
        } catch (e) {
            console.error('[Claude Chat] compareToDefaults failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Detect layout issues (overlaps, density, alignment)
     */
    detectLayoutIssues(minSpacing = 20) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const issues = [];
            const nodes = app.graph._nodes;

            // Check for overlapping nodes
            for (let i = 0; i < nodes.length; i++) {
                const n1 = nodes[i];
                const r1 = {
                    x: n1.pos[0],
                    y: n1.pos[1],
                    w: n1.size?.[0] || 200,
                    h: n1.size?.[1] || 100
                };

                for (let j = i + 1; j < nodes.length; j++) {
                    const n2 = nodes[j];
                    const r2 = {
                        x: n2.pos[0],
                        y: n2.pos[1],
                        w: n2.size?.[0] || 200,
                        h: n2.size?.[1] || 100
                    };

                    // Check overlap
                    const overlapX = r1.x < r2.x + r2.w && r1.x + r1.w > r2.x;
                    const overlapY = r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;

                    if (overlapX && overlapY) {
                        issues.push({
                            type: 'overlap',
                            nodes: [n1.id, n2.id],
                            message: `Nodes ${n1.id} and ${n2.id} overlap`
                        });
                    } else {
                        // Check for cramped spacing
                        const gapX = Math.max(0, Math.max(r2.x - (r1.x + r1.w), r1.x - (r2.x + r2.w)));
                        const gapY = Math.max(0, Math.max(r2.y - (r1.y + r1.h), r1.y - (r2.y + r2.h)));
                        const gap = Math.min(gapX, gapY);

                        if (gap < minSpacing && gap >= 0) {
                            issues.push({
                                type: 'cramped',
                                nodes: [n1.id, n2.id],
                                gap,
                                message: `Nodes ${n1.id} and ${n2.id} too close (gap: ${gap}px)`
                            });
                        }
                    }
                }
            }

            // Check for nodes outside visible area
            const canvas = app.canvas;
            if (canvas) {
                for (const node of nodes) {
                    if (node.pos[0] < -1000 || node.pos[1] < -1000 ||
                        node.pos[0] > 10000 || node.pos[1] > 10000) {
                        issues.push({
                            type: 'out_of_bounds',
                            node: node.id,
                            pos: { x: node.pos[0], y: node.pos[1] },
                            message: `Node ${node.id} is far from canvas center`
                        });
                    }
                }
            }

            return {
                success: true,
                issues,
                issue_count: issues.length,
                has_issues: issues.length > 0,
                suggestion: issues.length > 0
                    ? "Use 'organize' to automatically fix layout issues"
                    : null
            };
        } catch (e) {
            console.error('[Claude Chat] detectLayoutIssues failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Validate workflow for execution readiness
     */
    validateWorkflow() {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const errors = [];
            const warnings = [];
            const nodes = app.graph._nodes;

            for (const node of nodes) {
                // Skip bypassed nodes
                if (node.mode === 4) continue;

                // Check required inputs
                if (node.inputs) {
                    for (let i = 0; i < node.inputs.length; i++) {
                        const input = node.inputs[i];
                        // In ComfyUI, required inputs are the first ones
                        // and have specific types (not * which is optional)
                        if (input.link === null && input.type !== '*') {
                            errors.push({
                                node: node.id,
                                input: input.name,
                                error: `Required input "${input.name}" not connected`
                            });
                        }
                    }
                }

                // Check widget values that reference files
                if (node.widgets) {
                    for (const widget of node.widgets) {
                        if (widget.name.includes('name') || widget.name.includes('model')) {
                            if (typeof widget.value === 'string' && widget.value.includes('..')) {
                                warnings.push({
                                    node: node.id,
                                    widget: widget.name,
                                    warning: `Path may be invalid: ${widget.value}`
                                });
                            }
                        }
                    }
                }
            }

            // Simple execution order (topological sort not implemented, just return node order)
            const executionOrder = nodes.map(n => n.id);

            return {
                success: true,
                can_execute: errors.length === 0,
                blocking_errors: errors,
                warnings,
                execution_order: executionOrder
            };
        } catch (e) {
            console.error('[Claude Chat] validateWorkflow failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Comprehensive workflow analysis
     */
    analyzeWorkflow(includeSuggestions = true) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            // Gather validation
            const validation = this.validateWorkflow();
            const layoutIssues = this.detectLayoutIssues();

            // Complexity metrics
            const nodes = app.graph._nodes;
            const links = Object.keys(app.graph.links || {}).length;
            const groups = (app.graph._groups || []).length;

            // Node type distribution
            const typeCount = {};
            for (const node of nodes) {
                const shortType = node.type.split('/').pop();
                typeCount[shortType] = (typeCount[shortType] || 0) + 1;
            }

            // Suggestions
            const suggestions = [];
            if (includeSuggestions) {
                if (layoutIssues.has_issues) {
                    suggestions.push({
                        type: 'layout',
                        message: "Use 'organize' to fix layout issues",
                        priority: 'medium'
                    });
                }
                if (groups === 0 && nodes.length > 5) {
                    suggestions.push({
                        type: 'organization',
                        message: "Consider grouping nodes for better organization",
                        priority: 'low'
                    });
                }
                if (validation.blocking_errors.length > 0) {
                    suggestions.push({
                        type: 'connections',
                        message: `Connect ${validation.blocking_errors.length} missing inputs before execution`,
                        priority: 'high'
                    });
                }
            }

            return {
                success: true,
                analysis: {
                    metrics: {
                        nodes: nodes.length,
                        links,
                        groups,
                        bypassed: nodes.filter(n => n.mode === 4).length
                    },
                    type_distribution: typeCount,
                    validation: {
                        can_execute: validation.can_execute,
                        error_count: validation.blocking_errors.length,
                        warning_count: validation.warnings.length
                    },
                    layout: {
                        issue_count: layoutIssues.issue_count,
                        has_overlaps: layoutIssues.issues.some(i => i.type === 'overlap')
                    },
                    suggestions
                }
            };
        } catch (e) {
            console.error('[Claude Chat] analyzeWorkflow failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Apply JSON Patch operations to workflow
     */
    patchWorkflowJson(patches) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            this.workflowAPI.saveUndoState('JSON Patch');

            // Get current workflow
            const workflow = app.graph.serialize();

            // Apply patches (simple implementation - replace, add, remove)
            for (const patch of patches) {
                const pathParts = patch.path.split('/').filter(p => p);

                // Navigate to parent
                let target = workflow;
                for (let i = 0; i < pathParts.length - 1; i++) {
                    const key = pathParts[i];
                    if (target[key] === undefined) {
                        return { success: false, error: `Invalid path: ${patch.path}` };
                    }
                    target = target[key];
                }

                const lastKey = pathParts[pathParts.length - 1];

                switch (patch.op) {
                    case 'replace':
                    case 'add':
                        target[lastKey] = patch.value;
                        break;
                    case 'remove':
                        if (Array.isArray(target)) {
                            target.splice(parseInt(lastKey), 1);
                        } else {
                            delete target[lastKey];
                        }
                        break;
                    default:
                        return { success: false, error: `Unsupported operation: ${patch.op}` };
                }
            }

            // Load modified workflow
            app.loadGraphData(workflow);
            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                patches_applied: patches.length
            };
        } catch (e) {
            console.error('[Claude Chat] patchWorkflowJson failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Replace entire workflow with new JSON
     */
    setWorkflowJson(workflow) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            this.workflowAPI.saveUndoState('Set workflow JSON');

            app.loadGraphData(workflow);
            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                nodes_loaded: (workflow.nodes || []).length,
                groups_loaded: (workflow.groups || []).length
            };
        } catch (e) {
            console.error('[Claude Chat] setWorkflowJson failed:', e);
            return { success: false, error: e.message };
        }
    }
}

// Add styles
const style = document.createElement('style');
style.textContent = `
    @keyframes claudeLoadingPulse {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 1; }
    }
    .claude-loading-dot {
        animation: claudeLoadingPulse 1s infinite;
        color: #D97706;
    }
    #claude-chat-panel ::-webkit-scrollbar {
        width: 8px;
    }
    #claude-chat-panel ::-webkit-scrollbar-track {
        background: #1a1a2e;
    }
    #claude-chat-panel ::-webkit-scrollbar-thumb {
        background: #3a3a5a;
        border-radius: 4px;
    }
`;
document.head.appendChild(style);

// Initialize
const claudeChat = new ClaudeChatPanel();

app.registerExtension({
    name: "comfyui.claude-chat",
    async setup() {
        console.log('[Claude Chat] Extension setup starting...');
        await claudeChat.init();
    }
});
