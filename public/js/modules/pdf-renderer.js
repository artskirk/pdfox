/**
 * PDFOX PDF Renderer Module
 * Handles PDF loading, rendering, and page navigation
 * Single Responsibility: PDF document operations
 */

const PDFoxRenderer = (function() {
    'use strict';

    const core = PDFoxCore;
    const ui = PDFoxUI;

    // Canvas references
    let pdfCanvas, pdfContext;
    let annotationCanvas, annotationContext;
    let textLayer;

    // Text content storage per page
    const textContentCache = {};

    return {
        /**
         * Initialize renderer with canvas elements
         * @param {Object} elements - Canvas elements
         */
        init(elements) {
            pdfCanvas = elements.pdfCanvas;
            pdfContext = pdfCanvas.getContext('2d');
            annotationCanvas = elements.annotationCanvas;
            annotationContext = annotationCanvas.getContext('2d');
            textLayer = elements.textLayer;
        },

        /**
         * Load PDF from URL or array buffer
         * @param {string|ArrayBuffer} source - PDF source
         * @returns {Promise}
         */
        async loadPDF(source) {
            ui.showLoading('Loading PDF...');

            try {
                const loadingTask = pdfjsLib.getDocument(source);
                const pdfDoc = await loadingTask.promise;

                core.set('pdfDoc', pdfDoc);
                core.set('totalPages', pdfDoc.numPages);
                core.set('currentPage', 1);

                // Store PDF bytes for saving
                if (source instanceof ArrayBuffer) {
                    core.set('pdfBytes', source);
                }

                await this.renderPage(1);
                ui.updatePageInfo(1, pdfDoc.numPages);

                core.emit('pdf:loaded', { totalPages: pdfDoc.numPages });
                ui.hideLoading();

                return pdfDoc;
            } catch (error) {
                ui.hideLoading();
                ui.showAlert('Failed to load PDF: ' + error.message, 'error');
                throw error;
            }
        },

        /**
         * Render specific page
         * @param {number} pageNum - Page number
         * @returns {Promise}
         */
        async renderPage(pageNum) {
            const pdfDoc = core.get('pdfDoc');
            if (!pdfDoc) return;

            ui.showLoading('Rendering page...');

            try {
                const page = await pdfDoc.getPage(pageNum);
                const scale = core.get('scale');
                const viewport = page.getViewport({ scale });

                // Set canvas dimensions
                pdfCanvas.width = viewport.width;
                pdfCanvas.height = viewport.height;
                annotationCanvas.width = viewport.width;
                annotationCanvas.height = viewport.height;

                // Clear canvases
                pdfContext.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
                annotationContext.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

                // Render PDF page
                await page.render({
                    canvasContext: pdfContext,
                    viewport: viewport
                }).promise;

                // Render text layer
                await this.renderTextLayer(page, viewport, pageNum);

                core.set('currentPage', pageNum);
                ui.updatePageInfo(pageNum, core.get('totalPages'));

                core.emit('page:rendered', { pageNum, viewport });
                ui.hideLoading();

            } catch (error) {
                ui.hideLoading();
                console.error('Error rendering page:', error);
            }
        },

        /**
         * Render text layer for selection and editing
         * @param {Object} page - PDF page object
         * @param {Object} viewport - Viewport object
         * @param {number} pageNum - Page number
         */
        async renderTextLayer(page, viewport, pageNum) {
            // Clear existing text layer
            textLayer.innerHTML = '';
            textLayer.style.width = viewport.width + 'px';
            textLayer.style.height = viewport.height + 'px';

            const textContent = await page.getTextContent();
            textContentCache[pageNum] = textContent;

            const textEdits = core.get('textEdits');

            textContent.items.forEach((item, index) => {
                const tx = pdfjsLib.Util.transform(
                    viewport.transform,
                    item.transform
                );

                const span = document.createElement('span');
                span.textContent = item.str;
                span.dataset.index = index;
                span.dataset.page = pageNum;

                // Apply positioning
                const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
                span.style.left = tx[4] + 'px';
                span.style.top = (tx[5] - fontSize) + 'px';
                span.style.fontSize = fontSize + 'px';
                span.style.fontFamily = item.fontName || 'sans-serif';

                // Check for existing edits
                const edit = textEdits.find(e => e.page === pageNum && e.index === index);
                if (edit) {
                    span.textContent = edit.newText;
                    span.classList.add('edited');
                    span.title = `Edited from: "${edit.originalText}"`;

                    // Apply custom styling if present
                    if (edit.customFontSize) span.style.fontSize = edit.customFontSize + 'px';
                    if (edit.customColor) span.style.color = edit.customColor;
                    if (edit.customFontFamily) span.style.fontFamily = edit.customFontFamily;
                    if (edit.customBgColor) span.style.background = edit.customBgColor;

                    // Position from edit data if available
                    if (edit.x !== undefined) span.style.left = edit.x + 'px';
                    if (edit.y !== undefined) span.style.top = edit.y + 'px';
                }

                textLayer.appendChild(span);
            });

            core.emit('textLayer:rendered', { pageNum });
        },

        /**
         * Navigate to previous page
         */
        prevPage() {
            const current = core.get('currentPage');
            if (current > 1) {
                this.renderPage(current - 1);
            }
        },

        /**
         * Navigate to next page
         */
        nextPage() {
            const current = core.get('currentPage');
            const total = core.get('totalPages');
            if (current < total) {
                this.renderPage(current + 1);
            }
        },

        /**
         * Go to specific page
         * @param {number} pageNum - Target page number
         */
        goToPage(pageNum) {
            const total = core.get('totalPages');
            if (pageNum >= 1 && pageNum <= total) {
                this.renderPage(pageNum);
            }
        },

        /**
         * Set zoom scale
         * @param {number} scale - Zoom scale
         */
        setScale(scale) {
            core.set('scale', scale);
            this.renderPage(core.get('currentPage'));
        },

        /**
         * Get text content for page
         * @param {number} pageNum - Page number
         * @returns {Object} Text content
         */
        getTextContent(pageNum) {
            return textContentCache[pageNum] || null;
        },

        /**
         * Get canvas dimensions
         * @returns {Object} Width and height
         */
        getCanvasSize() {
            return {
                width: pdfCanvas.width,
                height: pdfCanvas.height
            };
        },

        /**
         * Get annotation canvas context
         * @returns {CanvasRenderingContext2D}
         */
        getAnnotationContext() {
            return annotationContext;
        },

        /**
         * Clear annotation canvas
         */
        clearAnnotations() {
            annotationContext.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
        }
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxRenderer;
}
