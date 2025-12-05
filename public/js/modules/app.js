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
    const ONE_SHOT_TOOLS = ['addText', 'ocrSelect', 'erase'];

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
        erase: 'crosshair',
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

        if (tool === 'editText' || tool === 'moveText') {
            if (annCanvas) {
                annCanvas.style.cursor = 'default';
                annCanvas.style.pointerEvents = 'none';
            }
            if (textLayer) {
                textLayer.classList.add('editable');
                textLayer.style.cursor = cursor;
            }
            if (pdfViewer) pdfViewer.style.cursor = cursor;
        } else {
            if (annCanvas) {
                annCanvas.style.cursor = cursor;
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
                ocrSelect: 'OCR Select',
                erase: 'Redact'
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

            default:
                ui.showAlert('Cannot redo this action', 'warning');
        }
    }

    /**
     * Save PDF with all modifications
     */
    async function savePDF() {
        const pdfBytes = core.get('pdfBytes');

        if (!pdfBytes || pdfBytes.length === 0) {
            ui.showAlert('PDF data not loaded. Please reload the page.', 'error');
            return;
        }

        ui.showLoading('Saving PDF...');

        try {
            // Load PDF with pdf-lib
            const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
            const pages = pdfDoc.getPages();

            // Use the actual viewer scale - this is critical for correct positioning
            // All overlay/annotation coordinates are stored in screen pixels at the current scale
            const SCALE_FACTOR = core.get('scale');

            const textEdits = core.get('textEdits');
            const textOverlays = core.get('textOverlays');
            const allAnnotations = core.get('annotations');
            const allSignatures = core.get('signatures');
            const removedAreas = annotations.getRemovedAreas();

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

                // Cover original text
                page.drawRectangle({
                    x: originalX - actualPadding,
                    y: rectY,
                    width: actualWidth + (actualPadding * 2),
                    height: rectHeight,
                    color: PDFLib.rgb(1, 1, 1)
                });

                // Draw new text
                const rgb = hexToRgb(edit.customColor || '#000000');
                page.drawText(edit.newText, {
                    x: actualX,
                    y: baselineFromBottom,
                    size: actualFontSize,
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

            // Apply removed areas
            for (const area of removedAreas) {
                const page = pages[area.page - 1];
                const { height } = page.getSize();

                page.drawRectangle({
                    x: area.x / SCALE_FACTOR,
                    y: height - (area.y / SCALE_FACTOR) - (area.height / SCALE_FACTOR),
                    width: area.width / SCALE_FACTOR,
                    height: area.height / SCALE_FACTOR,
                    color: PDFLib.rgb(1, 1, 1),
                    borderWidth: 0
                });
            }

            // Apply text overlays
            for (const overlay of textOverlays) {
                const page = pages[overlay.page - 1];
                const { height } = page.getSize();

                const actualX = overlay.x / SCALE_FACTOR;
                const actualY = overlay.y / SCALE_FACTOR;
                const actualWidth = overlay.width / SCALE_FACTOR;
                const actualHeight = overlay.height / SCALE_FACTOR;
                const actualFontSize = overlay.fontSize / SCALE_FACTOR;

                const pdfX = actualX;
                const pdfY = height - actualY - actualHeight;

                // Font mapping
                const fontMap = {
                    'courier': PDFLib.StandardFonts.Courier,
                    'monospace': PDFLib.StandardFonts.Courier,
                    'times': PDFLib.StandardFonts.TimesRoman,
                    'georgia': PDFLib.StandardFonts.TimesRoman
                };

                let pdfFont = PDFLib.StandardFonts.Helvetica;
                const fontLower = (overlay.fontFamily || '').toLowerCase();
                for (const [key, value] of Object.entries(fontMap)) {
                    if (fontLower.includes(key)) {
                        pdfFont = value;
                        break;
                    }
                }

                const font = await pdfDoc.embedFont(pdfFont);

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

                // Draw text
                const textColor = hexToRgb(overlay.color);
                const textOpacity = overlay.textOpacity !== undefined ? overlay.textOpacity : 1;

                const paddingX = 8 / SCALE_FACTOR;
                const paddingY = 4 / SCALE_FACTOR;
                const textHeightAboveBaseline = actualFontSize * 0.75;
                const startY = pdfY + actualHeight - paddingY - textHeightAboveBaseline;

                page.drawText(overlay.text, {
                    x: pdfX + paddingX,
                    y: startY,
                    size: actualFontSize,
                    font: font,
                    color: PDFLib.rgb(textColor.r / 255, textColor.g / 255, textColor.b / 255),
                    opacity: textOpacity
                });
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

            // Save and download
            const pdfBytesModified = await pdfDoc.save();
            const blob = new Blob([pdfBytesModified], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = (document.getElementById('docName')?.value || 'edited') + '.pdf';
            a.click();
            URL.revokeObjectURL(url);

            ui.hideLoading();
            ui.showAlert('PDF saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving PDF:', error);
            ui.hideLoading();
            console.error('Failed to save PDF:', error);
            ui.showAlert('Sorry, we couldn\'t save your PDF. Please try again.', 'error');
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

            // Reload the PDF
            await renderer.loadPDF(newPdfBytes);

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
     * Generate and show shareable link
     */
    async function shareLink() {
        const pdfBytes = core.get('pdfBytes');
        if (!pdfBytes) {
            ui.showAlert('No PDF loaded', 'error');
            return;
        }

        // Show modal
        const modal = document.getElementById('shareLinkModal');
        const input = document.getElementById('shareUrlInput');
        const status = document.getElementById('shareLinkStatus');

        if (modal) {
            modal.style.display = 'flex';
            input.value = 'Generating link...';
            status.textContent = '';
        }

        try {
            // Generate a unique ID for this document
            const docId = generateShareId();

            // Store in sessionStorage with expiry (in real app, use server)
            const shareData = {
                pdfData: sessionStorage.getItem('pdfToEdit'),
                fileName: sessionStorage.getItem('pdfFileName'),
                timestamp: Date.now(),
                expiry: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
            };

            sessionStorage.setItem('share_' + docId, JSON.stringify(shareData));

            // Generate URL
            const shareUrl = `${window.location.origin}/pdf-editor-modular.html?share=${docId}`;

            if (input) {
                input.value = shareUrl;
            }
            if (status) {
                status.textContent = 'Link generated! Valid for 24 hours.';
                status.style.color = '#4CAF50';
            }
        } catch (error) {
            console.error('Error generating share link:', error);
            if (status) {
                console.error('Failed to generate link:', error);
                status.textContent = 'Sorry, we couldn\'t generate the link. Please try again.';
                status.style.color = '#dc3545';
            }
        }
    }

    /**
     * Generate a random share ID
     */
    function generateShareId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 12; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Copy share link to clipboard
     */
    function copyShareLink() {
        const input = document.getElementById('shareUrlInput');
        if (input && input.value && !input.value.includes('Generating')) {
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
     * Close share modal
     */
    function closeShareModal() {
        const modal = document.getElementById('shareLinkModal');
        if (modal) {
            modal.style.display = 'none';
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
                    '6': 'erase'
                };
                if (toolShortcuts[e.key]) {
                    // Don't trigger if user is typing in an input
                    if (document.activeElement.tagName !== 'INPUT' &&
                        document.activeElement.tagName !== 'TEXTAREA') {
                        e.preventDefault();
                        setTool(toolShortcuts[e.key]);
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

                // Set default tool (force to ensure UI is updated)
                setTool('addText', true);

                // Initialize zoom display and notify user
                updateZoomDisplay();
                const appliedZoom = Math.round(core.get('scale') * 100);
                ui.showNotification(`Zoom auto-adjusted to ${appliedZoom}% for best view`, 'success');
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
        savePDF,
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
        closeShareModal
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxApp;
}
