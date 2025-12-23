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

    // Removed areas (fill areas)
    let removedAreas = [];

    // Fill color for the fill tool
    let fillColor = '#FFFFFF';

    // Selection and drag state for move tool
    let selectedAnnotationIndex = null;
    let isDraggingAnnotation = false;
    let dragStartPos = null;
    let annotationStartPos = null;

    // Selection and drag/resize state for fill areas
    let selectedFillIndex = null;
    let isDraggingFill = false;
    let isResizingFill = false;
    let fillDragStartPos = null;
    let fillStartState = null;
    let resizeHandle = null; // 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'

    /**
     * Get bounding box of an annotation
     * @param {Object} ann - Annotation object
     * @returns {Object} Bounding box {x, y, width, height}
     */
    function getAnnotationBounds(ann) {
        if (ann.type === 'draw' && ann.points && ann.points.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            ann.points.forEach(point => {
                minX = Math.min(minX, point[0]);
                minY = Math.min(minY, point[1]);
                maxX = Math.max(maxX, point[0]);
                maxY = Math.max(maxY, point[1]);
            });
            return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        } else if (ann.type === 'rectangle') {
            const x = Math.min(ann.startX, ann.endX);
            const y = Math.min(ann.startY, ann.endY);
            const width = Math.abs(ann.endX - ann.startX);
            const height = Math.abs(ann.endY - ann.startY);
            return { x, y, width, height };
        } else if (ann.type === 'circle') {
            const radius = Math.sqrt(
                Math.pow(ann.endX - ann.startX, 2) +
                Math.pow(ann.endY - ann.startY, 2)
            );
            return {
                x: ann.startX - radius,
                y: ann.startY - radius,
                width: radius * 2,
                height: radius * 2
            };
        }
        return null;
    }

    /**
     * Check if point is inside annotation
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Object} ann - Annotation object
     * @returns {boolean}
     */
    function isPointInAnnotation(x, y, ann) {
        const padding = 10; // Extra padding for easier selection

        if (ann.type === 'draw' && ann.points && ann.points.length > 0) {
            // Check if point is near any segment of the drawing
            for (let i = 1; i < ann.points.length; i++) {
                const p1 = ann.points[i - 1];
                const p2 = ann.points[i];
                const dist = pointToSegmentDistance(x, y, p1[0], p1[1], p2[0], p2[1]);
                if (dist < ann.size + padding) {
                    return true;
                }
            }
            return false;
        } else if (ann.type === 'rectangle') {
            const bounds = getAnnotationBounds(ann);
            return x >= bounds.x - padding && x <= bounds.x + bounds.width + padding &&
                   y >= bounds.y - padding && y <= bounds.y + bounds.height + padding;
        } else if (ann.type === 'circle') {
            const radius = Math.sqrt(
                Math.pow(ann.endX - ann.startX, 2) +
                Math.pow(ann.endY - ann.startY, 2)
            );
            const dist = Math.sqrt(Math.pow(x - ann.startX, 2) + Math.pow(y - ann.startY, 2));
            return dist <= radius + padding;
        }
        return false;
    }

    /**
     * Calculate distance from point to line segment
     */
    function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) param = dot / lenSq;

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Find annotation at position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {number} Index of annotation or -1
     */
    function findAnnotationAtPosition(x, y) {
        const currentPage = core.get('currentPage');
        const annotations = core.get('annotations');

        // Search in reverse order (top-most first)
        for (let i = annotations.length - 1; i >= 0; i--) {
            const ann = annotations[i];
            if (ann.page === currentPage && isPointInAnnotation(x, y, ann)) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Find fill area at position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {number} Index of fill area or -1
     */
    function findFillAtPosition(x, y) {
        const currentPage = core.get('currentPage');
        const padding = 5;

        // Search in reverse order (top-most first)
        for (let i = removedAreas.length - 1; i >= 0; i--) {
            const area = removedAreas[i];
            if (area.page === currentPage) {
                if (x >= area.x - padding && x <= area.x + area.width + padding &&
                    y >= area.y - padding && y <= area.y + area.height + padding) {
                    return i;
                }
            }
        }
        return -1;
    }

    /**
     * Get resize handle at position for a fill area
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Object} area - Fill area object
     * @returns {string|null} Handle name or null
     */
    function getResizeHandleAtPosition(x, y, area) {
        const handleSize = 10;
        const handles = {
            'nw': { x: area.x, y: area.y },
            'ne': { x: area.x + area.width, y: area.y },
            'sw': { x: area.x, y: area.y + area.height },
            'se': { x: area.x + area.width, y: area.y + area.height },
            'n': { x: area.x + area.width / 2, y: area.y },
            's': { x: area.x + area.width / 2, y: area.y + area.height },
            'w': { x: area.x, y: area.y + area.height / 2 },
            'e': { x: area.x + area.width, y: area.y + area.height / 2 }
        };

        for (const [name, pos] of Object.entries(handles)) {
            if (Math.abs(x - pos.x) <= handleSize && Math.abs(y - pos.y) <= handleSize) {
                return name;
            }
        }
        return null;
    }

    /**
     * Set cursor based on resize handle
     * @param {string} handle - Handle name
     */
    function setCursorForHandle(handle) {
        const cursors = {
            'nw': 'nwse-resize',
            'se': 'nwse-resize',
            'ne': 'nesw-resize',
            'sw': 'nesw-resize',
            'n': 'ns-resize',
            's': 'ns-resize',
            'e': 'ew-resize',
            'w': 'ew-resize'
        };
        annotationCanvas.style.cursor = cursors[handle] || 'default';
    }

    /**
     * Draw selection highlight around fill area with resize handles
     * @param {Object} area - Fill area object
     */
    function drawFillSelectionHighlight(area) {
        const padding = 2;

        annotationContext.save();
        annotationContext.strokeStyle = '#E50914';
        annotationContext.lineWidth = 2;
        annotationContext.setLineDash([5, 5]);

        // Draw selection border
        annotationContext.strokeRect(
            area.x - padding,
            area.y - padding,
            area.width + padding * 2,
            area.height + padding * 2
        );

        // Draw resize handles
        annotationContext.setLineDash([]);
        const handleSize = 8;
        const handles = [
            { x: area.x, y: area.y }, // nw
            { x: area.x + area.width, y: area.y }, // ne
            { x: area.x, y: area.y + area.height }, // sw
            { x: area.x + area.width, y: area.y + area.height }, // se
            { x: area.x + area.width / 2, y: area.y }, // n
            { x: area.x + area.width / 2, y: area.y + area.height }, // s
            { x: area.x, y: area.y + area.height / 2 }, // w
            { x: area.x + area.width, y: area.y + area.height / 2 } // e
        ];

        handles.forEach(handle => {
            annotationContext.fillStyle = '#FFFFFF';
            annotationContext.strokeStyle = '#E50914';
            annotationContext.lineWidth = 2;
            annotationContext.beginPath();
            annotationContext.arc(handle.x, handle.y, handleSize / 2, 0, Math.PI * 2);
            annotationContext.fill();
            annotationContext.stroke();
        });

        annotationContext.restore();
    }

    /**
     * Move annotation by delta
     * @param {number} index - Annotation index
     * @param {number} dx - Delta X
     * @param {number} dy - Delta Y
     */
    function moveAnnotation(index, dx, dy) {
        const annotations = core.get('annotations');
        const ann = annotations[index];
        if (!ann) return;

        if (ann.type === 'draw' && ann.points) {
            ann.points = ann.points.map(p => [p[0] + dx, p[1] + dy]);
        } else if (ann.type === 'rectangle' || ann.type === 'circle') {
            ann.startX += dx;
            ann.startY += dy;
            ann.endX += dx;
            ann.endY += dy;
        }
    }

    /**
     * Draw selection highlight around annotation
     * @param {Object} ann - Annotation object
     */
    function drawSelectionHighlight(ann) {
        const bounds = getAnnotationBounds(ann);
        if (!bounds) return;

        const padding = 8;

        annotationContext.save();
        annotationContext.strokeStyle = '#E50914';
        annotationContext.lineWidth = 2;
        annotationContext.setLineDash([5, 5]);

        if (ann.type === 'circle') {
            // Draw circular selection for circles
            const radius = Math.sqrt(
                Math.pow(ann.endX - ann.startX, 2) +
                Math.pow(ann.endY - ann.startY, 2)
            );
            annotationContext.beginPath();
            annotationContext.arc(ann.startX, ann.startY, radius + padding, 0, Math.PI * 2);
            annotationContext.stroke();
        } else {
            // Draw rectangular selection for draw and rectangle
            annotationContext.strokeRect(
                bounds.x - padding,
                bounds.y - padding,
                bounds.width + padding * 2,
                bounds.height + padding * 2
            );
        }

        // Draw corner handles
        annotationContext.setLineDash([]);
        const handleSize = 8;
        const corners = [
            { x: bounds.x - padding, y: bounds.y - padding },
            { x: bounds.x + bounds.width + padding, y: bounds.y - padding },
            { x: bounds.x - padding, y: bounds.y + bounds.height + padding },
            { x: bounds.x + bounds.width + padding, y: bounds.y + bounds.height + padding }
        ];

        corners.forEach(corner => {
            annotationContext.fillStyle = '#FFFFFF';
            annotationContext.strokeStyle = '#E50914';
            annotationContext.lineWidth = 2;
            annotationContext.beginPath();
            annotationContext.arc(corner.x, corner.y, handleSize / 2, 0, Math.PI * 2);
            annotationContext.fill();
            annotationContext.stroke();
        });

        annotationContext.restore();
    }

    /**
     * Select annotation at index
     * @param {number} index - Annotation index
     */
    function selectAnnotation(index) {
        selectedAnnotationIndex = index;
        redrawAnnotations();
        core.emit('annotation:selected', index);
    }

    /**
     * Deselect current annotation
     */
    function deselectAnnotation() {
        selectedAnnotationIndex = null;
        redrawAnnotations();
        core.emit('annotation:deselected');
    }

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

        const pageAnnotations = annotations.filter(ann => ann.page === currentPage);
        pageAnnotations.forEach((ann, idx) => {
            // Find actual index in full annotations array
            const actualIndex = annotations.indexOf(ann);

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

            // Draw selection highlight if this annotation is selected
            if (actualIndex === selectedAnnotationIndex) {
                drawSelectionHighlight(ann);
            }
        });

        // Draw OCR selection if active - Professional selection UI
        if (ocrSelection && ocrSelection.page === currentPage) {
            const currentTool = core.get('currentTool');
            const isFill = currentTool === 'fill';

            annotationContext.save();

            // Selection colors based on tool
            const primaryColor = isFill ? '#E50914' : '#E50914'; // Brand red for both
            const selectionFillColor = isFill ? 'rgba(229, 9, 20, 0.08)' : 'rgba(229, 9, 20, 0.06)';

            // Draw subtle fill
            annotationContext.fillStyle = selectionFillColor;
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
                const labelText = isFill ? 'Fill Area' : 'AI Text Region';
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

        // Draw fill areas with their respective colors
        removedAreas.filter(area => area.page === currentPage).forEach((area, idx) => {
            // Find actual index in full removedAreas array
            const actualIndex = removedAreas.indexOf(area);

            annotationContext.fillStyle = area.color || '#FFFFFF';
            annotationContext.fillRect(area.x, area.y, area.width, area.height);

            // Draw selection highlight if this fill area is selected
            if (actualIndex === selectedFillIndex) {
                drawFillSelectionHighlight(area);
            }
        });
    }

    /**
     * Start annotation drawing
     * @param {PointerEvent} e - Pointer event
     */
    function startAnnotation(e) {
        // Ignore right-clicks - let context menu handle them
        // For touch events, button is 0 (or undefined in some cases)
        if (e.button === 2) return;

        // Capture pointer for reliable tracking
        if (e.target && e.target.setPointerCapture) {
            e.target.setPointerCapture(e.pointerId);
        }

        const currentTool = core.get('currentTool');

        const rect = annotationCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Handle move tool - check for fill area and annotation selection/drag
        if (currentTool === 'moveText') {
            // First check if clicking on a selected fill area's resize handle
            if (selectedFillIndex !== null) {
                const selectedArea = removedAreas[selectedFillIndex];
                if (selectedArea) {
                    const handle = getResizeHandleAtPosition(x, y, selectedArea);
                    if (handle) {
                        // Start resizing
                        isResizingFill = true;
                        resizeHandle = handle;
                        fillDragStartPos = { x, y };
                        fillStartState = { ...selectedArea };
                        setCursorForHandle(handle);
                        e.preventDefault();
                        return;
                    }
                }
            }

            // Check for fill area hit
            const fillHitIndex = findFillAtPosition(x, y);
            if (fillHitIndex >= 0) {
                // Select and start dragging this fill area
                selectedFillIndex = fillHitIndex;
                deselectAnnotation(); // Deselect any annotation
                isDraggingFill = true;
                fillDragStartPos = { x, y };
                fillStartState = { ...removedAreas[fillHitIndex] };
                annotationCanvas.style.cursor = 'grabbing';
                redrawAnnotations();

                // Emit fill selection event with the fill's color
                core.emit('fill:selected', {
                    index: fillHitIndex,
                    color: removedAreas[fillHitIndex].color || '#FFFFFF'
                });

                e.preventDefault();
                return;
            }

            // Check for annotation hit
            const hitIndex = findAnnotationAtPosition(x, y);
            if (hitIndex >= 0) {
                // Deselect fill area if any
                selectedFillIndex = null;

                // Start dragging this annotation
                selectAnnotation(hitIndex);
                isDraggingAnnotation = true;
                dragStartPos = { x, y };

                // Store original position for undo
                const annotations = core.get('annotations');
                const ann = annotations[hitIndex];
                if (ann.type === 'draw') {
                    annotationStartPos = { points: ann.points.map(p => [...p]) };
                } else {
                    annotationStartPos = {
                        startX: ann.startX,
                        startY: ann.startY,
                        endX: ann.endX,
                        endY: ann.endY
                    };
                }

                annotationCanvas.style.cursor = 'grabbing';
                e.preventDefault();
                return;
            } else {
                // Clicked on empty area - deselect all
                deselectAnnotation();
                selectedFillIndex = null;
                redrawAnnotations();
            }
            return;
        }

        if (currentTool === 'editText') return;

        // Let patch module handle its own events
        if (currentTool === 'patch') return;

        // Handle OCR selection and Fill mode
        if (currentTool === 'ocrSelect' || currentTool === 'fill') {
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
     * @param {PointerEvent} e - Pointer event
     */
    function drawAnnotation(e) {
        const currentTool = core.get('currentTool');

        // Let patch module handle its own events
        if (currentTool === 'patch') return;

        // Handle fill area resizing
        if (isResizingFill && selectedFillIndex !== null && fillStartState) {
            const rect = annotationCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const area = removedAreas[selectedFillIndex];
            if (!area) return;

            const dx = x - fillDragStartPos.x;
            const dy = y - fillDragStartPos.y;

            // Apply resize based on handle
            switch (resizeHandle) {
                case 'nw':
                    area.x = fillStartState.x + dx;
                    area.y = fillStartState.y + dy;
                    area.width = fillStartState.width - dx;
                    area.height = fillStartState.height - dy;
                    break;
                case 'ne':
                    area.y = fillStartState.y + dy;
                    area.width = fillStartState.width + dx;
                    area.height = fillStartState.height - dy;
                    break;
                case 'sw':
                    area.x = fillStartState.x + dx;
                    area.width = fillStartState.width - dx;
                    area.height = fillStartState.height + dy;
                    break;
                case 'se':
                    area.width = fillStartState.width + dx;
                    area.height = fillStartState.height + dy;
                    break;
                case 'n':
                    area.y = fillStartState.y + dy;
                    area.height = fillStartState.height - dy;
                    break;
                case 's':
                    area.height = fillStartState.height + dy;
                    break;
                case 'w':
                    area.x = fillStartState.x + dx;
                    area.width = fillStartState.width - dx;
                    break;
                case 'e':
                    area.width = fillStartState.width + dx;
                    break;
            }

            // Ensure minimum size
            if (area.width < 10) area.width = 10;
            if (area.height < 10) area.height = 10;

            redrawAnnotations();
            e.preventDefault();
            return;
        }

        // Handle fill area dragging
        if (isDraggingFill && selectedFillIndex !== null) {
            const rect = annotationCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const dx = x - fillDragStartPos.x;
            const dy = y - fillDragStartPos.y;

            // Move fill area
            const area = removedAreas[selectedFillIndex];
            if (area) {
                area.x = fillStartState.x + dx;
                area.y = fillStartState.y + dy;
            }

            redrawAnnotations();
            e.preventDefault();
            return;
        }

        // Handle annotation dragging
        if (isDraggingAnnotation && selectedAnnotationIndex !== null) {
            const rect = annotationCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const dx = x - dragStartPos.x;
            const dy = y - dragStartPos.y;

            // Move annotation
            moveAnnotation(selectedAnnotationIndex, dx, dy);

            // Update drag start for next move
            dragStartPos = { x, y };

            redrawAnnotations();
            e.preventDefault();
            return;
        }

        // Update cursor when hovering over fill areas and annotations in move mode
        if (currentTool === 'moveText' && !isDraggingAnnotation && !isDraggingFill && !isResizingFill) {
            const rect = annotationCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Check for resize handle hover on selected fill
            if (selectedFillIndex !== null) {
                const selectedArea = removedAreas[selectedFillIndex];
                if (selectedArea) {
                    const handle = getResizeHandleAtPosition(x, y, selectedArea);
                    if (handle) {
                        setCursorForHandle(handle);
                        return;
                    }
                }
            }

            // Check for fill area hover
            const fillHitIndex = findFillAtPosition(x, y);
            if (fillHitIndex >= 0) {
                annotationCanvas.style.cursor = 'grab';
                return;
            }

            // Check for annotation hover
            const hitIndex = findAnnotationAtPosition(x, y);
            if (hitIndex >= 0) {
                annotationCanvas.style.cursor = 'grab';
            } else {
                annotationCanvas.style.cursor = 'default';
            }
        }

        // Handle OCR selection drawing
        if (isSelectingOCR && (currentTool === 'ocrSelect' || currentTool === 'fill')) {
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
     * @param {PointerEvent} e - Pointer event
     */
    function endAnnotation(e) {
        // Release pointer capture
        if (e.target && e.target.releasePointerCapture && e.pointerId !== undefined) {
            try {
                e.target.releasePointerCapture(e.pointerId);
            } catch (err) {
                // Ignore - pointer may not be captured
            }
        }

        const currentTool = core.get('currentTool');

        // Let patch module handle its own events
        if (currentTool === 'patch') return;

        // Handle end of fill area resizing
        if (isResizingFill && selectedFillIndex !== null) {
            isResizingFill = false;
            resizeHandle = null;
            annotationCanvas.style.cursor = 'default';

            // Add to history for undo
            core.addToHistory({
                type: 'fillResize',
                fillIndex: selectedFillIndex,
                previousState: fillStartState
            });

            fillDragStartPos = null;
            fillStartState = null;

            ui.showNotification('Fill area resized', 'success');
            core.emit('area:removed', removedAreas[selectedFillIndex]);
            return;
        }

        // Handle end of fill area dragging
        if (isDraggingFill && selectedFillIndex !== null) {
            isDraggingFill = false;
            annotationCanvas.style.cursor = 'grab';

            // Add to history for undo
            core.addToHistory({
                type: 'fillMove',
                fillIndex: selectedFillIndex,
                previousState: fillStartState
            });

            fillDragStartPos = null;
            fillStartState = null;

            ui.showNotification('Fill area moved', 'success');
            core.emit('area:removed', removedAreas[selectedFillIndex]);
            return;
        }

        // Handle end of annotation dragging
        if (isDraggingAnnotation && selectedAnnotationIndex !== null) {
            isDraggingAnnotation = false;
            annotationCanvas.style.cursor = 'grab';

            // Add to history for undo
            core.addToHistory({
                type: 'annotationMove',
                annotationIndex: selectedAnnotationIndex,
                previousPosition: annotationStartPos
            });

            dragStartPos = null;
            annotationStartPos = null;

            ui.showNotification('Annotation moved', 'success');
            core.emit('annotations:changed', { value: core.get('annotations') });
            return;
        }

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

        // Handle Fill selection completion
        if (isSelectingOCR && currentTool === 'fill') {
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
     * Fill selected area with current fill color
     */
    function removeSelectedArea() {
        if (!ocrSelection) return;

        const areaToFill = {
            x: ocrSelection.x,
            y: ocrSelection.y,
            width: ocrSelection.width,
            height: ocrSelection.height,
            page: core.get('currentPage'),
            color: fillColor
        };

        removedAreas.push(areaToFill);

        core.addToHistory({
            type: 'removeArea',
            data: areaToFill
        });

        ocrSelection = null;
        isSelectingOCR = false;

        // Store the index of newly created fill area
        const newFillIndex = removedAreas.length - 1;

        ui.showNotification('Area filled! You can now move or resize it.', 'success');
        core.emit('area:removed', areaToFill);

        // Switch to move tool so user can immediately adjust the fill block
        // Then select the new fill area after tool switch completes
        if (typeof PDFoxApp !== 'undefined') {
            PDFoxApp.setTool('moveText');
            // Select after tool switch to ensure selection persists
            selectedFillIndex = newFillIndex;
            redrawAnnotations();
        } else {
            selectedFillIndex = newFillIndex;
            redrawAnnotations();
        }
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

            // Set up event listeners (use pointer events for touch support)
            annotationCanvas.style.touchAction = 'none';
            annotationCanvas.addEventListener('pointerdown', startAnnotation);
            annotationCanvas.addEventListener('pointermove', drawAnnotation);
            annotationCanvas.addEventListener('pointerup', endAnnotation);
            annotationCanvas.addEventListener('pointercancel', endAnnotation);

            // Subscribe to page changes
            core.on('page:rendered', () => this.redraw());

            // Subscribe to tool changes
            core.on('currentTool:changed', ({ value }) => {
                // Deselect annotation and fill areas when switching tools
                if (value !== 'moveText') {
                    deselectAnnotation();
                    selectedFillIndex = null;
                    redrawAnnotations();
                }

                // Edit text tool - disable annotation canvas
                if (value === 'editText') {
                    annotationCanvas.style.cursor = '';
                    annotationCanvas.style.pointerEvents = 'none';
                    annotationCanvas.classList.remove('cursor-draw', 'cursor-rectangle', 'cursor-circle', 'cursor-fill', 'cursor-ocr', 'cursor-addText', 'cursor-patch');
                } else if (value === 'moveText') {
                    // Move tool - enable annotation canvas for selecting/moving annotations
                    annotationCanvas.style.pointerEvents = 'auto';
                    annotationCanvas.style.cursor = 'default';
                    annotationCanvas.classList.remove('cursor-draw', 'cursor-rectangle', 'cursor-circle', 'cursor-fill', 'cursor-ocr', 'cursor-addText', 'cursor-patch');
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
                    annotationCanvas.classList.remove('cursor-draw', 'cursor-rectangle', 'cursor-circle', 'cursor-fill', 'cursor-ocr', 'cursor-addText', 'cursor-patch');

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
                        case 'fill':
                            annotationCanvas.classList.add('cursor-fill');
                            break;
                        case 'ocrSelect':
                            annotationCanvas.classList.add('cursor-ocr');
                            break;
                        case 'patch':
                            annotationCanvas.classList.add('cursor-patch');
                            break;
                        default:
                            // Fallback to crosshair for unknown tools
                            annotationCanvas.style.cursor = 'crosshair';
                    }
                }

                // Clear OCR selection when switching tools
                if (value !== 'ocrSelect' && value !== 'fill' && ocrSelection) {
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
         * Select an annotation by index
         * @param {number} annotationIndex - Index of annotation to select
         */
        selectAnnotation(annotationIndex) {
            selectAnnotation(annotationIndex);
        },

        /**
         * Deselect current annotation
         */
        deselectAnnotation() {
            deselectAnnotation();
        },

        /**
         * Get selected annotation index
         * @returns {number|null}
         */
        getSelectedAnnotationIndex() {
            return selectedAnnotationIndex;
        },

        /**
         * Highlight a specific annotation
         * @param {number} annotationIndex - Index of annotation to highlight
         */
        highlightAnnotation(annotationIndex) {
            const annotations = core.get('annotations');
            const annotation = annotations[annotationIndex];
            if (!annotation) return;

            // Redraw annotations first
            redrawAnnotations();

            // Draw highlight around the annotation
            annotationContext.save();
            annotationContext.strokeStyle = '#E50914';
            annotationContext.lineWidth = 3;
            annotationContext.setLineDash([5, 5]);

            if (annotation.type === 'draw' && annotation.points && annotation.points.length > 0) {
                // Get bounding box of the drawing
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                annotation.points.forEach(point => {
                    minX = Math.min(minX, point[0]);
                    minY = Math.min(minY, point[1]);
                    maxX = Math.max(maxX, point[0]);
                    maxY = Math.max(maxY, point[1]);
                });
                const padding = 10;
                annotationContext.strokeRect(minX - padding, minY - padding, maxX - minX + padding * 2, maxY - minY + padding * 2);
            } else if (annotation.type === 'rectangle') {
                const padding = 5;
                annotationContext.strokeRect(annotation.x - padding, annotation.y - padding, annotation.width + padding * 2, annotation.height + padding * 2);
            } else if (annotation.type === 'circle') {
                const padding = 5;
                annotationContext.beginPath();
                annotationContext.arc(annotation.x, annotation.y, annotation.radius + padding, 0, Math.PI * 2);
                annotationContext.stroke();
            }

            annotationContext.restore();

            // Clear highlight after a short delay
            setTimeout(() => {
                redrawAnnotations();
            }, 1500);
        },

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
         * Remove a redacted area by index
         * @param {number} index - Index of the redacted area to remove
         */
        removeRedactedArea(index) {
            if (index >= 0 && index < removedAreas.length) {
                removedAreas.splice(index, 1);
                redrawAnnotations();
            }
        },

        /**
         * Add removed area (for redo)
         * @param {Object} area - Area to add
         */
        addRemovedArea(area) {
            removedAreas.push(area);
            redrawAnnotations();
        },

        /**
         * Get canvas context
         * @returns {CanvasRenderingContext2D}
         */
        getContext() {
            return annotationContext;
        },

        /**
         * Set fill color for the fill tool
         * @param {string} color - Hex color string
         */
        setFillColor(color) {
            fillColor = color;
        },

        /**
         * Get current fill color
         * @returns {string} Hex color string
         */
        getFillColor() {
            return fillColor;
        },

        /**
         * Select a fill area by index
         * @param {number} fillIndex - Index of fill area to select
         */
        selectFillArea(fillIndex) {
            if (fillIndex >= 0 && fillIndex < removedAreas.length) {
                selectedFillIndex = fillIndex;
                deselectAnnotation(); // Deselect any annotation
                redrawAnnotations();

                // Emit fill selection event with the fill's color
                core.emit('fill:selected', {
                    index: fillIndex,
                    color: removedAreas[fillIndex].color || '#FFFFFF'
                });
            }
        },

        /**
         * Get selected fill area index
         * @returns {number|null}
         */
        getSelectedFillIndex() {
            return selectedFillIndex;
        },

        /**
         * Update selected fill area's color
         * @param {string} color - Hex color string
         */
        updateSelectedFillColor(color) {
            if (selectedFillIndex === null || selectedFillIndex < 0) return;

            const area = removedAreas[selectedFillIndex];
            if (!area) return;

            const previousColor = area.color;
            area.color = color;

            // Add to history for undo
            core.addToHistory({
                type: 'fillColorChange',
                fillIndex: selectedFillIndex,
                previousColor: previousColor
            });

            redrawAnnotations();
            core.emit('area:removed', area);
            ui.showNotification('Fill color updated', 'success');
        },

        /**
         * Get selected fill area
         * @returns {Object|null}
         */
        getSelectedFillArea() {
            if (selectedFillIndex === null || selectedFillIndex < 0) return null;
            return removedAreas[selectedFillIndex] || null;
        }
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxAnnotations;
}
