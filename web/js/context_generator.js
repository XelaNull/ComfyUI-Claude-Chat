/**
 * ContextGenerator - Automatic workflow context for Claude Chat
 *
 * Phase 5 of Agent Tools architecture.
 *
 * Generates rich workflow state that is automatically injected with every
 * user message, eliminating the need for most inspection tool calls.
 *
 * Context includes:
 * - Node summaries (position, size, connections)
 * - Group information
 * - Data flow visualization
 * - Issue auto-detection
 * - Models currently in use
 */

import { app } from "../../../scripts/app.js";

// Import conditionally to avoid circular dependency issues
let protectedNodesManager = null;
async function getProtectedNodesManager() {
    if (!protectedNodesManager) {
        try {
            const module = await import("./lib/prompt_guard_manager.js");
            protectedNodesManager = module.protectedNodesManager;
        } catch (e) {
            console.warn('[ContextGenerator] Could not load protectedNodesManager:', e);
        }
    }
    return protectedNodesManager;
}

// =============================================================================
// Type Abbreviations - Reduces token usage in context output
// =============================================================================
const TYPE_ABBREV = {
    'MODEL': 'M',
    'CLIP': 'C',
    'VAE': 'V',
    'LATENT': 'L',
    'IMAGE': 'I',
    'CONDITIONING': 'CD',
    'CONTROL_NET': 'CN',
    'MASK': 'MK',
    'INT': 'i',
    'FLOAT': 'f',
    'STRING': 's',
    'BOOLEAN': 'b'
};

/**
 * Abbreviate a type name for compact display
 * @param {string} type - Full type name (e.g., "MODEL", "CONDITIONING")
 * @returns {string} Abbreviated type (e.g., "M", "CD") or first 3 chars if unknown
 */
function abbreviateType(type) {
    if (!type) return '?';
    const upper = type.toUpperCase();
    return TYPE_ABBREV[upper] || type.substring(0, 3);
}

// =============================================================================
// Context Levels - Tiered verbosity for token budget control
// =============================================================================
// Level 1: Compact (~150-250 tokens) - nodes with connections, no geometry
// Level 2: Standard (~350-500 tokens) - connections + group membership
// Level 3: Full (~800-2000 tokens) - geometry + widget values
const CONTEXT_LEVELS = {
    1: 1,  // Compact: nodes + connections, no pos/size
    2: 2,  // Standard: + group membership (default)
    3: 3   // Full: + geometry + widget values
};

// =============================================================================
// Conditioning Polarity Map - Determines which nodes are positive vs negative
// =============================================================================
// The ONLY reliable way to know if a CLIPTextEncode is positive or negative
// is to trace where it connects on the SAMPLER (the source of truth).
//
// This function builds a map: nodeId → 'POSITIVE' | 'NEGATIVE'
//
function buildConditioningPolarityMap() {
    if (!app?.graph) return new Map();

    const polarityMap = new Map();
    const links = app.graph.links || {};
    const nodes = app.graph._nodes || [];

    // Find all sampler nodes (authoritative source of polarity)
    const samplerNodes = nodes.filter(node => {
        const type = (node.type || '').toLowerCase();
        return type.includes('sampler') || type.includes('ksampler');
    });

    // For each sampler, trace its positive and negative inputs
    for (const sampler of samplerNodes) {
        if (!sampler.inputs) continue;

        for (const input of sampler.inputs) {
            const inputName = (input.name || '').toLowerCase();
            const isPositive = inputName.includes('positive') || inputName === 'pos';
            const isNegative = inputName.includes('negative') || inputName === 'neg';

            if (!isPositive && !isNegative) continue;
            if (!input.link) continue;

            const link = links[input.link];
            if (!link) continue;

            const sourceId = Array.isArray(link) ? link[1] : link.origin_id;
            if (sourceId == null) continue;

            // Mark this source node with its polarity
            const polarity = isPositive ? 'POSITIVE' : 'NEGATIVE';

            // Only set if not already set (first sampler connection wins)
            if (!polarityMap.has(sourceId)) {
                polarityMap.set(sourceId, polarity);
            }
        }
    }

    // Also check FaceDetailer and other nodes that have positive/negative inputs
    // These can help trace polarity for nodes that don't directly connect to samplers
    const detailerNodes = nodes.filter(node => {
        const type = (node.type || '').toLowerCase();
        return type.includes('detailer') || type.includes('detail');
    });

    for (const detailer of detailerNodes) {
        if (!detailer.inputs) continue;

        for (const input of detailer.inputs) {
            const inputName = (input.name || '').toLowerCase();
            const isPositive = inputName.includes('positive') || inputName === 'pos';
            const isNegative = inputName.includes('negative') || inputName === 'neg';

            if (!isPositive && !isNegative) continue;
            if (!input.link) continue;

            const link = links[input.link];
            if (!link) continue;

            const sourceId = Array.isArray(link) ? link[1] : link.origin_id;
            if (sourceId == null) continue;

            // Only set if not already set (sampler connections take precedence)
            if (!polarityMap.has(sourceId)) {
                const polarity = isPositive ? 'POSITIVE' : 'NEGATIVE';
                polarityMap.set(sourceId, polarity);
            }
        }
    }

    return polarityMap;
}

