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
        layers: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
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
        }

        const previewText = layer.preview.length > 25
            ? layer.preview.substring(0, 25) + '...'
            : layer.preview;

        const item = createElement('div', {
            className: `layer-item${isSelected ? ' selected' : ''}`,
            dataset: { layerId: layer.id, layerType: layer.type }
        });

        item.innerHTML = `
            <div class="layer-item-icon ${iconClass}">${iconSvg}</div>
            <div class="layer-item-content">
                <div class="layer-item-title">${layer.title}</div>
                <div class="layer-item-preview">"${PDFoxUtils.escapeHtml(previewText)}"</div>
            </div>
            <div class="layer-item-actions">
                <button class="layer-action-btn edit" title="Edit" data-action="edit">${icons.editSmall}</button>
                <button class="layer-action-btn delete" title="Delete" data-action="delete">${icons.delete}</button>
            </div>
        `;

        // Event listeners
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.layer-action-btn')) {
                selectLayer(layer);
            }
        });

        item.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
            e.stopPropagation();
            editLayer(layer);
        });

        item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
            e.stopPropagation();
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
     * Delete layer
     * @param {Object} layer - Layer data
     */
    function deleteLayer(layer) {
        const messages = {
            'text-edit': 'Delete this text edit?',
            'text-overlay': 'Delete this text overlay?',
            'signature': 'Delete this signature?'
        };

        ui.showConfirm(messages[layer.type], (confirmed) => {
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
            core.on('page:rendered', () => this.render());
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
            const totalLayers = textEdits.length + textOverlays.length + signatures.length;

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
