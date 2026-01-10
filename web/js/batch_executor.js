/**
 * BatchExecutor - Atomic batch execution for Claude Chat
 *
 * Phase 3 of Agent Tools architecture.
 *
 * Executes multiple commands atomically as a single operation.
 * Features:
 *   - Sequential execution with $ref propagation
 *   - Automatic rollback on failure
 *   - Single undo for entire batch
 *   - Validation before execution
 *   - Result aggregation with summary
 *   - Error hints passthrough (Phase 5.1)
 *
 * Example:
 *   const executor = new BatchExecutor(workflowAPI, refResolver, toolActionMap);
 *   const result = await executor.execute([
 *     {tool: "create_node", nodes: [{type: "KSampler", ref: "$sampler"}]},
 *     {tool: "create_link", links: [{from: "$sampler", from_slot: 0, to: 1, to_slot: 0}]}
 *   ]);
 */

import { enrichError } from "./tool_hints.js";

// List of tools that can be used in batches (action tools only, not read-only)
const ALLOWED_BATCH_TOOLS = new Set([
    // Node operations
    'create_node', 'delete_node', 'update_node', 'duplicate_node', 'bypass_node',
    // Link operations (renamed from create_link/delete_link)
    'create_node_link', 'delete_node_link',
    // Widget operations
    'update_widget',
    // Group operations (move_nodes_to_group renamed from move_to_group)
    'create_group', 'delete_group', 'update_group', 'move_nodes_to_group', 'merge_groups',
    // High-level operations
    'organize', 'organize_layout',
    // Utility
    'undo'
]);

// Maximum commands per batch (safety limit)
const MAX_BATCH_COMMANDS = 50;

class BatchExecutor {
    /**
     * @param {object} workflowAPI - The WorkflowAPI instance for undo operations
     * @param {object} refResolver - The RefResolver instance for $ref resolution
     * @param {object} toolActionMap - Map of tool names to handler functions
     */
    constructor(workflowAPI, refResolver, toolActionMap) {
        this.workflowAPI = workflowAPI;
        this.refResolver = refResolver;
        this.toolActionMap = toolActionMap;
        this.executedCommands = [];
        this.results = [];
    }

    /**
     * Validate a batch before execution
     * @param {Array} commands - Array of command objects
     * @returns {{valid: boolean, errors: Array}}
     */
    validate(commands) {
        const errors = [];

        // Check empty batch
        if (!commands || commands.length === 0) {
            errors.push('Batch is empty - no commands to execute');
            return { valid: false, errors };
        }

        // Check max commands
        if (commands.length > MAX_BATCH_COMMANDS) {
            errors.push(`Batch exceeds maximum of ${MAX_BATCH_COMMANDS} commands (got ${commands.length})`);
            return { valid: false, errors };
        }

        // Validate each command
        for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i];
            const prefix = `Command ${i + 1}`;

            // Check tool property exists
            if (!cmd.tool) {
                errors.push(`${prefix}: Missing 'tool' property`);
                continue;
            }

            // Check tool is allowed in batch
            if (!ALLOWED_BATCH_TOOLS.has(cmd.tool)) {
                if (cmd.tool === 'batch') {
                    errors.push(`${prefix}: Nested batches are not allowed`);
                } else {
                    errors.push(`${prefix}: Tool '${cmd.tool}' is not allowed in batch (read-only or unknown)`);
                }
                continue;
            }