// Legacy aliases for backwards compatibility
const CONTEXT_LEVEL_ALIASES = {
    'minimal': 1,
    'standard': 2,
    'verbose': 3
};

class ContextGenerator {
    constructor() {
        this.sizeCache = new Map();
        this.level = 2; // Default to Level 2 (standard)
        this.isFirstMessage = true; // Track for static context optimization
    }

    /**
     * Auto-select context level based on workflow complexity
     * @param {number} nodeCount - Number of nodes in workflow
     * @returns {number} Recommended context level (1, 2, or 3)
     */
    selectLevel(nodeCount = null) {
        const count = nodeCount ?? (app?.graph?._nodes?.length || 0);
        if (count <= 10) return 2;  // Small: use standard detail
        if (count <= 30) return 1;  // Medium: use compact
        return 1;                    // Large: always compact
    }

    /**
     * Generate complete workflow context
     * @param {object} options - Generation options
     * @param {boolean} options.promptGuardEnabled - If true, hide prompt-related content
     * @param {number|string} options.level - Context level (1, 2, 3 or legacy string)
     * @param {boolean} options.includeStaticContext - Include installed packs (default: auto based on isFirstMessage)
     * @returns {string} Formatted context string
     */
    generate(options = {}) {
        try {
            if (!app?.graph) {
                return "[WORKFLOW STATE]\nNo workflow loaded.";
            }

            const nodes = app.graph._nodes || [];
            const groups = app.graph._groups || [];
            const promptGuard = options.promptGuardEnabled || false;

            // Get protected node IDs from manager (if available and prompt guard enabled)
            let protectedNodeIds = new Set();
            if (promptGuard && protectedNodesManager) {
                protectedNodeIds = protectedNodesManager.getProtectedNodeIds();
            }

            // Resolve level (handle legacy string values)
            let level = options.level ?? this.selectLevel(nodes.length);
            if (typeof level === 'string') {
                level = CONTEXT_LEVEL_ALIASES[level] || 2;
            }

            // Determine if we should include static context (packs)
            const includeStatic = options.includeStaticContext ?? this.isFirstMessage;

            if (nodes.length === 0) {
                return "[WORKFLOW STATE]\nEmpty workflow - no nodes.";
            }

            // Build polarity map ONCE for this context generation
            // This determines which CLIPTextEncode nodes are positive vs negative
            // by tracing their connections to samplers (the source of truth)
            this.polarityMap = buildConditioningPolarityMap();

            // Add timestamp to header
            const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
            const lines = [`[WORKFLOW STATE as of ${timestamp}]`];

            // Summary line with link count
            const linkCount = Object.keys(app.graph.links || {}).length;
            lines.push(`WORKFLOW: ${nodes.length} nodes, ${linkCount} links`);

            // Node details - format depends on level
            // Level 1: Compact (no geometry)
            // Level 2: Standard (no geometry, + group info inline)
            // Level 3: Full (geometry + widgets)
            for (const node of nodes) {
                // Use protectedNodeIds to determine if this specific node should be guarded
                const isProtected = promptGuard && protectedNodeIds.has(node.id);
                lines.push(this.getNodeSummary(node, level, isProtected));
            }

            // Groups - Level 2+ shows detailed group info, Level 1 just lists
            const groupSummaries = this.getGroupsSummary();
            if (groupSummaries.groups.length > 0) {
                lines.push("");
                if (level >= 2) {
                    lines.push(`Groups: ${groupSummaries.groups.length}`);
                    for (const g of groupSummaries.groups) {
                        // Level 3 includes bounds, Level 2 just title and nodes
                        if (level >= 3) {
                            lines.push(`  ${g.index}. "${g.title}" [${g.color}] bounds:(${g.x},${g.y}) size:(${g.width}x${g.height}) nodes:[${g.nodeIds.join(",")}]`);
                        } else {
                            lines.push(`  "${g.title}" nodes:[${g.nodeIds.join(",")}]`);
                        }
                    }
                } else {
                    // Level 1: Just group names
                    lines.push(`Groups: ${groupSummaries.groups.map(g => `"${g.title}"`).join(", ")}`);
                }
            }

            // Ungrouped nodes (Level 2+)
            if (level >= 2 && groupSummaries.ungrouped.length > 0) {
                lines.push(`Ungrouped: [${groupSummaries.ungrouped.join(",")}]`);
            }

            // Data flow (Level 2+)
            if (level >= 2) {
                const flow = this.getDataFlow();
                if (flow) {
                    lines.push("");
                    lines.push(`Flow: ${flow}`);
                }
            }

            // Issues (always shown - critical info)
            const issues = this.detectIssues();
            if (issues.length > 0) {
                lines.push("");
                lines.push("Issues:");
                for (const issue of issues) {
                    lines.push(`  ⚠ ${this.formatIssue(issue)}`);
                }
            }

            // Models in use (Level 2+)
            if (level >= 2) {
                const models = this.getModelsInUse();
                if (Object.keys(models).length > 0) {
                    lines.push("");
                    lines.push("Models: " + Object.entries(models).map(([type, names]) =>
                        `${type}:${names.join(",")}`
                    ).join(" | "));
                }
            }

            // Installed custom node packs - ONLY on first message (static context)
            if (includeStatic) {
                const packs = this.getInstalledPacks();
                if (packs.length > 0) {
                    lines.push("");
                    lines.push("Installed Packs:");
                    for (const pack of packs) {
                        lines.push(`  - ${pack.name}`);
                    }
                }
                // Mark first message as sent
                this.isFirstMessage = false;
            }

            return lines.join("\n");
        } catch (e) {
            console.error('[ContextGenerator] Failed to generate context:', e);
            return "[WORKFLOW STATE]\nError generating context.";
        }
    }

