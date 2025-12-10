/**
 * PDFOX Stamps Module
 * Quick stamps for fast form filling (checkmarks, X marks, dates, etc.)
 */

const PDFoxStamps = (function() {
    'use strict';

    const core = PDFoxCore;
    const ui = PDFoxUI;

    // Current active stamp type
    let activeStamp = null;
    let stamps = [];
    let selectedStampId = null;
    let pendingStampPosition = null;

    // Resize state
    let isResizing = false;
    let resizeHandle = null;
    let resizeStartPos = null;
    let resizeStartSize = null;

    // Clipboard for copy/paste
    let clipboardStamp = null;

    // Track mouse position for paste functionality
    let lastMousePosition = { x: null, y: null };

    // Default stamp settings
    const defaultSettings = {
        check: { color: '#000000', size: 24 },
        x: { color: '#000000', size: 24 },
        circle: { color: '#000000', size: 24 },
        dot: { color: '#000000', size: 24 },
        date: { color: '#000000', size: 14 },
        na: { color: '#000000', size: 14 }
    };

    // Current stamp settings (can be modified via popup)
    let currentSettings = JSON.parse(JSON.stringify(defaultSettings));

    // Stamp definitions with SVG content generators
    const stampDefinitions = {
        check: {
            name: 'Checkmark',
            getSvg: (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`
        },
        x: {
            name: 'X Mark',
            getSvg: (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
            </svg>`
        },
        circle: {
            name: 'Circle',
            getSvg: (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="${color}" stroke-width="2.5" fill="none"/>
            </svg>`
        },
        dot: {
            name: 'Filled Dot',
            getSvg: (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="8" fill="${color}"/>
            </svg>`
        },
        date: {
            name: 'Date',
            getText: () => {
                const now = new Date();
                return now.toLocaleDateString('en-US', {
                    month: '2-digit',
                    day: '2-digit',
                    year: 'numeric'
                });
            }
        },
        na: {
            name: 'N/A',
            text: 'N/A'
        }
    };

    /**
     * Generate unique ID for stamp
     */
    function generateId() {
        return 'stamp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Set active stamp type and show options popup on click
     * @param {string} stampType - Type of stamp (check, x, circle, dot, date, na)
     */
    function setStamp(stampType) {
        if (!stampDefinitions[stampType]) {
            ui.showNotification('Invalid stamp type', 'error');
            return;
        }

        // Toggle off if clicking same stamp
        if (activeStamp === stampType) {
            clearStamp();
            return;
        }

        activeStamp = stampType;

        // Update UI - remove active class from all stamp buttons
        document.querySelectorAll('[data-stamp]').forEach(btn => {
            btn.classList.remove('active');
        });

        // Add active class to selected stamp button
        const activeBtn = document.querySelector(`[data-stamp="${stampType}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        // Set cursor on canvas
        const canvas = document.getElementById('annotationCanvas');
        if (canvas) {
            canvas.classList.add('cursor-stamp');
            canvas.style.pointerEvents = 'auto';
        }

        // Set tool state
        core.set('currentTool', 'stamp');

        ui.showNotification(`${stampDefinitions[stampType].name} - click on document to place`, 'info');
    }

    /**
     * Clear active stamp
     */
    function clearStamp() {
        activeStamp = null;

        // Remove active class from all stamp buttons
        document.querySelectorAll('[data-stamp]').forEach(btn => {
            btn.classList.remove('active');
        });

        // Remove cursor class
        const canvas = document.getElementById('annotationCanvas');
        if (canvas) {
            canvas.classList.remove('cursor-stamp');
        }

        // Close popup if open
        closeStampPopup();
    }

    /**
     * Show stamp options popup
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    function showStampPopup(x, y) {
        // Store pending position
        pendingStampPosition = { x, y };

        // Close existing popup
        closeStampPopup();

        const definition = stampDefinitions[activeStamp];
        const settings = currentSettings[activeStamp];
        const isTextStamp = activeStamp === 'date' || activeStamp === 'na';

        // Create popup
        const popup = document.createElement('div');
        popup.id = 'stampOptionsPopup';
        popup.className = 'stamp-options-popup';

        // Position popup near click but ensure it stays on screen
        const overlayLayer = document.getElementById('overlayLayer');
        const rect = overlayLayer.getBoundingClientRect();
        let popupX = x + rect.left + 20;
        let popupY = y + rect.top - 50;

        // Adjust if off-screen
        if (popupX + 280 > window.innerWidth) {
            popupX = x + rect.left - 300;
        }
        if (popupY + 200 > window.innerHeight) {
            popupY = window.innerHeight - 220;
        }
        if (popupY < 10) popupY = 10;

        popup.style.left = `${popupX}px`;
        popup.style.top = `${popupY}px`;

        // Store stamp info on popup element so it survives state changes
        popup.dataset.stampType = activeStamp;
        popup.dataset.stampX = x;
        popup.dataset.stampY = y;

        // Preview content
        let previewContent = '';
        if (isTextStamp) {
            const text = activeStamp === 'date' ? definition.getText() : definition.text;
            previewContent = `<span class="stamp-preview-text" style="color: ${settings.color}; font-size: ${settings.size}px;">${text}</span>`;
        } else {
            previewContent = definition.getSvg(settings.color, settings.size);
        }

        popup.innerHTML = `
            <div class="stamp-popup-header">
                <span class="stamp-popup-title">${definition.name}</span>
                <button class="stamp-popup-close" onclick="PDFoxStamps.closeStampPopup()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
            <div class="stamp-popup-preview">
                ${previewContent}
            </div>
            <div class="stamp-popup-options">
                <div class="stamp-option-row">
                    <label>Color</label>
                    <input type="color" id="stampColorPicker" value="${settings.color}">
                </div>
                <div class="stamp-option-row">
                    <label>Size</label>
                    <input type="range" id="stampSizeSlider" min="12" max="64" value="${settings.size}">
                    <span id="stampSizeValue">${settings.size}px</span>
                </div>
            </div>
            <div class="stamp-popup-actions">
                <button class="modal-btn modal-btn-secondary" id="stampCancelBtn">Cancel</button>
                <button class="modal-btn modal-btn-primary" id="stampPlaceBtn">Place Stamp</button>
            </div>
        `;

        document.body.appendChild(popup);

        // Add event listeners for buttons - use mousedown to ensure we catch the event
        const cancelBtn = popup.querySelector('#stampCancelBtn');
        const placeBtn = popup.querySelector('#stampPlaceBtn');

        cancelBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeStampPopup();
        });

        placeBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Read values from popup dataset (survives state changes)
            const popupEl = document.getElementById('stampOptionsPopup');
            if (!popupEl) {
                console.error('Stamp placement failed: popup not found');
                return;
            }

            const stampType = popupEl.dataset.stampType;
            const x = parseFloat(popupEl.dataset.stampX);
            const y = parseFloat(popupEl.dataset.stampY);

            if (!stampType || isNaN(x) || isNaN(y)) {
                console.error('Stamp placement failed: missing data', { stampType, x, y });
                return;
            }

            // Close popup
            popupEl.remove();
            document.removeEventListener('click', handlePopupOutsideClick);
            pendingStampPosition = null;

            // Place the stamp
            placeStampWithType(x, y, stampType);
        });

        // Add event listeners for live preview
        const colorPicker = popup.querySelector('#stampColorPicker');
        const sizeSlider = popup.querySelector('#stampSizeSlider');
        const sizeValue = popup.querySelector('#stampSizeValue');

        colorPicker.addEventListener('input', (e) => {
            currentSettings[activeStamp].color = e.target.value;
            updatePopupPreview();
        });

        sizeSlider.addEventListener('input', (e) => {
            currentSettings[activeStamp].size = parseInt(e.target.value);
            sizeValue.textContent = `${e.target.value}px`;
            updatePopupPreview();
        });

        // Click outside to close
        setTimeout(() => {
            document.addEventListener('click', handlePopupOutsideClick);
        }, 100);
    }

    /**
     * Update popup preview
     */
    function updatePopupPreview() {
        const popup = document.getElementById('stampOptionsPopup');
        if (!popup) return;

        const previewContainer = popup.querySelector('.stamp-popup-preview');
        const definition = stampDefinitions[activeStamp];
        const settings = currentSettings[activeStamp];
        const isTextStamp = activeStamp === 'date' || activeStamp === 'na';

        if (isTextStamp) {
            const text = activeStamp === 'date' ? definition.getText() : definition.text;
            previewContainer.innerHTML = `<span class="stamp-preview-text" style="color: ${settings.color}; font-size: ${settings.size}px;">${text}</span>`;
        } else {
            previewContainer.innerHTML = definition.getSvg(settings.color, settings.size);
        }
    }

    /**
     * Handle click outside popup
     */
    function handlePopupOutsideClick(e) {
        const popup = document.getElementById('stampOptionsPopup');
        if (popup && !popup.contains(e.target) && !e.target.closest('[data-stamp]')) {
            closeStampPopup();
        }
    }

    /**
     * Close stamp options popup
     */
    function closeStampPopup() {
        const popup = document.getElementById('stampOptionsPopup');
        if (popup) {
            popup.remove();
        }
        document.removeEventListener('click', handlePopupOutsideClick);
        pendingStampPosition = null;
    }

    /**
     * Confirm and place stamp from popup
     */
    function confirmStamp() {
        if (!pendingStampPosition || !activeStamp) return;

        // Store values before they get cleared
        const stampType = activeStamp;
        const position = { ...pendingStampPosition };

        // Close popup first (this clears pendingStampPosition)
        closeStampPopup();

        // Place the stamp with stored values
        placeStampWithType(position.x, position.y, stampType);
    }

    /**
     * Place stamp at position with explicit type
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {string} stampType - Type of stamp to place
     */
    function placeStampWithType(x, y, stampType) {
        const definition = stampDefinitions[stampType];
        if (!definition) return;

        const settings = currentSettings[stampType];
        const currentPage = core.get('currentPage');

        const stamp = {
            id: generateId(),
            type: stampType,
            x: x,
            y: y,
            color: settings.color,
            size: settings.size,
            page: currentPage,
            timestamp: Date.now()
        };

        // For date stamps, store the actual text
        if (stampType === 'date') {
            stamp.text = definition.getText();
        }

        stamps.push(stamp);
        renderStamp(stamp);

        // Add to history for undo
        core.addToHistory({
            type: 'stamp',
            data: stamp
        });

        ui.showNotification(`${definition.name} placed`, 'success');

        // Emit event for layers panel
        core.emit('stamps:changed', { stamps });

        // Select the new stamp and switch to move mode
        selectStamp(stamp.id);
        if (typeof PDFoxApp !== 'undefined') {
            PDFoxApp.setTool('moveText');
        }
    }

    /**
     * Place stamp at position (uses active stamp type)
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    function placeStamp(x, y) {
        if (!activeStamp) return;
        placeStampWithType(x, y, activeStamp);
    }

    /**
     * Render stamp element on the overlay layer
     * @param {Object} stamp - Stamp data
     */
    function renderStamp(stamp) {
        const overlayLayer = document.getElementById('overlayLayer');
        if (!overlayLayer) return;

        const definition = stampDefinitions[stamp.type];
        if (!definition) return;

        // Remove existing element if re-rendering
        const existing = document.getElementById(stamp.id);
        if (existing) existing.remove();

        // Create stamp element
        const element = document.createElement('div');
        element.id = stamp.id;
        element.className = `stamp-element stamp-${stamp.type}`;
        element.dataset.stampId = stamp.id;
        element.dataset.page = stamp.page;

        // Position the stamp (center it on click position)
        const size = stamp.size || currentSettings[stamp.type].size;
        const color = stamp.color || currentSettings[stamp.type].color;

        element.style.left = `${stamp.x - size / 2}px`;
        element.style.top = `${stamp.y - size / 2}px`;
        element.style.width = `${size}px`;
        element.style.height = `${size}px`;

        // Create content based on stamp type
        const isTextStamp = stamp.type === 'date' || stamp.type === 'na';

        if (isTextStamp) {
            const text = stamp.text || (stamp.type === 'date' ? definition.getText() : definition.text);
            element.innerHTML = `<span class="stamp-content stamp-text" style="color: ${color}; font-size: ${size}px;">${text}</span>`;
            element.style.width = 'auto';
            element.style.height = 'auto';
        } else {
            element.innerHTML = `<span class="stamp-content">${definition.getSvg(color, size)}</span>`;
        }

        // Add resize handles
        element.innerHTML += `
            <div class="stamp-resize-handle nw" data-handle="nw"></div>
            <div class="stamp-resize-handle ne" data-handle="ne"></div>
            <div class="stamp-resize-handle sw" data-handle="sw"></div>
            <div class="stamp-resize-handle se" data-handle="se"></div>
        `;

        // Add event handlers
        element.addEventListener('mousedown', (e) => {
            // Ignore right-clicks - let context menu handle them
            if (e.button === 2) return;

            if (e.target.classList.contains('stamp-resize-handle')) {
                e.stopPropagation();
                startResize(e, stamp.id, e.target.dataset.handle);
            } else {
                e.stopPropagation();
                selectStamp(stamp.id);
                startDrag(e, stamp.id);
            }
        });

        overlayLayer.appendChild(element);
    }

    /**
     * Select a stamp
     * @param {string} stampId - Stamp ID
     */
    function selectStamp(stampId) {
        // Deselect previous
        document.querySelectorAll('.stamp-element.selected').forEach(el => {
            el.classList.remove('selected');
        });

        selectedStampId = stampId;

        const element = document.getElementById(stampId);
        if (element) {
            element.classList.add('selected');
        }
    }

    /**
     * Deselect current stamp
     */
    function deselectStamp() {
        document.querySelectorAll('.stamp-element.selected').forEach(el => {
            el.classList.remove('selected');
        });
        selectedStampId = null;
    }

    /**
     * Start dragging a stamp
     * @param {MouseEvent} e - Mouse event
     * @param {string} stampId - Stamp ID
     */
    function startDrag(e, stampId) {
        const element = document.getElementById(stampId);
        if (!element) return;

        const stamp = stamps.find(s => s.id === stampId);
        if (!stamp) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = parseInt(element.style.left);
        const startTop = parseInt(element.style.top);
        const originalX = stamp.x;
        const originalY = stamp.y;

        element.style.cursor = 'grabbing';

        function onMouseMove(e) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            element.style.left = `${startLeft + dx}px`;
            element.style.top = `${startTop + dy}px`;
            stamp.x = originalX + dx;
            stamp.y = originalY + dy;
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            element.style.cursor = '';

            // Add to history if position changed
            if (stamp.x !== originalX || stamp.y !== originalY) {
                core.addToHistory({
                    type: 'stampMove',
                    stampId: stampId,
                    previousPosition: { x: originalX, y: originalY }
                });
            }
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    /**
     * Start resizing a stamp
     * @param {MouseEvent} e - Mouse event
     * @param {string} stampId - Stamp ID
     * @param {string} handle - Resize handle name (nw, ne, sw, se)
     */
    function startResize(e, stampId, handle) {
        const element = document.getElementById(stampId);
        if (!element) return;

        const stamp = stamps.find(s => s.id === stampId);
        if (!stamp) return;

        isResizing = true;
        resizeHandle = handle;
        resizeStartPos = { x: e.clientX, y: e.clientY };
        resizeStartSize = stamp.size;

        const originalSize = stamp.size;

        function onMouseMove(e) {
            const dx = e.clientX - resizeStartPos.x;
            const dy = e.clientY - resizeStartPos.y;

            // Calculate new size based on handle
            let delta = 0;
            if (handle === 'se') delta = Math.max(dx, dy);
            else if (handle === 'nw') delta = -Math.min(dx, dy);
            else if (handle === 'ne') delta = Math.max(-dy, dx);
            else if (handle === 'sw') delta = Math.max(dy, -dx);

            const newSize = Math.max(12, Math.min(96, resizeStartSize + delta));
            stamp.size = newSize;

            // Re-render the stamp
            renderStamp(stamp);
            selectStamp(stampId);
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            isResizing = false;
            resizeHandle = null;

            // Add to history if size changed
            if (stamp.size !== originalSize) {
                core.addToHistory({
                    type: 'stampResize',
                    stampId: stampId,
                    previousSize: originalSize
                });
                core.emit('stamps:changed', { stamps });
            }
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    /**
     * Delete a stamp by ID
     * @param {string} stampId - Stamp ID
     */
    function deleteStamp(stampId) {
        const index = stamps.findIndex(s => s.id === stampId);
        if (index === -1) return;

        const stamp = stamps[index];
        stamps.splice(index, 1);

        // Remove from DOM
        const element = document.getElementById(stampId);
        if (element) {
            element.remove();
        }

        // Add to history
        core.addToHistory({
            type: 'stampDelete',
            data: stamp
        });

        if (selectedStampId === stampId) {
            selectedStampId = null;
        }

        ui.showNotification('Stamp deleted', 'success');
        core.emit('stamps:changed', { stamps });
    }

    /**
     * Copy selected stamp to clipboard
     * @param {string} stampId - Stamp ID to copy
     */
    function copyStamp(stampId) {
        const stamp = stamps.find(s => s.id === stampId);
        if (stamp) {
            // Store a copy of the stamp data (without id, but with position)
            clipboardStamp = {
                type: stamp.type,
                color: stamp.color,
                size: stamp.size,
                text: stamp.text, // For date stamps
                x: stamp.x,
                y: stamp.y
            };
            ui.showNotification('Stamp copied', 'success');
        }
    }

    /**
     * Paste stamp from clipboard
     */
    function pasteStamp() {
        if (!clipboardStamp) {
            ui.showNotification('Nothing to paste', 'info');
            return;
        }

        const currentPage = core.get('currentPage');
        const scale = core.get('scale') || 1.0;

        // Determine paste position
        let pasteX, pasteY;

        if (lastMousePosition.x !== null && lastMousePosition.y !== null) {
            // Use tracked mouse position (stamps use center-based coords)
            pasteX = lastMousePosition.x / scale;
            pasteY = lastMousePosition.y / scale;
        } else {
            // Fallback: offset from original position
            const offset = 20;
            pasteX = clipboardStamp.x + offset;
            pasteY = clipboardStamp.y + offset;
        }

        // Create new stamp at paste position
        const stamp = {
            id: generateId(),
            type: clipboardStamp.type,
            x: pasteX,
            y: pasteY,
            color: clipboardStamp.color,
            size: clipboardStamp.size,
            page: currentPage,
            timestamp: Date.now()
        };

        // Copy text for date stamps
        if (clipboardStamp.text) {
            stamp.text = clipboardStamp.text;
        }

        stamps.push(stamp);
        renderStamp(stamp);

        // Add to history
        core.addToHistory({
            type: 'stamp',
            data: stamp
        });

        // Update clipboard position for next paste (cascade effect) if not using mouse
        if (lastMousePosition.x === null) {
            clipboardStamp.x = stamp.x;
            clipboardStamp.y = stamp.y;
        }

        // Select the new stamp
        selectStamp(stamp.id);

        ui.showNotification('Stamp pasted', 'success');
        core.emit('stamps:changed', { stamps });
    }

    /**
     * Update last mouse position for paste functionality
     */
    function updateMousePosition(x, y) {
        lastMousePosition = { x, y };
    }

    /**
     * Duplicate a stamp (create a copy next to the original)
     * @param {string} stampId - Stamp ID to duplicate
     */
    function duplicateStamp(stampId) {
        const stamp = stamps.find(s => s.id === stampId);
        if (!stamp) {
            ui.showNotification('Stamp not found', 'warning');
            return;
        }

        const offset = 20; // Offset from original position

        // Create new stamp with offset position
        const newStamp = {
            id: generateId(),
            type: stamp.type,
            x: stamp.x + offset,
            y: stamp.y + offset,
            color: stamp.color,
            size: stamp.size,
            page: stamp.page,
            timestamp: Date.now()
        };

        // Copy text for text stamps
        if (stamp.text) {
            newStamp.text = stamp.text;
        }

        stamps.push(newStamp);
        renderStamp(newStamp);

        // Add to history
        core.addToHistory({
            type: 'stamp',
            data: newStamp
        });

        // Select the new stamp
        selectStamp(newStamp.id);

        ui.showNotification('Stamp duplicated', 'success');
        core.emit('stamps:changed', { stamps });
    }

    /**
     * Render all stamps for current page
     */
    function renderAllStamps() {
        const currentPage = core.get('currentPage');

        // Remove existing stamp elements
        document.querySelectorAll('.stamp-element').forEach(el => el.remove());

        // Render stamps for current page
        stamps.filter(s => s.page === currentPage).forEach(renderStamp);
    }

    /**
     * Handle canvas click for stamp placement
     * @param {MouseEvent} e - Mouse event
     */
    function handleCanvasClick(e) {
        if (!activeStamp) return;
        if (core.get('currentTool') !== 'stamp') return;

        const canvas = document.getElementById('annotationCanvas');
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Show options popup
        showStampPopup(x, y);
    }

    /**
     * Get all stamps
     * @returns {Array} All stamps
     */
    function getStamps() {
        return stamps;
    }

    /**
     * Get stamps for current page
     * @returns {Array} Stamps on current page
     */
    function getStampsForCurrentPage() {
        const currentPage = core.get('currentPage');
        return stamps.filter(s => s.page === currentPage);
    }

    return {
        /**
         * Initialize stamps module
         */
        init() {
            // Listen for page changes to re-render stamps
            core.on('page:rendered', renderAllStamps);

            // Listen for tool changes
            core.on('currentTool:changed', ({ value }) => {
                if (value !== 'stamp') {
                    clearStamp();
                }
            });

            // Add click handler to annotation canvas
            const canvas = document.getElementById('annotationCanvas');
            if (canvas) {
                canvas.addEventListener('click', handleCanvasClick);

                // Track mouse position for paste functionality
                canvas.addEventListener('mousemove', (e) => {
                    const rect = canvas.getBoundingClientRect();
                    updateMousePosition(e.clientX - rect.left, e.clientY - rect.top);
                });
            }

            // Also track mouse on overlay layer
            const overlayLayer = document.getElementById('overlayLayer');
            if (overlayLayer) {
                overlayLayer.addEventListener('mousemove', (e) => {
                    const rect = overlayLayer.getBoundingClientRect();
                    updateMousePosition(e.clientX - rect.left, e.clientY - rect.top);
                });
            }

            // Handle keyboard shortcuts for stamps
            document.addEventListener('keydown', (e) => {
                // Don't handle if user is typing in an input
                if (document.activeElement.tagName === 'INPUT' ||
                    document.activeElement.tagName === 'TEXTAREA' ||
                    document.activeElement.isContentEditable) {
                    return;
                }

                // Don't trigger if a modal is open
                if (document.querySelector('.custom-modal[style*="flex"]') ||
                    document.getElementById('stampOptionsPopup')) {
                    return;
                }

                // Ctrl+C - Copy selected stamp
                if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedStampId) {
                    e.preventDefault();
                    copyStamp(selectedStampId);
                    return;
                }

                // Ctrl+V - Paste stamp
                if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboardStamp) {
                    e.preventDefault();
                    pasteStamp();
                    return;
                }

                // Delete or Backspace - Delete selected stamp
                if ((e.key === 'Delete' || e.key === 'Backspace') && selectedStampId) {
                    e.preventDefault();
                    deleteStamp(selectedStampId);
                }
            });

            // Click outside to deselect
            document.addEventListener('mousedown', (e) => {
                if (!e.target.closest('.stamp-element') &&
                    !e.target.closest('.stamp-options-popup') &&
                    !e.target.closest('[data-stamp]') &&
                    selectedStampId) {
                    deselectStamp();
                }
            });
        },

        // Public API
        setStamp,
        clearStamp,
        placeStamp,
        selectStamp,
        deselectStamp,
        deleteStamp,
        copyStamp,
        pasteStamp,
        duplicateStamp,
        getStamps,
        getStampsForCurrentPage,
        renderAllStamps,
        closeStampPopup,
        confirmStamp,

        /**
         * Get active stamp type
         * @returns {string|null}
         */
        getActiveStamp() {
            return activeStamp;
        },

        /**
         * Get selected stamp ID
         * @returns {string|null}
         */
        getSelectedStampId() {
            return selectedStampId;
        },

        /**
         * Restore a stamp (for redo)
         * @param {Object} stamp - Stamp data
         */
        restoreStamp(stamp) {
            stamps.push(stamp);
            if (stamp.page === core.get('currentPage')) {
                renderStamp(stamp);
            }
            core.emit('stamps:changed', { stamps });
        },

        /**
         * Remove stamp without history (for undo)
         * @param {string} stampId - Stamp ID
         */
        removeStampWithoutHistory(stampId) {
            const index = stamps.findIndex(s => s.id === stampId);
            if (index !== -1) {
                stamps.splice(index, 1);
                const element = document.getElementById(stampId);
                if (element) element.remove();
                core.emit('stamps:changed', { stamps });
            }
        },

        /**
         * Update stamp position (for undo)
         * @param {string} stampId - Stamp ID
         * @param {Object} position - Position {x, y}
         */
        updateStampPosition(stampId, position) {
            const stamp = stamps.find(s => s.id === stampId);
            if (stamp) {
                stamp.x = position.x;
                stamp.y = position.y;
                renderStamp(stamp);
                if (selectedStampId === stampId) {
                    selectStamp(stampId);
                }
            }
        },

        /**
         * Update stamp size (for undo)
         * @param {string} stampId - Stamp ID
         * @param {number} size - Size value
         */
        updateStampSize(stampId, size) {
            const stamp = stamps.find(s => s.id === stampId);
            if (stamp) {
                stamp.size = size;
                renderStamp(stamp);
                if (selectedStampId === stampId) {
                    selectStamp(stampId);
                }
            }
        }
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxStamps;
}
