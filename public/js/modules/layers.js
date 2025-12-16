/**
 * PDFOX Layers Module
 * Handles the layers panel in the sidebar
 * Single Responsibility: Layer management and rendering
 */

const PDFoxLayers = (function() {
    'use strict';

    const core = PDFoxCore;
    const ui = PDFoxUI;
    const { $, createElement } = PDFoxUtils;

    // SVG icons
    const icons = {
        edit: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>`,
        signature: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 17c3.5-3.5 7-7 11-4s3 6-1 9"/>
            <path d="M17 22l4-4"/>
        </svg>`,
        delete: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>`,
        editSmall: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>`,
        duplicate: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>`,
        layers: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
        </svg>`,
        draw: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 19l7-7 3 3-7 7-3-3z"/>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
            <path d="M2 2l7.586 7.586"/>
            <circle cx="11" cy="11" r="2"/>
        </svg>`,
        rectangle: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        </svg>`,
        circle: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
        </svg>`,
        fill: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3.5 19.5L9 8l8.5 4.5-5.5 11.5z" fill="currentColor" fill-opacity="0.1" stroke-linejoin="round"/>
            <ellipse cx="12.5" cy="6.5" rx="4.5" ry="2" fill="none"/>
            <path d="M16 8c1 1.5 2.5 4 2.5 6 0 1.5-1 2.5-2 2.5s-2-1-2-2.5c0-2 1.5-4.5 2.5-6z" fill="currentColor" stroke="none" opacity="0.6"/>
        </svg>`,
        stampCheck: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        stampX: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/>
        </svg>`,
        stampCircle: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="7" stroke="#3b82f6" stroke-width="2"/>
        </svg>`,
        stampDot: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="5" fill="#3b82f6"/>
        </svg>`,
        stampDate: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <path d="M3 10h18"/>
            <path d="M8 2v4M16 2v4"/>
        </svg>`,
        stampNa: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <text x="12" y="15" text-anchor="middle" font-size="10" font-weight="bold" fill="currentColor">N/A</text>
        </svg>`,
        patch: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="8" width="20" height="8" rx="2" fill="currentColor" fill-opacity="0.1"/>
            <line x1="8" y1="8" x2="8" y2="16"/>
            <line x1="16" y1="8" x2="16" y2="16"/>
            <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
            <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>
        </svg>`
    };

    /**
     * Collect all layers for current page
     * @returns {Array} Layer objects
     */
    function collectLayers() {
        const currentPage = core.get('currentPage');
        const textEdits = core.get('textEdits');
        const textOverlays = core.get('textOverlays');
        const signatures = core.get('signatures');
        const annotations = core.get('annotations');
        const layers = [];

        // Text edits
        textEdits.forEach((edit, index) => {
            if (edit.page === currentPage) {
                layers.push({
                    type: 'text-edit',
                    id: `edit-${edit.page}-${edit.index}`,
                    title: 'Text Edit',
                    preview: edit.newText,
                    page: edit.page,
                    editIndex: index,
                    dataIndex: edit.index
                });
            }
        });

        // Text overlays
        textOverlays.forEach((overlay, index) => {
            if (overlay.page === currentPage) {
                layers.push({
                    type: 'text-overlay',
                    id: overlay.id,
                    title: 'Text Overlay',
                    preview: overlay.text,
                    page: overlay.page,
                    overlayIndex: index
                });
            }
        });

        // Signatures
        signatures.forEach((sig, index) => {
            if (sig.page === currentPage) {
                layers.push({
                    type: 'signature',
                    id: sig.id,
                    title: 'Signature',
                    preview: 'Signature element',
                    page: sig.page,
                    signatureIndex: index,
                    signatureData: sig
                });
            }
        });

        // Annotations (draw, rectangle, circle)
        annotations.forEach((ann, index) => {
            if (ann.page === currentPage) {
                const typeNames = {
                    'draw': 'Drawing',
                    'rectangle': 'Rectangle',
                    'circle': 'Circle'
                };
                layers.push({
                    type: `annotation-${ann.type}`,
                    id: ann.id || `ann-${index}`,
                    title: typeNames[ann.type] || 'Annotation',
                    preview: `${ann.color || '#E50914'} annotation`,
                    page: ann.page,
                    annotationIndex: index,
                    annotationData: ann
                });
            }
        });

        // Fill areas
        if (typeof PDFoxAnnotations !== 'undefined') {
            const removedAreas = PDFoxAnnotations.getRemovedAreas();
            removedAreas.forEach((area, index) => {
                if (area.page === currentPage) {
                    layers.push({
                        type: 'fill',
                        id: `fill-${index}`,
                        title: 'Filled Area',
                        preview: `${Math.round(area.width)}x${Math.round(area.height)} px`,
                        page: area.page,
                        fillIndex: index,
                        fillData: area
                    });
                }
            });
        }

        // Stamps
        if (typeof PDFoxStamps !== 'undefined') {
            const stamps = PDFoxStamps.getStampsForCurrentPage();
            const stampNames = {
                check: 'Checkmark',
                x: 'X Mark',
                circle: 'Circle',
                dot: 'Dot',
                date: 'Date',
                na: 'N/A'
            };
            stamps.forEach((stamp, index) => {
                layers.push({
                    type: `stamp-${stamp.type}`,
                    id: stamp.id,
                    title: stampNames[stamp.type] || 'Stamp',
                    preview: stamp.text || stampNames[stamp.type],
                    page: stamp.page,
                    stampIndex: index,
                    stampData: stamp
                });
            });
        }

        // Patches
        if (typeof PDFoxPatch !== 'undefined') {
            const patches = PDFoxPatch.getPatchesForCurrentPage();
            patches.forEach((patch, index) => {
                layers.push({
                    type: 'patch',
                    id: patch.id,
                    title: 'Patch',
                    preview: `${Math.round(patch.width)}×${Math.round(patch.height)}`,
                    page: patch.page,
                    patchIndex: index,
                    patchData: patch
                });
            });
        }

        return layers;
    }

    /**
     * Create layer item element
     * @param {Object} layer - Layer data
     * @returns {HTMLElement}
     */
    function createLayerItem(layer) {
        const selectedLayerId = core.get('selectedLayerId');
        const isSelected = selectedLayerId === layer.id;

        let iconClass = '';
        let iconSvg = '';

        if (layer.type === 'text-edit') {
            iconClass = 'text-edit';
            iconSvg = icons.edit;
        } else if (layer.type === 'text-overlay') {
            iconClass = 'text-overlay';
            iconSvg = icons.edit;
        } else if (layer.type === 'signature') {
            iconClass = 'signature';
            iconSvg = icons.signature;
        } else if (layer.type === 'annotation-draw') {
            iconClass = 'annotation-draw';
            iconSvg = icons.draw;
        } else if (layer.type === 'annotation-rectangle') {
            iconClass = 'annotation-rectangle';
            iconSvg = icons.rectangle;
        } else if (layer.type === 'annotation-circle') {
            iconClass = 'annotation-circle';
            iconSvg = icons.circle;
        } else if (layer.type === 'fill') {
            iconClass = 'fill';
            iconSvg = icons.fill;
        } else if (layer.type === 'stamp-check') {
            iconClass = 'stamp-check';
            iconSvg = icons.stampCheck;
        } else if (layer.type === 'stamp-x') {
            iconClass = 'stamp-x';
            iconSvg = icons.stampX;
        } else if (layer.type === 'stamp-circle') {
            iconClass = 'stamp-circle';
            iconSvg = icons.stampCircle;
        } else if (layer.type === 'stamp-dot') {
            iconClass = 'stamp-dot';
            iconSvg = icons.stampDot;
        } else if (layer.type === 'stamp-date') {
            iconClass = 'stamp-date';
            iconSvg = icons.stampDate;
        } else if (layer.type === 'stamp-na') {
            iconClass = 'stamp-na';
            iconSvg = icons.stampNa;
        } else if (layer.type === 'patch') {
            iconClass = 'patch';
            iconSvg = icons.patch;
        }

        const previewText = layer.preview.length > 25
            ? layer.preview.substring(0, 25) + '...'
            : layer.preview;

        const item = createElement('div', {
            className: `layer-item${isSelected ? ' selected' : ''}`,
            dataset: { layerId: layer.id, layerType: layer.type }
        });

        // Build actions HTML - add duplicate button only for text-overlay
        const duplicateBtn = layer.type === 'text-overlay'
            ? `<button class="layer-action-btn duplicate" title="Duplicate" data-action="duplicate">${icons.duplicate}</button>`
            : '';

        // Hide edit button for annotations, stamps, and patches (they can't be edited, only deleted)
        // Fill areas CAN be edited (color change)
        const isNonEditable = layer.type.startsWith('annotation-') || layer.type.startsWith('stamp-') || layer.type === 'patch';
        const editBtn = !isNonEditable
            ? `<button class="layer-action-btn edit" title="${layer.type === 'fill' ? 'Change Color' : 'Edit'}" data-action="edit">${icons.editSmall}</button>`
            : '';

        item.innerHTML = `
            <div class="layer-item-icon ${iconClass}">${iconSvg}</div>
            <div class="layer-item-content">
                <div class="layer-item-title">${layer.title}</div>
                <div class="layer-item-preview">"${PDFoxUtils.escapeHtml(previewText)}"</div>
            </div>
            <div class="layer-item-actions">
                ${duplicateBtn}
                ${editBtn}
                <button class="layer-action-btn delete" title="Delete" data-action="delete">${icons.delete}</button>
            </div>
        `;

        // Event listeners
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.layer-action-btn')) {
                selectLayer(layer);
            }
        });

        // Duplicate button handler (only for text-overlay)
        const duplicateBtnEl = item.querySelector('[data-action="duplicate"]');
        if (duplicateBtnEl) {
            duplicateBtnEl.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                e.stopImmediatePropagation();
                duplicateLayer(layer);
            });
        }

        const editBtnEl = item.querySelector('[data-action="edit"]');
        if (editBtnEl) {
            editBtnEl.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                e.stopImmediatePropagation();
                editLayer(layer);
            });
        }

        item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            e.stopImmediatePropagation();
            deleteLayer(layer);
        });

        return item;
    }

    /**
     * Select layer and highlight on canvas
     * @param {Object} layer - Layer data
     */
    function selectLayer(layer) {
        core.set('selectedLayerId', layer.id);

        // Update panel selection
        document.querySelectorAll('.layer-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.layerId === layer.id);
        });

        // Highlight on canvas based on type
        if (layer.type === 'text-edit') {
            const textSpan = document.querySelector(
                `#textLayer span[data-index="${layer.dataIndex}"][data-page="${layer.page}"]`
            );
            if (textSpan) {
                highlightElement(textSpan);
                textSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else if (layer.type === 'text-overlay') {
            core.emit('overlay:select', layer.id);
            const element = document.getElementById(layer.id);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else if (layer.type === 'signature') {
            const element = document.querySelector(`[data-signature-id="${layer.id}"]`);
            if (element) {
                highlightElement(element);
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else if (layer.type.startsWith('annotation-')) {
            // Select annotation on canvas and switch to move tool
            if (typeof PDFoxAnnotations !== 'undefined') {
                PDFoxAnnotations.selectAnnotation(layer.annotationIndex);
            }
            if (typeof PDFoxApp !== 'undefined') {
                PDFoxApp.setTool('moveText');
            }
        } else if (layer.type === 'fill') {
            // Select fill area and switch to move tool
            if (typeof PDFoxAnnotations !== 'undefined') {
                PDFoxAnnotations.selectFillArea(layer.fillIndex);
            }
            if (typeof PDFoxApp !== 'undefined') {
                PDFoxApp.setTool('moveText');
            }
        } else if (layer.type.startsWith('stamp-')) {
            // Select stamp and switch to move tool
            if (typeof PDFoxStamps !== 'undefined') {
                PDFoxStamps.selectStamp(layer.id);
            }
            if (typeof PDFoxApp !== 'undefined') {
                PDFoxApp.setTool('moveText');
            }
        } else if (layer.type === 'patch') {
            // Select patch and switch to move tool
            if (typeof PDFoxPatch !== 'undefined') {
                PDFoxPatch.selectPatch(layer.id);
            }
            if (typeof PDFoxApp !== 'undefined') {
                PDFoxApp.setTool('moveText');
            }
        }

        core.emit('layer:selected', layer);
    }

    /**
     * Highlight element temporarily
     * @param {HTMLElement} element - Element to highlight
     */
    function highlightElement(element) {
        document.querySelectorAll('.layer-highlight').forEach(el => {
            el.classList.remove('layer-highlight');
        });

        element.classList.add('layer-highlight');
        element.style.animation = 'layerHighlight 0.5s ease-out';

        setTimeout(() => {
            element.style.animation = '';
        }, 500);
    }

    /**
     * Edit layer
     * @param {Object} layer - Layer data
     */
    function editLayer(layer) {
        core.emit('layer:edit', layer);
    }

    /**
     * Duplicate layer
     * @param {Object} layer - Layer data
     */
    function duplicateLayer(layer) {
        core.emit('layer:duplicate', layer);
    }

    /**
     * Delete layer
     * @param {Object} layer - Layer data
     */
    function deleteLayer(layer) {
        const messages = {
            'text-edit': 'Delete this text edit?',
            'text-overlay': 'Delete this text overlay?',
            'signature': 'Delete this signature?',
            'annotation-draw': 'Delete this drawing?',
            'annotation-rectangle': 'Delete this rectangle?',
            'annotation-circle': 'Delete this circle?',
            'fill': 'Delete this filled area?',
            'stamp-check': 'Delete this checkmark?',
            'stamp-x': 'Delete this X mark?',
            'stamp-circle': 'Delete this circle stamp?',
            'stamp-dot': 'Delete this dot stamp?',
            'stamp-date': 'Delete this date stamp?',
            'stamp-na': 'Delete this N/A stamp?',
            'patch': 'Delete this patch?'
        };

        ui.showConfirm(messages[layer.type] || 'Delete this item?', (confirmed) => {
            if (confirmed) {
                core.emit('layer:delete', layer);
                core.set('selectedLayerId', null);
                PDFoxLayers.render();
            }
        });
    }

    return {
        /**
         * Initialize layers panel
         */
        init() {
            // Subscribe to state changes
            core.on('textEdits:changed', () => this.render());
            core.on('textOverlays:changed', () => this.render());
            core.on('signatures:changed', () => this.render());
            core.on('annotations:changed', () => this.render());
            core.on('page:rendered', () => this.render());

            // Subscribe to selection changes (for canvas-initiated selection)
            core.on('selectedLayerId:changed', () => this.render());

            // Handle annotation deletion from layers panel
            core.on('layer:delete', (layer) => {
                if (layer.type.startsWith('annotation-')) {
                    core.removeAt('annotations', layer.annotationIndex);
                    if (typeof PDFoxAnnotations !== 'undefined') {
                        PDFoxAnnotations.redraw();
                    }
                    ui.showNotification('Annotation deleted', 'success');
                } else if (layer.type === 'fill') {
                    if (typeof PDFoxAnnotations !== 'undefined') {
                        PDFoxAnnotations.removeRedactedArea(layer.fillIndex);
                    }
                    ui.showNotification('Filled area removed', 'success');
                } else if (layer.type.startsWith('stamp-')) {
                    if (typeof PDFoxStamps !== 'undefined') {
                        PDFoxStamps.deleteStamp(layer.id);
                    }
                } else if (layer.type === 'patch') {
                    if (typeof PDFoxPatch !== 'undefined') {
                        PDFoxPatch.deletePatch(layer.id);
                    }
                }
            });

            // Subscribe to fill area changes
            core.on('area:removed', () => this.render());

            // Subscribe to stamp changes
            core.on('stamps:changed', () => this.render());

            // Subscribe to patch changes
            core.on('patches:changed', () => this.render());
        },

        /**
         * Render layers panel
         */
        render() {
            const layersList = document.getElementById('layersList');
            const layerCount = document.getElementById('layerCount');

            if (!layersList || !layerCount) return;

            const layers = collectLayers();
            const textEdits = core.get('textEdits');
            const textOverlays = core.get('textOverlays');
            const signatures = core.get('signatures');
            const annotations = core.get('annotations');
            const totalLayers = textEdits.length + textOverlays.length + signatures.length + annotations.length;

            layerCount.textContent = totalLayers;

            if (layers.length === 0) {
                layersList.innerHTML = `
                    <div class="layers-empty">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                            <polyline points="2 17 12 22 22 17"/>
                            <polyline points="2 12 12 17 22 12"/>
                        </svg>
                        <div>No layers on this page</div>
                        <div style="font-size: 11px; margin-top: 4px;">Edit or add text to create layers</div>
                    </div>
                `;
                return;
            }

            layersList.innerHTML = '';
            layers.forEach(layer => {
                layersList.appendChild(createLayerItem(layer));
            });
        },

        /**
         * Select layer by ID
         * @param {string} id - Layer ID
         */
        selectById(id) {
            const layers = collectLayers();
            const layer = layers.find(l => l.id === id);
            if (layer) {
                selectLayer(layer);
            }
        },

        /**
         * Highlight element temporarily (public method)
         * @param {HTMLElement} element - Element to highlight
         */
        highlightElement
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxLayers;
}
