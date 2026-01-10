/**
 * ProtectedNodesManager - Manages the set of protected nodes for Prompt Guard
 *
 * Handles the combination of:
 * - Auto-detected nodes (from PromptGuardDetector)
 * - User-added nodes (manually marked as protected)
 * - User-removed nodes (overrides that exclude auto-detected nodes)
 *
 * Persists user preferences to localStorage.
 */

import { promptGuardDetector } from './prompt_guard_detector.js';

// ComfyUI API - use new window.comfyAPI pattern (ComfyUI 1.35+)
const { app } = window.comfyAPI?.app ?? await import("../../../../scripts/app.js");

// =============================================================================
// Storage Keys
// =============================================================================

const STORAGE_KEYS = {
    USER_ADDED: 'claude-chat-prompt-guard-user-added',
    USER_REMOVED: 'claude-chat-prompt-guard-user-removed',
    AUTO_DETECT_ENABLED: 'claude-chat-prompt-guard-auto-detect'
};

// =============================================================================
// Protected Node Status Types
// =============================================================================

/**
 * @typedef {'auto'|'manual'|'excluded'|'none'} ProtectionStatus
 * - auto: Automatically detected, user hasn't modified
 * - manual: User manually added protection
 * - excluded: Auto-detected but user excluded it
 * - none: Not protected
 */

/**
 * @typedef {Object} NodeProtectionInfo
 * @property {number} nodeId
 * @property {string} nodeType
 * @property {string|null} nodeTitle
 * @property {ProtectionStatus} status
 * @property {number} confidence - Auto-detection confidence (0 if manual)
 * @property {string[]} reasons - Detection reasons (empty if manual)
 * @property {string[]} widgetNames - Flagged widget names
 */

// =============================================================================
// ProtectedNodesManager Class
// =============================================================================

class ProtectedNodesManager {
    constructor() {
        // User overrides (persisted)
        this.userAdded = new Set();      // Node IDs manually added by user
        this.userRemoved = new Set();    // Node IDs excluded by user from auto-detect

        // Auto-detection control
        this.autoDetectEnabled = true;

        // Cached detection results
        this.lastDetectionResults = new Map();

        // Event listeners
        this.listeners = new Set();

        // Load persisted state
        this.load();
    }

    // =========================================================================
    // Core Methods
    // =========================================================================

    /**
     * Get the effective set of protected node IDs
     * @returns {Set<number>}
     */
    getProtectedNodeIds() {
        const protectedSet = new Set();

        // Add auto-detected nodes (if enabled)
        if (this.autoDetectEnabled) {
            this.lastDetectionResults = promptGuardDetector.detectAll();

            for (const nodeId of this.lastDetectionResults.keys()) {
                if (!this.userRemoved.has(nodeId)) {
                    protectedSet.add(nodeId);
                }
            }
        }

        // Add user-added nodes
        for (const nodeId of this.userAdded) {
            // Verify node still exists
            if (app?.graph?.getNodeById(nodeId)) {
                protectedSet.add(nodeId);
            }
        }

        return protectedSet;
    }

    /**
     * Get detailed protection info for all nodes
     * @returns {NodeProtectionInfo[]}
     */
    getAllNodeProtectionInfo() {
        const nodes = app?.graph?._nodes || [];
        const results = [];

        // Run detection
        if (this.autoDetectEnabled) {
            this.lastDetectionResults = promptGuardDetector.detectAll();
        }

        for (const node of nodes) {
            results.push(this.getNodeProtectionInfo(node.id));
        }

        // Sort by status (protected first, then by confidence)
        results.sort((a, b) => {
            const statusOrder = { manual: 0, auto: 1, excluded: 2, none: 3 };
            const statusDiff = statusOrder[a.status] - statusOrder[b.status];
            if (statusDiff !== 0) return statusDiff;
            return b.confidence - a.confidence;
        });

        return results;
    }

    /**
     * Get protection info for a single node
     * @param {number} nodeId
     * @returns {NodeProtectionInfo}
     */
    getNodeProtectionInfo(nodeId) {
        const node = app?.graph?.getNodeById(nodeId);

        if (!node) {
            return {
                nodeId,
                nodeType: 'Unknown',
                nodeTitle: null,
                status: 'none',
                confidence: 0,
                reasons: [],
                widgetNames: []
            };
        }

        const autoResult = this.lastDetectionResults.get(nodeId);
        const isAutoDetected = autoResult !== undefined;
        const isUserAdded = this.userAdded.has(nodeId);
        const isUserRemoved = this.userRemoved.has(nodeId);

        let status;
        if (isUserAdded) {
            status = 'manual';
        } else if (isAutoDetected && !isUserRemoved) {
            status = 'auto';
        } else if (isAutoDetected && isUserRemoved) {
            status = 'excluded';
        } else {
            status = 'none';
        }

        return {
            nodeId,
            nodeType: node.type?.split('/').pop() || node.type || 'Unknown',
            nodeTitle: node.title !== node.type ? node.title : null,
            status,
            confidence: autoResult?.confidence || 0,
            reasons: autoResult?.reasons?.map(r => r.detail).filter(Boolean) || [],
            widgetNames: autoResult?.widgetNames || []
        };
    }

    /**
     * Check if a specific node is protected
     * @param {number} nodeId
     * @returns {boolean}
     */
    isNodeProtected(nodeId) {
        return this.getProtectedNodeIds().has(nodeId);
    }

    // =========================================================================
    // User Override Methods
    // =========================================================================

    /**
     * Manually add a node to protected set
     * @param {number} nodeId
     */
    addManualProtection(nodeId) {
        this.userAdded.add(nodeId);
        // Remove from excluded if it was there
        this.userRemoved.delete(nodeId);
        this.save();
        this.notifyListeners('added', nodeId);
    }