    /**
     * Generate summary for a single node
     * @param {object} node - The node object
     * @param {number} level - Detail level (1, 2, or 3)
     * @param {boolean} promptGuard - If true, hide prompt-related titles
     */
    getNodeSummary(node, level = 2, promptGuard = false) {
        const parts = [];

        // ID and type (always shown)
        let typeStr = node.type.split('/').pop(); // Remove category prefix

        // Include title unless Prompt Guard is enabled and title looks like prompt content
        if (node.title && node.title !== node.type && node.title !== typeStr) {
            if (promptGuard) {
                // Hide titles that might contain prompt text
                const looksLikePrompt = node.title.length > 30 ||
                    /\b(girl|boy|woman|man|photo|style|quality|detailed|anime|realistic)\b/i.test(node.title);
                if (!looksLikePrompt) {
                    typeStr += ` "${node.title}"`;
                }
            } else {
                typeStr += ` "${node.title}"`;
            }
        }

        // Polarity label for conditioning nodes (traced from sampler connections)
        // This is THE authoritative way to know if a CLIPTextEncode is positive or negative
        let polarityStr = '';
        if (this.polarityMap && this.polarityMap.has(node.id)) {
            polarityStr = ` [${this.polarityMap.get(node.id)}]`;
        }

        // Mode indicator (bypass shown inline)
        const modeStr = node.mode === 4 ? ' [BYPASS]' : '';
        parts.push(`#${node.id} ${typeStr}${polarityStr}${modeStr}`);

        // Position and size - ONLY Level 3
        if (level >= 3) {
            const size = this.getNodeSize(node);
            parts.push(`@(${Math.round(node.pos[0])},${Math.round(node.pos[1])}) ${size.w}x${size.h}`);
        }

        // Connections - all levels, using abbreviations
        const connections = this.getNodeConnections(node);
        if (connections.inputs.length > 0 || connections.outputs.length > 0) {
            // Compact format: ←M:#1 ←CD:#3,#4 →L:#6
            const connStr = [
                ...connections.inputs,
                ...connections.outputs
            ].join(' ');
            parts.push(connStr);
        }

        // Widget values - ONLY Level 3
        if (level >= 3 && node.widgets) {
            const widgetVals = [];
            for (const widget of node.widgets) {
                // Skip empty/default values and prompts if guard enabled
                if (widget.value === undefined || widget.value === null) continue;
                if (promptGuard && this._isPromptWidget(widget.name)) continue;

                // Compact format: name=value
                const valStr = typeof widget.value === 'string'
                    ? (widget.value.length > 30 ? widget.value.substring(0, 27) + '...' : widget.value)
                    : widget.value;
                widgetVals.push(`${widget.name}=${valStr}`);
            }
            if (widgetVals.length > 0) {
                parts.push(`{${widgetVals.join(', ')}}`);
            }
        }

        return parts.join(' ');
    }

