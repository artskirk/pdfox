/**
 * PDFOX Patch Module
 * Clone/patch tool for copying areas to cover unwanted content
 * Similar to Photoshop's Clone Stamp/Patch tool
 */

const PDFoxPatch = (function() {
    'use strict';

    const core = PDFoxCore;
    const ui = PDFoxUI;

    // State
    let patches = [];
    let selectedPatchId = null;
    let clipboardPatch = null;

    // Selection state
    let isSelecting = false;
    let selectionStart = null;
    let selectionPreview = null;

    // Drag state
    let isDragging = false;
    let dragStartPos = null;
    let dragStartPatchPos = null;

    // Resize state
    let isResizing = false;
    let resizeHandle = null;
    let resizeStartPos = null;
    let resizeStartSize = null;
    let resizeStartPatchPos = null;

    /**
     * Generate unique ID for patch
     */
    function generateId() {
        return 'patch-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Start selection on mousedown
     * @param {MouseEvent} e
     */
    function startSelection(e) {
        if (core.get('currentTool') !== 'patch') return;

        const canvas = document.getElementById('annotationCanvas');
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        isSelecting = true;
        selectionStart = { x, y };

        // Create selection preview element
        createSelectionPreview(x, y);
    }

    /**
     * Update selection on mousemove
     * @param {MouseEvent} e
     */
    function updateSelection(e) {
        if (!isSelecting || !selectionStart) return;

        const canvas = document.getElementById('annotationCanvas');
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, canvas.width));
        const y = Math.max(0, Math.min(e.clientY - rect.top, canvas.height));

        updateSelectionPreview(
            Math.min(selectionStart.x, x),
            Math.min(selectionStart.y, y),
            Math.abs(x - selectionStart.x),
            Math.abs(y - selectionStart.y)
        );
    }

    /**
     * End selection on mouseup
     * @param {MouseEvent} e
     */
    function endSelection(e) {
        if (!isSelecting || !selectionStart) return;

        const canvas = document.getElementById('annotationCanvas');
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, canvas.width));
        const y = Math.max(0, Math.min(e.clientY - rect.top, canvas.height));

        const selX = Math.min(selectionStart.x, x);
        const selY = Math.min(selectionStart.y, y);
        const selWidth = Math.abs(x - selectionStart.x);
        const selHeight = Math.abs(y - selectionStart.y);

        isSelecting = false;
        selectionStart = null;
        removeSelectionPreview();

        // Minimum selection size
        if (selWidth < 10 || selHeight < 10) {
            ui.showNotification('Selection too small. Please select a larger area.', 'warning');
            return;
        }

        // Capture the selected area
        const imageData = captureArea(selX, selY, selWidth, selHeight);
        if (imageData) {
            showPatchPopup(imageData, selX, selY, selWidth, selHeight);
        }
    }

    /**
     * Create selection preview element
     */
    function createSelectionPreview(x, y) {
        removeSelectionPreview();

        const preview = document.createElement('div');
        preview.id = 'patchSelectionPreview';
        preview.className = 'patch-selection-preview';
        preview.style.left = `${x}px`;
        preview.style.top = `${y}px`;
        preview.style.width = '0px';
        preview.style.height = '0px';

        const overlayLayer = document.getElementById('overlayLayer');
        if (overlayLayer) {
            overlayLayer.appendChild(preview);
            selectionPreview = preview;
        }
    }

    /**
     * Update selection preview dimensions
     */
    function updateSelectionPreview(x, y, width, height) {
        if (!selectionPreview) return;

        selectionPreview.style.left = `${x}px`;
        selectionPreview.style.top = `${y}px`;
        selectionPreview.style.width = `${width}px`;
        selectionPreview.style.height = `${height}px`;
    }

    /**
     * Remove selection preview element
     */
    function removeSelectionPreview() {
        if (selectionPreview) {
            selectionPreview.remove();
            selectionPreview = null;
        }
        const existing = document.getElementById('patchSelectionPreview');
        if (existing) existing.remove();
    }

    /**
     * Capture area from all visible layers
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} width - Width
     * @param {number} height - Height
     * @returns {string} Data URL of captured image
     */
    function captureArea(x, y, width, height) {
        try {
            // Create temporary canvas to merge all visible layers
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');

            // 1. Draw PDF canvas content
            const pdfCanvas = document.getElementById('pdfCanvas');
            if (pdfCanvas) {
                tempCtx.drawImage(pdfCanvas, x, y, width, height, 0, 0, width, height);
            }

            // 2. Draw annotation canvas content (drawings, shapes)
            const annotationCanvas = document.getElementById('annotationCanvas');
            if (annotationCanvas) {
                tempCtx.drawImage(annotationCanvas, x, y, width, height, 0, 0, width, height);
            }

            // 3. Render overlay layer elements to canvas
            // This captures stamps, text overlays, signatures, etc.
            renderOverlayElementsToCanvas(tempCtx, x, y, width, height);

            // Return as data URL
            return tempCanvas.toDataURL('image/png');
        } catch (error) {
            console.error('Error capturing area:', error);
            ui.showNotification('Failed to capture area', 'error');
            return null;
        }
    }

    /**
     * Render overlay layer elements to canvas
     * This manually draws DOM elements that are in the selection area
     */
    function renderOverlayElementsToCanvas(ctx, selX, selY, selWidth, selHeight) {
        const overlayLayer = document.getElementById('overlayLayer');
        if (!overlayLayer) return;

        // Get all visible overlay elements
        const elements = overlayLayer.querySelectorAll('.stamp-element, .text-overlay, .patch-element');

        elements.forEach(element => {
            const elemRect = {
                left: parseFloat(element.style.left) || 0,
                top: parseFloat(element.style.top) || 0,
                width: element.offsetWidth,
                height: element.offsetHeight
            };

            // Check if element intersects with selection
            if (elemRect.left + elemRect.width < selX ||
                elemRect.left > selX + selWidth ||
                elemRect.top + elemRect.height < selY ||
                elemRect.top > selY + selHeight) {
                return; // No intersection
            }

            // For stamps with SVG content
            if (element.classList.contains('stamp-element')) {
                const svg = element.querySelector('svg');
                if (svg) {
                    const svgData = new XMLSerializer().serializeToString(svg);
                    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                    const url = URL.createObjectURL(svgBlob);
                    const img = new Image();
                    img.onload = function() {
                        const drawX = elemRect.left - selX;
                        const drawY = elemRect.top - selY;
                        ctx.drawImage(img, drawX, drawY, elemRect.width, elemRect.height);
                        URL.revokeObjectURL(url);
                    };
                    img.src = url;
                }
            }

            // For patch elements with images
            if (element.classList.contains('patch-element')) {
                const img = element.querySelector('img');
                if (img && img.complete) {
                    const drawX = elemRect.left - selX;
                    const drawY = elemRect.top - selY;
                    ctx.globalAlpha = parseFloat(img.style.opacity) || 1;
                    ctx.drawImage(img, drawX, drawY, elemRect.width, elemRect.height);
                    ctx.globalAlpha = 1;
                }
            }
        });
    }

    /**
     * Show patch options popup
     */
    function showPatchPopup(imageData, sourceX, sourceY, width, height) {
        closePatchPopup();

        const popup = document.createElement('div');
        popup.id = 'patchOptionsPopup';
        popup.className = 'patch-options-popup';

        // Position popup in center of screen
        const popupWidth = 320;
        const popupHeight = 400;
        const popupX = (window.innerWidth - popupWidth) / 2;
        const popupY = (window.innerHeight - popupHeight) / 2;

        popup.style.left = `${popupX}px`;
        popup.style.top = `${popupY}px`;
        popup.style.width = `${popupWidth}px`;

        // Store patch info on popup
        popup.dataset.imageData = imageData;
        popup.dataset.sourceX = sourceX;
        popup.dataset.sourceY = sourceY;
        popup.dataset.width = width;
        popup.dataset.height = height;

        popup.innerHTML = `
            <div class="patch-popup-header">
                <span class="patch-popup-title">Patch Preview</span>
                <button class="patch-popup-close" id="patchPopupClose">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
            <div class="patch-popup-preview">
                <img src="${imageData}" alt="Patch preview" id="patchPreviewImage" />
            </div>
            <div class="patch-popup-info">
                <span>Size: ${Math.round(width)} × ${Math.round(height)} px</span>
            </div>
            <div class="patch-popup-options">
                <div class="patch-option-row">
                    <label>Opacity</label>
                    <input type="range" id="patchOpacitySlider" min="10" max="100" value="100">
                    <span id="patchOpacityValue">100%</span>
                </div>
            </div>
            <div class="patch-popup-actions">
                <button class="modal-btn modal-btn-secondary" id="patchCancelBtn">Cancel</button>
                <button class="modal-btn modal-btn-primary" id="patchPlaceBtn">Place Patch</button>
            </div>
        `;

        document.body.appendChild(popup);

        // Event listeners
        const closeBtn = popup.querySelector('#patchPopupClose');
        const cancelBtn = popup.querySelector('#patchCancelBtn');
        const placeBtn = popup.querySelector('#patchPlaceBtn');
        const opacitySlider = popup.querySelector('#patchOpacitySlider');
        const opacityValue = popup.querySelector('#patchOpacityValue');
        const previewImage = popup.querySelector('#patchPreviewImage');

        closeBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closePatchPopup();
        });

        cancelBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closePatchPopup();
        });

        placeBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            confirmPatch();
        });

        opacitySlider.addEventListener('input', (e) => {
            const opacity = e.target.value;
            opacityValue.textContent = `${opacity}%`;
            previewImage.style.opacity = opacity / 100;
        });

        // Click outside to close
        setTimeout(() => {
            document.addEventListener('click', handlePopupOutsideClick);
        }, 100);
    }

    /**
     * Handle click outside popup
     */
    function handlePopupOutsideClick(e) {
        const popup = document.getElementById('patchOptionsPopup');
        if (popup && !popup.contains(e.target)) {
            closePatchPopup();
        }
    }

    /**
     * Close patch popup
     */
    function closePatchPopup() {
        const popup = document.getElementById('patchOptionsPopup');
        if (popup) {
            popup.remove();
        }
        document.removeEventListener('click', handlePopupOutsideClick);
    }

    /**
     * Confirm and create patch from popup
     */
    function confirmPatch() {
        const popup = document.getElementById('patchOptionsPopup');
        if (!popup) return;

        const imageData = popup.dataset.imageData;
        const sourceX = parseFloat(popup.dataset.sourceX);
        const sourceY = parseFloat(popup.dataset.sourceY);
        const width = parseFloat(popup.dataset.width);
        const height = parseFloat(popup.dataset.height);
        const opacitySlider = popup.querySelector('#patchOpacitySlider');
        const opacity = opacitySlider ? opacitySlider.value / 100 : 1;

        closePatchPopup();

        // Create patch with small offset from source
        createPatch(imageData, sourceX + 20, sourceY + 20, width, height, opacity, sourceX, sourceY);
    }

    /**
     * Create a new patch
     */
    function createPatch(imageData, x, y, width, height, opacity, sourceX, sourceY) {
        const currentPage = core.get('currentPage');

        const patch = {
            id: generateId(),
            imageData: imageData,
            sourceX: sourceX,
            sourceY: sourceY,
            width: width,
            height: height,
            x: x,
            y: y,
            opacity: opacity,
            page: currentPage,
            timestamp: Date.now()
        };

        patches.push(patch);
        renderPatch(patch);

        // Add to history
        core.addToHistory({
            type: 'patch',
            data: patch
        });

        // Emit event for layers panel
        core.emit('patches:changed', { patches });

        // Select the new patch and switch to move mode
        selectPatch(patch.id);
        if (typeof PDFoxApp !== 'undefined') {
            PDFoxApp.setTool('moveText');
        }

        ui.showNotification('Patch created', 'success');
    }

    /**
     * Render a patch element
     */
    function renderPatch(patch) {
        const overlayLayer = document.getElementById('overlayLayer');
        if (!overlayLayer) return;

        // Remove existing if re-rendering
        const existing = document.getElementById(patch.id);
        if (existing) existing.remove();

        const element = document.createElement('div');
        element.id = patch.id;
        element.className = 'patch-element';
        element.dataset.patchId = patch.id;
        element.dataset.page = patch.page;

        element.style.left = `${patch.x}px`;
        element.style.top = `${patch.y}px`;
        element.style.width = `${patch.width}px`;
        element.style.height = `${patch.height}px`;

        element.innerHTML = `
            <img src="${patch.imageData}" style="opacity: ${patch.opacity}" draggable="false" />
            <div class="patch-resize-handle nw" data-handle="nw"></div>
            <div class="patch-resize-handle ne" data-handle="ne"></div>
            <div class="patch-resize-handle sw" data-handle="sw"></div>
            <div class="patch-resize-handle se" data-handle="se"></div>
        `;

        // Event handlers
        element.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('patch-resize-handle')) {
                e.stopPropagation();
                startResize(e, patch.id, e.target.dataset.handle);
            } else {
                e.stopPropagation();
                selectPatch(patch.id);
                startDrag(e, patch.id);
            }
        });

        overlayLayer.appendChild(element);
    }

    /**
     * Select a patch
     */
    function selectPatch(patchId) {
        // Deselect previous
        document.querySelectorAll('.patch-element.selected').forEach(el => {
            el.classList.remove('selected');
        });

        selectedPatchId = patchId;

        const element = document.getElementById(patchId);
        if (element) {
            element.classList.add('selected');
        }
    }

    /**
     * Deselect current patch
     */
    function deselectPatch() {
        document.querySelectorAll('.patch-element.selected').forEach(el => {
            el.classList.remove('selected');
        });
        selectedPatchId = null;
    }

    /**
     * Start dragging a patch
     */
    function startDrag(e, patchId) {
        const element = document.getElementById(patchId);
        if (!element) return;

        const patch = patches.find(p => p.id === patchId);
        if (!patch) return;

        isDragging = true;
        dragStartPos = { x: e.clientX, y: e.clientY };
        dragStartPatchPos = { x: patch.x, y: patch.y };

        element.classList.add('dragging');

        const onMouseMove = (e) => {
            if (!isDragging) return;

            const dx = e.clientX - dragStartPos.x;
            const dy = e.clientY - dragStartPos.y;

            patch.x = dragStartPatchPos.x + dx;
            patch.y = dragStartPatchPos.y + dy;

            element.style.left = `${patch.x}px`;
            element.style.top = `${patch.y}px`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            element.classList.remove('dragging');
            isDragging = false;

            // Add to history if position changed
            if (patch.x !== dragStartPatchPos.x || patch.y !== dragStartPatchPos.y) {
                core.addToHistory({
                    type: 'patchMove',
                    patchId: patchId,
                    previousPosition: { x: dragStartPatchPos.x, y: dragStartPatchPos.y }
                });
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    /**
     * Start resizing a patch
     */
    function startResize(e, patchId, handle) {
        const element = document.getElementById(patchId);
        if (!element) return;

        const patch = patches.find(p => p.id === patchId);
        if (!patch) return;

        isResizing = true;
        resizeHandle = handle;
        resizeStartPos = { x: e.clientX, y: e.clientY };
        resizeStartSize = { width: patch.width, height: patch.height };
        resizeStartPatchPos = { x: patch.x, y: patch.y };

        const originalWidth = patch.width;
        const originalHeight = patch.height;
        const aspectRatio = originalWidth / originalHeight;

        const onMouseMove = (e) => {
            if (!isResizing) return;

            const dx = e.clientX - resizeStartPos.x;
            const dy = e.clientY - resizeStartPos.y;

            let newWidth = resizeStartSize.width;
            let newHeight = resizeStartSize.height;
            let newX = resizeStartPatchPos.x;
            let newY = resizeStartPatchPos.y;

            // Calculate new size based on handle, maintaining aspect ratio
            switch (handle) {
                case 'se':
                    newWidth = Math.max(20, resizeStartSize.width + dx);
                    newHeight = newWidth / aspectRatio;
                    break;
                case 'sw':
                    newWidth = Math.max(20, resizeStartSize.width - dx);
                    newHeight = newWidth / aspectRatio;
                    newX = resizeStartPatchPos.x + (resizeStartSize.width - newWidth);
                    break;
                case 'ne':
                    newWidth = Math.max(20, resizeStartSize.width + dx);
                    newHeight = newWidth / aspectRatio;
                    newY = resizeStartPatchPos.y + (resizeStartSize.height - newHeight);
                    break;
                case 'nw':
                    newWidth = Math.max(20, resizeStartSize.width - dx);
                    newHeight = newWidth / aspectRatio;
                    newX = resizeStartPatchPos.x + (resizeStartSize.width - newWidth);
                    newY = resizeStartPatchPos.y + (resizeStartSize.height - newHeight);
                    break;
            }

            patch.width = newWidth;
            patch.height = newHeight;
            patch.x = newX;
            patch.y = newY;

            element.style.width = `${newWidth}px`;
            element.style.height = `${newHeight}px`;
            element.style.left = `${newX}px`;
            element.style.top = `${newY}px`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            isResizing = false;
            resizeHandle = null;

            // Add to history if size changed
            if (patch.width !== resizeStartSize.width || patch.height !== resizeStartSize.height) {
                core.addToHistory({
                    type: 'patchResize',
                    patchId: patchId,
                    previousSize: {
                        width: resizeStartSize.width,
                        height: resizeStartSize.height,
                        x: resizeStartPatchPos.x,
                        y: resizeStartPatchPos.y
                    }
                });
                core.emit('patches:changed', { patches });
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    /**
     * Delete a patch
     */
    function deletePatch(patchId) {
        const index = patches.findIndex(p => p.id === patchId);
        if (index === -1) return;

        const patch = patches[index];
        patches.splice(index, 1);

        // Remove from DOM
        const element = document.getElementById(patchId);
        if (element) {
            element.remove();
        }

        // Add to history
        core.addToHistory({
            type: 'patchDelete',
            data: patch
        });

        if (selectedPatchId === patchId) {
            selectedPatchId = null;
        }

        ui.showNotification('Patch deleted', 'success');
        core.emit('patches:changed', { patches });
    }

    /**
     * Copy selected patch to clipboard
     */
    function copyPatch(patchId) {
        const patch = patches.find(p => p.id === patchId);
        if (patch) {
            clipboardPatch = {
                imageData: patch.imageData,
                width: patch.width,
                height: patch.height,
                opacity: patch.opacity,
                x: patch.x,
                y: patch.y
            };
            ui.showNotification('Patch copied', 'success');
        }
    }

    /**
     * Paste patch from clipboard
     */
    function pastePatch() {
        if (!clipboardPatch) {
            ui.showNotification('Nothing to paste', 'info');
            return;
        }

        const currentPage = core.get('currentPage');
        const offset = 20;

        const patch = {
            id: generateId(),
            imageData: clipboardPatch.imageData,
            sourceX: 0,
            sourceY: 0,
            width: clipboardPatch.width,
            height: clipboardPatch.height,
            x: clipboardPatch.x + offset,
            y: clipboardPatch.y + offset,
            opacity: clipboardPatch.opacity,
            page: currentPage,
            timestamp: Date.now()
        };

        patches.push(patch);
        renderPatch(patch);

        // Add to history
        core.addToHistory({
            type: 'patch',
            data: patch
        });

        // Update clipboard position for cascade
        clipboardPatch.x = patch.x;
        clipboardPatch.y = patch.y;

        // Select the new patch
        selectPatch(patch.id);

        ui.showNotification('Patch pasted', 'success');
        core.emit('patches:changed', { patches });
    }

    /**
     * Update patch opacity
     */
    function updatePatchOpacity(patchId, opacity) {
        const patch = patches.find(p => p.id === patchId);
        if (!patch) return;

        const previousOpacity = patch.opacity;
        patch.opacity = opacity;

        const element = document.getElementById(patchId);
        if (element) {
            const img = element.querySelector('img');
            if (img) {
                img.style.opacity = opacity;
            }
        }

        core.addToHistory({
            type: 'patchOpacity',
            patchId: patchId,
            previousOpacity: previousOpacity
        });
    }

    /**
     * Render all patches for current page
     */
    function renderAllPatches() {
        const currentPage = core.get('currentPage');

        // Remove existing patch elements
        document.querySelectorAll('.patch-element').forEach(el => el.remove());

        // Render patches for current page
        patches.filter(p => p.page === currentPage).forEach(renderPatch);
    }

    /**
     * Get all patches
     */
    function getPatches() {
        return patches;
    }

    /**
     * Get patches for current page
     */
    function getPatchesForCurrentPage() {
        const currentPage = core.get('currentPage');
        return patches.filter(p => p.page === currentPage);
    }

    return {
        /**
         * Initialize patch module
         */
        init() {
            // Listen for page changes
            core.on('page:rendered', renderAllPatches);

            // Listen for tool changes
            core.on('currentTool:changed', ({ value }) => {
                if (value !== 'patch') {
                    removeSelectionPreview();
                }
            });

            // Add mouse event handlers to annotation canvas
            const canvas = document.getElementById('annotationCanvas');
            if (canvas) {
                canvas.addEventListener('mousedown', startSelection);
                canvas.addEventListener('mousemove', updateSelection);
                canvas.addEventListener('mouseup', endSelection);
            }

            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                // Don't handle if typing in input
                if (document.activeElement.tagName === 'INPUT' ||
                    document.activeElement.tagName === 'TEXTAREA' ||
                    document.activeElement.isContentEditable) {
                    return;
                }

                // Don't trigger if popup is open
                if (document.getElementById('patchOptionsPopup')) {
                    return;
                }

                // Ctrl+C - Copy selected patch
                if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedPatchId) {
                    e.preventDefault();
                    copyPatch(selectedPatchId);
                    return;
                }

                // Ctrl+V - Paste patch
                if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboardPatch) {
                    e.preventDefault();
                    pastePatch();
                    return;
                }

                // Delete or Backspace - Delete selected patch
                if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPatchId) {
                    e.preventDefault();
                    deletePatch(selectedPatchId);
                }
            });

            // Click outside to deselect
            document.addEventListener('mousedown', (e) => {
                if (!e.target.closest('.patch-element') &&
                    !e.target.closest('.patch-options-popup') &&
                    selectedPatchId) {
                    deselectPatch();
                }
            });
        },

        // Public API
        selectPatch,
        deselectPatch,
        deletePatch,
        copyPatch,
        pastePatch,
        getPatches,
        getPatchesForCurrentPage,
        renderAllPatches,
        closePatchPopup,

        /**
         * Get selected patch ID
         */
        getSelectedPatchId() {
            return selectedPatchId;
        },

        /**
         * Restore a patch (for redo)
         */
        restore(patch) {
            patches.push(patch);
            if (patch.page === core.get('currentPage')) {
                renderPatch(patch);
            }
            core.emit('patches:changed', { patches });
        },

        /**
         * Remove patch without history (for undo)
         */
        removeWithoutHistory(patchId) {
            const index = patches.findIndex(p => p.id === patchId);
            if (index !== -1) {
                patches.splice(index, 1);
                const element = document.getElementById(patchId);
                if (element) element.remove();
                core.emit('patches:changed', { patches });
            }
        },

        /**
         * Update patch position (for undo)
         */
        updatePosition(patchId, position) {
            const patch = patches.find(p => p.id === patchId);
            if (patch) {
                patch.x = position.x;
                patch.y = position.y;
                renderPatch(patch);
                if (selectedPatchId === patchId) {
                    selectPatch(patchId);
                }
            }
        },

        /**
         * Update patch size (for undo)
         */
        updateSize(patchId, size) {
            const patch = patches.find(p => p.id === patchId);
            if (patch) {
                patch.width = size.width;
                patch.height = size.height;
                patch.x = size.x;
                patch.y = size.y;
                renderPatch(patch);
                if (selectedPatchId === patchId) {
                    selectPatch(patchId);
                }
            }
        },

        /**
         * Update patch opacity (for undo) - without adding to history
         */
        setOpacity(patchId, opacity) {
            const patch = patches.find(p => p.id === patchId);
            if (patch) {
                patch.opacity = opacity;
                const element = document.getElementById(patchId);
                if (element) {
                    const img = element.querySelector('img');
                    if (img) img.style.opacity = opacity;
                }
            }
        }
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxPatch;
}
