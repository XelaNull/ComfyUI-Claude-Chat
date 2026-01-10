/**
 * ComfyUI Claude Chat - Settings Modal Module
 *
 * Extracted from claude_chat.js for maintainability.
 * Creates and manages the settings modal.
 */

// Dynamic imports to avoid circular dependency issues
// These are loaded on-demand when the Prompt Guard UI is accessed
let promptGuardUI = null;
let protectedNodesManager = null;

async function loadPromptGuardModules() {
    if (!promptGuardUI) {
        try {
            const uiModule = await import('./lib/prompt_guard_ui.js');
            promptGuardUI = uiModule.promptGuardUI;
        } catch (e) {
            console.warn('[Settings] Could not load promptGuardUI:', e);
        }
    }
    if (!protectedNodesManager) {
        try {
            const managerModule = await import('./lib/prompt_guard_manager.js');
            protectedNodesManager = managerModule.protectedNodesManager;
        } catch (e) {
            console.warn('[Settings] Could not load protectedNodesManager:', e);
        }
    }
}

/**
 * Open the settings modal
 * @param {ClaudeChatPanel} chat - The chat panel instance
 */
export async function openSettingsModal(chat) {
    console.log('[Claude Chat] openSettings() called');

    // Close existing modal if open
    const existing = document.getElementById('claude-settings-modal');
    if (existing) {
        console.log('[Claude Chat] Closing existing modal');
        existing.remove();
        return;
    }

    // Fetch current status
    let status = { auth_method: 'unknown', has_api_key: false };
    try {
        const response = await fetch('/claude-chat/status');
        status = await response.json();
    } catch (e) {
        console.error('[Claude Chat] Failed to fetch status:', e);
    }

    // Get stored preferences
    const savedPreference = localStorage.getItem('claude-chat-auth-preference') || 'auto';
    const savedApiKey = localStorage.getItem('claude-chat-api-key') || '';

    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'claude-settings-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
    `;

    // Modal content
    const content = document.createElement('div');
    content.style.cssText = `
        background: #1a1a2e;
        border: 1px solid #3a3a5a;
        border-radius: 12px;
        width: 480px;
        max-width: 90vw;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        overflow: hidden;
    `;

    // Modal header
    const header = createModalHeader(() => modal.remove());

    // Modal body
    const body = document.createElement('div');
    body.style.cssText = 'padding: 20px;';

    // Status section
    const statusSection = createStatusSection(status);

    // Auth preference section
    const authSection = createAuthSection(savedPreference);

    // API Key section
    const apiKeySection = createApiKeySection(savedApiKey);

    // Prompt Guard section
    const promptGuardSection = createPromptGuardSection();

    // Save button
    const saveBtn = createSaveButton(chat, modal);

    // Assemble modal
    body.appendChild(statusSection);
    body.appendChild(authSection);
    body.appendChild(apiKeySection);
    body.appendChild(promptGuardSection);
    body.appendChild(saveBtn);
    content.appendChild(header);
    content.appendChild(body);
    modal.appendChild(content);

    // Close on backdrop click
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);

    // Setup password visibility toggle
    setupPasswordToggle();
}

/**
 * Create modal header with close button
 */
function createModalHeader(onClose) {
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        background: linear-gradient(135deg, #D97706 0%, #B45309 100%);
    `;
    header.innerHTML = `
        <span style="color: white; font-weight: 600; font-size: 16px;">Settings</span>
    `;

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
    closeBtn.onclick = onClose;
    header.appendChild(closeBtn);

    return header;
}

/**
 * Create status display section
 */
function createStatusSection(status) {
    const section = document.createElement('div');
    section.style.cssText = `
        margin-bottom: 20px;
        padding: 12px;
        background: #252540;
        border-radius: 8px;
    `;

    const statusLabel = status.auth_method === 'max_plan' ? 'Max Plan (Claude CLI)' :
                       status.auth_method === 'anthropic_api' ? 'Anthropic API' :
                       status.auth_method === 'max_plan_no_cli' ? 'Max Plan (CLI Missing)' : 'Not Connected';
    const statusColor = status.auth_method === 'max_plan' || status.auth_method === 'anthropic_api' ? '#22c55e' : '#ef4444';

    section.innerHTML = `
        <div style="font-size: 12px; color: #888; margin-bottom: 4px;">Current Status</div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};"></span>
            <span style="color: #e0e0e0; font-weight: 500;">${statusLabel}</span>
        </div>
    `;

    return section;
}

/**
 * Create authentication preference section
 */