    /**
     * Check if a widget name is prompt-related
     */
    _isPromptWidget(name) {
        const lower = name.toLowerCase();
        return ['text', 'prompt', 'positive', 'negative', 'string'].some(p => lower.includes(p));
    }

    /**
     * Get node size (cached)
     */
    getNodeSize(node) {
        const cacheKey = `${node.id}-${node.type}`;
        if (this.sizeCache.has(cacheKey)) {
            return this.sizeCache.get(cacheKey);
        }

        const size = {
            w: Math.round(node.size?.[0] || 200),
            h: Math.round(node.size?.[1] || 100)
        };

        this.sizeCache.set(cacheKey, size);
        return size;
    }

    /**
     * Get node input/output connections with abbreviated types
     * Output format: ←M:#1 (input from node 1, type MODEL)
     *                →L:#6,#7 (output to nodes 6 and 7, type LATENT)
     *                ←CD[positive]:#7 (conditioning input on 'positive' slot from node 7)
     *
     * CRITICAL: For conditioning inputs, we MUST show the slot name (positive/negative)
     * so the AI can detect polarity mismatches!
     */
    getNodeConnections(node) {
        const inputs = [];
        const outputs = [];

        // Input slot names that indicate polarity - MUST be shown explicitly
        const polaritySlots = ['positive', 'negative', 'pos', 'neg', 'positive_conditioning', 'negative_conditioning'];

        // Input connections: ←TYPE:#source or ←TYPE[slotName]:#source for polarity slots
        if (node.inputs) {
            for (const input of node.inputs) {
                if (input.link && app.graph.links[input.link]) {
                    const link = app.graph.links[input.link];
                    const abbrev = abbreviateType(input.type);
                    const slotName = (input.name || '').toLowerCase();

                    // For conditioning inputs with polarity, include the slot name
                    if (abbrev === 'CD' && polaritySlots.includes(slotName)) {
                        inputs.push(`←${abbrev}[${input.name}]:#${link.origin_id}`);
                    } else {
                        inputs.push(`←${abbrev}:#${link.origin_id}`);
                    }
                }
            }
        }

        // Output connections: →TYPE:#target,#target (with slot info when going to polarity inputs)
        if (node.outputs) {
            for (const output of node.outputs) {
                if (output.links && output.links.length > 0) {
                    const targets = output.links.map(linkId => {
                        const link = app.graph.links[linkId];
                        if (!link) return null;

                        // Get target node and slot info
                        const targetId = link.target_id;
                        const targetSlot = link.target_slot;
                        const targetNode = app.graph.getNodeById(targetId);

                        // Check if target slot is a polarity slot
                        if (targetNode && targetNode.inputs && targetNode.inputs[targetSlot]) {
                            const targetInput = targetNode.inputs[targetSlot];
                            const targetSlotName = (targetInput.name || '').toLowerCase();
                            if (polaritySlots.includes(targetSlotName)) {
                                return `#${targetId}[${targetInput.name}]`;
                            }
                        }
                        return `#${targetId}`;
                    }).filter(Boolean);
                    if (targets.length > 0) {
                        const abbrev = abbreviateType(output.type);
                        outputs.push(`→${abbrev}:${targets.join(",")}`);
                    }
                }
            }
        }

        return { inputs, outputs };
    }

