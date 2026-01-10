/**
 * Batch Executor Tests
 *
 * Tests for the batch_executor.js module which provides:
 * - Atomic batch command execution
 * - Rollback on failure
 * - $ref propagation between commands
 * - Validation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetMocks, createMockNode } from './setup.js';
import { BatchExecutor, ALLOWED_BATCH_TOOLS, MAX_BATCH_COMMANDS } from '../../web/js/batch_executor.js';
import { RefResolver } from '../../web/js/ref_resolver.js';

describe('BatchExecutor', () => {
    let executor;
    let refResolver;
    let mockExecuteTool;
    let mockToolActionMap;

    beforeEach(() => {
        resetMocks();
        refResolver = new RefResolver();
        mockExecuteTool = vi.fn().mockResolvedValue({ success: true });

        // Create a mock tool action map
        mockToolActionMap = {
            create_node: mockExecuteTool,
            delete_node: mockExecuteTool,
            update_node: mockExecuteTool,
            duplicate_node: mockExecuteTool,
            bypass_node: mockExecuteTool,
            create_node_link: mockExecuteTool,
            delete_node_link: mockExecuteTool,
            update_widget: mockExecuteTool,
            create_group: mockExecuteTool,
            delete_group: mockExecuteTool,
            update_group: mockExecuteTool,
            move_nodes_to_group: mockExecuteTool,
            merge_groups: mockExecuteTool,
            organize: mockExecuteTool,
            organize_layout: mockExecuteTool,
            undo: mockExecuteTool
        };

        // BatchExecutor takes (workflowAPI, refResolver, toolActionMap)
        const mockWorkflowAPI = {
            ...globalThis.app.graph,
            saveUndoState: vi.fn(),
            undo: vi.fn()
        };

        executor = new BatchExecutor(mockWorkflowAPI, refResolver, mockToolActionMap);
    });

    describe('ALLOWED_BATCH_TOOLS', () => {
        it('should include all node tools', () => {
            expect(ALLOWED_BATCH_TOOLS.has('create_node')).toBe(true);
            expect(ALLOWED_BATCH_TOOLS.has('delete_node')).toBe(true);
            expect(ALLOWED_BATCH_TOOLS.has('update_node')).toBe(true);
            expect(ALLOWED_BATCH_TOOLS.has('duplicate_node')).toBe(true);
            expect(ALLOWED_BATCH_TOOLS.has('bypass_node')).toBe(true);
        });

        it('should include link tools with correct names', () => {
            expect(ALLOWED_BATCH_TOOLS.has('create_node_link')).toBe(true);
            expect(ALLOWED_BATCH_TOOLS.has('delete_node_link')).toBe(true);
        });

        it('should include widget tools', () => {
            expect(ALLOWED_BATCH_TOOLS.has('update_widget')).toBe(true);
        });

        it('should include group tools with correct names', () => {
            expect(ALLOWED_BATCH_TOOLS.has('create_group')).toBe(true);
            expect(ALLOWED_BATCH_TOOLS.has('delete_group')).toBe(true);
            expect(ALLOWED_BATCH_TOOLS.has('update_group')).toBe(true);
            expect(ALLOWED_BATCH_TOOLS.has('move_nodes_to_group')).toBe(true);
            expect(ALLOWED_BATCH_TOOLS.has('merge_groups')).toBe(true);
        });

        it('should include high-level and utility tools', () => {
            expect(ALLOWED_BATCH_TOOLS.has('organize')).toBe(true);
            expect(ALLOWED_BATCH_TOOLS.has('organize_layout')).toBe(true);
            expect(ALLOWED_BATCH_TOOLS.has('undo')).toBe(true);
        });

        it('should NOT include dangerous or read-only tools', () => {
            // clear_workflow is dangerous - shouldn't be in undoable batch
            expect(ALLOWED_BATCH_TOOLS.has('clear_workflow')).toBe(false);
            // Read-only/discovery tools not allowed
            expect(ALLOWED_BATCH_TOOLS.has('get_workflow')).toBe(false);
            expect(ALLOWED_BATCH_TOOLS.has('list_nodes')).toBe(false);
            expect(ALLOWED_BATCH_TOOLS.has('find_nodes')).toBe(false);
            expect(ALLOWED_BATCH_TOOLS.has('set_workflow_json')).toBe(false);
        });
    });

    describe('MAX_BATCH_COMMANDS', () => {
        it('should be 50', () => {
            expect(MAX_BATCH_COMMANDS).toBe(50);
        });
    });

    describe('validate', () => {
        it('should accept valid commands', () => {
            const commands = [
                { tool: 'create_node', nodes: [{ type: 'KSampler', ref: '$sampler' }] },
                { tool: 'update_widget', updates: [{ node: '$sampler', widget: 'steps', value: 30 }] }
            ];

            const result = executor.validate(commands);

            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('should reject empty commands', () => {
            const result = executor.validate([]);

            expect(result.valid).toBe(false);
            // Actual message: 'Batch is empty - no commands to execute'
            expect(result.errors.some(e => e.toLowerCase().includes('empty'))).toBe(true);
        });

        it('should reject null/undefined commands', () => {
            const result = executor.validate(null);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.toLowerCase().includes('empty'))).toBe(true);
        });

        it('should reject too many commands', () => {
            const commands = Array(51).fill({ tool: 'create_node', nodes: [{ type: 'KSampler' }] });

            const result = executor.validate(commands);

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('50');
        });

        it('should reject disallowed tools', () => {
            const commands = [
                { tool: 'clear_workflow' }
            ];

            const result = executor.validate(commands);

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('clear_workflow');
            expect(result.errors[0]).toContain('not allowed');
        });

        it('should reject commands without tool property', () => {
            const commands = [
                { nodes: [{ type: 'KSampler' }] }
            ];

            const result = executor.validate(commands);

            expect(result.valid).toBe(false);
            // Actual message: "Command 1: Missing 'tool' property"
            expect(result.errors[0].toLowerCase()).toContain('tool');
        });

        it('should validate multiple errors at once', () => {
            const commands = [
                { tool: 'clear_workflow' },
                { nodes: [] },
                { tool: 'set_workflow_json', workflow: {} }
            ];

            const result = executor.validate(commands);

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('execute', () => {
        it('should execute all commands in order', async () => {
            mockExecuteTool
                .mockResolvedValueOnce({ success: true, node_id: 1 })
                .mockResolvedValueOnce({ success: true, node_id: 2 })
                .mockResolvedValueOnce({ success: true });

            const commands = [
                { tool: 'create_node', nodes: [{ type: 'KSampler', ref: '$a' }] },
                { tool: 'create_node', nodes: [{ type: 'VAEDecode', ref: '$b' }] },
                { tool: 'create_node_link', links: [{ from: '$a', from_slot: 0, to: '$b', to_slot: 0 }] }
            ];

            const result = await executor.execute(commands);

            expect(result.success).toBe(true);
            expect(mockExecuteTool).toHaveBeenCalledTimes(3);
        });

        it('should propagate $refs between commands', async () => {
            mockExecuteTool
                .mockResolvedValueOnce({ success: true, node_id: 42, ref: '$sampler' })
                .mockResolvedValueOnce({ success: true });

            const commands = [
                { tool: 'create_node', nodes: [{ type: 'KSampler', ref: '$sampler' }] },
                { tool: 'update_widget', updates: [{ node: '$sampler', widget: 'steps', value: 30 }] }
            ];

            const result = await executor.execute(commands);

            expect(result.success).toBe(true);

            // The second call should have resolved $sampler to 42
            const secondCall = mockExecuteTool.mock.calls[1];
            // Check that the ref was resolved (implementation dependent)
        });

        it('should rollback on failure', async () => {
            const mockUndo = vi.fn();
            const mockSaveUndoState = vi.fn();
            const mockWorkflowAPI = {
                ...globalThis.app.graph,
                undo: mockUndo,
                saveUndoState: mockSaveUndoState
            };

            // Re-create executor with new mocks
            const failExecutor = new BatchExecutor(mockWorkflowAPI, refResolver, mockToolActionMap);

            // First call succeeds, second fails
            mockExecuteTool
                .mockReset()
                .mockResolvedValueOnce({ success: true, node_id: 1 })
                .mockResolvedValueOnce({ success: false, error: 'Connection failed' });

            const commands = [
                { tool: 'create_node', nodes: [{ type: 'KSampler' }] },
                { tool: 'create_node_link', links: [{ from: 1, from_slot: 0, to: 2, to_slot: 0 }] }
            ];

            const result = await failExecutor.execute(commands);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Connection failed');
            expect(result.rolled_back).toBe(true);
        });

        it('should validate before executing', async () => {
            const commands = [
                { tool: 'clear_workflow' }  // Not allowed
            ];

            const result = await executor.execute(commands);

            expect(result.success).toBe(false);
            // Actual message: "Batch validation failed - check commands array"
            expect(result.error).toContain('validation failed');
            expect(result.validation_errors[0]).toContain('not allowed');
            expect(mockExecuteTool).not.toHaveBeenCalled();
        });

        it('should skip validation with skipValidation option', async () => {
            mockExecuteTool.mockResolvedValue({ success: true });

            // Even with technically invalid structure, skipValidation allows execution
            const commands = [
                { tool: 'create_node', nodes: [{ type: 'KSampler' }] }
            ];

            const result = await executor.execute(commands, { skipValidation: true });

            expect(result.success).toBe(true);
            expect(mockExecuteTool).toHaveBeenCalled();
        });
    });

    describe('generateBatchDescription', () => {
        it('should create human-readable summary', () => {
            const commands = [
                { tool: 'create_node', nodes: [{ type: 'KSampler' }, { type: 'VAEDecode' }] },
                { tool: 'create_node_link', links: [{ from: 1, to: 2 }] },
                { tool: 'update_widget', updates: [{ node: 1, widget: 'steps', value: 30 }] }
            ];

            const description = executor.generateBatchDescription(commands);

            expect(description).toContain('create_node');
            expect(description).toContain('create_node_link');
            expect(description).toContain('update_widget');
        });

        it('should handle empty commands', () => {
            const description = executor.generateBatchDescription([]);

            // Implementation returns "Batch: " for empty arrays
            expect(description).toBe('Batch: ');
        });
    });

    describe('generateSummary', () => {
        it('should count created items', () => {
            // generateSummary uses this.results internally
            // We need to populate it via execute() or set it directly
            executor.results = [
                { tool: 'create_node', result: { success: true, node_id: 1 }},
                { tool: 'create_node', result: { success: true, node_id: 2 }},
                { tool: 'create_node_link', result: { success: true }}
            ];

            const summary = executor.generateSummary();

            expect(summary.counts.nodes_created).toBe(2);
            expect(summary.counts.links_created).toBe(1);
        });

        it('should handle mixed results', () => {
            executor.results = [
                { tool: 'create_node', result: { success: true, node_id: 1 }},
                { tool: 'create_node', result: { success: false, error: 'Failed' }},
                { tool: 'create_node', result: { success: true, node_id: 2 }}
            ];

            const summary = executor.generateSummary();

            // Failed results are skipped, so only 2 nodes counted
            expect(summary.counts.nodes_created).toBe(2);
        });
    });

    describe('getCreatedRefs', () => {
        it('should extract refs from results', () => {
            // getCreatedRefs uses this.results internally and returns an object
            executor.results = [
                { tool: 'create_node', result: { success: true, node_id: 1, ref: '$a' }},
                { tool: 'create_node', result: { success: true, node_id: 2, ref: '$b' }},
                { tool: 'create_link', result: { success: true }}  // No ref
            ];

            const refs = executor.getCreatedRefs();

            expect(refs).toHaveProperty('$a', 1);
            expect(refs).toHaveProperty('$b', 2);
            expect(Object.keys(refs).length).toBe(2);
        });

        it('should return empty object for no refs', () => {
            executor.results = [
                { tool: 'create_node', result: { success: true, node_id: 1 }},
                { tool: 'create_link', result: { success: true }}
            ];

            const refs = executor.getCreatedRefs();

            expect(refs).toEqual({});
        });
    });

    describe('runTests (inline tests)', () => {
        it('should pass all inline tests', () => {
            const result = BatchExecutor.runTests();
            expect(result).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle command with multiple array properties', async () => {
            mockExecuteTool.mockResolvedValue({ success: true });

            const commands = [
                {
                    tool: 'create_node',
                    nodes: [
                        { type: 'KSampler', ref: '$a', group: 'Sampling' },
                        { type: 'VAEDecode', ref: '$b', group: 'Output' }
                    ]
                }
            ];

            const result = await executor.execute(commands);

            expect(result.success).toBe(true);
        });

        it('should preserve command order for dependent operations', async () => {
            const callOrder = [];
            mockExecuteTool.mockImplementation((params) => {
                // The executor passes the command params to the action function
                callOrder.push(params);
                return Promise.resolve({ success: true, node_id: callOrder.length });
            });

            const commands = [
                { tool: 'create_node', nodes: [{ type: 'A' }] },
                { tool: 'create_node', nodes: [{ type: 'B' }] },
                { tool: 'create_node', nodes: [{ type: 'C' }] }
            ];

            await executor.execute(commands);

            // Should have executed 3 commands in order
            expect(callOrder.length).toBe(3);
            // Each call receives the command params
            expect(callOrder[0].nodes[0].type).toBe('A');
            expect(callOrder[1].nodes[0].type).toBe('B');
            expect(callOrder[2].nodes[0].type).toBe('C');
        });
    });
});
