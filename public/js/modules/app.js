/**
 * PDFOX Application Module
 * Main application initialization and coordination
 * Single Responsibility: Application bootstrapping and global coordination
 */

const PDFoxApp = (function() {
    'use strict';

    const core = PDFoxCore;
    const ui = PDFoxUI;
    const { hexToRgba } = PDFoxUtils;

    // Module references
    let renderer, textEditor, layers, annotations, signatures, overlays;

    // Default tool - what we return to after actions
    const DEFAULT_TOOL = 'addText';

    // One-shot tools that auto-reset after use
    // Note: 'fill' is not included because it switches to move mode after drawing
    const ONE_SHOT_TOOLS = ['addText', 'ocrSelect'];

    // Persistent tools that stay active until manually changed
    const PERSISTENT_TOOLS = ['editText', 'moveText', 'draw', 'rectangle', 'circle'];

    // Tool-specific cursors for better UX
    const TOOL_CURSORS = {
        editText: 'text',
        addText: 'cell',
        moveText: 'move',
        draw: 'crosshair',
        rectangle: 'crosshair',
        circle: 'crosshair',
        ocrSelect: 'crosshair',
        fill: 'crosshair',
        patch: 'crosshair',
        default: 'default'
    };

    /**
     * Set current tool
     * @param {string} tool - Tool name
     */
    function setTool(tool, force = false) {
        const previousTool = core.get('currentTool');
        const toolButton = document.getElementById(tool + 'Tool');

        if (toolButton && toolButton.disabled) {
            console.log(`Tool "${tool}" is disabled`);
            return;
        }

        // If clicking the same tool, don't do anything (unless forced for initial setup)
        if (previousTool === tool && !force) {
            return;
        }

        core.set('currentTool', tool);

        // Track tool change
        if (typeof EditorAnalytics !== 'undefined' && !force) {
            EditorAnalytics.trackToolUsed(tool, 'Selected');
        }

        // Update button states - clear all first
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.classList.remove('active');
        });

        // Set active state on the new tool button
        if (toolButton) {
            toolButton.classList.add('active');
        }

        // Update cursor and pointer events based on tool type
        const annCanvas = document.getElementById('annotationCanvas');
        const textLayer = document.getElementById('textLayer');
        const pdfViewer = document.querySelector('.pdf-viewer');

        // Set tool-specific cursor
        const cursor = TOOL_CURSORS[tool] || TOOL_CURSORS.default;

        if (tool === 'editText') {
            // Edit text - disable annotation canvas
            if (annCanvas) {
                annCanvas.style.cursor = 'default';
                annCanvas.style.pointerEvents = 'none';
            }
            if (textLayer) {
                textLayer.classList.add('editable');
                textLayer.style.cursor = cursor;
            }
            if (pdfViewer) pdfViewer.style.cursor = cursor;
        } else if (tool === 'moveText') {
            // Move tool - enable both text layer and annotation canvas for moving
            if (annCanvas) {
                annCanvas.style.cursor = 'default';
                annCanvas.style.pointerEvents = 'auto'; // Enable for annotation selection/movement
            }
            if (textLayer) {
                textLayer.classList.add('editable');
                textLayer.style.cursor = cursor;
            }
            if (pdfViewer) pdfViewer.style.cursor = cursor;
        } else {
            if (annCanvas) {
                // Don't set inline cursor for tools with CSS class-based cursors
                // The annotations module handles cursor classes for: draw, rectangle, circle, erase, ocrSelect
                annCanvas.style.cursor = '';
                annCanvas.style.pointerEvents = 'auto';
            }
            if (textLayer) {
                textLayer.classList.remove('editable');
            }
            if (pdfViewer) pdfViewer.style.cursor = cursor;
        }

        // Emit tool change event
        core.emit('tool:changed', { tool, previousTool });

        // Show brief notification for tool change (except for default tool)
        if (tool !== DEFAULT_TOOL) {
            const toolNames = {
                editText: 'Edit Text',
                addText: 'Add Text',
                moveText: 'Move Text',
                draw: 'Draw',
                rectangle: 'Rectangle',
                circle: 'Circle',
                ocrSelect: 'AI Text',
                fill: 'Fill'
            };
            ui.showNotification(`Tool: ${toolNames[tool] || tool}`, 'info');
        }
    }

    /**
     * Reset to default tool
     */
    function resetToDefaultTool() {
        setTool(DEFAULT_TOOL);
    }

    /**
     * Called when a one-shot tool completes its action
     * Automatically resets to the default tool
     */
    function onToolActionComplete() {
        const currentTool = core.get('currentTool');
        if (ONE_SHOT_TOOLS.includes(currentTool)) {
            // Small delay so user sees the result before tool changes
            setTimeout(() => {
                resetToDefaultTool();
            }, 300);
        }
    }

    /**
     * Re-render all restored content after session restore
     */
    function renderRestoredContent() {
        const currentPage = core.get('currentPage');

        // Re-render the page to show text edits
        if (renderer && renderer.renderPage) {
            renderer.renderPage(currentPage);
        }

        // Emit page:rendered to trigger overlays, stamps, patches, etc.
        core.emit('page:rendered', { page: currentPage });

        // Render stamps explicitly if module exists
        if (typeof PDFoxStamps !== 'undefined' && PDFoxStamps.renderAllStamps) {
            PDFoxStamps.renderAllStamps();
        }

        // Render patches explicitly if module exists
        if (typeof PDFoxPatch !== 'undefined' && PDFoxPatch.renderAllPatches) {
            PDFoxPatch.renderAllPatches();
        }

        // Navigate to restored page
        if (currentPage > 1 && renderer && renderer.goToPage) {
            renderer.goToPage(currentPage);
        }

        // Update zoom display
        updateZoomDisplay();
    }

    /**
     * Undo last action
     */
    function undo() {
        const action = core.popHistory();
        if (!action) {
            ui.showAlert('Nothing to undo', 'info');
            return;
        }

        const currentPage = core.get('currentPage');

        // Save action for redo
        core.addToRedoHistory(action);

        switch (action.type) {
            case 'annotation':
                core.remove('annotations', ann => ann === action.data);
                annotations.redraw();
                ui.showNotification('Drawing removed', 'success');
                break;

            case 'signature':
                core.remove('signatures', sig => sig === action.data);
                ui.showNotification('Signature removed', 'success');
                break;

            case 'textEditCreate':
                core.remove('textEdits', edit =>
                    edit.page === action.edit.page && edit.index === action.edit.index
                );
                renderer.renderPage(currentPage);
                ui.showNotification('Text edit removed', 'success');
                break;

            case 'textEditUpdate':
                core.updateAt('textEdits', action.editIndex, action.previousState);
                renderer.renderPage(currentPage);
                ui.showNotification('Text edit reverted', 'success');
                break;

            case 'textMove':
                const textEdits = core.get('textEdits');
                if (textEdits[action.editIndex]) {
                    textEdits[action.editIndex].x = action.previousX;
                    textEdits[action.editIndex].y = action.previousY;
                    renderer.renderPage(currentPage);
                }
                ui.showNotification('Text position restored', 'success');
                break;

            case 'removeArea':
                annotations.restoreRemovedArea(action.data);
                ui.showNotification('Removed area restored', 'success');
                break;

            case 'textOverlay':
                core.remove('textOverlays', o => o.id === action.data.id);
                ui.showNotification('Text overlay removed', 'success');
                break;

            case 'annotationMove':
                // Restore annotation to previous position
                const allAnnotations = core.get('annotations');
                const ann = allAnnotations[action.annotationIndex];
                if (ann && action.previousPosition) {
                    if (ann.type === 'draw' && action.previousPosition.points) {
                        ann.points = action.previousPosition.points;
                    } else {
                        ann.startX = action.previousPosition.startX;
                        ann.startY = action.previousPosition.startY;
                        ann.endX = action.previousPosition.endX;
                        ann.endY = action.previousPosition.endY;
                    }
                    annotations.redraw();
                    ui.showNotification('Annotation position restored', 'success');
                }
                break;

            case 'fillMove':
            case 'fillResize':
                // Restore fill area to previous state
                const removedAreas = annotations.getRemovedAreas();
                if (removedAreas[action.fillIndex] && action.previousState) {
                    removedAreas[action.fillIndex].x = action.previousState.x;
                    removedAreas[action.fillIndex].y = action.previousState.y;
                    removedAreas[action.fillIndex].width = action.previousState.width;
                    removedAreas[action.fillIndex].height = action.previousState.height;
                    annotations.redraw();
                    ui.showNotification('Fill area restored', 'success');
                }
                break;

            case 'fillColorChange':
                // Restore fill area color
                const fillAreas = annotations.getRemovedAreas();
                if (fillAreas[action.fillIndex] && action.previousColor) {
                    fillAreas[action.fillIndex].color = action.previousColor;
                    annotations.redraw();
                    ui.showNotification('Fill color restored', 'success');
                }
                break;

            case 'stamp':
                // Remove stamp (undo placement)
                if (typeof PDFoxStamps !== 'undefined') {
                    PDFoxStamps.removeStampWithoutHistory(action.data.id);
                    ui.showNotification('Stamp removed', 'success');
                }
                break;

            case 'stampMove':
                // Restore stamp position
                if (typeof PDFoxStamps !== 'undefined' && action.previousPosition) {
                    PDFoxStamps.updateStampPosition(action.stampId, action.previousPosition);
                    ui.showNotification('Stamp position restored', 'success');
                }
                break;

            case 'stampResize':
                // Restore stamp size
                if (typeof PDFoxStamps !== 'undefined' && action.previousSize) {
                    PDFoxStamps.updateStampSize(action.stampId, action.previousSize);
                    ui.showNotification('Stamp size restored', 'success');
                }
                break;

            case 'stampDelete':
                // Restore deleted stamp
                if (typeof PDFoxStamps !== 'undefined') {
                    PDFoxStamps.restoreStamp(action.data);
                    ui.showNotification('Stamp restored', 'success');
                }
                break;

            case 'patch':
                // Remove patch (undo placement)
                if (typeof PDFoxPatch !== 'undefined') {
                    PDFoxPatch.removeWithoutHistory(action.data.id);
                    ui.showNotification('Patch removed', 'success');
                }
                break;

            case 'patchMove':
                // Restore patch position
                if (typeof PDFoxPatch !== 'undefined' && action.previousPosition) {
                    PDFoxPatch.updatePosition(action.patchId, action.previousPosition);
                    ui.showNotification('Patch position restored', 'success');
                }
                break;

            case 'patchResize':
                // Restore patch size
                if (typeof PDFoxPatch !== 'undefined' && action.previousSize) {
                    PDFoxPatch.updateSize(action.patchId, action.previousSize);
                    ui.showNotification('Patch size restored', 'success');
                }
                break;

            case 'patchDelete':
                // Restore deleted patch
                if (typeof PDFoxPatch !== 'undefined') {
                    PDFoxPatch.restore(action.data);
                    ui.showNotification('Patch restored', 'success');
                }
                break;

            case 'patchOpacity':
                // Restore patch opacity
                if (typeof PDFoxPatch !== 'undefined' && action.previousOpacity !== undefined) {
                    PDFoxPatch.setOpacity(action.patchId, action.previousOpacity);
                    ui.showNotification('Patch opacity restored', 'success');
                }
                break;
        }
    }

    /**
     * Redo last undone action
     */
    function redo() {
        const action = core.popRedoHistory();
        if (!action) {
            ui.showAlert('Nothing to redo', 'info');
            return;
        }

        const currentPage = core.get('currentPage');

        switch (action.type) {
            case 'annotation':
                core.push('annotations', action.data);
                annotations.redraw();
                core.addToHistory(action);
                ui.showNotification('Drawing restored', 'success');
                break;

            case 'signature':
                core.push('signatures', action.data);
                core.addToHistory(action);
                ui.showNotification('Signature restored', 'success');
                break;

            case 'textEditCreate':
                core.push('textEdits', action.edit);
                renderer.renderPage(currentPage);
                core.addToHistory(action);
                ui.showNotification('Text edit restored', 'success');
                break;

            case 'textEditUpdate':
                const textEditsForUpdate = core.get('textEdits');
                if (textEditsForUpdate[action.editIndex]) {
                    const current = { ...textEditsForUpdate[action.editIndex] };
                    core.updateAt('textEdits', action.editIndex, action.newState || action.edit);
                    action.previousState = current;
                    renderer.renderPage(currentPage);
                    core.addToHistory(action);
                }
                ui.showNotification('Text edit reapplied', 'success');
                break;

            case 'textMove':
                const textEditsForMove = core.get('textEdits');
                if (textEditsForMove[action.editIndex]) {
                    textEditsForMove[action.editIndex].x = action.newX;
                    textEditsForMove[action.editIndex].y = action.newY;
                    renderer.renderPage(currentPage);
                    core.addToHistory(action);
                }
                ui.showNotification('Text position reapplied', 'success');
                break;

            case 'removeArea':
                annotations.addRemovedArea(action.data);
                core.addToHistory(action);
                ui.showNotification('Area redacted again', 'success');
                break;

            case 'textOverlay':
                core.push('textOverlays', action.data);
                core.addToHistory(action);
                ui.showNotification('Text overlay restored', 'success');
                break;

            default:
                ui.showAlert('Cannot redo this action', 'warning');
        }
    }

    /**
     * Duplicate the currently selected layer (text overlay or stamp)
     */
    function duplicateCurrentLayer() {
        // Check for selected text overlay
        const selectedOverlayId = core.get('selectedOverlay');
        if (selectedOverlayId) {
            // Duplicate text overlay
            if (typeof PDFoxOverlays !== 'undefined' && PDFoxOverlays.duplicate) {
                PDFoxOverlays.duplicate(selectedOverlayId);
                return;
            }
        }

        // Check for selected stamp
        if (typeof PDFoxStamps !== 'undefined') {
            const selectedStampId = PDFoxStamps.getSelectedStampId?.();
            if (selectedStampId) {
                PDFoxStamps.duplicateStamp?.(selectedStampId);
                return;
            }
        }

        // Check for selected signature
        const selectedSignatureId = core.get('selectedSignature');
        if (selectedSignatureId) {
            if (typeof PDFoxSignatures !== 'undefined' && PDFoxSignatures.duplicate) {
                PDFoxSignatures.duplicate(selectedSignatureId);
                return;
            }
        }

        // No layer selected
        ui.showNotification('No layer selected. Select a text, stamp, or signature to duplicate.', 'info');
    }

    /**
     * Show upgrade modal for non-Pro users
     */
    function showUpgradeModal() {
        const modal = document.getElementById('upgradeModal');
        if (modal) {
            modal.classList.add('active');
            // Close on click outside
            modal.addEventListener('click', function handleOutsideClick(e) {
                if (e.target === modal) {
                    closeUpgradeModal();
                    modal.removeEventListener('click', handleOutsideClick);
                }
            });
            // Close on Escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    closeUpgradeModal();
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            document.addEventListener('keydown', handleEscape);
        }
    }

    /**
     * Close upgrade modal
     */
    function closeUpgradeModal() {
        const modal = document.getElementById('upgradeModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    /**
     * Navigate to pricing page
     */
    function goToPricing() {
        closeUpgradeModal();
        window.location.href = '/pricing';
    }

    /**
     * Start Pro checkout flow
     */
    async function startProCheckout() {
        // Track "Get Pro Access" option selected
        if (typeof EditorAnalytics !== 'undefined') {
            const fileName = sessionStorage.getItem('pdfFileName') || 'document.pdf';
            EditorAnalytics.send('save_option_selected', {
                fileName: fileName,
                action: 'Get Pro Access'
            });
        }

        const emailInput = document.getElementById('upgradeEmail');
        const errorEl = document.getElementById('upgradeEmailError');
        const ctaBtn = document.getElementById('upgradeCtaBtn');

        // Validate email
        const email = emailInput?.value?.trim();
        if (!email || !email.includes('@') || !email.includes('.')) {
            if (errorEl) {
                errorEl.textContent = 'Please enter a valid email address';
                errorEl.style.display = 'block';
            }
            emailInput?.focus();
            return;
        }

        // Hide error
        if (errorEl) {
            errorEl.style.display = 'none';
        }

        // Disable button and show loading
        if (ctaBtn) {
            ctaBtn.disabled = true;
            ctaBtn.innerHTML = '<span class="spinner-small"></span> Processing...';
        }

        try {
            // Check if PDFoxProAccess is available
            if (typeof PDFoxProAccess === 'undefined') {
                throw new Error('Pro Access module not loaded');
            }

            const result = await PDFoxProAccess.startCheckout(email);

            // If user already has Pro access
            if (result.alreadyPro) {
                closeUpgradeModal();
                core.set('isProUser', true);
                PDFoxProAccess.showProBadge();
                ui.showNotification('You already have Pro access! Saving without watermark...', 'success');
                await _doSavePDF(false);
                return;
            }

            // Checkout redirect happens in startCheckout
        } catch (error) {
            console.error('Checkout error:', error);
            if (errorEl) {
                errorEl.textContent = error.message || 'Failed to start checkout. Please try again.';
                errorEl.style.display = 'block';
            }

            // Re-enable button
            if (ctaBtn) {
                ctaBtn.disabled = false;
                ctaBtn.innerHTML = 'Get Pro Access <span class="upgrade-modal-price">- €8.99/24h</span>';
            }
        }
    }

    /**
     * Save PDF with watermark (for free users who choose to proceed)
     */
    async function saveWithWatermark() {
        // Track "Save for Free" option selected
        if (typeof EditorAnalytics !== 'undefined') {
            const fileName = sessionStorage.getItem('pdfFileName') || 'document.pdf';
            EditorAnalytics.send('save_option_selected', {
                fileName: fileName,
                action: 'Save for Free'
            });
        }

        closeUpgradeModal();
        await _doSavePDF(true); // Force watermark
    }

    /**
     * Show recovery form modal
     */
    function showRecoveryForm() {
        // Track "Restore Access" option selected
        if (typeof EditorAnalytics !== 'undefined') {
            const fileName = sessionStorage.getItem('pdfFileName') || 'document.pdf';
            EditorAnalytics.send('save_option_selected', {
                fileName: fileName,
                action: 'Restore Access'
            });
        }

        closeUpgradeModal();
        const modal = document.getElementById('recoveryModal');
        if (modal) {
            modal.classList.add('active');
            // Clear previous inputs
            const emailInput = document.getElementById('recoveryEmail');
            const receiptInput = document.getElementById('recoveryReceiptNumber');
            const errorEl = document.getElementById('recoveryError');
            if (emailInput) emailInput.value = '';
            if (receiptInput) receiptInput.value = '';
            if (errorEl) errorEl.style.display = 'none';

            // Close on click outside
            modal.addEventListener('click', function handleOutsideClick(e) {
                if (e.target === modal) {
                    closeRecoveryModal();
                    modal.removeEventListener('click', handleOutsideClick);
                }
            });
            // Close on Escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    closeRecoveryModal();
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            document.addEventListener('keydown', handleEscape);
        }
    }

    /**
     * Close recovery modal
     */
    function closeRecoveryModal() {
        const modal = document.getElementById('recoveryModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    /**
     * Recover Pro access using email and receipt number
     */
    async function recoverProAccess() {
        const emailInput = document.getElementById('recoveryEmail');
        const receiptInput = document.getElementById('recoveryReceiptNumber');
        const errorEl = document.getElementById('recoveryError');
        const ctaBtn = document.getElementById('recoveryCtaBtn');

        const email = emailInput?.value?.trim();
        const receiptNumber = receiptInput?.value?.trim();

        // Validate inputs
        if (!email || !email.includes('@')) {
            if (errorEl) {
                errorEl.textContent = 'Please enter a valid email address';
                errorEl.style.display = 'block';
            }
            emailInput?.focus();
            return;
        }

        if (!receiptNumber) {
            if (errorEl) {
                errorEl.textContent = 'Please enter your receipt number from the payment receipt';
                errorEl.style.display = 'block';
            }
            receiptInput?.focus();
            return;
        }

        // Hide error
        if (errorEl) errorEl.style.display = 'none';

        // Disable button and show loading
        if (ctaBtn) {
            ctaBtn.disabled = true;
            ctaBtn.textContent = 'Restoring...';
        }

        try {
            if (typeof PDFoxProAccess === 'undefined') {
                throw new Error('Pro Access module not loaded');
            }

            const result = await PDFoxProAccess.recoverAccess(email, receiptNumber);

            if (result.success) {
                closeRecoveryModal();
                core.set('isProUser', true);
                PDFoxProAccess.showProBadge();
                ui.showNotification('Pro access restored! Saving without watermark...', 'success');
                await _doSavePDF(false);
            }
        } catch (error) {
            console.error('Recovery error:', error);
            if (errorEl) {
                // Check if it's an expiration error with purchase option
                if (error.message && error.message.includes('expired')) {
                    errorEl.innerHTML = `
                        <span style="display: block; margin-bottom: 8px;">${error.message}</span>
                        <button onclick="PDFoxApp.closeRecoveryModal(); PDFoxApp.showUpgradeModal();"
                            style="background: #E50914; color: white; border: none; padding: 8px 16px;
                            border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">
                            Purchase Pro Access
                        </button>
                    `;
                } else {
                    errorEl.textContent = error.message || 'Failed to restore access. Please check your details.';
                }
                errorEl.style.display = 'block';
            }
        } finally {
            // Re-enable button
            if (ctaBtn) {
                ctaBtn.disabled = false;
                ctaBtn.textContent = 'Restore Access';
            }
        }
    }

    /**
     * Public save function - shows upgrade modal for non-Pro users
     */
    async function savePDF() {
        const isProUser = core.get('isProUser') || false;

        if (!isProUser) {
            // Show upgrade modal for free users
            showUpgradeModal();
            return;
        }

        // Track Pro user save
        if (typeof EditorAnalytics !== 'undefined') {
            const fileName = sessionStorage.getItem('pdfFileName') || 'document.pdf';
            EditorAnalytics.send('document_saved', {
                fileName: fileName,
                action: 'Save (Pro User)'
            });
        }

        // Pro users save directly without watermark
        await _doSavePDF(false);
    }

    /**
     * Build PDF with all current edits applied (without downloading)
     * Used for sharing functionality
     * @returns {Promise<Uint8Array|null>} The PDF bytes or null if failed
     */
    async function buildCurrentPDF() {
        // Use _doSavePDF with returnBytes=true and no watermark for sharing
        return await _doSavePDF(false, true);
    }

    /**
     * Internal: Save PDF with all modifications
     * @param {boolean} applyWatermark - Whether to apply watermark
     * @param {boolean} returnBytes - If true, return bytes instead of downloading
     * @returns {Promise<Uint8Array|null>} PDF bytes if returnBytes=true, otherwise undefined
     */
    async function _doSavePDF(applyWatermark = true, returnBytes = false) {
        const pdfBytes = core.get('pdfBytes');

        if (!pdfBytes || pdfBytes.length === 0) {
            if (!returnBytes) {
                ui.showAlert('PDF data not loaded. Please reload the page.', 'error');
            }
            return returnBytes ? null : undefined;
        }

        if (!returnBytes) {
            ui.showLoading('Saving PDF...');
        }

        try {
            // Load PDF with pdf-lib
            const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
            const pages = pdfDoc.getPages();

            // Set PDF metadata to indicate document was prepared with PDFOX
            const currentDate = new Date();
            pdfDoc.setProducer('PDFOX - www.pdfox.cloud');
            pdfDoc.setCreator('PDFOX PDF Editor - www.pdfox.cloud');
            pdfDoc.setModificationDate(currentDate);
            pdfDoc.setKeywords(['Prepared with PDFOX', 'www.pdfox.cloud']);

            // Register fontkit to enable custom font embedding with Unicode support
            if (typeof fontkit !== 'undefined') {
                pdfDoc.registerFontkit(fontkit);
            }

            // Use the actual viewer scale - this is critical for correct positioning
            // All overlay/annotation coordinates are stored in screen pixels at the current scale
            const SCALE_FACTOR = core.get('scale');

            const textEdits = core.get('textEdits');
            const textOverlays = core.get('textOverlays');
            const allAnnotations = core.get('annotations');
            const allSignatures = core.get('signatures');
            const removedAreas = annotations.getRemovedAreas();

            // Cache for embedded fonts to avoid re-embedding the same font
            const fontCache = {};
            let unicodeFontBytes = null;

            /**
             * Get or embed a Unicode-compatible font
             * @param {string} fontFamily - The font family name
             * @returns {Promise<PDFFont>} The embedded font
             */
            async function getUnicodeFont(fontFamily, isBold = false, isItalic = false) {
                const fontLower = (fontFamily || '').toLowerCase();
                let fontType = 'sans'; // Default

                // Determine which font type to use
                if (fontLower.includes('courier') || fontLower.includes('monospace')) {
                    fontType = 'mono';
                } else if (fontLower.includes('times') || fontLower.includes('georgia') || fontLower.includes('serif')) {
                    fontType = 'serif';
                }

                // Build font key with style variant
                let styleVariant = 'Regular';
                if (isBold && isItalic) {
                    styleVariant = 'BoldItalic';
                } else if (isBold) {
                    styleVariant = 'Bold';
                } else if (isItalic) {
                    styleVariant = 'Italic';
                }

                const fontKey = `${fontType}-${styleVariant}`;

                // Return cached font if available
                if (fontCache[fontKey]) {
                    return fontCache[fontKey];
                }

                // Try to load and embed a Unicode font
                // Using CDN URLs for Noto fonts (TTF format for best pdf-lib compatibility)
                // Note: NotoSansMono doesn't have italic/bold-italic, fallback to regular
                const fontUrls = {
                    'sans-Regular': 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf',
                    'sans-Bold': 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/hinted/ttf/NotoSans-Bold.ttf',
                    'sans-Italic': 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/hinted/ttf/NotoSans-Italic.ttf',
                    'sans-BoldItalic': 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/hinted/ttf/NotoSans-BoldItalic.ttf',
                    'serif-Regular': 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSerif/hinted/ttf/NotoSerif-Regular.ttf',
                    'serif-Bold': 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSerif/hinted/ttf/NotoSerif-Bold.ttf',
                    'serif-Italic': 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSerif/hinted/ttf/NotoSerif-Italic.ttf',
                    'serif-BoldItalic': 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSerif/hinted/ttf/NotoSerif-BoldItalic.ttf',
                    'mono-Regular': 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSansMono/hinted/ttf/NotoSansMono-Regular.ttf',
                    'mono-Bold': 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSansMono/hinted/ttf/NotoSansMono-Bold.ttf',
                    'mono-Italic': 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSansMono/hinted/ttf/NotoSansMono-Regular.ttf',
                    'mono-BoldItalic': 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSansMono/hinted/ttf/NotoSansMono-Bold.ttf'
                };

                try {
                    // Check if fontkit is available
                    if (typeof fontkit === 'undefined') {
                        throw new Error('fontkit not available');
                    }

                    const response = await fetch(fontUrls[fontKey]);
                    if (!response.ok) {
                        throw new Error('Font fetch failed');
                    }

                    const fontBytes = await response.arrayBuffer();
                    const font = await pdfDoc.embedFont(fontBytes, { subset: true });
                    fontCache[fontKey] = font;
                    console.log(`Successfully embedded Unicode font: ${fontKey}`);
                    return font;
                } catch (fontError) {
                    console.warn('Failed to load Unicode font:', fontError.message);

                    // Fallback to standard fonts with bold/italic variants
                    const standardFontMap = {
                        'sans-Regular': PDFLib.StandardFonts.Helvetica,
                        'sans-Bold': PDFLib.StandardFonts.HelveticaBold,
                        'sans-Italic': PDFLib.StandardFonts.HelveticaOblique,
                        'sans-BoldItalic': PDFLib.StandardFonts.HelveticaBoldOblique,
                        'serif-Regular': PDFLib.StandardFonts.TimesRoman,
                        'serif-Bold': PDFLib.StandardFonts.TimesRomanBold,
                        'serif-Italic': PDFLib.StandardFonts.TimesRomanItalic,
                        'serif-BoldItalic': PDFLib.StandardFonts.TimesRomanBoldItalic,
                        'mono-Regular': PDFLib.StandardFonts.Courier,
                        'mono-Bold': PDFLib.StandardFonts.CourierBold,
                        'mono-Italic': PDFLib.StandardFonts.CourierOblique,
                        'mono-BoldItalic': PDFLib.StandardFonts.CourierBoldOblique
                    };

                    try {
                        const fallbackFont = await pdfDoc.embedFont(standardFontMap[fontKey] || PDFLib.StandardFonts.Helvetica);
                        fontCache[fontKey] = fallbackFont;
                        return fallbackFont;
                    } catch (embedError) {
                        console.error('Failed to embed standard font:', embedError);
                        // Last resort - return Helvetica
                        const helvetica = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
                        fontCache[fontKey] = helvetica;
                        return helvetica;
                    }
                }
            }

            // Apply text edits
            for (const edit of textEdits) {
                const page = pages[edit.page - 1];
                const { width, height } = page.getSize();

                const actualX = edit.x / SCALE_FACTOR;
                const actualY = edit.y / SCALE_FACTOR;
                const originalX = (edit.originalX !== undefined ? edit.originalX : edit.x) / SCALE_FACTOR;
                const originalY = (edit.originalY !== undefined ? edit.originalY : edit.y) / SCALE_FACTOR;
                const actualFontSize = edit.fontSize / SCALE_FACTOR;
                const actualWidth = (edit.width || (edit.originalText.length * edit.fontSize * 0.5)) / SCALE_FACTOR;
                const actualPadding = (actualFontSize * 0.2) / SCALE_FACTOR;

                const fontAscent = actualFontSize;
                const baselineFromTop = actualY + fontAscent;
                const baselineFromBottom = height - baselineFromTop;

                const originalBaselineFromTop = originalY + fontAscent;
                const originalBaselineFromBottom = height - originalBaselineFromTop;

                const rectY = originalBaselineFromBottom - (actualFontSize * 0.2);
                const rectHeight = actualFontSize * 1.5;

                // Determine background color
                const isTransparent = edit.isTransparent === true;
                let bgR = 1, bgG = 1, bgB = 1, bgOpacity = 1; // Default white

                if (!isTransparent && edit.customBgColor) {
                    // Parse the background color (could be rgba or hex)
                    const bgMatch = edit.customBgColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
                    if (bgMatch) {
                        bgR = parseInt(bgMatch[1]) / 255;
                        bgG = parseInt(bgMatch[2]) / 255;
                        bgB = parseInt(bgMatch[3]) / 255;
                        bgOpacity = bgMatch[4] !== undefined ? parseFloat(bgMatch[4]) : 1;
                    }
                }

                // Cover original text (always needed to hide the original)
                page.drawRectangle({
                    x: originalX - actualPadding,
                    y: rectY,
                    width: actualWidth + (actualPadding * 2),
                    height: rectHeight,
                    color: PDFLib.rgb(1, 1, 1) // Always white to cover original
                });

                // Draw background at new text position if not transparent and text was moved
                const textMoved = Math.abs(actualX - originalX) > 0.1 || Math.abs(actualY - originalY) > 0.1;
                if (!isTransparent && bgOpacity > 0 && (textMoved || (bgR !== 1 || bgG !== 1 || bgB !== 1))) {
                    const newTextRectY = baselineFromBottom - (actualFontSize * 0.2);
                    page.drawRectangle({
                        x: actualX - actualPadding,
                        y: newTextRectY,
                        width: actualWidth + (actualPadding * 2),
                        height: rectHeight,
                        color: PDFLib.rgb(bgR, bgG, bgB),
                        opacity: bgOpacity
                    });
                }

                // Draw new text with Unicode-compatible font (with bold/italic support)
                const rgb = hexToRgb(edit.customColor || '#000000');
                const font = await getUnicodeFont(edit.customFontFamily || 'Arial', edit.isBold, edit.isItalic);
                page.drawText(edit.newText, {
                    x: actualX,
                    y: baselineFromBottom,
                    size: actualFontSize,
                    font: font,
                    color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255)
                });
            }

            // Apply annotations
            for (const ann of allAnnotations) {
                const page = pages[ann.page - 1];
                const { height } = page.getSize();
                const rgb = hexToRgb(ann.color);
                const opacity = (ann.opacity !== undefined ? ann.opacity : 100) / 100;

                // Get dash array based on line style
                let dashArray = undefined;
                if (ann.lineStyle === 'dashed') {
                    dashArray = [ann.size * 3, ann.size * 2];
                } else if (ann.lineStyle === 'dotted') {
                    dashArray = [ann.size, ann.size * 1.5];
                }

                if (ann.type === 'draw' && ann.points && ann.points.length > 1) {
                    for (let i = 0; i < ann.points.length - 1; i++) {
                        const [x1, y1] = ann.points[i];
                        const [x2, y2] = ann.points[i + 1];

                        page.drawLine({
                            start: { x: x1 / SCALE_FACTOR, y: height - (y1 / SCALE_FACTOR) },
                            end: { x: x2 / SCALE_FACTOR, y: height - (y2 / SCALE_FACTOR) },
                            thickness: ann.size / SCALE_FACTOR,
                            color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
                            opacity: opacity,
                            lineCap: PDFLib.LineCapStyle.Round,
                            dashArray: dashArray
                        });
                    }
                } else if (ann.type === 'rectangle') {
                    const w = ann.endX - ann.startX;
                    const h = ann.endY - ann.startY;

                    const rectOptions = {
                        x: ann.startX / SCALE_FACTOR,
                        y: height - (ann.startY / SCALE_FACTOR) - (h / SCALE_FACTOR),
                        width: w / SCALE_FACTOR,
                        height: h / SCALE_FACTOR,
                        borderColor: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
                        borderWidth: ann.size / SCALE_FACTOR,
                        borderOpacity: opacity,
                        borderDashArray: dashArray
                    };

                    // Add fill if enabled
                    if (ann.fillEnabled && ann.fillColor) {
                        const fillRgb = hexToRgb(ann.fillColor);
                        rectOptions.color = PDFLib.rgb(fillRgb.r / 255, fillRgb.g / 255, fillRgb.b / 255);
                        rectOptions.opacity = opacity * 0.3;
                    }

                    page.drawRectangle(rectOptions);
                } else if (ann.type === 'circle') {
                    const radius = Math.sqrt(
                        Math.pow(ann.endX - ann.startX, 2) +
                        Math.pow(ann.endY - ann.startY, 2)
                    );

                    const circleOptions = {
                        x: ann.startX / SCALE_FACTOR,
                        y: height - (ann.startY / SCALE_FACTOR),
                        size: radius / SCALE_FACTOR,
                        borderColor: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
                        borderWidth: ann.size / SCALE_FACTOR,
                        borderOpacity: opacity,
                        borderDashArray: dashArray
                    };

                    // Add fill if enabled
                    if (ann.fillEnabled && ann.fillColor) {
                        const fillRgb = hexToRgb(ann.fillColor);
                        circleOptions.color = PDFLib.rgb(fillRgb.r / 255, fillRgb.g / 255, fillRgb.b / 255);
                        circleOptions.opacity = opacity * 0.3;
                    }

                    page.drawCircle(circleOptions);
                }
            }

            // Apply fill areas
            for (const area of removedAreas) {
                const page = pages[area.page - 1];
                const { height } = page.getSize();

                // Use the stored fill color or default to white
                const areaColor = area.color ? hexToRgb(area.color) : { r: 255, g: 255, b: 255 };

                page.drawRectangle({
                    x: area.x / SCALE_FACTOR,
                    y: height - (area.y / SCALE_FACTOR) - (area.height / SCALE_FACTOR),
                    width: area.width / SCALE_FACTOR,
                    height: area.height / SCALE_FACTOR,
                    color: PDFLib.rgb(areaColor.r / 255, areaColor.g / 255, areaColor.b / 255),
                    borderWidth: 0
                });
            }

            // Apply text overlays
            // Note: Text overlay coordinates are stored normalized (at scale 1.0)
            for (const overlay of textOverlays) {
                const page = pages[overlay.page - 1];
                const { height } = page.getSize();

                // Overlay coordinates are already normalized (scale 1.0), use directly
                const actualX = overlay.x;
                const actualY = overlay.y;
                const actualWidth = overlay.width;
                const actualHeight = overlay.height;
                const actualFontSize = overlay.fontSize;

                const pdfX = actualX;
                const pdfY = height - actualY - actualHeight;

                // Get Unicode-compatible font with bold/italic support
                const font = await getUnicodeFont(overlay.fontFamily, overlay.isBold, overlay.isItalic);

                // Draw background
                const bgMatch = overlay.bgColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
                if (bgMatch) {
                    const bgR = parseInt(bgMatch[1]) / 255;
                    const bgG = parseInt(bgMatch[2]) / 255;
                    const bgB = parseInt(bgMatch[3]) / 255;
                    const bgOpacity = bgMatch[4] !== undefined ? parseFloat(bgMatch[4]) : 1;

                    if (bgOpacity > 0) {
                        page.drawRectangle({
                            x: pdfX,
                            y: pdfY,
                            width: actualWidth,
                            height: actualHeight,
                            color: PDFLib.rgb(bgR, bgG, bgB),
                            opacity: bgOpacity,
                            borderWidth: 0
                        });
                    }
                }

                // Draw text with clickable links
                const textColor = hexToRgb(overlay.color);
                const textOpacity = overlay.textOpacity !== undefined ? overlay.textOpacity : 1;

                // Padding values (at scale 1.0)
                const paddingX = 8;
                const paddingY = 4;
                // Calculate text baseline position to match canvas rendering
                // Canvas text position from page top: overlay.y + paddingY + ascent (where text baseline sits)
                // PDF position from page bottom: pageHeight - (overlay.y + paddingY + ascent)
                // Which equals: pdfY + actualHeight - paddingY - ascent
                // Adjusted with offset correction for better alignment
                const ascent = actualFontSize * 0.85;
                const offsetCorrection = 3; // Fine-tune alignment
                const startY = pdfY + actualHeight - paddingY - ascent - offsetCorrection;

                // Parse text to extract links and create clickable hyperlinks
                const linkPattern = /(?:([^(]+?)\s*)?\((https?:\/\/[^)]+)\)/g;
                let currentX = pdfX + paddingX;
                let lastIndex = 0;
                let match;
                const text = overlay.text;

                while ((match = linkPattern.exec(text)) !== null) {
                    // Draw text before the link
                    const textBefore = text.substring(lastIndex, match.index);
                    if (textBefore) {
                        page.drawText(textBefore, {
                            x: currentX,
                            y: startY,
                            size: actualFontSize,
                            font: font,
                            color: PDFLib.rgb(textColor.r / 255, textColor.g / 255, textColor.b / 255),
                            opacity: textOpacity
                        });
                        currentX += font.widthOfTextAtSize(textBefore, actualFontSize);
                    }

                    // Get link text and URL
                    const linkText = match[1] ? match[1].trim() : match[2];
                    const linkUrl = match[2];

                    // Draw link text in blue
                    const linkStartX = currentX;
                    page.drawText(linkText, {
                        x: currentX,
                        y: startY,
                        size: actualFontSize,
                        font: font,
                        color: PDFLib.rgb(0, 0, 0.93), // Classic blue #0000EE
                        opacity: textOpacity
                    });

                    const linkWidth = font.widthOfTextAtSize(linkText, actualFontSize);

                    // Add link annotation
                    page.node.addAnnot(
                        pdfDoc.context.obj({
                            Type: 'Annot',
                            Subtype: 'Link',
                            Rect: [linkStartX, startY - 2, linkStartX + linkWidth, startY + actualFontSize],
                            Border: [0, 0, 0],
                            A: {
                                Type: 'Action',
                                S: 'URI',
                                URI: PDFLib.PDFString.of(linkUrl)
                            }
                        })
                    );

                    currentX += linkWidth;
                    lastIndex = match.index + match[0].length;
                }

                // Draw remaining text after last link
                const remainingText = text.substring(lastIndex);
                if (remainingText) {
                    page.drawText(remainingText, {
                        x: currentX,
                        y: startY,
                        size: actualFontSize,
                        font: font,
                        color: PDFLib.rgb(textColor.r / 255, textColor.g / 255, textColor.b / 255),
                        opacity: textOpacity
                    });
                }
            }

            // Apply signatures
            for (const signature of allSignatures) {
                const page = pages[signature.page - 1];
                const { height } = page.getSize();

                const actualX = signature.x / SCALE_FACTOR;
                const actualY = signature.y / SCALE_FACTOR;
                const actualWidth = signature.width / SCALE_FACTOR;
                const actualHeight = signature.height / SCALE_FACTOR;

                const pdfX = actualX;
                const pdfY = height - actualY - actualHeight;

                const imageBytes = await fetch(signature.image).then(res => res.arrayBuffer());
                let signatureImage;

                if (signature.image.startsWith('data:image/png')) {
                    signatureImage = await pdfDoc.embedPng(imageBytes);
                } else {
                    signatureImage = await pdfDoc.embedJpg(imageBytes);
                }

                page.drawImage(signatureImage, {
                    x: pdfX,
                    y: pdfY,
                    width: actualWidth,
                    height: actualHeight
                });
            }

            // Apply stamps
            if (typeof PDFoxStamps !== 'undefined') {
                const allStamps = PDFoxStamps.getStamps();
                for (const stamp of allStamps) {
                    const page = pages[stamp.page - 1];
                    const { height } = page.getSize();

                    const actualX = stamp.x / SCALE_FACTOR;
                    const actualY = stamp.y / SCALE_FACTOR;
                    const actualSize = stamp.size / SCALE_FACTOR;
                    const rgb = hexToRgb(stamp.color);

                    // Stamp coordinates are center-based (x,y is center of stamp)
                    // Convert to top-left for PDF positioning
                    const stampLeft = actualX - actualSize / 2;
                    const stampTop = actualY - actualSize / 2;

                    // PDF coordinates: origin is bottom-left
                    const pdfX = stampLeft;
                    const pdfY = height - stampTop - actualSize;

                    if (stamp.type === 'check') {
                        // Draw checkmark: path "M20 6L9 17l-5-5" scaled to stamp size
                        const scale = actualSize / 24;
                        const strokeWidth = 3 * scale;

                        // First line: from (20,6) to (9,17)
                        page.drawLine({
                            start: { x: pdfX + 20 * scale, y: pdfY + actualSize - 6 * scale },
                            end: { x: pdfX + 9 * scale, y: pdfY + actualSize - 17 * scale },
                            thickness: strokeWidth,
                            color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
                            lineCap: PDFLib.LineCapStyle.Round
                        });
                        // Second line: from (9,17) to (4,12)
                        page.drawLine({
                            start: { x: pdfX + 9 * scale, y: pdfY + actualSize - 17 * scale },
                            end: { x: pdfX + 4 * scale, y: pdfY + actualSize - 12 * scale },
                            thickness: strokeWidth,
                            color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
                            lineCap: PDFLib.LineCapStyle.Round
                        });
                    } else if (stamp.type === 'x') {
                        // Draw X mark: two diagonal lines
                        const scale = actualSize / 24;
                        const strokeWidth = 3 * scale;

                        // Line from (18,6) to (6,18)
                        page.drawLine({
                            start: { x: pdfX + 18 * scale, y: pdfY + actualSize - 6 * scale },
                            end: { x: pdfX + 6 * scale, y: pdfY + actualSize - 18 * scale },
                            thickness: strokeWidth,
                            color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
                            lineCap: PDFLib.LineCapStyle.Round
                        });
                        // Line from (6,6) to (18,18)
                        page.drawLine({
                            start: { x: pdfX + 6 * scale, y: pdfY + actualSize - 6 * scale },
                            end: { x: pdfX + 18 * scale, y: pdfY + actualSize - 18 * scale },
                            thickness: strokeWidth,
                            color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
                            lineCap: PDFLib.LineCapStyle.Round
                        });
                    } else if (stamp.type === 'circle') {
                        // Draw circle outline
                        const scale = actualSize / 24;
                        const centerX = pdfX + 12 * scale;
                        const centerY = pdfY + 12 * scale;
                        const radius = 9 * scale;

                        page.drawCircle({
                            x: centerX,
                            y: centerY,
                            size: radius,
                            borderColor: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
                            borderWidth: 2.5 * scale
                        });
                    } else if (stamp.type === 'dot') {
                        // Draw filled circle
                        const scale = actualSize / 24;
                        const centerX = pdfX + 12 * scale;
                        const centerY = pdfY + 12 * scale;
                        const radius = 8 * scale;

                        page.drawCircle({
                            x: centerX,
                            y: centerY,
                            size: radius,
                            color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255)
                        });
                    } else if (stamp.type === 'date' || stamp.type === 'na') {
                        // Draw text stamps with Unicode-compatible font
                        const text = stamp.text || (stamp.type === 'na' ? 'N/A' : '');
                        const fontSize = actualSize;
                        const stampFont = await getUnicodeFont('Arial');

                        // Center the text vertically
                        const textY = pdfY + actualSize * 0.25;

                        page.drawText(text, {
                            x: pdfX,
                            y: textY,
                            size: fontSize,
                            font: stampFont,
                            color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255)
                        });
                    }
                }
            }

            // Apply patches
            if (typeof PDFoxPatch !== 'undefined') {
                const allPatches = PDFoxPatch.getPatches();
                for (const patch of allPatches) {
                    const page = pages[patch.page - 1];
                    const { height } = page.getSize();

                    const actualX = patch.x / SCALE_FACTOR;
                    const actualY = patch.y / SCALE_FACTOR;
                    const actualWidth = patch.width / SCALE_FACTOR;
                    const actualHeight = patch.height / SCALE_FACTOR;

                    const pdfX = actualX;
                    const pdfY = height - actualY - actualHeight;

                    // Embed patch image
                    const imageBytes = await fetch(patch.imageData).then(res => res.arrayBuffer());
                    const patchImage = await pdfDoc.embedPng(imageBytes);

                    page.drawImage(patchImage, {
                        x: pdfX,
                        y: pdfY,
                        width: actualWidth,
                        height: actualHeight,
                        opacity: patch.opacity !== undefined ? patch.opacity : 1
                    });
                }
            }

            // Apply watermarks if requested (for free tier users)
            if (applyWatermark) {
                await applyWatermarks(pdfDoc, pages);
            }

            // Save PDF
            const pdfBytesModified = await pdfDoc.save();

            // If returnBytes mode, just return the bytes without downloading
            if (returnBytes) {
                return new Uint8Array(pdfBytesModified);
            }

            // Download the PDF
            const blob = new Blob([pdfBytesModified], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = (document.getElementById('docName')?.value || 'edited') + '.pdf';
            a.click();
            URL.revokeObjectURL(url);

            // Clear session after successful save
            if (typeof PDFoxSessionPersistence !== 'undefined') {
                PDFoxSessionPersistence.clear();
            }

            ui.hideLoading();
            ui.showAlert('PDF saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving PDF:', error);
            if (!returnBytes) {
                ui.hideLoading();
                ui.showAlert('Sorry, we couldn\'t save your PDF. Please try again.', 'error');
            }
            return returnBytes ? null : undefined;
        }
    }

    /**
     * Helper: hex to RGB
     */
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    /**
     * Apply PDFOX watermarks to all pages (Free tier protection)
     * Creates diagonal watermark pattern that is difficult to remove
     * @param {PDFDocument} pdfDoc - The PDF document
     * @param {PDFPage[]} pages - Array of PDF pages
     */
    async function applyWatermarks(pdfDoc, pages) {
        // Embed Helvetica Bold for watermark text
        const font = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

        // Watermark settings
        const watermarkText = 'PDFOX';
        const watermarkUrl = 'pdfox.cloud';
        const fontSize = 48;
        const smallFontSize = 14;
        const opacity = 0.12; // Semi-transparent - visible but not obstructing

        // PDFOX brand color (red) with transparency
        const watermarkColor = PDFLib.rgb(229/255, 9/255, 20/255); // #E50914

        for (const page of pages) {
            const { width, height } = page.getSize();

            // Calculate diagonal angle for text rotation
            const angle = Math.atan2(height, width); // Angle from bottom-left to top-right
            const rotationDegrees = -30; // Fixed angle for consistent appearance
            const rotationRadians = (rotationDegrees * Math.PI) / 180;

            // Calculate text width for spacing
            const textWidth = font.widthOfTextAtSize(watermarkText, fontSize);
            const smallTextWidth = font.widthOfTextAtSize(watermarkUrl, smallFontSize);

            // Create grid of watermarks covering entire page
            // This pattern makes it very difficult to remove watermarks
            const spacingX = textWidth * 2.5;
            const spacingY = fontSize * 4;

            // Calculate how many watermarks needed
            const cols = Math.ceil(width / spacingX) + 2;
            const rows = Math.ceil(height / spacingY) + 2;

            // Apply watermark grid pattern
            for (let row = -1; row < rows; row++) {
                for (let col = -1; col < cols; col++) {
                    // Offset every other row for better coverage
                    const offsetX = (row % 2) * (spacingX / 2);
                    const x = col * spacingX + offsetX;
                    const y = row * spacingY;

                    // Draw main PDFOX watermark
                    page.drawText(watermarkText, {
                        x: x,
                        y: y,
                        size: fontSize,
                        font: font,
                        color: watermarkColor,
                        opacity: opacity,
                        rotate: PDFLib.degrees(rotationDegrees)
                    });
                }
            }

            // Add corner branding (more visible)
            // Bottom-right corner
            page.drawText(watermarkUrl, {
                x: width - smallTextWidth - 15,
                y: 15,
                size: smallFontSize,
                font: font,
                color: watermarkColor,
                opacity: 0.35
            });

            // Top-left corner
            page.drawText(watermarkUrl, {
                x: 15,
                y: height - 25,
                size: smallFontSize,
                font: font,
                color: watermarkColor,
                opacity: 0.35
            });

            // Add a subtle center watermark (larger, more prominent)
            const centerX = width / 2 - textWidth / 2;
            const centerY = height / 2;

            page.drawText(watermarkText, {
                x: centerX,
                y: centerY,
                size: fontSize * 1.5,
                font: font,
                color: watermarkColor,
                opacity: 0.08, // Very subtle for center
                rotate: PDFLib.degrees(rotationDegrees)
            });
        }

        console.log('PDFOX watermarks applied to', pages.length, 'pages');
    }

    // Zoom levels (25% to 300%)
    const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];

    /**
     * Get stored PDF from storage (IndexedDB or sessionStorage)
     * @returns {Promise<Uint8Array|null>} PDF bytes or null if not found
     */
    async function getStoredPDF() {
        try {
            let dataUrl = null;

            // Try PDFStorage first (IndexedDB or sessionStorage)
            if (typeof PDFStorage !== 'undefined') {
                const result = await PDFStorage.retrieve();
                if (result && result.data) {
                    dataUrl = result.data;
                }
            }

            // Fallback to sessionStorage directly
            if (!dataUrl) {
                dataUrl = sessionStorage.getItem('pdfToEdit');
            }

            if (!dataUrl) {
                return null;
            }

            // Convert data URL to Uint8Array
            const base64 = dataUrl.split(',')[1];
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        } catch (error) {
            console.error('Failed to get stored PDF:', error);
            return null;
        }
    }

    /**
     * Update stored PDF (supports large files via IndexedDB)
     * @param {Uint8Array} pdfBytes - PDF bytes to store
     */
    async function updateStoredPDF(pdfBytes) {
        try {
            // Convert to base64 data URL
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < pdfBytes.length; i += chunkSize) {
                const chunk = pdfBytes.subarray(i, i + chunkSize);
                binary += String.fromCharCode.apply(null, chunk);
            }
            const base64 = btoa(binary);
            const dataUrl = 'data:application/pdf;base64,' + base64;

            // Use PDFStorage if available (supports IndexedDB for large files)
            if (typeof PDFStorage !== 'undefined') {
                await PDFStorage.update(dataUrl);
            } else {
                // Fallback to sessionStorage
                sessionStorage.setItem('pdfToEdit', dataUrl);
            }
        } catch (error) {
            console.error('Failed to update stored PDF:', error);
            // Don't throw - the PDF is still in memory
        }
    }

    /**
     * Update zoom display (updates all instances including cloned ones in overflow menu)
     */
    function updateZoomDisplay() {
        const scale = core.get('scale');
        const zoomText = Math.round(scale * 100) + '%';

        // Update all zoom display elements (original and any clones in overflow dropdown)
        document.querySelectorAll('#zoomDisplay, .zoom-display, .zoom-display-simple').forEach(display => {
            display.textContent = zoomText;
        });

        // Update active state in zoom dropdown
        updateZoomDropdownActiveState(scale);
    }

    /**
     * Update the active state indicator in zoom dropdown
     * @param {number} scale - Current zoom scale
     */
    function updateZoomDropdownActiveState(scale) {
        const zoomItems = document.querySelectorAll('.zoom-dropdown-item[data-zoom]');
        zoomItems.forEach(item => {
            const itemZoom = item.dataset.zoom;
            if (itemZoom && !isNaN(parseFloat(itemZoom))) {
                const isActive = Math.abs(parseFloat(itemZoom) - scale) < 0.01;
                item.classList.toggle('active', isActive);
            } else {
                item.classList.remove('active');
            }
        });
    }

    /**
     * Initialize zoom dropdown functionality
     */
    function initZoomDropdown() {
        const container = document.getElementById('zoomDropdownContainer');
        const trigger = document.getElementById('zoomDropdownTrigger');
        const menu = document.getElementById('zoomDropdownMenu');

        if (!container || !trigger || !menu) return;

        // Toggle dropdown on trigger click
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            container.classList.toggle('open');
        });

        // Handle zoom item clicks
        menu.addEventListener('click', async (e) => {
            const item = e.target.closest('.zoom-dropdown-item');
            if (!item) return;

            const zoomValue = item.dataset.zoom;
            if (!zoomValue) return;

            // Close dropdown
            container.classList.remove('open');

            if (zoomValue === 'fit') {
                await zoomFit();
            } else if (zoomValue === 'width') {
                await zoomFitWidth();
            } else {
                const scale = parseFloat(zoomValue);
                if (!isNaN(scale)) {
                    await setZoomLevel(scale);
                }
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                container.classList.remove('open');
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && container.classList.contains('open')) {
                container.classList.remove('open');
            }
        });
    }

    /**
     * Set zoom to specific level
     * @param {number} scale - Zoom scale to apply
     */
    async function setZoomLevel(scale) {
        const pdfDoc = core.get('pdfDoc');
        if (!renderer || !pdfDoc) {
            ui.showNotification('Please load a PDF first', 'info');
            return;
        }

        core.set('scale', scale);
        renderer.renderPage(core.get('currentPage'));
        updateZoomDisplay();
        ui.showNotification(`Zoom: ${Math.round(scale * 100)}%`, 'success');
    }

    /**
     * Zoom in
     */
    function zoomIn() {
        const pdfDoc = core.get('pdfDoc');
        if (!renderer || !pdfDoc) {
            ui.showNotification('Please load a PDF first', 'info');
            return;
        }
        const currentScale = core.get('scale') || 1.0;
        const nextLevel = ZOOM_LEVELS.find(z => z > currentScale);
        if (nextLevel) {
            core.set('scale', nextLevel);
            renderer.renderPage(core.get('currentPage'));
            updateZoomDisplay();
            ui.showNotification(`Zoom: ${Math.round(nextLevel * 100)}%`, 'success');
        } else {
            ui.showNotification('Maximum zoom reached', 'info');
        }
    }

    /**
     * Zoom out
     */
    function zoomOut() {
        const pdfDoc = core.get('pdfDoc');
        if (!renderer || !pdfDoc) {
            ui.showNotification('Please load a PDF first', 'info');
            return;
        }
        const currentScale = core.get('scale') || 1.0;
        const prevLevel = [...ZOOM_LEVELS].reverse().find(z => z < currentScale);
        if (prevLevel) {
            core.set('scale', prevLevel);
            renderer.renderPage(core.get('currentPage'));
            updateZoomDisplay();
            ui.showNotification(`Zoom: ${Math.round(prevLevel * 100)}%`, 'success');
        } else {
            ui.showNotification('Minimum zoom reached', 'info');
        }
    }

    /**
     * Fit to window - calculates optimal zoom based on document and viewport size
     */
    async function zoomFit() {
        const pdfDoc = core.get('pdfDoc');
        if (!renderer || !pdfDoc) {
            ui.showNotification('Please load a PDF first', 'info');
            return;
        }

        // Get current page dimensions
        const currentPage = core.get('currentPage');
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1.0 });

        // Calculate optimal zoom using renderer's smart zoom calculation
        const optimalScale = renderer.calculateOptimalZoom(viewport.width, viewport.height);

        core.set('scale', optimalScale);
        renderer.renderPage(currentPage);
        updateZoomDisplay();
        ui.showNotification(`Zoom: ${Math.round(optimalScale * 100)}% (Fit to View)`, 'success');
    }

    /**
     * Fit to width - zooms to fill the available width
     */
    async function zoomFitWidth() {
        const pdfDoc = core.get('pdfDoc');
        if (!renderer || !pdfDoc) {
            ui.showNotification('Please load a PDF first', 'info');
            return;
        }

        // Get current page dimensions
        const currentPage = core.get('currentPage');
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1.0 });

        // Calculate scale to fit width using canvas container
        const canvasContainer = document.querySelector('.canvas-container');
        if (!canvasContainer) return;

        const containerRect = canvasContainer.getBoundingClientRect();
        const availableWidth = containerRect.width - 120; // Account for padding and scrollbar
        let optimalScale = availableWidth / viewport.width;

        // Cap at 300% max, 50% min for readability
        optimalScale = Math.min(optimalScale, 3.0);
        optimalScale = Math.max(optimalScale, 0.5);

        // Round to nearest 5%
        optimalScale = Math.round(optimalScale * 20) / 20;

        core.set('scale', optimalScale);
        renderer.renderPage(currentPage);
        updateZoomDisplay();
        ui.showNotification(`Zoom: ${Math.round(optimalScale * 100)}% (Fit to Width)`, 'success');
    }

    /**
     * Rotate current page
     * @param {number} degrees - Rotation degrees (90 or -90)
     */
    async function rotatePage(degrees) {
        ui.showLoading('Rotating page...');

        try {
            // Always get fresh PDF bytes from storage to avoid detached ArrayBuffer issues
            let pdfBytes = await getStoredPDF();

            if (!pdfBytes) {
                // Fallback to memory if storage fails
                pdfBytes = core.get('pdfBytes');
            }

            if (!pdfBytes) {
                ui.hideLoading();
                ui.showAlert('No PDF loaded', 'error');
                return;
            }

            // Store fresh copy in core
            core.set('pdfBytes', pdfBytes);

            const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes.buffer || pdfBytes);
            const pages = pdfDoc.getPages();
            const currentPage = core.get('currentPage');
            const page = pages[currentPage - 1];

            const currentRotation = page.getRotation().angle;
            const newRotation = (currentRotation + degrees + 360) % 360;
            page.setRotation(PDFLib.degrees(newRotation));

            // Save the modified PDF
            const modifiedPdfBytes = await pdfDoc.save();
            const newPdfBytes = new Uint8Array(modifiedPdfBytes);
            core.set('pdfBytes', newPdfBytes);

            // Update storage (supports large files via IndexedDB)
            await updateStoredPDF(newPdfBytes);

            // Reload the PDF (this resets to page 1)
            await renderer.loadPDF(newPdfBytes);

            // Navigate back to the page that was rotated
            if (currentPage > 1) {
                await renderer.goToPage(currentPage);
            }

            ui.hideLoading();
            ui.showNotification(`Page rotated ${degrees > 0 ? 'right' : 'left'}`, 'success');
        } catch (error) {
            ui.hideLoading();
            console.error('Error rotating page:', error);
            ui.showAlert('Sorry, we couldn\'t rotate the page. Please try again.', 'error');
        }
    }

    /**
     * Delete current page
     */
    async function deletePage() {
        const totalPages = core.get('totalPages');
        if (totalPages <= 1) {
            ui.showAlert('Cannot delete the only page in the document', 'error');
            return;
        }

        ui.showConfirm('Are you sure you want to delete this page? This action cannot be undone.', async (confirmed) => {
            if (!confirmed) return;

            ui.showLoading('Deleting page...');

            try {
                // Always get fresh PDF bytes from storage to avoid detached ArrayBuffer issues
                let pdfBytes = await getStoredPDF();

                if (!pdfBytes) {
                    // Fallback to memory if storage fails
                    pdfBytes = core.get('pdfBytes');
                }

                if (!pdfBytes) {
                    ui.hideLoading();
                    ui.showAlert('No PDF loaded', 'error');
                    return;
                }

                // Store fresh copy in core
                core.set('pdfBytes', pdfBytes);

                const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes.buffer || pdfBytes);
                const currentPage = core.get('currentPage');

                // Remove the page (0-indexed)
                pdfDoc.removePage(currentPage - 1);

                // Save the modified PDF
                const modifiedPdfBytes = await pdfDoc.save();

                // Store as Uint8Array for consistency
                const newPdfBytes = new Uint8Array(modifiedPdfBytes);
                core.set('pdfBytes', newPdfBytes);

                // Update storage (supports large files via IndexedDB)
                await updateStoredPDF(newPdfBytes);

                // Reload the PDF
                await renderer.loadPDF(newPdfBytes);

                // Adjust current page if needed
                const newTotalPages = core.get('totalPages');
                if (currentPage > newTotalPages) {
                    renderer.goToPage(newTotalPages);
                }

                ui.hideLoading();
                ui.showNotification('Page deleted successfully', 'success');
            } catch (error) {
                ui.hideLoading();
                console.error('Error deleting page:', error);
                console.error('Failed to delete page:', error);
                ui.showAlert('Sorry, we couldn\'t delete the page. Please try again.', 'error');
            }
        });
    }

    /**
     * Export text from all pages
     */
    async function exportText() {
        const pdfDoc = core.get('pdfDoc');
        if (!pdfDoc) {
            ui.showAlert('No PDF loaded', 'error');
            return;
        }

        ui.showLoading('Extracting text...');

        try {
            const totalPages = core.get('totalPages');
            let allText = '';

            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                const page = await pdfDoc.getPage(pageNum);
                const textContent = await page.getTextContent();

                allText += `--- Page ${pageNum} ---\n`;

                // Extract text items
                const textItems = textContent.items;
                let lastY = null;
                let lineText = '';

                for (const item of textItems) {
                    const y = Math.round(item.transform[5]);

                    // If Y position changed significantly, start new line
                    if (lastY !== null && Math.abs(y - lastY) > 5) {
                        allText += lineText.trim() + '\n';
                        lineText = '';
                    }

                    lineText += item.str + ' ';
                    lastY = y;
                }

                // Add remaining text
                if (lineText.trim()) {
                    allText += lineText.trim() + '\n';
                }

                allText += '\n';
            }

            // Create and download file
            const blob = new Blob([allText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = (document.getElementById('docName')?.value || 'extracted') + '.txt';
            a.click();
            URL.revokeObjectURL(url);

            ui.hideLoading();
            ui.showAlert('Text exported successfully!', 'success');
        } catch (error) {
            ui.hideLoading();
            console.error('Error exporting text:', error);
            console.error('Failed to export text:', error);
            ui.showAlert('Sorry, we couldn\'t export the text. Please try again.', 'error');
        }
    }

    /**
     * Show share options modal (replaces direct share link generation)
     */
    function shareLink() {
        const pdfBytes = core.get('pdfBytes');
        if (!pdfBytes) {
            ui.showAlert('No PDF loaded', 'error');
            return;
        }

        showShareOptionsModal();
    }

    /**
     * Show share options modal
     */
    function showShareOptionsModal() {
        const modal = document.getElementById('shareOptionsModal');
        if (modal) {
            // Track share initiated
            if (typeof EditorAnalytics !== 'undefined') {
                const fileName = sessionStorage.getItem('pdfFileName') || 'document.pdf';
                EditorAnalytics.trackShareInitiated(fileName, 'Share Dialog');
            }

            // Reset form
            const passwordCheckbox = document.getElementById('sharePasswordEnabled');
            const passwordInput = document.getElementById('sharePassword');
            if (passwordCheckbox) passwordCheckbox.checked = false;
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.style.display = 'none';
            }
            modal.style.display = 'flex';
        }
    }

    /**
     * Close share options modal
     */
    function closeShareOptionsModal() {
        const modal = document.getElementById('shareOptionsModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Toggle password input visibility
     */
    function toggleSharePassword() {
        const passwordCheckbox = document.getElementById('sharePasswordEnabled');
        const passwordInput = document.getElementById('sharePassword');
        if (passwordCheckbox && passwordInput) {
            passwordInput.style.display = passwordCheckbox.checked ? 'block' : 'none';
            if (passwordCheckbox.checked) {
                passwordInput.focus();
            }
        }
    }

    /**
     * Generate share link via server API
     */
    async function generateShareLink() {
        const passwordCheckbox = document.getElementById('sharePasswordEnabled');
        const passwordInput = document.getElementById('sharePassword');
        const password = passwordCheckbox?.checked ? passwordInput?.value : null;

        // Validate password if enabled
        if (passwordCheckbox?.checked && (!password || password.length < 4)) {
            ui.showAlert('Password must be at least 4 characters', 'error');
            return;
        }

        // Close options modal
        closeShareOptionsModal();

        // Show loading
        ui.showLoading('Creating shareable link...');

        try {
            // Build PDF with current edits
            const pdfBytes = await buildCurrentPDF();
            if (!pdfBytes) {
                throw new Error('Failed to build PDF');
            }

            // Get filename
            const docNameEl = document.getElementById('docName');
            const fileName = docNameEl?.textContent || 'document.pdf';

            // Create form data
            const formData = new FormData();
            formData.append('pdf', new Blob([pdfBytes], { type: 'application/pdf' }));
            formData.append('fileName', fileName);
            if (password) {
                formData.append('password', password);
            }

            // Send to server
            const response = await fetch('/api/v1/share/create', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create share');
            }

            const data = await response.json();

            // Show result in share link modal
            ui.hideLoading();
            showShareLinkResult(data.url, data.hasPassword, data.expiresAt);

        } catch (error) {
            console.error('Error creating share:', error);
            ui.hideLoading();
            ui.showAlert('Failed to create share link. Please try again.', 'error');
        }
    }

    /**
     * Show share link result modal
     */
    function showShareLinkResult(url, hasPassword, expiresAt) {
        const modal = document.getElementById('shareLinkModal');
        const input = document.getElementById('shareUrlInput');
        const status = document.getElementById('shareLinkStatus');

        if (modal) {
            modal.style.display = 'flex';
            if (input) {
                input.value = url;
            }
            if (status) {
                const expiryDate = new Date(expiresAt).toLocaleString();
                let statusText = `Link created! Expires: ${expiryDate}`;
                if (hasPassword) {
                    statusText += ' (Password protected)';
                }
                status.textContent = statusText;
                status.style.color = '#4CAF50';
            }
        }
    }

    /**
     * Copy share link to clipboard
     */
    function copyShareLink() {
        const input = document.getElementById('shareUrlInput');
        if (input && input.value && !input.value.includes('Generating') && !input.value.includes('Creating')) {
            navigator.clipboard.writeText(input.value).then(() => {
                ui.showNotification('Link copied to clipboard!', 'success');
            }).catch(() => {
                // Fallback for older browsers
                input.select();
                document.execCommand('copy');
                ui.showNotification('Link copied to clipboard!', 'success');
            });
        }
    }

    /**
     * Close share link result modal
     */
    function closeShareModal() {
        const modal = document.getElementById('shareLinkModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Header share link - checks Pro status first
     * For non-Pro users, shows upgrade modal with share-focused messaging
     */
    function headerShareLink() {
        const isProUser = core.get('isProUser') || false;

        // Track share button click
        if (typeof EditorAnalytics !== 'undefined') {
            const fileName = sessionStorage.getItem('pdfFileName') || 'document.pdf';
            EditorAnalytics.send('share_initiated', {
                fileName: fileName,
                method: isProUser ? 'Share Button (Pro)' : 'Share Button (Free)',
                isPro: isProUser
            });
        }

        if (isProUser) {
            // Pro user - proceed with share functionality
            shareLink();
        } else {
            // Free user - show upgrade modal with share-specific message
            showShareUpgradePrompt();
        }
    }

    /**
     * Show upgrade prompt specifically for share feature
     */
    function showShareUpgradePrompt() {
        const modal = document.getElementById('upgradeModal');
        if (!modal) return;

        // Update modal content for share-specific messaging
        const title = modal.querySelector('.upgrade-modal-title');
        const subtitle = modal.querySelector('.upgrade-modal-subtitle');

        if (title) {
            title.textContent = 'Unlock Document Sharing';
        }
        if (subtitle) {
            subtitle.innerHTML = 'Share your PDFs with anyone via secure links!<br><strong style="color: #4CAF50;">Upgrade to Pro for free to unlock this feature!</strong>';
        }

        // Show modal
        modal.classList.add('active');

        // Handle click outside
        const handleOutsideClick = (e) => {
            if (e.target === modal) {
                closeUpgradeModal();
                restoreUpgradeModalText();
                modal.removeEventListener('click', handleOutsideClick);
            }
        };
        modal.addEventListener('click', handleOutsideClick);

        // Handle Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeUpgradeModal();
                restoreUpgradeModalText();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    /**
     * Restore upgrade modal to default text
     */
    function restoreUpgradeModalText() {
        const modal = document.getElementById('upgradeModal');
        if (!modal) return;

        const title = modal.querySelector('.upgrade-modal-title');
        const subtitle = modal.querySelector('.upgrade-modal-subtitle');

        if (title) {
            title.textContent = 'Unlock Clean PDF Exports';
        }
        if (subtitle) {
            subtitle.textContent = 'Your PDF is ready! Upgrade to Pro for professional results.';
        }
    }

    /**
     * Go back to home
     */
    function goBack() {
        const textEdits = core.get('textEdits');
        const textOverlays = core.get('textOverlays');
        const allAnnotations = core.get('annotations');

        if (textEdits.length > 0 || allAnnotations.length > 0 || textOverlays.length > 0) {
            ui.showConfirm('You have unsaved changes. Go back anyway?', (confirmed) => {
                if (confirmed) {
                    window.location.href = '/';
                }
            });
        } else {
            window.location.href = '/';
        }
    }

    /**
     * Handle file open
     * @param {Event} event - File input event
     */
    function handleFileOpen(event) {
        const file = event.target.files[0];
        if (!file) return;

        const processFile = async () => {
            ui.showLoading('Loading PDF...');

            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    // Clear any saved session state when loading a new file
                    if (typeof PDFoxSessionPersistence !== 'undefined') {
                        PDFoxSessionPersistence.clear();
                    }

                    // Use PDFStorage to handle large files via IndexedDB
                    if (typeof PDFStorage !== 'undefined') {
                        await PDFStorage.store(e.target.result, file.name);
                    } else {
                        sessionStorage.setItem('pdfToEdit', e.target.result);
                        sessionStorage.setItem('pdfFileName', file.name);
                    }
                    window.location.reload();
                } catch (error) {
                    ui.hideLoading();
                    console.error('Failed to load PDF:', error);
                    ui.showAlert('Sorry, we couldn\'t load the PDF. Please check the file and try again.', 'error');
                }
            };
            reader.readAsDataURL(file);
        };

        const textEdits = core.get('textEdits');
        const textOverlays = core.get('textOverlays');
        const allAnnotations = core.get('annotations');

        if (textEdits.length > 0 || allAnnotations.length > 0 || textOverlays.length > 0) {
            ui.showConfirm('Opening a new file will discard unsaved changes. Continue?', (confirmed) => {
                if (confirmed) {
                    processFile();
                } else {
                    event.target.value = '';
                }
            });
        } else {
            processFile();
        }
    }

    /**
     * Setup keyboard shortcuts
     */
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Escape - close modals OR reset to default tool
            if (e.key === 'Escape') {
                const editModal = document.getElementById('editModal');
                const addTextModal = document.getElementById('addTextModal');
                const signatureModal = document.getElementById('signatureModal');
                const shareModal = document.getElementById('shareModal');

                if (editModal?.style.display === 'flex') {
                    textEditor.closeEditModal();
                } else if (addTextModal?.style.display === 'flex') {
                    textEditor.closeAddTextModal();
                } else if (signatureModal?.style.display === 'flex') {
                    signatures.closeModal();
                } else if (shareModal?.style.display === 'flex') {
                    closeShareModal();
                } else {
                    // No modal open - reset to default tool
                    const currentTool = core.get('currentTool');
                    if (currentTool !== DEFAULT_TOOL) {
                        resetToDefaultTool();
                        ui.showNotification('Tool reset to Edit Text', 'info');
                    }
                }
            }

            // Ctrl+S - Save
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                savePDF();
            }

            // Ctrl+Z - Undo
            if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            }

            // Ctrl+Y or Ctrl+Shift+Z - Redo
            if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
                e.preventDefault();
                redo();
            }

            // Ctrl+D - Duplicate current layer
            if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                duplicateCurrentLayer();
            }

            // Delete/Backspace - Delete selected layer
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const activeTag = document.activeElement.tagName;
                if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
                    return;
                }

                // Check if a modal is open
                if (document.querySelector('.custom-modal[style*="flex"]') ||
                    document.querySelector('.overlay-edit-modal') ||
                    document.getElementById('unifiedTextEditorModal')) {
                    return;
                }

                // Get selected layer from core
                const selectedLayerId = core.get('selectedLayerId');
                if (selectedLayerId) {
                    e.preventDefault();
                    e.stopPropagation();

                    // Check text edits (id format: edit-{page}-{index})
                    if (selectedLayerId.startsWith('edit-')) {
                        const textEdits = core.get('textEdits') || [];
                        const parts = selectedLayerId.split('-');
                        const page = parseInt(parts[1]);
                        const dataIndex = parseInt(parts[2]);
                        const editIndex = textEdits.findIndex(e => e.page === page && e.index === dataIndex);
                        if (editIndex >= 0) {
                            core.emit('layer:delete', { type: 'text-edit', editIndex: editIndex });
                            core.set('selectedLayerId', null);
                            return;
                        }
                    }

                    // Check text overlays
                    const textOverlays = core.get('textOverlays') || [];
                    const overlay = textOverlays.find(o => o.id === selectedLayerId);
                    if (overlay) {
                        core.emit('layer:delete', { type: 'text-overlay', id: selectedLayerId });
                        core.set('selectedLayerId', null);
                        return;
                    }

                    // Check signatures
                    const signatures = core.get('signatures') || [];
                    const sigIndex = signatures.findIndex(s => s.id === selectedLayerId);
                    if (sigIndex >= 0) {
                        core.emit('layer:delete', { type: 'signature', signatureIndex: sigIndex });
                        core.set('selectedLayerId', null);
                        return;
                    }

                    // Check annotations (id format: ann-{index} or custom id)
                    const annotations = core.get('annotations') || [];
                    if (selectedLayerId.startsWith('ann-')) {
                        const annIndex = parseInt(selectedLayerId.replace('ann-', ''));
                        if (annIndex >= 0 && annIndex < annotations.length) {
                            core.emit('layer:delete', { type: 'annotation-' + annotations[annIndex].type, annotationIndex: annIndex });
                            core.set('selectedLayerId', null);
                            return;
                        }
                    } else {
                        const annIndex = annotations.findIndex(a => a.id === selectedLayerId);
                        if (annIndex >= 0) {
                            core.emit('layer:delete', { type: 'annotation-' + annotations[annIndex].type, annotationIndex: annIndex });
                            core.set('selectedLayerId', null);
                            return;
                        }
                    }

                    // Check fill areas (id format: fill-{index})
                    if (selectedLayerId.startsWith('fill-')) {
                        const fillIndex = parseInt(selectedLayerId.replace('fill-', ''));
                        core.emit('layer:delete', { type: 'fill', fillIndex: fillIndex });
                        core.set('selectedLayerId', null);
                        return;
                    }

                    // Check stamps
                    if (typeof PDFoxStamps !== 'undefined') {
                        const stamps = PDFoxStamps.getStamps ? PDFoxStamps.getStamps() : [];
                        const stamp = stamps.find(s => s.id === selectedLayerId);
                        if (stamp) {
                            PDFoxStamps.deleteStamp(selectedLayerId);
                            core.set('selectedLayerId', null);
                            return;
                        }
                    }

                    // Check patches
                    if (typeof PDFoxPatch !== 'undefined') {
                        const patches = PDFoxPatch.getPatches ? PDFoxPatch.getPatches() : [];
                        const patch = patches.find(p => p.id === selectedLayerId);
                        if (patch) {
                            PDFoxPatch.deletePatch(selectedLayerId);
                            core.set('selectedLayerId', null);
                            return;
                        }
                    }
                }
            }

            // +/= - Zoom in
            if ((e.key === '+' || e.key === '=') && !e.ctrlKey) {
                zoomIn();
            }

            // - - Zoom out
            if (e.key === '-' && !e.ctrlKey) {
                zoomOut();
            }

            // 0 - Fit to view (zoom fit)
            if (e.key === '0' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const activeElement = document.activeElement;
                if (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA') {
                    zoomFit();
                }
            }

            // Number keys 1-6 for quick tool selection
            if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                const toolShortcuts = {
                    '1': 'editText',
                    '2': 'addText',
                    '3': 'draw',
                    '4': 'rectangle',
                    '5': 'circle',
                    '6': 'fill'
                };
                if (toolShortcuts[e.key]) {
                    // Don't trigger if user is typing in an input
                    if (document.activeElement.tagName !== 'INPUT' &&
                        document.activeElement.tagName !== 'TEXTAREA') {
                        e.preventDefault();
                        setTool(toolShortcuts[e.key]);
                    }
                }

                // Letter keys for quick stamps (V, X, O, D, T, N)
                const stampShortcuts = {
                    'v': 'check',   // V for checkmark (like "verified")
                    'x': 'x',       // X for X mark
                    'o': 'circle',  // O for circle
                    'd': 'dot',     // D for dot
                    't': 'date',    // T for today's date
                    'n': 'na'       // N for N/A
                };
                if (!e.key) return;
                const lowerKey = e.key.toLowerCase();
                if (stampShortcuts[lowerKey]) {
                    // Don't trigger if user is typing in an input
                    if (document.activeElement.tagName !== 'INPUT' &&
                        document.activeElement.tagName !== 'TEXTAREA' &&
                        !document.activeElement.isContentEditable) {
                        e.preventDefault();
                        if (typeof PDFoxStamps !== 'undefined') {
                            PDFoxStamps.setStamp(stampShortcuts[lowerKey]);
                        }
                    }
                }

                // P for Patch tool
                if (lowerKey === 'p') {
                    if (document.activeElement.tagName !== 'INPUT' &&
                        document.activeElement.tagName !== 'TEXTAREA' &&
                        !document.activeElement.isContentEditable) {
                        e.preventDefault();
                        setTool('patch');
                    }
                }
            }
        });
    }

    /**
     * Setup click handlers for tool behavior
     */
    function setupToolBehavior() {
        // Click on canvas container (outside PDF) resets to default tool
        const canvasContainer = document.querySelector('.canvas-container');
        if (canvasContainer) {
            canvasContainer.addEventListener('click', (e) => {
                // Only reset if clicked directly on container (not on child elements)
                if (e.target === canvasContainer) {
                    const currentTool = core.get('currentTool');
                    if (currentTool !== DEFAULT_TOOL && !PERSISTENT_TOOLS.includes(currentTool)) {
                        resetToDefaultTool();
                    }
                }
            });
        }

        // Listen for tool action completions from other modules
        core.on('overlay:created', onToolActionComplete);  // When text is added
        core.on('ocr:selectionComplete', onToolActionComplete);  // When OCR selection completes
        core.on('area:removed', onToolActionComplete);  // When area is redacted
    }

    /**
     * Setup beforeunload warning
     */
    function setupBeforeUnloadWarning() {
        window.addEventListener('beforeunload', (e) => {
            const textEdits = core.get('textEdits');
            const textOverlays = core.get('textOverlays');
            const allAnnotations = core.get('annotations');

            if (textEdits.length > 0 || allAnnotations.length > 0 || textOverlays.length > 0) {
                e.preventDefault();
                e.returnValue = '';
                return 'You have unsaved changes.';
            }
        });
    }

    /**
     * Show the empty state (when no PDF is loaded)
     */
    function showEmptyState() {
        const emptyState = document.getElementById('canvasEmptyState');
        const pdfViewer = document.getElementById('pdfViewer');
        const loaderSection = emptyState?.querySelector('.empty-state-loader');

        if (emptyState) {
            emptyState.classList.remove('hidden');
            // Hide the loader since we're not actually loading
            if (loaderSection) {
                loaderSection.style.display = 'none';
            }
        }
        if (pdfViewer) {
            pdfViewer.classList.remove('loaded');
        }
    }

    /**
     * Setup drag and drop for PDF files
     */
    function setupDragAndDrop() {
        const canvasContainer = document.querySelector('.canvas-container');
        const emptyState = document.getElementById('canvasEmptyState');

        if (!canvasContainer) return;

        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            canvasContainer.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // Highlight drop zone on drag over
        ['dragenter', 'dragover'].forEach(eventName => {
            canvasContainer.addEventListener(eventName, () => {
                canvasContainer.classList.add('drag-over');
                if (emptyState) {
                    emptyState.classList.add('drag-over');
                }
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            canvasContainer.addEventListener(eventName, () => {
                canvasContainer.classList.remove('drag-over');
                if (emptyState) {
                    emptyState.classList.remove('drag-over');
                }
            }, false);
        });

        // Handle dropped files
        canvasContainer.addEventListener('drop', handleDrop, false);

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;

            if (files.length > 0) {
                const file = files[0];
                if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                    loadDroppedFile(file);
                } else {
                    ui.showNotification('Please drop a PDF file', 'warning');
                }
            }
        }

        async function loadDroppedFile(file) {
            ui.showLoading('Loading PDF...');

            // Show loader in empty state
            const loaderSection = emptyState?.querySelector('.empty-state-loader');
            if (loaderSection) {
                loaderSection.style.display = 'flex';
            }

            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    // Clear any saved session state when loading a new file
                    if (typeof PDFoxSessionPersistence !== 'undefined') {
                        PDFoxSessionPersistence.clear();
                    }

                    // Store in session/IndexedDB
                    if (typeof PDFStorage !== 'undefined') {
                        await PDFStorage.store(e.target.result, file.name);
                    } else {
                        sessionStorage.setItem('pdfToEdit', e.target.result);
                        sessionStorage.setItem('pdfFileName', file.name);
                    }

                    // Set document name
                    const docName = document.getElementById('docName');
                    if (docName) {
                        docName.value = file.name.replace('.pdf', '');
                    }

                    // Convert and load
                    const base64Data = e.target.result.split(',')[1];
                    const pdfBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                    core.set('pdfBytes', pdfBytes);

                    await renderer.loadPDF(new Uint8Array(pdfBytes));
                    setTool('addText', true); // Force to ensure UI is updated
                    updateZoomDisplay();

                    const appliedZoom = Math.round(core.get('scale') * 100);
                    ui.showNotification(`PDF loaded! Zoom: ${appliedZoom}%`, 'success');
                } catch (error) {
                    ui.hideLoading();
                    console.error('Failed to load PDF:', error);
                    ui.showAlert('Sorry, we couldn\'t load the PDF. Please check the file and try again.', 'error');
                    showEmptyState();
                }
            };
            reader.readAsDataURL(file);
        }
    }

    return {
        /**
         * Initialize application
         */
        async init() {
            // Get canvas elements
            const pdfCanvas = document.getElementById('pdfCanvas');
            const annotationCanvas = document.getElementById('annotationCanvas');
            const textLayer = document.getElementById('textLayer');

            if (!pdfCanvas || !annotationCanvas || !textLayer) {
                console.error('Required canvas elements not found');
                return;
            }

            // Initialize modules
            renderer = PDFoxRenderer;
            textEditor = PDFoxTextEditor;
            layers = PDFoxLayers;
            annotations = PDFoxAnnotations;
            signatures = PDFoxSignatures;
            overlays = PDFoxOverlays;

            renderer.init({
                pdfCanvas,
                annotationCanvas,
                textLayer
            });

            annotations.init({
                annotationCanvas,
                pdfCanvas
            });

            textEditor.init();
            layers.init();
            signatures.init();
            overlays.init();

            // Initialize stamps module
            if (typeof PDFoxStamps !== 'undefined') {
                PDFoxStamps.init();
            }

            // Initialize patch module
            if (typeof PDFoxPatch !== 'undefined') {
                PDFoxPatch.init();
            }

            // Note: addText:click is now handled directly in annotations module

            // Setup event handlers
            setupKeyboardShortcuts();
            setupToolBehavior();
            setupBeforeUnloadWarning();
            initZoomDropdown();

            // Wire up file input
            const fileInput = document.getElementById('openFileInput');
            if (fileInput) {
                fileInput.addEventListener('change', handleFileOpen);
            }

            // Wire up brush size display
            const brushSize = document.getElementById('brushSize');
            const sizeValue = document.getElementById('sizeValue');
            if (brushSize && sizeValue) {
                brushSize.addEventListener('input', () => {
                    sizeValue.textContent = brushSize.value;
                });
            }

            // Wire up fill color picker
            const fillColorPicker = document.getElementById('fillColorPicker');
            const fillColorSwatch = document.getElementById('fillColorSwatch');
            if (fillColorPicker && fillColorSwatch) {
                // Set initial swatch color
                fillColorSwatch.style.background = fillColorPicker.value;

                fillColorPicker.addEventListener('input', (e) => {
                    const color = e.target.value;
                    fillColorSwatch.style.background = color;
                    if (typeof PDFoxAnnotations !== 'undefined') {
                        // Always update the default fill color for new fills
                        PDFoxAnnotations.setFillColor(color);

                        // If a fill area is selected, update its color too
                        const selectedFillIndex = PDFoxAnnotations.getSelectedFillIndex();
                        if (selectedFillIndex !== null && selectedFillIndex >= 0) {
                            PDFoxAnnotations.updateSelectedFillColor(color);
                        }
                    }
                });

                fillColorPicker.addEventListener('change', (e) => {
                    // Only show notification if no fill is selected (for new fill color)
                    if (typeof PDFoxAnnotations !== 'undefined') {
                        const selectedFillIndex = PDFoxAnnotations.getSelectedFillIndex();
                        if (selectedFillIndex === null || selectedFillIndex < 0) {
                            ui.showNotification(`Fill color: ${e.target.value}`, 'info');
                        }
                    }
                });

                // Update color picker when a fill area is selected
                core.on('fill:selected', ({ color }) => {
                    if (color) {
                        fillColorPicker.value = color;
                        fillColorSwatch.style.background = color;
                    }
                });

                // Handle fill layer edit - open color picker
                core.on('layer:edit', (layer) => {
                    if (layer.type === 'fill') {
                        // Select the fill area first
                        if (typeof PDFoxAnnotations !== 'undefined') {
                            PDFoxAnnotations.selectFillArea(layer.fillIndex);
                        }
                        // Switch to move tool
                        if (typeof PDFoxApp !== 'undefined') {
                            PDFoxApp.setTool('moveText');
                        }
                        // Open the color picker
                        fillColorPicker.click();
                    }
                });
            }

            // Setup drag and drop on the canvas container
            setupDragAndDrop();

            // Load PDF from storage (supports both sessionStorage and IndexedDB)
            try {
                let pdfData, fileName;

                // Check if PDFStorage module is available (for IndexedDB support)
                if (typeof PDFStorage !== 'undefined') {
                    const stored = await PDFStorage.retrieve();
                    if (stored) {
                        pdfData = stored.data;
                        fileName = stored.fileName;
                    }
                } else {
                    // Fallback to sessionStorage only
                    pdfData = sessionStorage.getItem('pdfToEdit');
                    fileName = sessionStorage.getItem('pdfFileName');
                }

                if (!pdfData) {
                    // No PDF found - show empty state (don't redirect)
                    showEmptyState();
                    return;
                }

                // Set document name
                const docName = document.getElementById('docName');
                if (docName && fileName) {
                    docName.value = fileName.replace('.pdf', '');
                }

                // Convert data URL to bytes
                const base64Data = pdfData.split(',')[1];
                if (!base64Data) {
                    throw new Error('Invalid PDF data format');
                }

                const pdfBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                core.set('pdfBytes', pdfBytes);

                // Load PDF (renderer will calculate optimal zoom automatically)
                await renderer.loadPDF(new Uint8Array(pdfBytes));

                // Track file upload via editor analytics
                if (typeof EditorAnalytics !== 'undefined') {
                    const pageCount = core.get('totalPages') || renderer.pdfDoc?.numPages || 'Unknown';
                    EditorAnalytics.trackFileUpload({ name: fileName, size: pdfBytes.length }, pageCount);
                }

                // Initialize session persistence and restore any saved state
                if (typeof PDFoxSessionPersistence !== 'undefined') {
                    PDFoxSessionPersistence.init();
                    const restored = PDFoxSessionPersistence.restore(pdfBytes);
                    if (restored) {
                        // Re-render restored content
                        renderRestoredContent();
                        ui.showNotification('Previous session restored', 'success');
                    }
                }

                // Set default tool (force to ensure UI is updated) - unless restored
                if (!core.get('currentTool') || core.get('currentTool') === 'addText') {
                    setTool('addText', true);
                } else {
                    setTool(core.get('currentTool'), true);
                }

                // Initialize zoom display and notify user (only if not restored)
                updateZoomDisplay();
                if (typeof PDFoxSessionPersistence === 'undefined' || !PDFoxSessionPersistence.hasSession()) {
                    const appliedZoom = Math.round(core.get('scale') * 100);
                    ui.showNotification(`Zoom auto-adjusted to ${appliedZoom}% for best view`, 'success');
                }
            } catch (error) {
                console.error('Error loading PDF:', error);
                console.error('Failed to load PDF:', error);
                ui.showAlert('Sorry, we couldn\'t load the PDF. Please check the file and try again.', 'error');
            }
        },

        // Expose public methods
        setTool,
        resetToDefaultTool,
        undo,
        redo,
        duplicateCurrentLayer,
        savePDF,
        saveWithWatermark,
        showUpgradeModal,
        closeUpgradeModal,
        goToPricing,
        startProCheckout,
        showRecoveryForm,
        closeRecoveryModal,
        recoverProAccess,
        goBack,
        zoomIn,
        zoomOut,
        zoomFit,
        zoomFitWidth,
        setZoomLevel,
        rotatePage,
        deletePage,
        exportText,
        shareLink,
        copyShareLink,
        closeShareModal,
        headerShareLink,
        showShareOptionsModal,
        closeShareOptionsModal,
        toggleSharePassword,
        generateShareLink
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxApp;
}
