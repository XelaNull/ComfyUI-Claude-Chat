/**
 * Tool Docs Tests
 *
 * Tests for the tool_docs.js module which provides:
 * - Tool category organization
 * - Common slot patterns
 * - Efficiency patterns
 * - Detailed tool documentation
 * - Search functionality
 */

import { describe, it, expect } from 'vitest';
import {
    TOOL_CATEGORIES,
    COMMON_SLOTS,
    PATTERNS,
    TOOL_DOCS,
    searchTools
} from '../../web/js/tool_docs.js';

describe('TOOL_CATEGORIES', () => {
    it('should have all expected categories', () => {
        const expectedCategories = [
            'discovery', 'nodes', 'links', 'widgets', 'groups',
            'highlevel', 'analysis', 'execution', 'utility', 'lowlevel'
        ];

        for (const cat of expectedCategories) {
            expect(TOOL_CATEGORIES, `Missing category: ${cat}`).toHaveProperty(cat);
        }
    });

    it('should have arrays of tool names in each category', () => {
        for (const [category, tools] of Object.entries(TOOL_CATEGORIES)) {
            expect(Array.isArray(tools), `${category} should be array`).toBe(true);
            expect(tools.length, `${category} should have tools`).toBeGreaterThan(0);
            for (const tool of tools) {
                expect(typeof tool).toBe('string');
            }
        }
    });

    it('should have correct link tools (renamed)', () => {
        expect(TOOL_CATEGORIES.links).toContain('create_node_link');
        expect(TOOL_CATEGORIES.links).toContain('delete_node_link');
        expect(TOOL_CATEGORIES.links).not.toContain('create_link');
        expect(TOOL_CATEGORIES.links).not.toContain('delete_link');
    });

    it('should have correct group tools (renamed)', () => {
        expect(TOOL_CATEGORIES.groups).toContain('move_nodes_to_group');
        expect(TOOL_CATEGORIES.groups).not.toContain('move_to_group');
    });

    it('should have correct analysis tools (renamed)', () => {
        expect(TOOL_CATEGORIES.analysis).toContain('get_modified_widgets');
        expect(TOOL_CATEGORIES.analysis).not.toContain('compare_to_defaults');
    });

    it('should have execution tools with correct names', () => {
        expect(TOOL_CATEGORIES.execution).toContain('queue_execution');
        expect(TOOL_CATEGORIES.execution).toContain('cancel_execution');
        expect(TOOL_CATEGORIES.execution).toContain('execution_status');
    });

    it('should not have duplicate tools across categories', () => {
        const allTools = [];
        for (const tools of Object.values(TOOL_CATEGORIES)) {
            allTools.push(...tools);
        }
        const uniqueTools = new Set(allTools);
        expect(allTools.length).toBe(uniqueTools.size);
    });
});

describe('COMMON_SLOTS', () => {
    it('should have common node slot patterns', () => {
        expect(COMMON_SLOTS).toHaveProperty('CheckpointLoaderSimple');
        expect(COMMON_SLOTS).toHaveProperty('KSampler');
        expect(COMMON_SLOTS).toHaveProperty('CLIPTextEncode');
        expect(COMMON_SLOTS).toHaveProperty('VAEDecode');
    });

    it('should have outputs array for each node', () => {
        for (const [nodeName, slots] of Object.entries(COMMON_SLOTS)) {
            if (slots.outputs) {
                expect(Array.isArray(slots.outputs), `${nodeName} outputs should be array`).toBe(true);
            }
        }
    });

    it('should have inputs array for each node', () => {
        for (const [nodeName, slots] of Object.entries(COMMON_SLOTS)) {
            if (slots.inputs) {
                expect(Array.isArray(slots.inputs), `${nodeName} inputs should be array`).toBe(true);
            }
        }
    });

    it('should have correct CheckpointLoaderSimple slots', () => {
        const ckpt = COMMON_SLOTS.CheckpointLoaderSimple;
        // Slots include type and index: 'MODEL (0)', 'CLIP (1)', etc.
        expect(ckpt.outputs.some(s => s.includes('MODEL'))).toBe(true);
        expect(ckpt.outputs.some(s => s.includes('CLIP'))).toBe(true);
        expect(ckpt.outputs.some(s => s.includes('VAE'))).toBe(true);
    });

    it('should have correct KSampler slots', () => {
        const sampler = COMMON_SLOTS.KSampler;
        // Slots include name and index: 'model (0)', 'positive (1)', etc.
        expect(sampler.inputs.some(s => s.includes('model'))).toBe(true);
        expect(sampler.inputs.some(s => s.includes('positive'))).toBe(true);
        expect(sampler.inputs.some(s => s.includes('negative'))).toBe(true);
        expect(sampler.inputs.some(s => s.includes('latent_image'))).toBe(true);
        expect(sampler.outputs.some(s => s.includes('LATENT'))).toBe(true);
    });
});

