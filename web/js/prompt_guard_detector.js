/**
 * PromptGuardDetector - Intelligent prompt content detection for ComfyUI
 *
 * Automatically detects nodes likely containing prompt text using multiple
 * detection strategies with confidence scoring.
 *
 * Detection Methods:
 * 1. Text Pattern Analysis (length, comma density, weights, special syntax)
 * 2. Semantic Content Detection (quality boosters, negative keywords, style terms)
 * 3. Connection-Based Detection (downstream to conditioning, upstream from CLIP)
 * 4. Node/Widget Type Analysis (known prompt node types and widget names)
 * 5. Metadata Detection (group membership, node titles)
 */

// ComfyUI API - use new window.comfyAPI pattern (ComfyUI 1.35+)
const { app } = window.comfyAPI?.app ?? await import("../../../../scripts/app.js");

// =============================================================================
// Detection Configuration
// =============================================================================

/**
 * Minimum confidence score (0-100) to flag a node as containing prompts
 */
const CONFIDENCE_THRESHOLD = 40;

/**
 * Text length thresholds
 */
const LENGTH_THRESHOLDS = {
    LIKELY_PROMPT: 25,      // Text over this length is likely a prompt
    DEFINITELY_PROMPT: 80,  // Text over this length is almost certainly a prompt
    CONFIG_VALUE: 15        // Text under this is likely a config value
};

/**
 * Known prompt node types (match anywhere in type string)
 */
const PROMPT_NODE_TYPES = [
    'CLIPTextEncode',
    'CLIPTextEncodeSDXL',
    'CLIPTextEncodeSDXLRefiner',
    'CLIPTextEncodeFlux',
    'ConditioningCombine',
    'ConditioningConcat',
    'ConditioningAverage',
    'ConditioningSetArea',
    'ShowText',
    'Note',
    'PrimitiveNode',
    'String',
    'Text',
    'TextMultiline',
    'TextBox',
    'Wildcard',
    'DynamicPrompt',
    'PromptSchedule'
];

/**
 * Widget names that typically contain prompt text
 */
const PROMPT_WIDGET_NAMES = [
    'text', 'prompt', 'positive', 'negative', 'string',
    'wildcard', 'template', 'input_text', 'output_text',
    'text_positive', 'text_negative', 'conditioning_text'
];

/**
 * Quality booster keywords (high confidence indicator)
 */
const QUALITY_BOOSTERS = [
    'masterpiece', 'best quality', 'highly detailed', 'high quality',
    '8k', '4k', 'uhd', 'ultra detailed', 'professional',
    'award winning', 'trending on artstation', 'intricate details',
    'sharp focus', 'high resolution', 'hdr', 'octane render',
    'unreal engine', 'photorealistic', 'hyperrealistic'
];

/**
 * Negative prompt indicators (high confidence)
 */
const NEGATIVE_INDICATORS = [
    'bad hands', 'extra fingers', 'missing fingers', 'fused fingers',
    'bad anatomy', 'wrong anatomy', 'mutated', 'deformed',
    'blurry', 'low quality', 'worst quality', 'lowres', 'jpeg artifacts',
    'watermark', 'signature', 'text', 'error', 'cropped',
    'out of frame', 'ugly', 'duplicate', 'morbid', 'mutilated',
    'poorly drawn', 'bad proportions', 'cloned face', 'disfigured',
    'gross proportions', 'malformed limbs', 'missing arms', 'missing legs',
    'extra arms', 'extra legs', 'long neck'
];

/**
 * Subject/style descriptor keywords
 */
const STYLE_DESCRIPTORS = [
    // Subjects
    '1girl', '1boy', '2girls', '2boys', 'woman', 'man', 'girl', 'boy',
    'portrait', 'landscape', 'scenery', 'cityscape', 'fantasy',
    // Styles
    'anime', 'realistic', 'oil painting', 'watercolor', 'digital art',
    'concept art', 'illustration', 'sketch', 'lineart', 'cel shading',
    'cyberpunk', 'steampunk', 'gothic', 'art nouveau', 'art deco',
    // Lighting/Mood
    'cinematic lighting', 'dramatic lighting', 'soft lighting', 'rim lighting',
    'bokeh', 'depth of field', 'studio lighting', 'natural lighting',
    // Camera
    'close-up', 'wide shot', 'medium shot', 'full body', 'upper body',
    'cowboy shot', 'dutch angle', 'bird view', 'looking at viewer'
];

