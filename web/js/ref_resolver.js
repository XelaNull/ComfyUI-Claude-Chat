/**
 * RefResolver - Manages $ref references for cross-tool node referencing
 *
 * Phase 2 of Agent Tools architecture.
 *
 * Allows Claude to assign names to created nodes and reference them in
 * subsequent tool calls within the same response, eliminating the need
 * for round-trips to get node IDs.
 *
 * Example:
 *   {"tool": "create_node", "nodes": [{"type": "KSampler", "ref": "$sampler"}]}
 *   {"tool": "create_link", "links": [{"from": 1, "to": "$sampler", ...}]}
 *
 * The RefResolver resolves "$sampler" to the actual node ID (e.g., 7) before
 * the create_link tool executes.
 */

// Valid $ref pattern: starts with $, followed by letter or underscore,
// then any alphanumeric or underscore characters
const REF_PATTERN = /^\$[a-zA-Z_][a-zA-Z0-9_]*$/;

class RefResolver {
    constructor() {
        // Map of ref names (without $) to node IDs
        this.refs = new Map();
    }

    /**
     * Register a $ref name to a node ID
     * @param {string} ref - The reference name (e.g., "$sampler")
     * @param {number} nodeId - The node ID to associate
     * @throws {Error} If ref is invalid or already registered
     */
    register(ref, nodeId) {
        if (!this.isValidRef(ref)) {
            throw new Error(`Invalid $ref name: "${ref}". Must match pattern: $[a-zA-Z_][a-zA-Z0-9_]*`);
        }

        if (this.refs.has(ref)) {
            throw new Error(`Duplicate $ref: "${ref}" is already registered to node ${this.refs.get(ref)}`);
        }

        this.refs.set(ref, nodeId);
        console.log(`[RefResolver] Registered ${ref} -> node ${nodeId}`);
    }

    /**
     * Check if a string is a valid $ref name
     * @param {string} ref - The reference to validate
     * @returns {boolean}
     */
    isValidRef(ref) {
        return typeof ref === 'string' && REF_PATTERN.test(ref);
    }

    /**
     * Resolve a $ref or pass through a numeric ID
     * @param {string|number} refOrId - Either a $ref string or a node ID
     * @returns {number} The resolved node ID
     * @throws {Error} If ref is not found
     */
    resolve(refOrId) {
        // Numbers pass through unchanged
        if (typeof refOrId === 'number') {
            return refOrId;
        }

        // Non-string non-number? Return as-is (shouldn't happen)
        if (typeof refOrId !== 'string') {
            return refOrId;
        }

        // If it doesn't start with $, try to parse as number or return as-is
        if (!refOrId.startsWith('$')) {
            const num = parseInt(refOrId, 10);
            return isNaN(num) ? refOrId : num;
        }

        // It's a $ref - look it up
        if (!this.refs.has(refOrId)) {
            throw new Error(`Unresolved $ref: "${refOrId}". Available refs: ${this.listRefs()}`);
        }

        return this.refs.get(refOrId);
    }

    /**
     * Resolve all $refs in a params object (deep resolution)
     * @param {*} params - The parameters to resolve (object, array, or primitive)
     * @returns {*} The resolved parameters
     */
    resolveParams(params) {
        if (params === null || params === undefined) {
            return params;
        }

        // String - might be a $ref
        if (typeof params === 'string') {
            if (params.startsWith('$')) {
                return this.resolve(params);
            }
            return params;
        }

        // Number or other primitive - pass through
        if (typeof params !== 'object') {
            return params;
        }

        // Array - resolve each element
        if (Array.isArray(params)) {
            return params.map(item => this.resolveParams(item));
        }

        // Object - resolve each value (but not keys)
        const resolved = {};
        for (const [key, value] of Object.entries(params)) {
            // Special handling for known node ID fields
            if (this.isNodeIdField(key) && typeof value === 'string' && value.startsWith('$')) {
                resolved[key] = this.resolve(value);
            } else {
                resolved[key] = this.resolveParams(value);
            }
        }
        return resolved;
    }

    /**
     * Check if a field name typically contains a node ID
     * @param {string} fieldName - The field name to check
     * @returns {boolean}
     */
    isNodeIdField(fieldName) {
        const nodeIdFields = [
            'node', 'node_id', 'nodeId',
            'from', 'from_node', 'from_node_id', 'fromNode', 'fromNodeId',
            'to', 'to_node', 'to_node_id', 'toNode', 'toNodeId',
            'source', 'target', 'source_node', 'target_node'
        ];
        return nodeIdFields.includes(fieldName);
    }

    /**
     * List all registered refs (for error messages)
     * @returns {string}
     */
    listRefs() {
        if (this.refs.size === 0) {
            return '(none)';
        }
        return Array.from(this.refs.entries())
            .map(([ref, id]) => `${ref}=${id}`)
            .join(', ');
    }

