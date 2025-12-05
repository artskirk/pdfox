/**
 * PDFOX Annotations Module
 * Handles drawing, shapes, and canvas annotations
 * Single Responsibility: Canvas annotation operations
 */

const PDFoxAnnotations = (function() {
    'use strict';

    const core = PDFoxCore;
    const ui = PDFoxUI;

    // Canvas references
    let annotationCanvas, annotationContext;
    let pdfCanvas;

    // Drawing state
    let isDrawing = false;
    let currentAnnotation = null;

    // OCR selection state
    let ocrSelection = null;
    let isSelectingOCR = false;
    let ocrSelectionStart = null;
    let selectionAnimationFrame = null;

    // Removed areas (redactions)
    let removedAreas = [];

    /**
     * Start marching ants animation for selection
     */
    function startSelectionAnimation() {
        if (selectionAnimationFrame) return;

        function animate() {
            if (ocrSelection) {
                redrawAnnotations();
                selectionAnimationFrame = requestAnimationFrame(animate);
            } else {
                stopSelectionAnimation();
            }
        }
        selectionAnimationFrame = requestAnimationFrame(animate);
    }

    /**
     * Stop marching ants animation
     */
    function stopSelectionAnimation() {
        if (selectionAnimationFrame) {
            cancelAnimationFrame(selectionAnimationFrame);
            selectionAnimationFrame = null;
        }
    }

    /**
     * Apply annotation styles to context
     * @param {Object} ann - Annotation object with style properties
     */
    function applyAnnotationStyles(ann) {
        // Get RGBA color with opacity
        const opacity = ann.opacity !== undefined ? ann.opacity : 100;
        const r = parseInt(ann.color.slice(1, 3), 16);
        const g = parseInt(ann.color.slice(3, 5), 16);
        const b = parseInt(ann.color.slice(5, 7), 16);

        annotationContext.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
        annotationContext.lineWidth = ann.size;
        annotationContext.lineCap = 'round';
        annotationContext.lineJoin = 'round';

        // Apply line style
        const lineStyle = ann.lineStyle || 'solid';
        switch (lineStyle) {
            case 'dashed':
                annotationContext.setLineDash([ann.size * 3, ann.size * 2]);
                break;
            case 'dotted':
                annotationContext.setLineDash([ann.size, ann.size * 1.5]);
                break;
            default:
                annotationContext.setLineDash([]);
        }

        // Set fill style if fill is enabled
        if (ann.fillEnabled && ann.fillColor) {
            const fr = parseInt(ann.fillColor.slice(1, 3), 16);
            const fg = parseInt(ann.fillColor.slice(3, 5), 16);
            const fb = parseInt(ann.fillColor.slice(5, 7), 16);
            annotationContext.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${(opacity / 100) * 0.3})`;
        }
    }

    /**
     * Redraw all annotations on canvas
     */
    function redrawAnnotations() {
        if (!annotationContext || !annotationCanvas) return;

        const currentPage = core.get('currentPage');
        const annotations = core.get('annotations');

        annotationContext.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

        annotations.filter(ann => ann.page === currentPage).forEach(ann => {
            // Apply styles for this annotation
            applyAnnotationStyles(ann);

            if (ann.type === 'draw') {
                annotationContext.beginPath();
                ann.points.forEach((point, index) => {
                    if (index === 0) {
                        annotationContext.moveTo(point[0], point[1]);
                    } else {
                        annotationContext.lineTo(point[0], point[1]);
                    }
                });
                annotationContext.stroke();
            } else if (ann.type === 'rectangle') {
                const width = ann.endX - ann.startX;
                const height = ann.endY - ann.startY;
                if (ann.fillEnabled) {
                    annotationContext.fillRect(ann.startX, ann.startY, width, height);
                }
                annotationContext.strokeRect(ann.startX, ann.startY, width, height);
            } else if (ann.type === 'circle') {
                const radius = Math.sqrt(
                    Math.pow(ann.endX - ann.startX, 2) +
                    Math.pow(ann.endY - ann.startY, 2)
                );
                annotationContext.beginPath();
                annotationContext.arc(ann.startX, ann.startY, radius, 0, 2 * Math.PI);
                if (ann.fillEnabled) {
                    annotationContext.fill();
                }
                annotationContext.stroke();
            }

            // Reset line dash after each annotation
            annotationContext.setLineDash([]);
        });

        // Draw OCR selection if active - Professional selection UI
        if (ocrSelection && ocrSelection.page === currentPage) {
            const currentTool = core.get('currentTool');
            const isErase = currentTool === 'erase';

            annotationContext.save();

            // Selection colors based on tool
            const primaryColor = isErase ? '#E50914' : '#E50914'; // Brand red for both
            const fillColor = isErase ? 'rgba(229, 9, 20, 0.08)' : 'rgba(229, 9, 20, 0.06)';

            // Draw subtle fill
            annotationContext.fillStyle = fillColor;
            annotationContext.fillRect(ocrSelection.x, ocrSelection.y, ocrSelection.width, ocrSelection.height);

            // Draw refined border with marching ants animation effect
            annotationContext.strokeStyle = primaryColor;
            annotationContext.lineWidth = 1.5;
            annotationContext.setLineDash([6, 4]);
            annotationContext.lineDashOffset = -(Date.now() / 50) % 10; // Animated marching ants
            annotationContext.strokeRect(ocrSelection.x, ocrSelection.y, ocrSelection.width, ocrSelection.height);

            // Draw corner handles for visual feedback
            const handleSize = 8;
            const corners = [
                { x: ocrSelection.x, y: ocrSelection.y },
                { x: ocrSelection.x + ocrSelection.width, y: ocrSelection.y },
                { x: ocrSelection.x, y: ocrSelection.y + ocrSelection.height },
                { x: ocrSelection.x + ocrSelection.width, y: ocrSelection.y + ocrSelection.height }
            ];

            annotationContext.setLineDash([]);
            corners.forEach(corner => {
                // White fill with colored border
                annotationContext.fillStyle = '#FFFFFF';
                annotationContext.strokeStyle = primaryColor;
                annotationContext.lineWidth = 2;
                annotationContext.beginPath();
                annotationContext.arc(corner.x, corner.y, handleSize / 2, 0, Math.PI * 2);
                annotationContext.fill();
                annotationContext.stroke();
            });

            // Draw dimensions label if selection is large enough
            if (Math.abs(ocrSelection.width) > 60 && Math.abs(ocrSelection.height) > 40) {
                const labelText = isErase ? 'Redact Area' : 'OCR Region';
                const labelX = ocrSelection.x + ocrSelection.width / 2;
                const labelY = ocrSelection.y + ocrSelection.height / 2;

                // Label background
                annotationContext.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
                const textMetrics = annotationContext.measureText(labelText);
                const padding = 8;
                const labelWidth = textMetrics.width + padding * 2;
                const labelHeight = 24;

                annotationContext.fillStyle = 'rgba(0, 0, 0, 0.75)';
                annotationContext.beginPath();
                annotationContext.roundRect(
                    labelX - labelWidth / 2,
                    labelY - labelHeight / 2,
                    labelWidth,
                    labelHeight,
                    4
                );
                annotationContext.fill();

                // Label text
                annotationContext.fillStyle = '#FFFFFF';
                annotationContext.textAlign = 'center';
                annotationContext.textBaseline = 'middle';
                annotationContext.fillText(labelText, labelX, labelY);
            }

            annotationContext.restore();
        }

        // Draw removed areas as white rectangles
        removedAreas.filter(area => area.page === currentPage).forEach(area => {
            annotationContext.fillStyle = 'white';
            annotationContext.fillRect(area.x, area.y, area.width, area.height);
        });
    }

    /**
     * Start annotation drawing
     * @param {MouseEvent} e - Mouse event
     */
    function startAnnotation(e) {
        const currentTool = core.get('currentTool');
        if (currentTool === 'editText' || currentTool === 'moveText') return;

        const rect = annotationCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Handle OCR selection and Erase mode
        if (currentTool === 'ocrSelect' || currentTool === 'erase') {
            isSelectingOCR = true;
            ocrSelectionStart = { x, y };
            ocrSelection = { x, y, width: 0, height: 0, page: core.get('currentPage') };
            startSelectionAnimation(); // Start marching ants animation
            core.emit('ocr:selectionStart');
            return;
        }

        // Handle Add Text tool
        if (currentTool === 'addText') {
            e.stopPropagation();
            e.preventDefault();
            if (typeof PDFoxTextEditor !== 'undefined') {
                PDFoxTextEditor.openAddTextModal(x, y);
            }
            return;
        }

        // Start drawing annotation - get styles from annotation styles module or fallback to legacy inputs
        let styles = {
            strokeColor: '#E50914',
            fillColor: '#E50914',
            fillEnabled: false,
            opacity: 100,
            lineStyle: 'solid',
            size: 3
        };

        // Try to get styles from the new annotation styles module
        if (typeof PDFoxAnnotationStyles !== 'undefined') {
            styles = PDFoxAnnotationStyles.getStyles();
        } else {
            // Fallback to legacy inputs
            const colorPicker = document.getElementById('colorPicker');
            const brushSize = document.getElementById('brushSize');
            if (colorPicker) styles.strokeColor = colorPicker.value;
            if (brushSize) styles.size = parseInt(brushSize.value);
        }

        isDrawing = true;
        currentAnnotation = {
            type: currentTool,
            startX: x,
            startY: y,
            color: styles.strokeColor,
            fillColor: styles.fillColor,
            fillEnabled: styles.fillEnabled,
            opacity: styles.opacity,
            lineStyle: styles.lineStyle,
            size: styles.size,
            page: core.get('currentPage'),
            points: currentTool === 'draw' ? [[x, y]] : []
        };
    }

    /**
     * Continue drawing annotation
     * @param {MouseEvent} e - Mouse event
     */
    function drawAnnotation(e) {
        const currentTool = core.get('currentTool');

        // Handle OCR selection drawing
        if (isSelectingOCR && (currentTool === 'ocrSelect' || currentTool === 'erase')) {
            const rect = annotationCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            ocrSelection.width = x - ocrSelectionStart.x;
            ocrSelection.height = y - ocrSelectionStart.y;

            redrawAnnotations();
            return;
        }

        if (!isDrawing || currentTool === 'editText' || currentTool === 'addText') return;

        const rect = annotationCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (currentTool === 'draw') {
            currentAnnotation.points.push([x, y]);

            // Draw in real-time with full styles
            applyAnnotationStyles(currentAnnotation);
            annotationContext.beginPath();
            const points = currentAnnotation.points;
            annotationContext.moveTo(points[points.length - 2][0], points[points.length - 2][1]);
            annotationContext.lineTo(x, y);
            annotationContext.stroke();
            annotationContext.setLineDash([]);
        } else {
            // Preview shapes with full styles
            redrawAnnotations();
            applyAnnotationStyles(currentAnnotation);

            if (currentTool === 'rectangle') {
                const width = x - currentAnnotation.startX;
                const height = y - currentAnnotation.startY;
                if (currentAnnotation.fillEnabled) {
                    annotationContext.fillRect(currentAnnotation.startX, currentAnnotation.startY, width, height);
                }
                annotationContext.strokeRect(currentAnnotation.startX, currentAnnotation.startY, width, height);
            } else if (currentTool === 'circle') {
                const radius = Math.sqrt(
                    Math.pow(x - currentAnnotation.startX, 2) +
                    Math.pow(y - currentAnnotation.startY, 2)
                );
                annotationContext.beginPath();
                annotationContext.arc(currentAnnotation.startX, currentAnnotation.startY, radius, 0, 2 * Math.PI);
                if (currentAnnotation.fillEnabled) {
                    annotationContext.fill();
                }
                annotationContext.stroke();
            }
            annotationContext.setLineDash([]);
        }
    }

    /**
     * End annotation drawing
     * @param {MouseEvent} e - Mouse event
     */
    function endAnnotation(e) {
        const currentTool = core.get('currentTool');

        // Handle OCR selection completion
        if (isSelectingOCR && currentTool === 'ocrSelect') {
            isSelectingOCR = false;
            stopSelectionAnimation(); // Stop marching ants
            normalizeSelection();

            if (ocrSelection.width > 20 && ocrSelection.height > 20) {
                core.emit('ocr:selectionComplete', ocrSelection);
            } else {
                ocrSelection = null;
                redrawAnnotations();
            }
            return;
        }

        // Handle Erase selection completion
        if (isSelectingOCR && currentTool === 'erase') {
            isSelectingOCR = false;
            stopSelectionAnimation(); // Stop marching ants
            normalizeSelection();

            if (ocrSelection.width > 10 && ocrSelection.height > 10) {
                removeSelectedArea();
            } else {
                ocrSelection = null;
                redrawAnnotations();
            }
            return;
        }

        if (!isDrawing) return;

        const rect = annotationCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (currentTool === 'rectangle' || currentTool === 'circle') {
            currentAnnotation.endX = x;
            currentAnnotation.endY = y;
        }

        core.push('annotations', currentAnnotation);
        core.addToHistory({
            type: 'annotation',
            data: currentAnnotation
        });

        redrawAnnotations();
        isDrawing = false;
        currentAnnotation = null;
    }

    /**
     * Normalize selection for negative widths/heights
     */
    function normalizeSelection() {
        if (!ocrSelection) return;

        if (ocrSelection.width < 0) {
            ocrSelection.x += ocrSelection.width;
            ocrSelection.width = Math.abs(ocrSelection.width);
        }
        if (ocrSelection.height < 0) {
            ocrSelection.y += ocrSelection.height;
            ocrSelection.height = Math.abs(ocrSelection.height);
        }
    }

    /**
     * Remove selected area (redaction)
     */
    function removeSelectedArea() {
        if (!ocrSelection) return;

        const areaToRemove = {
            x: ocrSelection.x,
            y: ocrSelection.y,
            width: ocrSelection.width,
            height: ocrSelection.height,
            page: core.get('currentPage')
        };

        removedAreas.push(areaToRemove);

        core.addToHistory({
            type: 'removeArea',
            data: areaToRemove
        });

        ocrSelection = null;
        isSelectingOCR = false;
        redrawAnnotations();

        ui.showNotification('Area removed successfully!', 'success');
        core.emit('area:removed', areaToRemove);
    }

    return {
        /**
         * Initialize annotations module
         * @param {Object} elements - Canvas elements
         */
        init(elements) {
            annotationCanvas = elements.annotationCanvas;
            annotationContext = annotationCanvas.getContext('2d');
            pdfCanvas = elements.pdfCanvas;

            // Set up event listeners
            annotationCanvas.addEventListener('mousedown', startAnnotation);
            annotationCanvas.addEventListener('mousemove', drawAnnotation);
            annotationCanvas.addEventListener('mouseup', endAnnotation);

            // Subscribe to page changes
            core.on('page:rendered', () => this.redraw());

            // Subscribe to tool changes
            core.on('currentTool:changed', ({ value }) => {
                // Text tools - disable annotation canvas but set appropriate cursor
                if (value === 'editText' || value === 'moveText') {
                    annotationCanvas.style.cursor = '';
                    annotationCanvas.style.pointerEvents = 'none';
                    annotationCanvas.classList.remove('cursor-draw', 'cursor-rectangle', 'cursor-circle', 'cursor-erase', 'cursor-ocr', 'cursor-addText');
                } else if (value === 'addText') {
                    // Add text tool - show text cursor but handle clicks on annotation canvas
                    annotationCanvas.style.pointerEvents = 'auto';
                    annotationCanvas.style.cursor = '';
                    annotationCanvas.classList.remove('cursor-draw', 'cursor-rectangle', 'cursor-circle', 'cursor-erase', 'cursor-ocr');
                    annotationCanvas.classList.add('cursor-addText');
                } else {
                    // Annotation tools - enable canvas with appropriate cursor
                    annotationCanvas.style.pointerEvents = 'auto';
                    // Clear inline cursor style so class-based cursor takes effect
                    annotationCanvas.style.cursor = '';

                    // Remove all cursor classes first
                    annotationCanvas.classList.remove('cursor-draw', 'cursor-rectangle', 'cursor-circle', 'cursor-erase', 'cursor-ocr');

                    // Add the appropriate cursor class
                    switch (value) {
                        case 'draw':
                            annotationCanvas.classList.add('cursor-draw');
                            break;
                        case 'rectangle':
                            annotationCanvas.classList.add('cursor-rectangle');
                            break;
                        case 'circle':
                            annotationCanvas.classList.add('cursor-circle');
                            break;
                        case 'erase':
                            annotationCanvas.classList.add('cursor-erase');
                            break;
                        case 'ocrSelect':
                            annotationCanvas.classList.add('cursor-ocr');
                            break;
                        default:
                            // Fallback to crosshair for unknown tools
                            annotationCanvas.style.cursor = 'crosshair';
                    }
                }

                // Clear OCR selection when switching tools
                if (value !== 'ocrSelect' && value !== 'erase' && ocrSelection) {
                    stopSelectionAnimation();
                    ocrSelection = null;
                    redrawAnnotations();
                }
            });
        },

        /**
         * Redraw all annotations
         */
        redraw: redrawAnnotations,

        /**
         * Clear all annotations
         */
        clearAll() {
            ui.showConfirm('Clear all annotations (not text edits)?', (confirmed) => {
                if (confirmed) {
                    core.set('annotations', []);
                    redrawAnnotations();
                }
            });
        },

        /**
         * Get OCR selection
         * @returns {Object|null}
         */
        getOCRSelection() {
            return ocrSelection;
        },

        /**
         * Clear OCR selection
         */
        clearOCRSelection() {
            stopSelectionAnimation();
            ocrSelection = null;
            redrawAnnotations();
        },

        /**
         * Get removed areas
         * @returns {Array}
         */
        getRemovedAreas() {
            return removedAreas;
        },

        /**
         * Undo last removed area
         * @param {Object} area - Area to restore
         */
        restoreRemovedArea(area) {
            const index = removedAreas.findIndex(a => a === area);
            if (index !== -1) {
                removedAreas.splice(index, 1);
                redrawAnnotations();
            }
        },

        /**
         * Get canvas context
         * @returns {CanvasRenderingContext2D}
         */
        getContext() {
            return annotationContext;
        }
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxAnnotations;
}