function createAuthSection(savedPreference) {
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom: 20px;';
    section.innerHTML = `
        <div style="font-size: 14px; color: #e0e0e0; font-weight: 500; margin-bottom: 12px;">Authentication Method</div>
    `;

    const options = [
        { value: 'auto', label: 'Auto (Recommended)', desc: 'Max Plan for chat, API Key for image analysis. Falls back to API if Max Plan unavailable.' },
        { value: 'api', label: 'Anthropic API Only', desc: 'Always use API key for all requests' },
        { value: 'max', label: 'Max Plan Only', desc: 'No image analysis (Last Image disabled)' }
    ];

    options.forEach(opt => {
        const optDiv = document.createElement('label');
        const isSelected = savedPreference === opt.value;
        optDiv.style.cssText = `
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 10px 12px;
            margin-bottom: 8px;
            background: ${isSelected ? 'rgba(217, 119, 6, 0.15)' : '#16162a'};
            border: 1px solid ${isSelected ? '#D97706' : '#3a3a5a'};
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        `;
        optDiv.innerHTML = `
            <input type="radio" name="claude-auth-pref" value="${opt.value}"
                ${isSelected ? 'checked' : ''}
                style="margin-top: 2px; cursor: pointer;">
            <div>
                <div style="color: #e0e0e0; font-size: 13px;">${opt.label}</div>
                <div style="color: #888; font-size: 11px;">${opt.desc}</div>
            </div>
        `;
        optDiv.onmouseenter = () => {
            if (!isSelected) optDiv.style.background = '#252540';
        };
        optDiv.onmouseleave = () => {
            if (!isSelected) optDiv.style.background = '#16162a';
        };
        section.appendChild(optDiv);
    });

    return section;
}

/**
 * Create API key input section
 */
function createApiKeySection(savedApiKey) {
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom: 20px;';
    section.innerHTML = `
        <div style="font-size: 14px; color: #e0e0e0; font-weight: 500; margin-bottom: 8px;">Anthropic API Key</div>
        <div style="position: relative;">
            <input type="password" id="claude-api-key-input" value="${savedApiKey}" placeholder="sk-ant-..." style="
                width: 100%;
                padding: 10px 40px 10px 12px;
                background: #16162a;
                border: 1px solid #3a3a5a;
                border-radius: 8px;
                color: #e0e0e0;
                font-size: 13px;
                font-family: monospace;
                box-sizing: border-box;
            ">
            <button id="claude-toggle-key-visibility" style="
                position: absolute;
                right: 8px;
                top: 50%;
                transform: translateY(-50%);
                background: none;
                border: none;
                color: #888;
                cursor: pointer;
                padding: 4px;
            ">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            </button>
        </div>
        <div style="font-size: 11px; color: #888; margin-top: 6px;">
            Get your API key from <a href="https://console.anthropic.com" target="_blank" style="color: #D97706;">console.anthropic.com</a>
        </div>
    `;

    return section;
}

/**
 * Create Prompt Guard section - Premium privacy control
 */
