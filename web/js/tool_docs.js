/**
 * Tool Documentation Module
 *
 * Provides on-demand documentation for the help tool.
 * This allows the system prompt to be minimal while detailed docs are available at runtime.
 */

// =============================================================================
// TOOL CATEGORIES
// =============================================================================

export const TOOL_CATEGORIES = {
    discovery: ['list_nodes', 'find_nodes', 'list_available_nodes', 'search_available_nodes', 'get_node', 'get_workflow', 'list_available_models', 'search_available_models', 'get_context'],
    nodes: ['create_node', 'delete_node', 'update_node', 'duplicate_node', 'bypass_node'],
    widgets: ['update_widget', 'get_widget_options'],
    links: ['create_node_link', 'delete_node_link'],
    groups: ['create_group', 'delete_group', 'update_group', 'move_nodes_to_group', 'merge_groups', 'split_group', 'detect_group_issues'],
    highlevel: ['organize', 'clear_workflow'],
    analysis: ['get_modified_widgets', 'validate_workflow', 'detect_layout_issues', 'analyze_workflow'],
    execution: ['queue_execution', 'cancel_execution', 'execution_status'],
    utility: ['batch', 'undo', 'help'],
    lowlevel: ['get_workflow_json', 'patch_workflow_json', 'set_workflow_json']
};

// =============================================================================
// COMMON SLOT PATTERNS
// =============================================================================

export const COMMON_SLOTS = {
    CheckpointLoaderSimple: {
        outputs: ['MODEL (0)', 'CLIP (1)', 'VAE (2)'],
        inputs: []
    },
    KSampler: {
        outputs: ['LATENT (0)'],
        inputs: ['model (0)', 'positive (1)', 'negative (2)', 'latent_image (3)']
    },
    CLIPTextEncode: {
        outputs: ['CONDITIONING (0)'],
        inputs: ['clip (0)']
    },
    VAEDecode: {
        outputs: ['IMAGE (0)'],
        inputs: ['samples (0)', 'vae (1)']
    },
    VAEEncode: {
        outputs: ['LATENT (0)'],
        inputs: ['pixels (0)', 'vae (1)']
    },
    EmptyLatentImage: {
        outputs: ['LATENT (0)'],
        inputs: []
    },
    SaveImage: {
        outputs: [],
        inputs: ['images (0)']
    },
    LoraLoader: {
        outputs: ['MODEL (0)', 'CLIP (1)'],
        inputs: ['model (0)', 'clip (1)']
    },
    ControlNetLoader: {
        outputs: ['CONTROL_NET (0)'],
        inputs: []
    },
    ControlNetApply: {
        outputs: ['CONDITIONING (0)'],
        inputs: ['conditioning (0)', 'control_net (1)', 'image (2)']
    }
};

// =============================================================================
// PATTERNS DOCUMENTATION
// =============================================================================

export const PATTERNS = {
    refs: {
        title: "$ref System",
        description: "Assign temporary names to nodes for use within the same batch",
        syntax: '{"type": "KSampler", "ref": "$sampler"}',
        rules: [
            "$refs start with $ and are strings",
            "Refs are valid within a batch and the current tool round",
            "Refs resolve to node IDs in subsequent commands",
            "Invalid refs cause errors - always assign before use"
        ],
        example: `{"tool": "batch", "commands": [
  {"tool": "create_node", "nodes": [{"type": "KSampler", "ref": "$sampler"}]},
  {"tool": "create_node_link", "links": [{"from": 1, "from_slot": 0, "to": "$sampler", "to_slot": 0}]}
]}`
    },
    arrays: {
        title: "Multi-Item Arrays",
        description: "Most tools accept arrays to process multiple items in one call",
        supported_tools: ['create_node', 'delete_node', 'update_node', 'duplicate_node', 'bypass_node',
                         'create_node_link', 'delete_node_link', 'update_widget', 'create_group', 'delete_group',
                         'update_group', 'move_nodes_to_group', 'patch_workflow_json'],
        example: `{"tool": "create_node", "nodes": [
  {"type": "CLIPTextEncode", "ref": "$pos"},
  {"type": "CLIPTextEncode", "ref": "$neg"},
  {"type": "KSampler", "ref": "$sampler"}
]}`
    },
    inline_groups: {
        title: "Inline Group Assignment",
        description: "Assign nodes to groups during creation instead of separate calls",
        syntax: '"group": "GroupName" or "group": {"title": "Name", "color": "#hex"}',
        example: `{"tool": "create_node", "nodes": [
  {"type": "CheckpointLoaderSimple", "group": "Model"},
  {"type": "KSampler", "group": {"title": "Sampling", "color": "#4A3858"}}
]}`
    },
    efficiency: {
        title: "Efficiency Tips",
        tips: [
            "Use batch to combine multiple operations (5x faster)",
            "Use arrays: 5 nodes in 1 call > 5 separate calls",
            "Use $refs instead of waiting for node IDs",
            "Use inline groups instead of separate create_group calls",
            "Trust auto-context - skip discovery when info is already visible"
        ]
    }
};