/**
 * Special syntax patterns for SD/ComfyUI prompts
 */
const SYNTAX_PATTERNS = {
    // (word:1.5) or ((word)) emphasis
    WEIGHTED_TAG: /\([^)]+:[0-9.]+\)|\(\([^)]+\)\)/,
    // <lora:name:weight>
    LORA_TRIGGER: /<lora:[^>]+>/i,
    // embedding:name or <embedding:name>
    EMBEDDING: /(?:embedding:|<embedding:)[^>\s]+/i,
    // __wildcardfile__ or {option1|option2}
    WILDCARD: /__[^_]+__|{[^}]+\|[^}]+}/,
    // BREAK keyword
    BREAK_KEYWORD: /\bBREAK\b/,
    // Square brackets de-emphasis [word]
    DEEMPHASIS: /\[[^\]]+\]/,
    // Underscore compounds like best_quality
    UNDERSCORE_COMPOUND: /\b[a-z]+_[a-z]+\b/i
};

// =============================================================================
// Detection Result Types
// =============================================================================

/**
 * @typedef {Object} DetectionReason
 * @property {string} method - Detection method name
 * @property {string} detail - Specific detail about what was detected
 * @property {number} confidence - Confidence contribution (0-100)
 */

/**
 * @typedef {Object} NodeDetectionResult
 * @property {number} nodeId - Node ID
 * @property {string} nodeType - Node type
 * @property {string} nodeTitle - Node title (if set)
 * @property {number} confidence - Overall confidence score (0-100)
 * @property {DetectionReason[]} reasons - Array of detection reasons
 * @property {string[]} widgetNames - Names of widgets flagged as prompts
 * @property {boolean} autoDetected - Whether this was auto-detected
 */

// =============================================================================
// PromptGuardDetector Class
// =============================================================================

class PromptGuardDetector {
    constructor() {
        // Cache for expensive operations
        this.conditioningFlowCache = new Map();
        this.lastGraphVersion = null;
    }

    /**
     * Detect all nodes containing prompt text in the current workflow
     * @returns {Map<number, NodeDetectionResult>} Map of nodeId -> detection result
     */
    detectAll() {
        if (!app?.graph?._nodes) {
            return new Map();
        }

        const results = new Map();
        const nodes = app.graph._nodes;

        // Invalidate cache if graph changed
        this.invalidateCacheIfNeeded();

        // Build conditioning flow map for connection-based detection
        const conditioningFlow = this.buildConditioningFlowMap();

        for (const node of nodes) {
            const result = this.detectNode(node, conditioningFlow);
            if (result.confidence >= CONFIDENCE_THRESHOLD) {
                results.set(node.id, result);
            }
        }

        return results;
    }

    /**
     * Detect if a single node contains prompt text
     * @param {Object} node - LiteGraph node object
     * @param {Map} conditioningFlow - Pre-computed conditioning flow map (optional)
     * @returns {NodeDetectionResult}
     */
    detectNode(node, conditioningFlow = null) {
        const reasons = [];
        const flaggedWidgets = [];

        // 1. Node Type Analysis
        const typeScore = this.analyzeNodeType(node);
        if (typeScore.confidence > 0) {
            reasons.push(typeScore);
        }

        // 2. Widget Name Analysis
        const widgetNameScore = this.analyzeWidgetNames(node);
        if (widgetNameScore.confidence > 0) {
            reasons.push(widgetNameScore);
            flaggedWidgets.push(...widgetNameScore.widgets);
        }

        // 3. Text Content Analysis (length, patterns, semantics)
        const contentScores = this.analyzeTextContent(node);
        for (const score of contentScores) {
            if (score.confidence > 0) {
                reasons.push(score);
                if (score.widget) flaggedWidgets.push(score.widget);
            }
        }

        // 4. Connection-Based Analysis
        const connectionScore = this.analyzeConnections(node, conditioningFlow);
        if (connectionScore.confidence > 0) {
            reasons.push(connectionScore);
        }

        // 5. Group Membership Analysis
        const groupScore = this.analyzeGroupMembership(node);
        if (groupScore.confidence > 0) {
            reasons.push(groupScore);
        }

        // 6. Node Title Analysis
        const titleScore = this.analyzeNodeTitle(node);
        if (titleScore.confidence > 0) {
            reasons.push(titleScore);
        }

        // Calculate total confidence (capped at 100)
        const totalConfidence = Math.min(100,
            reasons.reduce((sum, r) => sum + r.confidence, 0)
        );

        return {
            nodeId: node.id,
            nodeType: node.type,
            nodeTitle: node.title || null,
            confidence: totalConfidence,
            reasons,
            widgetNames: [...new Set(flaggedWidgets)],
            autoDetected: true
        };
    }

