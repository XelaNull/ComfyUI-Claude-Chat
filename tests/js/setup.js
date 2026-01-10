/**
 * Test Setup - Global mocks for ComfyUI environment
 *
 * This file sets up mocks for:
 * - LiteGraph (graph library)
 * - ComfyUI app (global app object)
 * - DOM APIs
 * - Fetch API
 * - LocalStorage
 */

import { vi } from 'vitest';

// ============================================================================
// LITEGRAPH MOCK
// ============================================================================

class MockLGraphNode {
    constructor(title) {
        this.id = Math.floor(Math.random() * 10000);
        this.title = title || 'Untitled';
        this.type = 'UnknownType';
        this.pos = [0, 0];
        this.size = [200, 100];
        this.mode = 0; // 0 = normal, 4 = bypassed
        this.widgets = [];
        this.inputs = [];
        this.outputs = [];
        this.properties = {};
        this.flags = {};
    }

    getInputInfo(slot) {
        return this.inputs[slot] || null;
    }

    getOutputInfo(slot) {
        return this.outputs[slot] || null;
    }

    getInputNode(slot) {
        return null; // Override in specific tests
    }

    getInputLink(slot) {
        return null;
    }

    connect(outputSlot, targetNode, inputSlot) {
        return true;
    }

    disconnectInput(slot) {
        return true;
    }

    disconnectOutput(slot) {
        return true;
    }
}

class MockLGraphGroup {
    constructor(title) {
        this.title = title || 'Group';
        this._pos = [0, 0];
        this._size = [400, 300];
        this._bounding = [0, 0, 400, 300];
        this.color = '#335566';
        this.font_size = 24;
    }

    get pos() { return this._pos; }
    set pos(v) { this._pos = v; }

    get size() { return this._size; }
    set size(v) { this._size = v; }

    get bounding() { return this._bounding; }
    set bounding(v) { this._bounding = v; }

    isPointInside(x, y) {
        return x >= this._pos[0] && x <= this._pos[0] + this._size[0] &&
               y >= this._pos[1] && y <= this._pos[1] + this._size[1];
    }

    recomputeInsideNodes() {
        // Mock implementation
    }
}

class MockLGraph {
    constructor() {
        this._nodes = [];
        this._groups = [];
        this.links = {};
        this._last_link_id = 0;
        this.list_of_graphcanvas = [];
    }

    add(nodeOrGroup) {
        if (nodeOrGroup instanceof MockLGraphGroup) {
            this._groups.push(nodeOrGroup);
        } else {
            nodeOrGroup.id = nodeOrGroup.id || this._nodes.length + 1;
            this._nodes.push(nodeOrGroup);
        }
        return nodeOrGroup;
    }

    remove(nodeOrGroup) {
        if (nodeOrGroup instanceof MockLGraphGroup) {
            const idx = this._groups.indexOf(nodeOrGroup);
            if (idx >= 0) this._groups.splice(idx, 1);
        } else {
            const idx = this._nodes.indexOf(nodeOrGroup);
            if (idx >= 0) this._nodes.splice(idx, 1);
        }
    }

    getNodeById(id) {
        return this._nodes.find(n => n.id === id) || null;
    }

    findNodesByType(type) {
        return this._nodes.filter(n => n.type === type);
    }

    serialize() {
        return {
            nodes: this._nodes.map(n => ({
                id: n.id,
                type: n.type,
                pos: n.pos,
                size: n.size,
                mode: n.mode,
                widgets_values: n.widgets?.map(w => w.value) || []
            })),
            groups: this._groups.map(g => ({
                title: g.title,
                bounding: g._bounding,
                color: g.color
            })),
            links: Object.values(this.links)
        };
    }

    setDirtyCanvas(fg, bg) {
        // Mock - triggers redraw
    }

    clear() {
        this._nodes = [];
        this._groups = [];
        this.links = {};
    }
}

