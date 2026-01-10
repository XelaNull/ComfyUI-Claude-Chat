/**
 * ComfyUI Workflow API - Group Management Module
 *
 * Extracted from workflow_api.js for maintainability.
 * Contains all group-related operations.
 */

import { app } from "../../../scripts/app.js";

// =========================================================
// SET/GET NODE UTILITIES
// =========================================================
// For replacing cross-group connections with virtual wires

/**
 * Check if Set/Get nodes are available (requires ComfyUI-Easy-Use)
 * This tests if the node types exist without adding them to the graph
 */
function areSetGetNodesAvailable() {
    try {
        // Check if the node types are registered in LiteGraph
        // We don't actually create nodes (which would add them to graph)
        // Just check if the type exists in the registered types
        const registeredTypes = LiteGraph.registered_node_types || {};
        const hasSetNode = 'easy setNode' in registeredTypes ||
                           'SetNode' in registeredTypes ||
                           'easy setnode' in registeredTypes;
        const hasGetNode = 'easy getNode' in registeredTypes ||
                           'GetNode' in registeredTypes ||
                           'easy getnode' in registeredTypes;

        if (hasSetNode && hasGetNode) {
            return true;
        }

        // Fallback: try to create a test node (but DON'T add to graph)
        const testSet = LiteGraph.createNode("easy setNode");
        const testGet = LiteGraph.createNode("easy getNode");

        // Verify they have the expected structure
        const setValid = testSet && typeof testSet.id !== 'undefined';
        const getValid = testGet && typeof testGet.id !== 'undefined';

        return setValid && getValid;
    } catch (e) {
        console.warn('[WorkflowAPI] Set/Get nodes not available:', e.message);
        return false;
    }
}

/**
 * Create a Set node with a given name
 * @param {string} name - Variable name
 * @param {string} type - Data type (MODEL, CLIP, etc.)
 * @returns {object} The created SetNode
 */
function createSetNode(name, type) {
    const setNode = LiteGraph.createNode("easy setNode");
    if (!setNode) return null;

    // Set the variable name via widget
    if (setNode.widgets && setNode.widgets[0]) {
        setNode.widgets[0].value = name;
    }
    setNode.title = `Set_${name}`;

    // Configure input type
    if (setNode.inputs && setNode.inputs[0]) {
        setNode.inputs[0].type = type;
        setNode.inputs[0].name = type;
    }

    return setNode;
}

/**
 * Create a Get node with a given name
 * @param {string} name - Variable name to retrieve
 * @param {string} type - Data type (MODEL, CLIP, etc.)
 * @returns {object} The created GetNode
 */
function createGetNode(name, type) {
    const getNode = LiteGraph.createNode("easy getNode");
    if (!getNode) return null;

    // Set the variable name via widget
    if (getNode.widgets && getNode.widgets[0]) {
        getNode.widgets[0].value = name;
    }
    getNode.title = `Get_${name}`;

    // Configure output type
    if (getNode.outputs && getNode.outputs[0]) {
        getNode.outputs[0].type = type;
        getNode.outputs[0].name = type;
    }

    return getNode;
}

/**
 * Generate a unique variable name for a Set/Get pair
 * @param {object} sourceNode - The source node
 * @param {number} slotIndex - The output slot index
 * @param {string} type - The data type
 * @param {Set} usedNames - Set of already used names
 * @returns {string} Unique variable name
 */
function generateVariableName(sourceNode, slotIndex, type, usedNames) {
    // Try to create a meaningful name based on source node and type
    const nodeTitle = (sourceNode.title || sourceNode.type || 'Node').replace(/[^a-zA-Z0-9]/g, '');
    const slotName = sourceNode.outputs?.[slotIndex]?.name || type;
    let baseName = `${nodeTitle}_${slotName}`;

    // Ensure uniqueness
    let name = baseName;
    let counter = 1;
    while (usedNames.has(name)) {
        name = `${baseName}_${counter}`;
        counter++;
    }
    usedNames.add(name);
    return name;
}

/**
 * Group management methods to be mixed into WorkflowAPI
 */
