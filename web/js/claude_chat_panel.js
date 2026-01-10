/**
 * ComfyUI Claude Chat - Panel UI Module
 *
 * Extracted from claude_chat.js for maintainability.
 * Creates the main chat panel DOM structure.
 */

/**
 * Create the chat panel DOM elements
 * @param {ClaudeChatPanel} chat - The chat panel instance
 */
export function createPanelDOM(chat) {
    // Create main panel
    chat.panel = document.createElement('div');
    chat.panel.id = 'claude-chat-panel';
    chat.panel.style.cssText = `
        position: fixed;
        top: ${chat.y}px;
        left: ${chat.x}px;
        width: ${chat.width}px;
        height: ${chat.height}px;
        background: #1a1a2e;
        border: 1px solid #3a3a5a;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        display: flex;
        flex-direction: column;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: ${chat.currentFontSize}px;
        overflow: hidden;
        touch-action: none;
    `;

    // Header
    const header = document.createElement('div');
    header.id = 'claude-chat-header';
    header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: linear-gradient(135deg, #D97706 0%, #B45309 100%);
        cursor: move;
        user-select: none;
        touch-action: none;
    `;
    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span style="color: white; font-weight: 600;">Claude Chat</span>
            <span id="claude-status-badge" style="
                font-size: 0.75em;
                padding: 2px 6px;
                border-radius: 10px;
                background: rgba(255,255,255,0.2);
                color: white;
            ">${chat.authMethod}</span>
            <span id="claude-prompt-guard-indicator" title="Prompt Guard Active - Your prompts are hidden from Claude" style="
                display: ${chat.promptGuardEnabled ? 'inline-flex' : 'none'};
                align-items: center;
                gap: 5px;
                padding: 3px 10px 3px 8px;
                margin-left: 4px;
                border-radius: 12px;
                background: rgba(255, 255, 255, 0.95);
                box-shadow: 0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.5);
                font-size: 10px;
                font-weight: 600;
                letter-spacing: 0.5px;
                text-transform: uppercase;
                color: #1e3a5f;
            ">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="#1e3a5f" stroke="none">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 3.18l6 2.67v4.15c0 4.15-2.88 8.03-6 9.18-3.12-1.15-6-5.03-6-9.18V6.85l6-2.67zm-1 5.82v6h2v-6h-2zm0-4v2h2V6h-2z"/>
                </svg>
                <span>Guarded</span>
            </span>
        </div>
    `;

    // Header buttons container
    const headerButtons = document.createElement('div');
    headerButtons.style.cssText = `
        display: flex;
        align-items: center;
        gap: 4px;
    `;

    // New Chat button
    const newChatBtn = createHeaderButton(
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"></path>
        </svg>`,
        'New Chat',
        (e) => {
            e.preventDefault();
            e.stopPropagation();
            chat.startNewChat();
        }
    );

    // Settings button
    const settingsBtn = createHeaderButton(
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
        </svg>`,
        'Settings',
        (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Claude Chat] Settings button clicked');
            chat.openSettings();
        }
    );

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 1.75em;
        cursor: pointer;
        padding: 0 8px;
        line-height: 1;
        opacity: 0.8;
    `;
    closeBtn.onmouseenter = () => closeBtn.style.opacity = '1';
    closeBtn.onmouseleave = () => closeBtn.style.opacity = '0.8';
    closeBtn.onclick = (e) => { e.stopPropagation(); chat.close(); };

    headerButtons.appendChild(newChatBtn);
    headerButtons.appendChild(settingsBtn);
    headerButtons.appendChild(closeBtn);
    header.appendChild(headerButtons);

    // Drag events
    header.addEventListener('mousedown', (e) => chat.startDrag(e));
    header.addEventListener('touchstart', (e) => chat.startDrag(e), { passive: false });

    // Messages container
    const messagesContainer = document.createElement('div');
    messagesContainer.id = 'claude-messages';
    messagesContainer.style.cssText = `
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        -webkit-overflow-scrolling: touch;
        font-size: inherit;
    `;

    // Welcome message
    chat.addWelcomeMessage(messagesContainer);

    // Input area
    const inputArea = createInputArea(chat);

    // Resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.id = 'claude-resize-handle';
    resizeHandle.style.cssText = `
        position: absolute;
        bottom: 0;
        right: 0;
        width: 30px;
        height: 30px;
        cursor: nwse-resize;
        touch-action: none;
    `;
    resizeHandle.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" style="position: absolute; bottom: 6px; right: 6px; opacity: 0.5;">
            <path d="M12 0L0 12M12 4L4 12M12 8L8 12" stroke="#888" stroke-width="2"/>
        </svg>
    `;
    resizeHandle.addEventListener('mousedown', (e) => chat.startResize(e));
    resizeHandle.addEventListener('touchstart', (e) => chat.startResize(e), { passive: false });

    // Assemble panel
    chat.panel.appendChild(header);
    chat.panel.appendChild(messagesContainer);
    chat.panel.appendChild(inputArea);
    chat.panel.appendChild(resizeHandle);

    document.body.appendChild(chat.panel);

    // Global events for drag/resize
    document.addEventListener('mousemove', (e) => chat.handleMove(e));
    document.addEventListener('mouseup', () => chat.handleEnd());
    document.addEventListener('touchmove', (e) => chat.handleMove(e), { passive: false });
    document.addEventListener('touchend', () => chat.handleEnd());
    document.addEventListener('touchcancel', () => chat.handleEnd());
}