    /**
     * Get groups summary with contained nodes
     */
    getGroupsSummary() {
        // Filter out undefined/null groups (can happen after graph reload)
        const graphGroups = (app.graph._groups || []).filter(g => g && g.pos && g.size);
        const nodes = app.graph._nodes || [];
        const groups = [];
        const groupedNodeIds = new Set();

        for (let i = 0; i < graphGroups.length; i++) {
            const g = graphGroups[i];
            const nodeIds = [];

            // Find nodes in this group
            for (const node of nodes) {
                const nw = node.size?.[0] || 200;
                const nh = node.size?.[1] || 100;
                if (node.pos[0] >= g.pos[0] &&
                    node.pos[1] >= g.pos[1] &&
                    node.pos[0] + nw <= g.pos[0] + g.size[0] &&
                    node.pos[1] + nh <= g.pos[1] + g.size[1]) {
                    nodeIds.push(node.id);
                    groupedNodeIds.add(node.id);
                }
            }

            groups.push({
                index: i + 1,
                title: g.title,
                color: g.color || '#888',
                x: Math.round(g.pos[0]),
                y: Math.round(g.pos[1]),
                width: Math.round(g.size[0]),
                height: Math.round(g.size[1]),
                nodeIds
            });
        }

        // Find ungrouped nodes
        const ungrouped = nodes
            .filter(n => !groupedNodeIds.has(n.id))
            .map(n => n.id);

        return { groups, ungrouped };
    }

    /**
     * Generate data flow summary
     */
    getDataFlow() {
        const nodes = app.graph._nodes || [];
        if (nodes.length === 0) return null;

        // Find source nodes (no connected inputs)
        const sourceNodes = nodes.filter(node => {
            if (!node.inputs) return true;
            return !node.inputs.some(i => i.link !== null);
        });

        // Find sink nodes (no connected outputs)
        const sinkNodes = nodes.filter(node => {
            if (!node.outputs) return true;
            return !node.outputs.some(o => o.links && o.links.length > 0);
        });

        // Simple flow representation
        if (sourceNodes.length === 0 || sinkNodes.length === 0) {
            return "No clear flow (disconnected nodes?)";
        }

        // Build simple chain from sources to sinks
        const sourceIds = sourceNodes.map(n => `#${n.id}`).join(",");
        const sinkIds = sinkNodes.map(n => `#${n.id}`).join(",");

        if (nodes.length <= 3) {
            return `${sourceIds} → ${sinkIds}`;
        }

        return `${sourceIds} → ... (${nodes.length - sourceNodes.length - sinkNodes.length} middle) → ${sinkIds}`;
    }

    /**
     * Detect issues in the workflow
     */
    detectIssues() {
        const issues = [];
        const nodes = app.graph._nodes || [];
        // Filter out undefined/null groups (can happen after graph reload)
        const groups = (app.graph._groups || []).filter(g => g && g.pos && g.size);

        // Missing required inputs
        for (const node of nodes) {
            if (node.mode === 4) continue; // Skip bypassed
            if (!node.inputs) continue;

            for (const input of node.inputs) {
                if (input.link === null && input.type !== '*') {
                    issues.push({
                        type: 'missing_input',
                        node: node.id,
                        nodeType: node.type.split('/').pop(),
                        input: input.name,
                        severity: 'error'
                    });
                }
            }
        }

        // Ungrouped nodes when groups exist
        if (groups.length > 0) {
            const groupSummary = this.getGroupsSummary();
            if (groupSummary.ungrouped.length > 0) {
                issues.push({
                    type: 'ungrouped',
                    nodes: groupSummary.ungrouped,
                    severity: 'warning'
                });
            }
        }

        // Check for overlapping groups
        for (let i = 0; i < groups.length; i++) {
            for (let j = i + 1; j < groups.length; j++) {
                const g1 = groups[i];
                const g2 = groups[j];

                const overlapX = g1.pos[0] < g2.pos[0] + g2.size[0] && g1.pos[0] + g1.size[0] > g2.pos[0];
                const overlapY = g1.pos[1] < g2.pos[1] + g2.size[1] && g1.pos[1] + g1.size[1] > g2.pos[1];

                if (overlapX && overlapY) {
                    issues.push({
                        type: 'group_overlap',
                        groups: [g1.title, g2.title],
                        severity: 'warning'
                    });
                }
            }
        }

        return issues;
    }

