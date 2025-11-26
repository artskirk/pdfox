/**
 * PDFOX Text Editor Module
 * Handles text editing, overlays, and related modals
 * Single Responsibility: Text manipulation operations
 */

const PDFoxTextEditor = (function() {
    'use strict';

    const core = PDFoxCore;
    const ui = PDFoxUI;
    const { $, generateId, hexToRgba } = PDFoxUtils;

    // Current editing state
    let currentEditingTextItem = null;
    let addTextPosition = { x: 0, y: 0 };

    /**
     * Create font size control HTML
     * @param {string} prefix - ID prefix
     * @param {number} value - Initial value
     * @returns {string} HTML string
     */
    function createFontSizeControl(prefix, value = 14) {
        const sizes = [10, 12, 14, 18, 24, 36];
        const buttons = sizes.map(size => `
            <button type="button" onclick="PDFoxUI.setFontSize('${prefix}FontSize', '${prefix}FontSizeValue', ${size})"
                style="flex: 1; padding: 6px 0; background: #2a2a2a; border: 1px solid #444; border-radius: 6px; color: #aaa; font-size: 12px; cursor: pointer; transition: all 0.2s;"
                onmouseover="this.style.background='#3a3a3a'; this.style.borderColor='#E50914'"
                onmouseout="this.style.background='#2a2a2a'; this.style.borderColor='#444'">${size}</button>
        `).join('');

        return `
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #aaaaaa; font-size: 14px;">
                    Font Size: <span id="${prefix}FontSizeValue" style="color: #E50914; font-weight: 600;">${value}px</span>
                </label>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <input type="range" id="${prefix}FontSize" value="${value}" min="8" max="72"
                        style="flex: 1; height: 6px; accent-color: #E50914; cursor: pointer;"
                        oninput="document.getElementById('${prefix}FontSizeValue').textContent = this.value + 'px'">
                </div>
                <div style="display: flex; gap: 8px; margin-top: 10px;">${buttons}</div>
            </div>
        `;
    }

    /**
     * Create color/font controls HTML
     * @param {string} prefix - ID prefix
     * @param {Object} values - Initial values
     * @returns {string} HTML string
     */
    function createStyleControls(prefix, values = {}) {
        const textColor = values.textColor || '#000000';
        const bgColor = values.bgColor || '#ffffff';
        const fontFamily = values.fontFamily || 'Arial, sans-serif';

        const fonts = [
            { value: 'Arial, sans-serif', label: 'Arial' },
            { value: "'Times New Roman', serif", label: 'Times New Roman' },
            { value: "'Courier New', monospace", label: 'Courier New' },
            { value: 'Georgia, serif', label: 'Georgia' },
            { value: 'Verdana, sans-serif', label: 'Verdana' }
        ];

        const fontOptions = fonts.map(f =>
            `<option value="${f.value}" ${fontFamily === f.value ? 'selected' : ''}>${f.label}</option>`
        ).join('');

        return `
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #aaaaaa; font-size: 14px;">Text Color:</label>
                    <input type="color" id="${prefix}TextColor" value="${textColor}"
                        style="width: 100%; height: 42px; border: 2px solid #333; border-radius: 8px; background: #2a2a2a; cursor: pointer; box-sizing: border-box;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #aaaaaa; font-size: 14px;">Background:</label>
                    <input type="color" id="${prefix}BgColor" value="${bgColor}"
                        style="width: 100%; height: 42px; border: 2px solid #333; border-radius: 8px; background: #2a2a2a; cursor: pointer; box-sizing: border-box;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #aaaaaa; font-size: 14px;">Font:</label>
                    <select id="${prefix}FontFamily"
                        style="width: 100%; padding: 10px 8px; border: 2px solid #333; border-radius: 8px; background: #2a2a2a; color: #ffffff; font-size: 13px; cursor: pointer; box-sizing: border-box;">
                        ${fontOptions}
                    </select>
                </div>
            </div>
        `;
    }

    /**
     * Handle click on text span for editing
     * @param {HTMLElement} span - The clicked span element
     */
    function handleTextSpanClick(span) {
        const currentTool = core.get('currentTool');
        if (currentTool !== 'editText') return;

        const editModal = document.getElementById('editModal');
        if (!editModal) return;

        // Simple guard - just check if already visible
        if (editModal.style.display === 'flex') return;

        const index = parseInt(span.dataset.index);
        const page = parseInt(span.dataset.page);
        const originalText = span.textContent;
        const fontSize = parseFloat(span.style.fontSize) || 14;

        // Check if there's already an edit for this span
        const textEdits = core.get('textEdits');
        const existingEditIndex = textEdits.findIndex(e => e.page === page && e.index === index);
        const existingEdit = existingEditIndex >= 0 ? textEdits[existingEditIndex] : null;

        currentEditingTextItem = {
            span: span,
            original: existingEdit ? existingEdit.originalText : originalText,
            page: page,
            index: index,
            editIndex: existingEditIndex >= 0 ? existingEditIndex : undefined,
            item: { str: existingEdit ? existingEdit.originalText : originalText },
            originalWidth: span.offsetWidth
        };

        // Populate the edit modal
        const origTextEl = document.getElementById('originalText');
        const editTextArea = document.getElementById('editTextArea');
        const editFontSize = document.getElementById('editTextFontSize');
        const editFontSizeValue = document.getElementById('editTextFontSizeValue');
        const editTextColor = document.getElementById('editTextColor');
        const editTextBgColor = document.getElementById('editTextBgColor');
        const editTextFontFamily = document.getElementById('editTextFontFamily');

        if (origTextEl) origTextEl.textContent = currentEditingTextItem.original;
        if (editTextArea) editTextArea.value = originalText;

        const currentFontSize = existingEdit?.customFontSize || Math.round(fontSize);
        if (editFontSize) editFontSize.value = currentFontSize;
        if (editFontSizeValue) editFontSizeValue.textContent = currentFontSize + 'px';
        if (editTextColor) editTextColor.value = existingEdit?.customColor || '#000000';
        if (editTextBgColor) editTextBgColor.value = existingEdit?.customBgColor || '#ffffff';
        if (editTextFontFamily) editTextFontFamily.value = existingEdit?.customFontFamily || 'Arial, sans-serif';

        editModal.style.display = 'flex';
    }

    /**
     * Setup text layer event delegation
     */
    function setupTextLayerEvents() {
        const textLayer = document.getElementById('textLayer');
        if (!textLayer) return;

        textLayer.addEventListener('click', (e) => {
            const span = e.target.closest('span');
            if (span && span.dataset.index !== undefined) {
                handleTextSpanClick(span);
            }
        });
    }

    return {
        /**
         * Initialize text editor
         */
        init() {
            // Setup text layer click events
            setupTextLayerEvents();

            // Subscribe to layer edit events
            core.on('layer:edit', (layer) => {
                if (layer.type === 'text-edit') {
                    this.openEditModal(layer);
                } else if (layer.type === 'text-overlay') {
                    this.openOverlayEditModal(layer.id);
                }
            });

            // Subscribe to layer delete events
            core.on('layer:delete', (layer) => {
                if (layer.type === 'text-edit') {
                    this.removeEdit(layer.editIndex);
                } else if (layer.type === 'text-overlay') {
                    this.deleteOverlay(layer.id);
                }
            });
        },

        /**
         * Open Add Text modal
         * @param {number} x - X position
         * @param {number} y - Y position
         */
        openAddTextModal(x, y) {
            const modal = document.getElementById('addTextModal');
            if (!modal) return;

            if (modal.style.display === 'flex') return;

            addTextPosition = { x, y };

            // Reset form
            const defaultFontSize = document.getElementById('fontSize')?.value || 14;
            const defaultColor = document.getElementById('textColor')?.value || '#000000';

            $('#addTextArea').value = '';
            $('#addTextFontSize').value = defaultFontSize;
            $('#addTextFontSizeValue').textContent = defaultFontSize + 'px';
            $('#addTextColor').value = defaultColor;
            $('#addTextBgColor').value = '#ffffff';
            $('#addTextFontFamily').value = 'Arial, sans-serif';

            modal.style.display = 'flex';
            $('#addTextArea').focus();
        },

        /**
         * Close Add Text modal
         */
        closeAddTextModal() {
            const modal = document.getElementById('addTextModal');
            if (modal) modal.style.display = 'none';
            addTextPosition = { x: 0, y: 0 };
        },

        /**
         * Save new text overlay from Add Text modal
         */
        saveAddText() {
            const text = $('#addTextArea').value;
            const fontSize = parseInt($('#addTextFontSize').value) || 14;
            const textColor = $('#addTextColor').value || '#000000';
            const bgColor = $('#addTextBgColor').value || '#ffffff';
            const fontFamily = $('#addTextFontFamily').value || 'Arial, sans-serif';

            if (!text || !text.trim()) {
                ui.showAlert('Please enter some text.', 'warning');
                return;
            }

            const overlay = {
                id: generateId('overlay'),
                text: text.trim(),
                x: addTextPosition.x,
                y: addTextPosition.y,
                width: Math.max(100, text.length * fontSize * 0.6),
                height: fontSize + 10,
                fontSize: fontSize,
                color: textColor,
                bgColor: hexToRgba(bgColor, 0.9),
                textOpacity: 1,
                fontFamily: fontFamily,
                alignment: 'left',
                page: core.get('currentPage')
            };

            core.push('textOverlays', overlay);
            core.emit('overlay:created', overlay);
            core.emit('overlay:select', overlay.id);

            this.closeAddTextModal();
            ui.showNotification('Text added! Click to edit or drag to move.', 'success');
        },

        /**
         * Open Edit Text modal for existing text
         * @param {Object} layer - Layer data
         */
        openEditModal(layer) {
            const editModal = document.getElementById('editModal');
            if (!editModal) return;

            // Simple guard - just check if already visible
            if (editModal.style.display === 'flex') return;

            const textEdits = core.get('textEdits');
            const edit = textEdits[layer.editIndex];
            if (!edit) return;

            const textSpan = document.querySelector(
                `#textLayer span[data-index="${layer.dataIndex}"][data-page="${layer.page}"]`
            );

            currentEditingTextItem = {
                span: textSpan,
                original: edit.originalText,
                page: edit.page,
                index: edit.index,
                editIndex: layer.editIndex,
                item: { str: edit.originalText, fontName: edit.fontName }
            };

            // Populate form
            $('#originalText').textContent = edit.originalText;
            $('#editTextArea').value = edit.newText;

            const fontSize = edit.customFontSize || Math.round(parseFloat(textSpan?.style.fontSize)) || 14;
            $('#editTextFontSize').value = fontSize;
            $('#editTextFontSizeValue').textContent = fontSize + 'px';
            $('#editTextColor').value = edit.customColor || '#000000';
            $('#editTextBgColor').value = edit.customBgColor || '#ffffff';
            $('#editTextFontFamily').value = edit.customFontFamily || 'Arial, sans-serif';

            editModal.style.display = 'flex';
        },

        /**
         * Close Edit Text modal
         */
        closeEditModal() {
            document.getElementById('editModal').style.display = 'none';
            currentEditingTextItem = null;
        },

        /**
         * Save text edit
         */
        saveTextEdit() {
            const newText = $('#editTextArea').value;
            const customFontSize = parseInt($('#editTextFontSize').value) || 14;
            const customColor = $('#editTextColor').value || '#000000';
            const customBgColor = $('#editTextBgColor').value || '#ffffff';
            const customFontFamily = $('#editTextFontFamily').value || 'Arial, sans-serif';

            if (!currentEditingTextItem) {
                this.closeEditModal();
                return;
            }

            if (newText.trim() === '') {
                ui.showAlert('Text cannot be empty.', 'warning');
                return;
            }

            const textSpan = currentEditingTextItem.span;
            const index = currentEditingTextItem.index;
            const textEdits = core.get('textEdits');

            const existingEditIndex = currentEditingTextItem.editIndex !== undefined
                ? currentEditingTextItem.editIndex
                : textEdits.findIndex(e => e.page === currentEditingTextItem.page && e.index === index);

            const originalWidth = existingEditIndex >= 0
                ? textEdits[existingEditIndex].width
                : (textSpan?.offsetWidth || 100);

            const currentX = parseFloat(textSpan?.style.left) || 0;
            const currentY = parseFloat(textSpan?.style.top) || 0;

            const editData = {
                page: currentEditingTextItem.page,
                index: index,
                originalText: currentEditingTextItem.original,
                newText: newText,
                x: currentX,
                y: currentY,
                originalX: existingEditIndex >= 0 ? textEdits[existingEditIndex].originalX : currentX,
                originalY: existingEditIndex >= 0 ? textEdits[existingEditIndex].originalY : currentY,
                fontSize: parseFloat(textSpan?.style.fontSize) || 14,
                fontName: currentEditingTextItem.item?.fontName,
                width: originalWidth,
                customFontSize,
                customColor,
                customBgColor,
                customFontFamily
            };

            if (existingEditIndex >= 0) {
                core.updateAt('textEdits', existingEditIndex, editData);
            } else {
                core.push('textEdits', editData);
            }

            // Update visual display
            if (textSpan) {
                textSpan.textContent = newText;
                textSpan.classList.add('edited');
                textSpan.style.fontSize = customFontSize + 'px';
                textSpan.style.color = customColor;
                textSpan.style.fontFamily = customFontFamily;
                textSpan.style.background = customBgColor;
            }

            core.emit('textEdit:saved', editData);
            this.closeEditModal();
            ui.showNotification('Text updated!', 'success');
        },

        /**
         * Remove text edit
         * @param {number} editIndex - Index to remove
         */
        removeEdit(editIndex) {
            const textEdits = core.get('textEdits');
            const edit = textEdits[editIndex];

            if (edit) {
                // Restore original text in span
                const textSpan = document.querySelector(
                    `#textLayer span[data-index="${edit.index}"][data-page="${edit.page}"]`
                );
                if (textSpan) {
                    textSpan.textContent = edit.originalText;
                    textSpan.classList.remove('edited');
                    textSpan.style.background = '';
                    textSpan.style.color = '';
                }

                core.removeAt('textEdits', editIndex);
                ui.showNotification('Text edit removed', 'success');
            }
        },

        /**
         * Open overlay edit modal
         * @param {string} overlayId - Overlay ID
         */
        openOverlayEditModal(overlayId) {
            const textOverlays = core.get('textOverlays');
            const overlay = textOverlays.find(o => o.id === overlayId);
            if (!overlay) return;

            const modal = document.createElement('div');
            modal.className = 'overlay-edit-modal';
            modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 10000; animation: fadeIn 0.2s ease-out;';

            modal.innerHTML = `
                <div style="background: #1a1a1a; padding: 32px; border-radius: 16px; max-width: 520px; width: 90%; border: 1px solid #333; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8); animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);">
                    <h3 style="margin: 0 0 24px 0; color: #ffffff; font-size: 22px; display: flex; align-items: center; gap: 10px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E50914" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        Edit Text
                    </h3>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #aaaaaa; font-size: 14px;">Text:</label>
                        <textarea id="editOverlayText" style="width: 100%; height: 100px; padding: 12px; border: 2px solid #333; border-radius: 8px; font-family: inherit; resize: vertical; background: #2a2a2a; color: #ffffff; font-size: 14px; box-sizing: border-box;"
                            onfocus="this.style.borderColor='#E50914'" onblur="this.style.borderColor='#333'">${overlay.text}</textarea>
                    </div>

                    ${createFontSizeControl('editOverlay', overlay.fontSize)}
                    ${createStyleControls('editOverlay', {
                        textColor: overlay.color,
                        bgColor: PDFoxUtils.rgbaToHex(overlay.bgColor),
                        fontFamily: overlay.fontFamily
                    })}

                    <div style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button onclick="this.closest('.overlay-edit-modal').remove()"
                            style="padding: 12px 24px; background: #2a2a2a; color: #ffffff; border: 2px solid #333; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 14px;"
                            onmouseover="this.style.background='#3a3a3a'" onmouseout="this.style.background='#2a2a2a'">Cancel</button>
                        <button onclick="PDFoxTextEditor.saveOverlayEdit('${overlayId}')"
                            style="padding: 12px 24px; background: #E50914; color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 14px; box-shadow: 0 4px 12px rgba(229, 9, 20, 0.4);"
                            onmouseover="this.style.background='#C40812'" onmouseout="this.style.background='#E50914'">Save Changes</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
        },

        /**
         * Save overlay edit
         * @param {string} overlayId - Overlay ID
         */
        saveOverlayEdit(overlayId) {
            const textOverlays = core.get('textOverlays');
            const index = textOverlays.findIndex(o => o.id === overlayId);

            if (index === -1) return;

            const overlay = textOverlays[index];
            const bgColor = $('#editOverlayBgColor').value;

            const updated = {
                ...overlay,
                text: $('#editOverlayText').value,
                fontSize: parseInt($('#editOverlayFontSize').value) || 14,
                color: $('#editOverlayTextColor').value,
                bgColor: hexToRgba(bgColor, 0.9),
                fontFamily: $('#editOverlayFontFamily').value
            };

            core.updateAt('textOverlays', index, updated);
            core.emit('overlay:updated', updated);

            document.querySelector('.overlay-edit-modal')?.remove();
            ui.showNotification('Text overlay updated!', 'success');
        },

        /**
         * Delete overlay
         * @param {string} overlayId - Overlay ID
         */
        deleteOverlay(overlayId) {
            core.remove('textOverlays', o => o.id === overlayId);
            core.emit('overlay:deleted', overlayId);
            ui.showNotification('Text overlay deleted', 'success');
        },

        /**
         * Get current editing item
         * @returns {Object|null}
         */
        getCurrentEditingItem() {
            return currentEditingTextItem;
        }
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxTextEditor;
}
