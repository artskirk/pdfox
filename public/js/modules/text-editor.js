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

    // Drag state for text repositioning
    let isDraggingText = false;
    let draggedTextElement = null;
    let dragOffset = { x: 0, y: 0 };
    let hasMoved = false;
    let clickTimeout = null;

    // Selection state for edited text spans
    let selectedEditSpan = null;

    // Resize state
    let isResizing = false;
    let resizeHandle = null;
    let resizeStartX = 0;
    let resizeStartY = 0;
    let resizeStartFontSize = 14;

    /**
     * Add controls (delete button, resize handles) to an edited span
     * @param {HTMLElement} span - The edited span element
     */
    function addEditControls(span) {
        // Don't add if already has controls
        if (span.querySelector('.edit-delete-btn')) return;

        // Make span position relative for absolute children
        span.style.position = 'absolute';

        // Delete button
        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'edit-delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            deleteEditedSpan(span);
        });
        deleteBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        span.appendChild(deleteBtn);

        // Resize handles
        const positions = ['se', 'sw', 'ne', 'nw'];
        positions.forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `edit-resize-handle ${pos}`;
            handle.dataset.position = pos;
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                startResize(e, span, pos);
            });
            span.appendChild(handle);
        });
    }

    /**
     * Select an edited span
     * @param {HTMLElement} span - The span to select
     */
    function selectEditSpan(span) {
        // Deselect previous
        if (selectedEditSpan && selectedEditSpan !== span) {
            selectedEditSpan.classList.remove('selected');
        }

        span.classList.add('selected');
        selectedEditSpan = span;

        // Update core selection
        const page = parseInt(span.dataset.page);
        const index = parseInt(span.dataset.index);
        core.set('selectedLayerId', `edit-${page}-${index}`);
    }

    /**
     * Deselect all edited spans
     */
    function deselectAllEditSpans() {
        if (selectedEditSpan) {
            selectedEditSpan.classList.remove('selected');
            selectedEditSpan = null;
        }
    }

    /**
     * Delete an edited span (revert to original)
     * @param {HTMLElement} span - The span to delete/revert
     */
    function deleteEditedSpan(span) {
        const page = parseInt(span.dataset.page);
        const index = parseInt(span.dataset.index);
        const textEdits = core.get('textEdits');

        const editIndex = textEdits.findIndex(e => e.page === page && e.index === index);
        if (editIndex >= 0) {
            const edit = textEdits[editIndex];

            // Restore original text and position
            span.textContent = edit.originalText;
            span.style.left = edit.originalX + 'px';
            span.style.top = edit.originalY + 'px';
            span.style.fontSize = edit.fontSize + 'px';
            span.style.color = '';
            span.style.fontFamily = '';
            span.style.background = '';
            span.classList.remove('edited', 'selected');

            // Remove controls
            span.querySelectorAll('.edit-delete-btn, .edit-resize-handle').forEach(el => el.remove());

            // Remove the white overlay
            const overlay = span.parentElement.querySelector(`.text-edit-overlay[data-edit-index="${index}"][data-edit-page="${page}"]`);
            if (overlay) overlay.remove();

            // Remove from textEdits
            core.removeAt('textEdits', editIndex);
            core.set('selectedLayerId', null);

            ui.showNotification('Text edit removed', 'success');
        }

        if (selectedEditSpan === span) {
            selectedEditSpan = null;
        }
    }

    /**
     * Start resize operation
     * @param {MouseEvent} e - The mousedown event
     * @param {HTMLElement} span - The span being resized
     * @param {string} position - The handle position (se, sw, ne, nw)
     */
    function startResize(e, span, position) {
        isResizing = true;
        resizeHandle = position;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        resizeStartFontSize = parseFloat(span.style.fontSize) || 14;

        const onMouseMove = (moveEvent) => {
            if (!isResizing) return;

            const deltaY = moveEvent.clientY - resizeStartY;

            // Resize by adjusting font size based on vertical drag
            let newFontSize = resizeStartFontSize;
            if (position === 'se' || position === 'sw') {
                newFontSize = Math.max(8, Math.min(72, resizeStartFontSize + deltaY * 0.2));
            } else {
                newFontSize = Math.max(8, Math.min(72, resizeStartFontSize - deltaY * 0.2));
            }

            span.style.fontSize = newFontSize + 'px';
        };

        const onMouseUp = () => {
            if (isResizing) {
                // Update the edit data with new font size
                const page = parseInt(span.dataset.page);
                const index = parseInt(span.dataset.index);
                const textEdits = core.get('textEdits');
                const editIndex = textEdits.findIndex(e => e.page === page && e.index === index);

                if (editIndex >= 0) {
                    textEdits[editIndex].customFontSize = parseFloat(span.style.fontSize);
                    core.set('textEdits', textEdits);
                }

                isResizing = false;
                resizeHandle = null;
            }
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

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

        // Check if unified editor is already open
        if (typeof PDFoxUnifiedTextEditor !== 'undefined' && PDFoxUnifiedTextEditor.isOpen()) {
            return;
        }

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
            editIndex: existingEditIndex >= 0 ? existingEditIndex : -1,
            fontName: existingEdit?.fontName,
            originalWidth: span.offsetWidth
        };

        // Use unified text editor
        if (typeof PDFoxUnifiedTextEditor !== 'undefined') {
            PDFoxUnifiedTextEditor.showEditText({
                span: span,
                original: currentEditingTextItem.original,
                text: originalText,
                page: page,
                index: index,
                editIndex: currentEditingTextItem.editIndex,
                fontName: currentEditingTextItem.fontName,
                originalWidth: currentEditingTextItem.originalWidth,
                fontSize: existingEdit?.customFontSize || Math.round(fontSize),
                textColor: existingEdit?.customColor || '#000000',
                bgColor: existingEdit?.customBgColor || '#ffffff',
                fontFamily: existingEdit?.customFontFamily || 'Arial, sans-serif',
                isTransparent: existingEdit?.isTransparent ?? false,
                isBold: existingEdit?.isBold ?? false,
                isItalic: existingEdit?.isItalic ?? false
            });
        }
    }

    /**
     * Enable drag for text span
     * @param {HTMLElement} textSpan - Text span element
     */
    function enableTextDrag(textSpan) {
        textSpan.addEventListener('mousedown', function(e) {
            // Ignore right-clicks - let context menu handle them
            if (e.button === 2) return;

            const currentTool = core.get('currentTool');
            // Allow dragging in both editText and moveText modes
            if (currentTool !== 'moveText' && currentTool !== 'editText') return;

            // Don't start drag on double-click
            if (e.detail > 1) return;

            hasMoved = false;
            const startX = e.clientX;
            const startY = e.clientY;

            // Small delay to distinguish click from drag
            clickTimeout = setTimeout(() => {
                isDraggingText = true;
                draggedTextElement = textSpan;

                const textLayer = document.getElementById('textLayer');
                const rect = textSpan.getBoundingClientRect();

                dragOffset.x = e.clientX - rect.left;
                dragOffset.y = e.clientY - rect.top;

                textSpan.classList.add('dragging');

                const index = parseInt(textSpan.dataset.index);
                const page = parseInt(textSpan.dataset.page);
                const textEdits = core.get('textEdits');

                // Check if this text was already edited
                const existingEditIndex = textEdits.findIndex(edit =>
                    edit.page === page && edit.index === index
                );

                // If not edited yet, create a text edit entry for repositioning
                if (existingEditIndex < 0) {
                    const currentX = parseFloat(textSpan.style.left);
                    const currentY = parseFloat(textSpan.style.top);

                    // Create white overlay to cover original text
                    const overlay = document.createElement('div');
                    overlay.className = 'text-edit-overlay';
                    overlay.style.position = 'absolute';
                    overlay.style.left = textSpan.style.left;
                    overlay.style.top = textSpan.style.top;
                    overlay.style.width = textSpan.offsetWidth + 'px';
                    overlay.style.height = textSpan.style.fontSize;
                    overlay.style.backgroundColor = 'white';
                    overlay.style.zIndex = '1';
                    overlay.dataset.editIndex = index;
                    overlay.dataset.editPage = page;

                    textSpan.parentElement.insertBefore(overlay, textSpan);

                    // Mark as edited visually
                    textSpan.classList.add('edited');
                    textSpan.style.zIndex = '2';
                    textSpan.style.display = 'inline-block';

                    // Add controls and select
                    addEditControls(textSpan);
                    selectEditSpan(textSpan);

                    // Create edit entry (text not changed, just repositioned)
                    const editData = {
                        page: page,
                        index: index,
                        originalText: textSpan.textContent,
                        newText: textSpan.textContent,
                        x: currentX,
                        y: currentY,
                        originalX: currentX,
                        originalY: currentY,
                        fontSize: parseFloat(textSpan.style.fontSize) || 14,
                        width: textSpan.offsetWidth
                    };

                    core.push('textEdits', editData);

                    // Add to history
                    core.addToHistory({
                        type: 'textEditCreate',
                        edit: editData
                    });
                }

                e.preventDefault();
            }, 150);

            // Track if mouse moves before timeout
            const checkMove = (moveEvent) => {
                const dx = Math.abs(moveEvent.clientX - startX);
                const dy = Math.abs(moveEvent.clientY - startY);
                if (dx > 5 || dy > 5) {
                    hasMoved = true;
                }
            };

            document.addEventListener('mousemove', checkMove);

            // Clean up on mouseup
            const cleanupCheck = () => {
                document.removeEventListener('mousemove', checkMove);
                document.removeEventListener('mouseup', cleanupCheck);
                if (!hasMoved && clickTimeout) {
                    clearTimeout(clickTimeout);
                }
            };
            document.addEventListener('mouseup', cleanupCheck);
        });

        // Prevent click event from firing when we dragged
        textSpan.addEventListener('click', function(e) {
            if (hasMoved) {
                e.stopPropagation();
                e.preventDefault();
            }
        }, true);
    }

    /**
     * Setup global drag event handlers
     */
    function setupDragHandlers() {
        // Handle text drag movement
        document.addEventListener('mousemove', function(e) {
            if (!isDraggingText || !draggedTextElement) return;

            e.preventDefault();
            hasMoved = true;

            const textLayer = document.getElementById('textLayer');
            if (!textLayer) return;

            const layerRect = textLayer.getBoundingClientRect();
            const newLeft = e.clientX - layerRect.left - dragOffset.x;
            const newTop = e.clientY - layerRect.top - dragOffset.y;

            // Update text position only (keep overlay at original position to cover original text)
            draggedTextElement.style.left = newLeft + 'px';
            draggedTextElement.style.top = newTop + 'px';
        });

        // Handle text drag end
        document.addEventListener('mouseup', function(e) {
            if (!isDraggingText || !draggedTextElement) return;

            draggedTextElement.classList.remove('dragging');

            // Update the textEdits array with new position
            const index = parseInt(draggedTextElement.dataset.index);
            const page = parseInt(draggedTextElement.dataset.page);
            const textEdits = core.get('textEdits');

            const editIndex = textEdits.findIndex(edit =>
                edit.page === page && edit.index === index
            );

            if (editIndex >= 0) {
                // Save previous position for undo
                const previousX = textEdits[editIndex].x;
                const previousY = textEdits[editIndex].y;

                const newX = parseFloat(draggedTextElement.style.left);
                const newY = parseFloat(draggedTextElement.style.top);

                // Only track if position actually changed
                if (previousX !== newX || previousY !== newY) {
                    textEdits[editIndex].x = newX;
                    textEdits[editIndex].y = newY;

                    // Track move in action history
                    core.addToHistory({
                        type: 'textMove',
                        editIndex: editIndex,
                        previousX: previousX,
                        previousY: previousY,
                        newX: newX,
                        newY: newY
                    });

                    console.log('Text repositioned:', {
                        text: textEdits[editIndex].newText,
                        newX: newX,
                        newY: newY
                    });

                    ui.showNotification('Text repositioned!', 'success');
                }
            }

            isDraggingText = false;
            draggedTextElement = null;
        });
    }

    /**
     * Setup text layer event delegation
     */
    function setupTextLayerEvents() {
        const textLayer = document.getElementById('textLayer');
        if (!textLayer) {
            console.error('[PDFox TextEditor] textLayer not found!');
            return;
        }

        console.log('[PDFox TextEditor] Setting up text layer events');

        // Setup global drag handlers
        setupDragHandlers();

        textLayer.addEventListener('dblclick', (e) => {
            console.log('[PDFox TextEditor] Double-click on textLayer, target:', e.target.tagName, 'editable:', textLayer.classList.contains('editable'));
            const span = e.target.closest('span');
            if (span && span.dataset.index !== undefined) {
                console.log('[PDFox TextEditor] Span double-clicked, index:', span.dataset.index, 'text:', span.textContent.substring(0, 20));
                handleTextSpanClick(span);
            }
        });

        // Subscribe to textLayer:rendered to enable drag on new spans
        core.on('textLayer:rendered', ({ pageNum }) => {
            const spans = textLayer.querySelectorAll('span[data-index]');
            spans.forEach(span => {
                enableTextDrag(span);
                // Add controls to any edited spans (e.g., from session restore)
                if (span.classList.contains('edited')) {
                    addEditControls(span);
                }
            });
        });
    }

    return {
        /**
         * Initialize text editor
         */
        init() {
            // Setup text layer click events
            setupTextLayerEvents();

            // Subscribe to layer edit events (only handle text-edit, text-overlay is handled by overlays.js)
            core.on('layer:edit', (layer) => {
                if (layer.type === 'text-edit') {
                    this.openEditModal(layer);
                }
            });

            // Subscribe to layer delete events (only handle text-edit, text-overlay is handled by overlays.js)
            core.on('layer:delete', (layer) => {
                if (layer.type === 'text-edit') {
                    this.removeEdit(layer.editIndex);
                }
            });

            // Click handler for selecting edited spans
            const textLayer = document.getElementById('textLayer');
            if (textLayer) {
                textLayer.addEventListener('click', (e) => {
                    const editedSpan = e.target.closest('span.edited');
                    if (editedSpan) {
                        selectEditSpan(editedSpan);
                    }
                });
            }

            // Click-away handler to deselect edited spans
            document.addEventListener('mousedown', (e) => {
                if (!selectedEditSpan) return;

                // Don't deselect if clicking on an edited span or its controls
                if (e.target.closest('span.edited') ||
                    e.target.closest('.edit-delete-btn') ||
                    e.target.closest('.edit-resize-handle') ||
                    e.target.closest('.layer-item') ||
                    e.target.closest('.unified-editor-modal')) {
                    return;
                }

                deselectAllEditSpans();
                core.set('selectedLayerId', null);
            });

            // Delete key handler for selected edit spans
            document.addEventListener('keydown', (e) => {
                if (!selectedEditSpan) return;

                const activeTag = document.activeElement.tagName;
                if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

                if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    deleteEditedSpan(selectedEditSpan);
                }
            });

            // Listen for layer selection from layers panel
            core.on('layer:selected', (layer) => {
                if (layer.type === 'text-edit') {
                    const textSpan = document.querySelector(
                        `#textLayer span[data-index="${layer.dataIndex}"][data-page="${layer.page}"]`
                    );
                    if (textSpan && textSpan.classList.contains('edited')) {
                        selectEditSpan(textSpan);
                    }
                } else {
                    // Another layer type selected, deselect edit spans
                    deselectAllEditSpans();
                }
            });
        },

        /**
         * Open Add Text modal
         * @param {number} x - X position
         * @param {number} y - Y position
         */
        openAddTextModal(x, y) {
            // Use unified text editor
            if (typeof PDFoxUnifiedTextEditor !== 'undefined') {
                if (PDFoxUnifiedTextEditor.isOpen()) return;

                const defaultFontSize = parseInt(document.getElementById('fontSize')?.value) || 14;
                const defaultColor = document.getElementById('textColor')?.value || '#000000';

                PDFoxUnifiedTextEditor.showAddText(x, y, core.get('currentPage'));
            }
        },

        /**
         * Close Add Text modal (legacy - now handled by unified editor)
         */
        closeAddTextModal() {
            if (typeof PDFoxUnifiedTextEditor !== 'undefined') {
                PDFoxUnifiedTextEditor.close();
            }
        },

        /**
         * Save new text overlay (legacy - now handled by unified editor)
         */
        saveAddText() {
            // Now handled by unified editor
        },

        /**
         * Open Edit Text modal for existing text
         * @param {Object} layer - Layer data
         */
        openEditModal(layer) {
            // Use unified text editor
            if (typeof PDFoxUnifiedTextEditor !== 'undefined') {
                if (PDFoxUnifiedTextEditor.isOpen()) return;

                const textEdits = core.get('textEdits');
                const edit = textEdits[layer.editIndex];
                if (!edit) return;

                const textSpan = document.querySelector(
                    `#textLayer span[data-index="${layer.dataIndex}"][data-page="${layer.page}"]`
                );

                PDFoxUnifiedTextEditor.showEditText({
                    span: textSpan,
                    original: edit.originalText,
                    text: edit.newText,
                    page: edit.page,
                    index: edit.index,
                    editIndex: layer.editIndex,
                    fontName: edit.fontName,
                    originalWidth: textSpan?.offsetWidth || 100,
                    fontSize: edit.customFontSize || Math.round(parseFloat(textSpan?.style.fontSize)) || 14,
                    textColor: edit.customColor || '#000000',
                    bgColor: edit.customBgColor || '#ffffff',
                    fontFamily: edit.customFontFamily || 'Arial, sans-serif',
                    isTransparent: edit.isTransparent ?? false,
                    isBold: edit.isBold ?? false,
                    isItalic: edit.isItalic ?? false
                });
            }
        },

        /**
         * Close Edit Text modal (legacy - now handled by unified editor)
         */
        closeEditModal() {
            if (typeof PDFoxUnifiedTextEditor !== 'undefined') {
                PDFoxUnifiedTextEditor.close();
            }
        },

        /**
         * Save text edit (legacy - now handled by unified editor)
         */
        saveTextEdit() {
            // Now handled by unified editor - keeping stub for compatibility
            const newText = $('#editTextArea')?.value;
            const customFontSize = parseInt($('#editTextFontSize')?.value) || 14;
            const customColor = $('#editTextColor')?.value || '#000000';
            const customBgColor = $('#editTextBgColor')?.value || '#ffffff';
            const customFontFamily = $('#editTextFontFamily')?.value || 'Arial, sans-serif';

            if (!currentEditingTextItem) {
                this.closeEditModal();
                return;
            }

            if (!newText || newText.trim() === '') {
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

                // Add controls if not already present and select
                addEditControls(textSpan);
                selectEditSpan(textSpan);
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
        },

        /**
         * Add controls to an edited span (for external use)
         * @param {HTMLElement} span - The span element
         */
        addEditControls(span) {
            addEditControls(span);
        },

        /**
         * Select an edited span
         * @param {HTMLElement} span - The span to select
         */
        selectEditSpan(span) {
            selectEditSpan(span);
        },

        /**
         * Deselect all edited spans
         */
        deselectAllEditSpans() {
            deselectAllEditSpans();
        }
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxTextEditor;
}