    /**
     * Format issue for display
     */
    formatIssue(issue) {
        switch (issue.type) {
            case 'missing_input':
                return `Node #${issue.node} ${issue.nodeType}: ${issue.input} input not connected (required)`;
            case 'ungrouped':
                return `Nodes ${issue.nodes.join(", ")} are ungrouped`;
            case 'group_overlap':
                return `Groups "${issue.groups[0]}" and "${issue.groups[1]}" overlap`;
            default:
                return JSON.stringify(issue);
        }
    }

    /**
     * Get models currently in use
     */
    getModelsInUse() {
        const models = {
            Checkpoint: [],
            LoRA: [],
            VAE: [],
            ControlNet: []
        };

        const nodes = app.graph._nodes || [];

        for (const node of nodes) {
            if (!node.widgets) continue;

            const typeShort = node.type.split('/').pop().toLowerCase();

            for (const widget of node.widgets) {
                const name = widget.name.toLowerCase();
                const value = widget.value;

                if (typeof value !== 'string' || !value) continue;

                // Checkpoint
                if (typeShort.includes('checkpoint') && name.includes('name')) {
                    if (!models.Checkpoint.includes(value)) {
                        models.Checkpoint.push(value);
                    }
                }

                // LoRA
                if (typeShort.includes('lora') && name.includes('name')) {
                    if (!models.LoRA.includes(value)) {
                        models.LoRA.push(value);
                    }
                }

                // VAE
                if (typeShort.includes('vae') && name.includes('name')) {
                    if (!models.VAE.includes(value)) {
                        models.VAE.push(value);
                    }
                }

                // ControlNet
                if (typeShort.includes('controlnet') && name.includes('name')) {
                    if (!models.ControlNet.includes(value)) {
                        models.ControlNet.push(value);
                    }
                }
            }
        }

        // Remove empty categories
        for (const key of Object.keys(models)) {
            if (models[key].length === 0) {
                delete models[key];
            }
        }

        return models;
    }

    /**
     * Get installed custom node packs
     * Infers from registered node types by looking at category prefixes
     */
    getInstalledPacks() {
        const packs = new Map();

        // Known pack mappings (category prefix -> display name)
        const packMappings = {
            'ImpactPack': 'ComfyUI-Impact-Pack',
            'InspirePack': 'ComfyUI-Inspire-Pack',
            'rgthree': 'rgthree-comfy',
            'Efficiency Nodes': 'efficiency-nodes-comfyui',
            'KJNodes': 'ComfyUI-KJNodes',
            'Derfuu_Math': 'Derfuu_ComfyUI_ModdedNodes',
            'essentials': 'ComfyUI_essentials',
            'WAS Suite': 'was-node-suite-comfyui',
            'UltimateSDUpscale': 'ComfyUI_UltimateSDUpscale',
            'ControlNet Preprocessors': 'comfyui_controlnet_aux',
            'FizzNodes': 'ComfyUI_FizzNodes',
            'AdvancedControlNet': 'ComfyUI-Advanced-ControlNet',
        };

        try {
            // Get all registered node types from LiteGraph
            // Use global LiteGraph (same pattern as workflow_api.js)
            const registered = (typeof LiteGraph !== 'undefined' && LiteGraph.registered_node_types)
                ? LiteGraph.registered_node_types
                : {};

            for (const [nodeType, nodeClass] of Object.entries(registered)) {
                if (nodeType.startsWith('_')) continue;

                const category = nodeClass.category || '';
                const title = nodeClass.title || nodeType.split('/').pop();

                // Try to identify the pack from category
                for (const [prefix, packName] of Object.entries(packMappings)) {
                    if (category.toLowerCase().includes(prefix.toLowerCase()) ||
                        nodeType.toLowerCase().includes(prefix.toLowerCase())) {
                        if (!packs.has(packName)) {
                            packs.set(packName, { name: packName, nodes: [] });
                        }
                        packs.get(packName).nodes.push(title);
                        break;
                    }
                }
            }

            // Convert to array and limit sample nodes
            const result = [];
            for (const [name, data] of packs) {
                result.push({
                    name: name,
                    sampleNodes: data.nodes.slice(0, 3) // Show max 3 example nodes
                });
            }

            // Sort by pack name
            result.sort((a, b) => a.name.localeCompare(b.name));

            // Debug log (can be removed later)
            if (result.length > 0) {
                console.log('[ContextGenerator] Detected packs:', result.map(p => p.name).join(', '));
            } else {
                console.log('[ContextGenerator] No packs detected. LiteGraph types:', Object.keys(registered).length);
            }

            return result;
        } catch (e) {
            console.error('[ContextGenerator] Failed to get installed packs:', e);
            return [];
        }
    }

