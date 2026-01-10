/**
 * Tool Hints - Contextual usage hints for tool error messages
 *
 * Phase 5.1 Enhancement: When tools fail due to incorrect usage,
 * error responses include helpful hints showing correct syntax.
 *
 * This eliminates the need for a separate "help" command while
 * providing guidance exactly when Future Claude needs it.
 */

/**
 * Complete hint registry for all 36 tools
 * Each entry contains:
 *   - usage: Primary single-item syntax
 *   - multi: Array/batch syntax (Phase 2) if applicable
 *   - required: List of required parameters
 *   - tip: Related tool suggestions or important warnings
 */
export const TOOL_HINTS = {
    // =========================================================================
    // NODE TOOLS (5)
    // =========================================================================
    'create_node': {
        usage: 'create_node({type: "KSampler", pos: [x, y], widgets: {...}, ref: "$name", title: "Custom Title", group: "GroupName"})',
        multi: 'create_node({nodes: [{type: "A", ref: "$a"}, {type: "B", ref: "$b", group: "MyGroup"}]})',
        required: ['type (or nodes array)'],
        tip: 'Use search_node_types({query: "..."}) to find valid node types'
    },
    'delete_node': {
        usage: 'delete_node({node: 1, reconnect: true})',
        multi: 'delete_node({nodes: [1, 2, "$ref"], reconnect: true})',
        required: ['node (or nodes array)'],
        tip: 'Set reconnect: true to preserve data flow through deleted node'
    },
    'update_node': {
        usage: 'update_node({node: 1, pos: [x, y], title: "New Title", bypass: false})',
        multi: 'update_node({updates: [{node: 1, pos: [100, 100]}, {node: "$ref", title: "..."}]})',
        required: ['node'],
        tip: 'Use bypass_node for toggling bypass state on multiple nodes'
    },
    'duplicate_node': {
        usage: 'duplicate_node({node: 1, offset: [50, 50], ref: "$copy"})',
        multi: 'duplicate_node({nodes: [{node: 1, ref: "$copy1"}, {node: 2, ref: "$copy2"}]})',
        required: ['node'],
        tip: 'Duplicated nodes copy widget values but NOT connections'
    },
    'bypass_node': {
        usage: 'bypass_node({node: 1, bypass: true})',
        multi: 'bypass_node({nodes: [1, 2, "$ref"], bypass: true})',
        required: ['node (or nodes array)'],
        tip: 'Bypassed nodes pass data through without processing'
    },

    // =========================================================================
    // LINK TOOLS (2) - Node connections
    // =========================================================================
    'create_node_link': {
        usage: 'create_node_link({from_node: 1, from_slot: 0, to_node: 2, to_slot: 0})',
        multi: 'create_node_link({links: [{from: "$a", from_slot: 0, to: "$b", to_slot: 0}]})',
        required: ['from_node, from_slot, to_node, to_slot (or links array)'],
        tip: 'Use get_node({type: "..."}) to find valid slot indices'
    },
    'delete_node_link': {
        usage: 'delete_node_link({node: 1, input_slot: 0})',
        multi: 'delete_node_link({links: [{node: 1, input_slot: 0}, {node: 2, input_slot: 1}]})',
        required: ['node, input_slot'],
        tip: 'Specify the TARGET node and its INPUT slot index'
    },

    // =========================================================================
    // WIDGET TOOLS (2)
    // =========================================================================
    'update_widget': {
        usage: 'update_widget({node: 1, widget: "steps", value: 20})',
        multi: 'update_widget({updates: [{node: 1, widget: "steps", value: 20}, {node: "$ref", widget: "cfg", value: 7}]})',
        required: ['node, widget, value'],
        tip: 'Use get_widget_options({node: 1, widget: "sampler_name"}) for valid dropdown values'
    },
    'get_widget_options': {
        usage: 'get_widget_options({node: 1, widget: "sampler_name"})',
        required: ['node, widget'],
        tip: 'Returns array of valid values for dropdown/combo widgets'
    },

    // =========================================================================
    // GROUP TOOLS (6)
    // =========================================================================
    'create_group': {
        usage: 'create_group({title: "Group Name", nodes: [1, 2, 3], color: "#A88"})',
        multi: 'create_group({groups: [{title: "A", nodes: [1, 2]}, {title: "B", nodes: [3, 4]}]})',
        required: ['title'],
        tip: 'Standard colors: #2A4858 (teal), #4A3858 (purple), #385828 (green), #583828 (brown)'
    },
    'delete_group': {
        usage: 'delete_group({group: 0}) or delete_group({group: "Group Name"})',
        required: ['group (index or name)'],
        tip: 'Deleting a group keeps the nodes - only removes the visual grouping'
    },
    'update_group': {
        usage: 'update_group({group: 0, title: "New Title", color: "#8A8", pos: [x, y], size: [w, h]})',
        required: ['group'],
        tip: 'Group index is 0-based; use name string for clarity'
    },
    'move_nodes_to_group': {
        usage: 'move_nodes_to_group({nodes: [1, 2], to_group: "Target Group"})',
        multi: 'move_nodes_to_group({moves: [{nodes: [1, 2], to_group: "A"}, {nodes: [3], to_group: "B"}]})',
        required: ['nodes, to_group'],
        tip: 'Creates the target group if it does not exist'
    },
    'merge_groups': {
        usage: 'merge_groups({groups: [0, 1], into: {title: "Merged Group", color: "#888"}})',
        required: ['groups'],
        tip: 'Merges all nodes from source groups into a single new group'
    },
    'detect_group_issues': {
        usage: 'detect_group_issues({min_gap: 100})',
        required: [],
        tip: 'Detects: overlapping groups, duplicate names, empty groups'
    },

    // =========================================================================
    // HIGH-LEVEL TOOLS (3)
    // =========================================================================
    'organize': {
        usage: 'organize({})',
        required: [],
        tip: 'Auto-organizes ENTIRE workflow in ONE call - 10x faster than manual positioning!'
    },
    'organize_layout': {
        usage: 'organize_layout({plan: {flow: "left_to_right", groups: [{title: "Loaders", nodes: [1, 2], color: "#2A4858", order: 0}], group_spacing: 100}})',
        required: ['plan'],
        tip: 'You provide semantic grouping, frontend handles pixel math'
    },
    'clear_workflow': {
        usage: 'clear_workflow({})',
        required: [],
        tip: 'DANGER: Deletes ALL nodes and groups! Consider undo availability.'
    },

    // =========================================================================
    // EXECUTION TOOLS (3) - Workflow execution lifecycle
    // =========================================================================
    'queue_execution': {
        usage: 'queue_execution({batch_size: 1})',
        required: [],
        tip: 'Submits workflow to execution queue; use execution_status to monitor'
    },
    'cancel_execution': {
        usage: 'cancel_execution({})',
        required: [],
        tip: 'Cancels/interrupts current workflow execution immediately'
    },
    'execution_status': {
        usage: 'execution_status({include_history: true, history_limit: 5})',
        required: [],
        tip: 'Returns execution queue state and optional history'
    },

    // =========================================================================
    // ANALYSIS TOOLS (5)
    // =========================================================================
    'find_nodes': {
        usage: 'find_nodes({query: {type: "KSampler", bypassed: false, in_group: "Sampling", ungrouped: true}})',
        required: ['query'],
        tip: 'Query fields: type, bypassed, in_group, ungrouped, has_disconnected_inputs, widget: {name, value}'
    },
    'get_modified_widgets': {
        usage: 'get_modified_widgets({nodes: [1, 2, 3]})',
        required: [],
        tip: 'Returns widgets that differ from default values; omit nodes for all'
    },
    'validate_workflow': {
        usage: 'validate_workflow({})',
        required: [],
        tip: 'Checks: required inputs connected, type compatibility, model files exist'
    },
    'detect_layout_issues': {
        usage: 'detect_layout_issues({min_spacing: 20})',
        required: [],
        tip: 'Detects: overlapping nodes, cramped areas, poor alignment'
    },
    'analyze_workflow': {
        usage: 'analyze_workflow({include_suggestions: true})',
        required: [],
        tip: 'Comprehensive health check combining validation + layout + optimization analysis'
    },

    // =========================================================================
    // LOW-LEVEL DEBUG TOOLS (3)
    // =========================================================================
    'get_workflow_json': {
        usage: 'get_workflow_json({})',
        required: [],
        tip: 'Returns raw LiteGraph JSON - can be very large! Use sparingly.'
    },
    'patch_workflow_json': {
        usage: 'patch_workflow_json({patches: [{op: "replace", path: "/nodes/0/pos/0", value: 100}]})',
        required: ['patches'],
        tip: 'Uses RFC 6902 JSON Patch format. Ops: add, remove, replace, copy, move'
    },
    'set_workflow_json': {
        usage: 'set_workflow_json({workflow: {...complete workflow object...}})',
        required: ['workflow'],
        tip: 'DANGER: Replaces ENTIRE workflow! Validate structure before calling.'
    },

    // =========================================================================
    // UTILITY TOOLS (2)
    // =========================================================================
    'batch': {
        usage: 'batch({commands: [{tool: "create_node", nodes: [...]}, {tool: "create_node_link", links: [...]}]})',
        required: ['commands'],
        tip: 'Atomic execution: ALL succeed or ALL rollback. Max 50 commands. $refs propagate between commands.'
    },
    'undo': {
        usage: 'undo({count: 1})',
        required: [],
        tip: 'Undoes last N operations; batch operations undo as a single unit'
    },

    // =========================================================================
    // CONTEXT/DISCOVERY TOOLS (5)
    // =========================================================================
    'get_workflow': {
        usage: 'get_workflow({mode: "summary"}) // modes: summary, details, full',
        required: [],
        tip: 'Usually NOT needed - workflow context is auto-injected with every message!'
    },
    'get_node': {
        usage: 'get_node({node: 1})',
        required: ['node'],
        tip: 'Returns full node details including all widget values'
    },
    'list_available_models': {
        usage: 'list_available_models({type: "checkpoints"}) // types: checkpoints, loras, vae, controlnet, upscale_models, embeddings',
        required: ['type'],
        tip: 'Returns list of available model files for the specified type'
    },
    'search_available_models': {
        usage: 'search_available_models({type: "loras", query: "detail"})',
        required: ['type', 'query'],
        tip: 'Search models by keyword'
    },
    'list_available_nodes': {
        usage: 'list_available_nodes({category: "sampling"})',
        required: [],
        tip: 'List all available node types, optionally filtered by category'
    },
    'search_available_nodes': {
        usage: 'search_available_nodes({query: "sampler"})',
        required: ['query'],
        tip: 'Search available node types by name'
    },
    'get_node_schema': {
        usage: 'get_node_schema({type: "KSampler"})',
        required: ['type'],
        tip: 'Returns inputs, outputs, and widget definitions for a node type'
    }
};