            // Check tool handler exists
            if (!this.toolActionMap[cmd.tool]) {
                errors.push(`${prefix}: Unknown tool '${cmd.tool}'`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Execute a batch of commands atomically
     * @param {Array} commands - Array of command objects with {tool, ...params}
     * @param {object} options - Optional settings
     * @param {boolean} options.dry_run - If true, validate only without executing
     * @returns {Promise<object>} Result with success, results, and summary
     */
    async execute(commands, options = {}) {
        // Reset state for new execution
        this.executedCommands = [];
        this.results = [];

        // Validate first
        const validation = this.validate(commands);
        if (!validation.valid) {
            return {
                ...enrichError('batch', 'Batch validation failed - check commands array'),
                validation_errors: validation.errors,
                commands_count: commands?.length || 0
            };
        }

        // Dry run mode - just validate and return preview
        if (options.dry_run) {
            return {
                success: true,
                dry_run: true,
                commands_count: commands.length,
                preview: commands.map((cmd, i) => ({
                    index: i + 1,
                    tool: cmd.tool,
                    would_execute: true
                })),
                message: `Dry run: ${commands.length} commands validated successfully`
            };
        }

        // Save undo state before batch
        const batchDescription = this.generateBatchDescription(commands);
        this.workflowAPI.saveUndoState(batchDescription);

        try {
            // Execute commands sequentially
            for (let i = 0; i < commands.length; i++) {
                const cmd = commands[i];
                const handler = this.toolActionMap[cmd.tool];

                console.log(`[BatchExecutor] Executing command ${i + 1}/${commands.length}: ${cmd.tool}`);

                // Execute the command (params are already resolved by handler via refResolver)
                const result = await handler(cmd);

                // Track execution
                this.executedCommands.push(cmd);
                this.results.push({
                    index: i + 1,
                    tool: cmd.tool,
                    result
                });

                // Check for failure
                if (result && result.success === false) {
                    console.log(`[BatchExecutor] Command ${i + 1} failed:`, result.error);

                    // Rollback!
                    await this.rollback(batchDescription);

                    // Build failure response, preserving hints from failed command
                    const failureResponse = {
                        success: false,
                        error: `Command ${i + 1} (${cmd.tool}): ${result.error || 'Unknown error'}`,
                        failed_at: i + 1,
                        executed_commands: i,
                        rolled_back: true,
                        failed_command: cmd,
                        results: this.results
                    };

                    // Pass through hints from the failed tool for Future Claude
                    if (result.hint) failureResponse.hint = result.hint;
                    if (result.multi_syntax) failureResponse.multi_syntax = result.multi_syntax;
                    if (result.tip) failureResponse.tip = result.tip;
                    if (result.required_params) failureResponse.required_params = result.required_params;

                    return failureResponse;
                }
            }

            // All commands succeeded!
            const summary = this.generateSummary();

            return {
                success: true,
                commands_executed: commands.length,
                results: this.results,
                summary,
                refs: this.getCreatedRefs()
            };

        } catch (error) {
            console.error('[BatchExecutor] Unexpected error:', error);

            // Rollback on exception
            await this.rollback(batchDescription);

            return {
                success: false,
                error: `Batch execution failed: ${error.message}`,
                failed_at: this.executedCommands.length + 1,
                executed_commands: this.executedCommands.length,
                rolled_back: true,
                results: this.results
            };
        }
    }

    /**
     * Rollback by undoing to pre-batch state
     */
    async rollback(description) {
        console.log(`[BatchExecutor] Rolling back batch: ${description}`);

        try {
            // Undo restores to the saved state
            const result = this.workflowAPI.undo();
            if (result.success) {
                console.log('[BatchExecutor] Rollback successful');
            } else {
                console.error('[BatchExecutor] Rollback failed:', result.error);
            }
        } catch (e) {
            console.error('[BatchExecutor] Rollback exception:', e);
        }
    }

    /**
     * Generate a human-readable description of the batch
     */
    generateBatchDescription(commands) {
        const toolCounts = {};
        for (const cmd of commands) {
            toolCounts[cmd.tool] = (toolCounts[cmd.tool] || 0) + 1;
        }

        const parts = [];
        for (const [tool, count] of Object.entries(toolCounts)) {
            parts.push(`${count}x ${tool}`);
        }

        return `Batch: ${parts.join(', ')}`;
    }

    /**
     * Generate summary of what was created/modified
     */
    generateSummary() {
        const counts = {
            nodes_created: 0,
            nodes_deleted: 0,
            nodes_updated: 0,
            links_created: 0,
            links_deleted: 0,
            groups_created: 0,
            groups_deleted: 0,
            widgets_updated: 0
        };

        for (const entry of this.results) {
            const { tool, result } = entry;

            if (!result || result.success === false) continue;

            switch (tool) {
                case 'create_node':
                    if (result.results) {
                        counts.nodes_created += result.results.length;
                    } else if (result.node_id || result.node) {
                        counts.nodes_created += 1;
                    }
                    break;

                case 'delete_node':
                    if (result.results) {
                        counts.nodes_deleted += result.results.length;
                    } else {
                        counts.nodes_deleted += 1;
                    }
                    break;

                case 'update_node':
                case 'duplicate_node':
                case 'bypass_node':
                    if (result.results) {
                        counts.nodes_updated += result.results.length;
                    } else {
                        counts.nodes_updated += 1;
                    }
                    break;

                case 'create_node_link':
                    if (result.results) {
                        counts.links_created += result.results.length;
                    } else {
                        counts.links_created += 1;
                    }
                    break;

                case 'delete_node_link':
                    if (result.results) {
                        counts.links_deleted += result.results.length;
                    } else {
                        counts.links_deleted += 1;
                    }
                    break;

                case 'create_group':
                    if (result.results) {
                        counts.groups_created += result.results.length;
                    } else {
                        counts.groups_created += 1;
                    }
                    break;

                case 'delete_group':
                    if (result.results) {
                        counts.groups_deleted += result.results.length;
                    } else {
                        counts.groups_deleted += 1;
                    }
                    break;

                case 'update_widget':
                    if (result.results) {
                        counts.widgets_updated += result.results.length;
                    } else {
                        counts.widgets_updated += 1;
                    }
                    break;
            }
        }

        // Build human-readable summary
        const parts = [];
        if (counts.nodes_created > 0) parts.push(`${counts.nodes_created} node${counts.nodes_created > 1 ? 's' : ''} created`);
        if (counts.nodes_deleted > 0) parts.push(`${counts.nodes_deleted} node${counts.nodes_deleted > 1 ? 's' : ''} deleted`);
        if (counts.nodes_updated > 0) parts.push(`${counts.nodes_updated} node${counts.nodes_updated > 1 ? 's' : ''} updated`);
        if (counts.links_created > 0) parts.push(`${counts.links_created} link${counts.links_created > 1 ? 's' : ''} created`);
        if (counts.links_deleted > 0) parts.push(`${counts.links_deleted} link${counts.links_deleted > 1 ? 's' : ''} deleted`);
        if (counts.groups_created > 0) parts.push(`${counts.groups_created} group${counts.groups_created > 1 ? 's' : ''} created`);
        if (counts.groups_deleted > 0) parts.push(`${counts.groups_deleted} group${counts.groups_deleted > 1 ? 's' : ''} deleted`);
        if (counts.widgets_updated > 0) parts.push(`${counts.widgets_updated} widget${counts.widgets_updated > 1 ? 's' : ''} updated`);

        return {
            text: parts.length > 0 ? parts.join(', ') : 'No changes detected',
            counts
        };
    }

    /**
     * Get all $refs that were created during this batch
     */
    getCreatedRefs() {
        const refs = {};

        for (const entry of this.results) {
            const { result } = entry;
            if (!result || result.success === false) continue;

            // Single result with ref
            if (result.ref && (result.node_id || result.new_id)) {
                refs[result.ref] = result.node_id || result.new_id;
            }

            // Array results with refs
            if (result.results) {
                for (const r of result.results) {
                    if (r.ref && (r.node_id || r.new_id)) {
                        refs[r.ref] = r.node_id || r.new_id;
                    }
                }
            }
        }

        return refs;
    }
}

// ============================================================================
// INLINE TESTS (run in browser console to verify)
// ============================================================================

/**
 * Run inline tests - call BatchExecutor.runTests() in browser console
 */
BatchExecutor.runTests = function() {
    console.log('=== BatchExecutor Tests ===');
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

    // Mock objects for testing
    const mockAPI = {
        saveUndoState: () => true,
        undo: () => ({ success: true })
    };
    const mockResolver = { resolveParams: (p) => p };
    const mockTools = {
        'create_node': async () => ({ success: true, node_id: 1 }),
        'create_node_link': async () => ({ success: true }),
        'delete_node': async () => ({ success: true })
    };

    // Test 1: Empty batch validation
    test('Empty batch fails validation', () => {
        const exec = new BatchExecutor(mockAPI, mockResolver, mockTools);
        const result = exec.validate([]);
        assert(!result.valid, 'Should be invalid');
        assert(result.errors.length === 1, 'Should have 1 error');
    });

    // Test 2: Max commands validation
    test('Over max commands fails', () => {
        const exec = new BatchExecutor(mockAPI, mockResolver, mockTools);
        const tooMany = new Array(51).fill({ tool: 'create_node' });
        const result = exec.validate(tooMany);
        assert(!result.valid, 'Should be invalid');
        assert(result.errors[0].includes('maximum'), 'Should mention maximum');
    });

    // Test 3: Nested batch rejection
    test('Nested batch rejected', () => {
        const exec = new BatchExecutor(mockAPI, mockResolver, mockTools);
        const result = exec.validate([{ tool: 'batch', commands: [] }]);
        assert(!result.valid, 'Should be invalid');
        assert(result.errors[0].includes('Nested'), 'Should mention nested');
    });

    // Test 4: Unknown tool rejection
    test('Unknown tool rejected', () => {
        const exec = new BatchExecutor(mockAPI, mockResolver, mockTools);
        const result = exec.validate([{ tool: 'fake_tool' }]);
        assert(!result.valid, 'Should be invalid');
    });

    // Test 5: Read-only tool rejection
    test('Read-only tool rejected', () => {
        const exec = new BatchExecutor(mockAPI, mockResolver, mockTools);
        const result = exec.validate([{ tool: 'get_workflow' }]);
        assert(!result.valid, 'Should be invalid');
    });

    // Test 6: Valid batch validation
    test('Valid batch passes', () => {
        const exec = new BatchExecutor(mockAPI, mockResolver, mockTools);
        const result = exec.validate([
            { tool: 'create_node', type: 'KSampler' },
            { tool: 'create_node_link', from: 1, to: 2 }
        ]);
        assert(result.valid, 'Should be valid');
        assert(result.errors.length === 0, 'No errors');
    });

    // Test 7: Missing tool property
    test('Missing tool property fails', () => {
        const exec = new BatchExecutor(mockAPI, mockResolver, mockTools);
        const result = exec.validate([{ type: 'KSampler' }]);
        assert(!result.valid, 'Should be invalid');
        assert(result.errors[0].includes('Missing'), 'Should mention missing');
    });

    // Test 8: Summary generation
    test('Summary generates correctly', () => {
        const exec = new BatchExecutor(mockAPI, mockResolver, mockTools);
        exec.results = [
            { tool: 'create_node', result: { success: true, results: [{node_id: 1}, {node_id: 2}] } },
            { tool: 'create_node_link', result: { success: true } }
        ];
        const summary = exec.generateSummary();
        assert(summary.counts.nodes_created === 2, 'Should count 2 nodes');
        // Note: create_node_link is not tracked by generateSummary's switch statement
        // which still uses old 'create_link' name - this is a known issue
        assert(summary.text.includes('2 nodes'), 'Text should mention 2 nodes');
    });

    // Test 9: Batch description
    test('Batch description generated', () => {
        const exec = new BatchExecutor(mockAPI, mockResolver, mockTools);
        const desc = exec.generateBatchDescription([
            { tool: 'create_node' },
            { tool: 'create_node' },
            { tool: 'create_node_link' }
        ]);
        assert(desc.includes('2x create_node'), 'Should count create_node');
        assert(desc.includes('1x create_node_link'), 'Should count create_node_link');
    });

    console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
    return failed === 0;
};

export { BatchExecutor, ALLOWED_BATCH_TOOLS, MAX_BATCH_COMMANDS };
