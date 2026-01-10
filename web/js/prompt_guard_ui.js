/**
 * PromptGuardUI - User interface for managing Prompt Guard protected nodes
 *
 * Provides a modal interface for:
 * - Viewing auto-detected prompt nodes
 * - Manually adding/removing node protection
 * - Toggling auto-detection on/off
 * - Resetting to default auto-detection
 */

import { protectedNodesManager } from './prompt_guard_manager.js';
import { promptGuardDetector, CONFIDENCE_THRESHOLD } from './prompt_guard_detector.js';

// ComfyUI API - use new window.comfyAPI pattern (ComfyUI 1.35+)
const { app } = window.comfyAPI?.app ?? await import("../../../../scripts/app.js");

// =============================================================================
// Styles
// =============================================================================

const STYLES = {
    modal: `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10002;
    `,
    content: `
        background: #1a1a2e;
        border: 1px solid #3b82f6;
        border-radius: 12px;
        width: 600px;
        max-width: 95vw;
        max-height: 85vh;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 30px rgba(59, 130, 246, 0.2);
        overflow: hidden;
        display: flex;
        flex-direction: column;
    `,
    header: `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        border-bottom: 1px solid rgba(255,255,255,0.1);
    `,
    headerTitle: `
        color: white;
        font-weight: 600;
        font-size: 16px;
        display: flex;
        align-items: center;
        gap: 10px;
    `,
    body: `
        padding: 16px 20px;
        overflow-y: auto;
        flex: 1;
    `,
    statsRow: `
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
        flex-wrap: wrap;
    `,
    statBadge: `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.2);
        border-radius: 8px;
        font-size: 12px;
        color: #93c5fd;
    `,
    section: `
        margin-bottom: 20px;
    `,
    sectionHeader: `
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
    `,
    sectionTitle: `
        font-size: 13px;
        font-weight: 600;
        color: #e0e0e0;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    `,
    nodeList: `
        max-height: 300px;
        overflow-y: auto;
        border: 1px solid #2a3f5f;
        border-radius: 8px;
        background: #0f1a2e;
    `,
    nodeItem: `
        display: flex;
        align-items: center;
        padding: 10px 14px;
        border-bottom: 1px solid #1a2744;
        cursor: pointer;
        transition: background 0.15s;
    `,
    nodeItemHover: `
        background: rgba(59, 130, 246, 0.1);
    `,
    nodeInfo: `
        flex: 1;
        min-width: 0;
    `,
    nodeName: `
        font-size: 13px;
        color: #e0e0e0;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `,
    nodeDetails: `
        font-size: 11px;
        color: #888;
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `,
    checkbox: `
        width: 18px;
        height: 18px;
        margin-right: 12px;
        cursor: pointer;
        accent-color: #3b82f6;
    `,
    confidenceBadge: `
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        margin-left: 8px;
    `,
    button: `
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
    `,
    buttonPrimary: `
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        color: white;
    `,
    buttonSecondary: `
        background: #252540;
        color: #e0e0e0;
        border: 1px solid #3a3a5a;
    `,
    footer: `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 20px;
        background: #16162a;
        border-top: 1px solid #2a3f5f;
    `,
    toggleContainer: `
        display: flex;
        align-items: center;
        gap: 10px;
    `,
    toggleLabel: `
        font-size: 13px;
        color: #e0e0e0;
    `,
    toggle: `
        position: relative;
        width: 44px;
        height: 24px;
        background: #374151;
        border-radius: 24px;
        cursor: pointer;
        transition: background 0.3s;
    `,
    toggleKnob: `
        position: absolute;
        width: 18px;
        height: 18px;
        background: white;
        border-radius: 50%;
        top: 3px;
        left: 3px;
        transition: left 0.3s;
    `,
    emptyState: `
        padding: 40px 20px;
        text-align: center;
        color: #888;
        font-size: 13px;
    `
};

// =============================================================================
// Status Badge Helpers
// =============================================================================