export const GroupMethods = {
    /**
     * Create a new group
     * @param {string} title - Group title
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} width - Group width
     * @param {number} height - Group height
     * @param {string} color - Optional color (e.g., "#A88" or "red")
     */
    createGroup(title, x, y, width, height, color = null) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            this.saveUndoState(`Create group: ${title}`);

            const group = new LiteGraph.LGraphGroup();
            group.title = title;
            group.pos = [x, y];
            group.size = [width, height];
            if (color) {
                group.color = color;
            }

            app.graph.add(group);
            app.graph.setDirtyCanvas(true, true);

            const groups = app.graph._groups || [];
            const groupIndex = groups.length - 1;

            return {
                success: true,
                group_index: groupIndex,
                title: title,
                bounds: { x, y, width, height },
                message: `Created group "${title}" at (${x}, ${y}) with size ${width}x${height}`
            };
        } catch (e) {
            console.error('[WorkflowAPI] createGroup failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Create a group automatically sized to contain specific nodes
     * This is the PREFERRED way to create groups - avoids guessing dimensions
     * @param {string} title - Group title
     * @param {number[]} nodeIds - Array of node IDs to contain
     * @param {string} color - Optional color (e.g., "#A88")
     * @param {number} padding - Padding around nodes (default 40)
     */
    createGroupForNodes(title, nodeIds, color = null, padding = 60) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            if (!nodeIds || nodeIds.length === 0) {
                return { success: false, error: "No node IDs provided" };
            }

            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;

            for (const nodeId of nodeIds) {
                const node = app.graph.getNodeById(nodeId);
                if (!node) continue;

                const nodeWidth = node.size?.[0] || 200;
                const nodeHeight = node.size?.[1] || 100;

                minX = Math.min(minX, node.pos[0]);
                minY = Math.min(minY, node.pos[1]);
                maxX = Math.max(maxX, node.pos[0] + nodeWidth);
                maxY = Math.max(maxY, node.pos[1] + nodeHeight);
            }

            if (minX === Infinity) {
                return { success: false, error: "No valid nodes found for those IDs" };
            }

            const x = minX - padding;
            const y = minY - padding - 30;
            const width = (maxX - minX) + (padding * 2);
            const height = (maxY - minY) + (padding * 2) + 30;

            this.saveUndoState(`Create group for nodes: ${title}`);

            const group = new LiteGraph.LGraphGroup();
            group.title = title;
            group.pos = [x, y];
            group.size = [width, height];
            if (color) {
                group.color = color;
            }

            app.graph.add(group);
            app.graph.setDirtyCanvas(true, true);

            const groups = app.graph._groups || [];
            const groupIndex = groups.length - 1;

            return {
                success: true,
                group_index: groupIndex,
                title: title,
                bounds: { x, y, width, height },
                node_count: nodeIds.length,
                message: `Created group "${title}" fitted to ${nodeIds.length} nodes`
            };
        } catch (e) {
            console.error('[WorkflowAPI] createGroupForNodes failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * List all groups in the workflow
     */
    listGroups() {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const groups = (app.graph._groups || []).filter(g => g && g.pos && g.size);
            const groupList = groups.map((g, index) => ({
                index: index,
                title: g.title,
                color: g.color,
                bounds: {
                    x: g.pos[0],
                    y: g.pos[1],
                    width: g.size[0],
                    height: g.size[1]
                }
            }));

            return { success: true, groups: groupList, count: groupList.length };
        } catch (e) {
            console.error('[WorkflowAPI] listGroups failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Check for overlapping groups
     * @param {number} minGap - Minimum gap between groups (default 20px)
     */
    checkGroupOverlaps(minGap = 50) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const groups = (app.graph._groups || []).filter(g => g && g.pos && g.size);
            const overlaps = [];

            for (let i = 0; i < groups.length; i++) {
                for (let j = i + 1; j < groups.length; j++) {
                    const g1 = groups[i];
                    const g2 = groups[j];

                    const g1Left = g1.pos[0] - minGap;
                    const g1Right = g1.pos[0] + g1.size[0] + minGap;
                    const g1Top = g1.pos[1] - minGap;
                    const g1Bottom = g1.pos[1] + g1.size[1] + minGap;

                    const g2Left = g2.pos[0];
                    const g2Right = g2.pos[0] + g2.size[0];
                    const g2Top = g2.pos[1];
                    const g2Bottom = g2.pos[1] + g2.size[1];

                    const overlapsX = g1Left < g2Right && g1Right > g2Left;
                    const overlapsY = g1Top < g2Bottom && g1Bottom > g2Top;

                    if (overlapsX && overlapsY) {
                        overlaps.push({
                            group1: { index: i, title: g1.title },
                            group2: { index: j, title: g2.title },
                            issue: this._describeOverlap(g1, g2, minGap)
                        });
                    }
                }
            }

            return {
                success: true,
                has_overlaps: overlaps.length > 0,
                overlaps: overlaps,
                message: overlaps.length === 0
                    ? "No overlapping groups found"
                    : `Found ${overlaps.length} group overlap(s) that need fixing`
            };
        } catch (e) {
            console.error('[WorkflowAPI] checkGroupOverlaps failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Helper to describe the overlap between two groups
     */
    _describeOverlap(g1, g2, minGap) {
        const g1Right = g1.pos[0] + g1.size[0];
        const g2Left = g2.pos[0];
        const g1Bottom = g1.pos[1] + g1.size[1];
        const g2Top = g2.pos[1];

        const horizontalOverlap = Math.min(g1Right, g2.pos[0] + g2.size[0]) - Math.max(g1.pos[0], g2.pos[0]);
        const verticalOverlap = Math.min(g1Bottom, g2.pos[1] + g2.size[1]) - Math.max(g1.pos[1], g2.pos[1]);

        if (horizontalOverlap > 0 && verticalOverlap > 0) {
            return `Overlapping by ${Math.round(horizontalOverlap)}x${Math.round(verticalOverlap)}px`;
        } else {
            const gap = Math.max(
                Math.abs(g1Right - g2Left),
                Math.abs(g2.pos[0] + g2.size[0] - g1.pos[0]),
                Math.abs(g1Bottom - g2Top),
                Math.abs(g2.pos[1] + g2.size[1] - g1.pos[1])
            );
            return `Too close (gap: ${Math.round(gap)}px, need ${minGap}px)`;
        }
    },

    /**
     * Find existing group that contains or should contain a node type
     * @param {string} nodeType - The type of node being added
     */
    findGroupForNodeType(nodeType) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            // Filter out undefined/null groups (can happen after graph reload)
            const groups = (app.graph._groups || []).filter(g => g && g.pos && g.size);
            const typeLower = nodeType.toLowerCase();

            const categoryMap = {
                'model loading': ['checkpoint', 'loader', 'vae', 'clip', 'unet'],
                'prompts': ['cliptext', 'conditioning', 'encode', 'prompt'],
                'conditioning': ['cliptext', 'conditioning', 'encode', 'prompt', 'lora'],
                'sampling': ['ksampler', 'sampler', 'scheduler', 'noise'],
                'post-processing': ['upscale', 'detailer', 'face', 'enhance', 'sharpen'],
                'output': ['save', 'preview', 'image']
            };

            for (let i = 0; i < groups.length; i++) {
                const group = groups[i];
                const titleLower = (group.title || '').toLowerCase();

                for (const [category, keywords] of Object.entries(categoryMap)) {
                    if (titleLower.includes(category.split(' ')[0]) ||
                        titleLower.includes(category.split('/')[0])) {
                        if (keywords.some(kw => typeLower.includes(kw))) {
                            return {
                                success: true,
                                found: true,
                                group_index: i,
                                group_title: group.title,
                                bounds: {
                                    x: group.pos[0],
                                    y: group.pos[1],
                                    width: group.size[0],
                                    height: group.size[1]
                                },
                                message: `Found existing "${group.title}" group for ${nodeType}`
                            };
                        }
                    }
                }
            }

            return {
                success: true,
                found: false,
                message: `No existing group found for ${nodeType} - create a new one`
            };
        } catch (e) {
            console.error('[WorkflowAPI] findGroupForNodeType failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Move a group AND all nodes inside it to a new position
     * @param {number} groupIndex - Index of the group
     * @param {number} deltaX - Pixels to move horizontally
     * @param {number} deltaY - Pixels to move vertically
     */
    moveGroupWithContents(groupIndex, deltaX, deltaY) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const groups = app.graph._groups || [];
            if (groupIndex < 0 || groupIndex >= groups.length) {
                return { success: false, error: `Invalid group index: ${groupIndex}` };
            }

            const group = groups[groupIndex];
            // Guard against undefined/null groups (can happen after graph operations)
            if (!group || !group.pos || !group.size) {
                return { success: false, error: `Group at index ${groupIndex} is invalid or undefined` };
            }
            this.saveUndoState(`Move group with contents: ${group.title}`);

            const nodesInGroup = [];
            const gLeft = group.pos[0];
            const gTop = group.pos[1];
            const gRight = gLeft + group.size[0];
            const gBottom = gTop + group.size[1];

            for (const node of app.graph._nodes) {
                const nLeft = node.pos[0];
                const nTop = node.pos[1];
                const nRight = nLeft + (node.size?.[0] || 200);
                const nBottom = nTop + (node.size?.[1] || 100);

                if (nLeft >= gLeft && nTop >= gTop && nRight <= gRight && nBottom <= gBottom) {
                    nodesInGroup.push(node);
                }
            }

            for (const node of nodesInGroup) {
                node.pos[0] += deltaX;
                node.pos[1] += deltaY;
            }

            group.pos[0] += deltaX;
            group.pos[1] += deltaY;

            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                title: group.title,
                nodes_moved: nodesInGroup.length,
                new_position: { x: group.pos[0], y: group.pos[1] },
                message: `Moved group "${group.title}" and ${nodesInGroup.length} nodes by (${deltaX}, ${deltaY})`
            };
        } catch (e) {
            console.error('[WorkflowAPI] moveGroupWithContents failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Resize/reposition a group
     */
    resizeGroup(groupIndex, x = null, y = null, width = null, height = null) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const groups = app.graph._groups || [];
            if (groupIndex < 0 || groupIndex >= groups.length) {
                return { success: false, error: `Invalid group index: ${groupIndex}` };
            }

            const group = groups[groupIndex];
            // Guard against undefined/null groups (can happen after graph operations)
            if (!group || !group.pos || !group.size) {
                return { success: false, error: `Group at index ${groupIndex} is invalid or undefined` };
            }
            this.saveUndoState(`Resize group: ${group.title}`);

            if (x !== null) group.pos[0] = x;
            if (y !== null) group.pos[1] = y;
            if (width !== null) group.size[0] = width;
            if (height !== null) group.size[1] = height;

            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                title: group.title,
                bounds: {
                    x: group.pos[0],
                    y: group.pos[1],
                    width: group.size[0],
                    height: group.size[1]
                },
                message: `Resized group "${group.title}"`
            };
        } catch (e) {
            console.error('[WorkflowAPI] resizeGroup failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Rename a group
     */
    renameGroup(groupIndex, newTitle) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const groups = app.graph._groups || [];
            if (groupIndex < 0 || groupIndex >= groups.length) {
                return { success: false, error: `Invalid group index: ${groupIndex}` };
            }

            const group = groups[groupIndex];
            // Guard against undefined/null groups (can happen after graph operations)
            if (!group) {
                return { success: false, error: `Group at index ${groupIndex} is invalid or undefined` };
            }
            const oldTitle = group.title;
            this.saveUndoState(`Rename group: ${oldTitle} -> ${newTitle}`);

            group.title = newTitle;
            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                old_title: oldTitle,
                new_title: newTitle,
                message: `Renamed group from "${oldTitle}" to "${newTitle}"`
            };
        } catch (e) {
            console.error('[WorkflowAPI] renameGroup failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Delete a group (nodes inside are NOT deleted)
     */
    deleteGroup(groupIndex) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const groups = app.graph._groups || [];
            if (groupIndex < 0 || groupIndex >= groups.length) {
                return { success: false, error: `Invalid group index: ${groupIndex}` };
            }

            const group = groups[groupIndex];
            // Guard against undefined/null groups (can happen after graph operations)
            if (!group) {
                return { success: false, error: `Group at index ${groupIndex} is invalid or undefined` };
            }
            const title = group.title;
            this.saveUndoState(`Delete group: ${title}`);

            app.graph.remove(group);
            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                deleted_title: title,
                message: `Deleted group "${title}" (nodes were not deleted)`
            };
        } catch (e) {
            console.error('[WorkflowAPI] deleteGroup failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Replace a group atomically
     */
    replaceGroup(groupIndex, newTitle, nodeIds, color = null, padding = 80) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            if (!nodeIds || nodeIds.length === 0) {
                return { success: false, error: "No node IDs provided" };
            }

            const groups = app.graph._groups || [];
            let oldTitle = null;

            this.saveUndoState(`Replace group: ${newTitle}`);

            if (groupIndex >= 0 && groupIndex < groups.length) {
                const oldGroup = groups[groupIndex];
                oldTitle = oldGroup.title;
                app.graph.remove(oldGroup);
            }

            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;

            for (const nodeId of nodeIds) {
                const node = app.graph.getNodeById(nodeId);
                if (!node) continue;

                let nodeWidth, nodeHeight;
                if (node.computeSize) {
                    const computed = node.computeSize();
                    nodeWidth = computed[0];
                    nodeHeight = computed[1];
                } else {
                    nodeWidth = node.size?.[0] || 200;
                    nodeHeight = node.size?.[1] || 100;
                }

                minX = Math.min(minX, node.pos[0]);
                minY = Math.min(minY, node.pos[1]);
                maxX = Math.max(maxX, node.pos[0] + nodeWidth);
                maxY = Math.max(maxY, node.pos[1] + nodeHeight);
            }

            if (minX === Infinity) {
                return { success: false, error: "No valid nodes found for those IDs" };
            }

            const x = minX - padding;
            const y = minY - padding - 40;
            const width = (maxX - minX) + (padding * 2);
            const height = (maxY - minY) + (padding * 2) + 40;

            const newGroup = new LiteGraph.LGraphGroup();
            newGroup.title = newTitle;
            newGroup.pos = [x, y];
            newGroup.size = [width, height];
            if (color) {
                newGroup.color = color;
            }

            app.graph.add(newGroup);
            app.graph.setDirtyCanvas(true, true);

            const newGroups = app.graph._groups || [];
            const newIndex = newGroups.length - 1;

            return {
                success: true,
                replaced: oldTitle !== null,
                old_title: oldTitle,
                new_index: newIndex,
                title: newTitle,
                bounds: { x, y, width, height },
                node_count: nodeIds.length,
                message: oldTitle
                    ? `Replaced "${oldTitle}" with "${newTitle}" (${nodeIds.length} nodes)`
                    : `Created "${newTitle}" group (${nodeIds.length} nodes)`
            };
        } catch (e) {
            console.error('[WorkflowAPI] replaceGroup failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Delete all groups in the workflow
     */
    deleteAllGroups() {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const groups = [...(app.graph._groups || [])];
            if (groups.length === 0) {
                return { success: true, deleted_count: 0, message: "No groups to delete" };
            }

            this.saveUndoState(`Delete all ${groups.length} groups`);

            const titles = groups.map(g => g.title);
            for (const group of groups) {
                app.graph.remove(group);
            }

            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                deleted_count: titles.length,
                deleted_titles: titles,
                message: `Deleted ${titles.length} groups: ${titles.join(', ')}`
            };
        } catch (e) {
            console.error('[WorkflowAPI] deleteAllGroups failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * AUTO-ORGANIZE ENTIRE WORKFLOW IN ONE CALL
     */
    async autoOrganizeWorkflow(options = {}) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const {
                groupPadding = 60,
                groupSpacing = 60,  // Reduced from 120 for tighter layout
                nodeSpacing = 30,
                startX = 50,
                startY = 50,
                includeDescriptions = true,  // Add Note nodes with group descriptions
                cableless = false  // Replace cross-group cables with Set/Get virtual wires
            } = options;

            // =========================================================
            // NOTE NODE SIZING - All Note-related dimensions in one place
            // =========================================================
            const NOTE_CONFIG = {
                // Group title bar height (LiteGraph default)
                groupTitleHeight: 35,
                // Padding between group title and Note node (increased to push content down)
                topPadding: 40,
                // Actual Note node height (what we set on the node)
                nodeHeight: 60,
                // Padding between Note node and first workflow node
                bottomPadding: 25,
            };
            // Total vertical space reserved for Note section
            // = topPadding + nodeHeight + bottomPadding = 20 + 60 + 25 = 105
            const descriptionNodeHeight = includeDescriptions
                ? (NOTE_CONFIG.topPadding + NOTE_CONFIG.nodeHeight + NOTE_CONFIG.bottomPadding)
                : 0;
            // Y offset from group top where Note node starts
            const noteYOffset = NOTE_CONFIG.groupTitleHeight + NOTE_CONFIG.topPadding;

            // =========================================================
            // TALL NODE LAYOUT - Intelligent horizontal placement
            // =========================================================
            // Tall nodes (like FaceDetailer) are placed side-by-side instead of
            // stacking vertically to avoid extremely tall groups
            const TALL_NODE_CONFIG = {
                // Height threshold - nodes taller than this are considered "tall"
                heightThreshold: 350,
                // Widget count threshold - nodes with this many widgets are "tall"
                widgetCountThreshold: 8,
                // Max nodes per row when placing tall nodes horizontally
                maxNodesPerRow: 3,
                // Extra horizontal spacing between side-by-side nodes
                horizontalSpacing: 20,
            };

            // =========================================================
            // COLUMN STACKING - Vertical group stacking to save width
            // =========================================================
            // When some groups are much shorter than others, stack short
            // adjacent groups vertically to reduce total workflow width
            const COLUMN_STACK_CONFIG = {
                // Enable/disable column stacking optimization
                enabled: true,
                // Minimum height ratio (tallest/shortest) to trigger stacking
                // If all groups are similar height, don't bother stacking
                minHeightRatioToStack: 1.8,
                // Max groups that can be stacked in one column
                maxGroupsPerColumn: 2,
                // Stacked groups can exceed tallest group by this percentage
                // 0.15 = 15% overflow allowed
                heightOverflowTolerance: 0.15,
                // Vertical spacing between stacked groups within a column
                stackSpacing: 40,
                // Minimum width savings (px) to justify stacking
                // Don't stack if it only saves a tiny amount of horizontal space
                minWidthSavings: 100,
            };

            // Group descriptions for Note nodes (user-centric language)
            const groupDescriptions = {
                'Setup': 'Configure your model, VAE, canvas dimensions, and detection models.',
                'LoRAs': 'Style and concept modifiers applied to your model.',
                'Prompts': 'Describe what you want to generate (positive) and avoid (negative).',
                'Generation': 'Control how the image is generated: steps, CFG, sampler, seed.',
                'Post-Processing': 'Enhance results: face detail, upscaling, refinement.',
                'Output': 'View and save your generated images.',
                'Other': 'Utility nodes and custom operations.'
            };

            const graphNodes = app.graph._nodes || [];
            if (graphNodes.length === 0) {
                return { success: false, error: "No nodes in workflow" };
            }

            this.saveUndoState('Auto-organize workflow');

            // =========================================================
            // CONNECTION SNAPSHOT (for post-organize validation)
            // =========================================================
            // Capture ALL connections BEFORE organize so we can verify they're preserved
            const preOrganizeConnections = [];
            const preLinks = app.graph.links || {};
            for (const [linkId, link] of Object.entries(preLinks)) {
                if (!link) continue;
                let originId, originSlot, targetId, targetSlot, type;
                if (Array.isArray(link)) {
                    originId = link[1];
                    originSlot = link[2];
                    targetId = link[3];
                    targetSlot = link[4];
                    type = link[5];
                } else {
                    originId = link.origin_id;
                    originSlot = link.origin_slot;
                    targetId = link.target_id;
                    targetSlot = link.target_slot;
                    type = link.type;
                }
                const originNode = app.graph.getNodeById(originId);
                const targetNode = app.graph.getNodeById(targetId);
                preOrganizeConnections.push({
                    linkId: parseInt(linkId),
                    originId,
                    originSlot,
                    targetId,
                    targetSlot,
                    type,
                    originType: originNode?.type || 'unknown',
                    targetType: targetNode?.type || 'unknown',
                    originTitle: originNode?.title || originNode?.type || `#${originId}`,
                    targetTitle: targetNode?.title || targetNode?.type || `#${targetId}`
                });
            }
            console.log(`[WorkflowAPI] Pre-organize: ${preOrganizeConnections.length} connections captured`);

            // =========================================================
            // BUILD CONNECTION GRAPH FIRST (needed for topology-aware categorization)
            // =========================================================
            const links = app.graph.links || {};
            const linkArray = Object.values(links).filter(l => l);

            // Build incoming edges map: nodeId -> [sourceNodeIds]
            const incomingEdges = new Map();
            // Build outgoing edges map: nodeId -> [targetNodeIds]
            const outgoingEdges = new Map();

            for (const node of graphNodes) {
                incomingEdges.set(node.id, []);
                outgoingEdges.set(node.id, []);
            }

            for (const link of linkArray) {
                let originId, targetId;
                if (Array.isArray(link)) {
                    originId = link[1];
                    targetId = link[3];
                } else {
                    originId = link.origin_id;
                    targetId = link.target_id;
                }
                if (originId != null && targetId != null) {
                    if (incomingEdges.has(targetId)) {
                        incomingEdges.get(targetId).push(originId);
                    }
                    if (outgoingEdges.has(originId)) {
                        outgoingEdges.get(originId).push(targetId);
                    }
                }
            }

            // Helper: Check if a node is a processing node (not terminal)
            const isProcessingNode = (nodeId) => {
                const node = graphNodes.find(n => n.id === nodeId);
                if (!node) return false;
                const type = (node.type || '').toLowerCase();
                // Processing nodes: detailers, upscalers, samplers, etc.
                return type.includes('detailer') || type.includes('upscale') ||
                       type.includes('sampler') || type.includes('ksampler') ||
                       type.includes('enhance') || type.includes('sharpen') ||
                       type.includes('refiner') || type.includes('controlnet');
            };

            // Helper: Check if a Preview/Save node is a CHECKPOINT (not terminal output)
            // A checkpoint is when its source ALSO feeds processing nodes
            const isCheckpointPreview = (node) => {
                const type = (node.type || '').toLowerCase();
                // Only applies to preview/save type nodes
                if (!type.includes('preview') && !type.includes('save')) return false;

                // Get the source nodes feeding this preview
                const sources = incomingEdges.get(node.id) || [];
                if (sources.length === 0) return false;

                // Check if ANY source also feeds processing nodes
                for (const sourceId of sources) {
                    const sourceTargets = outgoingEdges.get(sourceId) || [];
                    for (const targetId of sourceTargets) {
                        if (targetId === node.id) continue; // Skip self
                        if (isProcessingNode(targetId)) {
                            // This source feeds both our preview AND a processing node
                            // So our preview is a checkpoint, not final output
                            return true;
                        }
                    }
                }
                return false;
            };

            // Helper: Find what category a checkpoint preview belongs to
            // Put the preview in the SAME group as its source node (keeps them together)
            const getCheckpointCategory = (node) => {
                const sources = incomingEdges.get(node.id) || [];

                for (const sourceId of sources) {
                    const sourceNode = graphNodes.find(n => n.id === sourceId);
                    if (!sourceNode) continue;

                    const type = (sourceNode.type || '').toLowerCase();

                    // Determine what category the SOURCE node would be in
                    // (same logic as categorizeNode but for non-preview nodes)

                    // Post-Processing: detailers, upscalers, etc.
                    if (type.includes('detailer') || type.includes('upscale') ||
                        type.includes('enhance') || type.includes('sharpen') ||
                        type.includes('refiner')) {
                        return 'Post-Processing';
                    }

                    // Generation: VAEDecode, samplers, latent operations
                    if (type.includes('vaedecode') || type.includes('vae decode') ||
                        (type.includes('decode') && type.includes('vae')) ||
                        type.includes('sampler') || type.includes('ksampler') ||
                        type.includes('latent')) {
                        return 'Generation';
                    }

                    // Setup: loaders
                    if (type.includes('loader') || type.includes('checkpoint')) {
                        return 'Setup';
                    }

                    // Prompts: CLIP, conditioning
                    if (type.includes('clip') || type.includes('conditioning')) {
                        return 'Prompts';
                    }
                }

                return 'Generation'; // Default fallback
            };

            // Categorize nodes - USER-CENTRIC grouping
            // Groups organized by what the USER does, not by data type
            // NOTE: 'order' values are defaults - they get REPLACED by topological sort below
            const categories = {
                'Setup': { nodes: [], color: '#2A4858', order: 0 },           // Model, VAE, canvas, detector providers
                'LoRAs': { nodes: [], color: '#3A5868', order: 1 },           // Style/concept modifiers
                'Prompts': { nodes: [], color: '#4A3858', order: 2 },         // Text prompts, conditioning
                'Generation': { nodes: [], color: '#385828', order: 3 },      // KSampler settings
                'Post-Processing': { nodes: [], color: '#584828', order: 4 }, // Detailers, upscalers, enhance
                'Output': { nodes: [], color: '#285858', order: 5 },          // TERMINAL: save, preview only
                'Other': { nodes: [], color: '#484848', order: 6 }            // Utilities
            };

            const categorizeNode = (node) => {
                const type = (node.type || '').toLowerCase();

                // LORAS: Style and concept modifiers (separate group if they exist)
                if (type.includes('lora')) {
                    return 'LoRAs';
                }

                // SETUP: Things you configure once (model selection, canvas size)
                // - Checkpoint loaders, VAE loaders
                // - Empty Latent Image (canvas dimensions)
                // - Detector providers (load detection models like YOLO)
                // - Any "loader" or "provider" type node
                if (type.includes('loader') || type.includes('checkpoint') ||
                    type.includes('load')) {
                    return 'Setup';
                }
                // Detector providers load models - they're setup, not output
                // e.g., UltralyticsDetectorProvider, SAMLoader, etc.
                if (type.includes('provider') || type.includes('ultralytic') ||
                    type.includes('samloader') || (type.includes('detector') && !type.includes('detailer'))) {
                    return 'Setup';
                }
                // Empty Latent = canvas size setup (not a "latent operation")
                if (type.includes('emptylatent') || type === 'emptylatentimage') {
                    return 'Setup';
                }
                // Latent inputs (from image) are also setup
                if (type.includes('latent') && (type.includes('image') || type.includes('encode'))) {
                    // VAEEncode turns image->latent, that's input setup for img2img
                    if (!type.includes('decode')) {
                        return 'Setup';
                    }
                }

                // PROMPTS: Your creative input (what to generate)
                // - CLIP Text Encode, conditioning nodes, prompt text
                if (type.includes('clip') || type.includes('conditioning') ||
                    type.includes('encode') || type.includes('prompt')) {
                    // But not VAEEncode (that's setup for img2img)
                    if (!type.includes('vae')) {
                        return 'Prompts';
                    }
                }

                // GENERATION: The sampling process (how to generate)
                // - KSampler, schedulers, noise
                if (type.includes('sampler') || type.includes('ksampler') ||
                    type.includes('sample') || type.includes('scheduler') ||
                    type.includes('noise')) {
                    return 'Generation';
                }

                // POST-PROCESSING: Enhancement after generation
                // - Detailers (FaceDetailer, DetailerForEach)
                // - Upscalers, sharpen, enhance
                // These come BEFORE terminal output nodes
                if (type.includes('detailer') || type.includes('upscale') ||
                    type.includes('enhance') || type.includes('sharpen') ||
                    type.includes('refiner')) {
                    return 'Post-Processing';
                }

                // VAEDecode converts latent→image - end of Generation pipeline, NOT terminal
                // It produces images that flow to detailers/save, so not Output
                if (type.includes('vaedecode') || type.includes('vae decode') ||
                    (type.includes('decode') && type.includes('vae'))) {
                    return 'Generation';
                }

                // OUTPUT vs CHECKPOINT: Topology-aware categorization for Preview/Save nodes
                // - CHECKPOINT: Preview that shows intermediate state (source also feeds processing)
                // - OUTPUT: Terminal preview/save at end of pipeline
                if (type.includes('saveimage') || type.includes('previewimage') ||
                    type.includes('save image') || type.includes('preview image') ||
                    type === 'saveimage' || type === 'previewimage' ||
                    (type.includes('save') && type.includes('image')) ||
                    (type.includes('preview') && !type.includes('latent'))) {

                    // Check topology: is this a checkpoint or terminal output?
                    if (isCheckpointPreview(node)) {
                        const checkpointCategory = getCheckpointCategory(node);
                        console.log(`[WorkflowAPI] Node "${node.title || node.type}" (${node.id}) detected as CHECKPOINT → ${checkpointCategory}`);
                        return checkpointCategory;
                    }
                    // Terminal output
                    return 'Output';
                }

                // Remaining latent operations (blend, composite, etc.)
                if (type.includes('latent')) {
                    return 'Generation';
                }

                return 'Other';
            };

            // Filter out utility nodes - they're not workflow nodes
            // - Note nodes (documentation)
            // - Set/Get nodes (virtual connections - we'll create fresh ones)
            const workflowNodes = graphNodes.filter(node => {
                const type = (node.type || '').toLowerCase();
                return type !== 'note' &&
                       type !== 'easy setnode' &&
                       type !== 'easy getnode';
            });

            for (const node of workflowNodes) {
                const category = categorizeNode(node);
                categories[category].nodes.push(node);
            }

            // =========================================================
            // MULTI-STAGE OUTPUT DETECTION
            // =========================================================
            // When outputs occur at different pipeline stages, create separate
            // output groups. This handles workflows like:
            //   VAE Decode → Preview1 → FaceDetailer → Preview2 → Upscaler → Preview3
            // Which should create: "Initial Output", "Post-Detail", "Final Output"
            //
            // Algorithm:
            // 1. For each output node, trace upstream to find nearest processor
            // 2. Group outputs by their upstream processor type
            // 3. Name groups based on what processing preceded them

            const getOutputStage = (outputNode) => {
                // Trace backwards from output to find what processing preceded it
                const visited = new Set();
                const queue = [outputNode.id];
                let foundDetailer = false;
                let foundUpscaler = false;
                let foundSampler = false;

                while (queue.length > 0) {
                    const nodeId = queue.shift();
                    if (visited.has(nodeId)) continue;
                    visited.add(nodeId);

                    const node = graphNodes.find(n => n.id === nodeId);
                    if (!node) continue;

                    const type = (node.type || '').toLowerCase();

                    // Check what processing type this is
                    if (type.includes('detailer') || type.includes('detail')) {
                        foundDetailer = true;
                    }
                    if (type.includes('upscale') || type.includes('upscaler')) {
                        foundUpscaler = true;
                    }
                    if (type.includes('sampler') || type.includes('ksampler')) {
                        foundSampler = true;
                    }

                    // Add upstream nodes to queue
                    const sources = incomingEdges.get(nodeId) || [];
                    queue.push(...sources);
                }

                // Determine stage based on what we found upstream
                // Most downstream processor determines the stage
                if (foundUpscaler) return 'Final Output';
                if (foundDetailer) return 'Post-Detail';
                if (foundSampler) return 'Initial Output';
                return 'Output'; // Fallback
            };

            // Check if we need multi-stage outputs
            const outputNodes = categories['Output'].nodes;
            if (outputNodes.length > 0) {
                const stageMap = new Map(); // stage name → nodes

                for (const outputNode of outputNodes) {
                    const stage = getOutputStage(outputNode);
                    if (!stageMap.has(stage)) {
                        stageMap.set(stage, []);
                    }
                    stageMap.get(stage).push(outputNode);
                }

                // If only one stage, keep simple "Output" name
                if (stageMap.size === 1) {
                    // Keep the single Output category as-is
                    console.log('[WorkflowAPI] Single output stage detected');
                } else {
                    // Multiple stages - create separate categories
                    console.log('[WorkflowAPI] Multi-stage outputs detected:', [...stageMap.keys()]);

                    // Clear the original Output category
                    categories['Output'].nodes = [];

                    // Stage order for positioning
                    const stageOrder = {
                        'Initial Output': 5,
                        'Post-Detail': 6,
                        'Final Output': 7,
                        'Output': 5 // Fallback
                    };

                    // Stage colors (slight variations of cyan)
                    const stageColors = {
                        'Initial Output': '#285858',
                        'Post-Detail': '#2A6868',
                        'Final Output': '#2C7878',
                        'Output': '#285858'
                    };

                    // Create category for each stage
                    for (const [stage, nodes] of stageMap) {
                        if (stage === 'Output') {
                            // Use existing Output category
                            categories['Output'].nodes = nodes;
                        } else {
                            // Create new stage-specific category
                            categories[stage] = {
                                nodes: nodes,
                                color: stageColors[stage] || '#285858',
                                order: stageOrder[stage] || 5
                            };
                        }
                    }
                }
            }

            // =========================================================
            // SANITY CHECK: Prompt Polarity Validation
            // =========================================================
            // Check if positive prompts connect to positive inputs and
            // negative prompts connect to negative inputs
            const sanityWarnings = [];

            const checkPromptPolarity = () => {
                const links = app.graph.links || {};

                // =====================================================================
                // SAMPLER-BASED POLARITY DETECTION (Source of Truth)
                // =====================================================================
                // The ONLY reliable way to determine if a conditioning node is positive
                // or negative is to trace its connection to the SAMPLER. Node types
                // and titles are unreliable - both positive and negative prompts use
                // the same CLIPTextEncode node type.
                //
                // Algorithm:
                // 1. Find all sampler nodes (KSampler, etc.) - these have definitive
                //    positive/negative input slots
                // 2. Trace backwards from sampler inputs to find which nodes are
                //    POSITIVE vs NEGATIVE
                // 3. For each conditioning node, verify ALL its other connections
                //    (to FaceDetailer, etc.) match the polarity established by sampler

                // Build polarity map: nodeId -> 'positive' | 'negative'
                const polarityMap = new Map();

                // Find all sampler nodes (authoritative source of polarity truth)
                const samplerNodes = graphNodes.filter(node => {
                    const type = (node.type || '').toLowerCase();
                    return type.includes('sampler') || type.includes('ksampler');
                });

                // Trace sampler positive/negative inputs to their source nodes
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

                        // This node's polarity is determined by sampler connection
                        const polarity = isPositive ? 'positive' : 'negative';
                        polarityMap.set(sourceId, polarity);
                    }
                }

                // Now check that ALL connections from polarized nodes are consistent
                // This catches errors like: POSITIVE node connected to a negative slot on FaceDetailer
                for (const [nodeId, expectedPolarity] of polarityMap) {
                    const promptNode = graphNodes.find(n => n.id === nodeId);
                    if (!promptNode || !promptNode.outputs) continue;

                    for (const output of promptNode.outputs) {
                        if (!output.links) continue;

                        for (const linkId of output.links) {
                            const link = links[linkId];
                            if (!link) continue;

                            // Get target node and slot
                            const targetId = Array.isArray(link) ? link[3] : link.target_id;
                            const targetSlot = Array.isArray(link) ? link[4] : link.target_slot;
                            const targetNode = graphNodes.find(n => n.id === targetId);

                            if (!targetNode || !targetNode.inputs) continue;

                            // Get the input slot name
                            const inputSlot = targetNode.inputs[targetSlot];
                            if (!inputSlot) continue;

                            const inputName = (inputSlot.name || '').toLowerCase();

                            // Skip if target slot doesn't have polarity (e.g., generic conditioning input)
                            const inputIsPositive = inputName.includes('positive') || inputName === 'pos';
                            const inputIsNegative = inputName.includes('negative') || inputName === 'neg';
                            if (!inputIsPositive && !inputIsNegative) continue;

                            // Check for polarity mismatch
                            if (expectedPolarity === 'positive' && inputIsNegative) {
                                sanityWarnings.push({
                                    type: 'polarity_mismatch',
                                    severity: 'error',
                                    message: `POSITIVE conditioning (#${promptNode.id}) connected to NEGATIVE input on "${targetNode.title || targetNode.type}" (by sampler trace)`,
                                    sourceNode: { id: promptNode.id, title: promptNode.title, type: promptNode.type, polarity: 'POSITIVE' },
                                    targetNode: { id: targetNode.id, title: targetNode.title, type: targetNode.type, inputName: inputSlot.name }
                                });
                            } else if (expectedPolarity === 'negative' && inputIsPositive) {
                                sanityWarnings.push({
                                    type: 'polarity_mismatch',
                                    severity: 'error',
                                    message: `NEGATIVE conditioning (#${promptNode.id}) connected to POSITIVE input on "${targetNode.title || targetNode.type}" (by sampler trace)`,
                                    sourceNode: { id: promptNode.id, title: promptNode.title, type: promptNode.type, polarity: 'NEGATIVE' },
                                    targetNode: { id: targetNode.id, title: targetNode.title, type: targetNode.type, inputName: inputSlot.name }
                                });
                            }
                        }
                    }
                }
            };

            // Run sanity checks
            checkPromptPolarity();

            // Log warnings
            if (sanityWarnings.length > 0) {
                console.warn('[WorkflowAPI] ⚠️ SANITY CHECK WARNINGS:');
                for (const warning of sanityWarnings) {
                    console.warn(`  - ${warning.message}`);
                }
            }

            // =========================================================
            // AUTO-PREVIEW INSERTION
            // =========================================================
            // Automatically add PreviewImage nodes at critical points:
            // - After VAE Decode when downstream processors exist
            // - After each detailer (FaceDetailer, etc.)
            // - After each upscaler (UltimateSDUpscale, etc.)
            //
            // This ensures users can see results at each processing stage
            const autoAddPreviews = options.autoAddPreviews !== false; // Default: enabled
            const addedPreviews = [];

            if (autoAddPreviews) {
                const links = app.graph.links || {};

                // Helper: Check if a node has a PreviewImage connected to a specific output
                const hasPreviewConnected = (node, outputSlot = 0) => {
                    if (!node.outputs || !node.outputs[outputSlot]) return false;
                    const outputLinks = node.outputs[outputSlot].links || [];
                    for (const linkId of outputLinks) {
                        const link = links[linkId];
                        if (!link) continue;
                        const targetId = Array.isArray(link) ? link[3] : link.target_id;
                        const targetNode = graphNodes.find(n => n.id === targetId);
                        if (targetNode) {
                            const targetType = (targetNode.type || '').toLowerCase();
                            if (targetType.includes('preview') || targetType.includes('saveimage')) {
                                return true;
                            }
                        }
                    }
                    return false;
                };

                // Helper: Find the IMAGE output slot index
                const findImageOutputSlot = (node) => {
                    if (!node.outputs) return 0;
                    for (let i = 0; i < node.outputs.length; i++) {
                        const output = node.outputs[i];
                        if (output.type === 'IMAGE' || output.name === 'IMAGE' || output.name === 'image') {
                            return i;
                        }
                    }
                    return 0; // Default to first slot
                };

                // Helper: Check if a node feeds into processing nodes (detailers, upscalers)
                const feedsIntoProcessors = (node) => {
                    const imageSlot = findImageOutputSlot(node);
                    if (!node.outputs || !node.outputs[imageSlot]) return false;
                    const outputLinks = node.outputs[imageSlot].links || [];
                    for (const linkId of outputLinks) {
                        const link = links[linkId];
                        if (!link) continue;
                        const targetId = Array.isArray(link) ? link[3] : link.target_id;
                        const targetNode = graphNodes.find(n => n.id === targetId);
                        if (targetNode) {
                            const targetType = (targetNode.type || '').toLowerCase();
                            if (targetType.includes('detailer') || targetType.includes('upscale') ||
                                targetType.includes('enhance') || targetType.includes('refiner')) {
                                return true;
                            }
                        }
                    }
                    return false;
                };

                // Find critical points that need previews
                const criticalPoints = [];

                for (const node of graphNodes) {
                    const type = (node.type || '').toLowerCase();
                    const imageSlot = findImageOutputSlot(node);

                    // 1. VAE Decode that feeds into processors (not just terminal output)
                    if ((type.includes('vaedecode') || type.includes('vae decode')) &&
                        feedsIntoProcessors(node) && !hasPreviewConnected(node, imageSlot)) {
                        criticalPoints.push({
                            node,
                            outputSlot: imageSlot,
                            reason: 'VAE Decode before processing',
                            position: 'initial'
                        });
                    }

                    // 2. Detailers (FaceDetailer, etc.) - always want preview after
                    if (type.includes('detailer') && !hasPreviewConnected(node, imageSlot)) {
                        criticalPoints.push({
                            node,
                            outputSlot: imageSlot,
                            reason: 'After detailer',
                            position: 'post-detail'
                        });
                    }

                    // 3. Upscalers - always want preview after
                    if ((type.includes('upscale') || type.includes('upscaler')) &&
                        !hasPreviewConnected(node, imageSlot)) {
                        criticalPoints.push({
                            node,
                            outputSlot: imageSlot,
                            reason: 'After upscaler',
                            position: 'final'
                        });
                    }
                }

                // Add PreviewImage nodes at critical points
                if (criticalPoints.length > 0) {
                    console.log(`[WorkflowAPI] Auto-adding ${criticalPoints.length} preview(s) at critical points`);

                    for (const point of criticalPoints) {
                        try {
                            // Create PreviewImage node
                            const previewNode = LiteGraph.createNode('PreviewImage');
                            if (!previewNode) {
                                console.warn('[WorkflowAPI] PreviewImage node type not available');
                                break;
                            }

                            // Position near the source node
                            previewNode.pos = [
                                point.node.pos[0] + (point.node.size?.[0] || 200) + 50,
                                point.node.pos[1]
                            ];

                            // Add to graph
                            app.graph.add(previewNode);

                            // Connect source to preview
                            point.node.connect(point.outputSlot, previewNode, 0);

                            // Add to our tracking
                            addedPreviews.push({
                                sourceId: point.node.id,
                                sourceType: point.node.type,
                                previewId: previewNode.id,
                                reason: point.reason
                            });

                            // Add to graphNodes for categorization
                            graphNodes.push(previewNode);

                            // Categorize this new preview
                            const previewCategory = point.position === 'initial' ? 'Initial Output' :
                                                   point.position === 'post-detail' ? 'Post-Detail' :
                                                   point.position === 'final' ? 'Final Output' : 'Output';

                            // Add to appropriate category (create if needed)
                            if (!categories[previewCategory]) {
                                categories[previewCategory] = {
                                    nodes: [],
                                    color: previewCategory === 'Initial Output' ? '#285858' :
                                           previewCategory === 'Post-Detail' ? '#2A6868' :
                                           previewCategory === 'Final Output' ? '#2C7878' : '#285858',
                                    order: previewCategory === 'Initial Output' ? 50 :
                                           previewCategory === 'Post-Detail' ? 54 :
                                           previewCategory === 'Final Output' ? 57 : 50
                                };
                            }
                            categories[previewCategory].nodes.push(previewNode);

                            console.log(`  Added preview after ${point.node.type} (#${point.node.id}) - ${point.reason}`);
                        } catch (previewError) {
                            console.error(`[WorkflowAPI] Failed to add preview: ${previewError.message}`);
                        }
                    }
                }
            }

            // =========================================================
            // TOPOLOGICAL SORT - Compute category order from data flow
            // =========================================================
            // Instead of hardcoded order, we analyze actual node connections
            // to determine the natural left-to-right flow of data

            const computeCategoryOrderFromDataFlow = () => {
                const links = app.graph.links || {};
                const linkArray = Object.values(links).filter(l => l); // Filter null links

                // Build incoming edges map: nodeId -> [sourceNodeIds]
                const incomingEdges = new Map();
                // Build outgoing edges map: nodeId -> [targetNodeIds]
                const outgoingEdges = new Map();

                for (const node of graphNodes) {
                    incomingEdges.set(node.id, []);
                    outgoingEdges.set(node.id, []);
                }

                // Process physical links
                for (const link of linkArray) {
                    // link format: [linkId, originNodeId, originSlot, targetNodeId, targetSlot, type]
                    // or object with origin_id, target_id properties
                    let originId, targetId;

                    if (Array.isArray(link)) {
                        originId = link[1];
                        targetId = link[3];
                    } else {
                        originId = link.origin_id;
                        targetId = link.target_id;
                    }

                    if (originId != null && targetId != null) {
                        if (incomingEdges.has(targetId)) {
                            incomingEdges.get(targetId).push(originId);
                        }
                        if (outgoingEdges.has(originId)) {
                            outgoingEdges.get(originId).push(targetId);
                        }
                    }
                }

                // Also process Set/Get virtual connections
                // Set nodes: collect the node connected to their input
                // Get nodes: find Set nodes with matching variable name
                const setNodes = graphNodes.filter(n => (n.type || '').toLowerCase() === 'easy setnode');
                const getNodes = graphNodes.filter(n => (n.type || '').toLowerCase() === 'easy getnode');

                for (const setNode of setNodes) {
                    const varName = setNode.widgets?.[0]?.value;
                    if (!varName) continue;

                    // Find the source node connected to this Set node
                    let sourceId = null;
                    if (setNode.inputs?.[0]?.link) {
                        const linkId = setNode.inputs[0].link;
                        const link = links[linkId];
                        if (link) {
                            sourceId = Array.isArray(link) ? link[1] : link.origin_id;
                        }
                    }

                    // Find matching Get nodes
                    for (const getNode of getNodes) {
                        const getVarName = getNode.widgets?.[0]?.value;
                        if (getVarName !== varName) continue;

                        // Find the target node connected to this Get node
                        if (getNode.outputs?.[0]?.links) {
                            for (const linkId of getNode.outputs[0].links) {
                                const link = links[linkId];
                                if (link) {
                                    const targetId = Array.isArray(link) ? link[3] : link.target_id;
                                    // Create implicit edge: source -> target
                                    if (sourceId && targetId && incomingEdges.has(targetId)) {
                                        incomingEdges.get(targetId).push(sourceId);
                                    }
                                    if (sourceId && targetId && outgoingEdges.has(sourceId)) {
                                        outgoingEdges.get(sourceId).push(targetId);
                                    }
                                }
                            }
                        }
                    }
                }

                // BFS from source nodes (no incoming edges) to compute depth
                const nodeDepths = new Map();
                const queue = [];

                // Find source nodes (no incoming edges)
                for (const node of graphNodes) {
                    const incoming = incomingEdges.get(node.id) || [];
                    if (incoming.length === 0) {
                        nodeDepths.set(node.id, 0);
                        queue.push(node.id);
                    }
                }

                // BFS to propagate depths
                while (queue.length > 0) {
                    const currentId = queue.shift();
                    const currentDepth = nodeDepths.get(currentId);
                    const outgoing = outgoingEdges.get(currentId) || [];

                    for (const targetId of outgoing) {
                        const existingDepth = nodeDepths.get(targetId);
                        const newDepth = currentDepth + 1;

                        // Use max depth (longest path to this node)
                        if (existingDepth === undefined || newDepth > existingDepth) {
                            nodeDepths.set(targetId, newDepth);
                            queue.push(targetId);
                        }
                    }
                }

                // Assign depth 0 to any disconnected nodes
                for (const node of graphNodes) {
                    if (!nodeDepths.has(node.id)) {
                        nodeDepths.set(node.id, 0);
                    }
                }

                // Calculate average depth for each category
                const categoryDepths = {};
                for (const [categoryName, categoryData] of Object.entries(categories)) {
                    if (categoryData.nodes.length === 0) continue;

                    let totalDepth = 0;
                    let minDepth = Infinity;

                    for (const node of categoryData.nodes) {
                        const depth = nodeDepths.get(node.id) || 0;
                        totalDepth += depth;
                        minDepth = Math.min(minDepth, depth);
                    }

                    // Use minimum depth as primary sort key (where category "starts" in flow)
                    // Use average as secondary for stability
                    const avgDepth = totalDepth / categoryData.nodes.length;
                    categoryDepths[categoryName] = {
                        minDepth: minDepth === Infinity ? 0 : minDepth,
                        avgDepth: avgDepth
                    };
                }

                // =====================================================================
                // CONSTRAINED CATEGORY ORDERING
                // =====================================================================
                // Topological depth alone can produce nonsensical orderings
                // (e.g., Output first if a PreviewImage is early in the flow)
                //
                // We use a HYBRID approach:
                // 1. Categories have PINNED order ranges (Setup first, Output last)
                // 2. Within flexible categories, use topological depth
                //
                // Pinned order ranges:
                //   Setup: 0-9 (ALWAYS first - loads models)
                //   LoRAs: 10-19 (style modifiers, after setup)
                //   Prompts: 20-29 (text input)
                //   Generation: 30-39 (sampling)
                //   Post-Processing: 40-49 (detailers, upscalers)
                //   Output variants: 50-59 (ALWAYS after post-processing)
                //   Other: 60+ (miscellaneous)

                const categoryOrderRanges = {
                    'Setup': { base: 0, max: 9 },
                    'LoRAs': { base: 10, max: 19 },
                    'Prompts': { base: 20, max: 29 },
                    'Generation': { base: 30, max: 39 },
                    'Post-Processing': { base: 40, max: 49 },
                    'Output': { base: 50, max: 59 },
                    'Initial Output': { base: 50, max: 53 },
                    'Post-Detail': { base: 54, max: 56 },
                    'Final Output': { base: 57, max: 59 },
                    'Other': { base: 60, max: 69 }
                };

                // Assign order using pinned ranges
                for (const [categoryName, categoryData] of Object.entries(categories)) {
                    if (categoryData.nodes.length === 0) {
                        categoryData.order = 999; // Empty categories at end
                        continue;
                    }

                    const range = categoryOrderRanges[categoryName];
                    if (range) {
                        // Use base order from pinned range
                        // Add small offset based on topological depth for sub-ordering
                        const depth = categoryDepths[categoryName];
                        const depthOffset = depth ? Math.min(depth.minDepth * 0.1, range.max - range.base) : 0;
                        categoryData.order = range.base + depthOffset;
                    } else {
                        // Unknown category - put after Other
                        categoryData.order = 70 + (categoryDepths[categoryName]?.minDepth || 0);
                    }
                }

                console.log('[WorkflowAPI] Computed category order from data flow:',
                    Object.entries(categories)
                        .filter(([_, data]) => data.nodes.length > 0)
                        .sort((a, b) => a[1].order - b[1].order)
                        .map(([name, data]) => `${name}(${data.order})`)
                        .join(' → ')
                );

                return nodeDepths; // Return for use in within-category sorting
            };

            // Run topological sort to compute proper category ordering
            const nodeDepths = computeCategoryOrderFromDataFlow();

            // =========================================================
            // SORT NODES WITHIN EACH CATEGORY BY TOPOLOGICAL ORDER
            // =========================================================
            // Nodes that execute earlier should appear first (top/left)
            for (const [categoryName, categoryData] of Object.entries(categories)) {
                if (categoryData.nodes.length <= 1) continue;

                categoryData.nodes.sort((a, b) => {
                    const depthA = nodeDepths.get(a.id) || 0;
                    const depthB = nodeDepths.get(b.id) || 0;
                    return depthA - depthB; // Lower depth = earlier execution = first
                });

                // Log if we did sorting
                if (categoryData.nodes.length > 1) {
                    console.log(`[WorkflowAPI] Sorted ${categoryData.nodes.length} nodes in ${categoryName} by execution order`);
                }
            }

            const getNodeSize = (node) => {
                // Defensive: Return default if node is undefined/null
                if (!node) {
                    console.warn('[WorkflowAPI] getNodeSize called with undefined node');
                    return { width: 200, height: 100 };
                }

                // Prefer actual size over computed minimum size
                // node.size is the ACTUAL rendered size, computeSize() is MINIMUM
                // Use optional chaining to handle missing size property
                const actualWidth = node.size?.[0];
                const actualHeight = node.size?.[1];

                if (actualWidth && actualHeight && actualWidth > 50) {
                    return { width: actualWidth, height: actualHeight };
                }

                // Fallback to computeSize if size not set
                // NOTE: computeSize() can crash on some node types - wrap carefully
                if (typeof node.computeSize === 'function') {
                    try {
                        const computed = node.computeSize();
                        if (Array.isArray(computed) && computed.length >= 2) {
                            return { width: computed[0] || 200, height: computed[1] || 100 };
                        }
                    } catch (e) {
                        console.warn('[WorkflowAPI] computeSize failed for node', node.id, ':', e.message);
                    }
                }

                return { width: 200, height: 100 };
            };

            // Check if a node should be considered "tall" for horizontal placement
            const isTallNode = (node, size) => {
                // Check height threshold
                if (size.height >= TALL_NODE_CONFIG.heightThreshold) {
                    return true;
                }
                // Check widget count (many widgets = complex node = likely tall)
                const widgetCount = (node.widgets || []).length;
                if (widgetCount >= TALL_NODE_CONFIG.widgetCountThreshold) {
                    return true;
                }
                return false;
            };

            // Calculate layout for a group, using intelligent row-based placement
            // for tall nodes and vertical stacking for regular nodes
            const calculateGroupLayout = (nodes) => {
                // Separate tall nodes from regular nodes
                const tallNodes = [];
                const regularNodes = [];

                for (const node of nodes) {
                    const size = getNodeSize(node);
                    if (isTallNode(node, size)) {
                        tallNodes.push({ node, size });
                    } else {
                        regularNodes.push({ node, size });
                    }
                }

                // If we have 2+ tall nodes, place them in horizontal rows
                const useSideBySide = tallNodes.length >= 2;

                // Build layout rows
                // Each row is an array of { node, size } objects
                const rows = [];

                if (useSideBySide && tallNodes.length > 0) {
                    // Place tall nodes in horizontal rows (up to maxNodesPerRow per row)
                    for (let i = 0; i < tallNodes.length; i += TALL_NODE_CONFIG.maxNodesPerRow) {
                        const rowNodes = tallNodes.slice(i, i + TALL_NODE_CONFIG.maxNodesPerRow);
                        rows.push({
                            type: 'horizontal',
                            items: rowNodes
                        });
                    }
                } else {
                    // Only 0-1 tall nodes: treat them as regular vertical nodes
                    regularNodes.push(...tallNodes);
                }

                // Add regular nodes as individual vertical rows
                for (const item of regularNodes) {
                    rows.push({
                        type: 'vertical',
                        items: [item]
                    });
                }

                // Calculate dimensions for each row
                let totalHeight = 0;
                let maxRowWidth = 0;

                for (const row of rows) {
                    if (row.type === 'horizontal') {
                        // Horizontal row: width = sum of node widths + spacing, height = max node height
                        let rowWidth = 0;
                        let rowHeight = 0;
                        for (let i = 0; i < row.items.length; i++) {
                            rowWidth += row.items[i].size.width;
                            if (i > 0) rowWidth += TALL_NODE_CONFIG.horizontalSpacing;
                            rowHeight = Math.max(rowHeight, row.items[i].size.height);
                        }
                        row.width = rowWidth;
                        row.height = rowHeight;
                    } else {
                        // Vertical row (single node): width = node width, height = node height
                        row.width = row.items[0].size.width;
                        row.height = row.items[0].size.height;
                    }

                    maxRowWidth = Math.max(maxRowWidth, row.width);
                    totalHeight += row.height + nodeSpacing;
                }

                if (rows.length > 0) {
                    totalHeight -= nodeSpacing; // Remove last spacing
                }

                return {
                    rows,
                    maxWidth: maxRowWidth,
                    totalHeight,
                    hasSideBySide: useSideBySide && tallNodes.length >= 2
                };
            };

            // Calculate layouts - FIRST pass: collect size info without positions
            const groupLayouts = [];

            for (const [categoryName, categoryData] of Object.entries(categories)) {
                if (categoryData.nodes.length === 0) continue;

                // Use intelligent layout calculation
                const layoutInfo = calculateGroupLayout(categoryData.nodes);
                const maxNodeWidth = layoutInfo.maxWidth;
                const totalHeight = layoutInfo.totalHeight;

                const groupWidth = maxNodeWidth + (groupPadding * 2);
                // Add descriptionNodeHeight to group height (use less bottom padding since we're adding top content)
                const groupHeight = totalHeight + groupPadding + 40 + descriptionNodeHeight;

                groupLayouts.push({
                    name: categoryName,
                    color: categoryData.color,
                    order: categoryData.order,
                    nodes: categoryData.nodes,
                    rows: layoutInfo.rows,  // Row-based layout for intelligent horizontal placement
                    hasSideBySide: layoutInfo.hasSideBySide,
                    // Position will be assigned AFTER sorting
                    x: 0,
                    y: startY,
                    width: groupWidth,
                    height: groupHeight,
                    maxNodeWidth: maxNodeWidth,
                    nodeStartX: 0,  // Will be updated after sorting
                    // Push nodes down to make room for description Note
                    nodeStartY: startY + groupPadding + 40 + descriptionNodeHeight,
                    description: groupDescriptions[categoryName] || ''
                });
            }

            // SORT by computed order BEFORE assigning X positions!
            groupLayouts.sort((a, b) => a.order - b.order);

            // SECOND pass: assign X positions in sorted order
            let currentX = startX;
            for (const layout of groupLayouts) {
                layout.x = currentX;
                layout.nodeStartX = currentX + groupPadding;
                currentX += layout.width + groupSpacing;
            }

            console.log('[WorkflowAPI] Group layout order:',
                groupLayouts.map(g => `${g.name}(${g.order})`).join(' → '));

            // =========================================================
            // COLUMN STACKING ALGORITHM
            // =========================================================
            // Analyze heights and potentially stack short adjacent groups
            // to reduce total horizontal width

            // Build columns - each column contains 1 or more stacked groups
            const columns = [];

            if (COLUMN_STACK_CONFIG.enabled && groupLayouts.length >= 2) {
                // Find height statistics
                const heights = groupLayouts.map(g => g.height);
                const maxHeight = Math.max(...heights);
                const minHeight = Math.min(...heights);
                const heightRatio = maxHeight / minHeight;

                // Only consider stacking if there's significant height variation
                const shouldConsiderStacking = heightRatio >= COLUMN_STACK_CONFIG.minHeightRatioToStack;

                if (shouldConsiderStacking) {
                    console.log(`[WorkflowAPI] Column stacking: height ratio ${heightRatio.toFixed(2)} >= ${COLUMN_STACK_CONFIG.minHeightRatioToStack}, analyzing...`);

                    // Target height for columns (tallest group + tolerance)
                    const targetHeight = maxHeight * (1 + COLUMN_STACK_CONFIG.heightOverflowTolerance);

                    // Greedy algorithm: iterate through groups, build columns
                    let i = 0;
                    while (i < groupLayouts.length) {
                        const currentGroup = groupLayouts[i];

                        // Check if this group is already tall (close to max)
                        const isTallGroup = currentGroup.height >= maxHeight * 0.7;

                        if (isTallGroup || i === groupLayouts.length - 1) {
                            // Tall group or last group: make its own column
                            columns.push({
                                groups: [currentGroup],
                                width: currentGroup.width,
                                height: currentGroup.height
                            });
                            i++;
                        } else {
                            // Short group: try to stack with next group(s)
                            const stackedGroups = [currentGroup];
                            let stackedHeight = currentGroup.height;
                            let stackedWidth = currentGroup.width;

                            // Try to add more groups to this column
                            let j = i + 1;
                            while (j < groupLayouts.length &&
                                   stackedGroups.length < COLUMN_STACK_CONFIG.maxGroupsPerColumn) {
                                const nextGroup = groupLayouts[j];
                                const nextIsTall = nextGroup.height >= maxHeight * 0.7;

                                // Don't stack with tall groups
                                if (nextIsTall) break;

                                // Check if adding this group would exceed target height
                                const combinedHeight = stackedHeight + COLUMN_STACK_CONFIG.stackSpacing + nextGroup.height;

                                if (combinedHeight <= targetHeight) {
                                    // Can stack: add to current column
                                    stackedGroups.push(nextGroup);
                                    stackedHeight = combinedHeight;
                                    stackedWidth = Math.max(stackedWidth, nextGroup.width);
                                    j++;
                                } else {
                                    // Would exceed target: stop stacking
                                    break;
                                }
                            }

                            // Only create a stacked column if we actually stacked multiple groups
                            // AND the width savings is worthwhile (horizontal space saved)
                            const widthSavings = stackedGroups.length > 1
                                ? stackedGroups.slice(1).reduce((sum, g) => sum + g.width + groupSpacing, 0)
                                : 0;

                            if (stackedGroups.length > 1 && widthSavings >= COLUMN_STACK_CONFIG.minWidthSavings) {
                                columns.push({
                                    groups: stackedGroups,
                                    width: stackedWidth,
                                    height: stackedHeight,
                                    isStacked: true
                                });
                                console.log(`[WorkflowAPI] Stacking groups: ${stackedGroups.map(g => g.name).join(' + ')} (combined height: ${stackedHeight}px)`);
                                i = j; // Skip past all stacked groups
                            } else {
                                // Not worth stacking: make single-group column
                                columns.push({
                                    groups: [currentGroup],
                                    width: currentGroup.width,
                                    height: currentGroup.height
                                });
                                i++;
                            }
                        }
                    }
                } else {
                    // Height variation too small: don't stack
                    console.log(`[WorkflowAPI] Column stacking: height ratio ${heightRatio.toFixed(2)} < ${COLUMN_STACK_CONFIG.minHeightRatioToStack}, skipping`);
                    for (const group of groupLayouts) {
                        columns.push({
                            groups: [group],
                            width: group.width,
                            height: group.height
                        });
                    }
                }
            } else {
                // Stacking disabled or not enough groups: each group is its own column
                for (const group of groupLayouts) {
                    columns.push({
                        groups: [group],
                        width: group.width,
                        height: group.height
                    });
                }
            }

            // Assign X/Y positions using column layout
            currentX = startX;
            for (const column of columns) {
                let columnY = startY;

                for (let idx = 0; idx < column.groups.length; idx++) {
                    const layout = column.groups[idx];

                    // X position: use column's X, center narrower groups within wider column
                    const xOffset = (column.width - layout.width) / 2;
                    layout.x = currentX + xOffset;
                    layout.y = columnY;
                    layout.nodeStartX = layout.x + groupPadding;
                    layout.nodeStartY = columnY + groupPadding + 40 + descriptionNodeHeight;

                    // Mark if this group is part of a stacked column
                    layout.isInStackedColumn = column.isStacked || false;
                    layout.stackPosition = idx; // 0 = top, 1 = bottom, etc.

                    // Move Y down for next stacked group
                    columnY += layout.height + COLUMN_STACK_CONFIG.stackSpacing;
                }

                currentX += column.width + groupSpacing;
            }

            // Log column stacking summary
            const stackedColumns = columns.filter(c => c.isStacked);
            if (stackedColumns.length > 0) {
                console.log(`[WorkflowAPI] Column stacking: ${stackedColumns.length} stacked column(s), reduced from ${groupLayouts.length} to ${columns.length} columns`);
            }

            // Delete existing groups
            const existingGroups = [...(app.graph._groups || [])];
            for (const group of existingGroups) {
                app.graph.remove(group);
            }

            // Delete existing Note nodes (we'll create fresh ones for each group)
            const existingNotes = graphNodes.filter(n => (n.type || '').toLowerCase() === 'note');
            for (const note of existingNotes) {
                app.graph.remove(note);
            }

            // Delete existing Set/Get nodes only in cableless mode (we'll create fresh ones)
            // In normal mode, preserve any manually-created Set/Get nodes
            if (cableless) {
                const existingSetNodes = graphNodes.filter(n => (n.type || '').toLowerCase() === 'easy setnode');
                const existingGetNodes = graphNodes.filter(n => (n.type || '').toLowerCase() === 'easy getnode');
                for (const node of [...existingSetNodes, ...existingGetNodes]) {
                    app.graph.remove(node);
                }
            }

            // NUCLEAR OPTION: Serialize graph, modify positions in JSON, reload entire graph
            // Setting node.pos directly doesn't reliably trigger LiteGraph visual updates
            // This approach guarantees visual updates by using the same mechanism as loading a saved workflow

            // Build position map: nodeId -> {x, y}
            // Uses row-based layout: horizontal rows for tall nodes, vertical stacking for regular nodes
            const positionMap = {};
            const movedNodes = [];
            for (const layout of groupLayouts) {
                let nodeY = layout.nodeStartY;

                // Use row-based layout if available, fall back to simple vertical stacking
                if (layout.rows && layout.rows.length > 0) {
                    // Row-based layout: iterate through rows
                    for (const row of layout.rows) {
                        if (row.type === 'horizontal') {
                            // Horizontal row: place nodes side-by-side
                            // Center the row within the group width
                            const rowWidth = row.width;
                            let nodeX = layout.nodeStartX + (layout.maxNodeWidth - rowWidth) / 2;

                            for (const item of row.items) {
                                const node = item.node;
                                const size = item.size;

                                if (!node || !node.id) {
                                    console.warn('[WorkflowAPI] Skipping undefined node in horizontal row');
                                    continue;
                                }

                                positionMap[node.id] = { x: nodeX, y: nodeY };

                                const fromPos = node.pos ? [node.pos[0] || 0, node.pos[1] || 0] : [0, 0];
                                movedNodes.push({
                                    id: node.id,
                                    from: fromPos,
                                    to: [nodeX, nodeY]
                                });

                                nodeX += size.width + TALL_NODE_CONFIG.horizontalSpacing;
                            }
                            // Move Y down by the row height (max height of nodes in row)
                            nodeY += row.height + nodeSpacing;

                        } else {
                            // Vertical row: single node, centered in group
                            const item = row.items[0];
                            const node = item.node;
                            const size = item.size;

                            if (!node || !node.id) {
                                console.warn('[WorkflowAPI] Skipping undefined node in vertical row');
                                continue;
                            }

                            const nodeX = layout.nodeStartX + (layout.maxNodeWidth - size.width) / 2;

                            positionMap[node.id] = { x: nodeX, y: nodeY };

                            const fromPos = node.pos ? [node.pos[0] || 0, node.pos[1] || 0] : [0, 0];
                            movedNodes.push({
                                id: node.id,
                                from: fromPos,
                                to: [nodeX, nodeY]
                            });

                            nodeY += size.height + nodeSpacing;
                        }
                    }
                } else {
                    // Fallback: simple vertical stacking (legacy behavior)
                    for (const node of layout.nodes) {
                        if (!node || !node.id) {
                            console.warn('[WorkflowAPI] Skipping undefined node in layout');
                            continue;
                        }

                        const size = getNodeSize(node);
                        const nodeX = layout.nodeStartX + (layout.maxNodeWidth - size.width) / 2;

                        positionMap[node.id] = { x: nodeX, y: nodeY };

                        const fromPos = node.pos ? [node.pos[0] || 0, node.pos[1] || 0] : [0, 0];
                        movedNodes.push({
                            id: node.id,
                            from: fromPos,
                            to: [nodeX, nodeY]
                        });

                        nodeY += size.height + nodeSpacing;
                    }
                }
            }

            // Serialize current graph state
            const graphData = app.graph.serialize();

            // Modify positions in serialized data
            for (const nodeData of graphData.nodes) {
                if (positionMap[nodeData.id]) {
                    nodeData.pos = [positionMap[nodeData.id].x, positionMap[nodeData.id].y];
                }
            }

            // Clear existing groups from serialized data (we'll add new ones after)
            graphData.groups = [];

            // Reload the entire graph with modified positions
            // This is the same mechanism ComfyUI uses when loading a saved workflow
            // Wrapped in try-catch because buggy third-party extensions (e.g., widgethider.js)
            // may throw errors during nodeCreated events - we don't want them to kill our operation
            try {
                await app.loadGraphData(graphData);
            } catch (extError) {
                // Log but don't fail - the graph reload likely completed despite extension errors
                console.warn(`[WorkflowAPI] Extension error during graph reload (ignored):`, extError.message);
            }

            // Small delay to let the UI update after graph reload
            await new Promise(resolve => setTimeout(resolve, 100));

            // Log info about horizontal layouts
            const sideBySideGroups = groupLayouts.filter(l => l.hasSideBySide);
            if (sideBySideGroups.length > 0) {
                console.log(`[WorkflowAPI] Horizontal layout used in ${sideBySideGroups.length} group(s): ${sideBySideGroups.map(g => g.name).join(', ')}`);
            }

            console.log(`[WorkflowAPI] Reloaded graph with ${movedNodes.length} nodes repositioned`)

            // Create description Note nodes inside each group
            const createdNotes = [];
            if (includeDescriptions) {
                for (const layout of groupLayouts) {
                    if (!layout.description) continue;

                    try {
                        // Try to create a Note node (from ComfyUI-Custom-Scripts or similar)
                        const noteNode = LiteGraph.createNode("Note");
                        if (noteNode) {
                            // Position using centralized NOTE_CONFIG values
                            const noteX = layout.x + groupPadding;
                            const noteY = layout.y + noteYOffset;
                            const noteWidth = layout.width - (groupPadding * 2);

                            noteNode.pos = [noteX, noteY];
                            noteNode.size = [noteWidth, NOTE_CONFIG.nodeHeight];

                            // Set the text content - Note nodes typically have a 'text' widget
                            if (noteNode.widgets) {
                                const textWidget = noteNode.widgets.find(w =>
                                    w.name === 'text' || w.name === 'Text' || w.type === 'customtext'
                                );
                                if (textWidget) {
                                    textWidget.value = layout.description;
                                }
                            }

                            // Also try setting via properties (some Note implementations use this)
                            if (noteNode.properties) {
                                noteNode.properties.text = layout.description;
                            }

                            // Set title to empty or minimal to avoid duplicate headers
                            noteNode.title = "";

                            app.graph.add(noteNode);
                            createdNotes.push({
                                group: layout.name,
                                nodeId: noteNode.id,
                                description: layout.description
                            });
                        }
                    } catch (noteError) {
                        // Note node type not available - skip silently
                        console.log(`[WorkflowAPI] Note node not available for group ${layout.name}:`, noteError.message);
                    }
                }
            }

            // Build nodeId -> groupName mapping for cross-group link detection
            const nodeToGroup = new Map();
            for (const layout of groupLayouts) {
                for (const node of layout.nodes) {
                    nodeToGroup.set(node.id, layout.name);
                }
            }

            // Create groups
            const createdGroups = [];
            for (const layout of groupLayouts) {
                const group = new LiteGraph.LGraphGroup();
                group.title = layout.name;
                group.pos = [layout.x, layout.y];
                group.size = [layout.width, layout.height];
                group.color = layout.color;

                app.graph.add(group);
                createdGroups.push({
                    title: layout.name,
                    nodeCount: layout.nodes.length,
                    bounds: { x: layout.x, y: layout.y, width: layout.width, height: layout.height }
                });
            }

            // =========================================================
            // REPLACE CROSS-GROUP CONNECTIONS WITH SET/GET NODES
            // Only when cableless option is enabled
            // =========================================================
            const createdSetGetPairs = [];
            const setGetAvailable = areSetGetNodesAvailable();

            if (cableless && setGetAvailable) {
                const usedVariableNames = new Set();
                const links = app.graph.links || {};
                const linkArray = Object.values(links).filter(l => l);

                // Group links by unique source output to share Set nodes
                // Key: "sourceNodeId:slotIndex" -> { links: [], sourceGroup, type }
                const crossGroupOutputs = new Map();

                for (const link of linkArray) {
                    let originId, targetId, originSlot, targetSlot, type;

                    if (Array.isArray(link)) {
                        originId = link[1];
                        originSlot = link[2];
                        targetId = link[3];
                        targetSlot = link[4];
                        type = link[5];
                    } else {
                        originId = link.origin_id;
                        originSlot = link.origin_slot;
                        targetId = link.target_id;
                        targetSlot = link.target_slot;
                        type = link.type;
                    }

                    const sourceGroup = nodeToGroup.get(originId);
                    const targetGroup = nodeToGroup.get(targetId);

                    // Only process cross-group links
                    if (sourceGroup && targetGroup && sourceGroup !== targetGroup) {
                        const key = `${originId}:${originSlot}`;
                        if (!crossGroupOutputs.has(key)) {
                            crossGroupOutputs.set(key, {
                                links: [],
                                originId,
                                originSlot,
                                sourceGroup,
                                type: type || '*'
                            });
                        }
                        crossGroupOutputs.get(key).links.push({
                            link,
                            targetId,
                            targetSlot,
                            targetGroup
                        });
                    }
                }

                // Process each unique source output
                for (const [key, outputInfo] of crossGroupOutputs) {
                    const sourceNode = app.graph.getNodeById(outputInfo.originId);
                    if (!sourceNode) continue;

                    // Generate variable name
                    const varName = generateVariableName(
                        sourceNode,
                        outputInfo.originSlot,
                        outputInfo.type,
                        usedVariableNames
                    );

                    // Create Set node
                    const setNode = createSetNode(varName, outputInfo.type);
                    if (!setNode) continue;

                    // Position Set node at right edge of source group (below existing nodes)
                    const sourceLayout = groupLayouts.find(l => l.name === outputInfo.sourceGroup);
                    if (sourceLayout) {
                        // Stack Set nodes at bottom-right of group
                        const setNodesInGroup = createdSetGetPairs.filter(
                            p => p.sourceGroup === outputInfo.sourceGroup
                        ).length;
                        const setY = sourceLayout.y + sourceLayout.height - 80 - (setNodesInGroup * 50);
                        const setX = sourceLayout.x + sourceLayout.width - 180;
                        setNode.pos = [setX, setY];
                    }

                    app.graph.add(setNode);

                    // Connect source output to Set node input
                    sourceNode.connect(outputInfo.originSlot, setNode, 0);

                    // Create Get nodes for each target
                    for (const targetInfo of outputInfo.links) {
                        const targetNode = app.graph.getNodeById(targetInfo.targetId);
                        if (!targetNode) continue;

                        // Create Get node
                        const getNode = createGetNode(varName, outputInfo.type);
                        if (!getNode) continue;

                        // Position Get node at left edge of target group
                        const targetLayout = groupLayouts.find(l => l.name === targetInfo.targetGroup);
                        if (targetLayout) {
                            const getNodesInGroup = createdSetGetPairs.filter(
                                p => p.targetGroup === targetInfo.targetGroup
                            ).length;
                            const getY = targetLayout.y + targetLayout.height - 80 - (getNodesInGroup * 50);
                            const getX = targetLayout.x + 20;
                            getNode.pos = [getX, getY];
                        }

                        app.graph.add(getNode);

                        // Disconnect original link
                        // Note: disconnecting by finding the link in target's input
                        if (targetNode.inputs && targetNode.inputs[targetInfo.targetSlot]) {
                            const existingLink = targetNode.inputs[targetInfo.targetSlot].link;
                            if (existingLink !== null) {
                                app.graph.removeLink(existingLink);
                            }
                        }

                        // Connect Get node output to target input
                        getNode.connect(0, targetNode, targetInfo.targetSlot);

                        createdSetGetPairs.push({
                            varName,
                            setNodeId: setNode.id,
                            getNodeId: getNode.id,
                            sourceGroup: outputInfo.sourceGroup,
                            targetGroup: targetInfo.targetGroup,
                            type: outputInfo.type
                        });
                    }
                }

                if (createdSetGetPairs.length > 0) {
                    console.log(`[WorkflowAPI] Replaced ${createdSetGetPairs.length} cross-group connections with Set/Get pairs`);
                }
            } else if (cableless && !setGetAvailable) {
                console.log('[WorkflowAPI] Cableless mode requested but Set/Get nodes not available (requires ComfyUI-Easy-Use)');
            } else if (!cableless) {
                console.log('[WorkflowAPI] Keeping physical cables (use cableless: true for Set/Get virtual wires)');
            }

            // =========================================================
            // POST-ORGANIZE CONNECTION VALIDATION
            // =========================================================
            // Verify ALL pre-organize connections still exist
            // This catches bugs where serialize/reload drops connections
            const lostConnections = [];
            const postLinks = app.graph.links || {};

            for (const preConn of preOrganizeConnections) {
                // Check if this connection still exists by finding matching origin->target
                let found = false;
                for (const [linkId, link] of Object.entries(postLinks)) {
                    if (!link) continue;
                    let originId, originSlot, targetId, targetSlot;
                    if (Array.isArray(link)) {
                        originId = link[1];
                        originSlot = link[2];
                        targetId = link[3];
                        targetSlot = link[4];
                    } else {
                        originId = link.origin_id;
                        originSlot = link.origin_slot;
                        targetId = link.target_id;
                        targetSlot = link.target_slot;
                    }
                    // Match by origin/target node and slot (link IDs may change during reload)
                    if (originId === preConn.originId &&
                        originSlot === preConn.originSlot &&
                        targetId === preConn.targetId &&
                        targetSlot === preConn.targetSlot) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    lostConnections.push(preConn);
                }
            }

            // Log and add to warnings if connections were lost
            if (lostConnections.length > 0) {
                console.error(`[WorkflowAPI] ⚠️ CONNECTION LOSS DETECTED: ${lostConnections.length} connection(s) lost during organize!`);
                for (const lost of lostConnections) {
                    console.error(`  LOST: ${lost.originTitle}[${lost.originSlot}] → ${lost.targetTitle}[${lost.targetSlot}] (${lost.type})`);

                    // Add to sanity warnings so it shows up in the result
                    sanityWarnings.push({
                        type: 'connection_lost',
                        severity: 'critical',
                        message: `CONNECTION LOST: ${lost.originTitle} → ${lost.targetTitle} (${lost.type})`,
                        details: lost
                    });
                }

                // ATTEMPT TO RESTORE lost connections
                console.log(`[WorkflowAPI] Attempting to restore ${lostConnections.length} lost connection(s)...`);
                let restored = 0;
                for (const lost of lostConnections) {
                    try {
                        const originNode = app.graph.getNodeById(lost.originId);
                        const targetNode = app.graph.getNodeById(lost.targetId);
                        if (originNode && targetNode) {
                            originNode.connect(lost.originSlot, targetNode, lost.targetSlot);
                            restored++;
                            console.log(`  RESTORED: ${lost.originTitle}[${lost.originSlot}] → ${lost.targetTitle}[${lost.targetSlot}]`);
                        } else {
                            console.error(`  FAILED TO RESTORE: Node(s) not found - origin:${lost.originId} target:${lost.targetId}`);
                        }
                    } catch (restoreError) {
                        console.error(`  FAILED TO RESTORE: ${restoreError.message}`);
                    }
                }
                console.log(`[WorkflowAPI] Restored ${restored}/${lostConnections.length} connection(s)`);

                // Update warning message
                if (restored < lostConnections.length) {
                    sanityWarnings.push({
                        type: 'connection_restore_failed',
                        severity: 'critical',
                        message: `Failed to restore ${lostConnections.length - restored} connection(s). Use UNDO to recover.`
                    });
                }
            } else {
                console.log(`[WorkflowAPI] Post-organize: All ${preOrganizeConnections.length} connections verified ✓`);
            }

            // Final canvas refresh and center view on organized content
            app.graph.setDirtyCanvas(true, true);
            if (app.canvas) {
                app.canvas.setDirty(true, true);
                app.canvas.draw(true, true);
                // Center the view on the organized layout
                const centerX = (currentX - groupSpacing) / 2;
                const centerY = startY + 200;
                app.canvas.centerOnNode({ pos: [centerX, centerY] });
            }

            const notesMessage = createdNotes.length > 0
                ? ` Added ${createdNotes.length} description notes.`
                : '';

            const setGetMessage = createdSetGetPairs.length > 0
                ? ` Replaced ${createdSetGetPairs.length} cross-group connections with Set/Get pairs.`
                : '';

            // Build horizontal layout message
            const horizontalMessage = sideBySideGroups.length > 0
                ? ` Horizontal layout in: ${sideBySideGroups.map(g => g.name).join(', ')}.`
                : '';

            // Build column stacking message
            const columnStackMessage = stackedColumns.length > 0
                ? ` Stacked ${stackedColumns.reduce((sum, c) => sum + c.groups.length, 0)} groups into ${stackedColumns.length} column(s).`
                : '';

            // Build sanity warning message (includes connection loss warnings)
            const criticalWarnings = sanityWarnings.filter(w => w.severity === 'critical');
            const warningMessage = sanityWarnings.length > 0
                ? `\n\n⚠️ WARNINGS (${sanityWarnings.length}):\n${sanityWarnings.map(w => `• ${w.message}`).join('\n')}`
                : '';

            // Build connection validation message
            const connectionMessage = lostConnections.length > 0
                ? `\n\n🔌 CONNECTION VALIDATION: ${lostConnections.length} connection(s) were lost and auto-restored.`
                : '';

            // Build auto-preview message
            const previewMessage = addedPreviews.length > 0
                ? ` Auto-added ${addedPreviews.length} preview(s) at critical points.`
                : '';

            return {
                success: true,
                summary: {
                    totalNodes: movedNodes.length,
                    groupsCreated: createdGroups.length,
                    notesCreated: createdNotes.length,
                    nodesMoved: movedNodes.length,
                    totalWidth: currentX - groupSpacing,
                    deletedOldGroups: existingGroups.length,
                    setGetPairsCreated: createdSetGetPairs.length,
                    groupsWithHorizontalLayout: sideBySideGroups.length,
                    columnCount: columns.length,
                    stackedColumnCount: stackedColumns.length,
                    warningCount: sanityWarnings.length,
                    connectionsValidated: preOrganizeConnections.length,
                    connectionsLost: lostConnections.length,
                    connectionsRestored: lostConnections.length > 0 ? lostConnections.length : 0,
                    previewsAdded: addedPreviews.length
                },
                groups: createdGroups,
                columns: columns.map(c => ({
                    groups: c.groups.map(g => g.name),
                    isStacked: c.isStacked || false,
                    width: c.width,
                    height: c.height
                })),
                notes: createdNotes,
                setGetPairs: createdSetGetPairs,
                movedNodes: movedNodes,
                warnings: sanityWarnings,
                addedPreviews: addedPreviews,
                message: `Organized ${movedNodes.length} nodes into ${createdGroups.length} groups across ${columns.length} columns (${movedNodes.length} nodes repositioned). Verified ${preOrganizeConnections.length} connections.${previewMessage}${notesMessage}${setGetMessage}${horizontalMessage}${columnStackMessage}${connectionMessage}${warningMessage}`
            };

        } catch (e) {
            console.error('[WorkflowAPI] autoOrganizeWorkflow failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Integrate a newly added node into the existing group organization.
     * This should be called AFTER adding a node to maintain group structure.
     *
     * @param {number} nodeId - The ID of the node to integrate
     * @param {object} options - Additional options
     * @returns {object} Result describing what actions were taken
     */
    integrateNodeIntoGroups(nodeId, options = {}) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const node = app.graph.getNodeById(nodeId);
            if (!node) {
                return { success: false, error: `Node ${nodeId} not found` };
            }

            const {
                groupPadding = 60,
                groupSpacing = 60,
                nodeSpacing = 30
            } = options;

            // Check if workflow has any groups (is it organized?)
            // Filter out undefined/null groups (can happen after graph reload)
            const groups = (app.graph._groups || []).filter(g => g && g.pos && g.size);
            if (groups.length === 0) {
                return {
                    success: true,
                    action: 'none',
                    message: 'Workflow has no groups - node left at current position'
                };
            }

            this.saveUndoState(`Integrate node into groups: ${node.title || node.type}`);

            // Categorize the node using same logic as autoOrganizeWorkflow
            const categorizeNode = (n) => {
                const type = (n.type || '').toLowerCase();

                if (type.includes('lora')) return 'LoRAs';
                if (type.includes('loader') || type.includes('checkpoint') || type.includes('load')) return 'Setup';
                // Detector providers load models - Setup, not Output
                if (type.includes('provider') || type.includes('ultralytic') || type.includes('samloader')) return 'Setup';
                if (type.includes('detector') && !type.includes('detailer')) return 'Setup';
                if (type.includes('emptylatent') || type === 'emptylatentimage') return 'Setup';
                if (type.includes('latent') && (type.includes('image') || type.includes('encode')) && !type.includes('decode')) return 'Setup';
                if ((type.includes('clip') || type.includes('conditioning') || type.includes('encode') || type.includes('prompt')) && !type.includes('vae')) return 'Prompts';
                if (type.includes('sampler') || type.includes('ksampler') || type.includes('sample') || type.includes('scheduler') || type.includes('noise')) return 'Generation';
                // Post-Processing: detailers, upscalers, enhance (before terminal output)
                if (type.includes('detailer') || type.includes('upscale') || type.includes('enhance') || type.includes('sharpen') || type.includes('refiner')) return 'Post-Processing';
                // VAEDecode = end of Generation (converts latent→image), NOT terminal
                if (type.includes('vaedecode') || type.includes('vae decode') || (type.includes('decode') && type.includes('vae'))) return 'Generation';
                // Output: TERMINAL nodes only - SaveImage, PreviewImage
                if (type.includes('saveimage') || type.includes('previewimage') || type === 'saveimage' || type === 'previewimage') return 'Output';
                if ((type.includes('save') && type.includes('image')) || (type.includes('preview') && !type.includes('latent'))) return 'Output';
                if (type.includes('latent')) return 'Generation';
                return 'Other';
            };

            const targetCategory = categorizeNode(node);
            const nodeWidth = node.size?.[0] || 200;
            const nodeHeight = node.size?.[1] || 100;

            // Find existing group with matching name
            let targetGroup = groups.find(g => g.title === targetCategory);

            // Also check for groups that might have been renamed but contain similar content
            if (!targetGroup) {
                targetGroup = groups.find(g => {
                    const title = (g.title || '').toLowerCase();
                    const cat = targetCategory.toLowerCase();
                    return title.includes(cat) || cat.includes(title.split(' ')[0]);
                });
            }

            // Calculate group positions sorted left-to-right
            const groupsByPosition = [...groups].sort((a, b) => a.pos[0] - b.pos[0]);

            if (targetGroup) {
                // === OPTION A: Expand existing group ===
                const groupIndex = groups.indexOf(targetGroup);
                const groupRight = targetGroup.pos[0] + targetGroup.size[0];
                const groupBottom = targetGroup.pos[1] + targetGroup.size[1];

                // Position node at bottom of group
                const nodeX = targetGroup.pos[0] + groupPadding;
                const nodeY = groupBottom - groupPadding - nodeHeight;
                node.pos = [nodeX, nodeY];

                // Calculate new group size needed
                const newHeight = targetGroup.size[1] + nodeHeight + nodeSpacing;
                const widthNeeded = nodeWidth + (groupPadding * 2);
                const newWidth = Math.max(targetGroup.size[0], widthNeeded);

                // Expand group
                targetGroup.size[1] = newHeight;
                if (newWidth > targetGroup.size[0]) {
                    const widthIncrease = newWidth - targetGroup.size[0];
                    targetGroup.size[0] = newWidth;

                    // Shift groups to the right of this one
                    const targetRight = targetGroup.pos[0] + targetGroup.size[0];
                    for (const g of groupsByPosition) {
                        if (g.pos[0] > targetGroup.pos[0]) {
                            // Shift this group and its contents right
                            const shiftAmount = widthIncrease + groupSpacing;
                            this._shiftGroupWithContents(g, shiftAmount, 0);
                        }
                    }
                }

                app.graph.setDirtyCanvas(true, true);

                return {
                    success: true,
                    action: 'expanded',
                    group: targetGroup.title,
                    nodePosition: { x: nodeX, y: nodeY },
                    newGroupSize: { width: targetGroup.size[0], height: targetGroup.size[1] },
                    message: `Expanded "${targetGroup.title}" group to include ${node.title || node.type}`
                };

            } else {
                // === OPTION B: Create new group ===

                // Determine where in the flow this group should be (based on category order)
                const categoryOrder = {
                    'Setup': 0, 'LoRAs': 1, 'Prompts': 2, 'Generation': 3, 'Post-Processing': 4, 'Output': 5, 'Other': 6
                };
                const targetOrder = categoryOrder[targetCategory] ?? 99;

                // Find insertion point based on order
                let insertX = 50; // Default start
                let insertAfterGroup = null;

                for (const g of groupsByPosition) {
                    const gCategory = g.title;
                    const gOrder = categoryOrder[gCategory] ?? 99;
                    if (gOrder < targetOrder) {
                        insertAfterGroup = g;
                        insertX = g.pos[0] + g.size[0] + groupSpacing;
                    }
                }

                // Calculate new group size
                const newGroupWidth = nodeWidth + (groupPadding * 2);
                const newGroupHeight = nodeHeight + (groupPadding * 2) + 40; // 40 for title bar

                // Shift all groups to the right of insertion point
                const shiftAmount = newGroupWidth + groupSpacing;
                for (const g of groupsByPosition) {
                    if (g.pos[0] >= insertX) {
                        this._shiftGroupWithContents(g, shiftAmount, 0);
                    }
                }

                // Create new group
                const newGroup = new LiteGraph.LGraphGroup();
                newGroup.title = targetCategory;
                newGroup.pos = [insertX, groups[0]?.pos[1] || 50]; // Align Y with existing groups
                newGroup.size = [newGroupWidth, newGroupHeight];
                newGroup.color = this._getCategoryColor(targetCategory);

                app.graph.add(newGroup);

                // Position node inside new group
                const nodeX = insertX + groupPadding;
                const nodeY = newGroup.pos[1] + groupPadding + 40; // Below title bar
                node.pos = [nodeX, nodeY];

                app.graph.setDirtyCanvas(true, true);

                return {
                    success: true,
                    action: 'created',
                    group: targetCategory,
                    nodePosition: { x: nodeX, y: nodeY },
                    groupBounds: { x: insertX, y: newGroup.pos[1], width: newGroupWidth, height: newGroupHeight },
                    shiftedGroups: groupsByPosition.filter(g => g.pos[0] >= insertX - shiftAmount).length,
                    message: `Created new "${targetCategory}" group for ${node.title || node.type}`
                };
            }

        } catch (e) {
            console.error('[WorkflowAPI] integrateNodeIntoGroups failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * PREPARE GROUP FOR NEW NODE (Pre-creation)
     *
     * Call this BEFORE creating a node to determine where it should go.
     * This handles:
     * - Categorizing the node type
     * - Finding or creating the target group
     * - Calculating position within the group
     * - Expanding/shifting groups as needed
     *
     * @param {string} nodeType - The node type being created
     * @param {number} nodeWidth - Estimated width of the new node (default 200)
     * @param {number} nodeHeight - Estimated height of the new node (default 100)
     * @returns {object} { position: [x, y], group: string, action: string }
     */
    prepareGroupForNode(nodeType, nodeWidth = 200, nodeHeight = 100) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const groups = app.graph._groups || [];

            // If no existing groups, return default position (no auto-integration)
            if (groups.length === 0) {
                return {
                    success: true,
                    position: [100, 100],
                    group: null,
                    action: 'no_groups'
                };
            }

            // Categorize the node type
            const type = (nodeType || '').toLowerCase();
            let category = 'Other';

            if (type.includes('lora')) {
                category = 'LoRAs';
            } else if (type.includes('loader') || type.includes('checkpoint') || type.includes('load')) {
                category = 'Setup';
            } else if (type.includes('provider') || type.includes('ultralytic') || type.includes('samloader')) {
                category = 'Setup';
            } else if (type.includes('detector') && !type.includes('detailer')) {
                category = 'Setup';
            } else if (type.includes('emptylatent') || type === 'emptylatentimage') {
                category = 'Setup';
            } else if (type.includes('latent') && (type.includes('image') || type.includes('encode')) && !type.includes('decode')) {
                category = 'Setup';
            } else if ((type.includes('clip') || type.includes('conditioning') || type.includes('encode') || type.includes('prompt')) && !type.includes('vae')) {
                category = 'Prompts';
            } else if (type.includes('sampler') || type.includes('ksampler') || type.includes('sample') || type.includes('scheduler') || type.includes('noise')) {
                category = 'Generation';
            } else if (type.includes('detailer') || type.includes('upscale') || type.includes('enhance') || type.includes('sharpen') || type.includes('refiner')) {
                category = 'Post-Processing';
            } else if (type.includes('vaedecode') || type.includes('vae decode') || (type.includes('decode') && type.includes('vae'))) {
                category = 'Generation';
            } else if (type.includes('saveimage') || type.includes('previewimage') || type === 'saveimage' || type === 'previewimage') {
                category = 'Output';
            } else if ((type.includes('save') && type.includes('image')) || (type.includes('preview') && !type.includes('latent'))) {
                category = 'Output';
            } else if (type.includes('latent')) {
                category = 'Generation';
            }

            console.log(`[WorkflowAPI] prepareGroupForNode: ${nodeType} → category: ${category}`);

            // Find existing group matching the category
            let targetGroup = groups.find(g => {
                const title = (g.title || '').toLowerCase();
                const cat = category.toLowerCase();
                return title === cat || title.includes(cat) || cat.includes(title.split(' ')[0]);
            });

            const padding = 60;
            const nodeSpacing = 30;

            if (targetGroup) {
                // FOUND EXISTING GROUP - calculate position inside and expand if needed
                const gLeft = targetGroup.pos[0];
                const gTop = targetGroup.pos[1];
                const gRight = gLeft + targetGroup.size[0];
                const gBottom = gTop + targetGroup.size[1];

                // Find all nodes currently in this group
                const nodesInGroup = app.graph._nodes.filter(node => {
                    const nLeft = node.pos[0];
                    const nTop = node.pos[1];
                    const nRight = nLeft + (node.size?.[0] || 200);
                    const nBottom = nTop + (node.size?.[1] || 100);
                    return nLeft >= gLeft && nTop >= gTop && nRight <= gRight && nBottom <= gBottom;
                });

                // Calculate position for new node (bottom of group, stacked vertically)
                let newX = gLeft + padding;
                let newY = gTop + padding + 30; // 30 for title bar

                if (nodesInGroup.length > 0) {
                    // Find the bottom-most node
                    let maxBottom = gTop + padding + 30;
                    for (const node of nodesInGroup) {
                        const nodeBottom = node.pos[1] + (node.size?.[1] || 100);
                        if (nodeBottom > maxBottom) {
                            maxBottom = nodeBottom;
                        }
                    }
                    newY = maxBottom + nodeSpacing;
                }

                // Check if we need to expand the group
                const requiredBottom = newY + nodeHeight + padding;
                const expansionNeeded = requiredBottom - gBottom;

                if (expansionNeeded > 0) {
                    // Expand group downward
                    targetGroup.size[1] += expansionNeeded;

                    // Shift all groups BELOW this one down
                    const shiftAmount = expansionNeeded;
                    for (const otherGroup of groups) {
                        if (otherGroup === targetGroup) continue;
                        if (otherGroup.pos[1] > gTop) {
                            this._shiftGroupWithContents(otherGroup, 0, shiftAmount);
                        }
                    }

                    console.log(`[WorkflowAPI] Expanded group "${targetGroup.title}" by ${expansionNeeded}px`);
                }

                app.graph.setDirtyCanvas(true, true);

                return {
                    success: true,
                    position: [newX, newY],
                    group: targetGroup.title,
                    action: 'expanded_existing'
                };

            } else {
                // NO MATCHING GROUP - create new group at appropriate position

                // Determine position based on category order
                const categoryOrder = ['Setup', 'LoRAs', 'Prompts', 'Generation', 'Post-Processing', 'Output', 'Other'];
                const categoryIndex = categoryOrder.indexOf(category);

                // Find where to insert (after groups that come before this category)
                let insertX = 50;
                let maxRight = 50;

                // Find the rightmost edge of all groups
                for (const g of groups) {
                    const groupRight = g.pos[0] + g.size[0];
                    if (groupRight > maxRight) {
                        maxRight = groupRight;
                    }
                }

                // New group goes at the right edge
                insertX = maxRight + 120; // 120px gap between groups

                // Create the new group
                const groupWidth = nodeWidth + padding * 2;
                const groupHeight = nodeHeight + padding * 2 + 30; // +30 for title
                const groupColor = this._getCategoryColor(category);

                this.saveUndoState(`Create group for ${nodeType}`);

                const newGroup = new LiteGraph.LGraphGroup();
                newGroup.title = category;
                newGroup.pos = [insertX, 50];
                newGroup.size = [groupWidth, groupHeight];
                newGroup.color = groupColor;

                app.graph.add(newGroup);
                app.graph.setDirtyCanvas(true, true);

                console.log(`[WorkflowAPI] Created new group "${category}" at (${insertX}, 50)`);

                return {
                    success: true,
                    position: [insertX + padding, 50 + padding + 30],
                    group: category,
                    action: 'created_new_group'
                };
            }

        } catch (e) {
            console.error('[WorkflowAPI] prepareGroupForNode failed:', e);
            return { success: false, error: e.message, position: [100, 100], group: null };
        }
    },

    /**
     * Helper: Shift a group and all nodes inside it
     */
    _shiftGroupWithContents(group, deltaX, deltaY) {
        // Find nodes inside this group
        const gLeft = group.pos[0];
        const gTop = group.pos[1];
        const gRight = gLeft + group.size[0];
        const gBottom = gTop + group.size[1];

        for (const node of app.graph._nodes) {
            const nLeft = node.pos[0];
            const nTop = node.pos[1];
            const nRight = nLeft + (node.size?.[0] || 200);
            const nBottom = nTop + (node.size?.[1] || 100);

            // Node is inside group if fully contained
            if (nLeft >= gLeft && nTop >= gTop && nRight <= gRight && nBottom <= gBottom) {
                node.pos[0] += deltaX;
                node.pos[1] += deltaY;
            }
        }

        // Shift the group itself
        group.pos[0] += deltaX;
        group.pos[1] += deltaY;
    },

    /**
     * Helper: Get category color
     */
    _getCategoryColor(category) {
        const colors = {
            'Setup': '#2A4858',
            'LoRAs': '#3A5868',
            'Prompts': '#4A3858',
            'Generation': '#385828',
            'Post-Processing': '#584828',
            'Output': '#285858',
            'Other': '#484848'
        };
        return colors[category] || '#484848';
    },

    /**
     * Helper: Check if a node is inside a group
     */
    _isNodeInGroup(node, group) {
        const nw = node.size?.[0] || 200;
        const nh = node.size?.[1] || 100;
        return node.pos[0] >= group.pos[0] &&
               node.pos[1] >= group.pos[1] &&
               node.pos[0] + nw <= group.pos[0] + group.size[0] &&
               node.pos[1] + nh <= group.pos[1] + group.size[1];
    },

    /**
     * Helper: Get all node IDs inside a group
     */
    _getNodesInGroup(group) {
        const nodeIds = [];
        for (const node of app.graph._nodes) {
            if (this._isNodeInGroup(node, group)) {
                nodeIds.push(node.id);
            }
        }
        return nodeIds;
    },

    /**
     * Helper: Refit group bounds to contain specified nodes
     */
    _refitGroupToNodes(group, nodeIds, padding = 60) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const nodeId of nodeIds) {
            const node = app.graph.getNodeById(nodeId);
            if (!node) continue;

            const nw = node.size?.[0] || 200;
            const nh = node.size?.[1] || 100;

            minX = Math.min(minX, node.pos[0]);
            minY = Math.min(minY, node.pos[1]);
            maxX = Math.max(maxX, node.pos[0] + nw);
            maxY = Math.max(maxY, node.pos[1] + nh);
        }

        if (minX !== Infinity) {
            group.pos[0] = minX - padding;
            group.pos[1] = minY - padding - 30; // Account for title bar
            group.size[0] = (maxX - minX) + padding * 2;
            group.size[1] = (maxY - minY) + padding * 2 + 30;
        }
    },

    /**
     * Split a group into multiple groups
     * @param {Object} split - Split configuration
     * @param {number|string} split.group - Group index or title
     * @param {Array} split.into - Array of {title, nodes, color?}
     */
    splitGroup(split) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const { group, into } = split;

            if (!into || !Array.isArray(into) || into.length === 0) {
                return {
                    success: false,
                    error: "Must provide 'into' array with new group specs",
                    hint: "split_group group='Loaders' into=[{title: 'Checkpoints', nodes: [1]}, {title: 'LoRAs', nodes: [2,3]}]"
                };
            }

            // Find existing group (filter out undefined entries)
            const groups = (app.graph._groups || []).filter(g => g && g.pos && g.size);
            const sourceGroup = typeof group === 'number'
                ? groups[group]
                : groups.find(g => g.title === group);

            if (!sourceGroup) {
                return {
                    success: false,
                    error: `Group not found: ${group}`,
                    hint: "Use detect_group_issues or list_groups to see available groups"
                };
            }

            // Get nodes currently in the source group
            const nodesInGroup = this._getNodesInGroup(sourceGroup);

            // Validate 'into' spec - all nodes must be in original group
            for (const newGroup of into) {
                if (!newGroup.nodes || !Array.isArray(newGroup.nodes)) {
                    return {
                        success: false,
                        error: `Each 'into' entry must have a 'nodes' array`
                    };
                }
                for (const nodeId of newGroup.nodes) {
                    if (!nodesInGroup.includes(nodeId)) {
                        return {
                            success: false,
                            error: `Node ${nodeId} is not in source group "${sourceGroup.title}"`,
                            hint: `Nodes in "${sourceGroup.title}": [${nodesInGroup.join(', ')}]`
                        };
                    }
                }
            }

            this.saveUndoState(`Split group: ${sourceGroup.title}`);
            const originalTitle = sourceGroup.title;
            const originalColor = sourceGroup.color;

            // Delete original group
            app.graph.remove(sourceGroup);

            // Create new groups
            const createdGroups = [];
            for (const spec of into) {
                const result = this.createGroupForNodes(
                    spec.title,
                    spec.nodes,
                    spec.color || originalColor,
                    60
                );
                if (result.success) {
                    createdGroups.push({
                        title: spec.title,
                        nodes: spec.nodes,
                        index: result.group_index
                    });
                }
            }

            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                original_group: originalTitle,
                new_groups: createdGroups,
                message: `Split "${originalTitle}" into ${createdGroups.length} groups`
            };

        } catch (e) {
            console.error('[WorkflowAPI] splitGroup failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Update a group's properties (enhanced with add_nodes/remove_nodes)
     * @param {number|string} groupRef - Group index or title
     * @param {Object} updates - Properties to update
     */
    updateGroup(groupRef, updates) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            // Filter out undefined entries (can happen after graph operations)
            const groups = (app.graph._groups || []).filter(g => g && g.pos && g.size);
            const group = typeof groupRef === 'number'
                ? groups[groupRef]
                : groups.find(g => g.title === groupRef);

            if (!group) {
                return {
                    success: false,
                    error: `Group not found: ${groupRef}`,
                    hint: "Use detect_group_issues or list_groups to see available groups"
                };
            }

            this.saveUndoState(`Update group: ${group.title}`);

            // Apply simple property updates
            if (updates.title) group.title = updates.title;
            if (updates.color) group.color = updates.color;
            if (updates.pos) {
                group.pos[0] = updates.pos[0];
                group.pos[1] = updates.pos[1];
            }
            if (updates.size) {
                group.size[0] = updates.size[0];
                group.size[1] = updates.size[1];
            }

            // Handle node membership changes
            if (updates.add_nodes || updates.remove_nodes) {
                // Get current nodes in group
                let currentNodes = this._getNodesInGroup(group);

                // Remove specified nodes (move outside group bounds)
                if (updates.remove_nodes) {
                    for (const nodeId of updates.remove_nodes) {
                        const node = app.graph.getNodeById(nodeId);
                        if (node) {
                            // Move node outside group (to the right)
                            node.pos[0] = group.pos[0] + group.size[0] + 50;
                        }
                        currentNodes = currentNodes.filter(id => id !== nodeId);
                    }
                }

                // Add specified nodes (move inside group if needed) and resize
                if (updates.add_nodes) {
                    for (const nodeId of updates.add_nodes) {
                        const node = app.graph.getNodeById(nodeId);
                        if (node && !currentNodes.includes(nodeId)) {
                            // Position node inside group if not already
                            if (!this._isNodeInGroup(node, group)) {
                                // Add to bottom of group
                                const bottomY = group.pos[1] + group.size[1] - 100;
                                node.pos[0] = group.pos[0] + 60;
                                node.pos[1] = bottomY;
                            }
                            currentNodes.push(nodeId);
                        }
                    }
                }

                // Refit group to contain all nodes
                if (currentNodes.length > 0) {
                    this._refitGroupToNodes(group, currentNodes);
                }
            }

            // Handle 'nodes' param (replace entire membership)
            if (updates.nodes && !updates.add_nodes && !updates.remove_nodes) {
                this._refitGroupToNodes(group, updates.nodes);
            }

            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                title: group.title,
                bounds: {
                    x: group.pos[0],
                    y: group.pos[1],
                    width: group.size[0],
                    height: group.size[1]
                }
            };

        } catch (e) {
            console.error('[WorkflowAPI] updateGroup failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Check if Set/Get nodes are available (exposed for tool use)
     */
    checkSetGetNodesAvailable() {
        return areSetGetNodesAvailable();
    },

    /**
     * Organize workflow with an LLM-provided plan
     * @param {Object} plan - Layout plan
     * @param {string} plan.flow - 'left_to_right' or 'top_to_bottom'
     * @param {Array} plan.groups - [{title, nodes, order, color?}]
     * @param {Object} options - Additional options
     * @param {boolean} options.cableless - Replace cross-group cables with Set/Get
     */
    organizeWithPlan(plan, options = {}) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const { cableless = false } = options;

            if (!plan?.groups || !Array.isArray(plan.groups)) {
                return {
                    success: false,
                    error: "Plan must include 'groups' array",
                    hint: "plan: {flow: 'left_to_right', groups: [{title, nodes, order}]}"
                };
            }

            this.saveUndoState('Organize with LLM plan');

            // Delete existing groups
            const existingGroups = [...(app.graph._groups || [])];
            for (const group of existingGroups) {
                app.graph.remove(group);
            }

            // Sort groups by order
            const sortedGroups = [...plan.groups].sort((a, b) =>
                (a.order || 0) - (b.order || 0)
            );

            // Determine flow direction
            const flow = plan.flow || 'left_to_right';
            const isHorizontal = flow === 'left_to_right';

            // Layout groups
            let currentPos = 50;
            const spacing = 60;
            const startY = 50;
            const createdGroups = [];

            for (const groupSpec of sortedGroups) {
                if (!groupSpec.nodes || groupSpec.nodes.length === 0) {
                    continue;
                }

                const result = this.layoutGroupNodes(
                    groupSpec.title,
                    groupSpec.nodes,
                    isHorizontal ? currentPos : 50,
                    isHorizontal ? startY : currentPos,
                    isHorizontal,
                    groupSpec.color
                );

                if (result.success) {
                    createdGroups.push(result);
                    currentPos += (isHorizontal ? result.width : result.height) + spacing;
                }
            }

            // Handle cableless mode - replace cross-group cables with Set/Get
            let setGetPairsCreated = 0;
            if (cableless && areSetGetNodesAvailable()) {
                // Build nodeId -> groupTitle mapping
                const nodeToGroup = new Map();
                for (const groupSpec of sortedGroups) {
                    for (const nodeId of groupSpec.nodes || []) {
                        nodeToGroup.set(nodeId, groupSpec.title);
                    }
                }

                // Find and replace cross-group links
                const usedNames = new Set();
                const links = app.graph.links || {};
                const linkArray = Object.values(links).filter(l => l);

                for (const link of linkArray) {
                    let originId, targetId, originSlot, targetSlot, type;
                    if (Array.isArray(link)) {
                        originId = link[1];
                        originSlot = link[2];
                        targetId = link[3];
                        targetSlot = link[4];
                        type = link[5];
                    } else {
                        originId = link.origin_id;
                        originSlot = link.origin_slot;
                        targetId = link.target_id;
                        targetSlot = link.target_slot;
                        type = link.type;
                    }

                    const sourceGroup = nodeToGroup.get(originId);
                    const targetGroup = nodeToGroup.get(targetId);

                    // Only process cross-group links
                    if (sourceGroup && targetGroup && sourceGroup !== targetGroup) {
                        const sourceNode = app.graph.getNodeById(originId);
                        const targetNode = app.graph.getNodeById(targetId);
                        if (!sourceNode || !targetNode) continue;

                        // Generate variable name
                        const varName = generateVariableName(sourceNode, originSlot, type || '*', usedNames);

                        // Create Set node
                        const setNode = createSetNode(varName, type || '*');
                        if (!setNode) continue;

                        // Position Set node near source
                        setNode.pos = [sourceNode.pos[0] + (sourceNode.size?.[0] || 200) + 20, sourceNode.pos[1]];
                        app.graph.add(setNode);

                        // Create Get node
                        const getNode = createGetNode(varName, type || '*');
                        if (!getNode) continue;

                        // Position Get node near target
                        getNode.pos = [targetNode.pos[0] - 150, targetNode.pos[1]];
                        app.graph.add(getNode);

                        // Disconnect original link
                        if (targetNode.inputs?.[targetSlot]?.link !== null) {
                            app.graph.removeLink(targetNode.inputs[targetSlot].link);
                        }

                        // Connect source -> Set, Get -> target
                        sourceNode.connect(originSlot, setNode, 0);
                        getNode.connect(0, targetNode, targetSlot);

                        setGetPairsCreated++;
                    }
                }
            }

            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                groups_created: createdGroups.length,
                flow: flow,
                cableless: cableless,
                setGetPairsCreated: setGetPairsCreated,
                groups: createdGroups
            };

        } catch (e) {
            console.error('[WorkflowAPI] organizeWithPlan failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Layout nodes for a group and create the group
     * @param {string} title - Group title
     * @param {number[]} nodeIds - Node IDs to include
     * @param {number} startX - Starting X position
     * @param {number} startY - Starting Y position
     * @param {boolean} isHorizontal - If true, groups flow left-to-right
     * @param {string} color - Optional group color
     */
    layoutGroupNodes(title, nodeIds, startX, startY, isHorizontal, color = null) {
        const nodes = nodeIds.map(id => app.graph.getNodeById(id)).filter(Boolean);
        if (nodes.length === 0) {
            return { success: false, error: `No valid nodes for group "${title}"` };
        }

        const padding = 60;
        const nodeSpacing = 30;

        // Calculate bounds needed
        let maxWidth = 0;
        let totalHeight = 0;
        for (const node of nodes) {
            const w = node.size?.[0] || 200;
            const h = node.size?.[1] || 100;
            maxWidth = Math.max(maxWidth, w);
            totalHeight += h + nodeSpacing;
        }
        totalHeight -= nodeSpacing; // Remove last spacing

        // Position nodes vertically within the group
        let currentY = startY + padding + 40; // Account for group title
        for (const node of nodes) {
            node.pos = [startX + padding, currentY];
            currentY += (node.size?.[1] || 100) + nodeSpacing;
        }

        // Create group
        const groupWidth = maxWidth + (padding * 2);
        const groupHeight = totalHeight + padding + 40 + padding; // title + content + bottom padding

        const group = new LiteGraph.LGraphGroup();
        group.title = title;
        group.pos = [startX, startY];
        group.size = [groupWidth, groupHeight];
        if (color) group.color = color;

        app.graph.add(group);

        return {
            success: true,
            title: title,
            width: groupWidth,
            height: groupHeight,
            node_count: nodes.length
        };
    },

    /**
     * Auto-fit a group to contain specified nodes
     */
    fitGroupToNodes(groupIndex, nodeIds, padding = 60) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            const groups = app.graph._groups || [];
            if (groupIndex < 0 || groupIndex >= groups.length) {
                return { success: false, error: `Invalid group index: ${groupIndex}` };
            }

            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;

            for (const nodeId of nodeIds) {
                const node = app.graph.getNodeById(nodeId);
                if (!node) continue;

                const nodeWidth = node.size?.[0] || 200;
                const nodeHeight = node.size?.[1] || 100;

                minX = Math.min(minX, node.pos[0]);
                minY = Math.min(minY, node.pos[1]);
                maxX = Math.max(maxX, node.pos[0] + nodeWidth);
                maxY = Math.max(maxY, node.pos[1] + nodeHeight);
            }

            if (minX === Infinity) {
                return { success: false, error: "No valid nodes found" };
            }

            const group = groups[groupIndex];
            this.saveUndoState(`Fit group to nodes: ${group.title}`);

            group.pos[0] = minX - padding;
            group.pos[1] = minY - padding - 30;
            group.size[0] = (maxX - minX) + (padding * 2);
            group.size[1] = (maxY - minY) + (padding * 2) + 30;

            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                title: group.title,
                bounds: {
                    x: group.pos[0],
                    y: group.pos[1],
                    width: group.size[0],
                    height: group.size[1]
                },
                fitted_nodes: nodeIds.length,
                message: `Fitted group "${group.title}" around ${nodeIds.length} nodes`
            };
        } catch (e) {
            console.error('[WorkflowAPI] fitGroupToNodes failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Align multiple nodes
     */
    alignNodes(nodeIds, alignment) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            if (!nodeIds || nodeIds.length < 2) {
                return { success: false, error: "Need at least 2 nodes to align" };
            }

            const nodes = nodeIds.map(id => app.graph.getNodeById(id)).filter(n => n);
            if (nodes.length < 2) {
                return { success: false, error: "Not enough valid nodes found" };
            }

            this.saveUndoState(`Align ${nodes.length} nodes: ${alignment}`);

            let refValue;
            switch (alignment) {
                case "left":
                    refValue = Math.min(...nodes.map(n => n.pos[0]));
                    nodes.forEach(n => n.pos[0] = refValue);
                    break;
                case "right":
                    refValue = Math.max(...nodes.map(n => n.pos[0] + (n.size?.[0] || 200)));
                    nodes.forEach(n => n.pos[0] = refValue - (n.size?.[0] || 200));
                    break;
                case "top":
                    refValue = Math.min(...nodes.map(n => n.pos[1]));
                    nodes.forEach(n => n.pos[1] = refValue);
                    break;
                case "bottom":
                    refValue = Math.max(...nodes.map(n => n.pos[1] + (n.size?.[1] || 100)));
                    nodes.forEach(n => n.pos[1] = refValue - (n.size?.[1] || 100));
                    break;
                case "center_h":
                    refValue = nodes.reduce((sum, n) => sum + n.pos[0] + (n.size?.[0] || 200) / 2, 0) / nodes.length;
                    nodes.forEach(n => n.pos[0] = refValue - (n.size?.[0] || 200) / 2);
                    break;
                case "center_v":
                    refValue = nodes.reduce((sum, n) => sum + n.pos[1] + (n.size?.[1] || 100) / 2, 0) / nodes.length;
                    nodes.forEach(n => n.pos[1] = refValue - (n.size?.[1] || 100) / 2);
                    break;
                default:
                    return { success: false, error: `Unknown alignment: ${alignment}` };
            }

            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                aligned_count: nodes.length,
                alignment: alignment,
                message: `Aligned ${nodes.length} nodes (${alignment})`
            };
        } catch (e) {
            console.error('[WorkflowAPI] alignNodes failed:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Distribute nodes evenly
     */
    distributeNodes(nodeIds, direction, spacing = null) {
        try {
            if (!app?.graph) {
                return { success: false, error: "Graph not available" };
            }

            if (!nodeIds || nodeIds.length < 3) {
                return { success: false, error: "Need at least 3 nodes to distribute" };
            }

            const nodes = nodeIds.map(id => app.graph.getNodeById(id)).filter(n => n);
            if (nodes.length < 3) {
                return { success: false, error: "Not enough valid nodes found" };
            }

            this.saveUndoState(`Distribute ${nodes.length} nodes: ${direction}`);

            const isHorizontal = direction === "horizontal";
            const posIndex = isHorizontal ? 0 : 1;

            nodes.sort((a, b) => a.pos[posIndex] - b.pos[posIndex]);

            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            const totalSpan = last.pos[posIndex] - first.pos[posIndex];

            if (spacing === null) {
                spacing = totalSpan / (nodes.length - 1);
            }

            const startPos = first.pos[posIndex];
            nodes.forEach((node, i) => {
                node.pos[posIndex] = startPos + (spacing * i);
            });

            app.graph.setDirtyCanvas(true, true);

            return {
                success: true,
                distributed_count: nodes.length,
                direction: direction,
                spacing: spacing,
                message: `Distributed ${nodes.length} nodes ${direction}ly with spacing ${Math.round(spacing)}px`
            };
        } catch (e) {
            console.error('[WorkflowAPI] distributeNodes failed:', e);
            return { success: false, error: e.message };
        }
    }
};