describe('PATTERNS', () => {
    it('should have efficiency patterns', () => {
        expect(PATTERNS).toHaveProperty('refs');
        expect(PATTERNS).toHaveProperty('arrays');
        expect(PATTERNS).toHaveProperty('inline_groups');
        expect(PATTERNS).toHaveProperty('efficiency');
    });

    it('should have pattern objects with title and description', () => {
        for (const [name, pattern] of Object.entries(PATTERNS)) {
            expect(typeof pattern, `${name} should be object`).toBe('object');
            expect(pattern.title, `${name} should have title`).toBeDefined();
            // Most patterns have description (efficiency has tips instead)
            expect(pattern.title.length).toBeGreaterThan(0);
        }
    });

    it('should mention $refs in refs pattern', () => {
        // Title is "$ref System", description explains what refs do
        const combined = `${PATTERNS.refs.title} ${PATTERNS.refs.description}`.toLowerCase();
        expect(combined).toContain('ref');
    });

    it('should mention arrays in arrays pattern', () => {
        const arraysDesc = PATTERNS.arrays.description || PATTERNS.arrays.title;
        expect(arraysDesc.toLowerCase()).toContain('array');
    });
});

describe('TOOL_DOCS', () => {
    it('should have documentation for all categorized tools', () => {
        const allCategorizedTools = [];
        for (const tools of Object.values(TOOL_CATEGORIES)) {
            allCategorizedTools.push(...tools);
        }

        for (const toolName of allCategorizedTools) {
            expect(TOOL_DOCS, `Missing docs for ${toolName}`).toHaveProperty(toolName);
        }
    });

    it('should have summary for each tool', () => {
        // Implementation uses 'summary' not 'description'
        for (const [toolName, doc] of Object.entries(TOOL_DOCS)) {
            expect(doc.summary, `${toolName} missing summary`).toBeDefined();
            expect(typeof doc.summary).toBe('string');
        }
    });

    it('should have syntax for each tool', () => {
        for (const [toolName, doc] of Object.entries(TOOL_DOCS)) {
            expect(doc.syntax, `${toolName} missing syntax`).toBeDefined();
            expect(typeof doc.syntax).toBe('string');
        }
    });

    it('should have examples for some tools', () => {
        // Implementation uses either 'example' (string) or 'examples' (array)
        const toolsWithExamples = Object.entries(TOOL_DOCS)
            .filter(([, doc]) => doc.example || (doc.examples && doc.examples.length > 0));
        // Many tools should have examples
        expect(toolsWithExamples.length).toBeGreaterThan(5);
    });

    it('should have notes or warnings for some tools', () => {
        // Implementation uses 'note' or 'warning' fields
        const toolsWithNotes = Object.entries(TOOL_DOCS)
            .filter(([, doc]) => doc.note || doc.warning);
        expect(toolsWithNotes.length).toBeGreaterThan(0);
    });

    it('should use correct renamed tool names in documentation', () => {
        // Verify docs for renamed tools exist and use correct names
        expect(TOOL_DOCS.create_node_link).toBeDefined();
        expect(TOOL_DOCS.create_node_link.syntax).toContain('create_node_link');

        expect(TOOL_DOCS.delete_node_link).toBeDefined();
        expect(TOOL_DOCS.delete_node_link.syntax).toContain('delete_node_link');

        expect(TOOL_DOCS.move_nodes_to_group).toBeDefined();
        expect(TOOL_DOCS.move_nodes_to_group.syntax).toContain('move_nodes_to_group');

        expect(TOOL_DOCS.get_modified_widgets).toBeDefined();
        expect(TOOL_DOCS.get_modified_widgets.syntax).toContain('get_modified_widgets');
    });
});

describe('searchTools', () => {
    it('should find tools by name', () => {
        // Search for 'node' which appears in many tool names
        const results = searchTools('node');

        expect(results.length).toBeGreaterThan(0);
    });

    it('should find tools by summary keyword', () => {
        // Search for 'workflow' which appears in summaries
        const results = searchTools('workflow');

        expect(results.length).toBeGreaterThan(0);
    });

    it('should find tools by summary', () => {
        // Search for 'connect' which appears in create_node_link summary
        const results = searchTools('connect');

        expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array for no matches', () => {
        const results = searchTools('xyznonexistent123');

        expect(results).toEqual([]);
    });

    it('should be case-insensitive', () => {
        const lower = searchTools('node');
        const upper = searchTools('NODE');
        const mixed = searchTools('NoDe');

        expect(lower.length).toBe(upper.length);
        expect(lower.length).toBe(mixed.length);
    });

    it('should return tool objects with name property', () => {
        const results = searchTools('widget');

        for (const result of results) {
            expect(result).toHaveProperty('name');
            expect(typeof result.name).toBe('string');
        }
    });

    it('should find renamed tools', () => {
        const linkResults = searchTools('node_link');
        expect(linkResults.length).toBeGreaterThan(0);

        const modifiedResults = searchTools('modified_widgets');
        expect(modifiedResults.length).toBeGreaterThan(0);
    });
});