    /**
     * Clear size cache (call when nodes change)
     */
    clearCache() {
        this.sizeCache.clear();
    }

    /**
     * Set context detail level
     * @param {number|string} level - Level 1, 2, 3 or legacy string
     */
    setLevel(level) {
        if (typeof level === 'string') {
            level = CONTEXT_LEVEL_ALIASES[level] || 2;
        }
        if ([1, 2, 3].includes(level)) {
            this.level = level;
        }
    }

    /**
     * Reset first message flag (call when starting a new chat)
     */
    resetFirstMessage() {
        this.isFirstMessage = true;
    }

    /**
     * Get token estimate for a context level
     * @param {number} level - Context level
     * @param {number} nodeCount - Number of nodes
     * @returns {object} Token estimate info
     */
    estimateTokens(level = null, nodeCount = null) {
        const count = nodeCount ?? (app?.graph?._nodes?.length || 0);
        const actualLevel = level ?? this.selectLevel(count);

        // Rough estimates based on typical content
        const baseTokens = 50; // Header, workflow line
        const tokensPerNode = actualLevel === 1 ? 15 : actualLevel === 2 ? 25 : 50;
        const groupOverhead = actualLevel >= 2 ? 30 : 10;
        const staticContext = this.isFirstMessage ? 150 : 0;

        const estimated = baseTokens + (count * tokensPerNode) + groupOverhead + staticContext;

        return {
            level: actualLevel,
            node_count: count,
            estimated_tokens: estimated,
            budget: actualLevel === 1 ? '150-250' : actualLevel === 2 ? '350-500' : '800-2000'
        };
    }
}

// ============================================================================
// INLINE TESTS (run in browser console to verify)
// ============================================================================

/**
 * Run inline tests - call ContextGenerator.runTests() in browser console
 */
ContextGenerator.runTests = function() {
    console.log('=== ContextGenerator Tests ===');
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

    // Test 1: Generate returns string
    test('generate returns string', () => {
        const gen = new ContextGenerator();
        const result = gen.generate();
        assert(typeof result === 'string', 'Should return string');
        assert(result.includes('[WORKFLOW STATE]'), 'Should include header');
    });

    // Test 2: Format issue works
    test('formatIssue handles missing_input', () => {
        const gen = new ContextGenerator();
        const issue = { type: 'missing_input', node: 5, nodeType: 'KSampler', input: 'latent', severity: 'error' };
        const formatted = gen.formatIssue(issue);
        assert(formatted.includes('#5'), 'Should include node ID');
        assert(formatted.includes('latent'), 'Should include input name');
    });

    // Test 3: Size cache works
    test('size cache stores values', () => {
        const gen = new ContextGenerator();
        const mockNode = { id: 1, type: 'Test', size: [300, 150] };
        const size1 = gen.getNodeSize(mockNode);
        const size2 = gen.getNodeSize(mockNode);
        assert(size1 === size2, 'Same reference from cache');
        assert(size1.w === 300, 'Width correct');
        assert(size1.h === 150, 'Height correct');
    });

    // Test 4: Clear cache works
    test('clearCache empties cache', () => {
        const gen = new ContextGenerator();
        const mockNode = { id: 1, type: 'Test', size: [300, 150] };
        gen.getNodeSize(mockNode);
        assert(gen.sizeCache.size === 1, 'Cache has entry');
        gen.clearCache();
        assert(gen.sizeCache.size === 0, 'Cache cleared');
    });

    console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
    return failed === 0;
};

export { ContextGenerator, CONTEXT_LEVELS, CONTEXT_LEVEL_ALIASES, TYPE_ABBREV, abbreviateType };