    // =========================================================================
    // Detection Methods
    // =========================================================================

    /**
     * Analyze node type for known prompt node patterns
     */
    analyzeNodeType(node) {
        const nodeType = node.type || '';
        const typeShort = nodeType.split('/').pop();

        for (const promptType of PROMPT_NODE_TYPES) {
            if (typeShort.toLowerCase().includes(promptType.toLowerCase())) {
                return {
                    method: 'node_type',
                    detail: `Node type "${typeShort}" is a known prompt node`,
                    confidence: 35
                };
            }
        }

        // Check for CLIP in type (likely text encoder)
        if (typeShort.toLowerCase().includes('clip') &&
            typeShort.toLowerCase().includes('text')) {
            return {
                method: 'node_type',
                detail: `Node type "${typeShort}" contains CLIP text encoding`,
                confidence: 40
            };
        }

        return { method: 'node_type', detail: null, confidence: 0 };
    }

    /**
     * Analyze widget names for prompt-related names
     */
    analyzeWidgetNames(node) {
        const widgets = node.widgets || [];
        const flaggedWidgets = [];
        let maxConfidence = 0;

        for (const widget of widgets) {
            const name = (widget.name || '').toLowerCase();

            for (const promptName of PROMPT_WIDGET_NAMES) {
                if (name.includes(promptName)) {
                    flaggedWidgets.push(widget.name);
                    maxConfidence = Math.max(maxConfidence, 25);
                    break;
                }
            }
        }

        return {
            method: 'widget_name',
            detail: flaggedWidgets.length > 0
                ? `Widgets with prompt names: ${flaggedWidgets.join(', ')}`
                : null,
            confidence: maxConfidence,
            widgets: flaggedWidgets
        };
    }

    /**
     * Analyze text content in widgets for prompt patterns
     * @returns {DetectionReason[]} Array of detection reasons
     */
    analyzeTextContent(node) {
        const reasons = [];
        const widgets = node.widgets || [];
        const widgetValues = node.widgets_values || [];

        // Combine widget values with live widget values
        const allValues = [];

        // From widgets array (live values)
        for (const widget of widgets) {
            if (typeof widget.value === 'string' && widget.value.length > 0) {
                allValues.push({ name: widget.name, value: widget.value });
            }
        }

        // From widgets_values array (serialized values)
        for (let i = 0; i < widgetValues.length; i++) {
            const val = widgetValues[i];
            if (typeof val === 'string' && val.length > 0) {
                const widgetName = widgets[i]?.name || `widget_${i}`;
                // Avoid duplicates
                if (!allValues.some(v => v.value === val)) {
                    allValues.push({ name: widgetName, value: val });
                }
            }
        }

        // Also check properties.text (Note nodes)
        if (node.properties?.text && typeof node.properties.text === 'string') {
            allValues.push({ name: 'properties.text', value: node.properties.text });
        }

        for (const { name, value } of allValues) {
            // Length analysis
            const lengthResult = this.analyzeTextLength(value, name);
            if (lengthResult.confidence > 0) reasons.push(lengthResult);

            // Comma density analysis
            const commaResult = this.analyzeCommaDensity(value, name);
            if (commaResult.confidence > 0) reasons.push(commaResult);

            // Special syntax patterns
            const syntaxResult = this.analyzeSpecialSyntax(value, name);
            if (syntaxResult.confidence > 0) reasons.push(syntaxResult);

            // Semantic keyword detection
            const semanticResult = this.analyzeSemanticContent(value, name);
            if (semanticResult.confidence > 0) reasons.push(semanticResult);

            // Multiline detection
            const multilineResult = this.analyzeMultiline(value, name);
            if (multilineResult.confidence > 0) reasons.push(multilineResult);
        }

        return reasons;
    }

    /**
     * Analyze text length as prompt indicator
     */
    analyzeTextLength(text, widgetName) {
        const length = text.length;

        if (length >= LENGTH_THRESHOLDS.DEFINITELY_PROMPT) {
            return {
                method: 'text_length',
                detail: `Text is ${length} chars (very long, almost certainly a prompt)`,
                confidence: 35,
                widget: widgetName
            };
        }

        if (length >= LENGTH_THRESHOLDS.LIKELY_PROMPT) {
            return {
                method: 'text_length',
                detail: `Text is ${length} chars (likely a prompt)`,
                confidence: 20,
                widget: widgetName
            };
        }

        return { method: 'text_length', detail: null, confidence: 0 };
    }