function createPromptGuardSection() {
    const savedPromptGuard = localStorage.getItem('claude-chat-prompt-guard') === 'true';

    const section = document.createElement('div');
    section.id = 'prompt-guard-section';
    section.style.cssText = `
        margin-bottom: 20px;
        padding: 0;
        background: linear-gradient(135deg, #1a2744 0%, #0f1a2e 100%);
        border-radius: 12px;
        border: 1px solid ${savedPromptGuard ? '#3b82f6' : '#2a3f5f'};
        overflow: hidden;
        transition: border-color 0.3s ease, box-shadow 0.3s ease;
        ${savedPromptGuard ? 'box-shadow: 0 0 20px rgba(59, 130, 246, 0.15);' : ''}
    `;

    section.innerHTML = `
        <!-- Header bar with gradient -->
        <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 16px;
            background: linear-gradient(90deg, rgba(59, 130, 246, ${savedPromptGuard ? '0.2' : '0.08'}) 0%, transparent 100%);
            border-bottom: 1px solid rgba(59, 130, 246, 0.1);
        ">
            <div style="display: flex; align-items: center; gap: 10px;">
                <!-- Shield icon container -->
                <div id="prompt-guard-icon-container" style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    background: ${savedPromptGuard
                        ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
                        : 'linear-gradient(135deg, #374151 0%, #1f2937 100%)'};
                    box-shadow: ${savedPromptGuard
                        ? '0 2px 8px rgba(59, 130, 246, 0.4)'
                        : '0 2px 4px rgba(0,0,0,0.2)'};
                    transition: all 0.3s ease;
                ">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="none">
                        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 3.18l6 2.67v4.15c0 4.15-2.88 8.03-6 9.18-3.12-1.15-6-5.03-6-9.18V6.85l6-2.67z"/>
                    </svg>
                </div>
                <div>
                    <div style="font-size: 13px; color: #f1f5f9; font-weight: 600; letter-spacing: 0.3px;">
                        Prompt Guard
                    </div>
                    <div id="prompt-guard-status" style="
                        font-size: 10px;
                        font-weight: 500;
                        letter-spacing: 0.5px;
                        text-transform: uppercase;
                        color: ${savedPromptGuard ? '#60a5fa' : '#64748b'};
                        transition: color 0.3s ease;
                    ">
                        ${savedPromptGuard ? '● Protected' : '○ Disabled'}
                    </div>
                </div>
            </div>

            <!-- Premium toggle switch -->
            <label style="position: relative; display: inline-block; width: 52px; height: 28px; cursor: pointer;">
                <input type="checkbox" id="claude-prompt-guard-toggle" ${savedPromptGuard ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
                <!-- Track -->
                <span id="prompt-guard-track" style="
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: ${savedPromptGuard
                        ? 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)'
                        : 'linear-gradient(90deg, #374151 0%, #1f2937 100%)'};
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    border-radius: 28px;
                    border: 1px solid ${savedPromptGuard ? '#60a5fa' : '#4b5563'};
                    box-shadow: inset 0 1px 3px rgba(0,0,0,0.3);
                "></span>
                <!-- Knob -->
                <span id="prompt-guard-knob" style="
                    position: absolute;
                    content: '';
                    height: 22px;
                    width: 22px;
                    left: ${savedPromptGuard ? '27px' : '3px'};
                    top: 3px;
                    background: linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    border-radius: 50%;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.8);
                "></span>
                <!-- Knob icon -->
                <span id="prompt-guard-knob-icon" style="
                    position: absolute;
                    left: ${savedPromptGuard ? '31px' : '7px'};
                    top: 7px;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    font-size: 10px;
                    line-height: 1;
                ">${savedPromptGuard ? '🔒' : '🔓'}</span>
            </label>
        </div>

        <!-- Description area -->
        <div style="padding: 12px 16px 14px;">
            <div style="
                font-size: 11.5px;
                color: #94a3b8;
                line-height: 1.5;
                margin-bottom: 10px;
            ">
                Privacy mode that <strong style="color: #cbd5e1;">hides all prompt text</strong> from Claude.
                Your creative ideas stay private while Claude can still help with workflow structure.
            </div>

            <!-- Feature pills -->
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                <span style="
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    background: rgba(59, 130, 246, 0.1);
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    border-radius: 6px;
                    font-size: 10px;
                    color: #93c5fd;
                ">
                    <span style="font-size: 9px;">📝</span> Text hidden
                </span>
                <span style="
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    background: rgba(59, 130, 246, 0.1);
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    border-radius: 6px;
                    font-size: 10px;
                    color: #93c5fd;
                ">
                    <span style="font-size: 9px;">🛡️</span> Edit blocked
                </span>
                <span style="
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    background: rgba(59, 130, 246, 0.1);
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    border-radius: 6px;
                    font-size: 10px;
                    color: #93c5fd;
                ">
                    <span style="font-size: 9px;">💾</span> Persisted
                </span>
                <span style="
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.2);
                    border-radius: 6px;
                    font-size: 10px;
                    color: #86efac;
                ">
                    <span style="font-size: 9px;">🤖</span> Auto-detect
                </span>
            </div>

            <!-- Manage Protected Nodes Button -->
            <button id="prompt-guard-manage-btn" style="
                margin-top: 12px;
                width: 100%;
                padding: 10px 16px;
                background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(29, 78, 216, 0.2) 100%);
                border: 1px solid rgba(59, 130, 246, 0.3);
                border-radius: 8px;
                color: #93c5fd;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: all 0.2s;
            ">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
                Manage Protected Nodes
                <span id="prompt-guard-count" style="
                    background: rgba(59, 130, 246, 0.3);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 10px;
                ">0</span>
            </button>
        </div>
    `;

    // Add interactive toggle functionality with animations
    setTimeout(() => {
        const toggle = document.getElementById('claude-prompt-guard-toggle');
        if (toggle) {
            toggle.onchange = () => {
                const isEnabled = toggle.checked;
                const track = document.getElementById('prompt-guard-track');
                const knob = document.getElementById('prompt-guard-knob');
                const knobIcon = document.getElementById('prompt-guard-knob-icon');
                const iconContainer = document.getElementById('prompt-guard-icon-container');
                const status = document.getElementById('prompt-guard-status');
                const sectionEl = document.getElementById('prompt-guard-section');

                // Update track
                track.style.background = isEnabled
                    ? 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)'
                    : 'linear-gradient(90deg, #374151 0%, #1f2937 100%)';
                track.style.borderColor = isEnabled ? '#60a5fa' : '#4b5563';

                // Update knob position and icon
                knob.style.left = isEnabled ? '27px' : '3px';
                knobIcon.style.left = isEnabled ? '31px' : '7px';
                knobIcon.textContent = isEnabled ? '🔒' : '🔓';

                // Update icon container
                iconContainer.style.background = isEnabled
                    ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
                    : 'linear-gradient(135deg, #374151 0%, #1f2937 100%)';
                iconContainer.style.boxShadow = isEnabled
                    ? '0 2px 8px rgba(59, 130, 246, 0.4)'
                    : '0 2px 4px rgba(0,0,0,0.2)';

                // Update status text
                status.textContent = isEnabled ? '● Protected' : '○ Disabled';
                status.style.color = isEnabled ? '#60a5fa' : '#64748b';

                // Update section border and glow
                sectionEl.style.borderColor = isEnabled ? '#3b82f6' : '#2a3f5f';
                sectionEl.style.boxShadow = isEnabled ? '0 0 20px rgba(59, 130, 246, 0.15)' : 'none';
            };
        }

        // Manage Protected Nodes button - load modules dynamically
        const manageBtn = document.getElementById('prompt-guard-manage-btn');
        if (manageBtn) {
            // Load modules and update count
            loadPromptGuardModules().then(() => {
                if (protectedNodesManager) {
                    const stats = protectedNodesManager.getStats();
                    const countEl = document.getElementById('prompt-guard-count');
                    if (countEl) {
                        countEl.textContent = stats.protected.toString();
                    }
                }
            });

            // Hover effects
            manageBtn.onmouseenter = () => {
                manageBtn.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(29, 78, 216, 0.3) 100%)';
                manageBtn.style.borderColor = 'rgba(59, 130, 246, 0.5)';
            };
            manageBtn.onmouseleave = () => {
                manageBtn.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(29, 78, 216, 0.2) 100%)';
                manageBtn.style.borderColor = 'rgba(59, 130, 246, 0.3)';
            };

            // Open Prompt Guard Manager modal
            manageBtn.onclick = async () => {
                await loadPromptGuardModules();
                if (promptGuardUI) {
                    promptGuardUI.open();
                } else {
                    console.error('[Settings] Prompt Guard UI not loaded');
                }
            };
        }
    }, 0);

    return section;
}

