/**
 * Ref Resolver Tests
 *
 * Tests for the ref_resolver.js module which provides:
 * - $ref registration and lookup
 * - Deep parameter resolution
 * - Validation of ref format
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RefResolver } from '../../web/js/ref_resolver.js';

describe('RefResolver', () => {
    let resolver;

    beforeEach(() => {
        resolver = new RefResolver();
    });

    describe('isValidRef', () => {
        it('should accept valid $ref strings', () => {
            expect(resolver.isValidRef('$sampler')).toBe(true);
            expect(resolver.isValidRef('$node1')).toBe(true);
            expect(resolver.isValidRef('$my_node')).toBe(true);
            expect(resolver.isValidRef('$MyNode123')).toBe(true);
        });

        it('should reject invalid refs', () => {
            expect(resolver.isValidRef('sampler')).toBe(false);
            expect(resolver.isValidRef('$')).toBe(false);
            expect(resolver.isValidRef('')).toBe(false);
            expect(resolver.isValidRef(null)).toBe(false);
            expect(resolver.isValidRef(undefined)).toBe(false);
            expect(resolver.isValidRef(123)).toBe(false);
            expect(resolver.isValidRef('$node with spaces')).toBe(false);
        });

        it('should handle edge cases', () => {
            expect(resolver.isValidRef('$$double')).toBe(false);
            expect(resolver.isValidRef('node$')).toBe(false);
            expect(resolver.isValidRef('$ leadingSpace')).toBe(false);
        });
    });

    describe('register', () => {
        it('should register a ref to node ID', () => {
            resolver.register('$sampler', 5);

            expect(resolver.has('$sampler')).toBe(true);
            expect(resolver.get('$sampler')).toBe(5);
        });

        it('should allow multiple registrations', () => {
            resolver.register('$a', 1);
            resolver.register('$b', 2);
            resolver.register('$c', 3);

            expect(resolver.size).toBe(3);
            expect(resolver.get('$a')).toBe(1);
            expect(resolver.get('$b')).toBe(2);
            expect(resolver.get('$c')).toBe(3);
        });

        it('should throw on duplicate registration', () => {
            resolver.register('$node', 1);

            expect(() => resolver.register('$node', 2)).toThrow(/Duplicate/);
            // Original value should remain
            expect(resolver.get('$node')).toBe(1);
            expect(resolver.size).toBe(1);
        });

        it('should handle string node IDs', () => {
            resolver.register('$node', '123');

            expect(resolver.get('$node')).toBe('123');
        });
    });

    describe('resolve', () => {
        beforeEach(() => {
            resolver.register('$sampler', 5);
            resolver.register('$decoder', 10);
        });

        it('should resolve registered refs', () => {
            expect(resolver.resolve('$sampler')).toBe(5);
            expect(resolver.resolve('$decoder')).toBe(10);
        });

        it('should pass through numeric IDs', () => {
            expect(resolver.resolve(42)).toBe(42);
            expect(resolver.resolve(0)).toBe(0);
        });

        it('should parse numeric strings to numbers', () => {
            expect(resolver.resolve('42')).toBe(42);
            expect(resolver.resolve('0')).toBe(0);
        });

        it('should throw for unregistered refs', () => {
            expect(() => resolver.resolve('$unknown')).toThrow();
        });

        it('should pass through non-ref strings', () => {
            expect(resolver.resolve('regular_string')).toBe('regular_string');
        });
    });

    describe('resolveParams', () => {
        beforeEach(() => {
            resolver.register('$a', 1);
            resolver.register('$b', 2);
            resolver.register('$c', 3);
        });

        it('should resolve refs in flat object', () => {
            const params = { node: '$a', value: 100 };
            const resolved = resolver.resolveParams(params);

            expect(resolved.node).toBe(1);
            expect(resolved.value).toBe(100);
        });

        it('should resolve refs in arrays', () => {
            const params = { nodes: ['$a', '$b', '$c'] };
            const resolved = resolver.resolveParams(params);

            expect(resolved.nodes).toEqual([1, 2, 3]);
        });

        it('should resolve refs in nested objects', () => {
            const params = {
                links: [
                    { from: '$a', to: '$b' },
                    { from: '$b', to: '$c' }
                ]
            };
            const resolved = resolver.resolveParams(params);

            expect(resolved.links[0].from).toBe(1);
            expect(resolved.links[0].to).toBe(2);
            expect(resolved.links[1].from).toBe(2);
            expect(resolved.links[1].to).toBe(3);
        });

        it('should preserve non-ref values', () => {
            const params = {
                node: '$a',
                widget: 'steps',
                value: 30,
                enabled: true,
                options: null
            };
            const resolved = resolver.resolveParams(params);

            expect(resolved.node).toBe(1);
            expect(resolved.widget).toBe('steps');
            expect(resolved.value).toBe(30);
            expect(resolved.enabled).toBe(true);
            expect(resolved.options).toBe(null);
        });

        it('should handle deeply nested structures', () => {
            const params = {
                level1: {
                    level2: {
                        level3: {
                            node: '$a'
                        }
                    }
                }
            };
            const resolved = resolver.resolveParams(params);

            expect(resolved.level1.level2.level3.node).toBe(1);
        });

        it('should handle mixed arrays', () => {
            const params = {
                items: ['$a', 100, '$b', 'text', '$c']
            };
            const resolved = resolver.resolveParams(params);

            expect(resolved.items).toEqual([1, 100, 2, 'text', 3]);
        });

        it('should resolve node ID fields but not touch non-ref strings', () => {
            // The resolver resolves all $refs - non-node-id fields should use plain strings
            const params = {
                from_node: '$a',
                to_node: '$b',
                widget_name: 'steps'  // Plain string, not a $ref
            };

            // resolveParams uses isNodeIdField to determine what to resolve
            const resolved = resolver.resolveParams(params);

            expect(resolved.from_node).toBe(1);
            expect(resolved.to_node).toBe(2);
            // widget_name is a plain string and should pass through unchanged
            expect(resolved.widget_name).toBe('steps');
        });
    });

    describe('isNodeIdField', () => {
        it('should identify node ID field names', () => {
            expect(resolver.isNodeIdField('node')).toBe(true);
            expect(resolver.isNodeIdField('node_id')).toBe(true);
            expect(resolver.isNodeIdField('from_node')).toBe(true);
            expect(resolver.isNodeIdField('to_node')).toBe(true);
            expect(resolver.isNodeIdField('from')).toBe(true);
            expect(resolver.isNodeIdField('to')).toBe(true);
        });

        it('should reject non-node fields', () => {
            expect(resolver.isNodeIdField('widget')).toBe(false);
            expect(resolver.isNodeIdField('value')).toBe(false);
            expect(resolver.isNodeIdField('title')).toBe(false);
            expect(resolver.isNodeIdField('color')).toBe(false);
        });
    });

    describe('listRefs', () => {
        it('should return string listing all refs', () => {
            resolver.register('$a', 1);
            resolver.register('$b', 2);
            resolver.register('$c', 3);

            const refs = resolver.listRefs();

            expect(refs).toContain('$a=1');
            expect(refs).toContain('$b=2');
            expect(refs).toContain('$c=3');
        });

        it('should return "(none)" when no refs', () => {
            const refs = resolver.listRefs();

            expect(refs).toBe('(none)');
        });
    });

    describe('clear', () => {
        it('should remove all refs', () => {
            resolver.register('$a', 1);
            resolver.register('$b', 2);

            resolver.clear();

            expect(resolver.size).toBe(0);
            expect(resolver.has('$a')).toBe(false);
            expect(resolver.has('$b')).toBe(false);
        });
    });

    describe('size', () => {
        it('should return correct count', () => {
            expect(resolver.size).toBe(0);

            resolver.register('$a', 1);
            expect(resolver.size).toBe(1);

            resolver.register('$b', 2);
            expect(resolver.size).toBe(2);

            resolver.clear();
            expect(resolver.size).toBe(0);
        });
    });

    describe('has and get', () => {
        it('should check ref existence', () => {
            resolver.register('$existing', 42);

            expect(resolver.has('$existing')).toBe(true);
            expect(resolver.has('$nonexistent')).toBe(false);
        });

        it('should get ref value', () => {
            resolver.register('$node', 123);

            expect(resolver.get('$node')).toBe(123);
            expect(resolver.get('$unknown')).toBeUndefined();
        });
    });

    describe('runTests (inline tests)', () => {
        it('should pass all inline tests', () => {
            const result = RefResolver.runTests();
            expect(result).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle circular references gracefully', () => {
            // Not actually circular since refs can't reference each other
            resolver.register('$a', 1);

            const params = {
                node: '$a',
                nested: {
                    also_node: '$a'
                }
            };

            const resolved = resolver.resolveParams(params);

            expect(resolved.node).toBe(1);
            expect(resolved.nested.also_node).toBe(1);
        });

        it('should handle empty params', () => {
            expect(resolver.resolveParams({})).toEqual({});
            expect(resolver.resolveParams(null)).toBe(null);
            expect(resolver.resolveParams(undefined)).toBe(undefined);
        });

        it('should handle primitive values', () => {
            expect(resolver.resolveParams(42)).toBe(42);
            expect(resolver.resolveParams('text')).toBe('text');
            expect(resolver.resolveParams(true)).toBe(true);
        });
    });
});