// =============================================================================
// TOOL DOCUMENTATION
// =============================================================================

export const TOOL_DOCS = {
    // =========================================================================
    // DISCOVERY TOOLS
    // =========================================================================
    list_nodes: {
        summary: "List all nodes in the current workflow (NOT available types)",
        category: "discovery",
        syntax: '{"tool": "list_nodes"}',
        params: {
            verbose: "boolean - include widgets and connections (default: false)"
        },
        returns: "{nodes: [...], count: N, note: '...'}",
        example: '{"tool": "list_nodes", "verbose": true}',
        note: "For available node types to add, use list_available_nodes or search_available_nodes"
    },

    find_nodes: {
        summary: "Find nodes matching specific criteria",
        category: "discovery",
        syntax: '{"tool": "find_nodes", "where": {...}}',
        params: {
            where: {
                type: "string - exact node type match",
                title: "string - title contains (case-insensitive)",
                bypassed: "boolean - is node bypassed",
                has_disconnected_inputs: "boolean - has unconnected inputs",
                in_group: "string - is inside group name",
                widget: "{name, value} - has widget with specific value"
            }
        },
        returns: "{matches: [id, id, ...], count: N}",
        examples: [
            '{"tool": "find_nodes", "where": {"type": "KSampler"}}',
            '{"tool": "find_nodes", "where": {"has_disconnected_inputs": true}}',
            '{"tool": "find_nodes", "where": {"widget": {"name": "steps", "value": 20}}}'
        ]
    },

    list_available_nodes: {
        summary: "List node types available to add to workflow",
        category: "discovery",
        syntax: '{"tool": "list_available_nodes"}',
        params: {
            category: "string - filter by category (e.g., 'loaders', 'sampling')"
        },
        returns: "{types: [...], count: N}",
        example: '{"tool": "list_available_nodes", "category": "loaders"}'
    },

    search_available_nodes: {
        summary: "Search available node types by text query",
        category: "discovery",
        syntax: '{"tool": "search_available_nodes", "query": "..."}',
        params: {
            query: "string - search term (required)",
            category: "string - additional category filter"
        },
        returns: "{types: [...], count: N}",
        example: '{"tool": "search_available_nodes", "query": "face"}'
    },

    get_node: {
        summary: "Get node details (workflow) or schema (registry)",
        category: "discovery",
        syntax: '{"tool": "get_node", "id": N} or {"tool": "get_node", "type": "..."}',
        params: {
            id: "number - workflow node ID (returns instance details)",
            type: "string - node type (returns schema/inputs/outputs)",
            schema: "boolean - include schema with id lookup"
        },
        returns: "Node details or schema depending on params",
        examples: [
            '{"tool": "get_node", "id": 5}',
            '{"tool": "get_node", "type": "KSampler"}',
            '{"tool": "get_node", "id": 5, "schema": true}'
        ]
    },

    get_workflow: {
        summary: "Get workflow structure overview",
        category: "discovery",
        syntax: '{"tool": "get_workflow"}',
        params: {
            mode: '"summary" (default), "details", or "full"'
        },
        returns: "Workflow summary, detailed view, or complete JSON",
        note: "Auto-context usually provides this - use only when you need more detail"
    },

    list_available_models: {
        summary: "List available models by type",
        category: "discovery",
        syntax: '{"tool": "list_available_models", "type": "..."}',
        params: {
            type: '"checkpoints", "loras", "vae", "embeddings", "controlnet", "upscale_models" (required)'
        },
        returns: "{models: [...], total: N}",
        example: '{"tool": "list_available_models", "type": "checkpoints"}'
    },

    search_available_models: {
        summary: "Search available models by query",
        category: "discovery",
        syntax: '{"tool": "search_available_models", "type": "...", "query": "..."}',
        params: {
            type: '"checkpoints", "loras", "vae", "embeddings", "controlnet", "upscale_models" (required)',
            query: "search term (required)"
        },
        returns: "{models: [...], total: N}",
        example: '{"tool": "search_available_models", "type": "loras", "query": "detail"}'
    },

    get_context: {
        summary: "Request workflow context at specific detail level",
        category: "discovery",
        syntax: '{"tool": "get_context"}',
        params: {
            level: "1 (compact), 2 (standard), 3 (full with geometry)",
            include_static: "boolean - include installed packs info"
        },
        returns: "{context: '...', level: N, token_estimate: N}",
        note: "Usually auto-injected - use only to upgrade detail level"
    },

    // =========================================================================
    // NODE TOOLS
    // =========================================================================
    create_node: {
        summary: "Create one or more nodes with optional group assignment",
        category: "nodes",
        syntax: '{"tool": "create_node", "nodes": [...]}',
        params: {
            nodes: "array of node specs, each with:",
            "  type": "string - node type (required)",
            "  ref": "string - $reference for later use",
            "  pos": "[x, y] - position (default: auto)",
            "  widgets": "object - initial widget values",
            "  title": "string - custom title",
            "  group": 'string or {title, color} - group assignment'
        },
        returns: "{created: [ids], refs: {$ref: id}}",
        example: `{"tool": "create_node", "nodes": [
  {"type": "CheckpointLoaderSimple", "ref": "$ckpt", "group": "Model"},
  {"type": "KSampler", "ref": "$sampler", "widgets": {"steps": 25}}
]}`
    },

    delete_node: {
        summary: "Delete one or more nodes",
        category: "nodes",
        syntax: '{"tool": "delete_node", "nodes": [ids]}',
        params: {
            nodes: "array of node IDs or $refs",
            reconnect: "boolean - try to reconnect broken links"
        },
        returns: "{deleted: [ids]}",
        example: '{"tool": "delete_node", "nodes": [5, 6, "$tempNode"]}'
    },

    update_node: {
        summary: "Move or rename nodes",
        category: "nodes",
        syntax: '{"tool": "update_node", "updates": [...]}',
        params: {
            updates: "array of {node, pos?, title?}"
        },
        returns: "{updated: N}",
        example: '{"tool": "update_node", "updates": [{"node": 5, "pos": [200, 200], "title": "Main Sampler"}]}'
    },

    duplicate_node: {
        summary: "Duplicate nodes with optional $ref",
        category: "nodes",
        syntax: '{"tool": "duplicate_node", "nodes": [...]}',
        params: {
            nodes: 'array of {node, ref?, offset?}',
            "  node": "ID or $ref of node to duplicate",
            "  ref": "$reference for the copy",
            "  offset": "[dx, dy] - position offset (default: [50, 50])"
        },
        returns: "{original_id, new_id, ref?}",
        example: '{"tool": "duplicate_node", "nodes": [{"node": 5, "ref": "$copy", "offset": [100, 0]}]}'
    },

    bypass_node: {
        summary: "Bypass or activate nodes",
        category: "nodes",
        syntax: '{"tool": "bypass_node", "nodes": [ids], "bypass": true/false}',
        params: {
            nodes: "array of node IDs or $refs",
            bypass: "boolean - true to bypass, false to activate (default: true)"
        },
        returns: "{bypassed: [ids]} or {activated: [ids]}",
        example: '{"tool": "bypass_node", "nodes": [5, 6], "bypass": true}'
    },

    // =========================================================================
    // WIDGET TOOLS
    // =========================================================================
    update_widget: {
        summary: "Set widget values on nodes",
        category: "widgets",
        syntax: '{"tool": "update_widget", "updates": [...]}',
        params: {
            updates: "array of {node, widget, value}"
        },
        returns: "{updated: N}",
        example: `{"tool": "update_widget", "updates": [
  {"node": 5, "widget": "steps", "value": 30},
  {"node": 5, "widget": "cfg", "value": 7.5}
]}`
    },

    get_widget_options: {
        summary: "Get available options for dropdown widgets",
        category: "widgets",
        syntax: '{"tool": "get_widget_options", "node": N, "widget": "..."}',
        params: {
            node: "node ID or $ref",
            widget: "widget name"
        },
        returns: "{options: [...], current: value}",
        example: '{"tool": "get_widget_options", "node": 5, "widget": "sampler_name"}'
    },

    // =========================================================================
    // LINK TOOLS - Node connections
    // =========================================================================
    create_node_link: {
        summary: "Connect node outputs to inputs",
        category: "links",
        syntax: '{"tool": "create_node_link", "links": [...]}',
        params: {
            links: "array of {from, from_slot, to, to_slot}",
            "  from": "source node ID or $ref",
            "  from_slot": "output slot index (0-based)",
            "  to": "target node ID or $ref",
            "  to_slot": "input slot index (0-based)"
        },
        returns: "{links: N}",
        example: `{"tool": "create_node_link", "links": [
  {"from": "$ckpt", "from_slot": 0, "to": "$sampler", "to_slot": 0},
  {"from": "$ckpt", "from_slot": 1, "to": "$pos", "to_slot": 0}
]}`,
        related: "See 'help topic=slots' for common slot patterns"
    },

    delete_node_link: {
        summary: "Remove connections from node inputs",
        category: "links",
        syntax: '{"tool": "delete_node_link", "links": [...]}',
        params: {
            links: "array of {node, input_slot}",
            "  node": "target node ID or $ref",
            "  input_slot": "input slot index to disconnect"
        },
        returns: "{deleted: N}",
        example: '{"tool": "delete_node_link", "links": [{"node": 5, "input_slot": 0}]}'
    },

    // =========================================================================
    // GROUP TOOLS
    // =========================================================================
    create_group: {
        summary: "Create visual groups around nodes",
        category: "groups",
        syntax: '{"tool": "create_group", "groups": [...]}',
        params: {
            groups: 'array of {title, nodes?, color?, pos?, size?}',
            "  title": "group name",
            "  nodes": "[ids] - auto-size to fit these nodes",
            "  color": "hex color (e.g., '#4A3858')",
            "  pos": "[x, y] - manual position",
            "  size": "[w, h] - manual size"
        },
        returns: "{created: N}",
        example: '{"tool": "create_group", "groups": [{"title": "Prompts", "nodes": [3, 4], "color": "#4A3858"}]}',
        note: "Prefer inline group assignment in create_node for efficiency"
    },

    delete_group: {
        summary: "Delete groups (keeps nodes)",
        category: "groups",
        syntax: '{"tool": "delete_group", "groups": [...]}',
        params: {
            groups: 'array of indices or titles, or "all"'
        },
        returns: "{deleted: N}",
        example: '{"tool": "delete_group", "groups": ["Prompts", 2]}'
    },

    update_group: {
        summary: "Modify group properties, add/remove nodes",
        category: "groups",
        syntax: '{"tool": "update_group", "group": N, ...}',
        params: {
            group: "group index or title (required)",
            title: "string - new title",
            color: "hex color (e.g., '#4A3858')",
            pos: "[x, y] - new position",
            size: "[w, h] - new size",
            add_nodes: "[ids] - nodes to add (moves into group, refits)",
            remove_nodes: "[ids] - nodes to remove (moves outside group)"
        },
        returns: "{title, bounds: {x, y, width, height}}",
        examples: [
            '{"tool": "update_group", "group": 1, "title": "New Name"}',
            '{"tool": "update_group", "group": "Prompts", "add_nodes": [5, 6]}',
            '{"tool": "update_group", "group": 0, "remove_nodes": [3], "color": "#583828"}'
        ]
    },

    move_nodes_to_group: {
        summary: "Move nodes between groups",
        category: "groups",
        syntax: '{"tool": "move_nodes_to_group", "nodes": [ids], "group": N}',
        params: {
            nodes: "array of node IDs",
            group: "group index or title (null to ungroup)"
        },
        returns: "{moved: N}",
        example: '{"tool": "move_nodes_to_group", "nodes": [5, 6], "group": "Sampling"}'
    },

    merge_groups: {
        summary: "Combine multiple groups into one",
        category: "groups",
        syntax: '{"tool": "merge_groups", "groups": [indices], "new_title": "..."}',
        params: {
            groups: "array of group indices to merge",
            new_title: "title for merged group",
            color: "optional color"
        },
        returns: "{merged: N, new_group: index}",
        example: '{"tool": "merge_groups", "groups": [1, 2], "new_title": "Combined"}'
    },

    split_group: {
        summary: "Split a group into multiple groups",
        category: "groups",
        syntax: '{"tool": "split_group", "group": "Name", "into": [...]}',
        params: {
            group: "group index or title to split",
            into: 'array of {title, nodes, color?} - new group specs'
        },
        returns: "{original_group, new_groups: [{title, nodes, index}]}",
        example: `{"tool": "split_group", "group": "Loaders", "into": [
  {"title": "Checkpoints", "nodes": [1]},
  {"title": "LoRAs", "nodes": [2, 3]}
]}`,
        note: "All nodes in 'into' must be in the original group"
    },

    detect_group_issues: {
        summary: "Find overlapping or problematic groups",
        category: "groups",
        syntax: '{"tool": "detect_group_issues"}',
        params: {
            min_gap: "number - minimum spacing between groups"
        },
        returns: "{issues: [...], count: N}",
        example: '{"tool": "detect_group_issues", "min_gap": 20}'
    },

    // =========================================================================
    // HIGH-LEVEL TOOLS
    // =========================================================================
    organize: {
        summary: "Auto-organize workflow layout",
        category: "highlevel",
        syntax: '{"tool": "organize"}',
        params: {
            llm: "boolean - use LLM-provided plan",
            plan: '{flow, groups} - required with llm=true',
            cableless: "boolean - use Set/Get nodes instead of cables",
            groupPadding: "number - padding inside groups",
            groupSpacing: "number - space between groups",
            nodeSpacing: "number - space between nodes"
        },
        returns: "{groups_created: N, summary: {...}}",
        examples: [
            '{"tool": "organize"}',
            '{"tool": "organize", "cableless": true}',
            `{"tool": "organize", "llm": true, "plan": {
  "flow": "left_to_right",
  "groups": [
    {"title": "Model", "nodes": [1], "order": 1},
    {"title": "Sampling", "nodes": [2, 3], "order": 2}
  ]
}}`
        ]
    },

    clear_workflow: {
        summary: "Delete all nodes and groups",
        category: "highlevel",
        syntax: '{"tool": "clear_workflow"}',
        params: {},
        returns: "{deleted_nodes: N, deleted_groups: N}",
        warning: "Cannot be undone easily - creates undo state first"
    },

    // =========================================================================
    // ANALYSIS TOOLS
    // =========================================================================
    get_modified_widgets: {
        summary: "Get widgets that differ from their default values",
        category: "analysis",
        syntax: '{"tool": "get_modified_widgets", "nodes": [ids]}',
        params: {
            nodes: "array of node IDs (empty = all nodes)"
        },
        returns: "{nodes: [{id, type, modified_widgets: {...}}]}"
    },

    validate_workflow: {
        summary: "Check workflow for errors",
        category: "analysis",
        syntax: '{"tool": "validate_workflow"}',
        params: {},
        returns: "{can_execute: bool, blocking_errors: [...], warnings: [...]}"
    },

    detect_layout_issues: {
        summary: "Find overlapping or cramped nodes",
        category: "analysis",
        syntax: '{"tool": "detect_layout_issues"}',
        params: {
            min_spacing: "number - minimum node spacing (default: 20)"
        },
        returns: "{issues: [...], count: N}"
    },

    analyze_workflow: {
        summary: "Comprehensive workflow analysis",
        category: "analysis",
        syntax: '{"tool": "analyze_workflow"}',
        params: {
            include_suggestions: "boolean - include optimization suggestions"
        },
        returns: "{validation, layout, optimization, complexity}"
    },

    // =========================================================================
    // EXECUTION TOOLS - Workflow execution lifecycle
    // =========================================================================
    queue_execution: {
        summary: "Submit workflow to execution queue",
        category: "execution",
        syntax: '{"tool": "queue_execution"}',
        params: {
            batch_size: "number - how many to generate (default: 1)"
        },
        returns: "{queued: true, position: N}",
        example: '{"tool": "queue_execution", "batch_size": 4}'
    },

    cancel_execution: {
        summary: "Cancel/interrupt current execution",
        category: "execution",
        syntax: '{"tool": "cancel_execution"}',
        params: {},
        returns: "{cancelled: true}"
    },

    execution_status: {
        summary: "Get execution queue status",
        category: "execution",
        syntax: '{"tool": "execution_status"}',
        params: {
            include_history: "boolean - include recent execution history",
            history_limit: "number - max history items"
        },
        returns: "{running: bool, queue_size: N, queue_position: N, history?}"
    },

    // =========================================================================
    // UTILITY TOOLS
    // =========================================================================
    batch: {
        summary: "Execute multiple tools atomically (5x faster)",
        category: "utility",
        syntax: '{"tool": "batch", "commands": [...]}',
        params: {
            commands: "array of tool calls to execute in order",
            dry_run: "boolean - validate without executing"
        },
        returns: "{results: [...], all_success: bool}",
        behavior: [
            "$refs from earlier commands resolve in later commands",
            "All-or-nothing: partial failure reverts changes",
            "5-10x faster than separate calls"
        ],
        example: `{"tool": "batch", "commands": [
  {"tool": "create_node", "nodes": [{"type": "LoraLoader", "ref": "$lora"}]},
  {"tool": "create_node_link", "links": [{"from": 1, "from_slot": 0, "to": "$lora", "to_slot": 0}]},
  {"tool": "update_widget", "updates": [{"node": "$lora", "widget": "strength_model", "value": 0.8}]}
]}`,
        important: "Use batch for any multi-step operation!"
    },

    undo: {
        summary: "Undo recent changes",
        category: "utility",
        syntax: '{"tool": "undo"}',
        params: {
            count: "number - how many operations to undo (default: 1)"
        },
        returns: "{undone: description, remaining: N}"
    },

    help: {
        summary: "Get tool documentation",
        category: "utility",
        syntax: '{"tool": "help", "topic": "..."}',
        params: {
            topic: "tool name, category, 'patterns', 'slots', or empty for index"
        },
        returns: "Documentation for the requested topic",
        examples: [
            '{"tool": "help"}',
            '{"tool": "help", "topic": "batch"}',
            '{"tool": "help", "topic": "discovery"}',
            '{"tool": "help", "topic": "patterns"}',
            '{"tool": "help", "topic": "slots"}'
        ]
    },

    // =========================================================================
    // LOW-LEVEL TOOLS
    // =========================================================================
    get_workflow_json: {
        summary: "Get raw workflow JSON",
        category: "lowlevel",
        syntax: '{"tool": "get_workflow_json"}',
        params: {},
        returns: "{workflow: {...}, size_kb: N}",
        note: "Use higher-level tools when possible"
    },

    patch_workflow_json: {
        summary: "Apply JSON patches to workflow",
        category: "lowlevel",
        syntax: '{"tool": "patch_workflow_json", "patches": [...]}',
        params: {
            patches: 'array of {op, path, value} (RFC 6902 format)'
        },
        returns: "{patched: N}",
        example: `{"tool": "patch_workflow_json", "patches": [
  {"op": "replace", "path": "/nodes/0/pos", "value": [100, 200]},
  {"op": "add", "path": "/groups/-", "value": {"title": "New", "pos": [0,0], "size": [300,200]}}
]}`,
        warning: "Use higher-level tools unless you need raw JSON access"
    },

    set_workflow_json: {
        summary: "Replace entire workflow from JSON",
        category: "lowlevel",
        syntax: '{"tool": "set_workflow_json", "workflow": {...}}',
        params: {
            workflow: "complete workflow JSON object"
        },
        returns: "{loaded: bool, nodes: N, links: N}",
        warning: "Replaces entire workflow - use with caution"
    }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get all tools in a category
 */
export function getToolsInCategory(category) {
    return TOOL_CATEGORIES[category] || [];
}

/**
 * Get all category names
 */
export function getCategoryNames() {
    return Object.keys(TOOL_CATEGORIES);
}

/**
 * Search tools by name or summary
 */
export function searchTools(query) {
    const q = query.toLowerCase();
    return Object.entries(TOOL_DOCS)
        .filter(([name, doc]) =>
            name.toLowerCase().includes(q) ||
            doc.summary.toLowerCase().includes(q)
        )
        .map(([name, doc]) => ({ name, summary: doc.summary, category: doc.category }));
}