globalThis.LiteGraph = {
    registered_node_types: {
        'KSampler': {
            type: 'KSampler',
            title: 'KSampler',
            category: 'sampling',
            input: [
                { name: 'model', type: 'MODEL' },
                { name: 'positive', type: 'CONDITIONING' },
                { name: 'negative', type: 'CONDITIONING' },
                { name: 'latent_image', type: 'LATENT' }
            ],
            output: [
                { name: 'LATENT', type: 'LATENT' }
            ],
            widgets: [
                { name: 'seed', type: 'number', value: 0 },
                { name: 'steps', type: 'number', value: 20 },
                { name: 'cfg', type: 'number', value: 8 },
                { name: 'sampler_name', type: 'combo', value: 'euler' },
                { name: 'scheduler', type: 'combo', value: 'normal' },
                { name: 'denoise', type: 'number', value: 1 }
            ]
        },
        'CheckpointLoaderSimple': {
            type: 'CheckpointLoaderSimple',
            title: 'Load Checkpoint',
            category: 'loaders',
            input: [],
            output: [
                { name: 'MODEL', type: 'MODEL' },
                { name: 'CLIP', type: 'CLIP' },
                { name: 'VAE', type: 'VAE' }
            ],
            widgets: [
                { name: 'ckpt_name', type: 'combo', value: 'model.safetensors' }
            ]
        },
        'CLIPTextEncode': {
            type: 'CLIPTextEncode',
            title: 'CLIP Text Encode',
            category: 'conditioning',
            input: [{ name: 'clip', type: 'CLIP' }],
            output: [{ name: 'CONDITIONING', type: 'CONDITIONING' }],
            widgets: [
                { name: 'text', type: 'string', value: '' }
            ]
        },
        'VAEDecode': {
            type: 'VAEDecode',
            title: 'VAE Decode',
            category: 'latent',
            input: [
                { name: 'samples', type: 'LATENT' },
                { name: 'vae', type: 'VAE' }
            ],
            output: [{ name: 'IMAGE', type: 'IMAGE' }],
            widgets: []
        },
        'SaveImage': {
            type: 'SaveImage',
            title: 'Save Image',
            category: 'image',
            input: [{ name: 'images', type: 'IMAGE' }],
            output: [],
            widgets: [
                { name: 'filename_prefix', type: 'string', value: 'ComfyUI' }
            ]
        }
    },
    createNode: (type) => {
        const nodeType = globalThis.LiteGraph.registered_node_types[type];
        const node = new MockLGraphNode(nodeType?.title || type);
        node.type = type;
        if (nodeType) {
            node.inputs = (nodeType.input || []).map((inp, i) => ({
                name: inp.name,
                type: inp.type,
                link: null,
                slot_index: i
            }));
            node.outputs = (nodeType.output || []).map((out, i) => ({
                name: out.name,
                type: out.type,
                links: [],
                slot_index: i
            }));
            node.widgets = (nodeType.widgets || []).map(w => ({
                name: w.name,
                type: w.type,
                value: w.value,
                options: w.options || {}
            }));
        }
        return node;
    },
    LGraphNode: MockLGraphNode,
    LGraphGroup: MockLGraphGroup,
    LGraph: MockLGraph
};

// ============================================================================
// COMFYUI APP MOCK
// ============================================================================

globalThis.app = {
    graph: new MockLGraph(),
    canvas: {
        ds: { scale: 1, offset: [0, 0] },
        setDirty: vi.fn(),
        draw: vi.fn()
    },
    menu: {
        settingsGroup: {
            element: document.createElement('div'),
            append: vi.fn()
        }
    },
    ui: {
        settings: {
            getSettingValue: vi.fn().mockReturnValue(null),
            setSettingValue: vi.fn()
        }
    },
    queuePrompt: vi.fn().mockResolvedValue({ prompt_id: 'test-prompt-123' }),
    loadGraphData: vi.fn(),
    extensions: [],
    registerExtension: vi.fn((ext) => {
        globalThis.app.extensions.push(ext);
        if (ext.setup) ext.setup();
    }),
    extensionManager: {
        extensions: []
    }
};

// ============================================================================
// FETCH MOCK
// ============================================================================

globalThis.fetch = vi.fn((url, options) => {
    // Default mock responses based on URL
    const responses = {
        '/claude-chat/status': {
            ok: true,
            json: () => Promise.resolve({
                has_api_key: true,
                has_max_plan: false,
                auth_method: 'anthropic_api'
            })
        },
        '/object_info': {
            ok: true,
            json: () => Promise.resolve(globalThis.LiteGraph.registered_node_types)
        },
        '/queue': {
            ok: true,
            json: () => Promise.resolve({
                queue_running: [],
                queue_pending: []
            })
        },
        '/history': {
            ok: true,
            json: () => Promise.resolve({})
        },
        '/interrupt': {
            ok: true,
            json: () => Promise.resolve({ success: true })
        }
    };

    const response = responses[url] || {
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' })
    };

    return Promise.resolve({
        ok: response.ok,
        status: response.status || 200,
        json: response.json,
        text: () => Promise.resolve(JSON.stringify(response.json()))
    });
});

