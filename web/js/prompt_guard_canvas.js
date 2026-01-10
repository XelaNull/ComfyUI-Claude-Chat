/**
 * PromptGuardCanvas - Visual indicators for protected nodes on the canvas
 *
 * Hooks into LiteGraph's rendering to display shield badges on nodes
 * that are protected by Prompt Guard.
 */

// ComfyUI API - use new window.comfyAPI pattern (ComfyUI 1.35+)
const { app } = window.comfyAPI?.app ?? await import("../../../scripts/app.js");
import { protectedNodesManager } from "./prompt_guard_manager.js";

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
    // Badge appearance
    badgeSize: 16,
    badgePadding: 4,
    badgeColor: '#3b82f6',
    badgeBorderColor: '#60a5fa',
    badgeGlow: 'rgba(59, 130, 246, 0.4)',

    // Border highlight for protected nodes
    borderColor: '#3b82f6',
    borderWidth: 2,

    // Shield icon (SVG path data for a simple shield)
    shieldPath: new Path2D('M8 1L1 4v4.5c0 4.16 2.88 8.05 7 9 4.12-.95 7-4.84 7-9V4L8 1z'),

    // Update throttle (ms)
    updateThrottleMs: 100
};

// =============================================================================
// Canvas Renderer Class
// =============================================================================

class PromptGuardCanvas {
    constructor() {
        this.enabled = false;
        this.protectedNodeIds = new Set();
        this.lastUpdate = 0;
        this.originalDrawNode = null;
        this.installed = false;
    }

    /**
     * Install the canvas hooks
     */
    install() {
        if (this.installed) return;

        // Wait for app to be ready
        const tryInstall = () => {
            if (!app?.graph) {
                setTimeout(tryInstall, 500);
                return;
            }

            this.hookIntoRendering();
            this.installed = true;
            console.log('[PromptGuardCanvas] Installed canvas hooks');
        };

        tryInstall();

        // Listen for protection changes
        protectedNodesManager.addListener((eventType, nodeId) => {
            this.refreshProtectedNodes();
            if (app?.canvas) {
                app.canvas.draw(true, true);
            }
        });
    }

    /**
     * Hook into LiteGraph's node rendering
     */
    hookIntoRendering() {
        // Use LiteGraph's node drawing extension
        // We'll add our own drawing after the node is drawn
        const self = this;

        // Store reference to original method if needed
        if (typeof LiteGraph !== 'undefined' && LiteGraph.LGraphNode) {
            const originalDrawNode = LiteGraph.LGraphNode.prototype.onDrawForeground;

            LiteGraph.LGraphNode.prototype.onDrawForeground = function(ctx, graphCanvas) {
                // Call original if exists
                if (originalDrawNode) {
                    originalDrawNode.call(this, ctx, graphCanvas);
                }

                // Draw our shield badge if this node is protected
                if (self.enabled && self.protectedNodeIds.has(this.id)) {
                    self.drawShieldBadge(ctx, this);
                }
            };
        }

        // Also hook into the general draw loop for border highlighting
        if (app?.canvas) {
            const originalDraw = app.canvas.draw;
            app.canvas.draw = function(...args) {
                originalDraw.apply(this, args);
                // Additional drawing could go here
            };
        }
    }

    /**
     * Draw a shield badge on a protected node
     * @param {CanvasRenderingContext2D} ctx
     * @param {LGraphNode} node
     */
    drawShieldBadge(ctx, node) {
        const size = CONFIG.badgeSize;
        const padding = CONFIG.badgePadding;

        // Position: top-right corner of the node
        const x = node.size[0] - size - padding;
        const y = -size - padding - 4; // Above the node header

        ctx.save();

        // Translate to badge position
        ctx.translate(x, y);

        // Draw glow effect
        ctx.shadowColor = CONFIG.badgeGlow;
        ctx.shadowBlur = 8;

        // Draw badge background (circle)
        ctx.fillStyle = CONFIG.badgeColor;
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
        ctx.fill();

        // Draw border
        ctx.strokeStyle = CONFIG.badgeBorderColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Reset shadow for icon
        ctx.shadowBlur = 0;

        // Draw shield icon (scaled and centered)
        ctx.translate(size/2 - 6, size/2 - 7);
        ctx.scale(0.75, 0.75);
        ctx.fillStyle = 'white';
        ctx.fill(CONFIG.shieldPath);

        ctx.restore();
    }

    /**
     * Draw a highlighted border around a protected node
     * @param {CanvasRenderingContext2D} ctx
     * @param {LGraphNode} node
     */
    drawProtectedBorder(ctx, node) {
        ctx.save();

        ctx.strokeStyle = CONFIG.borderColor;
        ctx.lineWidth = CONFIG.borderWidth;
        ctx.shadowColor = CONFIG.badgeGlow;
        ctx.shadowBlur = 6;

        // Draw rounded rectangle around node
        const radius = 8;
        const x = -CONFIG.borderWidth;
        const y = -LiteGraph.NODE_TITLE_HEIGHT - CONFIG.borderWidth;
        const width = node.size[0] + CONFIG.borderWidth * 2;
        const height = node.size[1] + LiteGraph.NODE_TITLE_HEIGHT + CONFIG.borderWidth * 2;

        ctx.beginPath();
        ctx.roundRect(x, y, width, height, radius);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Enable/disable visual indicators
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (enabled) {
            this.refreshProtectedNodes();
        }
        if (app?.canvas) {
            app.canvas.draw(true, true);
        }
    }

    /**
     * Refresh the set of protected node IDs
     */
    refreshProtectedNodes() {
        // Throttle updates
        const now = Date.now();
        if (now - this.lastUpdate < CONFIG.updateThrottleMs) {
            return;
        }
        this.lastUpdate = now;

        this.protectedNodeIds = protectedNodesManager.getProtectedNodeIds();
    }

    /**
     * Check if a node is protected (for external use)
     * @param {number} nodeId
     * @returns {boolean}
     */
    isNodeProtected(nodeId) {
        return this.protectedNodeIds.has(nodeId);
    }
}

// =============================================================================
// Alternative: Use ComfyUI's Extension System
// =============================================================================

/**
 * Register as a ComfyUI extension for proper integration
 */
function registerPromptGuardExtension() {
    if (!app?.registerExtension) {
        console.warn('[PromptGuardCanvas] app.registerExtension not available');
        return;
    }

    app.registerExtension({
        name: 'claude-chat.prompt-guard-canvas',
        async setup() {
            console.log('[PromptGuardCanvas] Extension setup');
        },
        async nodeCreated(node) {
            // Can add per-node setup here if needed
        },
        async beforeRegisterNodeDef(nodeType, nodeData, app) {
            // Hook into node type definition if needed
        }
    });
}

// =============================================================================
// Singleton & Export
// =============================================================================

const promptGuardCanvas = new PromptGuardCanvas();

// Auto-install when module loads
if (typeof window !== 'undefined') {
    // Delay installation until DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            promptGuardCanvas.install();
        });
    } else {
        setTimeout(() => promptGuardCanvas.install(), 100);
    }
}

export { PromptGuardCanvas, promptGuardCanvas };
