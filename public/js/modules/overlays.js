/**
 * PDFOX Overlays Module
 * Handles text overlays (OCR text, added text blocks)
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

    /**
     * Create overlay element
     * @param {Object} overlay - Overlay data
     * @returns {HTMLElement}
     */
    function createOverlayElement(overlay) {
        const div = document.createElement('div');
        div.className = 'text-overlay';
        div.id = overlay.id;
        div.textContent = overlay.text;

        // Position and style
        div.style.cssText = `
            left: ${overlay.x}px;
            top: ${overlay.y}px;
            width: ${overlay.width}px;
            min-height: ${overlay.height}px;
            font-size: ${overlay.fontSize}px;
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
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteOverlay(overlay.id);
        };
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
        div.onclick = () => selectOverlay(overlay.id);
        div.ondblclick = (e) => {
            e.stopPropagation();
            editOverlay(overlay.id);
        };
        div.onmousedown = (e) => {
            if (e.target === div) {
                startDrag(e, overlay.id);
            }
        };

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
     * Select an overlay
     * @param {string} overlayId - Overlay ID
     */
    function selectOverlay(overlayId) {
        // Deselect all
        document.querySelectorAll('.text-overlay').forEach(el => {
            el.classList.remove('selected');
        });

        // Select this one
        const element = document.getElementById(overlayId);
        if (element) {
            element.classList.add('selected');
            selectedOverlay = overlayId;
            core.set('selectedOverlay', overlayId);
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
        const textOverlays = core.get('textOverlays');
        const overlay = textOverlays.find(o => o.id === overlayId);
        if (!overlay) return;

        // Create edit modal
        const modal = document.createElement('div');
        modal.className = 'overlay-edit-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 10000;';

        modal.innerHTML = `
            <div style="background: #1a1a1a; padding: 32px; border-radius: 16px; max-width: 520px; width: 90%; border: 1px solid #333; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);">
                <h3 style="margin: 0 0 24px 0; color: #ffffff; font-size: 22px; display: flex; align-items: center; gap: 10px;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E50914" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit Text
                </h3>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #aaaaaa; font-size: 14px;">Text:</label>
                    <textarea id="editOverlayText" style="width: 100%; height: 100px; padding: 12px; border: 2px solid #333; border-radius: 8px; font-family: inherit; resize: vertical; background: #2a2a2a; color: #ffffff; font-size: 14px; box-sizing: border-box;">${overlay.text}</textarea>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #aaaaaa; font-size: 14px;">Font Size: <span id="editOverlayFontSizeValue" style="color: #E50914; font-weight: 600;">${overlay.fontSize}px</span></label>
                    <input type="range" id="editOverlayFontSize" value="${overlay.fontSize}" min="8" max="72" style="width: 100%; height: 6px; accent-color: #E50914; cursor: pointer;" oninput="document.getElementById('editOverlayFontSizeValue').textContent = this.value + 'px'">
                    <div style="display: flex; gap: 8px; margin-top: 10px;">
                        ${[10, 12, 14, 18, 24, 36].map(size => `
                            <button type="button" onclick="PDFoxUI.setFontSize('editOverlayFontSize', 'editOverlayFontSizeValue', ${size})"
                                style="flex: 1; padding: 6px 0; background: #2a2a2a; border: 1px solid #444; border-radius: 6px; color: #aaa; font-size: 12px; cursor: pointer;">${size}</button>
                        `).join('')}
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #aaaaaa; font-size: 14px;">Text Color:</label>
                        <input type="color" id="editOverlayTextColor" value="${overlay.color}" style="width: 100%; height: 42px; border: 2px solid #333; border-radius: 8px; background: #2a2a2a; cursor: pointer; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #aaaaaa; font-size: 14px;">Background:</label>
                        <input type="color" id="editOverlayBgColor" value="${rgbaToHex(overlay.bgColor)}" style="width: 100%; height: 42px; border: 2px solid #333; border-radius: 8px; background: #2a2a2a; cursor: pointer; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #aaaaaa; font-size: 14px;">Font:</label>
                        <select id="editOverlayFontFamily" style="width: 100%; padding: 10px 8px; border: 2px solid #333; border-radius: 8px; background: #2a2a2a; color: #ffffff; font-size: 13px; cursor: pointer; box-sizing: border-box;">
                            <option value="Arial, sans-serif" ${(overlay.fontFamily || 'Arial, sans-serif') === 'Arial, sans-serif' ? 'selected' : ''}>Arial</option>
                            <option value="'Times New Roman', serif" ${overlay.fontFamily === "'Times New Roman', serif" ? 'selected' : ''}>Times New Roman</option>
                            <option value="'Courier New', monospace" ${overlay.fontFamily === "'Courier New', monospace" ? 'selected' : ''}>Courier New</option>
                            <option value="Georgia, serif" ${overlay.fontFamily === 'Georgia, serif' ? 'selected' : ''}>Georgia</option>
                            <option value="Verdana, sans-serif" ${overlay.fontFamily === 'Verdana, sans-serif' ? 'selected' : ''}>Verdana</option>
                        </select>
                    </div>
                </div>

                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button onclick="this.closest('.overlay-edit-modal').remove()" style="padding: 12px 24px; background: #2a2a2a; color: #ffffff; border: 2px solid #333; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 14px;">Cancel</button>
                    <button onclick="PDFoxOverlays.saveEdit('${overlayId}')" style="padding: 12px 24px; background: #E50914; color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 14px; box-shadow: 0 4px 12px rgba(229, 9, 20, 0.4);">Save Changes</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
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

        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;

        const textOverlays = core.get('textOverlays');
        const overlay = textOverlays.find(o => o.id === dragState.overlayId);
        if (overlay) {
            overlay.x = dragState.initialX + dx;
            overlay.y = dragState.initialY + dy;

            const element = document.getElementById(dragState.overlayId);
            if (element) {
                element.style.left = overlay.x + 'px';
                element.style.top = overlay.y + 'px';
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
            initialHeight: overlay.height
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

        const dx = e.clientX - resizeState.startX;
        const dy = e.clientY - resizeState.startY;

        const textOverlays = core.get('textOverlays');
        const overlay = textOverlays.find(o => o.id === resizeState.overlayId);
        if (!overlay) return;

        const element = document.getElementById(resizeState.overlayId);
        if (!element) return;

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

        element.style.left = overlay.x + 'px';
        element.style.top = overlay.y + 'px';
        element.style.width = overlay.width + 'px';
        element.style.minHeight = overlay.height + 'px';
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
                    this.delete(layer.id, true);
                }
            });

            // Delete key handler
            document.addEventListener('keydown', (e) => {
                if ((e.key === 'Delete' || e.key === 'Backspace') && selectedOverlay) {
                    if (document.activeElement.tagName !== 'INPUT' &&
                        document.activeElement.tagName !== 'TEXTAREA') {
                        deleteOverlay(selectedOverlay);
                        e.preventDefault();
                    }
                }
            });
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
         * Save overlay edit
         * @param {string} overlayId - Overlay ID
         */
        saveEdit(overlayId) {
            const textOverlays = core.get('textOverlays');
            const index = textOverlays.findIndex(o => o.id === overlayId);
            if (index === -1) return;

            const overlay = textOverlays[index];
            const bgColor = document.getElementById('editOverlayBgColor').value;

            const updated = {
                ...overlay,
                text: document.getElementById('editOverlayText').value,
                fontSize: parseInt(document.getElementById('editOverlayFontSize').value) || 14,
                color: document.getElementById('editOverlayTextColor').value,
                bgColor: hexToRgba(bgColor, 0.9),
                fontFamily: document.getElementById('editOverlayFontFamily').value
            };

            core.updateAt('textOverlays', index, updated);
            document.querySelector('.overlay-edit-modal')?.remove();
            ui.showNotification('Text overlay updated!', 'success');
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
            return overlay;
        }
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxOverlays;
}