/**
 * Create a header button with hover effects
 */
function createHeaderButton(iconHtml, title, onClick) {
    const btn = document.createElement('button');
    btn.innerHTML = iconHtml;
    btn.title = title;
    btn.style.cssText = `
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        padding: 4px;
        opacity: 0.8;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    btn.onmouseenter = () => btn.style.opacity = '1';
    btn.onmouseleave = () => btn.style.opacity = '0.8';
    btn.addEventListener('click', onClick);
    return btn;
}

/**
 * Create the input area with textarea, send button, and options
 */
function createInputArea(chat) {
    const inputArea = document.createElement('div');
    inputArea.style.cssText = `
        padding: 12px;
        border-top: 1px solid #3a3a5a;
        background: #16162a;
    `;

    const inputWrapper = document.createElement('div');
    inputWrapper.style.cssText = `
        display: flex;
        gap: 8px;
    `;

    const textarea = document.createElement('textarea');
    textarea.id = 'claude-input';
    textarea.placeholder = 'Ask about your workflow...';
    textarea.style.cssText = `
        flex: 1;
        padding: 10px 14px;
        border: 1px solid #3a3a5a;
        border-radius: 8px;
        background: #1a1a2e;
        color: #e0e0e0;
        font-size: inherit;
        resize: none;
        min-height: 44px;
        max-height: 120px;
        font-family: inherit;
    `;
    textarea.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chat.sendMessage();
        }
    };
    textarea.oninput = () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    };

    const sendBtn = document.createElement('button');
    sendBtn.id = 'claude-send-btn';
    sendBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
    `;
    sendBtn.style.cssText = `
        padding: 12px 16px;
        background: linear-gradient(135deg, #D97706 0%, #B45309 100%);
        border: none;
        border-radius: 8px;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        min-width: 50px;
    `;
    sendBtn.onclick = () => chat.sendMessage();

    inputWrapper.appendChild(textarea);
    inputWrapper.appendChild(sendBtn);
    inputArea.appendChild(inputWrapper);

    // Options row
    const optionsRow = createOptionsRow(chat);
    inputArea.appendChild(optionsRow);

    return inputArea;
}

/**
 * Create the options row with checkboxes and font size button
 */
function createOptionsRow(chat) {
    const optionsRow = document.createElement('div');
    optionsRow.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 8px;
    `;

    // Checkboxes container
    const checkboxContainer = document.createElement('div');
    checkboxContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
    `;

    // Workflow checkbox
    const workflowOption = createCheckboxOption('Workflow', 'claude-include-workflow', true);

    // Image checkbox
    const isMaxPlanOnly = chat.authPreference === 'max';
    const canUseImages = !isMaxPlanOnly && chat.hasApiKey;
    const imageOption = createCheckboxOption('Last image', 'claude-include-image', false, !canUseImages);
    imageOption.id = 'claude-image-option';
    imageOption.style.opacity = canUseImages ? '1' : '0.5';
    if (isMaxPlanOnly) {
        imageOption.title = 'Image analysis disabled in Max Plan Only mode';
    } else if (!chat.hasApiKey) {
        imageOption.title = 'Image analysis requires an Anthropic API key';
    } else {
        imageOption.title = 'Attach last generated image for analysis';
    }

    // Workflow modification mode
    const workflowModeOption = document.createElement('label');
    workflowModeOption.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.85em;
        color: #888;
        cursor: pointer;
    `;
    workflowModeOption.innerHTML = `
        <input type="checkbox" id="claude-workflow-mode" style="cursor: pointer; width: 14px; height: 14px;">
        <span style="color: #D97706;">Modify</span>
    `;
    workflowModeOption.title = 'Enable workflow modification mode - Claude can add/remove/connect nodes';

    checkboxContainer.appendChild(workflowOption);
    checkboxContainer.appendChild(imageOption);
    checkboxContainer.appendChild(workflowModeOption);

    // Font size button
    const fontSizeBtn = document.createElement('button');
    fontSizeBtn.id = 'claude-font-size-btn';
    fontSizeBtn.innerHTML = '<span style="font-size:0.7em">A</span><span style="font-size:0.9em">A</span><span style="font-size:1.1em">A</span>';
    fontSizeBtn.title = 'Change font size';
    fontSizeBtn.style.cssText = `
        background: #252540;
        border: 1px solid #3a3a5a;
        border-radius: 6px;
        color: #888;
        cursor: pointer;
        padding: 4px 10px;
        font-size: 0.85em;
        font-weight: 600;
        transition: all 0.2s;
    `;
    fontSizeBtn.onmouseenter = () => {
        fontSizeBtn.style.background = '#3a3a5a';
        fontSizeBtn.style.color = '#fff';
    };
    fontSizeBtn.onmouseleave = () => {
        fontSizeBtn.style.background = '#252540';
        fontSizeBtn.style.color = '#888';
    };
    fontSizeBtn.onclick = () => chat.cycleFontSize();

    optionsRow.appendChild(checkboxContainer);
    optionsRow.appendChild(fontSizeBtn);

    return optionsRow;
}

/**
 * Create a checkbox option label
 */
function createCheckboxOption(label, id, checked = false, disabled = false) {
    const option = document.createElement('label');
    option.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.85em;
        color: #888;
        cursor: pointer;
    `;
    option.innerHTML = `
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} style="cursor: pointer; width: 14px; height: 14px;">
        ${label}
    `;
    return option;
}
