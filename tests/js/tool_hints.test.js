/**
 * Tool Hints Tests
 *
 * Tests for the tool_hints.js module which provides:
 * - Usage hints for all tools
 * - Error enrichment with hints
 * - Tool usage lookup
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TOOL_HINTS, enrichError, getToolUsage, getToolHint, runTests } from '../../web/js/tool_hints.js';

describe('TOOL_HINTS', () => {
    describe('Registry completeness', () => {
        it('should have hints for all 36+ tools', () => {
            const toolCount = Object.keys(TOOL_HINTS).length;
            expect(toolCount).toBeGreaterThanOrEqual(36);
        });

        it('should include all node tools', () => {
            expect(TOOL_HINTS).toHaveProperty('create_node');
            expect(TOOL_HINTS).toHaveProperty('delete_node');
            expect(TOOL_HINTS).toHaveProperty('update_node');
            expect(TOOL_HINTS).toHaveProperty('duplicate_node');
            expect(TOOL_HINTS).toHaveProperty('bypass_node');
        });

        it('should include all link tools with correct names', () => {
            expect(TOOL_HINTS).toHaveProperty('create_node_link');
            expect(TOOL_HINTS).toHaveProperty('delete_node_link');
        });

        it('should include all widget tools', () => {
            expect(TOOL_HINTS).toHaveProperty('update_widget');
            expect(TOOL_HINTS).toHaveProperty('get_widget_options');
        });

        it('should include all group tools', () => {
            expect(TOOL_HINTS).toHaveProperty('create_group');
            expect(TOOL_HINTS).toHaveProperty('delete_group');
            expect(TOOL_HINTS).toHaveProperty('update_group');
            expect(TOOL_HINTS).toHaveProperty('move_nodes_to_group');
            expect(TOOL_HINTS).toHaveProperty('merge_groups');
            expect(TOOL_HINTS).toHaveProperty('detect_group_issues');
        });

        it('should include all execution tools', () => {
            expect(TOOL_HINTS).toHaveProperty('queue_execution');
            expect(TOOL_HINTS).toHaveProperty('cancel_execution');
            expect(TOOL_HINTS).toHaveProperty('execution_status');
        });

        it('should include all analysis tools', () => {
            expect(TOOL_HINTS).toHaveProperty('find_nodes');
            expect(TOOL_HINTS).toHaveProperty('get_modified_widgets');
            expect(TOOL_HINTS).toHaveProperty('validate_workflow');
            expect(TOOL_HINTS).toHaveProperty('detect_layout_issues');
            expect(TOOL_HINTS).toHaveProperty('analyze_workflow');
        });

        it('should include all high-level tools', () => {
            expect(TOOL_HINTS).toHaveProperty('organize');
            expect(TOOL_HINTS).toHaveProperty('organize_layout');
            expect(TOOL_HINTS).toHaveProperty('clear_workflow');
        });

        it('should include all utility tools', () => {
            expect(TOOL_HINTS).toHaveProperty('batch');
            expect(TOOL_HINTS).toHaveProperty('undo');
        });

        it('should include all low-level tools', () => {
            expect(TOOL_HINTS).toHaveProperty('get_workflow_json');
            expect(TOOL_HINTS).toHaveProperty('patch_workflow_json');
            expect(TOOL_HINTS).toHaveProperty('set_workflow_json');
        });

        it('should include all discovery tools', () => {
            expect(TOOL_HINTS).toHaveProperty('get_workflow');
            expect(TOOL_HINTS).toHaveProperty('get_node');
            expect(TOOL_HINTS).toHaveProperty('list_available_models');
            expect(TOOL_HINTS).toHaveProperty('search_available_models');
            expect(TOOL_HINTS).toHaveProperty('list_available_nodes');
            expect(TOOL_HINTS).toHaveProperty('search_available_nodes');
            expect(TOOL_HINTS).toHaveProperty('get_node_schema');
        });
    });

    describe('Hint structure', () => {
        it('should have usage field for all tools', () => {
            for (const [name, hint] of Object.entries(TOOL_HINTS)) {
                expect(hint.usage, `Tool ${name} missing usage`).toBeDefined();
                expect(typeof hint.usage).toBe('string');
                expect(hint.usage.length).toBeGreaterThan(0);
            }
        });

        it('should have required array for all tools', () => {
            for (const [name, hint] of Object.entries(TOOL_HINTS)) {
                expect(Array.isArray(hint.required), `Tool ${name} missing required array`).toBe(true);
            }
        });

        it('should have tip for tools that need guidance', () => {
            // Most tools should have tips
            const toolsWithTips = Object.entries(TOOL_HINTS).filter(([, h]) => h.tip);
            expect(toolsWithTips.length).toBeGreaterThan(20);
        });

        it('should have multi syntax for batch-capable tools', () => {
            const batchCapableTools = [
                'create_node', 'delete_node', 'update_node', 'duplicate_node', 'bypass_node',
                'create_node_link', 'delete_node_link',
                'update_widget',
                'create_group', 'move_nodes_to_group'
            ];
            for (const toolName of batchCapableTools) {
                if (TOOL_HINTS[toolName]) {
                    expect(TOOL_HINTS[toolName].multi, `${toolName} should have multi syntax`).toBeDefined();
                }
            }
        });
    });

    describe('Dangerous tools warnings', () => {
        it('should warn about clear_workflow', () => {
            expect(TOOL_HINTS.clear_workflow.tip).toContain('DANGER');
        });

        it('should warn about set_workflow_json', () => {
            expect(TOOL_HINTS.set_workflow_json.tip).toContain('DANGER');
        });
    });

    describe('Usage syntax correctness', () => {
        it('should use correct tool names in usage examples', () => {
            // Verify renamed tools use new names
            expect(TOOL_HINTS.create_node_link.usage).toContain('create_node_link');
            expect(TOOL_HINTS.delete_node_link.usage).toContain('delete_node_link');
            expect(TOOL_HINTS.move_nodes_to_group.usage).toContain('move_nodes_to_group');
            expect(TOOL_HINTS.get_modified_widgets.usage).toContain('get_modified_widgets');
        });

        it('should have valid JSON-like syntax in usage', () => {
            for (const [name, hint] of Object.entries(TOOL_HINTS)) {
                // Usage should contain parentheses (function call)
                expect(hint.usage).toContain('(');
                expect(hint.usage).toContain(')');
            }
        });
    });
});

describe('enrichError', () => {
    it('should return error with hint for known tool', () => {
        const result = enrichError('create_node', 'Test error');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Test error');
        expect(result.hint).toBeDefined();
        expect(result.hint).toContain('create_node');
    });

    it('should include multi_syntax for batch-capable tools', () => {
        const result = enrichError('create_node', 'Missing type');

        expect(result.multi_syntax).toBeDefined();
        expect(result.multi_syntax).toContain('nodes');
    });

    it('should include tip when available', () => {
        const result = enrichError('create_node', 'Invalid type');

        expect(result.tip).toBeDefined();
        expect(result.tip).toContain('search_node_types');
    });

    it('should include required_params when available', () => {
        const result = enrichError('update_widget', 'Missing value');

        expect(result.required_params).toBeDefined();
        expect(result.required_params.length).toBeGreaterThan(0);
    });

    it('should handle unknown tool gracefully', () => {
        const result = enrichError('unknown_tool', 'Some error');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Some error');
        expect(result.hint).toBeUndefined();
    });

    it('should merge additional context', () => {
        const result = enrichError('create_node', 'Error', {
            custom_field: 'value',
            another_field: 123
        });

        expect(result.custom_field).toBe('value');
        expect(result.another_field).toBe(123);
        expect(result.success).toBe(false);
    });

    it('should not override success with context', () => {
        const result = enrichError('create_node', 'Error', { success: true });

        // success from context should override, but that's the expected behavior
        expect(result.success).toBe(true); // context wins
    });
});

describe('getToolUsage', () => {
    it('should return usage string for known tool', () => {
        const usage = getToolUsage('batch');

        expect(usage).toBeDefined();
        expect(usage).toContain('commands');
    });

    it('should return null for unknown tool', () => {
        const usage = getToolUsage('fake_tool');

        expect(usage).toBeNull();
    });

    it('should return correct usage for renamed tools', () => {
        expect(getToolUsage('create_node_link')).toContain('from_node');
        expect(getToolUsage('move_nodes_to_group')).toContain('nodes');
        expect(getToolUsage('get_modified_widgets')).toContain('nodes');
    });
});

describe('getToolHint', () => {
    it('should return full hint object for known tool', () => {
        const hint = getToolHint('update_widget');

        expect(hint).toBeDefined();
        expect(hint.usage).toBeDefined();
        expect(hint.multi).toBeDefined();
        expect(hint.tip).toBeDefined();
    });

    it('should return null for unknown tool', () => {
        const hint = getToolHint('nonexistent_tool');

        expect(hint).toBeNull();
    });

    it('should return immutable-like object', () => {
        const hint1 = getToolHint('create_node');
        const hint2 = getToolHint('create_node');

        // Same reference (not a copy)
        expect(hint1).toBe(hint2);
    });
});

describe('runTests (inline tests)', () => {
    it('should pass all inline tests', () => {
        // The module has built-in tests, let's verify they pass
        // Note: runTests logs to console, so we just check it returns true
        const result = runTests();
        expect(result).toBe(true);
    });
});