// ============================================================================
// LOCALSTORAGE MOCK
// ============================================================================

const localStorageData = {};
globalThis.localStorage = {
    getItem: vi.fn((key) => localStorageData[key] || null),
    setItem: vi.fn((key, value) => { localStorageData[key] = value; }),
    removeItem: vi.fn((key) => { delete localStorageData[key]; }),
    clear: vi.fn(() => { Object.keys(localStorageData).forEach(k => delete localStorageData[k]); })
};

// ============================================================================
// DOM HELPERS
// ============================================================================

// Ensure document.body exists
if (!document.body) {
    document.body = document.createElement('body');
}

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Create a mock node with specified properties
 * @param {number} id - Node ID
 * @param {string} type - Node type
 * @param {number[]} pos - Position [x, y]
 * @returns {MockLGraphNode}
 */
export function createMockNode(id, type = 'KSampler', pos = [0, 0]) {
    const node = globalThis.LiteGraph.createNode(type);
    node.id = id;
    node.pos = pos;
    node.type = type;
    return node;
}

/**
 * Create a mock graph instance
 * @returns {MockLGraph}
 */
export function createMockGraph() {
    const graph = new MockLGraph();
    // Add commonly used mock methods
    graph.remove = vi.fn((nodeOrGroup) => {
        if (nodeOrGroup instanceof MockLGraphGroup) {
            const idx = graph._groups.indexOf(nodeOrGroup);
            if (idx >= 0) graph._groups.splice(idx, 1);
        } else {
            const idx = graph._nodes.indexOf(nodeOrGroup);
            if (idx >= 0) graph._nodes.splice(idx, 1);
        }
    });
    return graph;
}

/**
 * Create a mock group with specified properties
 * @param {string} title - Group title
 * @param {number[]} pos - Position [x, y]
 * @param {number[]} size - Size [width, height]
 * @returns {MockLGraphGroup}
 */
export function createMockGroup(title = 'Test Group', pos = [0, 0], size = [400, 300]) {
    const group = new MockLGraphGroup(title);
    group._pos = pos;
    group.pos = pos;
    group._size = size;
    group.size = size;
    return group;
}

/**
 * Reset all mocks to initial state
 */
export function resetMocks() {
    vi.clearAllMocks();
    globalThis.app.graph = createMockGraph();
    globalThis.localStorage.clear();
}

/**
 * Create a mock workflow with basic nodes connected
 * @returns {object} Workflow object
 */
export function createMockWorkflow() {
    const ckpt = createMockNode(1, 'CheckpointLoaderSimple', [50, 100]);
    const clip_pos = createMockNode(2, 'CLIPTextEncode', [350, 50]);
    const clip_neg = createMockNode(3, 'CLIPTextEncode', [350, 250]);
    const sampler = createMockNode(4, 'KSampler', [650, 150]);
    const vae = createMockNode(5, 'VAEDecode', [900, 200]);
    const save = createMockNode(6, 'SaveImage', [1150, 200]);

    return {
        nodes: [ckpt, clip_pos, clip_neg, sampler, vae, save],
        links: {
            1: { id: 1, origin_id: 1, origin_slot: 0, target_id: 4, target_slot: 0, type: 'MODEL' },
            2: { id: 2, origin_id: 1, origin_slot: 1, target_id: 2, target_slot: 0, type: 'CLIP' },
            3: { id: 3, origin_id: 1, origin_slot: 1, target_id: 3, target_slot: 0, type: 'CLIP' },
            4: { id: 4, origin_id: 2, origin_slot: 0, target_id: 4, target_slot: 1, type: 'CONDITIONING' },
            5: { id: 5, origin_id: 3, origin_slot: 0, target_id: 4, target_slot: 2, type: 'CONDITIONING' },
            6: { id: 6, origin_id: 4, origin_slot: 0, target_id: 5, target_slot: 0, type: 'LATENT' },
            7: { id: 7, origin_id: 1, origin_slot: 2, target_id: 5, target_slot: 1, type: 'VAE' },
            8: { id: 8, origin_id: 5, origin_slot: 0, target_id: 6, target_slot: 0, type: 'IMAGE' }
        }
    };
}

// Export mock classes for direct testing
export { MockLGraphNode, MockLGraphGroup, MockLGraph };