/**
 * Enrich an error response with usage hints
 * @param {string} toolName - The tool that failed
 * @param {string} error - Error message describing what went wrong
 * @param {object} context - Optional additional context
 * @returns {object} Enriched error response with hints
 */
export function enrichError(toolName, error, context = {}) {
    const hint = TOOL_HINTS[toolName];

    // Fallback for unknown tools
    if (!hint) {
        return { success: false, error, ...context };
    }

    const response = {
        success: false,
        error,
        hint: hint.usage
    };

    // Add multi-item syntax if available
    if (hint.multi) {
        response.multi_syntax = hint.multi;
    }

    // Add helpful tip if available
    if (hint.tip) {
        response.tip = hint.tip;
    }

    // Add required params list if available
    if (hint.required && hint.required.length > 0) {
        response.required_params = hint.required;
    }

    // Merge any additional context
    return { ...response, ...context };
}

/**
 * Get just the usage hint for a tool (for quick reference)
 * @param {string} toolName - The tool name
 * @returns {string|null} Usage string or null if unknown tool
 */
export function getToolUsage(toolName) {
    return TOOL_HINTS[toolName]?.usage || null;
}

/**
 * Get all hints for a tool
 * @param {string} toolName - The tool name
 * @returns {object|null} Full hint object or null if unknown tool
 */