    /**
     * Analyze comma density (tag-based prompts have many commas)
     */
    analyzeCommaDensity(text, widgetName) {
        const commaCount = (text.match(/,/g) || []).length;
        const wordCount = text.split(/\s+/).length;

        if (wordCount < 3) return { method: 'comma_density', detail: null, confidence: 0 };

        const commaDensity = commaCount / wordCount;

        // High comma density suggests tag-based prompt (e.g., "1girl, blue hair, masterpiece")
        if (commaDensity > 0.4 && commaCount >= 3) {
            return {
                method: 'comma_density',
                detail: `High comma density (${commaCount} commas in ${wordCount} words) - tag-based prompt`,
                confidence: 30,
                widget: widgetName
            };
        }

        if (commaDensity > 0.25 && commaCount >= 2) {
            return {
                method: 'comma_density',
                detail: `Moderate comma density (${commaCount} commas) - possible prompt`,
                confidence: 15,
                widget: widgetName
            };
        }

        return { method: 'comma_density', detail: null, confidence: 0 };
    }

    /**
     * Analyze special prompt syntax patterns
     */
    analyzeSpecialSyntax(text, widgetName) {
        const matches = [];
        let confidence = 0;

        if (SYNTAX_PATTERNS.WEIGHTED_TAG.test(text)) {
            matches.push('weighted tags (word:1.5)');
            confidence += 35;
        }

        if (SYNTAX_PATTERNS.LORA_TRIGGER.test(text)) {
            matches.push('LoRA trigger');
            confidence += 40;
        }

        if (SYNTAX_PATTERNS.EMBEDDING.test(text)) {
            matches.push('embedding reference');
            confidence += 35;
        }

        if (SYNTAX_PATTERNS.WILDCARD.test(text)) {
            matches.push('wildcard syntax');
            confidence += 30;
        }

        if (SYNTAX_PATTERNS.BREAK_KEYWORD.test(text)) {
            matches.push('BREAK keyword');
            confidence += 35;
        }

        if (SYNTAX_PATTERNS.DEEMPHASIS.test(text)) {
            matches.push('de-emphasis [brackets]');
            confidence += 25;
        }

        // Underscore compounds (need multiple to be significant)
        const underscoreMatches = text.match(SYNTAX_PATTERNS.UNDERSCORE_COMPOUND);
        if (underscoreMatches && underscoreMatches.length >= 2) {
            matches.push('underscore compounds');
            confidence += 15;
        }

        if (matches.length > 0) {
            return {
                method: 'special_syntax',
                detail: `Contains: ${matches.join(', ')}`,
                confidence: Math.min(50, confidence),
                widget: widgetName
            };
        }

        return { method: 'special_syntax', detail: null, confidence: 0 };
    }

    /**
     * Analyze semantic content (keywords that indicate prompts)
     */
    analyzeSemanticContent(text, widgetName) {
        const textLower = text.toLowerCase();
        const found = {
            boosters: [],
            negatives: [],
            styles: []
        };

        // Quality boosters
        for (const booster of QUALITY_BOOSTERS) {
            if (textLower.includes(booster.toLowerCase())) {
                found.boosters.push(booster);
            }
        }

        // Negative indicators
        for (const negative of NEGATIVE_INDICATORS) {
            if (textLower.includes(negative.toLowerCase())) {
                found.negatives.push(negative);
            }
        }

        // Style descriptors
        for (const style of STYLE_DESCRIPTORS) {
            if (textLower.includes(style.toLowerCase())) {
                found.styles.push(style);
            }
        }

        let confidence = 0;
        const details = [];

        if (found.boosters.length >= 2) {
            confidence += 35;
            details.push(`quality boosters: ${found.boosters.slice(0, 3).join(', ')}`);
        } else if (found.boosters.length === 1) {
            confidence += 20;
            details.push(`quality booster: ${found.boosters[0]}`);
        }

        if (found.negatives.length >= 2) {
            confidence += 40; // Strong indicator of negative prompt
            details.push(`negative prompt terms: ${found.negatives.slice(0, 3).join(', ')}`);
        } else if (found.negatives.length === 1) {
            confidence += 25;
            details.push(`negative term: ${found.negatives[0]}`);
        }

        if (found.styles.length >= 3) {
            confidence += 25;
            details.push(`style descriptors: ${found.styles.slice(0, 3).join(', ')}`);
        } else if (found.styles.length >= 1) {
            confidence += 10;
        }

        if (details.length > 0) {
            return {
                method: 'semantic_content',
                detail: details.join('; '),
                confidence: Math.min(50, confidence),
                widget: widgetName
            };
        }

        return { method: 'semantic_content', detail: null, confidence: 0 };
    }