/**
 * Create save button
 */
function createSaveButton(chat, modal) {
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Settings';
    saveBtn.style.cssText = `
        width: 100%;
        padding: 12px;
        background: linear-gradient(135deg, #D97706 0%, #B45309 100%);
        border: none;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    `;
    saveBtn.onmouseenter = () => saveBtn.style.opacity = '0.9';
    saveBtn.onmouseleave = () => saveBtn.style.opacity = '1';
    saveBtn.onclick = async () => {
        const selectedPref = document.querySelector('input[name="claude-auth-pref"]:checked')?.value || 'auto';
        const apiKey = document.getElementById('claude-api-key-input')?.value || '';
        const promptGuard = document.getElementById('claude-prompt-guard-toggle')?.checked || false;

        // Save to localStorage
        localStorage.setItem('claude-chat-auth-preference', selectedPref);
        localStorage.setItem('claude-chat-api-key', apiKey);
        localStorage.setItem('claude-chat-prompt-guard', promptGuard.toString());

        // Update chat panel's prompt guard state and UI
        chat.promptGuardEnabled = promptGuard;
        chat.updatePromptGuardIndicator();

        // Send to backend
        try {
            const resp = await fetch('/claude-chat/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    auth_preference: selectedPref,
                    api_key: apiKey
                })
            });
            const result = await resp.json();
            if (result.success) {
                await chat.checkStatus();
                modal.remove();
            } else {
                alert('Failed to save settings: ' + (result.error || 'Unknown error'));
            }
        } catch (e) {
            console.error('[Claude Chat] Failed to save settings:', e);
            alert('Failed to save settings: ' + e.message);
        }
    };

    return saveBtn;
}

/**
 * Setup password visibility toggle
 */
function setupPasswordToggle() {
    const toggleBtn = document.getElementById('claude-toggle-key-visibility');
    const keyInput = document.getElementById('claude-api-key-input');
    if (toggleBtn && keyInput) {
        toggleBtn.onclick = () => {
            keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
        };
    }
}
