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
                subtitle: null,
                showOriginal: true,
                showOcrInfo: false,
                showCopyBtn: false,
                showTransparent: false,
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
                            <label>Text</label>
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

        // Focus textarea
        setTimeout(() => {
            const textarea = document.getElementById('uteTextArea');
            if (textarea) {
                textarea.focus();
                // Place cursor at end
                textarea.setSelectionRange(textarea.value.length, textarea.value.length);
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

        // Ctrl+Enter to save
        document.getElementById('uteTextArea')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                config.primaryAction();
            }
        });
    }

    /**
     * Get current form values
     * @returns {Object} Form values
     */
    function getFormValues() {
        const transparentCheck = document.getElementById('uteTransparent');
        const bgColorHex = document.getElementById('uteBgColor')?.value || '#ffffff';
        const isTransparent = transparentCheck?.checked || false;

        let bgColor;
        if (isTransparent) {
            bgColor = 'rgba(0, 0, 0, 0)';
        } else {
            bgColor = hexToRgba(bgColorHex, 0.9);
        }

        return {
            text: document.getElementById('uteTextArea')?.value || '',
            fontSize: parseInt(document.getElementById('uteFontSize')?.value) || 14,
            textColor: document.getElementById('uteTextColor')?.value || '#000000',
            bgColor: bgColor,
            bgColorHex: bgColorHex,
            isTransparent: isTransparent,
            fontFamily: document.getElementById('uteFontFamily')?.value || 'Arial, sans-serif'
        };
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

        const overlay = {
            id: generateId('overlay'),
            text: values.text.trim(),
            x: currentData.x || 100,
            y: currentData.y || 100,
            width: Math.max(100, values.text.length * values.fontSize * 0.6),
            height: values.fontSize + 10,
            fontSize: values.fontSize,
            color: values.textColor,
            bgColor: values.bgColor,
            textOpacity: 1,
            fontFamily: values.fontFamily,
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
            customBgColor: values.bgColorHex,
            customFontFamily: values.fontFamily
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
            textSpan.style.background = values.bgColorHex;
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
            text: values.text,
            fontSize: values.fontSize,
            color: values.textColor,
            bgColor: values.bgColor,
            fontFamily: values.fontFamily
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

        const overlay = {
            id: 'ocr-' + Date.now(),
            text: values.text,
            x: currentData.rect?.x || 100,
            y: currentData.rect?.y || 100,
            width: currentData.rect?.width || 200,
            height: currentData.rect?.height || 50,
            page: currentData.page || core.get('currentPage'),
            fontSize: values.fontSize,
            fontFamily: values.fontFamily,
            color: values.textColor,
            bgColor: values.bgColor,
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
                    fontFamily: overlay.fontFamily
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
