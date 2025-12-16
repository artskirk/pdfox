/**
 * PDFOX Unified Text Editor Module
 * Single entry point for all text editing operations
 * Modes: add, edit, editOverlay, ocr
 */

const PDFoxUnifiedTextEditor = (function() {
    'use strict';

    const core = PDFoxCore;
    const ui = PDFoxUI;
    const { generateId, hexToRgba, rgbaToHex, escapeHtml } = PDFoxUtils;

    // Modal state
    let modal = null;
    let currentMode = null;
    let currentData = null;
    let escHandler = null;

    // Font options
    const fonts = [
        { value: 'Arial, sans-serif', label: 'Arial' },
        { value: "'Times New Roman', serif", label: 'Times New Roman' },
        { value: "'Courier New', monospace", label: 'Courier New' },
        { value: 'Georgia, serif', label: 'Georgia' },
        { value: 'Verdana, sans-serif', label: 'Verdana' },
        { value: "'Helvetica Neue', Helvetica, sans-serif", label: 'Helvetica' }
    ];

    // Font size presets
    const fontSizePresets = [10, 12, 14, 18, 24, 36];

    /**
     * Get mode configuration
     * @param {string} mode - Mode name
     * @returns {Object} Mode config
     */
    function getModeConfig(mode) {
        const configs = {
            add: {
                title: 'Add Text',
                icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E50914" stroke-width="2">
                    <path d="M12 5v14M5 12h14"/>
                </svg>`,
                subtitle: 'Add new text to the document',
                showOriginal: false,
                showOcrInfo: false,
                showCopyBtn: false,
                showTransparent: true,
                primaryBtn: 'Add Text',
                primaryAction: saveAdd
            },
            edit: {
                title: 'Edit Text',
                icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E50914" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>`,
                subtitle: 'Edit existing text in the document',
                showOriginal: true,
                showOcrInfo: false,
                showCopyBtn: false,
                showTransparent: true,
                primaryBtn: 'Save Changes',
                primaryAction: saveEdit
            },
            editOverlay: {
                title: 'Edit Text',
                icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E50914" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>`,
                subtitle: 'Edit text overlay properties',
                showOriginal: false,
                showOcrInfo: false,
                showCopyBtn: false,
                showTransparent: true,
                primaryBtn: 'Save Changes',
                primaryAction: saveEditOverlay
            },
            ocr: {
                title: 'Smart Text Extraction',
                icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E50914" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M7 8h10M7 12h10M7 16h6" stroke-linecap="round"/>
                </svg>`,
                subtitle: null,
                showOriginal: false,
                showOcrInfo: true,
                showCopyBtn: true,
                showTransparent: true,
                primaryBtn: 'Insert as Text',
                primaryAction: saveOcr
            }
        };
        return configs[mode] || configs.add;
    }

    /**
     * Create modal HTML
     * @param {Object} config - Mode configuration
     * @param {Object} data - Initial data
     * @param {string} mode - Current mode
     * @returns {string} HTML string
     */
    function createModalHTML(config, data, mode) {
        const text = data.text || '';
        const fontSize = data.fontSize || 14;
        const textColor = data.textColor || data.color || '#000000';
        const bgColor = data.bgColor ? rgbaToHex(data.bgColor) : '#ffffff';
        const fontFamily = data.fontFamily || 'Arial, sans-serif';
        const isBold = data.isBold || false;
        const isItalic = data.isItalic || false;
        // Default to transparent for 'add' mode, otherwise check existing data
        const isTransparent = data.isTransparent !== undefined
            ? data.isTransparent
            : (mode === 'add' || mode === 'ocr')
                ? true
                : (data.bgColor && data.bgColor.includes('rgba') && data.bgColor.includes(', 0)'));

        const fontOptions = fonts.map(f =>
            `<option value="${f.value}" ${fontFamily === f.value ? 'selected' : ''}>${f.label}</option>`
        ).join('');

        const fontSizeButtons = fontSizePresets.map(size =>
            `<button type="button" class="font-size-preset" data-size="${size}">${size}</button>`
        ).join('');

        return `
            <div class="unified-editor-modal-backdrop">
                <div class="unified-editor-modal">
                    <!-- Header -->
                    <div class="unified-editor-header">
                        <div class="unified-editor-title">
                            ${config.icon}
                            <div>
                                <h3>${config.title}</h3>
                                ${config.subtitle ? `<p class="subtitle">${config.subtitle}</p>` : ''}
                                ${config.showOriginal && data.original ? `<p class="original">Original: <span>${escapeHtml(data.original)}</span></p>` : ''}
                            </div>
                        </div>
                        ${config.showOcrInfo ? `
                            <div class="ocr-info">
                                <span class="ocr-confidence" id="uteOcrConfidence">${data.confidence ? 'AI Accuracy: ' + data.confidence.toFixed(1) + '%' : ''}</span>
                            </div>
                        ` : ''}
                        <button class="unified-editor-close" id="uteCloseBtn" title="Close (Esc)">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="unified-editor-body">
                        <!-- Text Area -->
                        <div class="unified-editor-field">
                            <div class="unified-editor-field-header">
                                <label>Text</label>
                                <button type="button" class="insert-link-btn" id="uteInsertLinkBtn" title="Insert Link (Ctrl+K)">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                                    </svg>
                                    <span>Insert Link</span>
                                </button>
                            </div>
                            <textarea id="uteTextArea" placeholder="Enter your text here...">${escapeHtml(text)}</textarea>
                            ${config.showOcrInfo ? `<div class="word-count" id="uteWordCount">${data.wordCount || 0} words</div>` : ''}
                        </div>

                        <!-- Font Size -->
                        <div class="unified-editor-field">
                            <label>Font Size: <span class="value-display" id="uteFontSizeValue">${fontSize}px</span></label>
                            <div class="font-size-control">
                                <input type="range" id="uteFontSize" value="${fontSize}" min="8" max="72">
                                <div class="font-size-presets">${fontSizeButtons}</div>
                            </div>
                        </div>

                        <!-- Style Controls Row -->
                        <div class="unified-editor-row">
                            <div class="unified-editor-field">
                                <label>Text Color</label>
                                <input type="color" id="uteTextColor" value="${textColor}">
                            </div>
                            <div class="unified-editor-field">
                                <label>Background</label>
                                <div class="bg-color-control">
                                    <input type="color" id="uteBgColor" value="${bgColor}" ${isTransparent ? 'disabled' : ''}>
                                    ${config.showTransparent ? `
                                        <label class="transparent-toggle">
                                            <input type="checkbox" id="uteTransparent" ${isTransparent ? 'checked' : ''}>
                                            <span>Transparent</span>
                                        </label>
                                    ` : ''}
                                </div>
                            </div>
                            <div class="unified-editor-field">
                                <label>Font</label>
                                <select id="uteFontFamily">${fontOptions}</select>
                            </div>
                        </div>

                        <!-- Font Style Controls -->
                        <div class="unified-editor-row">
                            <div class="unified-editor-field font-style-field">
                                <label>Font Style</label>
                                <div class="font-style-buttons">
                                    <button type="button" class="font-style-btn ${isBold ? 'active' : ''}" id="uteBoldBtn" title="Bold (Ctrl+B)">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                            <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
                                            <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
                                        </svg>
                                        <span>Bold</span>
                                    </button>
                                    <button type="button" class="font-style-btn ${isItalic ? 'active' : ''}" id="uteItalicBtn" title="Italic (Ctrl+I)">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <line x1="19" y1="4" x2="10" y2="4"/>
                                            <line x1="14" y1="20" x2="5" y2="20"/>
                                            <line x1="15" y1="4" x2="9" y2="20"/>
                                        </svg>
                                        <span>Italic</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="unified-editor-footer">
                        ${config.showCopyBtn ? `
                            <button class="unified-editor-btn secondary" id="uteCopyBtn">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                                </svg>
                                Copy Text
                            </button>
                        ` : '<div></div>'}
                        <div class="unified-editor-actions">
                            <button class="unified-editor-btn secondary" id="uteCancelBtn">Cancel</button>
                            <button class="unified-editor-btn primary" id="utePrimaryBtn">${config.primaryBtn}</button>
                        </div>
                    </div>

                    <!-- Link Insertion Dialog -->
                    <div class="link-insert-dialog" id="uteLinkDialog" style="display: none;">
                        <div class="link-dialog-content">
                            <div class="link-dialog-header">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                                </svg>
                                <span>Insert Link</span>
                                <button type="button" class="link-dialog-close" id="uteLinkDialogClose">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M18 6L6 18M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>
                            <div class="link-dialog-body">
                                <div class="link-dialog-field">
                                    <label for="uteLinkText">Link Text</label>
                                    <input type="text" id="uteLinkText" placeholder="Display text for the link">
                                </div>
                                <div class="link-dialog-field">
                                    <label for="uteLinkUrl">URL</label>
                                    <input type="url" id="uteLinkUrl" placeholder="https://example.com">
                                </div>
                            </div>
                            <div class="link-dialog-footer">
                                <button type="button" class="unified-editor-btn secondary" id="uteLinkCancelBtn">Cancel</button>
                                <button type="button" class="unified-editor-btn primary" id="uteLinkInsertBtn">Insert Link</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Show the modal
     * @param {string} mode - Mode: add, edit, editOverlay, ocr
     * @param {Object} data - Initial data
     */
    function show(mode, data = {}) {
        // Close any existing modal
        close();

        currentMode = mode;
        currentData = data;

        const config = getModeConfig(mode);

        // Create modal element
        modal = document.createElement('div');
        modal.id = 'unifiedTextEditorModal';
        modal.innerHTML = createModalHTML(config, data, mode);
        document.body.appendChild(modal);

        // Setup event listeners
        setupEventListeners(config);

        // Focus textarea and apply initial styles
        setTimeout(() => {
            const textarea = document.getElementById('uteTextArea');
            if (textarea) {
                textarea.focus();
                // Place cursor at end
                textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                // Apply bold/italic styles to textarea
                updateTextareaStyle();
            }
        }, 100);
    }

    /**
     * Setup modal event listeners
     * @param {Object} config - Mode configuration
     */
    function setupEventListeners(config) {
        // Close button
        document.getElementById('uteCloseBtn')?.addEventListener('click', close);
        document.getElementById('uteCancelBtn')?.addEventListener('click', close);

        // Backdrop click
        modal.querySelector('.unified-editor-modal-backdrop')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('unified-editor-modal-backdrop')) {
                close();
            }
        });

        // Primary action
        document.getElementById('utePrimaryBtn')?.addEventListener('click', () => {
            config.primaryAction();
        });

        // Copy button
        document.getElementById('uteCopyBtn')?.addEventListener('click', copyText);

        // Font size slider
        const fontSizeSlider = document.getElementById('uteFontSize');
        const fontSizeValue = document.getElementById('uteFontSizeValue');
        fontSizeSlider?.addEventListener('input', () => {
            fontSizeValue.textContent = fontSizeSlider.value + 'px';
        });

        // Font size presets
        modal.querySelectorAll('.font-size-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const size = btn.dataset.size;
                fontSizeSlider.value = size;
                fontSizeValue.textContent = size + 'px';
            });
        });

        // Transparent toggle
        const transparentCheck = document.getElementById('uteTransparent');
        const bgColorInput = document.getElementById('uteBgColor');
        transparentCheck?.addEventListener('change', () => {
            bgColorInput.disabled = transparentCheck.checked;
            bgColorInput.style.opacity = transparentCheck.checked ? '0.5' : '1';
        });

        // Escape key
        escHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close();
            }
        };
        document.addEventListener('keydown', escHandler);

        // Bold button toggle
        document.getElementById('uteBoldBtn')?.addEventListener('click', () => {
            const btn = document.getElementById('uteBoldBtn');
            btn.classList.toggle('active');
            updateTextareaStyle();
        });

        // Italic button toggle
        document.getElementById('uteItalicBtn')?.addEventListener('click', () => {
            const btn = document.getElementById('uteItalicBtn');
            btn.classList.toggle('active');
            updateTextareaStyle();
        });

        // Ctrl+Enter to save
        document.getElementById('uteTextArea')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                config.primaryAction();
            }
            // Ctrl+K to open link dialog
            if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                openLinkDialog();
            }
            // Ctrl+B for bold
            if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                const btn = document.getElementById('uteBoldBtn');
                if (btn) {
                    btn.classList.toggle('active');
                    updateTextareaStyle();
                }
            }
            // Ctrl+I for italic
            if (e.key === 'i' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                const btn = document.getElementById('uteItalicBtn');
                if (btn) {
                    btn.classList.toggle('active');
                    updateTextareaStyle();
                }
            }
        });

        // Insert Link button
        document.getElementById('uteInsertLinkBtn')?.addEventListener('click', openLinkDialog);

        // Link dialog close buttons
        document.getElementById('uteLinkDialogClose')?.addEventListener('click', closeLinkDialog);
        document.getElementById('uteLinkCancelBtn')?.addEventListener('click', closeLinkDialog);

        // Link dialog insert button
        document.getElementById('uteLinkInsertBtn')?.addEventListener('click', insertLink);

        // Link URL input - Enter to insert
        document.getElementById('uteLinkUrl')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                insertLink();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                closeLinkDialog();
            }
        });

        // Link Text input - Enter to move to URL field
        document.getElementById('uteLinkText')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('uteLinkUrl')?.focus();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                closeLinkDialog();
            }
        });
    }

    /**
     * Update textarea style based on bold/italic toggles
     */
    function updateTextareaStyle() {
        const textarea = document.getElementById('uteTextArea');
        const boldBtn = document.getElementById('uteBoldBtn');
        const italicBtn = document.getElementById('uteItalicBtn');

        if (!textarea) return;

        textarea.style.fontWeight = boldBtn?.classList.contains('active') ? 'bold' : 'normal';
        textarea.style.fontStyle = italicBtn?.classList.contains('active') ? 'italic' : 'normal';
    }

    /**
     * Open the link insertion dialog
     */
    function openLinkDialog() {
        const textarea = document.getElementById('uteTextArea');
        const dialog = document.getElementById('uteLinkDialog');
        const linkTextInput = document.getElementById('uteLinkText');
        const linkUrlInput = document.getElementById('uteLinkUrl');

        if (!textarea || !dialog) return;

        // Get selected text from textarea
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);

        // Pre-fill link text with selected text
        linkTextInput.value = selectedText;
        linkUrlInput.value = '';

        // Show dialog
        dialog.style.display = 'flex';

        // Focus appropriate field
        if (selectedText) {
            linkUrlInput.focus();
        } else {
            linkTextInput.focus();
        }
    }

    /**
     * Close the link insertion dialog
     */
    function closeLinkDialog() {
        const dialog = document.getElementById('uteLinkDialog');
        const editor = document.getElementById('uteTextArea');

        if (dialog) {
            dialog.style.display = 'none';
        }

        // Restore focus to editor
        if (editor) {
            editor.focus();
        }
    }

    /**
     * Insert link into the textarea in format: text (url)
     */
    function insertLink() {
        const textarea = document.getElementById('uteTextArea');
        const linkTextInput = document.getElementById('uteLinkText');
        const linkUrlInput = document.getElementById('uteLinkUrl');

        if (!textarea || !linkUrlInput) return;

        const linkText = linkTextInput.value.trim();
        let linkUrl = linkUrlInput.value.trim();

        if (!linkUrl) {
            ui.showNotification('Please enter a URL', 'warning');
            linkUrlInput.focus();
            return;
        }

        // Add protocol if missing
        if (linkUrl && !linkUrl.match(/^[a-zA-Z]+:\/\//)) {
            linkUrl = 'https://' + linkUrl;
        }

        // Create link text in format: "text (url)" or just "url" if no text
        const linkString = linkText ? `${linkText} (${linkUrl})` : linkUrl;

        // Insert at cursor position or replace selection
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;

        textarea.value = text.substring(0, start) + linkString + text.substring(end);

        // Move cursor after inserted text
        const newPos = start + linkString.length;
        textarea.selectionStart = newPos;
        textarea.selectionEnd = newPos;
        textarea.focus();

        // Close dialog
        closeLinkDialog();

        ui.showNotification('Link inserted', 'success');
    }

    /**
     * Get current form values
     * @returns {Object} Form values
     */
    function getFormValues() {
        const transparentCheck = document.getElementById('uteTransparent');
        const bgColorHex = document.getElementById('uteBgColor')?.value || '#ffffff';
        const isTransparent = transparentCheck?.checked || false;
        const boldBtn = document.getElementById('uteBoldBtn');
        const italicBtn = document.getElementById('uteItalicBtn');

        let bgColor;
        if (isTransparent) {
            bgColor = 'rgba(0, 0, 0, 0)';
        } else {
            bgColor = hexToRgba(bgColorHex, 0.9);
        }

        const textarea = document.getElementById('uteTextArea');
        const text = textarea?.value || '';

        return {
            text: text,  // Plain text with links in format: text (url)
            fontSize: parseInt(document.getElementById('uteFontSize')?.value) || 14,
            textColor: document.getElementById('uteTextColor')?.value || '#000000',
            bgColor: bgColor,
            bgColorHex: bgColorHex,
            isTransparent: isTransparent,
            fontFamily: document.getElementById('uteFontFamily')?.value || 'Arial, sans-serif',
            isBold: boldBtn?.classList.contains('active') || false,
            isItalic: italicBtn?.classList.contains('active') || false
        };
    }

    /**
     * Get display text length (with links collapsed to just link text)
     * @param {string} text - Text with links in format: text (url)
     * @returns {number} Length of display text
     */
    function getDisplayTextLength(text) {
        if (!text) return 0;
        // Replace "text (url)" with just "text", or "(url)" with "url"
        const displayText = text.replace(/(?:([^(]+?)\s*)?\((https?:\/\/[^)]+)\)/g, (match, linkText, url) => {
            return linkText ? linkText.trim() : url;
        });
        return displayText.length;
    }

    /**
     * Save handler for Add mode
     */
    function saveAdd() {
        const values = getFormValues();

        if (!values.text.trim()) {
            ui.showNotification('Please enter some text.', 'warning');
            return;
        }

        // Calculate width based on display text (links collapsed)
        const displayLength = getDisplayTextLength(values.text);

        // Get current scale to normalize coordinates
        const scale = core.get('scale') || 1.0;

        // Store all coordinates normalized (at scale 1.0)
        const overlay = {
            id: generateId('overlay'),
            text: values.text.trim(),  // Plain text with links in format: text (url)
            x: (currentData.x || 100) / scale,
            y: (currentData.y || 100) / scale,
            width: Math.max(100, displayLength * values.fontSize * 0.6),
            height: values.fontSize + 10,
            fontSize: values.fontSize,
            color: values.textColor,
            bgColor: values.bgColor,
            textOpacity: 1,
            fontFamily: values.fontFamily,
            isBold: values.isBold,
            isItalic: values.isItalic,
            alignment: 'left',
            page: currentData.page || core.get('currentPage')
        };

        core.push('textOverlays', overlay);

        // Add to history for undo support
        core.addToHistory({
            type: 'textOverlay',
            data: overlay
        });

        core.emit('overlay:created', overlay);
        core.emit('overlay:select', overlay.id);

        close();
        ui.showNotification('Text added! Click to edit or drag to move.', 'success');
    }

    /**
     * Save handler for Edit mode (existing text)
     */
    function saveEdit() {
        const values = getFormValues();

        if (!values.text.trim()) {
            ui.showNotification('Text cannot be empty.', 'warning');
            return;
        }

        const textEdits = core.get('textEdits');
        const editIndex = currentData.editIndex;
        const textSpan = currentData.span;

        const editData = {
            page: currentData.page,
            index: currentData.index,
            originalText: currentData.original,
            newText: values.text,
            x: parseFloat(textSpan?.style.left) || 0,
            y: parseFloat(textSpan?.style.top) || 0,
            originalX: editIndex >= 0 ? textEdits[editIndex]?.originalX : parseFloat(textSpan?.style.left) || 0,
            originalY: editIndex >= 0 ? textEdits[editIndex]?.originalY : parseFloat(textSpan?.style.top) || 0,
            fontSize: parseFloat(textSpan?.style.fontSize) || 14,
            fontName: currentData.fontName,
            width: currentData.originalWidth || textSpan?.offsetWidth || 100,
            customFontSize: values.fontSize,
            customColor: values.textColor,
            customBgColor: values.bgColor,
            customFontFamily: values.fontFamily,
            isTransparent: values.isTransparent,
            isBold: values.isBold,
            isItalic: values.isItalic
        };

        if (editIndex >= 0) {
            core.updateAt('textEdits', editIndex, editData);
        } else {
            core.push('textEdits', editData);
        }

        // Update visual display
        if (textSpan) {
            textSpan.textContent = values.text;
            textSpan.classList.add('edited');
            textSpan.style.fontSize = values.fontSize + 'px';
            textSpan.style.color = values.textColor;
            textSpan.style.fontFamily = values.fontFamily;
            textSpan.style.background = values.isTransparent ? 'transparent' : values.bgColor;
            textSpan.style.fontWeight = values.isBold ? 'bold' : 'normal';
            textSpan.style.fontStyle = values.isItalic ? 'italic' : 'normal';

            // Add controls if not already present and select
            if (typeof PDFoxTextEditor !== 'undefined') {
                if (PDFoxTextEditor.addEditControls) {
                    PDFoxTextEditor.addEditControls(textSpan);
                }
                if (PDFoxTextEditor.selectEditSpan) {
                    PDFoxTextEditor.selectEditSpan(textSpan);
                }
            }
        }

        core.emit('textEdit:saved', editData);
        close();
        ui.showNotification('Text updated!', 'success');
    }

    /**
     * Save handler for EditOverlay mode
     */
    function saveEditOverlay() {
        const values = getFormValues();

        if (!values.text.trim()) {
            ui.showNotification('Text cannot be empty.', 'warning');
            return;
        }

        const textOverlays = core.get('textOverlays');
        const index = textOverlays.findIndex(o => o.id === currentData.overlayId);

        if (index === -1) {
            close();
            return;
        }

        const overlay = textOverlays[index];
        const updated = {
            ...overlay,
            text: values.text,  // Plain text with links in format: text (url)
            fontSize: values.fontSize,
            color: values.textColor,
            bgColor: values.bgColor,
            fontFamily: values.fontFamily,
            isBold: values.isBold,
            isItalic: values.isItalic
        };

        core.updateAt('textOverlays', index, updated);
        core.emit('overlay:updated', updated);

        close();
        ui.showNotification('Text overlay updated!', 'success');
    }

    /**
     * Save handler for OCR mode
     */
    function saveOcr() {
        const values = getFormValues();

        if (!values.text.trim()) {
            ui.showNotification('No text to insert.', 'warning');
            return;
        }

        // Get current scale to normalize coordinates
        const scale = core.get('scale') || 1.0;

        // Store all coordinates normalized (at scale 1.0)
        const overlay = {
            id: 'ocr-' + Date.now(),
            text: values.text,  // Plain text with links in format: text (url)
            x: (currentData.rect?.x || 100) / scale,
            y: (currentData.rect?.y || 100) / scale,
            width: (currentData.rect?.width || 200) / scale,
            height: (currentData.rect?.height || 50) / scale,
            page: currentData.page || core.get('currentPage'),
            fontSize: values.fontSize,
            fontFamily: values.fontFamily,
            color: values.textColor,
            bgColor: values.bgColor,
            isBold: values.isBold,
            isItalic: values.isItalic,
            isOCR: true
        };

        core.push('textOverlays', overlay);

        // Add to history for undo support
        core.addToHistory({
            type: 'textOverlay',
            data: overlay
        });

        close();
        ui.showNotification('Text inserted as overlay', 'success');
        core.emit('overlays:changed');
    }

    /**
     * Copy text to clipboard
     */
    function copyText() {
        const textarea = document.getElementById('uteTextArea');
        if (textarea && textarea.value) {
            navigator.clipboard.writeText(textarea.value).then(() => {
                ui.showNotification('Text copied to clipboard', 'success');
            }).catch(err => {
                console.error('Copy failed:', err);
                textarea.select();
                document.execCommand('copy');
                ui.showNotification('Text copied to clipboard', 'success');
            });
        }
    }

    /**
     * Close modal
     */
    function close() {
        if (escHandler) {
            document.removeEventListener('keydown', escHandler);
            escHandler = null;
        }

        if (modal) {
            modal.remove();
            modal = null;
        }

        currentMode = null;
        currentData = null;

        // Re-activate OCR selection mode if on image-based PDF
        if (core.get('isImageBasedPDF')) {
            if (typeof PDFoxOCR !== 'undefined' && PDFoxOCR.activateOCRSelectionMode) {
                PDFoxOCR.activateOCRSelectionMode();
            }
        } else if (core.get('currentTool') === 'ocrSelect') {
            const annCanvas = document.getElementById('annotationCanvas');
            if (annCanvas) {
                annCanvas.style.cursor = 'crosshair';
                annCanvas.style.pointerEvents = 'auto';
            }
        }
    }

    /**
     * Check if modal is open
     * @returns {boolean}
     */
    function isOpen() {
        return modal !== null;
    }

    // Public API
    return {
        show,
        close,
        isOpen,
        copyText,

        // Convenience methods
        showAddText(x, y, page) {
            show('add', { x, y, page });
        },

        showEditText(data) {
            show('edit', data);
        },

        showEditOverlay(overlayId) {
            const textOverlays = core.get('textOverlays');
            const overlay = textOverlays.find(o => o.id === overlayId);
            if (overlay) {
                show('editOverlay', {
                    overlayId: overlay.id,
                    text: overlay.text,
                    fontSize: overlay.fontSize,
                    color: overlay.color,
                    textColor: overlay.color,
                    bgColor: overlay.bgColor,
                    fontFamily: overlay.fontFamily,
                    isBold: overlay.isBold || false,
                    isItalic: overlay.isItalic || false
                });
            }
        },

        showOcrResult(extraction) {
            show('ocr', {
                text: extraction.text,
                wordCount: extraction.words?.length || 0,
                confidence: extraction.confidence,
                rect: extraction.rect,
                page: extraction.page,
                fontSize: 14,
                textColor: '#000000',
                bgColor: 'rgba(255, 255, 255, 0.9)'
            });
        }
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxUnifiedTextEditor;
}