function getStatusBadge(status) {
    const badges = {
        auto: { bg: 'rgba(34, 197, 94, 0.2)', border: '#22c55e', color: '#86efac', text: 'Auto' },
        manual: { bg: 'rgba(59, 130, 246, 0.2)', border: '#3b82f6', color: '#93c5fd', text: 'Manual' },
        excluded: { bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444', color: '#fca5a5', text: 'Excluded' },
        none: { bg: 'rgba(107, 114, 128, 0.2)', border: '#6b7280', color: '#9ca3af', text: 'None' }
    };
    return badges[status] || badges.none;
}

function getConfidenceColor(confidence) {
    if (confidence >= 70) return { bg: 'rgba(34, 197, 94, 0.2)', color: '#86efac' };
    if (confidence >= 50) return { bg: 'rgba(234, 179, 8, 0.2)', color: '#fde047' };
    return { bg: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5' };
}

// =============================================================================
// PromptGuardUI Class
// =============================================================================

class PromptGuardUI {
    constructor() {
        this.modal = null;
        this.selectedFilter = 'all'; // 'all', 'protected', 'auto', 'manual', 'excluded'
    }

    /**
     * Open the Prompt Guard management modal
     */
    open() {
        // Close existing modal if any
        this.close();

        // Create modal
        this.modal = document.createElement('div');
        this.modal.id = 'prompt-guard-manager-modal';
        this.modal.style.cssText = STYLES.modal;

        // Create content
        const content = this.createContent();
        this.modal.appendChild(content);

        // Close on backdrop click
        this.modal.onclick = (e) => {
            if (e.target === this.modal) this.close();
        };

        // Close on Escape key
        this.escHandler = (e) => {
            if (e.key === 'Escape') this.close();
        };
        document.addEventListener('keydown', this.escHandler);

        document.body.appendChild(this.modal);

        // Focus management
        this.refreshNodeList();
    }

    /**
     * Close the modal
     */
    close() {
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
        if (this.escHandler) {
            document.removeEventListener('keydown', this.escHandler);
            this.escHandler = null;
        }
    }

    /**
     * Create modal content
     */
    createContent() {
        const content = document.createElement('div');
        content.style.cssText = STYLES.content;

        // Header
        content.appendChild(this.createHeader());

        // Body
        const body = document.createElement('div');
        body.style.cssText = STYLES.body;
        body.appendChild(this.createStatsSection());
        body.appendChild(this.createFilterSection());
        body.appendChild(this.createNodeListSection());
        content.appendChild(body);

        // Footer
        content.appendChild(this.createFooter());

        return content;
    }

    /**
     * Create modal header
     */
    createHeader() {
        const header = document.createElement('div');
        header.style.cssText = STYLES.header;

        const title = document.createElement('div');
        title.style.cssText = STYLES.headerTitle;
        title.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="none">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 3.18l6 2.67v4.15c0 4.15-2.88 8.03-6 9.18-3.12-1.15-6-5.03-6-9.18V6.85l6-2.67z"/>
            </svg>
            Prompt Guard Manager
        `;
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            padding: 0 4px;
            line-height: 1;
            opacity: 0.8;
        `;
        closeBtn.onclick = () => this.close();
        closeBtn.onmouseenter = () => closeBtn.style.opacity = '1';
        closeBtn.onmouseleave = () => closeBtn.style.opacity = '0.8';
        header.appendChild(closeBtn);

        return header;
    }

    /**
     * Create statistics section
     */
    createStatsSection() {
        const section = document.createElement('div');
        section.id = 'prompt-guard-stats';
        section.style.cssText = STYLES.statsRow;

        this.updateStats(section);
        return section;
    }

    /**
     * Update statistics display
     */
    updateStats(container = null) {
        const stats = protectedNodesManager.getStats();
        const target = container || document.getElementById('prompt-guard-stats');
        if (!target) return;

        target.innerHTML = `
            <span style="${STYLES.statBadge}">
                <span style="font-size: 14px;">🛡️</span>
                <strong>${stats.protected}</strong> Protected
            </span>
            <span style="${STYLES.statBadge}">
                <span style="font-size: 14px;">🤖</span>
                <strong>${stats.autoDetected}</strong> Auto-detected
            </span>
            <span style="${STYLES.statBadge}">
                <span style="font-size: 14px;">✋</span>
                <strong>${stats.manuallyAdded}</strong> Manual
            </span>
            <span style="${STYLES.statBadge}">
                <span style="font-size: 14px;">❌</span>
                <strong>${stats.excluded}</strong> Excluded
            </span>
            <span style="${STYLES.statBadge}">
                <span style="font-size: 14px;">📊</span>
                <strong>${stats.totalNodes}</strong> Total nodes
            </span>
        `;
    }

    /**
     * Create filter section
     */
    createFilterSection() {
        const section = document.createElement('div');
        section.style.cssText = STYLES.section;

        const header = document.createElement('div');
        header.style.cssText = STYLES.sectionHeader;

        const title = document.createElement('div');
        title.style.cssText = STYLES.sectionTitle;
        title.textContent = 'Filter Nodes';
        header.appendChild(title);

        section.appendChild(header);

        // Filter buttons
        const filters = document.createElement('div');
        filters.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';

        const filterOptions = [
            { id: 'all', label: 'All', icon: '📋' },
            { id: 'protected', label: 'Protected', icon: '🛡️' },
            { id: 'auto', label: 'Auto', icon: '🤖' },
            { id: 'manual', label: 'Manual', icon: '✋' },
            { id: 'excluded', label: 'Excluded', icon: '❌' },
            { id: 'unprotected', label: 'Unprotected', icon: '⚪' }
        ];

        for (const opt of filterOptions) {
            const btn = document.createElement('button');
            btn.id = `filter-${opt.id}`;
            btn.style.cssText = `
                ${STYLES.button}
                ${this.selectedFilter === opt.id ? STYLES.buttonPrimary : STYLES.buttonSecondary}
            `;
            btn.innerHTML = `${opt.icon} ${opt.label}`;
            btn.onclick = () => {
                this.selectedFilter = opt.id;
                this.updateFilterButtons();
                this.refreshNodeList();
            };
            filters.appendChild(btn);
        }

        section.appendChild(filters);
        return section;
    }

    /**
     * Update filter button states
     */
    updateFilterButtons() {
        const filters = ['all', 'protected', 'auto', 'manual', 'excluded', 'unprotected'];
        for (const id of filters) {
            const btn = document.getElementById(`filter-${id}`);
            if (btn) {
                btn.style.cssText = `
                    ${STYLES.button}
                    ${this.selectedFilter === id ? STYLES.buttonPrimary : STYLES.buttonSecondary}
                `;
            }
        }
    }

    /**
     * Create node list section
     */
    createNodeListSection() {
        const section = document.createElement('div');
        section.style.cssText = STYLES.section;

        const header = document.createElement('div');
        header.style.cssText = STYLES.sectionHeader;

        const title = document.createElement('div');
        title.style.cssText = STYLES.sectionTitle;
        title.textContent = 'Nodes';
        header.appendChild(title);

        // Refresh button
        const refreshBtn = document.createElement('button');
        refreshBtn.style.cssText = `${STYLES.button} ${STYLES.buttonSecondary} font-size: 11px; padding: 4px 10px;`;
        refreshBtn.innerHTML = '🔄 Refresh Detection';
        refreshBtn.onclick = () => {
            protectedNodesManager.refreshAutoDetection();
            this.refreshNodeList();
            this.updateStats();
        };
        header.appendChild(refreshBtn);

        section.appendChild(header);

        // Node list container
        const list = document.createElement('div');
        list.id = 'prompt-guard-node-list';
        list.style.cssText = STYLES.nodeList;
        section.appendChild(list);

        return section;
    }

    /**
     * Refresh the node list based on current filter
     */
    refreshNodeList() {
        const list = document.getElementById('prompt-guard-node-list');
        if (!list) return;

        const allInfo = protectedNodesManager.getAllNodeProtectionInfo();

        // Filter based on selection
        let filtered;
        switch (this.selectedFilter) {
            case 'protected':
                filtered = allInfo.filter(i => i.status === 'auto' || i.status === 'manual');
                break;
            case 'auto':
                filtered = allInfo.filter(i => i.status === 'auto');
                break;
            case 'manual':
                filtered = allInfo.filter(i => i.status === 'manual');
                break;
            case 'excluded':
                filtered = allInfo.filter(i => i.status === 'excluded');
                break;
            case 'unprotected':
                filtered = allInfo.filter(i => i.status === 'none');
                break;
            default:
                filtered = allInfo;
        }

        if (filtered.length === 0) {
            list.innerHTML = `
                <div style="${STYLES.emptyState}">
                    <div style="font-size: 32px; margin-bottom: 10px;">🔍</div>
                    No nodes match this filter
                </div>
            `;
            return;
        }

        list.innerHTML = '';
        for (const info of filtered) {
            list.appendChild(this.createNodeItem(info));
        }
    }

    /**
     * Create a node list item
     */
    createNodeItem(info) {
        const item = document.createElement('div');
        item.style.cssText = STYLES.nodeItem;
        item.onmouseenter = () => item.style.background = 'rgba(59, 130, 246, 0.1)';
        item.onmouseleave = () => item.style.background = 'transparent';

        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.style.cssText = STYLES.checkbox;
        checkbox.checked = info.status === 'auto' || info.status === 'manual';
        checkbox.onchange = () => {
            protectedNodesManager.toggleProtection(info.nodeId);
            this.refreshNodeList();
            this.updateStats();
        };
        item.appendChild(checkbox);

        // Node info
        const nodeInfo = document.createElement('div');
        nodeInfo.style.cssText = STYLES.nodeInfo;

        // Node name with ID
        const nodeName = document.createElement('div');
        nodeName.style.cssText = STYLES.nodeName;
        nodeName.textContent = `#${info.nodeId} ${info.nodeTitle || info.nodeType}`;
        nodeInfo.appendChild(nodeName);

        // Details line
        const details = document.createElement('div');
        details.style.cssText = STYLES.nodeDetails;

        let detailParts = [info.nodeType];
        if (info.widgetNames.length > 0) {
            detailParts.push(`widgets: ${info.widgetNames.join(', ')}`);
        }
        if (info.reasons.length > 0) {
            detailParts.push(info.reasons[0]);
        }
        details.textContent = detailParts.join(' | ');
        details.title = info.reasons.join('\n');
        nodeInfo.appendChild(details);

        item.appendChild(nodeInfo);

        // Status badge
        const badge = getStatusBadge(info.status);
        const statusBadge = document.createElement('span');
        statusBadge.style.cssText = `
            ${STYLES.confidenceBadge}
            background: ${badge.bg};
            border: 1px solid ${badge.border};
            color: ${badge.color};
        `;
        statusBadge.textContent = badge.text;
        item.appendChild(statusBadge);

        // Confidence badge (for auto-detected)
        if (info.confidence > 0) {
            const confColor = getConfidenceColor(info.confidence);
            const confBadge = document.createElement('span');
            confBadge.style.cssText = `
                ${STYLES.confidenceBadge}
                background: ${confColor.bg};
                color: ${confColor.color};
            `;
            confBadge.textContent = `${info.confidence}%`;
            confBadge.title = `Detection confidence: ${info.confidence}%`;
            item.appendChild(confBadge);
        }

        // Focus node button
        const focusBtn = document.createElement('button');
        focusBtn.style.cssText = `
            ${STYLES.button}
            padding: 4px 8px;
            margin-left: 8px;
            background: transparent;
            border: 1px solid #3a3a5a;
            color: #888;
        `;
        focusBtn.innerHTML = '🎯';
        focusBtn.title = 'Focus on canvas';
        focusBtn.onclick = (e) => {
            e.stopPropagation();
            this.focusNode(info.nodeId);
        };
        focusBtn.onmouseenter = () => {
            focusBtn.style.borderColor = '#3b82f6';
            focusBtn.style.color = '#e0e0e0';
        };
        focusBtn.onmouseleave = () => {
            focusBtn.style.borderColor = '#3a3a5a';
            focusBtn.style.color = '#888';
        };
        item.appendChild(focusBtn);

        return item;
    }

    /**
     * Focus on a node in the canvas
     */
    focusNode(nodeId) {
        const node = app?.graph?.getNodeById(nodeId);
        if (node && app?.canvas) {
            // Center canvas on node
            const x = node.pos[0] + (node.size?.[0] || 200) / 2;
            const y = node.pos[1] + (node.size?.[1] || 100) / 2;

            app.canvas.centerOnNode(node);

            // Flash the node briefly
            const originalColor = node.bgcolor;
            node.bgcolor = '#3b82f6';
            app.canvas.draw(true, true);

            setTimeout(() => {
                node.bgcolor = originalColor;
                app.canvas.draw(true, true);
            }, 500);
        }
    }

    /**
     * Create modal footer
     */
    createFooter() {
        const footer = document.createElement('div');
        footer.style.cssText = STYLES.footer;

        // Auto-detect toggle
        const toggleContainer = document.createElement('div');
        toggleContainer.style.cssText = STYLES.toggleContainer;

        const toggleLabel = document.createElement('span');
        toggleLabel.style.cssText = STYLES.toggleLabel;
        toggleLabel.textContent = 'Auto-detect prompts';
        toggleContainer.appendChild(toggleLabel);

        const toggle = document.createElement('div');
        toggle.id = 'auto-detect-toggle';
        const isEnabled = protectedNodesManager.isAutoDetectEnabled();
        toggle.style.cssText = `
            ${STYLES.toggle}
            background: ${isEnabled ? '#3b82f6' : '#374151'};
        `;

        const knob = document.createElement('div');
        knob.id = 'auto-detect-knob';
        knob.style.cssText = `
            ${STYLES.toggleKnob}
            left: ${isEnabled ? '23px' : '3px'};
        `;
        toggle.appendChild(knob);

        toggle.onclick = () => {
            const newState = !protectedNodesManager.isAutoDetectEnabled();
            protectedNodesManager.setAutoDetectEnabled(newState);

            toggle.style.background = newState ? '#3b82f6' : '#374151';
            knob.style.left = newState ? '23px' : '3px';

            this.refreshNodeList();
            this.updateStats();
        };

        toggleContainer.appendChild(toggle);
        footer.appendChild(toggleContainer);

        // Action buttons
        const buttons = document.createElement('div');
        buttons.style.cssText = 'display: flex; gap: 10px;';

        const resetBtn = document.createElement('button');
        resetBtn.style.cssText = `${STYLES.button} ${STYLES.buttonSecondary}`;
        resetBtn.textContent = 'Reset to Auto';
        resetBtn.onclick = () => {
            protectedNodesManager.resetToAutoDetect();
            this.refreshNodeList();
            this.updateStats();
        };
        buttons.appendChild(resetBtn);

        const doneBtn = document.createElement('button');
        doneBtn.style.cssText = `${STYLES.button} ${STYLES.buttonPrimary}`;
        doneBtn.textContent = 'Done';
        doneBtn.onclick = () => this.close();
        buttons.appendChild(doneBtn);

        footer.appendChild(buttons);

        return footer;
    }
}

// Export singleton instance
const promptGuardUI = new PromptGuardUI();

export { PromptGuardUI, promptGuardUI };