    /**
     * Analyze multiline text (prompts often span lines)
     */
    analyzeMultiline(text, widgetName) {
        const lineCount = (text.match(/\n/g) || []).length + 1;

        if (lineCount >= 3 && text.length > 50) {
            return {
                method: 'multiline',
                detail: `Text spans ${lineCount} lines`,
                confidence: 15,
                widget: widgetName
            };
        }

        return { method: 'multiline', detail: null, confidence: 0 };
    }

    /**
     * Analyze connections to determine if node feeds conditioning
     */
    analyzeConnections(node, conditioningFlow = null) {
        const flow = conditioningFlow || this.buildConditioningFlowMap();

        // Check if this node is in the conditioning flow
        if (flow.has(node.id)) {
            const flowInfo = flow.get(node.id);
            return {
                method: 'connection_flow',
                detail: `Feeds into ${flowInfo.polarity || 'conditioning'} input of sampler`,
                confidence: 30
            };
        }

        // Check if node outputs CONDITIONING type
        if (node.outputs) {
            for (const output of node.outputs) {
                if (output.type === 'CONDITIONING' && output.links?.length > 0) {
                    return {
                        method: 'connection_type',
                        detail: 'Outputs CONDITIONING type (connected)',
                        confidence: 25
                    };
                }
            }
        }

        // Check if node receives CLIP input (typical for text encoders)
        if (node.inputs) {
            for (const input of node.inputs) {
                if (input.type === 'CLIP' && input.link !== null) {
                    return {
                        method: 'connection_type',
                        detail: 'Receives CLIP input (text encoder pattern)',
                        confidence: 25
                    };
                }
            }
        }

        return { method: 'connection_flow', detail: null, confidence: 0 };
    }

    /**
     * Build map of nodes that feed into sampler conditioning inputs
     * @returns {Map<number, {polarity: string}>}
     */
    buildConditioningFlowMap() {
        if (!app?.graph) return new Map();

        // Use cache if graph hasn't changed
        const graphVersion = this.getGraphVersion();
        if (graphVersion === this.lastGraphVersion && this.conditioningFlowCache.size > 0) {
            return this.conditioningFlowCache;
        }

        const flowMap = new Map();
        const links = app.graph.links || {};
        const nodes = app.graph._nodes || [];

        // Find sampler nodes
        const samplerNodes = nodes.filter(n => {
            const type = (n.type || '').toLowerCase();
            return type.includes('sampler') || type.includes('ksampler');
        });

        // Trace back from sampler inputs
        for (const sampler of samplerNodes) {
            if (!sampler.inputs) continue;

            for (const input of sampler.inputs) {
                const inputName = (input.name || '').toLowerCase();
                const isPositive = inputName.includes('positive') || inputName === 'pos';
                const isNegative = inputName.includes('negative') || inputName === 'neg';

                if (!isPositive && !isNegative) continue;
                if (!input.link) continue;

                // Trace the chain backwards
                const polarity = isPositive ? 'POSITIVE' : 'NEGATIVE';
                this.traceConditioningChain(input.link, links, nodes, flowMap, polarity, new Set());
            }
        }

        // Also trace from detailer nodes
        const detailerNodes = nodes.filter(n => {
            const type = (n.type || '').toLowerCase();
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

                const polarity = isPositive ? 'POSITIVE' : 'NEGATIVE';
                this.traceConditioningChain(input.link, links, nodes, flowMap, polarity, new Set());
            }
        }

        this.conditioningFlowCache = flowMap;
        this.lastGraphVersion = graphVersion;

        return flowMap;
    }

