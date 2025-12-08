/**
 * PDFOX AI Text Recognition Module
 * Handles smart text extraction from PDF regions using Tesseract.js
 * Single Responsibility: AI text recognition and results display
 */

const PDFoxOCR = (function() {
    'use strict';

    const core = PDFoxCore;
    const ui = PDFoxUI;

    // OCR state
    let ocrWorker = null;
    let ocrCache = new Map();
    let currentExtraction = null;

    /**
     * Initialize OCR worker
     * @returns {Promise} Tesseract worker
     */
    async function initWorker() {
        if (!ocrWorker) {
            ui.showLoading('Starting AI Text Recognition...');
            try {
                ocrWorker = await Tesseract.createWorker('eng', 1, {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            const progress = Math.round(m.progress * 100);
                            ui.showLoading(`AI analyzing text... ${progress}%`);
                        }
                    }
                });
                console.log('AI text recognition initialized');
            } catch (error) {
                console.error('Failed to initialize OCR:', error);
                ui.hideLoading();
                throw error;
            }
        }
        return ocrWorker;
    }

    /**
     * Extract text from a selected region
     * @param {Object} selection - Selection object with x, y, width, height, page
     */
    async function extractFromSelection(selection) {
        if (!selection || selection.width < 20 || selection.height < 20) {
            ui.showNotification('Selection too small - please select a larger area', 'warning');
            return;
        }

        ui.showLoading('AI is reading your document...');

        try {
            const pdfDoc = core.get('pdfDoc');
            const scale = core.get('scale');

            if (!pdfDoc) {
                throw new Error('No PDF loaded');
            }

            // Get the page
            const page = await pdfDoc.getPage(selection.page);

            // Create a high-resolution canvas for OCR (2x scale for better accuracy)
            const ocrScale = 2.0;
            const viewport = page.getViewport({ scale: ocrScale });

            const ocrCanvas = document.createElement('canvas');
            ocrCanvas.width = viewport.width;
            ocrCanvas.height = viewport.height;
            const ocrCtx = ocrCanvas.getContext('2d');

            // Render page to canvas
            await page.render({
                canvasContext: ocrCtx,
                viewport: viewport
            }).promise;

            // Calculate crop coordinates (scale from display to OCR canvas)
            const scaleFactor = ocrScale / scale;
            const cropX = Math.max(0, selection.x * scaleFactor);
            const cropY = Math.max(0, selection.y * scaleFactor);
            const cropWidth = Math.min(selection.width * scaleFactor, viewport.width - cropX);
            const cropHeight = Math.min(selection.height * scaleFactor, viewport.height - cropY);

            // Create cropped canvas
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropWidth;
            cropCanvas.height = cropHeight;
            const cropCtx = cropCanvas.getContext('2d');

            cropCtx.drawImage(
                ocrCanvas,
                cropX, cropY, cropWidth, cropHeight,
                0, 0, cropWidth, cropHeight
            );

            // Initialize worker and run OCR
            const worker = await initWorker();
            const { data } = await worker.recognize(cropCanvas);

            ui.hideLoading();

            if (data.text.trim().length === 0) {
                ui.showNotification('No text found in selected area', 'info');
                return;
            }

            // Store extraction result
            currentExtraction = {
                rect: { ...selection },
                text: data.text,
                words: data.words,
                confidence: data.confidence,
                page: selection.page
            };

            // Show results
            showResultsModal(currentExtraction);

            console.log(`OCR completed: ${data.words.length} words, confidence: ${data.confidence.toFixed(1)}%`);

        } catch (error) {
            ui.hideLoading();
            console.error('OCR error:', error);
            console.error('OCR failed:', error);
            ui.showAlert('Sorry, we couldn\'t extract text from this area. Please try again.', 'error');
        }
    }

    /**
     * Show OCR results modal
     * @param {Object} extraction - Extraction result
     */
    function showResultsModal(extraction) {
        // Use unified text editor
        if (typeof PDFoxUnifiedTextEditor !== 'undefined') {
            PDFoxUnifiedTextEditor.showOcrResult(extraction);
        }
    }

    /**
     * Create the OCR results modal
     * @returns {HTMLElement} Modal element
     */
    function createResultsModal() {
        const modal = document.createElement('div');
        modal.id = 'ocrResultsModal';
        modal.className = 'edit-modal-overlay';
        modal.innerHTML = `
            <div class="edit-modal" style="max-width: 550px;">
                <div class="edit-modal-header">
                    <h3>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="margin-right: 8px; vertical-align: middle;">
                            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
                            <path d="M7 8h10M7 12h10M7 16h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        Extracted Text
                    </h3>
                    <span id="ocrConfidence" style="font-size: 12px; color: var(--color-text-muted);"></span>
                </div>
                <div class="edit-modal-body">
                    <textarea id="ocrResultsText" placeholder="Extracted text will appear here..."
                        style="width: 100%; min-height: 180px; padding: 12px; border: 1px solid var(--color-border);
                        border-radius: 8px; background: var(--color-bg-tertiary); color: var(--color-text-primary);
                        font-size: 14px; line-height: 1.5; resize: vertical;"></textarea>

                    <!-- Text Formatting Options -->
                    <div class="ocr-format-options" style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; padding: 12px;
                        background: var(--color-bg-tertiary); border-radius: 8px; border: 1px solid var(--color-border);">

                        <!-- Text Color -->
                        <div class="ocr-option-group" style="display: flex; align-items: center; gap: 6px;">
                            <label style="font-size: 12px; color: var(--color-text-muted); white-space: nowrap;">Text:</label>
                            <input type="color" id="ocrTextColor" value="#000000"
                                style="width: 28px; height: 28px; border: none; border-radius: 4px; cursor: pointer; padding: 0;">
                        </div>

                        <!-- Background Color -->
                        <div class="ocr-option-group" style="display: flex; align-items: center; gap: 6px;">
                            <label style="font-size: 12px; color: var(--color-text-muted); white-space: nowrap;">Background:</label>
                            <input type="color" id="ocrBgColor" value="#ffffff"
                                style="width: 28px; height: 28px; border: none; border-radius: 4px; cursor: pointer; padding: 0;">
                        </div>

                        <!-- Transparent Toggle -->
                        <div class="ocr-option-group" style="display: flex; align-items: center; gap: 6px;">
                            <label class="ocr-checkbox-label" style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px; color: var(--color-text-muted);">
                                <input type="checkbox" id="ocrTransparentBg"
                                    style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--color-primary);">
                                <span>Transparent</span>
                            </label>
                        </div>

                        <!-- Font Size -->
                        <div class="ocr-option-group" style="display: flex; align-items: center; gap: 6px;">
                            <label style="font-size: 12px; color: var(--color-text-muted); white-space: nowrap;">Size:</label>
                            <select id="ocrFontSize" style="padding: 4px 8px; border: 1px solid var(--color-border);
                                border-radius: 4px; background: var(--color-bg-secondary); color: var(--color-text-primary);
                                font-size: 12px; cursor: pointer;">
                                <option value="10">10px</option>
                                <option value="12">12px</option>
                                <option value="14" selected>14px</option>
                                <option value="16">16px</option>
                                <option value="18">18px</option>
                                <option value="20">20px</option>
                                <option value="24">24px</option>
                            </select>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                        <span id="ocrWordCount" style="font-size: 12px; color: var(--color-text-muted);"></span>
                    </div>
                </div>
                <div class="edit-modal-footer">
                    <button class="edit-modal-btn secondary" onclick="PDFoxOCR.closeModal()">Close</button>
                    <button class="edit-modal-btn" onclick="PDFoxOCR.copyText()"
                        style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="margin-right: 6px;">
                            <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
                        </svg>
                        Copy Text
                    </button>
                    <button class="edit-modal-btn primary" onclick="PDFoxOCR.insertAsOverlay()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="margin-right: 6px;">
                            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        Insert as Text
                    </button>
                </div>
            </div>
        `;

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // Setup transparent checkbox toggle
        const transparentCheckbox = modal.querySelector('#ocrTransparentBg');
        const bgColorInput = modal.querySelector('#ocrBgColor');
        if (transparentCheckbox && bgColorInput) {
            transparentCheckbox.addEventListener('change', () => {
                bgColorInput.disabled = transparentCheckbox.checked;
                bgColorInput.style.opacity = transparentCheckbox.checked ? '0.5' : '1';
            });
        }

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                e.preventDefault();
                e.stopPropagation();
                closeModal();
            }
        });

        return modal;
    }

    /**
     * Close the results modal (legacy - now handled by unified editor)
     */
    function closeModal() {
        // Use unified text editor
        if (typeof PDFoxUnifiedTextEditor !== 'undefined') {
            PDFoxUnifiedTextEditor.close();
        }

        // Clear the selection
        if (typeof PDFoxAnnotations !== 'undefined') {
            PDFoxAnnotations.clearOCRSelection();
        }
    }

    /**
     * Copy extracted text to clipboard (legacy - now handled by unified editor)
     */
    function copyText() {
        if (typeof PDFoxUnifiedTextEditor !== 'undefined') {
            PDFoxUnifiedTextEditor.copyText();
        }
    }

    /**
     * Insert extracted text as an overlay (legacy - now handled by unified editor)
     */
    function insertAsOverlay() {
        // Now handled by unified text editor
    }

    /**
     * Extract text from the full page (for image-based PDFs)
     */
    async function extractFullPage() {
        const pdfDoc = core.get('pdfDoc');
        const currentPage = core.get('currentPage');
        const scale = core.get('scale');

        if (!pdfDoc) {
            ui.showNotification('No PDF loaded', 'warning');
            return;
        }

        // Get page dimensions
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1.0 });

        // Create full page selection
        const fullPageSelection = {
            x: 0,
            y: 0,
            width: viewport.width * scale,
            height: viewport.height * scale,
            page: currentPage
        };

        // Run OCR on full page
        await extractFromSelection(fullPageSelection);
    }

    /**
     * Update UI for image-based PDFs
     * Switch Edit tool to behave like OCR selection tool
     */
    function updateUIForImagePDF() {
        // Hide the OCR Select tool button (redundant for image-based PDFs)
        const ocrButton = document.getElementById('ocrSelectTool');
        if (ocrButton) {
            ocrButton.style.display = 'none';
        }

        // Update Edit button tooltip to indicate AI text extraction
        const editButton = document.getElementById('editTextTool');
        if (editButton) {
            editButton.setAttribute('data-tooltip', 'Draw area to extract text with AI');
        }
    }

    /**
     * Activate OCR selection mode
     * Sets up the UI and canvas for drawing OCR selection areas
     */
    function activateOCRSelectionMode() {
        // Switch to ocrSelect tool
        core.set('currentTool', 'ocrSelect');

        // Update button active states
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.classList.remove('active');
        });

        // Try to set active on OCR button, but it might be hidden
        // For image-based PDFs, the Edit button acts as the OCR select
        const ocrButton = document.getElementById('ocrSelectTool');
        const editButton = document.getElementById('editTextTool');
        if (ocrButton && ocrButton.style.display !== 'none') {
            ocrButton.classList.add('active');
        } else if (editButton && core.get('isImageBasedPDF')) {
            editButton.classList.add('active');
        }

        // Enable drawing on annotation canvas
        const annCanvas = document.getElementById('annotationCanvas');
        if (annCanvas) {
            annCanvas.style.cursor = 'crosshair';
            annCanvas.style.pointerEvents = 'auto';
        }

        // Disable text layer interactions
        const textLayer = document.getElementById('textLayer');
        if (textLayer) {
            textLayer.classList.remove('editable');
        }
    }

    /**
     * Initialize module
     */
    function init() {
        // Listen for OCR selection complete event
        core.on('ocr:selectionComplete', (selection) => {
            extractFromSelection(selection);
        });

        // Listen for image-based PDF detection
        core.on('pdf:imageBasedDetected', () => {
            updateUIForImagePDF();

            // Automatically switch to OCR selection mode for image-based PDFs
            setTimeout(() => {
                activateOCRSelectionMode();
                // Notification disabled - too intrusive for users
            }, 100);
        });

        // Intercept Edit button click for image-based PDFs
        // This handles the case where user is already in editText mode and clicks Edit again
        const editButton = document.getElementById('editTextTool');
        if (editButton) {
            editButton.addEventListener('click', (e) => {
                if (core.get('isImageBasedPDF')) {
                    e.stopPropagation();
                    activateOCRSelectionMode();
                    // Notification disabled - too intrusive for users
                }
            });
        }
    }

    return {
        init,
        extractFromSelection,
        extractFullPage,
        showResultsModal,
        closeModal,
        copyText,
        insertAsOverlay,
        activateOCRSelectionMode
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxOCR;
}