export function getToolHint(toolName) {
    return TOOL_HINTS[toolName] || null;
}

// ============================================================================
// INLINE TESTS (run in browser console to verify)
// ============================================================================

/**
 * Run inline tests - call ToolHints.runTests() in browser console
 */
export function runTests() {
    console.log('=== Tool Hints Tests ===');
    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`  [PASS] ${name}`);
            passed++;
        } catch (e) {
            console.error(`  [FAIL] ${name}: ${e.message}`);
            failed++;
        }
    }

    function assert(condition, message) {
        if (!condition) throw new Error(message || 'Assertion failed');
    }

    // Test 1: All tools have hints (38 tools as of current version)
    test('All 38 tools have hints', () => {
        const toolCount = Object.keys(TOOL_HINTS).length;
        assert(toolCount === 38, `Expected 38 tools, got ${toolCount}`);
    });

    // Test 2: All hints have required 'usage' field
    test('All hints have usage field', () => {
        for (const [name, hint] of Object.entries(TOOL_HINTS)) {
            assert(hint.usage, `Tool ${name} missing usage field`);
            assert(typeof hint.usage === 'string', `Tool ${name} usage is not a string`);
        }
    });

    // Test 3: All hints have 'required' array
    test('All hints have required array', () => {
        for (const [name, hint] of Object.entries(TOOL_HINTS)) {
            assert(Array.isArray(hint.required), `Tool ${name} missing required array`);
        }
    });

    // Test 4: enrichError returns correct structure
    test('enrichError returns correct structure', () => {
        const result = enrichError('create_node', 'Test error');
        assert(result.success === false, 'Should have success: false');
        assert(result.error === 'Test error', 'Should preserve error message');
        assert(result.hint, 'Should have hint');
        assert(result.multi_syntax, 'create_node should have multi_syntax');
        assert(result.tip, 'create_node should have tip');
    });

    // Test 5: enrichError handles unknown tool
    test('enrichError handles unknown tool gracefully', () => {
        const result = enrichError('unknown_tool', 'Some error');
        assert(result.success === false, 'Should have success: false');
        assert(result.error === 'Some error', 'Should preserve error');
        assert(!result.hint, 'Should not have hint for unknown tool');
    });

    // Test 6: enrichError merges context
    test('enrichError merges additional context', () => {
        const result = enrichError('create_node', 'Error', { custom_field: 'value' });
        assert(result.custom_field === 'value', 'Should merge custom context');
    });

    // Test 7: getToolUsage returns usage string
    test('getToolUsage returns usage', () => {
        const usage = getToolUsage('batch');
        assert(usage, 'Should return usage');
        assert(usage.includes('commands'), 'batch usage should mention commands');
    });

    // Test 8: getToolUsage returns null for unknown
    test('getToolUsage returns null for unknown tool', () => {
        const usage = getToolUsage('fake_tool');
        assert(usage === null, 'Should return null for unknown tool');
    });

    // Test 9: getToolHint returns full object
    test('getToolHint returns full hint object', () => {
        const hint = getToolHint('update_widget');
        assert(hint, 'Should return hint object');
        assert(hint.usage, 'Should have usage');
        assert(hint.multi, 'update_widget should have multi');
        assert(hint.tip, 'Should have tip');
    });

    // Test 10: Dangerous tools have warnings in tips
    test('Dangerous tools have warning tips', () => {
        assert(TOOL_HINTS['clear_workflow'].tip.includes('DANGER'), 'clear_workflow should warn');
        assert(TOOL_HINTS['set_workflow_json'].tip.includes('DANGER'), 'set_workflow_json should warn');
    });

    console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
    return failed === 0;
}

// Attach to class-like object for console access
export const ToolHints = {
    TOOL_HINTS,
    enrichError,
    getToolUsage,
    getToolHint,
    runTests
};
