/**
 * PDFOX Context Menu Module
 * Custom right-click context menu for the PDF editor
 * Provides context-sensitive actions based on where user clicks
 */

const PDFoxContextMenu = (function() {
    'use strict';

    const core = PDFoxCore;
    const ui = PDFoxUI;

    let menuElement = null;
    let currentContext = null;

    // SVG Icons
    const icons = {
        undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6.36 2.64L3 13"/></svg>`,
        redo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016.36 2.64L21 13"/></svg>`,
        copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
        paste: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/></svg>`,
        delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`,
        edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
        zoomIn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>`,
        zoomOut: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M8 11h6"/></svg>`,
        zoomFit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18" stroke-dasharray="2 2" opacity="0.5"/></svg>`,
        rotate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`,
        save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
        download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        addText: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`,
        draw: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>`,
        fill: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3.5 19.5L9 8l8.5 4.5-5.5 11.5z" fill="currentColor" fill-opacity="0.2"/><ellipse cx="12.5" cy="6.5" rx="4.5" ry="2"/></svg>`,
        signature: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17c3.5-3.5 7-7 11-4s3 6-1 9"/><path d="M17 22l4-4"/></svg>`,
        layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
        pdfox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
        selectAll: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/><path d="M9 12l2 2 4-4"/></svg>`,
        duplicate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
        moveUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`,
        moveDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>`,
        help: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
    };

    /**
     * Create the context menu element
     */
    function createMenu() {
        menuElement = document.createElement('div');
        menuElement.className = 'context-menu';
        menuElement.id = 'pdfoxContextMenu';
        document.body.appendChild(menuElement);
    }

    /**
     * Build menu HTML based on context
     * @param {string} context - Context type (canvas, toolbar, layer, element)
     * @param {Object} data - Additional context data
     */
    function buildMenuItems(context, data = {}) {
        const items = [];

        // Header
        items.push(`
            <div class="context-menu-header">
                <div class="context-menu-header-icon">${icons.pdfox}</div>
                <div class="context-menu-header-text">
                    <div class="context-menu-header-title">PDFOX Editor</div>
                    <div class="context-menu-header-subtitle">${getContextLabel(context)}</div>
                </div>
            </div>
        `);

        // Context-specific items
        switch (context) {
            case 'canvas':
                items.push(buildCanvasMenuItems(data));
                break;
            case 'element':
                items.push(buildElementMenuItems(data));
                break;
            case 'toolbar':
                items.push(buildToolbarMenuItems(data));
                break;
            case 'layer':
                items.push(buildLayerMenuItems(data));
                break;
            default:
                items.push(buildDefaultMenuItems());
        }

        return items.join('');
    }

    /**
     * Get human-readable context label
     */
    function getContextLabel(context) {
        const labels = {
            canvas: 'Document Actions',
            element: 'Element Options',
            toolbar: 'Quick Tools',
            layer: 'Layer Actions'
        };
        return labels[context] || 'Actions';
    }

    /**
     * Build canvas context menu items
     */
    function buildCanvasMenuItems(data) {
        const hasHistory = core.get('historyIndex') > 0;
        const canRedo = core.get('historyIndex') < (core.get('history')?.length || 0) - 1;

        return `
            <div class="context-menu-group-label">Edit</div>
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('undo')" ${!hasHistory ? 'disabled' : ''}>
                <span class="context-menu-item-icon">${icons.undo}</span>
                <span class="context-menu-item-label">Undo</span>
                <span class="context-menu-item-shortcut">Ctrl+Z</span>
            </button>
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('redo')" ${!canRedo ? 'disabled' : ''}>
                <span class="context-menu-item-icon">${icons.redo}</span>
                <span class="context-menu-item-label">Redo</span>
                <span class="context-menu-item-shortcut">Ctrl+Y</span>
            </button>

            <div class="context-menu-divider"></div>
            <div class="context-menu-group-label">Insert</div>

            <button class="context-menu-item" onclick="PDFoxContextMenu.action('addText')">
                <span class="context-menu-item-icon">${icons.addText}</span>
                <span class="context-menu-item-label">Add Text</span>
                <span class="context-menu-item-shortcut">T</span>
            </button>
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('signature')">
                <span class="context-menu-item-icon">${icons.signature}</span>
                <span class="context-menu-item-label">Add Signature</span>
                <span class="context-menu-item-shortcut">S</span>
            </button>
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('draw')">
                <span class="context-menu-item-icon">${icons.draw}</span>
                <span class="context-menu-item-label">Draw</span>
                <span class="context-menu-item-shortcut">D</span>
            </button>
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('fill')">
                <span class="context-menu-item-icon">${icons.fill}</span>
                <span class="context-menu-item-label">Fill Area</span>
                <span class="context-menu-item-shortcut">6</span>
            </button>

            <div class="context-menu-divider"></div>
            <div class="context-menu-group-label">View</div>

            <button class="context-menu-item" onclick="PDFoxContextMenu.action('zoomIn')">
                <span class="context-menu-item-icon">${icons.zoomIn}</span>
                <span class="context-menu-item-label">Zoom In</span>
                <span class="context-menu-item-shortcut">+</span>
            </button>
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('zoomOut')">
                <span class="context-menu-item-icon">${icons.zoomOut}</span>
                <span class="context-menu-item-label">Zoom Out</span>
                <span class="context-menu-item-shortcut">-</span>
            </button>
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('zoomFit')">
                <span class="context-menu-item-icon">${icons.zoomFit}</span>
                <span class="context-menu-item-label">Fit to View</span>
                <span class="context-menu-item-shortcut">0</span>
            </button>

            <div class="context-menu-divider"></div>
            <div class="context-menu-group-label">Page</div>

            <button class="context-menu-item" onclick="PDFoxContextMenu.action('rotatePage')">
                <span class="context-menu-item-icon">${icons.rotate}</span>
                <span class="context-menu-item-label">Rotate Page</span>
                <span class="context-menu-item-shortcut">R</span>
            </button>

            <div class="context-menu-divider"></div>

            <button class="context-menu-item primary" onclick="PDFoxContextMenu.action('save')">
                <span class="context-menu-item-icon">${icons.download}</span>
                <span class="context-menu-item-label">Save PDF</span>
                <span class="context-menu-item-shortcut">Ctrl+S</span>
            </button>
        `;
    }

    /**
     * Build element context menu items
     */
    function buildElementMenuItems(data) {
        return `
            <div class="context-menu-group-label">Element</div>
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('edit')">
                <span class="context-menu-item-icon">${icons.edit}</span>
                <span class="context-menu-item-label">Edit</span>
            </button>
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('duplicate')">
                <span class="context-menu-item-icon">${icons.duplicate}</span>
                <span class="context-menu-item-label">Duplicate</span>
                <span class="context-menu-item-shortcut">Ctrl+D</span>
            </button>
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('copy')">
                <span class="context-menu-item-icon">${icons.copy}</span>
                <span class="context-menu-item-label">Copy</span>
                <span class="context-menu-item-shortcut">Ctrl+C</span>
            </button>

            <div class="context-menu-divider"></div>
            <div class="context-menu-group-label">Arrange</div>

            <button class="context-menu-item" onclick="PDFoxContextMenu.action('moveUp')">
                <span class="context-menu-item-icon">${icons.moveUp}</span>
                <span class="context-menu-item-label">Bring Forward</span>
            </button>
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('moveDown')">
                <span class="context-menu-item-icon">${icons.moveDown}</span>
                <span class="context-menu-item-label">Send Backward</span>
            </button>

            <div class="context-menu-divider"></div>

            <button class="context-menu-item danger" onclick="PDFoxContextMenu.action('delete')">
                <span class="context-menu-item-icon">${icons.delete}</span>
                <span class="context-menu-item-label">Delete</span>
                <span class="context-menu-item-shortcut">Del</span>
            </button>
        `;
    }

    /**
     * Build toolbar context menu items
     */
    function buildToolbarMenuItems(data) {
        return `
            <div class="context-menu-group-label">Quick Actions</div>
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('undo')">
                <span class="context-menu-item-icon">${icons.undo}</span>
                <span class="context-menu-item-label">Undo</span>
                <span class="context-menu-item-shortcut">Ctrl+Z</span>
            </button>
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('redo')">
                <span class="context-menu-item-icon">${icons.redo}</span>
                <span class="context-menu-item-label">Redo</span>
                <span class="context-menu-item-shortcut">Ctrl+Y</span>
            </button>

            <div class="context-menu-divider"></div>

            <button class="context-menu-item" onclick="PDFoxContextMenu.action('layers')">
                <span class="context-menu-item-icon">${icons.layers}</span>
                <span class="context-menu-item-label">Toggle Layers</span>
                <span class="context-menu-item-shortcut">L</span>
            </button>

            <div class="context-menu-divider"></div>

            <button class="context-menu-item" onclick="PDFoxContextMenu.action('help')">
                <span class="context-menu-item-icon">${icons.help}</span>
                <span class="context-menu-item-label">Keyboard Shortcuts</span>
                <span class="context-menu-item-shortcut">?</span>
            </button>
        `;
    }

    /**
     * Build layer context menu items
     */
    function buildLayerMenuItems(data) {
        return `
            <div class="context-menu-group-label">Layer</div>
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('edit')">
                <span class="context-menu-item-icon">${icons.edit}</span>
                <span class="context-menu-item-label">Edit Layer</span>
            </button>
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('duplicate')">
                <span class="context-menu-item-icon">${icons.duplicate}</span>
                <span class="context-menu-item-label">Duplicate Layer</span>
            </button>

            <div class="context-menu-divider"></div>

            <button class="context-menu-item danger" onclick="PDFoxContextMenu.action('delete')">
                <span class="context-menu-item-icon">${icons.delete}</span>
                <span class="context-menu-item-label">Delete Layer</span>
            </button>
        `;
    }

    /**
     * Build default menu items
     */
    function buildDefaultMenuItems() {
        return `
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('undo')">
                <span class="context-menu-item-icon">${icons.undo}</span>
                <span class="context-menu-item-label">Undo</span>
                <span class="context-menu-item-shortcut">Ctrl+Z</span>
            </button>
            <button class="context-menu-item" onclick="PDFoxContextMenu.action('redo')">
                <span class="context-menu-item-icon">${icons.redo}</span>
                <span class="context-menu-item-label">Redo</span>
                <span class="context-menu-item-shortcut">Ctrl+Y</span>
            </button>

            <div class="context-menu-divider"></div>

            <button class="context-menu-item primary" onclick="PDFoxContextMenu.action('save')">
                <span class="context-menu-item-icon">${icons.download}</span>
                <span class="context-menu-item-label">Save PDF</span>
            </button>
        `;
    }

    /**
     * Show context menu at position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {string} context - Context type
     * @param {Object} data - Additional context data
     */
    function show(x, y, context = 'canvas', data = {}) {
        if (!menuElement) createMenu();

        currentContext = { type: context, data };
        menuElement.innerHTML = buildMenuItems(context, data);

        // Position the menu
        const menuWidth = 240;
        const menuHeight = menuElement.offsetHeight || 400;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Determine origin class for animation
        let originClass = '';
        let finalX = x;
        let finalY = y;

        // Adjust if menu would go off-screen
        if (x + menuWidth > viewportWidth) {
            finalX = x - menuWidth;
            originClass = 'origin-top-right';
        }
        if (y + menuHeight > viewportHeight) {
            finalY = y - menuHeight;
            originClass = originClass.includes('right') ? 'origin-bottom-right' : 'origin-bottom-left';
        }

        // Ensure menu stays within viewport
        finalX = Math.max(8, Math.min(finalX, viewportWidth - menuWidth - 8));
        finalY = Math.max(8, Math.min(finalY, viewportHeight - menuHeight - 8));

        menuElement.style.left = `${finalX}px`;
        menuElement.style.top = `${finalY}px`;
        menuElement.className = `context-menu ${originClass}`;

        // Show with animation
        requestAnimationFrame(() => {
            menuElement.classList.add('visible');
        });
    }

    /**
     * Hide context menu
     */
    function hide() {
        if (menuElement) {
            menuElement.classList.remove('visible');
        }
    }

    /**
     * Handle menu action
     * @param {string} actionName - Action to perform
     */
    function action(actionName) {
        hide();

        switch (actionName) {
            case 'undo':
                if (typeof PDFoxApp !== 'undefined') PDFoxApp.undo();
                break;
            case 'redo':
                if (typeof PDFoxApp !== 'undefined') PDFoxApp.redo();
                break;
            case 'save':
                if (typeof PDFoxApp !== 'undefined') PDFoxApp.savePdf();
                break;
            case 'addText':
                if (typeof PDFoxApp !== 'undefined') PDFoxApp.setTool('addText');
                break;
            case 'signature':
                if (typeof PDFoxSignatures !== 'undefined') PDFoxSignatures.openModal();
                break;
            case 'draw':
                if (typeof PDFoxApp !== 'undefined') PDFoxApp.setTool('draw');
                break;
            case 'fill':
                if (typeof PDFoxApp !== 'undefined') PDFoxApp.setTool('fill');
                break;
            case 'zoomIn':
                if (typeof PDFoxApp !== 'undefined') PDFoxApp.zoomIn();
                break;
            case 'zoomOut':
                if (typeof PDFoxApp !== 'undefined') PDFoxApp.zoomOut();
                break;
            case 'zoomFit':
                if (typeof PDFoxApp !== 'undefined') PDFoxApp.zoomFit();
                break;
            case 'rotatePage':
                if (typeof PDFoxApp !== 'undefined') PDFoxApp.rotatePage(90);
                break;
            case 'layers':
                if (typeof PDFoxLayers !== 'undefined') PDFoxLayers.toggle();
                break;
            case 'help':
                // Toggle keyboard shortcuts modal
                const shortcutsModal = document.getElementById('shortcutsModal');
                if (shortcutsModal) {
                    shortcutsModal.classList.toggle('active');
                }
                break;
            case 'copy':
                document.execCommand('copy');
                break;
            case 'paste':
                document.execCommand('paste');
                break;
            case 'delete':
                // Trigger delete for selected element
                const event = new KeyboardEvent('keydown', { key: 'Delete' });
                document.dispatchEvent(event);
                break;
            case 'duplicate':
                // Trigger Ctrl+D
                const dupEvent = new KeyboardEvent('keydown', { key: 'd', ctrlKey: true });
                document.dispatchEvent(dupEvent);
                break;
            case 'edit':
                // Emit edit event for current context
                if (currentContext?.data?.layer) {
                    core.emit('layer:edit', currentContext.data.layer);
                }
                break;
            default:
                console.log('Context menu action:', actionName);
        }
    }

    /**
     * Determine context from event target
     * @param {HTMLElement} target - Event target
     * @returns {Object} Context info
     */
    function getContextFromTarget(target) {
        // Check if clicking on a layer item
        const layerItem = target.closest('.layer-item');
        if (layerItem) {
            return {
                type: 'layer',
                data: {
                    layerId: layerItem.dataset.layerId,
                    layerType: layerItem.dataset.layerType
                }
            };
        }

        // Check if clicking on toolbar
        if (target.closest('.toolbar')) {
            return { type: 'toolbar', data: {} };
        }

        // Check if clicking on an overlay element
        const overlay = target.closest('.text-overlay, .signature-container, .stamp-element, .patch-element');
        if (overlay) {
            return {
                type: 'element',
                data: {
                    elementId: overlay.id,
                    elementType: overlay.className.split(' ')[0]
                }
            };
        }

        // Check if clicking on canvas area
        if (target.closest('.canvas-container, #pdfCanvas, #annotationCanvas, #overlayLayer')) {
            return { type: 'canvas', data: {} };
        }

        // Default
        return { type: 'canvas', data: {} };
    }

    /**
     * Initialize context menu
     */
    function init() {
        createMenu();

        // Global right-click handler
        document.addEventListener('contextmenu', (e) => {
            // Allow default context menu on input/textarea elements
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // Check if we're in the PDF editor
            const isInEditor = e.target.closest('#pdfEditor, .toolbar, .canvas-container, .layers-panel');
            if (!isInEditor) {
                return; // Allow default menu outside editor
            }

            e.preventDefault();

            const context = getContextFromTarget(e.target);
            show(e.clientX, e.clientY, context.type, context.data);
        });

        // Close menu on click outside
        document.addEventListener('click', (e) => {
            if (menuElement && !menuElement.contains(e.target)) {
                hide();
            }
        });

        // Close menu on scroll
        document.addEventListener('scroll', hide, true);

        // Close menu on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hide();
            }
        });

        // Close menu on window resize
        window.addEventListener('resize', hide);
    }

    return {
        init,
        show,
        hide,
        action
    };
})();

// Export for ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxContextMenu;
}