    /**
     * Check if a ref is registered
     * @param {string} ref - The ref to check
     * @returns {boolean}
     */
    has(ref) {
        return this.refs.has(ref);
    }

    /**
     * Get the node ID for a ref without throwing
     * @param {string} ref - The ref to get
     * @returns {number|undefined}
     */
    get(ref) {
        return this.refs.get(ref);
    }

    /**
     * Clear all registered refs (call at start of each Claude response)
     */
    clear() {
        console.log(`[RefResolver] Clearing ${this.refs.size} refs`);
        this.refs.clear();
    }

    /**
     * Get the count of registered refs
     * @returns {number}
     */
    get size() {
        return this.refs.size;
    }
}

// ============================================================================
// INLINE TESTS (run in browser console to verify)
// ============================================================================

/**
 * Run inline tests - call RefResolver.runTests() in browser console
 */
RefResolver.runTests = function() {
    console.log('=== RefResolver Tests ===');
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

    // Test 1: Basic registration and resolution
    test('Basic registration and resolution', () => {
        const r = new RefResolver();
        r.register('$sampler', 5);
        assert(r.resolve('$sampler') === 5, 'Should resolve to 5');
    });

    // Test 2: Number passthrough
    test('Number passthrough', () => {
        const r = new RefResolver();
        assert(r.resolve(7) === 7, 'Numbers should pass through');
        assert(r.resolve(0) === 0, 'Zero should pass through');
    });

    // Test 3: Invalid ref format
    test('Invalid ref format throws', () => {
        const r = new RefResolver();
        let threw = false;
        try {
            r.register('sampler', 5); // Missing $
        } catch (e) {
            threw = true;
        }
        assert(threw, 'Should throw for invalid ref');
    });

    // Test 4: Duplicate ref throws
    test('Duplicate ref throws', () => {
        const r = new RefResolver();
        r.register('$sampler', 5);
        let threw = false;
        try {
            r.register('$sampler', 6);
        } catch (e) {
            threw = true;
        }
        assert(threw, 'Should throw for duplicate ref');
    });

    // Test 5: Unresolved ref throws
    test('Unresolved ref throws', () => {
        const r = new RefResolver();
        let threw = false;
        try {
            r.resolve('$unknown');
        } catch (e) {
            threw = true;
        }
        assert(threw, 'Should throw for unresolved ref');
    });

    // Test 6: Deep object resolution
    test('Deep object resolution', () => {
        const r = new RefResolver();
        r.register('$ckpt', 1);
        r.register('$sampler', 5);

        const resolved = r.resolveParams({
            from: '$ckpt',
            from_slot: 0,
            to: '$sampler',
            to_slot: 0
        });

        assert(resolved.from === 1, 'from should resolve to 1');
        assert(resolved.from_slot === 0, 'from_slot should stay 0');
        assert(resolved.to === 5, 'to should resolve to 5');
        assert(resolved.to_slot === 0, 'to_slot should stay 0');
    });

    // Test 7: Array resolution
    test('Array resolution', () => {
        const r = new RefResolver();
        r.register('$a', 1);
        r.register('$b', 2);

        const resolved = r.resolveParams({
            nodes: ['$a', '$b', 3]
        });

        assert(resolved.nodes[0] === 1, 'First element should resolve');
        assert(resolved.nodes[1] === 2, 'Second element should resolve');
        assert(resolved.nodes[2] === 3, 'Third element should stay as number');
    });

    // Test 8: Nested object resolution
    test('Nested object resolution', () => {
        const r = new RefResolver();
        r.register('$node', 5);

        const resolved = r.resolveParams({
            links: [
                { from: '$node', from_slot: 0, to: 6, to_slot: 0 }
            ]
        });

        assert(resolved.links[0].from === 5, 'Nested from should resolve');
        assert(resolved.links[0].to === 6, 'Nested to should stay as number');
    });

    // Test 9: Clear resets state
    test('Clear resets state', () => {
        const r = new RefResolver();
        r.register('$test', 5);
        assert(r.size === 1, 'Should have 1 ref');
        r.clear();
        assert(r.size === 0, 'Should have 0 refs after clear');
    });

    // Test 10: Valid ref patterns
    test('Valid ref patterns', () => {
        const r = new RefResolver();
        assert(r.isValidRef('$a'), '$a should be valid');
        assert(r.isValidRef('$_test'), '$_test should be valid');
        assert(r.isValidRef('$sampler'), '$sampler should be valid');
        assert(r.isValidRef('$node_1'), '$node_1 should be valid');
        assert(r.isValidRef('$CamelCase'), '$CamelCase should be valid');
        assert(!r.isValidRef('$123'), '$123 should be invalid (starts with number)');
        assert(!r.isValidRef('sampler'), 'sampler should be invalid (no $)');
        assert(!r.isValidRef('$'), '$ alone should be invalid');
        assert(!r.isValidRef(''), 'empty should be invalid');
    });

    console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
    return failed === 0;
};

// Export for ES modules
export { RefResolver };