    /**
     * Remove protection from a node
     * @param {number} nodeId
     */
    removeProtection(nodeId) {
        const wasUserAdded = this.userAdded.has(nodeId);
        this.userAdded.delete(nodeId);

        // If it was auto-detected, add to excluded
        if (this.lastDetectionResults.has(nodeId) && !wasUserAdded) {
            this.userRemoved.add(nodeId);
        }

        this.save();
        this.notifyListeners('removed', nodeId);
    }

    /**
     * Toggle protection status for a node
     * @param {number} nodeId
     * @returns {ProtectionStatus} New status
     */
    toggleProtection(nodeId) {
        const info = this.getNodeProtectionInfo(nodeId);

        if (info.status === 'none' || info.status === 'excluded') {
            // Add protection
            this.addManualProtection(nodeId);
            return this.userAdded.has(nodeId) ? 'manual' : 'auto';
        } else {
            // Remove protection
            this.removeProtection(nodeId);
            return this.lastDetectionResults.has(nodeId) ? 'excluded' : 'none';
        }
    }

    /**
     * Reset user overrides and use only auto-detection
     */
    resetToAutoDetect() {
        this.userAdded.clear();
        this.userRemoved.clear();
        this.save();
        this.notifyListeners('reset', null);
    }

    /**
     * Clear all protection (disable auto-detect and clear user selections)
     */
    clearAll() {
        this.userAdded.clear();
        this.userRemoved.clear();
        this.autoDetectEnabled = false;
        this.save();
        this.notifyListeners('cleared', null);
    }

    // =========================================================================
    // Auto-Detection Control
    // =========================================================================

    /**
     * Enable or disable auto-detection
     * @param {boolean} enabled
     */
    setAutoDetectEnabled(enabled) {
        this.autoDetectEnabled = enabled;
        localStorage.setItem(STORAGE_KEYS.AUTO_DETECT_ENABLED, enabled.toString());
        this.notifyListeners('auto-detect-changed', enabled);
    }

    /**
     * Check if auto-detection is enabled
     * @returns {boolean}
     */
    isAutoDetectEnabled() {
        return this.autoDetectEnabled;
    }

    /**
     * Force re-run auto-detection
     */
    refreshAutoDetection() {
        promptGuardDetector.invalidateCache();
        this.lastDetectionResults = promptGuardDetector.detectAll();
        this.notifyListeners('refreshed', null);
    }

    // =========================================================================
    // Persistence
    // =========================================================================

    /**
     * Save user overrides to localStorage
     */
    save() {
        try {
            localStorage.setItem(
                STORAGE_KEYS.USER_ADDED,
                JSON.stringify([...this.userAdded])
            );
            localStorage.setItem(
                STORAGE_KEYS.USER_REMOVED,
                JSON.stringify([...this.userRemoved])
            );
            localStorage.setItem(
                STORAGE_KEYS.AUTO_DETECT_ENABLED,
                this.autoDetectEnabled.toString()
            );
        } catch (e) {
            console.error('[ProtectedNodesManager] Failed to save:', e);
        }
    }

    /**
     * Load user overrides from localStorage
     */
    load() {
        try {
            const addedJson = localStorage.getItem(STORAGE_KEYS.USER_ADDED);
            const removedJson = localStorage.getItem(STORAGE_KEYS.USER_REMOVED);
            const autoDetect = localStorage.getItem(STORAGE_KEYS.AUTO_DETECT_ENABLED);

            if (addedJson) {
                this.userAdded = new Set(JSON.parse(addedJson));
            }
            if (removedJson) {
                this.userRemoved = new Set(JSON.parse(removedJson));
            }
            if (autoDetect !== null) {
                this.autoDetectEnabled = autoDetect === 'true';
            }
        } catch (e) {
            console.error('[ProtectedNodesManager] Failed to load:', e);
        }
    }

    // =========================================================================
    // Event System
    // =========================================================================

    /**
     * Add a listener for protection changes
     * @param {Function} callback - Called with (eventType, nodeId)
     */
    addListener(callback) {
        this.listeners.add(callback);
    }

    /**
     * Remove a listener
     * @param {Function} callback
     */
    removeListener(callback) {
        this.listeners.delete(callback);
    }

    /**
     * Notify all listeners of a change
     */
    notifyListeners(eventType, nodeId) {
        for (const listener of this.listeners) {
            try {
                listener(eventType, nodeId);
            } catch (e) {
                console.error('[ProtectedNodesManager] Listener error:', e);
            }
        }
    }

    // =========================================================================
    // Statistics
    // =========================================================================

    /**
     * Get statistics about protected nodes
     * @returns {Object}
     */
    getStats() {
        const allInfo = this.getAllNodeProtectionInfo();
        const protectedIds = this.getProtectedNodeIds();

        return {
            totalNodes: allInfo.length,
            protected: protectedIds.size,
            autoDetected: allInfo.filter(i => i.status === 'auto').length,
            manuallyAdded: allInfo.filter(i => i.status === 'manual').length,
            excluded: allInfo.filter(i => i.status === 'excluded').length,
            unprotected: allInfo.filter(i => i.status === 'none').length,
            autoDetectEnabled: this.autoDetectEnabled
        };
    }

    /**
     * Get detection summary from detector
     * @returns {Object}
     */
    getDetectionSummary() {
        return promptGuardDetector.getSummary();
    }
}

// Export singleton instance and class
const protectedNodesManager = new ProtectedNodesManager();

export {
    ProtectedNodesManager,
    protectedNodesManager,
    STORAGE_KEYS
};
