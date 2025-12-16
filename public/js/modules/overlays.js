/**
 * PDFOX Overlays Module
 * Handles text overlays (AI-extracted text, added text blocks)
 * Single Responsibility: Text overlay management
 */

const PDFoxOverlays = (function() {
    'use strict';

    const core = PDFoxCore;
    const ui = PDFoxUI;
    const { generateId, hexToRgba, rgbaToHex } = PDFoxUtils;

    // Overlay state
    let selectedOverlay = null;
    let dragState = null;
    let resizeState = null;
    let clipboardOverlay = null; // Store copied overlay data

    /**
     * Convert text with links in format "text (url)" to HTML with clickable links
     * @param {string} text - Plain text that may contain links
     * @returns {string} HTML with clickable links
     */
    function convertLinksToHtml(text) {
        if (!text) return '';

        // Pattern to match: text (url) or just (url)
        // Matches: "link text (https://example.com)" or "(https://example.com)"
        const linkPattern = /(?:([^(]+?)\s*)?\((https?:\/\/[^)]+)\)/g;

        // Escape HTML in text first, then replace links
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        // Replace link patterns with anchor tags
        html = html.replace(linkPattern, (match, linkText, url) => {
            const displayText = linkText ? linkText.trim() : url;
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="overlay-link">${displayText}</a>`;
        });

        return html;
    }

    function createOverlayElement(overlay) {
        const div = document.createElement('div');
        div.className = 'text-overlay';
        div.id = overlay.id;

        // Create a content wrapper for the text/html
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'overlay-content';

        // Convert text with links to HTML
        contentWrapper.innerHTML = convertLinksToHtml(overlay.text);
        div.appendChild(contentWrapper);

        // Get current scale to adjust position and size
        const scale = core.get('scale') || 1.0;

        // Position and style - multiply by scale for display
        div.style.cssText = `
            left: ${overlay.x * scale}px;
            top: ${overlay.y * scale}px;
            width: ${overlay.width * scale}px;
            min-height: ${overlay.height * scale}px;
            font-size: ${overlay.fontSize * scale}px;
            background-color: ${overlay.bgColor};
            text-align: ${overlay.alignment || 'left'};
            font-family: ${overlay.fontFamily || 'Arial, sans-serif'};
        `;

        // Apply text color with opacity
        const textOpacity = overlay.textOpacity !== undefined ? overlay.textOpacity : 1;
        if (textOpacity < 1) {
            const r = parseInt(overlay.color.slice(1, 3), 16);
            const g = parseInt(overlay.color.slice(3, 5), 16);
            const b = parseInt(overlay.color.slice(5, 7), 16);
            div.style.color = `rgba(${r}, ${g}, ${b}, ${textOpacity})`;
        } else {
            div.style.color = overlay.color;
        }

        // Delete button
        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            e.preventDefault();
            deleteOverlay(overlay.id);
        });
        deleteBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        });
        div.appendChild(deleteBtn);

        // Resize handles
        ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'].forEach(position => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${position}`;
            handle.onmousedown = (e) => {
                e.stopPropagation();
                startResize(e, overlay.id, position);
            };
            div.appendChild(handle);
        });

        // Event handlers
        div.addEventListener('click', (e) => {
            // Check if clicking on a link
            const link = e.target.closest('a');
            if (link) {
                e.stopPropagation();
                e.preventDefault();
                window.open(link.href, '_blank', 'noopener,noreferrer');
                return;
            }
            e.stopPropagation();
            selectOverlay(overlay.id);
        });
        div.addEventListener('dblclick', (e) => {
            // Don't open editor if double-clicking a link
            if (e.target.closest('a')) return;
            e.stopPropagation();
            editOverlay(overlay.id);
        });
        div.addEventListener('mousedown', (e) => {
            // Ignore right-clicks - let context menu handle them
            if (e.button === 2) return;

            // Don't start drag if clicking on resize handle, delete button, or link
            if (e.target.classList.contains('resize-handle') ||
                e.target.classList.contains('delete-btn') ||
                e.target.closest('a')) {
                return;
            }
            e.stopPropagation();
            startDrag(e, overlay.id);
        });

        return div;
    }

    /**
     * Render all overlays for current page
     */
    function renderOverlays() {
        const overlayLayer = document.getElementById('overlayLayer');
        if (!overlayLayer) return;

        const currentPage = core.get('currentPage');
        const textOverlays = core.get('textOverlays');

        // Remove existing text overlays (not signatures)
        overlayLayer.querySelectorAll('.text-overlay').forEach(el => el.remove());

        // Render overlays for current page
        textOverlays.filter(o => o.page === currentPage).forEach(overlay => {
            overlayLayer.appendChild(createOverlayElement(overlay));
        });
    }

    /**
     * Deselect all overlays
     */
    function deselectAll() {
        document.querySelectorAll('.text-overlay').forEach(el => {
            el.classList.remove('selected');
        });
        // Clear selectedLayerId only if it was set by this module
        if (selectedOverlay && core.get('selectedLayerId') === selectedOverlay) {
            core.set('selectedLayerId', null);
        }
        selectedOverlay = null;
        core.set('selectedOverlay', null);
    }

    /**
     * Select an overlay
     * @param {string} overlayId - Overlay ID
     */
    function selectOverlay(overlayId) {
        // Deselect all first
        deselectAll();

        // Select this one
        const element = document.getElementById(overlayId);
        if (element) {
            element.classList.add('selected');
            selectedOverlay = overlayId;
            core.set('selectedOverlay', overlayId);
            core.set('selectedLayerId', overlayId);
        }
    }

    /**
     * Delete an overlay
     * @param {string} overlayId - Overlay ID
     */
    function deleteOverlay(overlayId) {
        ui.showConfirm('Delete this text overlay?', (confirmed) => {
            if (confirmed) {
                core.remove('textOverlays', o => o.id === overlayId);
                if (selectedOverlay === overlayId) {
                    selectedOverlay = null;
                    core.set('selectedOverlay', null);
                }
                ui.showNotification('Text overlay deleted', 'success');
            }
        });
    }

    /**
     * Edit an overlay
     * @param {string} overlayId - Overlay ID
     */
    function editOverlay(overlayId) {
        // Use unified text editor
        if (typeof PDFoxUnifiedTextEditor !== 'undefined') {
            if (PDFoxUnifiedTextEditor.isOpen()) return;
            PDFoxUnifiedTextEditor.showEditOverlay(overlayId);
        }
    }

    // Track mouse position for paste functionality
    let lastMousePosition = { x: 100, y: 100 };

    /**
     * Copy selected overlay to clipboard
     * @param {string} overlayId - Overlay ID to copy
     */
    function copyOverlay(overlayId) {
        const textOverlays = core.get('textOverlays');
        const overlay = textOverlays.find(o => o.id === overlayId);
        if (overlay) {
            // Store a copy of the overlay data including position
            clipboardOverlay = {
                text: overlay.text,
                x: overlay.x,
                y: overlay.y,
                width: overlay.width,
                height: overlay.height,
                fontSize: overlay.fontSize,
                color: overlay.color,
                bgColor: overlay.bgColor,
                textOpacity: overlay.textOpacity,
                fontFamily: overlay.fontFamily,
                alignment: overlay.alignment
            };
            ui.showNotification('Text overlay copied', 'success');
        }
    }

    /**
     * Paste overlay from clipboard
     * @param {Object} mousePos - Optional mouse position {x, y} for paste location
     */
    function pasteOverlay(mousePos) {
        if (!clipboardOverlay) {
            ui.showNotification('Nothing to paste', 'info');
            return;
        }

        const currentPage = core.get('currentPage');
        const scale = core.get('scale') || 1.0;

        // Determine paste position
        let pasteX, pasteY;

        if (mousePos && mousePos.x !== undefined && mousePos.y !== undefined) {
            // Use provided mouse position (normalized)
            pasteX = mousePos.x / scale;
            pasteY = mousePos.y / scale;
        } else if (lastMousePosition.x && lastMousePosition.y) {
            // Use tracked mouse position (normalized)
            pasteX = lastMousePosition.x / scale;
            pasteY = lastMousePosition.y / scale;
        } else {
            // Fallback: offset from original position
            pasteX = clipboardOverlay.x + 20;
            pasteY = clipboardOverlay.y + 20;
        }

        // Create new overlay at paste position
        const newOverlay = {
            id: generateId('overlay'),
            text: clipboardOverlay.text,
            x: pasteX,
            y: pasteY,
            width: clipboardOverlay.width,
            height: clipboardOverlay.height,
            fontSize: clipboardOverlay.fontSize,
            color: clipboardOverlay.color,
            bgColor: clipboardOverlay.bgColor,
            textOpacity: clipboardOverlay.textOpacity,
            fontFamily: clipboardOverlay.fontFamily,
            alignment: clipboardOverlay.alignment,
            page: currentPage
        };

        core.push('textOverlays', newOverlay);

        // Add to history for undo support
        core.addToHistory({
            type: 'textOverlay',
            data: newOverlay
        });

        // Select the new overlay
        setTimeout(() => {
            selectOverlay(newOverlay.id);
        }, 50);

        ui.showNotification('Text overlay pasted', 'success');
        core.emit('overlay:created', newOverlay);
    }

    /**
     * Update last mouse position (called from mouse move events)
     * @param {number} x - Mouse X position
     * @param {number} y - Mouse Y position
     */
    function updateMousePosition(x, y) {
        lastMousePosition = { x, y };
    }

    /**
     * Duplicate an overlay (copy and paste in one action)
     * @param {string} overlayId - Overlay ID to duplicate
     */
    function duplicateOverlay(overlayId) {
        const textOverlays = core.get('textOverlays');
        const overlay = textOverlays.find(o => o.id === overlayId);
        if (!overlay) return;

        const currentPage = core.get('currentPage');

        // Create new overlay with offset position
        const newOverlay = {
            id: generateId('overlay'),
            text: overlay.text,
            x: overlay.x + 20, // Offset from original
            y: overlay.y + 20,
            width: overlay.width,
            height: overlay.height,
            fontSize: overlay.fontSize,
            color: overlay.color,
            bgColor: overlay.bgColor,
            textOpacity: overlay.textOpacity,
            fontFamily: overlay.fontFamily,
            alignment: overlay.alignment,
            page: currentPage
        };

        core.push('textOverlays', newOverlay);

        // Add to history for undo support
        core.addToHistory({
            type: 'textOverlay',
            data: newOverlay
        });

        // Select the new overlay
        setTimeout(() => {
            selectOverlay(newOverlay.id);
        }, 50);

        ui.showNotification('Text overlay duplicated', 'success');
        core.emit('overlay:created', newOverlay);
    }

    /**
     * Start dragging overlay
     * @param {MouseEvent} e - Mouse event
     * @param {string} overlayId - Overlay ID
     */
    function startDrag(e, overlayId) {
        const textOverlays = core.get('textOverlays');
        const overlay = textOverlays.find(o => o.id === overlayId);
        if (!overlay) return;

        selectOverlay(overlayId);

        const element = document.getElementById(overlayId);
        if (element) element.classList.add('dragging');

        dragState = {
            overlayId: overlayId,
            startX: e.clientX,
            startY: e.clientY,
            initialX: overlay.x,
            initialY: overlay.y
        };

        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', endDrag);
        e.preventDefault();
    }

    /**
     * Handle drag movement
     * @param {MouseEvent} e - Mouse event
     */
    function onDrag(e) {
        if (!dragState) return;

        const scale = core.get('scale') || 1.0;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;

        const textOverlays = core.get('textOverlays');
        const overlay = textOverlays.find(o => o.id === dragState.overlayId);
        if (overlay) {
            // Store normalized position (divide by scale)
            overlay.x = dragState.initialX + dx / scale;
            overlay.y = dragState.initialY + dy / scale;

            const element = document.getElementById(dragState.overlayId);
            if (element) {
                // Display at scaled position
                element.style.left = (overlay.x * scale) + 'px';
                element.style.top = (overlay.y * scale) + 'px';
            }
        }
    }

    /**
     * End dragging
     */
    function endDrag() {
        if (dragState) {
            const element = document.getElementById(dragState.overlayId);
            if (element) element.classList.remove('dragging');
            dragState = null;
        }
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', endDrag);
    }

    /**
     * Start resizing overlay
     * @param {MouseEvent} e - Mouse event
     * @param {string} overlayId - Overlay ID
     * @param {string} position - Handle position
     */
    function startResize(e, overlayId, position) {
        const textOverlays = core.get('textOverlays');
        const overlay = textOverlays.find(o => o.id === overlayId);
        if (!overlay) return;

        selectOverlay(overlayId);

        resizeState = {
            overlayId: overlayId,
            position: position,
            startX: e.clientX,
            startY: e.clientY,
            initialX: overlay.x,
            initialY: overlay.y,
            initialWidth: overlay.width,
            initialHeight: overlay.height,
            initialFontSize: overlay.fontSize || 16
        };

        document.addEventListener('mousemove', onResize);
        document.addEventListener('mouseup', endResize);
        e.preventDefault();
    }

    /**
     * Handle resize movement
     * @param {MouseEvent} e - Mouse event
     */
    function onResize(e) {
        if (!resizeState) return;

        const scale = core.get('scale') || 1.0;
        // Convert screen delta to normalized delta
        const dx = (e.clientX - resizeState.startX) / scale;
        const dy = (e.clientY - resizeState.startY) / scale;

        const textOverlays = core.get('textOverlays');
        const overlay = textOverlays.find(o => o.id === resizeState.overlayId);
        if (!overlay) return;

        const element = document.getElementById(resizeState.overlayId);
        if (!element) return;

        // Store previous dimensions to calculate scale ratio
        const prevWidth = overlay.width;
        const prevHeight = overlay.height;

        // All values are stored normalized (at scale 1.0)
        switch (resizeState.position) {
            case 'se':
                overlay.width = Math.max(50, resizeState.initialWidth + dx);
                overlay.height = Math.max(20, resizeState.initialHeight + dy);
                break;
            case 'sw':
                overlay.width = Math.max(50, resizeState.initialWidth - dx);
                overlay.height = Math.max(20, resizeState.initialHeight + dy);
                overlay.x = resizeState.initialX + (resizeState.initialWidth - overlay.width);
                break;
            case 'ne':
                overlay.width = Math.max(50, resizeState.initialWidth + dx);
                overlay.height = Math.max(20, resizeState.initialHeight - dy);
                overlay.y = resizeState.initialY + (resizeState.initialHeight - overlay.height);
                break;
            case 'nw':
                overlay.width = Math.max(50, resizeState.initialWidth - dx);
                overlay.height = Math.max(20, resizeState.initialHeight - dy);
                overlay.x = resizeState.initialX + (resizeState.initialWidth - overlay.width);
                overlay.y = resizeState.initialY + (resizeState.initialHeight - overlay.height);
                break;
            case 'n':
                overlay.height = Math.max(20, resizeState.initialHeight - dy);
                overlay.y = resizeState.initialY + (resizeState.initialHeight - overlay.height);
                break;
            case 's':
                overlay.height = Math.max(20, resizeState.initialHeight + dy);
                break;
            case 'e':
                overlay.width = Math.max(50, resizeState.initialWidth + dx);
                break;
            case 'w':
                overlay.width = Math.max(50, resizeState.initialWidth - dx);
                overlay.x = resizeState.initialX + (resizeState.initialWidth - overlay.width);
                break;
        }

        // Only scale font size when using corner handles (proportional resize)
        // Edge handles (n, s, e, w) only change dimensions without affecting font size
        if (['se', 'sw', 'ne', 'nw'].includes(resizeState.position)) {
            // Corner resize - scale font proportionally using average of both dimensions
            const widthRatio = overlay.width / resizeState.initialWidth;
            const heightRatio = overlay.height / resizeState.initialHeight;
            const scaleRatio = (widthRatio + heightRatio) / 2;

            // Calculate new font size with min/max constraints
            const newFontSize = Math.max(8, Math.min(72, Math.round(resizeState.initialFontSize * scaleRatio)));
            overlay.fontSize = newFontSize;
            element.style.fontSize = (newFontSize * scale) + 'px';
        }
        // For edge handles (e, w, n, s), font size remains unchanged

        // Display at scaled position/size
        element.style.left = (overlay.x * scale) + 'px';
        element.style.top = (overlay.y * scale) + 'px';
        element.style.width = (overlay.width * scale) + 'px';
        element.style.minHeight = (overlay.height * scale) + 'px';
    }

    /**
     * End resizing
     */
    function endResize() {
        resizeState = null;
        document.removeEventListener('mousemove', onResize);
        document.removeEventListener('mouseup', endResize);
    }

    return {
        /**
         * Initialize overlays module
         */
        init() {
            // Subscribe to events
            core.on('textOverlays:changed', () => renderOverlays());
            core.on('page:rendered', () => renderOverlays());
            core.on('scale:changed', () => renderOverlays());  // Re-render on zoom change

            core.on('overlay:select', (id) => selectOverlay(id));
            core.on('overlay:created', () => renderOverlays());
            core.on('overlay:updated', () => renderOverlays());
            core.on('overlay:deleted', () => renderOverlays());

            core.on('layer:edit', (layer) => {
                if (layer.type === 'text-overlay') {
                    editOverlay(layer.id);
                }
            });

            core.on('layer:delete', (layer) => {
                if (layer.type === 'text-overlay') {
                    // Directly remove without confirmation (already confirmed in layers.js)
                    const removed = core.remove('textOverlays', o => o.id === layer.id);
                    if (removed) {
                        if (selectedOverlay === layer.id) {
                            selectedOverlay = null;
                            core.set('selectedOverlay', null);
                        }
                        renderOverlays();
                        ui.showNotification('Text overlay deleted', 'success');
                    }
                }
            });

            core.on('layer:duplicate', (layer) => {
                if (layer.type === 'text-overlay') {
                    duplicateOverlay(layer.id);
                }
            });

            // Delete key handler
            document.addEventListener('keydown', (e) => {
                // Don't trigger if typing in an input field
                const activeTag = document.activeElement.tagName;
                if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
                    return;
                }

                // Don't trigger if a modal is open
                if (document.querySelector('.custom-modal[style*="flex"]') ||
                    document.querySelector('.overlay-edit-modal') ||
                    document.getElementById('unifiedTextEditorModal')) {
                    return;
                }

                // Ctrl+C - Copy selected overlay
                if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedOverlay) {
                    e.preventDefault();
                    copyOverlay(selectedOverlay);
                    return;
                }

                // Ctrl+V - Paste overlay
                if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboardOverlay) {
                    e.preventDefault();
                    pasteOverlay();
                    return;
                }

                // Check if Delete or Backspace key
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    // Check if we have a selected overlay
                    if (!selectedOverlay) {
                        return;
                    }

                    // Delete the overlay
                    e.preventDefault();
                    e.stopPropagation();
                    deleteOverlay(selectedOverlay);
                }

                // Escape key to deselect
                if (e.key === 'Escape' && selectedOverlay) {
                    deselectAll();
                }
            });

            // Click-away deselection: click on canvas/overlay layer deselects overlay
            const overlayLayer = document.getElementById('overlayLayer');
            const canvasContainer = document.querySelector('.canvas-container');

            // Handler for clicking on empty space
            const handleClickAway = (e) => {
                // Don't deselect if clicking on an overlay or its controls
                if (e.target.closest('.text-overlay') ||
                    e.target.closest('.signature-overlay') ||
                    e.target.closest('.resize-handle') ||
                    e.target.closest('.delete-btn')) {
                    return;
                }

                // Don't deselect if clicking on text layer in editText mode
                if (e.target.closest('#textLayer') && core.get('currentTool') === 'editText') {
                    return;
                }

                // Don't deselect if clicking on stamps or patches
                if (e.target.closest('.stamp-overlay') ||
                    e.target.closest('.patch-overlay') ||
                    e.target.closest('.layer-item')) {
                    return;
                }

                // Don't deselect if a modal is open
                if (document.querySelector('.custom-modal') ||
                    document.querySelector('.edit-modal-overlay') ||
                    document.getElementById('unifiedTextEditorModal')) {
                    return;
                }

                // Deselect when clicking on canvas area
                if (selectedOverlay) {
                    deselectAll();
                }
            };

            if (overlayLayer) {
                overlayLayer.addEventListener('click', handleClickAway);

                // Track mouse position for paste functionality
                overlayLayer.addEventListener('mousemove', (e) => {
                    const rect = overlayLayer.getBoundingClientRect();
                    updateMousePosition(e.clientX - rect.left, e.clientY - rect.top);
                });
            }

            // Also listen on canvas container for clicks outside overlays
            if (canvasContainer) {
                canvasContainer.addEventListener('click', handleClickAway);

                // Track mouse position for paste functionality
                canvasContainer.addEventListener('mousemove', (e) => {
                    const rect = canvasContainer.getBoundingClientRect();
                    updateMousePosition(e.clientX - rect.left, e.clientY - rect.top);
                });
            }

            // Listen for overlay:deselect event
            core.on('overlay:deselect', () => deselectAll());
        },

        /**
         * Render overlays
         */
        render: renderOverlays,

        /**
         * Select overlay
         * @param {string} id - Overlay ID
         */
        select: selectOverlay,

        /**
         * Deselect all overlays
         */
        deselectAll: deselectAll,

        /**
         * Delete overlay
         * @param {string} id - Overlay ID
         * @param {boolean} skipConfirm - Skip confirmation
         */
        delete(id, skipConfirm = false) {
            if (skipConfirm) {
                core.remove('textOverlays', o => o.id === id);
                if (selectedOverlay === id) {
                    selectedOverlay = null;
                    core.set('selectedOverlay', null);
                }
                ui.showNotification('Text overlay deleted', 'success');
            } else {
                deleteOverlay(id);
            }
        },

        /**
         * Edit overlay
         * @param {string} id - Overlay ID
         */
        edit: editOverlay,

        /**
         * Copy overlay to clipboard
         * @param {string} id - Overlay ID
         */
        copy: copyOverlay,

        /**
         * Paste overlay from clipboard
         */
        paste: pasteOverlay,

        /**
         * Duplicate overlay
         * @param {string} id - Overlay ID
         */
        duplicate: duplicateOverlay,

        /**
         * Save overlay edit (legacy - now handled by unified editor)
         * @param {string} overlayId - Overlay ID
         */
        saveEdit(overlayId) {
            // Now handled by unified text editor
        },

        /**
         * Get selected overlay
         * @returns {string|null}
         */
        getSelected() {
            return selectedOverlay;
        },

        /**
         * Create new overlay
         * @param {Object} data - Overlay data
         * @returns {Object} Created overlay
         */
        create(data) {
            const overlay = {
                id: generateId('overlay'),
                text: data.text || '',
                x: data.x || 0,
                y: data.y || 0,
                width: data.width || 100,
                height: data.height || 30,
                fontSize: data.fontSize || 14,
                color: data.color || '#000000',
                bgColor: data.bgColor || 'rgba(255, 255, 255, 0.9)',
                textOpacity: data.textOpacity !== undefined ? data.textOpacity : 1,
                fontFamily: data.fontFamily || 'Arial, sans-serif',
                alignment: data.alignment || 'left',
                page: data.page || core.get('currentPage')
            };

            core.push('textOverlays', overlay);

            // Add to history for undo support
            core.addToHistory({
                type: 'textOverlay',
                data: overlay
            });

            return overlay;
        }
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxOverlays;
}