    /**
     * Recursively trace conditioning chain backwards
     */
    traceConditioningChain(linkId, links, nodes, flowMap, polarity, visited) {
        if (visited.has(linkId)) return;
        visited.add(linkId);

        const link = links[linkId];
        if (!link) return;

        const sourceId = Array.isArray(link) ? link[1] : link.origin_id;
        if (sourceId == null) return;

        // Mark this node
        if (!flowMap.has(sourceId)) {
            flowMap.set(sourceId, { polarity });
        }

        // Continue tracing upstream
        const sourceNode = nodes.find(n => n.id === sourceId);
        if (!sourceNode?.inputs) return;

        for (const input of sourceNode.inputs) {
            if (input.link !== null &&
                (input.type === 'CONDITIONING' || input.type === 'STRING')) {
                this.traceConditioningChain(input.link, links, nodes, flowMap, polarity, visited);
            }
        }
    }

    /**
     * Analyze group membership for prompt indicators
     */
    analyzeGroupMembership(node) {
        const groups = app.graph._groups || [];

        for (const group of groups) {
            if (!group || !group.pos || !group.size) continue;

            const title = (group.title || '').toLowerCase();
            const nodeInGroup = this.isNodeInGroup(node, group);

            if (nodeInGroup) {
                // Check if group name suggests prompts
                if (title.includes('prompt') || title.includes('positive') ||
                    title.includes('negative') || title.includes('text')) {
                    return {
                        method: 'group_membership',
                        detail: `In group "${group.title}" (prompt-related name)`,
                        confidence: 25
                    };
                }
            }
        }

        return { method: 'group_membership', detail: null, confidence: 0 };
    }

    /**
     * Check if node is inside a group's bounds
     */
    isNodeInGroup(node, group) {
        const nw = node.size?.[0] || 200;
        const nh = node.size?.[1] || 100;

        return node.pos[0] >= group.pos[0] &&
               node.pos[1] >= group.pos[1] &&
               node.pos[0] + nw <= group.pos[0] + group.size[0] &&
               node.pos[1] + nh <= group.pos[1] + group.size[1];
    }

    /**
     * Analyze node title for prompt content
     */
    analyzeNodeTitle(node) {
        const title = node.title;
        if (!title || title === node.type) {
            return { method: 'node_title', detail: null, confidence: 0 };
        }

        // Long titles might contain prompt previews
        if (title.length > 40) {
            return {
                method: 'node_title',
                detail: `Long custom title (${title.length} chars) may contain prompt`,
                confidence: 15
            };
        }

        // Check for prompt keywords in title
        const titleLower = title.toLowerCase();
        const promptKeywords = ['positive', 'negative', 'prompt', 'style', 'quality'];

        for (const keyword of promptKeywords) {
            if (titleLower.includes(keyword)) {
                return {
                    method: 'node_title',
                    detail: `Title contains "${keyword}"`,
                    confidence: 20
                };
            }
        }

        return { method: 'node_title', detail: null, confidence: 0 };
    }

    // =========================================================================
    // Utility Methods
    // =========================================================================

    /**
     * Get a version identifier for the current graph state
     */
    getGraphVersion() {
        if (!app?.graph) return null;
        const nodes = app.graph._nodes || [];
        const links = app.graph.links || {};
        return `${nodes.length}-${Object.keys(links).length}`;
    }

    /**
     * Invalidate cache if graph structure changed
     */
    invalidateCacheIfNeeded() {
        const currentVersion = this.getGraphVersion();
        if (currentVersion !== this.lastGraphVersion) {
            this.conditioningFlowCache.clear();
        }
    }

    /**
     * Force cache invalidation
     */
    invalidateCache() {
        this.conditioningFlowCache.clear();
        this.lastGraphVersion = null;
    }

    /**
     * Get detection summary for debugging
     */
    getSummary() {
        const results = this.detectAll();
        const summary = {
            totalDetected: results.size,
            byConfidence: {
                high: 0,    // 70+
                medium: 0,  // 50-69
                low: 0      // 40-49
            },
            byMethod: {}
        };

        for (const [nodeId, result] of results) {
            if (result.confidence >= 70) summary.byConfidence.high++;
            else if (result.confidence >= 50) summary.byConfidence.medium++;
            else summary.byConfidence.low++;

            for (const reason of result.reasons) {
                summary.byMethod[reason.method] = (summary.byMethod[reason.method] || 0) + 1;
            }
        }

        return summary;
    }
}

// Export singleton instance and class
const promptGuardDetector = new PromptGuardDetector();

export {
    PromptGuardDetector,
    promptGuardDetector,
    CONFIDENCE_THRESHOLD,
    PROMPT_NODE_TYPES,
    PROMPT_WIDGET_NAMES,
    QUALITY_BOOSTERS,
    NEGATIVE_INDICATORS
};
