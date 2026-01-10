/**
 * Context Generator Tests
 *
 * Tests for the context_generator.js module which provides:
 * - Automatic workflow context generation
 * - Tiered detail levels
 * - Prompt Guard filtering
 * - Issue detection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetMocks, createMockNode, createMockGroup } from './setup.js';
import {
    ContextGenerator,
    CONTEXT_LEVELS,
    CONTEXT_LEVEL_ALIASES,
    TYPE_ABBREV
} from '../../web/js/context_generator.js';

describe('ContextGenerator', () => {
    let generator;

    beforeEach(() => {
        resetMocks();
        generator = new ContextGenerator();
    });

    describe('CONTEXT_LEVELS', () => {
        it('should have numeric level definitions', () => {
            expect(CONTEXT_LEVELS[1]).toBe(1);  // Compact
            expect(CONTEXT_LEVELS[2]).toBe(2);  // Standard
            expect(CONTEXT_LEVELS[3]).toBe(3);  // Full
        });
    });

    describe('CONTEXT_LEVEL_ALIASES', () => {
        it('should map string aliases to numeric levels', () => {
            expect(CONTEXT_LEVEL_ALIASES['minimal']).toBe(1);
            expect(CONTEXT_LEVEL_ALIASES['standard']).toBe(2);
            expect(CONTEXT_LEVEL_ALIASES['verbose']).toBe(3);
        });
    });

    describe('TYPE_ABBREV', () => {
        it('should have abbreviations for common types', () => {
            expect(TYPE_ABBREV).toHaveProperty('MODEL');
            expect(TYPE_ABBREV).toHaveProperty('CLIP');
            expect(TYPE_ABBREV).toHaveProperty('VAE');
            expect(TYPE_ABBREV).toHaveProperty('CONDITIONING');
            expect(TYPE_ABBREV).toHaveProperty('LATENT');
            expect(TYPE_ABBREV).toHaveProperty('IMAGE');
        });

        it('should have short abbreviations', () => {
            for (const [type, abbrev] of Object.entries(TYPE_ABBREV)) {
                expect(abbrev.length, `${type} abbreviation too long`).toBeLessThanOrEqual(4);
            }
        });
    });

    describe('selectLevel', () => {
        it('should select level 2 (standard) for small workflows', () => {
            // Implementation: <=10 nodes uses level 2
            expect(generator.selectLevel(0)).toBe(2);
            expect(generator.selectLevel(5)).toBe(2);
            expect(generator.selectLevel(10)).toBe(2);
        });

        it('should select level 1 (compact) for medium and large workflows', () => {
            // Implementation: >10 nodes uses level 1 (compact for token savings)
            expect(generator.selectLevel(15)).toBe(1);
            expect(generator.selectLevel(25)).toBe(1);
            expect(generator.selectLevel(50)).toBe(1);
        });
    });

    describe('generate', () => {
        it('should generate context string', () => {
            // Add some nodes to the graph
            const node1 = createMockNode(1, 'CheckpointLoaderSimple', [100, 100]);
            const node2 = createMockNode(2, 'KSampler', [300, 100]);
            globalThis.app.graph.add(node1);
            globalThis.app.graph.add(node2);

            const context = generator.generate();

            expect(typeof context).toBe('string');
            expect(context.length).toBeGreaterThan(0);
            // Format is now "[WORKFLOW STATE as of TIME]"
            expect(context).toContain('[WORKFLOW STATE');
        });

        it('should include node count', () => {
            const node1 = createMockNode(1, 'KSampler', [100, 100]);
            const node2 = createMockNode(2, 'VAEDecode', [300, 100]);
            globalThis.app.graph.add(node1);
            globalThis.app.graph.add(node2);

            const context = generator.generate();

            expect(context).toContain('2');
            expect(context).toContain('node');  // "2 nodes"
        });

        it('should include group information when groups exist', () => {
            // Add both a group AND a node so we don't get "Empty workflow"
            const node = createMockNode(1, 'KSampler', [100, 100]);
            const group = createMockGroup('Test Group', [50, 50], [200, 200]);
            globalThis.app.graph.add(node);
            globalThis.app.graph.add(group);

            const context = generator.generate();

            expect(context).toContain('Groups');
        });

        it('should respect Prompt Guard option', () => {
            const node = createMockNode(1, 'CLIPTextEncode', [100, 100]);
            node.widgets = [{ name: 'text', value: 'secret prompt text' }];
            globalThis.app.graph.add(node);

            const contextWithGuard = generator.generate({ promptGuardEnabled: true });
            const contextWithoutGuard = generator.generate({ promptGuardEnabled: false });

            // With guard, prompt text should be hidden
            expect(contextWithGuard).not.toContain('secret prompt text');
            // Without guard, it may be included (depends on level)
        });

        it('should handle empty workflow', () => {
            const context = generator.generate();

            expect(context).toContain('[WORKFLOW STATE]');
            // Empty workflow says "Empty workflow - no nodes."
            expect(context.toLowerCase()).toContain('no nodes');
        });
    });

    describe('getNodeSummary', () => {
        it('should summarize node with ID and type', () => {
            const node = createMockNode(5, 'KSampler', [100, 200]);

            const summary = generator.getNodeSummary(node, 2, false); // Level 2

            expect(summary).toContain('#5');
            expect(summary).toContain('KSampler');
        });

        it('should include position at level 3 (full)', () => {
            const node = createMockNode(1, 'KSampler', [150, 250]);

            const summary = generator.getNodeSummary(node, 3, false); // Level 3

            expect(summary).toContain('150');
            expect(summary).toContain('250');
        });

        it('should mark bypassed nodes', () => {
            const node = createMockNode(1, 'KSampler', [100, 100]);
            node.mode = 4; // bypassed

            const summary = generator.getNodeSummary(node, 2, false); // Level 2

            expect(summary.toUpperCase()).toContain('BYPASS');
        });

        it('should hide prompt text with Prompt Guard', () => {
            const node = createMockNode(1, 'CLIPTextEncode', [100, 100]);
            node.title = 'My Secret Prompt';
            node.widgets = [{ name: 'text', value: 'visible prompt text' }];

            const summaryGuarded = generator.getNodeSummary(node, 3, true); // Level 3 with guard

            expect(summaryGuarded).not.toContain('visible prompt text');
        });
    });

    describe('getNodeConnections', () => {
        it('should extract input connections', () => {
            const node = createMockNode(1, 'KSampler', [100, 100]);
            node.inputs = [
                { name: 'model', type: 'MODEL', link: 1 },
                { name: 'positive', type: 'CONDITIONING', link: null }
            ];
            // Add link to graph.links (required by getNodeConnections)
            globalThis.app.graph.links[1] = { origin_id: 5, origin_slot: 0, target_id: 1, target_slot: 0 };

            const connections = generator.getNodeConnections(node);

            expect(connections.inputs).toBeDefined();
            expect(connections.inputs.length).toBe(1); // Only connected inputs
        });

        it('should extract output connections', () => {
            const node = createMockNode(1, 'CheckpointLoaderSimple', [100, 100]);
            node.outputs = [
                { name: 'MODEL', type: 'MODEL', links: [1, 2] },
                { name: 'CLIP', type: 'CLIP', links: [] }
            ];
            // Add links to graph.links (required by getNodeConnections)
            globalThis.app.graph.links[1] = { origin_id: 1, origin_slot: 0, target_id: 3, target_slot: 0 };
            globalThis.app.graph.links[2] = { origin_id: 1, origin_slot: 0, target_id: 4, target_slot: 0 };

            const connections = generator.getNodeConnections(node);

            expect(connections.outputs).toBeDefined();
        });
    });

    describe('getGroupsSummary', () => {
        it('should return groups array', () => {
            const group = createMockGroup('Model Loading', [0, 0], [400, 300]);
            group.color = '#2A4858';
            globalThis.app.graph.add(group);

            const summary = generator.getGroupsSummary();

            expect(summary.groups).toBeDefined();
            expect(summary.groups.length).toBe(1);
            expect(summary.groups[0].title).toBe('Model Loading');
        });

        it('should identify ungrouped nodes', () => {
            const node = createMockNode(1, 'KSampler', [1000, 1000]); // Outside any group
            globalThis.app.graph.add(node);

            const summary = generator.getGroupsSummary();

            expect(summary.ungrouped).toBeDefined();
            expect(summary.ungrouped.length).toBeGreaterThan(0);
        });
    });

    describe('detectIssues', () => {
        it('should detect disconnected required inputs', () => {
            const node = createMockNode(1, 'KSampler', [100, 100]);
            node.inputs = [
                { name: 'model', type: 'MODEL', link: null }, // Required but not connected
                { name: 'positive', type: 'CONDITIONING', link: null }
            ];
            globalThis.app.graph.add(node);

            const issues = generator.detectIssues();

            expect(issues.length).toBeGreaterThan(0);
            expect(issues.some(i => i.type === 'missing_input')).toBe(true);
        });

        it('should return empty for valid workflow', () => {
            // Empty workflow has no issues
            const issues = generator.detectIssues();

            expect(issues).toEqual([]);
        });
    });

    describe('getModelsInUse', () => {
        it('should extract checkpoint from CheckpointLoaderSimple', () => {
            const node = createMockNode(1, 'CheckpointLoaderSimple', [100, 100]);
            node.widgets = [{ name: 'ckpt_name', value: 'dreamshaper_8.safetensors' }];
            globalThis.app.graph.add(node);

            const models = generator.getModelsInUse();

            expect(models.Checkpoint).toContain('dreamshaper_8.safetensors');
        });

        it('should extract LoRAs', () => {
            const node = createMockNode(1, 'LoraLoader', [100, 100]);
            node.type = 'LoraLoader';
            node.widgets = [{ name: 'lora_name', value: 'add_detail.safetensors' }];
            globalThis.app.graph.add(node);

            const models = generator.getModelsInUse();

            expect(models.LoRA?.length).toBeGreaterThan(0);
        });

        it('should handle multiple models', () => {
            const ckpt = createMockNode(1, 'CheckpointLoaderSimple', [100, 100]);
            ckpt.widgets = [{ name: 'ckpt_name', value: 'model1.safetensors' }];

            const lora1 = createMockNode(2, 'LoraLoader', [300, 100]);
            lora1.type = 'LoraLoader';
            lora1.widgets = [{ name: 'lora_name', value: 'lora1.safetensors' }];

            const lora2 = createMockNode(3, 'LoraLoader', [500, 100]);
            lora2.type = 'LoraLoader';
            lora2.widgets = [{ name: 'lora_name', value: 'lora2.safetensors' }];

            globalThis.app.graph.add(ckpt);
            globalThis.app.graph.add(lora1);
            globalThis.app.graph.add(lora2);

            const models = generator.getModelsInUse();

            expect(models.LoRA?.length).toBe(2);
        });
    });

    describe('getInstalledPacks', () => {
        it('should detect installed packs from node types', () => {
            // Add a node from a known pack
            const node = createMockNode(1, 'FaceDetailer', [100, 100]);
            node.type = 'FaceDetailer';
            globalThis.app.graph.add(node);

            const packs = generator.getInstalledPacks();

            // Should return an array (may be empty if pack not detected)
            expect(Array.isArray(packs)).toBe(true);
        });
    });

    describe('clearCache', () => {
        it('should clear cached data', () => {
            // Generate to populate cache
            generator.generate();

            // Clear
            generator.clearCache();

            // Should not throw
            const context = generator.generate();
            expect(context).toBeDefined();
        });
    });

    describe('setLevel', () => {
        it('should change the level', () => {
            generator.setLevel(3); // Full

            // This should affect subsequent generate calls
            const context = generator.generate();
            expect(context).toBeDefined();
        });

        it('should handle legacy string levels', () => {
            generator.setLevel('verbose'); // Legacy string alias for level 3

            expect(generator.level).toBe(3);
        });
    });

    describe('estimateTokens', () => {
        it('should return token estimate object', () => {
            const node = createMockNode(1, 'KSampler', [100, 100]);
            globalThis.app.graph.add(node);

            const estimate = generator.estimateTokens();

            expect(typeof estimate).toBe('object');
            expect(estimate.estimated_tokens).toBeGreaterThan(0);
            expect(estimate.node_count).toBe(1);
        });

        it('should handle empty workflow', () => {
            const estimate = generator.estimateTokens();

            expect(estimate.node_count).toBe(0);
            expect(estimate.estimated_tokens).toBeGreaterThanOrEqual(0);
        });
    });

    describe('runTests (inline tests)', () => {
        it('should pass all inline tests', () => {
            const result = ContextGenerator.runTests();
            expect(result).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle nodes with no widgets', () => {
            const node = createMockNode(1, 'VAEDecode', [100, 100]);
            node.widgets = [];
            globalThis.app.graph.add(node);

            const context = generator.generate();

            expect(context).toBeDefined();
            expect(context).toContain('VAEDecode');
        });

        it('should handle overlapping groups', () => {
            // Create overlapping groups (an issue to detect)
            const group1 = createMockGroup('Group A', [0, 0], [400, 400]);
            const group2 = createMockGroup('Group B', [200, 200], [400, 400]); // Overlaps with A

            globalThis.app.graph.add(group1);
            globalThis.app.graph.add(group2);

            const context = generator.generate();

            expect(context).toBeDefined();
        });

        it('should handle special characters in node titles', () => {
            const node = createMockNode(1, 'CLIPTextEncode', [100, 100]);
            node.title = 'Prompt with "quotes" and <brackets>';
            globalThis.app.graph.add(node);

            const context = generator.generate();

            expect(context).toBeDefined();
        });
    });
});
